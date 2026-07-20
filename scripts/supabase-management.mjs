import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { dirname } from 'node:path'

const token = process.env.SUPABASE_ACCESS_TOKEN
const projectRef = process.env.SUPABASE_PROJECT_REF

if (!token || !projectRef) {
  throw new Error('SUPABASE_ACCESS_TOKEN e SUPABASE_PROJECT_REF sao obrigatorios.')
}

const [command, ...inputs] = process.argv.slice(2)
const input = inputs[0]

async function managementRequest(path, options = {}) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })
  const raw = await response.text()
  let body = raw
  try {
    body = raw ? JSON.parse(raw) : null
  } catch {
    // Keep non-JSON error text for diagnostics without exposing the token.
  }
  if (!response.ok) {
    throw new Error(`Supabase Management API ${response.status}: ${typeof body === 'string' ? body.slice(0, 800) : JSON.stringify(body)}`)
  }
  return body
}

async function runQuery(query, readOnly = true) {
  return managementRequest('/database/query', {
    method: 'POST',
    body: JSON.stringify({ query, read_only: readOnly }),
  })
}

function withoutOuterTransaction(query) {
  return query
    .replace(/^\s*begin\s*;\s*/i, '')
    .replace(/\s*commit\s*;\s*$/i, '')
}

if (command === 'read') {
  if (!input) throw new Error('Informe o arquivo SQL de leitura.')
  const query = await readFile(input, 'utf8')
  const result = await runQuery(query, true)
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'apply') {
  if (!input) throw new Error('Informe o arquivo de migracao.')
  const query = await readFile(input, 'utf8')
  const result = await runQuery(`begin;\n${query}\ncommit;`, false)
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'check') {
  if (!inputs.length) throw new Error('Informe uma ou mais migracoes para o dry-run.')
  const migrations = await Promise.all(inputs.map((file) => readFile(file, 'utf8')))
  const query = migrations.map(withoutOuterTransaction).join('\n\n')
  const result = await runQuery(`begin;\n${query}\nrollback;`, false)
  console.log(JSON.stringify({ checked: inputs, result }, null, 2))
} else if (command === 'migrate') {
  if (!input) throw new Error('Informe o arquivo de migracao.')
  const query = await readFile(input, 'utf8')
  const migrationName = input.split(/[\\/]/).pop().replace(/\.sql$/i, '')
  const result = await managementRequest('/database/migrations', {
    method: 'POST',
    body: JSON.stringify({ query, name: migrationName }),
  })
  console.log(JSON.stringify({ migrationName, result }, null, 2))
} else if (command === 'backup') {
  if (!input) throw new Error('Informe o caminho de destino .json.gz.')

  const metadataQueries = {
    columns: `select table_schema, table_name, ordinal_position, column_name, data_type, udt_name, is_nullable, column_default, is_identity, is_generated from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`,
    constraints: `select n.nspname as schema_name, c.relname as table_name, con.conname as constraint_name, con.contype as constraint_type, pg_get_constraintdef(con.oid, true) as definition from pg_catalog.pg_constraint con join pg_catalog.pg_class c on c.oid = con.conrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' order by c.relname, con.conname`,
    indexes: `select schemaname, tablename, indexname, indexdef from pg_catalog.pg_indexes where schemaname = 'public' order by tablename, indexname`,
    policies: `select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check from pg_catalog.pg_policies where schemaname = 'public' order by tablename, policyname`,
    relations: `select n.nspname as schema_name, c.relname as relation_name, c.relkind, c.relrowsecurity, c.relforcerowsecurity from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','p','v','m','S') order by c.relkind, c.relname`,
    triggers: `select n.nspname as schema_name, c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as definition from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid = t.tgrelid join pg_catalog.pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal order by c.relname, t.tgname`,
    functions: `select n.nspname as schema_name, p.proname as function_name, pg_get_function_identity_arguments(p.oid) as identity_arguments, pg_get_functiondef(p.oid) as definition from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by p.proname, identity_arguments`,
    views: `select schemaname, viewname, definition from pg_catalog.pg_views where schemaname = 'public' union all select schemaname, matviewname, definition from pg_catalog.pg_matviews where schemaname = 'public' order by 2`,
    sequences: `select schemaname, sequencename, start_value, min_value, max_value, increment_by, cycle, cache_size, last_value from pg_catalog.pg_sequences where schemaname = 'public' order by sequencename`,
  }

  const backup = {
    format: 'yuisync-public-json-v1',
    projectRef,
    createdAt: new Date().toISOString(),
    note: 'Backup logico de schema e dados public antes do hardening. Auth e objetos do Storage nao estao incluidos.',
    metadata: {},
    tables: {},
  }

  for (const [name, query] of Object.entries(metadataQueries)) {
    backup.metadata[name] = await runQuery(query, true)
  }

  const tables = await runQuery(`select tablename from pg_catalog.pg_tables where schemaname = 'public' order by tablename`, true)
  for (const { tablename } of tables) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablename)) throw new Error(`Nome de tabela inesperado: ${tablename}`)
    const rows = await runQuery(`select to_jsonb(t) as row from public."${tablename}" t`, true)
    backup.tables[tablename] = rows.map((entry) => entry.row)
  }

  const compressed = gzipSync(Buffer.from(JSON.stringify(backup)))
  const checksum = createHash('sha256').update(compressed).digest('hex')
  await mkdir(dirname(input), { recursive: true })
  await writeFile(input, compressed)
  await writeFile(`${input}.sha256`, `${checksum}  ${input.split(/[\\/]/).pop()}\n`, 'utf8')
  console.log(JSON.stringify({ path: input, bytes: compressed.length, sha256: checksum, tables: tables.length }, null, 2))
} else if (command === 'backups') {
  const result = await managementRequest('/database/backups')
  console.log(JSON.stringify(result, null, 2))
} else if (command === 'migrations') {
  const result = await managementRequest('/database/migrations')
  console.log(JSON.stringify(result, null, 2))
} else {
  throw new Error('Comando esperado: read, check, apply, migrate, migrations, backup ou backups.')
}
