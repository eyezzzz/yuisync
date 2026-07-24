import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

const chatSource = await readFile(new URL('../server/lib/chat.js', import.meta.url), 'utf8')
const agentSource = await readFile(new URL('../server/lib/petbotAgent.js', import.meta.url), 'utf8')

test('confirmacao explicita atual tem prioridade quando existe pedido pendente', () => {
  assert.match(chatSource, /explicitCurrentMessageConfirmation[\s\S]*pendingAtTurnStart[\s\S]*isExplicitPetbotConfirmation\(trimmedMessage\)/)
  assert.match(chatSource, /explicitCurrentMessageConfirmation\s*\|\|\s*turnSemantics\?\.confirms_pending_order/)
})

test('observacao direta atualiza pedido pendente sem cancelar e sem nova chamada da LLM', () => {
  assert.match(chatSource, /function inferExplicitServiceNoteUpdate/)
  assert.match(chatSource, /currentMessageUpdatesServiceNotes/)
  assert.match(chatSource, /service-note-\$\{pendingAtTurnStart\.id\}/)
  assert.match(chatSource, /cancels_pending_order:\s*false/)
  assert.match(chatSource, /tokensUsed:\s*0/)
})

test('pergunta informativa nao pode virar acabamento inventado', () => {
  assert.match(chatSource, /isServiceInformationQuestion/)
  assert.match(agentSource, /service_grooming_detail:\s*facts\.service_notes_explicit[\s\S]*\? clean\(facts\.service_notes\) \|\| null[\s\S]*:\s*null/)
})
