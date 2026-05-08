export const yuiTools = [
  {
    type: 'function',
    function: {
      name: 'confirm_booking',
      description: 'Use quando o cliente confirmar um horário específico para agendamento e houver slot_id disponível no contexto da agenda.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          slot_id: {
            type: 'string',
            description: 'UUID interno do slot de agenda disponível (nunca exibir para o cliente).',
          },
          slot_time: {
            type: 'string',
            description: 'Horário no formato HH:MM escolhido pelo cliente.',
          },
          service_type: {
            type: 'string',
            description: 'Serviço solicitado, ex.: banho, tosa.',
          },
          pet_name: {
            type: 'string',
            description: 'Nome do pet informado pelo cliente.',
          },
        },
        required: ['slot_id', 'slot_time', 'service_type', 'pet_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'transfer_to_human',
      description: 'Use quando houver urgência, risco ou necessidade de atendimento humano imediato.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          reason: {
            type: 'string',
            description: 'Motivo resumido da transferência para humano.',
          },
        },
        required: ['reason'],
      },
    },
  },
] as const
