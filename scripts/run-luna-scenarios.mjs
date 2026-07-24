import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { runOperationScenario } from '../server/lib/luna/scenarioRunner.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturesDirectory = path.join(root, 'test', 'luna', 'fixtures')
const files = (await readdir(fixturesDirectory))
  .filter((file) => file.endsWith('.json'))
  .sort()

let failed = 0
for (const file of files) {
  const scenario = JSON.parse(await readFile(path.join(fixturesDirectory, file), 'utf8'))
  const result = runOperationScenario(scenario)
  if (result.ok) {
    console.log(`✓ ${result.name}`)
    continue
  }
  failed += 1
  console.error(`✗ ${result.name}`)
  for (const error of result.errors) console.error(`  - ${error}`)
}

console.log(`\n${files.length - failed}/${files.length} Luna regression scenarios passed.`)
if (failed) process.exitCode = 1
