import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, Search, X } from 'lucide-react'
import { useClients } from '../../../shared/hooks/useClients'
import { formatCepInput, lookupBrazilianCep, normalizeCep } from '../lib/cepLookup'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .trim()

const QUICK_CLIENT_EMPTY = {
  owner_name: '',
  phone: '',
  pet_name: '',
  species: 'dog',
  zip_code: '',
  owner_address: '',
  address_number: '',
  owner_neighborhood: '',
  owner_city: '',
}

function setNativeInputValue(input, value) {
  if (!input) return
  const prototype = input instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
  if (setter) setter.call(input, value)
  else input.value = value
  input.dispatchEvent(new Event('input', { bubbles: true }))
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

function labelInput(root, names = []) {
  const expected = names.map(normalizeText)
  const label = [...(root?.querySelectorAll?.('label') || [])].find((node) => {
    const text = normalizeText(node.textContent)
    return expected.some((name) => text === name || text.startsWith(`${name} `))
  })
  if (!label) return null
  return label.parentElement?.querySelector('input, textarea') || null
}

function applyAddressToForm(root, address) {
  const assignments = [
    [['cep'], address.zip_code],
    [['endereco', 'logradouro'], address.owner_address],
    [['bairro'], address.owner_neighborhood],
    [['cidade'], address.owner_city],
    [['complemento'], address.address_complement],
  ]
  assignments.forEach(([labels, value]) => {
    if (!value) return
    const input = labelInput(root, labels)
    if (input) setNativeInputValue(input, value)
  })
}

function enhanceCepFields(root = document) {
  const labels = [...root.querySelectorAll('label')]
    .filter((label) => normalizeText(label.textContent) === 'cep')

  labels.forEach((label) => {
    const field = label.parentElement?.querySelector('input')
    if (!field || field.dataset.yuisyncCepEnhanced === 'true') return
    field.dataset.yuisyncCepEnhanced = 'true'
    field.maxLength = 9

    const parent = field.parentElement
    if (!parent) return
    parent.style.position = parent.style.position || 'relative'
    field.style.paddingRight = '42px'

    const status = document.createElement('p')
    status.dataset.yuisyncCepStatus = 'true'
    status.className = 'mt-1 text-[10px] text-muted'

    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.yuisyncCepButton = 'true'
    button.setAttribute('aria-label', 'Buscar CEP')
    button.title = 'Buscar CEP'
    button.className = 'absolute bottom-[7px] right-2 inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--border2)] bg-surface text-amber-400 hover:bg-amber-500/10'
    button.innerHTML = '<span aria-hidden="true">⌕</span>'
    parent.appendChild(button)
    parent.appendChild(status)

    let timer = 0
    let controller = null
    let lastLookup = ''

    const performLookup = async ({ force = false } = {}) => {
      const cep = normalizeCep(field.value)
      if (cep.length !== 8) {
        if (force) status.textContent = 'Informe os 8 digitos do CEP.'
        return
      }
      if (!force && cep === lastLookup) return
      lastLookup = cep
      controller?.abort()
      controller = new AbortController()
      status.textContent = 'Buscando endereco...'
      button.disabled = true
      try {
        const address = await lookupBrazilianCep(cep, { signal: controller.signal })
        const formRoot = field.closest('.modal-box, form, .page') || document
        applyAddressToForm(formRoot, address)
        status.textContent = 'Endereco preenchido pelo CEP.'
      } catch (error) {
        if (controller.signal.aborted) return
        status.textContent = error?.message || 'Nao foi possivel consultar o CEP.'
      } finally {
        button.disabled = false
      }
    }

    const onInput = () => {
      window.clearTimeout(timer)
      const cep = normalizeCep(field.value)
      if (cep.length < 8) {
        lastLookup = ''
        status.textContent = ''
        return
      }
      timer = window.setTimeout(() => void performLookup(), 220)
    }
    const onBlur = () => {
      const formatted = formatCepInput(field.value)
      if (formatted && formatted !== field.value) setNativeInputValue(field, formatted)
    }
    const onButton = () => void performLookup({ force: true })

    field.addEventListener('input', onInput)
    field.addEventListener('blur', onBlur)
    button.addEventListener('click', onButton)
    field.__yuisyncCepCleanup = () => {
      window.clearTimeout(timer)
      controller?.abort()
      field.removeEventListener('input', onInput)
      field.removeEventListener('blur', onBlur)
      button.removeEventListener('click', onButton)
      button.remove()
      status.remove()
      delete field.dataset.yuisyncCepEnhanced
      delete field.__yuisyncCepCleanup
    }
  })
}

function thermalizeTeamPrintWindow(printWindow) {
  const documentRef = printWindow?.document
  if (!documentRef?.body) return
  const text = normalizeText(documentRef.body.textContent)
  if (!/(comiss|historico de servicos|entregas|motodog)/.test(text)) return

  const style = documentRef.createElement('style')
  style.textContent = `
    @page { size: 80mm auto !important; margin: 0 !important; }
    * { box-sizing: border-box !important; }
    html, body { width: 80mm !important; max-width: 80mm !important; margin: 0 !important; padding: 0 !important; color: #000 !important; background: #fff !important; }
    body { font-family: Arial, Helvetica, sans-serif !important; padding: 3mm 2.5mm !important; font-size: 10px !important; }
    h1 { margin: 0 0 2mm !important; text-align: center !important; font-size: 14px !important; line-height: 1.15 !important; text-transform: uppercase !important; }
    .meta { margin: 0 0 2.5mm !important; border-top: 1px dashed #000 !important; border-bottom: 1px dashed #000 !important; padding: 1.5mm 0 !important; text-align: center !important; font-size: 9px !important; line-height: 1.3 !important; color: #000 !important; }
    table, thead, tbody, tfoot, tr, th, td { display: block !important; width: 100% !important; }
    thead { display: none !important; }
    table { border: 0 !important; border-collapse: separate !important; }
    tr { border: 0 !important; border-bottom: 1px dashed #000 !important; padding: 1.6mm 0 !important; page-break-inside: avoid !important; }
    td { display: flex !important; align-items: flex-start !important; justify-content: space-between !important; gap: 3mm !important; border: 0 !important; padding: .55mm 0 !important; text-align: right !important; white-space: normal !important; font-size: 9.5px !important; line-height: 1.25 !important; overflow-wrap: anywhere !important; }
    td::before { content: attr(data-label); min-width: 25mm; text-align: left; font-weight: 800; text-transform: uppercase; }
    tfoot tr { margin-top: 2mm !important; border: 2px solid #000 !important; padding: 1.5mm !important; }
    .money { text-align: right !important; white-space: nowrap !important; }
    .total { font-weight: 900 !important; }
    @media print { body { position: absolute !important; inset: 0 auto auto 0 !important; } }
  `
  documentRef.head.appendChild(style)

  documentRef.querySelectorAll('table').forEach((table) => {
    const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim())
    table.querySelectorAll('tbody tr, tfoot tr').forEach((row) => {
      ;[...row.querySelectorAll('td')].forEach((cell, index) => {
        cell.dataset.label = headers[index] || (cell.classList.contains('money') ? 'Valor' : 'Informacao')
      })
    })
  })
}

