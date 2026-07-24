import { LunaError, LUNA_ERROR_CODES } from '../errors.js'
import { defineLunaTool } from './toolDefinition.js'

export class LunaToolRegistry {
  #tools = new Map()
  constructor(definitions = []) { for (const definition of definitions) this.register(definition) }
  register(input) {
    const definition = Object.isFrozen(input) ? input : defineLunaTool(input)
    if (this.#tools.has(definition.name)) throw new TypeError(`Tool already registered: ${definition.name}`)
    this.#tools.set(definition.name, definition)
    return definition
  }
  get(name) { return this.#tools.get(String(name || '').trim()) || null }
  require(name) {
    const tool = this.get(name)
    if (!tool) throw new LunaError(LUNA_ERROR_CODES.TOOL_NOT_REGISTERED, `Tool is not registered: ${name || '<empty>'}.`, { recoverable: false })
    return tool
  }
  list() { return [...this.#tools.values()] }
}

export function createLunaToolRegistry(definitions = []) { return new LunaToolRegistry(definitions) }
export const ToolRegistry = LunaToolRegistry
export const createToolRegistry = createLunaToolRegistry
