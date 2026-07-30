import { readFile, writeFile } from 'node:fs/promises'

const pagePath = 'src/modules/petshop/pages/AgendaPage.jsx'
let source = await readFile(pagePath, 'utf8')

const paymentDeclaration = "                const paymentPending = appt.status === 'concluido' && needsPayment(appt)\n"
if (!source.includes(paymentDeclaration)) throw new Error('Declaracao financeira do historico diario nao encontrada')
source = source.replace(paymentDeclaration, '')

const dailyBefore = `                    {appt.status === 'concluido' && (
                      <button type="button" onClick={() => onCompletedAction(appt)} className={\`shrink-0 rounded-md px-2 py-1 font-bold \${paymentPending ? 'bg-amber-500/15 text-amber-300' : 'bg-emerald-500/12 text-emerald-300'}\`}>
                        {paymentPending ? 'Receber' : 'Imprimir'}
                      </button>
                    )}`
const dailyAfter = `                    {appt.status === 'concluido' && (
                      <button
                        type="button"
                        aria-label="Reimprimir ficha concluida"
                        title="Reimprimir ficha 80 mm"
                        onClick={() => onReceipt(appt)}
                        className="shrink-0 rounded-md p-1.5 text-emerald-300 hover:bg-emerald-500/15"
                      >
                        <Receipt size={13}/>
                      </button>
                    )}`
if (!source.includes(dailyBefore)) throw new Error('Acao antiga do historico diario nao encontrada')
source = source.replace(dailyBefore, dailyAfter)

const weeklyBefore = `                              {completed && (
                                <button
                                  type="button"
                                  aria-label={needsPayment(appt) ? 'Receber atendimento concluido' : 'Imprimir ficha concluida'}
                                  title={needsPayment(appt) ? 'Receber e lancar no caixa' : 'Imprimir ficha 80 mm'}
                                  onClick={() => onCompletedAction(appt)}
                                  className={\`shrink-0 rounded p-1 \${needsPayment(appt) ? 'text-amber-300 hover:bg-amber-500/15' : 'text-emerald-300 hover:bg-emerald-500/15'}\`}
                                >
                                  {needsPayment(appt) ? <Wallet size={11}/> : <Receipt size={11}/>} 
                                </button>
                              )}`
const weeklyAfter = `                              {completed && (
                                <button
                                  type="button"
                                  aria-label="Reimprimir ficha concluida"
                                  title="Reimprimir ficha 80 mm"
                                  onClick={() => onReceipt(appt)}
                                  className="shrink-0 rounded p-1 text-emerald-300 hover:bg-emerald-500/15"
                                >
                                  <Receipt size={11}/>
                                </button>
                              )}`

if (!source.includes(weeklyBefore)) {
  const weeklyFallbackBefore = weeklyBefore.replace(' />} \n', '/>}\n')
  if (!source.includes(weeklyFallbackBefore)) throw new Error('Acao antiga do historico semanal nao encontrada')
  source = source.replace(weeklyFallbackBefore, weeklyAfter)
} else {
  source = source.replace(weeklyBefore, weeklyAfter)
}

await writeFile(pagePath, source)

const testPath = 'test/agendaHistoryPrintAction.test.mjs'
await writeFile(testPath, `import test from 'node:test'\nimport assert from 'node:assert/strict'\nimport { readFile } from 'node:fs/promises'\n\ntest('historico mostra somente reimpressao para atendimentos concluidos', async () => {\n  const source = await readFile(new URL('../src/modules/petshop/pages/AgendaPage.jsx', import.meta.url), 'utf8')\n  const labels = source.match(/aria-label=\"Reimprimir ficha concluida\"/g) || []\n  assert.equal(labels.length, 2)\n  assert.equal(source.includes(\"paymentPending ? 'Receber' : 'Imprimir'\"), false)\n  assert.equal(source.includes(\"aria-label={needsPayment(appt) ? 'Receber atendimento concluido'\"), false)\n  assert.match(source, /Historico do dia[\\s\\S]*onClick=\\{\\(\\) => onReceipt\\(appt\\)\\}[\\s\\S]*<Receipt size=\\{13\\}\\/>/)\n  assert.match(source, /nonBlocking\\.map[\\s\\S]*aria-label=\"Reimprimir ficha concluida\"[\\s\\S]*<Receipt size=\\{11\\}\\/>/)\n})\n`)
