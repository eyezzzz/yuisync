import { useState, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  Package, Plus, Search, Edit2, Trash2, X, AlertTriangle,
  TrendingUp, TrendingDown, RefreshCw, AlertCircle, Check,
  Filter, DollarSign, Ban, ShieldAlert, ArrowUpRight, Upload,
  Image as ImageIcon, Sparkles, ExternalLink
} from 'lucide-react'
import { useProducts } from '../../../shared/hooks/useProducts'
import { fmtCurrency } from '../../../lib/supabase'
import { useAuthCtx } from '../../../context/AuthContext'
import { useModuleCtx } from '../../../context/ModuleContext'
import { ProductCategorySelect } from '../../../components/ProductCategorySelect'
import { BASE_PRODUCT_CATEGORIES, normalizeCategory, resolveCategoryMeta } from '../../../shared/lib/productCategories'
import { importLegacyRows, resetStock, searchProductImages } from '../../../lib/api'
import { parseLegacyProducts } from '../../../shared/lib/legacyImport'

const BASE_CATEGORIES = [
  'Ração','Petisco','Higiene','Acessório','Medicamento','Brinquedo',
  'Importação XML','Serviço','Outro'
]
const SPECIES         = ['dog','cat','bird','rabbit','fish','all']
const SPECIES_LABELS = { dog:'Cão', cat:'Gato', bird:'Ave', rabbit:'Coelho', fish:'Peixe', all:'Todos' }
const BOT_PRODUCT_TYPES = ['racao','granel','sache','petisco','antipulgas','areia','higiene','medicamento','brinquedo','acessorio','servico','outro']
const BOT_PRODUCT_TYPE_LABELS = {
  racao: 'Racao',
  granel: 'Granel',
  sache: 'Sache',
  petisco: 'Petisco',
  antipulgas: 'Antipulgas',
  areia: 'Areia',
  higiene: 'Higiene',
  medicamento: 'Medicamento',
  brinquedo: 'Brinquedo',
  acessorio: 'Acessorio',
  servico: 'Servico',
  outro: 'Outro',
}
const BOT_AGES = ['', 'filhote', 'adulto', 'senior', 'castrado']
const BOT_SIZES = ['', 'pequeno', 'medio', 'grande', 'mini', 'gigante']

const normalize = (val) => (val || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

const PRODUCT_CATEGORIES = BASE_PRODUCT_CATEGORIES
const normalizeProductCategory = normalizeCategory
const PRODUCT_NAME_KEEP_UPPER = new Set(['KG', 'G', 'ML', 'UN', 'SRD', 'JR', 'AD', 'C', 'N'])
const PRODUCT_PAGE_SIZE_OPTIONS = [50, 100, 200]

function formatProductName(value = '') {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text !== text.toUpperCase()) return text

  return text
    .toLocaleLowerCase('pt-BR')
    .replace(/\b[\p{L}\d/.-]+\b/gu, (word) => {
      const upper = word.toLocaleUpperCase('pt-BR')
      if (PRODUCT_NAME_KEEP_UPPER.has(upper) || /\d/.test(word)) return upper
      return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)
    })
}

const emptyForm = {
  name: '', barcode: '', category: 'Ração', description: '', price: '',
  cost_price: '', stock_quantity: '', min_stock: 1, unit: 'UN',
  species_target: 'all', image_url: '', active: true,
  bot_product_type: '',
  bot_species: '',
  bot_age: '',
  bot_size: '',
  bot_brand: '',
  bot_breed: '',
  bot_package_kg: '',
  bot_is_bulk: false,
}

const PRODUCT_UNITS = [
  { value: 'UN', label: 'Unidade (UN)' },
  { value: 'KG', label: 'Quilograma (KG)' },
  { value: 'MIL', label: 'Milheiro (MIL)' },
]

function productUnit(product) {
  const unit = product?.bot_metadata?.unit || 'UN'
  return PRODUCT_UNITS.some((option) => option.value === unit) ? unit : 'UN'
}

function formatStockQuantity(value, unit = 'UN') {
  const quantity = Number(value || 0)
  const digits = unit === 'UN' || unit === 'MIL' ? 0 : 3
  return `${quantity.toLocaleString('pt-BR', { maximumFractionDigits: digits })} ${unit}`
}

// ── Product Modal ─────────────────────────────────────────────────────────────
function metadataToForm(product) {
  const metadata = product?.bot_metadata || {}
  return {
    bot_product_type: metadata.product_type || '',
    bot_species: metadata.species || '',
    bot_age: metadata.age || '',
    bot_size: metadata.size || '',
    bot_brand: metadata.brand || '',
    bot_breed: Array.isArray(metadata.breed) ? metadata.breed.join(', ') : metadata.breed || '',
    bot_package_kg: metadata.package_kg || '',
    bot_is_bulk: Boolean(metadata.is_bulk),
    unit: PRODUCT_UNITS.some((option) => option.value === metadata.unit) ? metadata.unit : 'UN',
  }
}

