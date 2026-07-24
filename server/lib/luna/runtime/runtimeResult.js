export function createRuntimeResult({
  ok = true,
  state = null,
  reply = '',
  toolResults = [],
  verifier = null,
  recovery = null,
  trace = null,
} = {}) {
  return {
    ok: Boolean(ok),
    state,
    reply: String(reply || ''),
    tool_results: Array.isArray(toolResults) ? toolResults : [],
    verifier: verifier && typeof verifier === 'object' ? verifier : null,
    recovery: recovery && typeof recovery === 'object' ? recovery : null,
    trace: trace && typeof trace === 'object' ? trace : null,
  }
}
