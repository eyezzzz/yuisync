import { readFile } from 'node:fs/promises'
import { replayRegressionFixture } from '../server/lib/luna/tracing/traceReplay.js'

const file = process.argv[2]
if (!file) {
  console.error('Usage: node scripts/replay-luna-trace.mjs <fixture.json>')
  process.exit(1)
}
const fixture = JSON.parse(await readFile(file, 'utf8'))
const result = replayRegressionFixture(fixture)
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exitCode = 1
