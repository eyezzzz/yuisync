import { writeFile } from 'node:fs/promises'
import {
  compileLunaEvalPlan,
  runCompiledScenarioSuite,
} from '../server/lib/luna/eval/index.js'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}
function flag(name) { return process.argv.includes(`--${name}`) }
function list(value) { return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean) }

const groups = list(arg('groups'))
const names = list(arg('scenarios'))
const maxCases = Number(arg('max-cases', '500')) || 500
const compiled = compileLunaEvalPlan({
  groups: groups.length && !groups.includes('all') ? groups : null,
  names: names.length ? names : null,
  maxCases,
})
const report = await runCompiledScenarioSuite(compiled, { stopOnFailure: flag('stop-on-failure') })
const outputPath = arg('report')
if (outputPath) await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

if (flag('json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  console.log(`Luna Eval Platform: ${report.passed}/${report.total} aprovados (${report.pass_rate}%) em ${report.duration_ms} ms.`)
  if (report.failure_groups.length) {
    console.log('Grupos de falha:')
    for (const group of report.failure_groups) {
      console.log(`- ${group.signature} ${group.code} (${group.count}) ${group.message}`)
    }
  }
}
if (report.failed) process.exitCode = 1
