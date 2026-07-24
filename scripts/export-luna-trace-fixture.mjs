import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { traceToRegressionFixture } from '../server/lib/luna/tracing/fixtureExporter.js'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: node scripts/export-luna-trace-fixture.mjs <trace.json> [output.json]')
  process.exit(1)
}
const trace = JSON.parse(await readFile(path.resolve(inputPath), 'utf8'))
const fixture = traceToRegressionFixture(trace)
const outputPath = path.resolve(process.argv[3] || `${fixture.name}.json`)
await writeFile(outputPath, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(outputPath)