function inferBotProductType(form) {
  const text = normalize([form.name, form.category, form.description].filter(Boolean).join(' '))
  if (/granel|a granel/.test(text)) return 'granel'
  if (/banho|tosa|consulta|vacina|exame|ultrassom|cirurg/.test(text)) return 'servico'
  if (/areia|higienica/.test(text)) return 'areia'
  if (/sache/.test(text)) return 'sache'
  if (/petisco|bifinho|ossinho|dental|snack/.test(text)) return 'petisco'
  if (/antipulga|pulga|carrapato|bravecto|nexgard|simparic|frontline/.test(text)) return 'antipulgas'
  if (/shampoo|condicionador|perfume|higiene|tapete|banheira/.test(text)) return 'higiene'
  if (/brinquedo|brinq|bolinha|mordedor|pelucia/.test(text)) return 'brinquedo'
  if (/medicamento|remedio|vermifugo|suplemento/.test(text)) return 'medicamento'
  if (/coleira|guia|peitoral|comedouro|bebedouro|caixa|transporte|arranhador|cama|focinheira/.test(text)) return 'acessorio'
  if (/racao|racoes|premier|royal canin|formula natural|golden|pedigree|whiskas|special dog|special cat|gran plus|quatree/.test(text)) return 'racao'
  return 'outro'
}

function buildBotMetadata(form, product) {
  const current = product?.bot_metadata && typeof product.bot_metadata === 'object' ? product.bot_metadata : {}
  const breed = String(form.bot_breed || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)

  return {
    ...current,
    product_type: form.bot_product_type || (current.product_type && current.product_type !== 'outro' ? current.product_type : inferBotProductType(form)),
    species: form.bot_species || current.species || form.species_target || 'all',
    age: form.bot_age || null,
    size: form.bot_size || null,
    brand: form.bot_brand ? String(form.bot_brand).trim().toLowerCase() : current.brand || null,
    breed,
    package_kg: form.bot_package_kg ? Number(form.bot_package_kg) : null,
    unit: form.unit || 'UN',
    is_bulk: form.unit === 'KG' || Boolean(form.bot_is_bulk),
    source: 'dashboard_manual',
  }
}

