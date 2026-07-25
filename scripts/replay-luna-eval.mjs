import { readFile, writeFile } from 'node:fs/promises'
import { replayTraceOrEvalArtifact } from '../server/lib/luna/tracing/traceReplay.js'

const input = process.argv[2]
if (!input) throw new Error('Uso: node scripts/replay-luna-eval.mjs <artifact.json> [--output replay.json]')
const outputIndex = process.argv.indexOf('--output')
const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : ''
const artifact = JSON.parse(await readFile(input, 'utf8'))
const result = await replayTraceOrEvalArtifact(artifact)
if (output) await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
if (result?.ok === false) process.exitCode = 1
