import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'

const path = 'src/modules/petshop/pages/PetsPage.jsx'
let source = readFileSync(path, 'utf8')

const oldRow = '<div className="mt-4 flex flex-wrap items-center justify-end gap-2"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm"><History size={13}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm"><Plus size={13}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm">Editar cliente</button></div>'
const newRow = '<div className="mt-4 flex flex-nowrap items-center justify-end gap-1.5"><button type="button" data-yuisync-client-history={group.key} className="btn btn-secondary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><History size={12}/> Histórico</button><button type="button" data-yuisync-add-pet-action onClick={() => openAddPetForTutor(pet)} className="btn btn-primary btn-sm shrink-0 gap-1 whitespace-nowrap px-2 text-[10px]"><Plus size={12}/> Adicionar pet</button><button onClick={() => setModalPet(pet)} className="btn btn-secondary btn-sm shrink-0 whitespace-nowrap px-2 text-[10px]">Editar cliente</button></div>'

assert.ok(source.includes(oldRow), 'linha de acoes do card nao encontrada')
source = source.replace(oldRow, newRow)
assert.equal((source.match(/mt-4 flex flex-nowrap items-center justify-end gap-1\.5/g) || []).length, 1)
writeFileSync(path, source)

rmSync('scripts/apply-client-card-actions-single-line.mjs')
rmSync('.github/workflows/apply-client-card-actions-single-line.yml')
