import { writeFile } from 'node:fs/promises'
import { buildLunaEvalPlan, compileLunaEvalPlan } from '../server/lib/luna/eval/index.js'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}
function list(value) { return String(value || '').split(',').map((entry) => entry.trim()).filter(Boolean) }

const groups = list(arg('groups'))
const names = list(arg('scenarios'))
const filters = {
  groups: groups.length && !groups.includes('all') ? groups : null,
  names: names.length ? names : null,
  maxCases: Number(arg('max-cases', '500')) || 500,
}
const payload = {
  plan: buildLunaEvalPlan(filters),
  compiled_cases: compileLunaEvalPlan(filters),
}
const output = arg('output')
if (output) await writeFile(output, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
else process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
