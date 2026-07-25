import { execFileSync } from 'node:child_process'
import { appendFile } from 'node:fs/promises'
import { selectEvalImpact } from '../server/lib/luna/eval/impactSelector.js'

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] || fallback : fallback
}

const base = arg('base')
const head = arg('head', 'HEAD')
let paths = []
if (base) {
  try {
    const output = execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { encoding: 'utf8' })
    paths = output.split(/\r?\n/).filter(Boolean)
  } catch (error) {
    console.warn(`Não foi possível calcular o diff de impacto: ${error.message}`)
  }
}
const selection = selectEvalImpact(paths)
const groups = selection.run_full ? 'all' : selection.groups.join(',') || 'bath'
console.log(JSON.stringify({ ...selection, selected_groups: groups }, null, 2))
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, `groups=${groups}\nrun_full=${selection.run_full}\n`, 'utf8')
}
