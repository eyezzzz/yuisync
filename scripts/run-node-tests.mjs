import { spawnSync } from 'node:child_process'

const testEnvDefaults = {
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_ANON_KEY: 'test-anon-key',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
  SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  OPENAI_API_KEY: 'test-openai-key',
}

const env = {
  ...process.env,
  NODE_ENV: 'test',
}

for (const [name, value] of Object.entries(testEnvDefaults)) {
  if (!env[name]) env[name] = value
}

const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
  env,
  stdio: 'inherit',
})

if (result.error) {
  console.error(result.error)
  process.exit(1)
}

process.exit(result.status ?? 1)
