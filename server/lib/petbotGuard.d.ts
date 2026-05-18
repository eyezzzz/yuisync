export function buildPetbotSearchText(message?: string, context?: Record<string, any>): string
export function getPetbotState(context?: Record<string, any>): Record<string, any>
export function markPetbotOrderError(state: Record<string, any>, error: unknown): Record<string, any>
export function markPetbotOrderSaved(state: Record<string, any>, result?: Record<string, any>): Record<string, any>
export function mergePetbotContext(context: Record<string, any>, state: Record<string, any>): Record<string, any>
export function recoverPetbotContextFromHistory(context?: Record<string, any>, session?: Record<string, any>, history?: Array<Record<string, any>>): Record<string, any>
export function runPetbotGuard(input?: Record<string, any>): Record<string, any>
export function snapshotPetbotState(state?: Record<string, any>): Record<string, any>
