import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')

test('PDV ativo usa exclusivamente o checkout transacional', async () => {
  const source = await read('src/shared/hooks/useSales.js')
  const activeFlow = source.slice(source.indexOf('const createSale ='), source.indexOf('const issueSaleFiscal'))
  assert.match(activeFlow, /checkoutPetshop\(/)
  assert.doesNotMatch(activeFlow, /\.from\(['"]sales['"]\)\.insert/)
  assert.match(activeFlow, /crypto\.randomUUID\(\)/)
})

test('agenda cria reserva e consome beneficio na mesma RPC', async () => {
  const source = await read('src/shared/hooks/useAppointments.js')
  const createFlow = source.slice(source.indexOf('const create = useCallback'), source.indexOf('const update = useCallback'))
  assert.match(createFlow, /book_petshop_appointment_transaction/)
  assert.doesNotMatch(createFlow, /consumeSubscriptionBenefit/)
})

test('taxa MotoDog publica nao e enviada pelo navegador', async () => {
  const source = await read('src/public/pages/PublicBookingPage.jsx')
  assert.doesNotMatch(source, /p_motodog_fee/)
  assert.doesNotMatch(source, /Taxa MotoDog \(R\$\)/)
})

test('migracao protege estoque, idempotencia e conflito de agenda', async () => {
  const migration = await read('supabase/migrations/20260720002000_transactional_operations.sql')
  assert.match(migration, /create table if not exists public\.stock_movements/)
  assert.match(migration, /for update/)
  assert.match(migration, /sales_tenant_idempotency_unique/)
  assert.match(migration, /prevent_appointment_overlap/)
  assert.match(migration, /record_fiscal_queue_failure/)
})

test('reset de estoque preserva itens e vendas historicas', async () => {
  const source = await read('serverless/dashboardApi.ts')
  const resetFlow = source.slice(source.indexOf('async function handleResetStock'), source.indexOf('function normalizeLegacyString'))
  assert.doesNotMatch(resetFlow, /from\(['"]sale_items['"]\)[\s\S]*?\.delete\(/)
  assert.match(resetFlow, /stock_quantity:\s*0/)
})

test('PetBot aplica a RPC transacional de estoque e agenda na cadeia de migracoes', async () => {
  const migration = await read('supabase/migrations/20260720007000_petbot_transaction_rpc.sql')
  assert.match(migration, /create or replace function public\.create_petbot_order_transaction/)
  assert.match(migration, /from public\.products[\s\S]*?for update/)
  assert.match(migration, /from public\.appointments[\s\S]*?for update/)
  assert.match(migration, /update public\.products set stock_quantity = stock_quantity - v_quantity/)
  assert.match(migration, /status = 'agendado'/)
})

test('deploy permanece dentro do limite de funcoes do Vercel Hobby', async () => {
  const apiFiles = await readdir(new URL('api/', root), { recursive: true })
  const serverlessFunctions = apiFiles.filter((path) => path.endsWith('.ts'))
  assert.ok(
    serverlessFunctions.length <= 12,
    `O deploy possui ${serverlessFunctions.length} funcoes serverless; o limite do Hobby e 12.`,
  )
})

test('historico de vendas desambigua o relacionamento com vendedor', async () => {
  const source = await read('src/shared/hooks/useSales.js')
  assert.match(source, /profiles!sales_profile_id_fkey\s*\(/)
  assert.doesNotMatch(source, /['"]profiles\s*\(/)
})

test('seletor da agenda fecha ao escolher cliente e usa busca hibrida limitada', async () => {
  const source = await read('src/modules/petshop/pages/AgendaPage.jsx')
  const clientsSource = await read('src/shared/hooks/useClients.js')
  assert.match(source, /setClientPickerOpen\(false\)/)
  assert.match(source, /useDeferredValue\(petSearch\)/)
  assert.match(source, /\.slice\(0, 8\)/)
  assert.match(source, /searchRequestRef/)
  assert.match(source, /onSearchClients\(query, \{ limit: 20 \}\)/)
  assert.match(clientsSource, /const search = useCallback/)
  assert.match(clientsSource, /\.limit\(limit\)/)
  assert.doesNotMatch(source, /onSearchClients=\{loadPets\}/)
})

test('modo caixa do PDV usa scanner e preserva o checkout transacional', async () => {
  const source = await read('src/modules/petshop/pages/VendasPage.jsx')
  const routerSource = await read('src/router/AppRouter.jsx')
  assert.match(source, /tab === 'caixa'/)
  assert.match(source, /Buscar produto ou ler codigo de barras/)
  assert.match(source, /String\(item\.barcode \|\| ''\)\.trim\(\) === code/)
  assert.match(source, /event\.key !== 'F2'/)
  assert.match(source, /onScan=\{handleScannerSubmit\}/)
  assert.match(source, /cashierProductResults/)
  assert.match(source, /normalizeProductSearch\(product\.name\)\.includes\(query\)/)
  assert.match(source, /onChooseProduct=\{handleChooseCashierProduct\}/)
  assert.match(source, /parseCashierEntry/)
  assert.match(source, /aria-label="Quantidade do produto"/)
  assert.match(source, /value\.match\(\/\^\(\\d\+\)\\s\*\\\*\//)
  assert.match(source, /addToCart\(product, quantity\)/)
  assert.match(source, /quantityInCart \+ quantity > Number\(product\.stock_quantity/)
  assert.match(source, /flex h-full min-h-0 flex-col bg-\[var\(--bg\)\]/)
  assert.match(source, /flex-1 overflow-y-auto px-5 py-4/)
  assert.doesNotMatch(source, /sticky bottom-0 z-20/)
  assert.match(source, /min-h-0 overflow-y-auto p-4/)
  assert.match(source, /onClick=\{handleSell\}/)
  assert.match(source, /modal-overlay theme-petshop-modal/)
  assert.match(source, /yuisync:focus-mode/)
  assert.match(source, /Sair do Modo Caixa/)
  assert.match(source, /tab === 'caixa' \? 'top-full mt-2 slide-in-from-top-2'/)
  assert.match(routerSource, /!focusMode && \(\s*<Sidebar/)
  assert.match(routerSource, /activeModuleId !== 'system' && !focusMode && <SupportWidget/)
})

test('cards de clientes preservam nomes legiveis e acoes separadas', async () => {
  const source = await read('src/modules/petshop/pages/PetsPage.jsx')
  const clientsSource = await read('src/shared/hooks/useClients.js')
  assert.match(source, /function formatPersonName/)
  assert.match(source, /replace\(\/\^\[\\s:;,\.=_-\]\+\//)
  assert.match(source, /line-clamp-2 text-base font-bold leading-snug/)
  assert.match(source, /flex min-h-\[250px\] flex-col/)
  assert.match(source, /mt-auto border-t/)
  assert.match(source, /const matchesSearch = \(!query && !queryDigits\) \|\| matchesText \|\| matchesDigits/)
  assert.match(source, /const CLIENTS_PAGE_SIZE = 60/)
  assert.match(source, /visiblePets\.map/)
  assert.doesNotMatch(source, /\{filteredPets\.map/)
  assert.match(clientsSource, /fetchAllClientPages/)
  assert.match(clientsSource, /\.range\(from, from \+ CLIENT_PAGE_SIZE - 1\)/)
})

test('ordem impressa usa a largura nativa da Print iD sem forcar altura', async () => {
  const source = await read('src/modules/petshop/pages/OrdensEntregaPage.jsx')
  assert.match(source, /printThermalReceipt\(printWindow\)/)
  assert.match(source, /const width = '80mm'/)
  assert.match(source, /const printableWidth = '64mm'/)
  assert.match(source, /class="receipt"/)
  assert.match(source, /quatro-patas-logo-mono\.png/)
  assert.match(source, /Conferência \/ ordem de entrega/)
  assert.match(source, /<table><thead>/)
  assert.match(source, /Endereço de entrega/)
  assert.match(source, /Endereço do cliente/)
  assert.match(source, /completeClientAddress/)
  assert.match(source, /const address = completeClientAddress\(order\) \|\| orderOriginAddress\(order\)/)
  assert.match(source, /AV CONSTANTINO PINTO, 191/)
  assert.match(source, /\(32\)98520-5279/)
})

test('todos os comprovantes usam a largura 80mm da Print iD', async () => {
  const receiptFiles = [
    'src/shared/pages/BillingPage.jsx',
    'src/modules/petshop/pages/AgendaPage.jsx',
    'src/modules/petshop/pages/VendasPage.jsx',
  ]

  for (const file of receiptFiles) {
    const source = await read(file)
    assert.match(source, /printThermalReceipt\(printWindow\)/)
    assert.match(source, /@page \{ margin: 0; \}/)
    assert.match(source, /class="receipt"/)
    assert.doesNotMatch(source, /size: 80mm auto/)
    assert.match(source, /width: 80mm/)
  }

  const utility = await read('src/lib/thermalPrint.js')
  assert.match(utility, /Print iD controla avanço e corte pelo próprio driver/)
  assert.doesNotMatch(utility, /@page/)
})

test('importacao legado preserva historico e oculta registros arquivados', async () => {
  const script = await read('scripts/import_legacy_petshop.py')
  const clients = await read('src/shared/hooks/useClients.js')
  assert.match(script, /Soft-delete evita quebrar vendas, estoque e agendamentos legados vinculados/)
  assert.match(script, /BATCH_SIZE = 250/)
  assert.match(script, /repair-product-categories/)
  assert.match(script, /repair-product-units/)
  assert.match(script, /repair-bulk-stock/)
  assert.match(script, /canonical_product_category/)
  assert.match(script, /'active': False/)
  assert.match(script, /'on_conflict': 'barcode'/)
  assert.match(clients, /\.eq\('active', true\)/)
})

test('detalhes do cliente mostram endereco completo e complemento', async () => {
  const source = await read('src/modules/petshop/pages/PetsPage.jsx')
  const clients = await read('src/shared/hooks/useClients.js')
  assert.match(source, /Endereco<\/p>/)
  assert.match(source, /pet\.owner_address/)
  assert.match(source, /pet\.address_complement/)
  assert.match(source, /pet\.owner_neighborhood/)
  assert.match(source, />Complemento<\/p>/)
  assert.doesNotMatch(source, /pet\.address_number && `Nº \$\{pet\.address_number\}`/)
  assert.match(clients, /address_complement: c\.details\?\.address_complement/)
  assert.doesNotMatch(source, /Numero \/ referencia/)
})

test('estoque permite unidades e fracao para produtos por peso', async () => {
  const source = await read('src/modules/petshop/pages/EstoquePage.jsx')
  assert.match(source, /Quilograma \(KG\)/)
  assert.match(source, /MIL \(conforme planilha\)/)
  assert.match(source, /step=\{form\.unit === 'KG' \? '0\.001' : '1'\}/)
  assert.match(source, /formatStockQuantity/)
})

test('modo noturno e persistido e tem alternancia no menu', async () => {
  const router = await read('src/router/AppRouter.jsx')
  const sidebar = await read('src/components/Sidebar.jsx')
  const styles = await read('src/index.css')
  assert.match(router, /@yuisync-color-mode/)
  assert.match(router, /theme-\$\{activeModuleId\} \$\{darkMode \? 'theme-dark' : ''\}/)
  assert.match(sidebar, /aria-label=\{darkMode \? 'Ativar modo claro' : 'Ativar modo noturno'\}/)
  assert.match(sidebar, /w-10 h-10/)
  assert.match(styles, /\.theme-petshop\.theme-dark/)
  assert.match(styles, /#38BDF8/)
})
