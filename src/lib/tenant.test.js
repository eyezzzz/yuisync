import { describe, expect, it, vi } from 'vitest'
import { runWithTenantFallback } from './tenant'

describe('tenant scope', () => {
  it('never retries a failed query without tenant scope', async () => {
    const runner = vi.fn(async (includeTenant) => ({
      data: null,
      error: includeTenant ? new Error('tenant_id column missing') : null,
    }))

    const result = await runWithTenantFallback('00000000-0000-0000-0000-000000000001', runner)

    expect(result.error).toBeTruthy()
    expect(runner).toHaveBeenCalledTimes(1)
    expect(runner).toHaveBeenCalledWith(true)
  })

  it('refuses operational access without an active tenant', async () => {
    const runner = vi.fn()
    const result = await runWithTenantFallback('', runner)

    expect(result.error?.message).toMatch(/empresa ativa/i)
    expect(runner).not.toHaveBeenCalled()
  })
})
