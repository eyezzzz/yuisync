function toolName(tool = {}) {
  return String(tool?.function?.name || tool?.name || '').trim()
}

export function createRuntimePlan({
  goal = 'respond',
  tools = [],
  initialToolChoice = 'auto',
  operationType = 'unknown',
} = {}) {
  const allowedTools = tools.map(toolName).filter(Boolean)
  const forcedTool = typeof initialToolChoice === 'object'
    ? toolName(initialToolChoice)
    : null
  return Object.freeze({
    schema_version: 1,
    goal: String(goal || 'respond').trim(),
    operation_type: String(operationType || 'unknown').trim(),
    strategy: forcedTool ? 'forced_first_tool' : 'model_selects_registered_tool',
    first_tool: forcedTool,
    allowed_tools: allowedTools,
    confirmation_required_tools: allowedTools.filter((name) => name === 'create_confirmed_petshop_order'),
  })
}