function ProductModal({ product, products, moduleId, tenantId, onClose, onCreate, onUpdate }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState(isEdit ? {
    name:           product.name,
    barcode:        product.barcode || '',
    category:       product.category,
    description:    product.description || '',
    image_url:      product.image_url || '',
    price:          product.price,
    cost_price:     product.cost_price || '',
    stock_quantity: product.stock_quantity,
    min_stock:      product.min_stock || 1,
    species_target: product.species_target || 'all',
    upsell_link_id: product.upsell_product?.id || '',
    active:         product.active ?? true,
    ...metadataToForm(product),
  } : { ...emptyForm, upsell_link_id: '' })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')
  const [imageSearching, setImageSearching] = useState(false)
  const [imageSuggestions, setImageSuggestions] = useState([])
  const [imageMessage, setImageMessage] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSubmit() {
    if (!form.name.trim()) return setErr('Nome obrigatório')
    if (!form.price)       return setErr('Preço obrigatório')
    setSaving(true); setErr('')
    try {
      // Limpar o objeto form para garantir que enviamos apenas o que o banco espera
      const payload = {
        name:           form.name,
        barcode:        form.barcode || null,
        category:       form.category,
        description:    form.description,
        image_url:      form.image_url || null,
        price:          Number(form.price),
        cost_price:     Number(form.cost_price) || null,
        stock_quantity: Number(form.stock_quantity) || 0,
        min_stock:      Number(form.min_stock) || 1,
        species_target: form.species_target,
        upsell_link_id: form.upsell_link_id || null,
        active:         form.active,
        bot_metadata:   buildBotMetadata(form, product),
      }
      isEdit ? await onUpdate(product.id, payload) : await onCreate(payload)
      onClose()
    } catch (e) {
      console.error('Erro ao salvar produto:', e)
      setErr(e.message || 'Erro ao salvar alterações')
    } finally {
      setSaving(false)
    }
  }

  async function handleImageSearch() {
    if (imageSearching || (!form.barcode && !form.name)) return
    setImageSearching(true)
    setImageMessage('')
    setImageSuggestions([])

    try {
      const result = await searchProductImages({
        name: form.name,
        barcode: form.barcode,
        category: form.category,
        moduleId,
        tenantId,
        limit: 8,
      })
      setImageSuggestions(result.suggestions || [])
      setImageMessage(result.message || (!(result.suggestions || []).length ? 'Nenhuma imagem encontrada para esse produto.' : ''))
    } catch (e) {
      setImageMessage(e.message || 'Nao foi possivel buscar imagens agora.')
    } finally {
      setImageSearching(false)
    }
  }

  const margin = form.price && form.cost_price
    ? (((Number(form.price) - Number(form.cost_price)) / Number(form.price)) * 100).toFixed(1)
    : null

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">
            {isEdit ? 'Editar Produto' : 'Novo Produto'}
          </h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>

        <div className="modal-body">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="inp-label">Nome do Produto *</label>
              <input className="inp" placeholder="Ex: Ração Premium Golden Adult"
                value={form.name} onChange={e => set('name', e.target.value)}/>
            </div>

            <div className="col-span-2">
              <label className="inp-label">Código de Barras (EAN / GTIN)</label>
              <input className="inp" placeholder="Ex: 7891234567890"
                value={form.barcode} onChange={e => set('barcode', e.target.value)}/>
            </div>

            <div className="col-span-2 rounded-2xl border border-[var(--border)] bg-white/[0.03] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start">
                <div className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/10 flex items-center justify-center">
                  {form.image_url ? (
                    <img src={form.image_url} alt="Imagem do produto" className="h-full w-full object-cover"/>
                  ) : (
                    <ImageIcon size={28} className="text-muted/60"/>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-3">
                  <div>
                    <label className="inp-label">Imagem do produto</label>
                    <input
                      className="inp"
                      placeholder="Cole uma URL aprovada ou busque por EAN/nome"
                      value={form.image_url}
                      onChange={e => set('image_url', e.target.value)}
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleImageSearch}
                      disabled={imageSearching || (!form.barcode && !form.name)}
                      className="btn btn-secondary btn-sm gap-2"
                    >
                      {imageSearching ? <RefreshCw size={14} className="animate-spin"/> : <Sparkles size={14}/>}
                      {imageSearching ? 'Buscando...' : 'Buscar imagens'}
                    </button>
                    {form.image_url && (
                      <button
                        type="button"
                        onClick={() => set('image_url', '')}
                        className="btn btn-ghost btn-sm"
                      >
                        Remover imagem
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-muted">
                    A imagem salva aqui e a unica que o PetBot pode enviar ao cliente.
                  </p>
                </div>
              </div>

              {imageMessage && (
                <p className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-muted">
                  {imageMessage}
                </p>
              )}

              {imageSuggestions.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {imageSuggestions.map((item, index) => (
                    <button
                      type="button"
                      key={`${item.imageUrl}-${index}`}
                      onClick={() => set('image_url', item.imageUrl)}
                      className={`group overflow-hidden rounded-xl border bg-black/10 text-left transition-all hover:border-primary/60 ${
                        form.image_url === item.imageUrl ? 'border-primary' : 'border-white/10'
                      }`}
                      title={item.title || 'Selecionar imagem'}
                    >
                      <div className="aspect-square bg-black/20">
                        <img
                          src={item.thumbnailUrl || item.imageUrl}
                          alt={item.title || 'Sugestao de imagem'}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 px-2 py-2">
                        <span className="truncate text-[10px] font-semibold text-muted">
                          {item.title || 'Imagem sugerida'}
                        </span>
                        {item.sourceUrl && (
                          <a
                            href={item.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => event.stopPropagation()}
                            className="text-muted hover:text-text"
                            title="Abrir origem"
                          >
                            <ExternalLink size={12}/>
                          </a>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="inp-label">Categoria</label>
              <ProductCategorySelect
                value={form.category}
                onChange={(value) => set('category', value)}
                options={!PRODUCT_CATEGORIES.some((baseCategory) => normalizeProductCategory(baseCategory) === normalizeProductCategory(form.category))
                  ? [...PRODUCT_CATEGORIES, form.category]
                  : PRODUCT_CATEGORIES}
              />
              <select className="hidden" value={form.category} onChange={e => set('category', e.target.value)} tabIndex={-1} aria-hidden="true">
                {BASE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                {/* Fallback para categorias que não estão na base mas existem no banco */}
                {!BASE_CATEGORIES.some(bc => normalize(bc) === normalize(form.category)) && (
                   <option value={form.category}>{form.category}</option>
                )}
              </select>
            </div>

            <div>
              <label className="inp-label">Espécie Alvo</label>
              <select className="inp" value={form.species_target} onChange={e => set('species_target', e.target.value)}>
                {SPECIES.map(s => <option key={s} value={s}>{SPECIES_LABELS[s]}</option>)}
              </select>
            </div>

            <div className="col-span-2 rounded-2xl border border-[var(--border)] bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-text">Classificacao do PetBot</p>
                  <p className="text-xs text-muted">Ajuda o bot a filtrar por racao, especie, idade, porte, raca e embalagem.</p>
                </div>
                <span className="badge badge-gray text-[10px]">IA</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="inp-label">Tipo</label>
                  <select className="inp" value={form.bot_product_type} onChange={e => set('bot_product_type', e.target.value)}>
                    <option value="">Inferir automaticamente</option>
                    {BOT_PRODUCT_TYPES.map((type) => (
                      <option key={type} value={type}>{BOT_PRODUCT_TYPE_LABELS[type]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="inp-label">Especie</label>
                  <select className="inp" value={form.bot_species} onChange={e => set('bot_species', e.target.value)}>
                    <option value="">Usar especie alvo</option>
                    {SPECIES.map((species) => <option key={species} value={species}>{SPECIES_LABELS[species]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="inp-label">Idade/fase</label>
                  <select className="inp" value={form.bot_age} onChange={e => set('bot_age', e.target.value)}>
                    {BOT_AGES.map((age) => <option key={age || 'empty'} value={age}>{age || 'Nao especificado'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="inp-label">Porte</label>
                  <select className="inp" value={form.bot_size} onChange={e => set('bot_size', e.target.value)}>
                    {BOT_SIZES.map((size) => <option key={size || 'empty'} value={size}>{size || 'Nao especificado'}</option>)}
                  </select>
                </div>
                <div>
                  <label className="inp-label">Marca</label>
                  <input className="inp" placeholder="premier, royal canin..."
                    value={form.bot_brand} onChange={e => set('bot_brand', e.target.value)}/>
                </div>
                <div>
                  <label className="inp-label">Embalagem kg</label>
                  <input className="inp" type="number" min="0" step="0.1" placeholder="1, 2.5, 15..."
                    value={form.bot_package_kg} onChange={e => set('bot_package_kg', e.target.value)}/>
                </div>
                <div className="col-span-2">
                  <label className="inp-label">Racas relacionadas</label>
                  <input className="inp" placeholder="shih tzu, spitz alemao, lhasa apso"
                    value={form.bot_breed} onChange={e => set('bot_breed', e.target.value)}/>
                </div>
                <label className="col-span-2 flex items-center gap-3 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={form.bot_is_bulk}
                    onChange={(event) => set('bot_is_bulk', event.target.checked)}
                    className="h-4 w-4"
                  />
                  <span className="text-sm font-semibold text-text/80 group-hover:text-text transition-colors">Produto vendido a granel por kg</span>
                </label>
              </div>
            </div>

            <div>
              <label className="inp-label">Preço de Venda (R$) *</label>
              <input className="inp" type="number" min="0" step="0.01" placeholder="0,00"
                value={form.price} onChange={e => set('price', e.target.value)}/>
            </div>

            <div>
              <label className="inp-label">Custo (R$)</label>
              <input className="inp" type="number" min="0" step="0.01" placeholder="0,00"
                value={form.cost_price} onChange={e => set('cost_price', e.target.value)}/>
            </div>

            {margin !== null && (
              <div className="col-span-2">
                <div className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-sm font-semibold ${
                  Number(margin) >= 30
                    ? 'bg-emerald-500/8 border-emerald-500/20 text-emerald-400'
                    : Number(margin) >= 15
                    ? 'bg-amber-500/8 border-amber-500/20 text-amber-400'
                    : 'bg-red-500/8 border-red-500/20 text-red-400'
                }`}>
                  {Number(margin) >= 30 ? <TrendingUp size={15}/> : <TrendingDown size={15}/>}
                  Margem de lucro: {margin}%
                </div>
              </div>
            )}

            <div>
              <label className="inp-label">Unidade de estoque</label>
              <select className="inp" value={form.unit} onChange={e => set('unit', e.target.value)}>
                {PRODUCT_UNITS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>

            <div>
              <label className="inp-label">Estoque Atual ({form.unit})</label>
              <input className="inp" type="number" min="0" step={form.unit === 'KG' ? '0.001' : '1'}
                value={form.stock_quantity} onChange={e => set('stock_quantity', e.target.value)}/>
            </div>

            <div>
              <label className="inp-label">Estoque Mínimo ({form.unit})</label>
              <input className="inp" type="number" min="0" step={form.unit === 'KG' ? '0.001' : '1'}
                value={form.min_stock} onChange={e => set('min_stock', e.target.value)}/>
            </div>

            <div className="col-span-2">
              <label className="inp-label">Produto de Upsell</label>
              <select className="inp" value={form.upsell_link_id || ''} onChange={e => set('upsell_link_id', e.target.value)}>
                <option value="">Sem upsell</option>
                {products.filter(p => p.id !== product?.id).map(p => (
                  <option key={p.id} value={p.id}>{p.name} — {fmtCurrency(p.price)}</option>
                ))}
              </select>
            </div>

            <div className="col-span-2">
              <label className="inp-label">Descrição</label>
              <textarea className="inp h-16 resize-none" placeholder="Descrição breve do produto..."
                value={form.description} onChange={e => set('description', e.target.value)}/>
            </div>

            <div className="col-span-2">
              <label className="flex items-center gap-3 cursor-pointer group">
                <div
                  onClick={() => set('active', !form.active)}
                  className={`switch-root ${form.active ? 'bg-emerald-500' : 'bg-white/10'}`}>
                  <div className={`switch-thumb ${form.active ? 'translate-x-6' : 'translate-x-1'}`}/>
                </div>
                <span className="text-sm font-semibold text-text/80 group-hover:text-text transition-colors">Produto ativo (visível no PDV)</span>
              </label>
            </div>
          </div>

          {err && (
            <p className="text-sm bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl px-3.5 py-2.5 flex items-center gap-2 mt-4">
              <AlertCircle size={14}/> {err}
            </p>
          )}

          <div className="flex gap-3 mt-8">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center border-white/5">Cancelar</button>
            <button onClick={handleSubmit} disabled={saving} className="btn btn-primary flex-1 justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin"/> : (isEdit ? <Check size={14}/> : <Plus size={14}/>)}
              {saving ? 'Salvando...' : (isEdit ? 'Atualizar' : 'Criar Produto')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Stock Adjust Modal ────────────────────────────────────────────────────────
function AdjustModal({ product, onClose, onAdjust }) {
  const [delta, setDelta] = useState('')
  const [saving, setSaving] = useState(false)
  const current = product.stock_quantity
  const unit = productUnit(product)
  const newQty = current + Number(delta)

  const submit = async () => {
    setSaving(true)
    await onAdjust(product.id, newQty)
    setSaving(false)
    onClose()
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-sm">
        <div className="modal-header">
          <h2 className="font-display font-bold text-lg text-text">Ajustar Estoque</h2>
          <button onClick={onClose} className="text-muted hover:text-text"><X size={16}/></button>
        </div>
        
        <div className="modal-body">
          <p className="text-sm text-muted mb-4">Produto: <span className="text-text font-semibold">{product.name}</span></p>
          <div className="bg-surface rounded-xl p-4 text-center mb-4 border border-[var(--border)]">
            <p className="text-xs text-muted mb-1">Estoque atual</p>
            <p className="font-display font-bold text-3xl text-text">{formatStockQuantity(current, unit)}</p>
          </div>
          <div className="mb-4">
            <label className="inp-label">Ajuste (positivo = entrada, negativo = saída)</label>
            <input className="inp text-center text-lg font-bold" type="number" step={unit === 'KG' ? '0.001' : '1'}
              placeholder="+10 ou -5" value={delta} onChange={e => setDelta(e.target.value)}/>
            {delta && (
              <p className={`text-center text-sm mt-2 font-semibold ${newQty < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                → Novo estoque: {formatStockQuantity(Math.max(0, newQty), unit)}
              </p>
            )}
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="btn btn-secondary flex-1 justify-center border-white/5">Cancelar</button>
            <button onClick={submit} disabled={saving || !delta}
              className="btn btn-primary flex-1 justify-center gap-2">
              {saving ? <RefreshCw size={14} className="animate-spin"/> : <Check size={14}/>}
              {saving ? 'Aguarde' : 'Confirmar'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── CSV Import Modal ─────────────────────────────────────────────────────────
function CSVImportModal({ onClose, onImport }) {
  const [file, setFile]       = useState(null)
  const [data, setData]       = useState([])
  const [importing, setImporting] = useState(false)
  const [progress, setProgress]   = useState(0)

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (evt) => {
      const text = evt.target.result
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
      
      const rows = lines.slice(1).map(l => {
        const values = l.split(',').map(v => v.trim())
        const obj = {}
        headers.forEach((h, i) => { obj[h] = values[i] || '' })
        return obj
      })
      setData(rows)
    }
    reader.readAsText(f)
  }

  const executeImport = async () => {
    setImporting(true)
    for (let i = 0; i < data.length; i++) {
       const row = data[i]
       const payload = {
         name:           row.nome || row.produto || row.name || 'Produto Importado',
         category:       row.categoria || row.category || 'Outro',
         price:          Number((row.preco || row.venda || row.price || '0').replace(',','.')),
         cost_price:     Number((row.custo || row.cost || '0').replace(',','.')) || null,
         stock_quantity: Number(row.estoque || row.vontade || row.stock || '0') || 0,
         min_stock:      1,
         active:         true,
       }
       try {
         await onImport(payload)
         setProgress(Math.round(((i + 1) / data.length) * 100))
       } catch (e) {
         console.error('Erro ao importar produto:', i, e)
       }
    }
    setImporting(false)
    onClose()
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => !importing && e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-md">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">Importar Estoque (CSV)</h2>
          {!importing && <button onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>}
        </div>

        <div className="modal-body">
          <p className="text-sm text-muted mb-6">Colunas recomendadas no arquivo CSV: <br/><b>nome, categoria, preco, estoque</b></p>
          
          {!file ? (
            <label className="flex flex-col items-center justify-center border-2 border-dashed border-[var(--border)] rounded-2xl p-10 cursor-pointer hover:bg-white/5 transition-colors group">
              <Package size={32} className="text-muted group-hover:text-primary transition-colors mb-2"/>
              <span className="text-sm font-semibold">Selecionar catálogo (.csv)</span>
              <input type="file" accept=".csv" className="hidden" onChange={handleFile}/>
            </label>
          ) : (
            <div className="space-y-4">
              <div className="bg-surface border border-primary/20 rounded-xl p-4 flex items-center justify-between">
                <span className="text-sm font-bold text-primary">{file.name}</span>
                <span className="text-xs text-muted">{data.length} itens</span>
              </div>
              {importing && (
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
                  <div className="bg-primary h-full transition-all duration-300" style={{width: `${progress}%`}}/>
                </div>
              )}
              <div className="flex gap-3">
                <button disabled={importing} onClick={() => setFile(null)} className="btn btn-secondary flex-1 justify-center border-white/5">Trocar</button>
                <button disabled={importing} onClick={executeImport} className="btn btn-primary flex-1 justify-center gap-2">
                  {importing ? <RefreshCw size={14} className="animate-spin"/> : <Package size={14}/>}
                  {importing ? `${progress}%` : 'Subir Catálogo'}
                </button>
              </div>
            </div>
          )}
          {!importing && <button onClick={onClose} className="btn btn-secondary w-full justify-center mt-4 border-white/5">Fechar</button>}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ── Página Principal ──────────────────────────────────────────────────────────
function chunkRows(rows, size = 250) {
  const chunks = []
  for (let i = 0; i < rows.length; i += size) chunks.push(rows.slice(i, i + size))
  return chunks
}

function LegacyImportModal({ onClose, moduleId, tenantId, onDone }) {
  const [productFile, setProductFile] = useState(null)
  const [summary, setSummary] = useState(null)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')

  const executeImport = async () => {
    if (!productFile) return
    setImporting(true)
    setError('')
    setProgress(0)

    try {
      const totals = {
        products: { parsed: 0, skippedParse: 0, created: 0, updated: 0, skipped: 0 },
      }
      const jobs = []

      if (productFile) jobs.push({ kind: 'products', parsed: await parseLegacyProducts(productFile) })
      setProgress(20)

      const totalChunks = jobs.reduce((sum, job) => sum + chunkRows(job.parsed.rows).length, 0) || 1
      let doneChunks = 0

      for (const job of jobs) {
        totals[job.kind].parsed = job.parsed.rows.length
        totals[job.kind].skippedParse = job.parsed.skipped

        for (const rows of chunkRows(job.parsed.rows)) {
          const result = await importLegacyRows({ kind: job.kind, rows, moduleId, tenantId })
          totals[job.kind].created += Number(result.created || 0)
          totals[job.kind].updated += Number(result.updated || 0)
          totals[job.kind].skipped += Number(result.skipped || 0)
          doneChunks += 1
          setProgress(20 + Math.round((doneChunks / totalChunks) * 80))
        }
      }

      setSummary(totals)
      await onDone?.()
    } catch (err) {
      setError(err?.message || 'Erro ao importar legado.')
    } finally {
      setImporting(false)
    }
  }

  const FilePicker = ({ file, setFile, label, hint }) => (
    <label className="flex items-center justify-between gap-3 border border-[var(--border)] rounded-xl p-4 cursor-pointer hover:bg-white/5 transition-colors">
      <div>
        <p className="text-sm font-semibold text-text">{label}</p>
        <p className="text-xs text-muted">{file ? file.name : hint}</p>
      </div>
      <Upload size={18} className="text-primary"/>
      <input type="file" accept=".xlsx,.csv" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)}/>
    </label>
  )

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={e => !importing && e.target === e.currentTarget && onClose()}>
      <div className="modal-box max-w-lg">
        <div className="modal-header">
          <h2 className="font-display font-bold text-xl text-text">Import Legado</h2>
          {!importing && <button onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>}
        </div>

        <div className="modal-body space-y-4">
          <p className="text-sm text-muted">
            Importacao isolada para admin global. Aceita o XLS de produtos do sistema antigo e cria/atualiza o estoque.
          </p>
          <FilePicker file={productFile} setFile={setProductFile} label="Importar produtos" hint="Estoque (.xlsx/.csv)"/>

          {importing && (
            <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden">
              <div className="bg-primary h-full transition-all duration-300" style={{width: `${progress}%`}}/>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {summary && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-text space-y-1">
              <p><b>Produtos:</b> {summary.products.created} criados, {summary.products.updated} atualizados, {summary.products.skipped} ignorados.</p>
            </div>
          )}

          <div className="flex gap-3">
            <button disabled={importing} onClick={onClose} className="btn btn-secondary flex-1 justify-center border-white/5">Fechar</button>
            <button disabled={importing || !productFile} onClick={executeImport} className="btn btn-primary flex-1 justify-center gap-2">
              {importing ? <RefreshCw size={14} className="animate-spin"/> : <Upload size={14}/>}
              {importing ? `${progress}%` : 'Importar Legado'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function EstoquePage() {
  const auth = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  
  const isAdmin = auth?.profile?.role === 'admin' || 
                 (auth?.profile?.module_permissions || {})[activeModuleId]?.startsWith('admin_')
  const isGlobalAdmin = auth?.profile?.role === 'admin'

  const { products, loading, load, create, update, adjustStock, remove, stockStatus } = useProducts()

  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [modal, setModal]       = useState(null)   // null | {} | product
  const [importModal, setImportModal] = useState(false)
  const [legacyImportModal, setLegacyImportModal] = useState(false)
  const [adjusting, setAdjusting] = useState(null) // product | null
  const [resettingStock, setResettingStock] = useState(false)
  const [pageSize, setPageSize] = useState(PRODUCT_PAGE_SIZE_OPTIONS[0])
  const [page, setPage] = useState(1)

  useEffect(() => {
    load({ activeOnly: false })
  }, [load])

  useEffect(() => {
    setPage(1)
  }, [search, catFilter, statusFilter, pageSize])

  const normalize = (val) => (val || '').toString().normalize('NFD').replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()

  const dynamicCategories = useMemo(() => {
    const base = PRODUCT_CATEGORIES
    const fromProducts = Array.from(new Set(products.map(p => p.category).filter(Boolean)))
    
    const results = [...base]
    fromProducts.forEach(cat => {
      const isAlreadyIncluded = results.some(r => normalizeProductCategory(r) === normalizeProductCategory(cat))
      if (!isAlreadyIncluded) results.push(cat)
    })
    
    return results.sort()
  }, [products])

  const filtered = useMemo(() => (products || []).filter(p => {
    // Filtro de Busca (Nome ou Categoria)
    const q = normalize(search)
    const metadata = p.bot_metadata && typeof p.bot_metadata === 'object' ? p.bot_metadata : {}
    const metadataText = [
      metadata.product_type,
      metadata.species,
      metadata.age,
      metadata.size,
      metadata.brand,
      Array.isArray(metadata.breed) ? metadata.breed.join(' ') : metadata.breed,
      metadata.package_kg ? `${metadata.package_kg}kg` : '',
      metadata.is_bulk ? 'granel' : '',
    ].filter(Boolean).join(' ')
    const matchQ = !search || 
                  normalize(p.name).includes(q) || 
                  normalize(p.category).includes(q) ||
                  normalize(p.barcode).includes(q) ||
                  normalize(metadataText).includes(q)
    
    // Filtro de Categoria (Smarth Match - ignora acentos/case)
    const matchC = !catFilter || normalize(p.category) === normalize(catFilter)
    
    // Filtro de Status
    const matchS = !statusFilter || stockStatus(p) === statusFilter
    
    return matchQ && matchC && matchS
  }), [products, search, catFilter, statusFilter])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageStart = filtered.length ? (currentPage - 1) * pageSize : 0
  const pageEnd = Math.min(pageStart + pageSize, filtered.length)
  const visibleProducts = useMemo(
    () => filtered.slice(pageStart, pageEnd),
    [filtered, pageStart, pageEnd]
  )

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages))
  }, [totalPages])

  const criticalCount = products.filter(p => stockStatus(p) === 'critico').length
  const outCount      = products.filter(p => stockStatus(p) === 'esgotado').length
  const totalValue    = products.reduce((s, p) => s + p.price * p.stock_quantity, 0)

  const stockBadge = (p) => {
    const s = stockStatus(p)
    if (s === 'esgotado') return { cls: 'badge-red',   label: 'Esgotado',  cellCls: 'stock-critical' }
    if (s === 'critico')  return { cls: 'badge-amber', label: 'Crítico',   cellCls: 'stock-warn'    }
    return                       { cls: 'badge-green', label: 'Normal',    cellCls: 'stock-ok'      }
  }

  const handleResetStock = async () => {
    if (!isGlobalAdmin || resettingStock) return
    const ok = window.confirm('Resetar o estoque deste modulo/negocio apagando todos os produtos? Esta acao e permanente.')
    if (!ok) return
    setResettingStock(true)
    try {
      const result = await resetStock({
        moduleId: activeModuleId,
        tenantId: auth?.activeTenantId,
      })
      await load({ activeOnly: false })
      window.alert(`${Number(result.deletedProducts || 0)} produto(s) removido(s) do estoque.`)
    } catch (err) {
      window.alert(err?.message || 'Nao foi possivel resetar o estoque.')
    } finally {
      setResettingStock(false)
    }
  }

  return (
    <div className="page animate-content">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title !flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(0,224,255,0.8)]" />
            Inventário <span className="opacity-40 font-normal">/ Estoque</span>
          </h1>
          <p className="page-sub !mt-1">Controle de produtos e inventário global</p>
        </div>
        <div className="flex gap-2">
           {isGlobalAdmin && (
             <>
               <button onClick={() => setLegacyImportModal(true)} className="btn btn-secondary border-primary/20 text-primary">
                  <Upload size={16}/> Import Legado
               </button>
               <button onClick={handleResetStock} disabled={resettingStock} className="btn btn-secondary text-red-500 border-red-500/20">
                  <RefreshCw size={16} className={resettingStock ? 'animate-spin' : ''}/> Resetar Estoque
               </button>
             </>
           )}
           {isAdmin && (
             <button onClick={() => setImportModal(true)} className="btn btn-secondary border border-white/10">
                Importar CSV
             </button>
           )}
           {isAdmin && (
             <button onClick={() => setModal({})} className="btn btn-primary">
              <Plus size={16}/> Novo Produto
            </button>
           )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label:'Total de Produtos', value: products.length,       cls:'text-text',        icon: Package, color: 'text-primary', show: true },
          { label:'Valor em Estoque',  value: fmtCurrency(totalValue), cls:'text-emerald-400', icon: DollarSign, color: 'text-emerald-400', show: isAdmin },
          { label:'Estoque Crítico',   value: criticalCount,          cls:'text-amber-400',   icon: ShieldAlert, color: 'text-amber-400', show: true },
          { label:'Esgotados',         value: outCount,               cls:'text-red-400',     icon: Ban, color: 'text-red-400', show: true },
        ].filter(c => c.show).map(c => (
          <div key={c.label} className="bg-card border border-[var(--border)] rounded-xl2 p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center ${c.color}`}>
               <c.icon size={20} />
            </div>
            <div>
              <p className={`font-display font-bold text-2xl ${c.cls}`}>{c.value}</p>
              <p className="text-xs text-muted">{c.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"/>
          <input aria-label="Buscar produto" className="inp pl-9 py-2" placeholder="Buscar produto..."
            value={search} onChange={e => setSearch(e.target.value)}/>
          {search && (
            <button type="button" aria-label="Limpar busca" title="Limpar busca" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-text p-1">
              <X size={14}/>
            </button>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <ProductCategorySelect
            className="w-[220px]"
            value={catFilter}
            onChange={setCatFilter}
            options={dynamicCategories}
            allowEmpty
            emptyLabel="Categorias"
          />
          <select aria-label="Filtrar estoque por status" className="inp py-2 w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">Status</option>
            <option value="ok">Normal</option>
            <option value="critico">Crítico</option>
            <option value="esgotado">Esgotado</option>
          </select>
          <button type="button" aria-label="Atualizar estoque" onClick={() => load({ activeOnly: false })}
            className="btn btn-ghost btn-sm btn-icon" title="Atualizar">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''}/>
          </button>
        </div>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-card px-4 py-3">
          <p className="text-xs font-semibold text-muted">
            Mostrando {pageStart + 1}-{pageEnd} de {filtered.length} produto(s)
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label className="flex items-center gap-2 text-muted">
              Exibir
              <select
                className="inp py-1.5 w-auto text-xs"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                {PRODUCT_PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="btn btn-secondary btn-sm disabled:opacity-50"
              disabled={currentPage <= 1}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
            >
              Anterior
            </button>
            <span className="text-muted">
              Pagina {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-sm disabled:opacity-50"
              disabled={currentPage >= totalPages}
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
            >
              Proxima
            </button>
          </div>
        </div>
      )}

      {/* Critical alert */}
      {(criticalCount > 0 || outCount > 0) && !statusFilter && !search && !catFilter && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0"/>
          <p className="text-sm text-amber-400 font-semibold">
            {outCount > 0 && `${outCount} produto(s) esgotado(s)`}
            {outCount > 0 && criticalCount > 0 && ' • '}
            {criticalCount > 0 && `${criticalCount} produto(s) em estoque crítico`}
          </p>
          <button onClick={() => setStatusFilter('critico')} className="ml-auto btn btn-sm btn-secondary text-xs">
            Ver críticos
          </button>
        </div>
      )}

      {/* Table */}
      <div className="tbl-wrapper">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted text-sm">
            <RefreshCw size={16} className="animate-spin mr-2"/> Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Package size={36} className="text-muted/30"/>
            <p className="text-sm text-muted">Nenhum produto encontrado</p>
            <button onClick={() => { setSearch(''); setCatFilter(''); setStatusFilter('') }}
              className="btn btn-secondary btn-sm">Limpar filtros</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl table-fixed min-w-[1120px]">
              <colgroup>
                <col className="w-[28%]" />
                <col className="w-[15%]" />
                <col className="w-[9%]" />
                {isAdmin && <col className="w-[9%]" />}
                {isAdmin && <col className="w-[8%]" />}
                <col className="w-[7%]" />
                <col className="w-[6%]" />
                <col className="w-[9%]" />
                <col className="w-[9%]" />
              </colgroup>
              <thead><tr>
                <th>Produto</th><th>Categoria</th><th>Preço</th>
                {isAdmin && <th>Custo</th>}
                {isAdmin && <th>Margem</th>}
                <th>Estoque</th>
                <th>Mín.</th><th>Status</th><th className="text-right">Ações</th>
              </tr></thead>
              <tbody>
                {visibleProducts.map(p => {
                  const sb = stockBadge(p)
                  const margin = p.cost_price
                    ? (((p.price - p.cost_price) / p.price) * 100).toFixed(0)
                    : null
                  const metadata = p.bot_metadata && typeof p.bot_metadata === 'object' ? p.bot_metadata : {}
                  const botTags = [
                    BOT_PRODUCT_TYPE_LABELS[metadata.product_type] || metadata.product_type,
                    metadata.brand,
                    metadata.age,
                    metadata.size,
                    metadata.package_kg ? `${metadata.package_kg}kg` : '',
                    metadata.is_bulk ? 'granel' : '',
                  ].filter(Boolean)
                  return (
                    <tr key={p.id} className={!p.active ? 'opacity-50' : ''}>
                      <td>
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name} className="h-full w-full object-cover"/>
                            ) : (
                              <ImageIcon size={17} className="text-muted/50"/>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-text truncate" title={p.name}>{formatProductName(p.name)}</p>
                            {botTags.length > 0 && (
                              <p className="text-[10px] text-muted mt-1 truncate" title={botTags.join(' / ')}>
                                PetBot: {botTags.join(' / ')}
                              </p>
                            )}
                            {p.upsell_product && (
                              <p className="text-[10px] text-amber-400 mt-1 flex items-center gap-1 min-w-0">
                                <ArrowUpRight size={10} className="flex-shrink-0"/> <span className="truncate">{formatProductName(p.upsell_product.name)}</span>
                              </p>
                            )}
                            {!p.image_url && <span className="badge badge-gray text-[10px] mt-1">Sem foto</span>}
                            {!p.active && <span className="badge badge-gray text-[10px] mt-1">Inativo</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        {(() => {
                          const meta = resolveCategoryMeta(p.category)
                          const Icon = meta.icon
                          return (
                            <span className={`badge inline-flex max-w-full items-center gap-2 border ${meta.chipClassName}`}>
                              <span className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md ${meta.tileClassName}`}>
                                <Icon size={11} />
                              </span>
                              <span className="truncate">{meta.label}</span>
                            </span>
                          )
                        })()}
                      </td>
                      <td><span className="font-semibold text-text">{fmtCurrency(p.price)}</span></td>
                      {isAdmin && <td className="text-muted">{p.cost_price ? fmtCurrency(p.cost_price) : '—'}</td>}
                      {isAdmin && (
                        <td>
                          {margin !== null ? (
                            <span className={`font-semibold ${
                              Number(margin) >= 30 ? 'text-emerald-400' :
                              Number(margin) >= 15 ? 'text-amber-400'  : 'text-red-400'
                            }`}>{margin}%</span>
                          ) : '—'}
                        </td>
                      )}
                      <td>
                        <span className={`font-bold font-display text-lg ${sb.cellCls}`}>
                          {formatStockQuantity(p.stock_quantity, productUnit(p))}
                        </span>
                      </td>
                      <td className="text-muted">{p.min_stock}</td>
                      <td><span className={`badge ${sb.cls}`}>{sb.label}</span></td>
                      <td className="text-right">
                        <div className="flex justify-end gap-1">
                          <button type="button" aria-label={`Ajustar estoque de ${p.name}`} onClick={() => setAdjusting(p)}
                            className="btn btn-ghost btn-sm btn-icon" title="Ajustar estoque">
                            <Package size={13}/>
                          </button>
                          {isAdmin && (
                            <button type="button" aria-label={`Editar ${p.name}`} onClick={() => setModal(p)}
                              className="btn btn-ghost btn-sm btn-icon" title="Editar">
                              <Edit2 size={13}/>
                            </button>
                          )}
                          {isAdmin && (
                            <button type="button" aria-label={`Desativar ${p.name}`} onClick={() => remove(p.id)}
                              className="btn btn-danger btn-sm btn-icon" title="Desativar">
                              <Trash2 size={13}/>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border2)] bg-surface/70 p-4">
                <p className="text-xs font-semibold text-muted">
                  Mostrando {pageStart + 1}-{pageEnd} de {filtered.length}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                    disabled={currentPage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    Anterior
                  </button>
                  <span className="text-muted">
                    Pagina {currentPage} de {totalPages}
                  </span>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                    disabled={currentPage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Proxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      {modal !== null && (
        <ProductModal
          product={modal?.id ? modal : null}
          products={products}
          moduleId={activeModuleId}
          tenantId={auth?.activeTenantId}
          onClose={() => setModal(null)}
          onCreate={create}
          onUpdate={update}
        />
      )}
      {adjusting && (
        <AdjustModal
          product={adjusting}
          onClose={() => setAdjusting(null)}
          onAdjust={adjustStock}
        />
      )}
      {/* Import CSV Modal */}
      {importModal && (
        <CSVImportModal 
          onClose={() => setImportModal(false)}
          onImport={create}
        />
      )}
      {legacyImportModal && (
        <LegacyImportModal
          moduleId={activeModuleId}
          tenantId={auth?.activeTenantId}
          onClose={() => setLegacyImportModal(false)}
          onDone={() => load({ activeOnly: false })}
        />
      )}
    </div>
  )
}
