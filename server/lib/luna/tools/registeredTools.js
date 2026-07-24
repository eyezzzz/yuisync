import { defineLunaTool } from './toolDefinition.js'
import { createLunaToolRegistry } from './toolRegistry.js'

const POLICY = Object.freeze({
  search_petshop_products: { risk: 'read' },
  resolve_petshop_service: { risk: 'read' },
  check_petshop_availability: { risk: 'read' },
  get_petshop_transport_options: { risk: 'read' },
  prepare_petshop_product_order: { risk: 'write' },
  prepare_petshop_service_booking: { risk: 'write' },
  create_confirmed_petshop_order: { risk: 'transactional', requiresConfirmation: true },
  cancel_pending_petshop_order: { risk: 'write' },
  send_product_image: { risk: 'read' },
  handoff_to_human: { risk: 'handoff' },
})

export function createRegistryFromAgentTools(tools = [], {
  executeLegacyTool,
  defaultTimeoutMs = 30000,
  confirmationTimeoutMs = 90000,
} = {}) {
  return createLunaToolRegistry((Array.isArray(tools) ? tools : [])
    .filter((tool) => tool?.type === 'function' && tool?.function?.name)
    .map((tool) => {
      const name = String(tool.function.name).trim()
      const policy = POLICY[name] || { risk: 'read' }
      return defineLunaTool({
        name,
        description: tool.function.description || '',
        inputSchema: tool.function.parameters || { type: 'object' },
        outputSchema: { type: 'object' },
        risk: policy.risk,
        requiresConfirmation: Boolean(policy.requiresConfirmation),
        timeoutMs: policy.requiresConfirmation ? confirmationTimeoutMs : defaultTimeoutMs,
        execute: async (_args, context) => executeLegacyTool(context.toolCall),
        metadata: { source: 'PETBOT_AGENT_TOOLS', strict: tool.function.strict === true },
      })
    }))
}

export const PETBOT_TOOL_POLICY = POLICY
