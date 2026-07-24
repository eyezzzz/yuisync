const RISKS = new Set(['read', 'write', 'transactional', 'handoff'])

export function defineLunaTool(input = {}) {
  const name = String(input.name || '').trim()
  if (!name) throw new TypeError('Tool definition requires name.')
  if (typeof input.execute !== 'function') throw new TypeError(`Tool ${name} requires execute.`)
  return Object.freeze({
    name,
    description: String(input.description || '').trim(),
    inputSchema: input.inputSchema || { type: 'object' },
    outputSchema: input.outputSchema || { type: 'object' },
    risk: RISKS.has(input.risk) ? input.risk : 'read',
    requiresConfirmation: Boolean(input.requiresConfirmation),
    timeoutMs: Math.max(100, Math.trunc(Number(input.timeoutMs || 30000) || 30000)),
    inputGuard: typeof input.inputGuard === 'function' ? input.inputGuard : null,
    outputGuard: typeof input.outputGuard === 'function' ? input.outputGuard : null,
    execute: input.execute,
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {},
  })
}

export const defineTool = defineLunaTool
