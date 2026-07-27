import { readFile, writeFile } from 'node:fs/promises'

const paths = [
  'supabase/migrations/20260727001000_agenda_capacity_operational_commissions.sql',
  'database/agenda_capacity_operational_commissions.sql',
]

for (const path of paths) {
  let source = await readFile(path, 'utf8')
  const openMatches = source.match(/\nas \$\ndeclare/g) || []
  const closeMatches = source.match(/\nend;\n\$;/g) || []
  if (openMatches.length !== 2 || closeMatches.length !== 2) {
    throw new Error(`${path}: esperava 2 pares de delimitadores simples; encontrou ${openMatches.length}/${closeMatches.length}`)
  }
  source = source
    .replace(/\nas \$\ndeclare/g, '\nas $$\ndeclare')
    .replace(/\nend;\n\$;/g, '\nend;\n$$;')
  await writeFile(path, source, 'utf8')
}

const testPath = 'test/agendaOperationalInfrastructure.test.mjs'
let testSource = await readFile(testPath, 'utf8')
const anchor = "  assert.ok(migration.includes('transport_mode, transport_label, transport_address'))"
const replacement = `${anchor}\n  assert.doesNotMatch(migration, /as \\$\\n/)\n  assert.doesNotMatch(migration, /\\n\\$;\\n/)\n  assert.match(migration, /create or replace function public\\.book_petshop_appointment_transaction[\\s\\S]*?as \\$\\$/)\n  assert.match(migration, /create or replace function public\\.update_petshop_appointment_transaction[\\s\\S]*?as \\$\\$/)`
if (!testSource.includes(anchor)) throw new Error('Ancora dos testes SQL nao encontrada.')
testSource = testSource.replace(anchor, replacement)
await writeFile(testPath, testSource, 'utf8')

console.log('Delimitadores SQL da agenda corrigidos.')
