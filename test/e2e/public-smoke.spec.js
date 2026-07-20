import { expect, test } from '@playwright/test'

for (const path of ['/', '/vendas', '/entrar']) {
  test(`${path} loads without horizontal overflow or console errors`, async ({ page }) => {
    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await page.goto(path)
    await expect(page.locator('body')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)

    expect(overflow).toBe(false)
    expect(errors).toEqual([])
  })
}

test('authenticated route smoke', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Credenciais do tenant de testes nao configuradas')

  await page.goto('/entrar')
  await page.getByLabel(/email/i).fill(process.env.E2E_EMAIL)
  await page.getByLabel(/senha/i).fill(process.env.E2E_PASSWORD)
  await page.getByRole('button', { name: /entrar/i }).click()
  await expect(page).not.toHaveURL(/\/entrar/)
})
