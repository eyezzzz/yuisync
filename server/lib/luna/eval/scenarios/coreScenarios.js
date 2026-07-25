const PET = Object.freeze({ pet_name: 'Thor', breed: 'Lhasa Apso', weight_kg: 8, species: 'dog' })
const CUSTOMER = Object.freeze({ customer_name: 'Gabriel' })
const SLOT_A = '2026-07-27T16:00:00-03:00'
const SLOT_B = '2026-07-28T15:00:00-03:00'
const OCCUPIED_SLOT = '2026-07-27T13:30:00-03:00'

function baseScenario(name, title, steps, assertion, extra = {}) {
  return {
    schema_version: 1,
    name,
    title,
    description: extra.description || null,
    group: extra.group || 'bath',
    tags: extra.tags || ['bath'],
    initial_state: { type: 'unknown', status: 'idle' },
    fixtures: extra.fixtures || { base: 'petshop_standard' },
    compiler: { strategy: 'one_at_a_time', max_cases: extra.max_cases || 32, include_zipped: extra.include_zipped === true },
    steps,
    assert: assertion,
    metadata: { risk: extra.risk || 'standard' },
  }
}

export const CORE_LUNA_EVAL_SCENARIOS = Object.freeze([
  baseScenario(
    'bath_customer_brings_confirmation',
    'Banho com cliente levando e confirmação por paráfrases',
    [
      { id: 'request', user_intent: 'request_bath', paraphrase_set: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', paraphrase_set: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', paraphrase_set: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', paraphrase_set: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', paraphrase_set: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      persistence: { sale_id: '$present', order_id: '$present', appointment_id: '$present' },
      total: 55,
      transport_mode: 'customer_brings',
      tool_calls: { get_day_schedule: 1, confirm_operation: 1 },
      no_duplicate_commit: true,
    },
    { tags: ['bath', 'confirmation', 'transport', 'idempotency'], include_zipped: true },
  ),
  baseScenario(
    'bath_motodog_address',
    'Banho com MotoDog e endereço preservado',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'request_motodog', paraphrase_set: 'request_motodog', payload: { mode: 'buscar_e_levar' } },
      {
        id: 'address',
        user_intent: 'provide_address',
        paraphrase_set: 'provide_address',
        payload: { street: 'Av. Antônio Tureta', number: '339', district: 'São Joaquim', city: 'Muriaé', reference: 'Casa Rosa' },
      },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', paraphrase_set: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      persistence: { appointment_id: '$present' },
      total: 75,
      transport_mode: 'buscar_e_levar',
      path_values: {
        'state.transport.address.city': 'Muriaé',
        'state.transport.address.reference': 'Casa Rosa',
      },
      tool_calls: { confirm_operation: 1 },
    },
    { tags: ['bath', 'transport', 'motodog', 'address'] },
  ),
  baseScenario(
    'bath_facts_out_of_order',
    'Dados do pet informados fora de ordem permanecem no estado',
    [
      { id: 'pet', user_intent: 'provide_pet', paraphrase_set: 'provide_pet', payload: { ...PET } },
      { id: 'customer', user_intent: 'provide_customer', payload: { name: 'Gabriel' } },
      { id: 'request', user_intent: 'request_bath', payload: {} },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      path_values: {
        'state.pet.name': 'Thor',
        'state.pet.breed': 'Lhasa Apso',
        'state.pet.weight_kg': 8,
        'state.customer.name': 'Gabriel',
      },
      tool_calls: { confirm_operation: 1 },
    },
    { tags: ['bath', 'memory', 'out_of_order'] },
  ),
  baseScenario(
    'duplicate_confirmation_is_safe',
    'Confirmação repetida não cria segunda transação',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm_1', user_intent: 'confirm', paraphrase_set: 'confirm', payload: {} },
      { id: 'confirm_2', user_intent: 'confirm', paraphrase_set: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      tool_calls: { confirm_operation: 1 },
      no_duplicate_commit: true,
      path_values: { 'state.metadata.duplicate_confirmation_ignored': true },
    },
    { tags: ['bath', 'confirmation', 'idempotency', 'duplicate'] },
  ),
  baseScenario(
    'occupied_slot_is_rejected',
    'Horário ocupado não volta como disponível',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: OCCUPIED_SLOT } },
    ],
    {
      operation_status: 'selecting_schedule',
      rejected_slots_contains: OCCUPIED_SLOT,
      tool_calls: { get_day_schedule: 1, confirm_operation: 0 },
      path_values: { 'state.schedule.scheduled_at': '$absent' },
    },
    { tags: ['bath', 'schedule', 'availability', 'regression'] },
  ),
  baseScenario(
    'note_before_confirmation',
    'Observação permanece até a confirmação',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'note', user_intent: 'add_note', paraphrase_set: 'add_note', payload: { note: 'sem perfume' } },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      notes: [{ text: 'sem perfume' }],
      tool_calls: { confirm_operation: 1 },
    },
    { tags: ['bath', 'notes', 'persistence'] },
  ),
  baseScenario(
    'informational_question_does_not_change_service',
    'Pergunta informativa não troca o serviço preparado',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'question', user_intent: 'informational_question', paraphrase_set: 'informational_question', payload: { topic: 'hygienic_grooming' } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      path_values: { 'state.items.0.id': 'svc_bath_small' },
      total: 55,
      tool_calls: { confirm_operation: 1 },
    },
    { tags: ['bath', 'informational', 'service_identity'] },
  ),
  baseScenario(
    'time_change_requires_new_summary',
    'Alteração de horário antes da confirmação usa o novo contrato',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time_a', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary_a', user_intent: 'request_summary', payload: {} },
      { id: 'time_b', user_intent: 'change_time', paraphrase_set: 'change_time', payload: { scheduled_at: SLOT_B } },
      { id: 'summary_b', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      path_values: { 'state.schedule.scheduled_at': SLOT_B },
      tool_calls: { get_day_schedule: 2, confirm_operation: 1 },
      no_duplicate_commit: true,
    },
    { tags: ['bath', 'schedule', 'contract_change'] },
  ),
  baseScenario(
    'additional_service_updates_total',
    'Adicional de hidratação altera o total e permanece no resumo',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'hydration', user_intent: 'add_hydration', payload: {} },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      total: 70,
      path_values: { 'state.items.1.id': 'svc_hydration' },
      tool_calls: { confirm_operation: 1 },
    },
    { tags: ['bath', 'additional_service', 'pricing'] },
  ),
  baseScenario(
    'slot_changes_before_commit',
    'Agenda muda antes do commit e a operação permanece recuperável',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'awaiting_confirmation',
      tool_calls: { confirm_operation: 1 },
      path_values: { 'state.last_error.code': 'SLOT_BECAME_UNAVAILABLE' },
    },
    { fixtures: { base: 'petshop_standard', overlays: ['slot_becomes_unavailable'] }, tags: ['bath', 'schedule', 'recovery'] },
  ),
  baseScenario(
    'transaction_failure_preserves_operation',
    'Falha transacional preserva a operação para nova tentativa segura',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'awaiting_confirmation',
      tool_calls: { confirm_operation: 1 },
      path_values: { 'state.last_error.code': 'TRANSACTION_FAILED' },
    },
    { fixtures: { base: 'petshop_standard', overlays: ['transaction_failure'] }, tags: ['bath', 'transaction', 'recovery'] },
  ),
  baseScenario(
    'ambiguous_commit_is_reconciled',
    'Resultado ambíguo após commit é reconciliado sem duplicação',
    [
      { id: 'request', user_intent: 'request_bath', payload: { ...PET, ...CUSTOMER } },
      { id: 'time', user_intent: 'choose_time', payload: { scheduled_at: SLOT_A } },
      { id: 'transport', user_intent: 'customer_brings', payload: {} },
      { id: 'summary', user_intent: 'request_summary', payload: {} },
      { id: 'confirm', user_intent: 'confirm', payload: {} },
      { id: 'confirm_again', user_intent: 'confirm', payload: {} },
    ],
    {
      operation_status: 'confirmed',
      persistence: { sale_id: '$present', order_id: '$present', appointment_id: '$present' },
      tool_calls: { confirm_operation: 1 },
      no_duplicate_commit: true,
      path_values: { 'state.metadata.confirmation.reconciled': true },
    },
    { fixtures: { base: 'petshop_standard', overlays: ['ambiguous_after_commit'] }, tags: ['bath', 'transaction', 'ambiguous', 'idempotency'], risk: 'high' },
  ),
])
