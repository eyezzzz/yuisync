import { expect, test } from '@playwright/test'

const moduleRoutes = [
  '/petshop/dashboard',
  '/petshop/agenda',
  '/petshop/vendas',
  '/petshop/ordens',
  '/petshop/chat',
  '/petshop/growth',
  '/petshop/pets',
  '/petshop/fidelidade',
  '/petshop/caixa',
  '/petshop/relatorios',
  '/petshop/planos',
  '/petshop/financeiro',
  '/petshop/estoque',
  '/petshop/campanhas',
  '/petshop/usuarios',
  '/petshop/equipe',
  '/petshop/config',
  '/petshop/logs',
]

const viewports = [
  { width: 390, height: 844 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1440, height: 900 },
]

test.beforeAll(() => {
  if (!process.env.CI) return
  const required = [
    'E2E_BASE_URL',
    'E2E_EMAIL',
    'E2E_PASSWORD',
    'E2E_COMMON_EMAIL',
    'E2E_COMMON_PASSWORD',
    'E2E_MANAGER_EMAIL',
    'E2E_MANAGER_PASSWORD',
  ]
  const missing = required.filter((name) => !process.env[name])
  if (missing.length) throw new Error(`Secrets E2E obrigatorios ausentes: ${missing.join(', ')}`)
})

async function signIn(page, email, password) {
  await page.goto('/entrar')
  await page.getByLabel('E-mail', { exact: true }).fill(email)
  await page.getByLabel('Senha', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Entrar na Plataforma', exact: true }).click()
  await expect(page).not.toHaveURL(/\/entrar/, { timeout: 15_000 })
}

test('admin percorre todas as abas sem console, quebra ou overflow', async ({ page }) => {
  test.skip(!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD, 'Credenciais E2E nao configuradas')
  test.slow()

  const consoleProblems = []
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) consoleProblems.push(`${message.type()}: ${message.text()}`)
  })
  page.on('pageerror', (error) => consoleProblems.push(`pageerror: ${error.message}`))

  await signIn(page, process.env.E2E_EMAIL, process.env.E2E_PASSWORD)

  for (const viewport of viewports) {
    await page.setViewportSize(viewport)
    for (const route of moduleRoutes) {
      await page.goto(route)
      await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 15_000 })
      await expect(page.getByText('Falha ao carregar esta aba')).toHaveCount(0)

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      )
      expect(overflow, `${route} em ${viewport.width}px`).toBe(false)
    }
  }

  expect(consoleProblems).toEqual([])
})

for (const role of [
  { name: 'usuario comum', email: 'E2E_COMMON_EMAIL', password: 'E2E_COMMON_PASSWORD' },
  { name: 'gestor', email: 'E2E_MANAGER_EMAIL', password: 'E2E_MANAGER_PASSWORD' },
]) {
  test(`${role.name} recupera sessao e abre o dashboard permitido`, async ({ page }) => {
    const email = process.env[role.email]
    const password = process.env[role.password]
    test.skip(!email || !password, `Credenciais de ${role.name} nao configuradas`)

    const errors = []
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text())
    })

    await signIn(page, email, password)
    await page.goto('/petshop/dashboard')
    await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 15_000 })
    await page.reload()
    await expect(page).not.toHaveURL(/\/entrar/)
    await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 15_000 })
    expect(errors).toEqual([])
  })
}
