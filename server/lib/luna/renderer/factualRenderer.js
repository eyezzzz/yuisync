function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function renderFactualResponse(type, facts = {}) {
  if (type === 'confirmed') return `Operação confirmada. Total: ${money(facts.total)}.`
  if (type === 'already_confirmed') return 'Essa operação já foi confirmada e continua salva. Nenhum registro duplicado foi criado.'
  if (type === 'slot_unavailable') return 'O horário escolhido não está mais disponível. Os demais dados foram preservados.'
  if (type === 'contract_changed') return 'Os dados comerciais mudaram. Um novo resumo precisa ser aprovado antes da confirmação.'
  if (type === 'commit_ambiguous') return 'O resultado da confirmação ficou inconclusivo. O sistema verificará o registro antes de tentar novamente.'
  return String(facts.message || 'Não foi possível concluir a operação com segurança.')
}

export function enforceVerifiedReply({ reply = '', verification = {} } = {}) {
  if (verification?.ok !== false) return { reply: String(reply || ''), enforced: false, reason: null }
  const issue = verification?.issues?.find((entry) => entry?.severity === 'error') || verification?.issues?.[0]
  const code = issue?.code || 'VERIFICATION_FAILED'
  const safeType = code === 'SLOT_BECAME_UNAVAILABLE' || code === 'SLOT_UNAVAILABLE'
    ? 'slot_unavailable'
    : code === 'COMMERCIAL_CONTRACT_CHANGED'
      ? 'contract_changed'
      : code === 'COMMIT_RESULT_AMBIGUOUS'
        ? 'commit_ambiguous'
        : null
  return {
    reply: safeType ? renderFactualResponse(safeType) : 'Não consegui confirmar essa operação com segurança. Os dados foram preservados para uma nova verificação.',
    enforced: true,
    reason: code,
  }
}

export function renderLunaRecoveryMessage(decision = {}, { serviceConversation = false } = {}) {
  if (decision.action === 'refresh_schedule') return renderFactualResponse('slot_unavailable')
  if (decision.action === 'present_new_summary') return renderFactualResponse('contract_changed')
  if (decision.action === 'reconcile_commit') return renderFactualResponse('commit_ambiguous')
  if (decision.action === 'handoff') return 'Não consigo concluir este caso com segurança de forma automática. Vou encaminhar o atendimento com o contexto já informado.'
  if (decision.action === 'retry_safely') return serviceConversation
    ? 'A consulta dos serviços demorou mais que o esperado. Os dados foram preservados e a tentativa pode ser refeita sem repetir tudo.'
    : 'A consulta demorou mais que o esperado. Os dados foram preservados e a tentativa pode ser refeita com segurança.'
  return serviceConversation
    ? 'Desculpe, não consegui concluir a consulta dos serviços e da agenda agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
    : 'Desculpe, não consegui concluir a consulta agora. As informações que você enviou continuam na conversa; posso tentar novamente sem você repetir os dados.'
}