function installThermalPrintInterceptor() {
  if (window.__yuisyncThermalPrintInstalled) return () => {}
  window.__yuisyncThermalPrintInstalled = true
  const originalOpen = window.open.bind(window)

  window.open = (...args) => {
    const printWindow = originalOpen(...args)
    const features = String(args[2] || '')
    if (!printWindow || !features.includes('width=1080')) return printWindow

    const originalClose = printWindow.document.close.bind(printWindow.document)
    printWindow.document.close = () => {
      originalClose()
      thermalizeTeamPrintWindow(printWindow)
    }
    return printWindow
  }

  return () => {
    window.open = originalOpen
    delete window.__yuisyncThermalPrintInstalled
  }
}

function QuickClientModal({ onClose, onCreate, onCreated }) {
  const [form, setForm] = useState(QUICK_CLIENT_EMPTY)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [cepStatus, setCepStatus] = useState('')
  const [cepNonce, setCepNonce] = useState(0)
  const lastCepRef = useRef('')

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }))

  useEffect(() => {
    const cep = normalizeCep(form.zip_code)
    if (cep.length !== 8) {
      lastCepRef.current = ''
      setCepStatus('')
      return undefined
    }
    if (lastCepRef.current === cep && cepNonce === 0) return undefined

    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      lastCepRef.current = cep
      setCepStatus('Buscando endereco...')
      try {
        const address = await lookupBrazilianCep(cep, { signal: controller.signal })
        setForm((current) => ({
          ...current,
          zip_code: address.zip_code,
          owner_address: address.owner_address || current.owner_address,
          owner_neighborhood: address.owner_neighborhood || current.owner_neighborhood,
          owner_city: address.owner_city || current.owner_city,
        }))
        setCepStatus('Endereco preenchido pelo CEP.')
      } catch (lookupError) {
        if (!controller.signal.aborted) setCepStatus(lookupError?.message || 'Nao foi possivel consultar o CEP.')
      }
    }, cepNonce ? 0 : 220)

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [form.zip_code, cepNonce])

  async function submit() {
    if (!form.owner_name.trim()) return setError('Informe o nome do tutor.')
    if (!form.phone.trim()) return setError('Informe o telefone.')
    if (!form.pet_name.trim()) return setError('Informe o nome do pet.')

    setSaving(true)
    setError('')
    try {
      const created = await onCreate({
        owner_name: form.owner_name.trim(),
        phone: form.phone.trim(),
        pet_name: form.pet_name.trim(),
        species: form.species,
        zip_code: form.zip_code.trim(),
        owner_address: form.owner_address.trim(),
        address_number: form.address_number.trim(),
        owner_neighborhood: form.owner_neighborhood.trim(),
        owner_city: form.owner_city.trim(),
      })
      onCreated(created)
    } catch (createError) {
      setError(createError?.message || 'Nao foi possivel cadastrar o cliente.')
    } finally {
      setSaving(false)
    }
  }

  return createPortal(
    <div className="modal-overlay theme-petshop-modal" onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal-box max-w-2xl">
        <div className="modal-header">
          <div>
            <h2 className="font-display text-xl font-bold text-text">Novo cliente</h2>
            <p className="mt-1 text-xs text-muted">Cadastro rapido para continuar o agendamento.</p>
          </div>
          <button type="button" aria-label="Fechar cadastro rapido" onClick={onClose} className="text-muted hover:text-text"><X size={18}/></button>
        </div>
        <div className="modal-body space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="inp-label">Tutor</label><input className="inp" value={form.owner_name} onChange={(event) => setField('owner_name', event.target.value)} /></div>
            <div><label className="inp-label">Telefone</label><input className="inp" value={form.phone} onChange={(event) => setField('phone', event.target.value)} /></div>
            <div><label className="inp-label">Pet</label><input className="inp" value={form.pet_name} onChange={(event) => setField('pet_name', event.target.value)} /></div>
            <div><label className="inp-label">Especie</label><select className="inp" value={form.species} onChange={(event) => setField('species', event.target.value)}><option value="dog">Cao</option><option value="cat">Gato</option><option value="other">Outro</option></select></div>
            <div>
              <label className="inp-label">CEP</label>
              <div className="flex gap-2">
                <input className="inp min-w-0 flex-1" maxLength={9} value={form.zip_code} onChange={(event) => setField('zip_code', formatCepInput(event.target.value))} />
                <button type="button" aria-label="Buscar CEP" className="btn btn-secondary btn-icon" onClick={() => { lastCepRef.current = ''; setCepNonce((value) => value + 1) }}><Search size={14}/></button>
              </div>
              {cepStatus && <p className="mt-1 text-[10px] text-muted">{cepStatus}</p>}
            </div>
            <div><label className="inp-label">Numero</label><input className="inp" value={form.address_number} onChange={(event) => setField('address_number', event.target.value)} /></div>
            <div className="md:col-span-2"><label className="inp-label">Endereco</label><input className="inp" value={form.owner_address} onChange={(event) => setField('owner_address', event.target.value)} /></div>
            <div><label className="inp-label">Bairro</label><input className="inp" value={form.owner_neighborhood} onChange={(event) => setField('owner_neighborhood', event.target.value)} /></div>
            <div><label className="inp-label">Cidade</label><input className="inp" value={form.owner_city} onChange={(event) => setField('owner_city', event.target.value)} /></div>
          </div>
          {error && <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={submit}><Plus size={14}/> {saving ? 'Salvando...' : 'Salvar e selecionar'}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

export function PetshopOperationsEnhancer() {
  const { create } = useClients()
  const [quickClientOpen, setQuickClientOpen] = useState(false)
  const appointmentModalRef = useRef(null)

  useEffect(() => installThermalPrintInterceptor(), [])

  useEffect(() => {
    let frame = 0
    const enhance = () => {
      frame = 0
      enhanceCepFields(document)

      const appointmentModal = [...document.querySelectorAll('.modal-box')].find((box) => {
        const title = normalizeText(box.querySelector('h2')?.textContent)
        return title.includes('agendamento')
      })
      if (!appointmentModal) return
      appointmentModalRef.current = appointmentModal

      const clientLabel = [...appointmentModal.querySelectorAll('label')]
        .find((label) => normalizeText(label.textContent).includes('selecionar cliente e pet'))
      const actionRow = clientLabel?.parentElement
      if (!actionRow || actionRow.querySelector('[data-yuisync-quick-client]')) return

      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.yuisyncQuickClient = 'true'
      button.className = 'btn btn-primary btn-sm'
      button.innerHTML = '<span aria-hidden="true">+</span> Novo cliente'
      button.onclick = () => setQuickClientOpen(true)
      actionRow.appendChild(button)
    }

    const schedule = () => {
      if (frame) return
      frame = window.requestAnimationFrame(enhance)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    schedule()

    return () => {
      observer.disconnect()
      if (frame) window.cancelAnimationFrame(frame)
      document.querySelectorAll('input[data-yuisync-cep-enhanced="true"]').forEach((input) => input.__yuisyncCepCleanup?.())
      document.querySelectorAll('[data-yuisync-quick-client]').forEach((button) => button.remove())
    }
  }, [])

  const selectCreatedClient = (created) => {
    setQuickClientOpen(false)
    const modal = appointmentModalRef.current
    if (!modal || !created) return

    const openSearch = [...modal.querySelectorAll('button')]
      .find((button) => normalizeText(button.textContent).includes('buscar cliente ou pet'))
    openSearch?.click()

    window.setTimeout(() => {
      const search = modal.querySelector('input[aria-label="Buscar cliente ou pet"]')
      if (!search) return
      setNativeInputValue(search, created.owner_name || created.phone || created.pet_name || '')
      search.focus()

      window.setTimeout(() => {
        const expectedPet = normalizeText(created.pet_name)
        const expectedOwner = normalizeText(created.owner_name)
        const option = [...modal.querySelectorAll('[role="listbox"][aria-label="Resultados de clientes"] button')]
          .find((button) => {
            const text = normalizeText(button.textContent)
            return (!expectedOwner || text.includes(expectedOwner)) && (!expectedPet || text.includes(expectedPet))
          })
        option?.click()
      }, 700)
    }, 80)
  }

  return quickClientOpen
    ? <QuickClientModal onClose={() => setQuickClientOpen(false)} onCreate={create} onCreated={selectCreatedClient} />
    : null
}

export default PetshopOperationsEnhancer
