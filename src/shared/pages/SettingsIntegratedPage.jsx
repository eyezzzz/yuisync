import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Image as ImageIcon, Save, Trash2, Upload } from 'lucide-react'
import SettingsPage from './SettingsPage'
import { useAuthCtx } from '../../context/AuthContext'
import { useModuleCtx } from '../../context/ModuleContext'
import { supabase } from '../../lib/supabase'
import { buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const normalizeText = (value = '') => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Nao foi possivel ler a imagem.'))
    reader.readAsDataURL(file)
  })
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('O arquivo selecionado nao e uma imagem valida.'))
    image.src = dataUrl
  })
}

async function prepareThermalLogo(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('Selecione uma imagem PNG, JPG ou WEBP.')
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error('A imagem deve ter no maximo 5 MB.')
  }

  const source = await readFileAsDataUrl(file)
  const image = await loadImage(source)
  const maxWidth = 640
  const maxHeight = 220
  const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height)
  const width = Math.max(1, Math.round(image.width * scale))
  const height = Math.max(1, Math.round(image.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('O navegador nao conseguiu preparar a imagem.')

  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.drawImage(image, 0, 0, width, height)

  const imageData = context.getImageData(0, 0, width, height)
  const pixels = imageData.data
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3] / 255
    const red = pixels[index] * alpha + 255 * (1 - alpha)
    const green = pixels[index + 1] * alpha + 255 * (1 - alpha)
    const blue = pixels[index + 2] * alpha + 255 * (1 - alpha)
    const luminance = red * 0.299 + green * 0.587 + blue * 0.114
    const monochrome = luminance >= 176 ? 255 : 0
    pixels[index] = monochrome
    pixels[index + 1] = monochrome
    pixels[index + 2] = monochrome
    pixels[index + 3] = 255
  }
  context.putImageData(imageData, 0, 0)

  const result = canvas.toDataURL('image/png')
  if (result.length > 700_000) {
    throw new Error('A logo ficou muito grande. Use uma imagem com menos detalhes.')
  }
  return result
}

function ReceiptLogoSettings() {
  const auth = useAuthCtx()
  const { activeModuleId } = useModuleCtx()
  const [target, setTarget] = useState(null)
  const [logo, setLogo] = useState('')
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const fileRef = useRef(null)

  useEffect(() => {
    setLogo(String(auth.storeSettings?.receipt_logo_data_url || ''))
  }, [auth.storeSettings?.receipt_logo_data_url, auth.activeTenantId])

  useEffect(() => {
    if (activeModuleId !== 'petshop') {
      setTarget(null)
      return undefined
    }

    let frame = 0
    const syncTarget = () => {
      frame = 0
      const heading = [...document.querySelectorAll('h3')].find((item) => (
        normalizeText(item.textContent).includes('impressao termica')
      ))
      const card = heading?.parentElement?.querySelector('.bg-card')
      if (!card) {
        setTarget(null)
        return
      }

      let next = card.querySelector('[data-yuisync-receipt-logo-settings]')
      if (!next) {
        next = document.createElement('div')
        next.dataset.yuisyncReceiptLogoSettings = 'true'
        next.className = 'border-t border-white/5 pt-6'
        card.appendChild(next)
      }
      setTarget((current) => current === next ? current : next)
    }

    const schedule = () => {
      if (frame) cancelAnimationFrame(frame)
      frame = requestAnimationFrame(syncTarget)
    }

    syncTarget()
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => {
      if (frame) cancelAnimationFrame(frame)
      observer.disconnect()
      document.querySelector('[data-yuisync-receipt-logo-settings]')?.remove()
    }
  }, [activeModuleId])

  const handleFile = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setProcessing(true)
    setMessage({ type: '', text: '' })
    try {
      const prepared = await prepareThermalLogo(file)
      setLogo(prepared)
      setMessage({ type: 'success', text: 'Preview preparado. Salve para aplicar nas impressoes.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nao foi possivel preparar a logo.' })
    } finally {
      setProcessing(false)
    }
  }

  const saveLogo = async () => {
    if (!auth.activeTenantId) {
      setMessage({ type: 'error', text: 'Nenhum tenant ativo foi identificado.' })
      return
    }

    setSaving(true)
    setMessage({ type: '', text: '' })
    try {
      const response = await runWithTenantFallback(auth.activeTenantId, async (includeTenant) => {
        const row = buildTenantPayload({
          module_id: 'petshop',
          receipt_logo_data_url: logo || null,
          updated_at: new Date().toISOString(),
        }, auth.activeTenantId, includeTenant)
        const conflict = includeTenant ? 'tenant_id,module_id' : 'module_id'
        return supabase
          .from('settings')
          .upsert(row, { onConflict: conflict })
          .select('receipt_logo_data_url')
          .single()
      })
      if (response.error) throw response.error
      await auth.refreshSettings('petshop')
      setMessage({ type: 'success', text: logo ? 'Logo salva para as impressoes termicas.' : 'Logo removida das impressoes.' })
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Nao foi possivel salvar a logo.' })
    } finally {
      setSaving(false)
    }
  }

  if (!target) return null

  return createPortal(
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon size={16} className="text-emerald-400" />
        <div>
          <h4 className="font-bold text-text">Logo da impressao</h4>
          <p className="text-xs text-muted">Substitui o cabecalho de texto. A imagem e reduzida e convertida para preto e branco.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex flex-wrap content-start gap-3">
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleFile} />
          <button
            type="button"
            className="btn btn-secondary gap-2"
            disabled={processing || saving}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={14}/>
            {processing ? 'Preparando...' : 'Enviar arquivo'}
          </button>
          <button
            type="button"
            className="btn btn-secondary gap-2"
            disabled={!logo || processing || saving}
            onClick={() => {
              setLogo('')
              setMessage({ type: '', text: '' })
            }}
          >
            <Trash2 size={14}/> Remover
          </button>
          <button
            type="button"
            className="btn btn-primary gap-2"
            disabled={processing || saving}
            onClick={saveLogo}
          >
            <Save size={14}/>
            {saving ? 'Salvando...' : 'Salvar logo'}
          </button>
          <p className="w-full text-[11px] text-muted">Use preferencialmente PNG com fundo branco ou transparente. Limite: 5 MB.</p>
        </div>

        <div className="flex min-h-[112px] items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white p-4">
          {logo ? (
            <img src={logo} alt="Preview da logo termica" className="max-h-24 max-w-full object-contain" />
          ) : (
            <div className="text-center text-xs font-bold uppercase tracking-widest text-gray-500">Sem logo configurada</div>
          )}
        </div>
      </div>

      {message.text && (
        <p className={`rounded-xl border px-3 py-2 text-xs font-semibold ${message.type === 'success' ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300' : 'border-red-500/20 bg-red-500/10 text-red-300'}`}>
          {message.text}
        </p>
      )}
    </div>,
    target,
  )
}

export default function SettingsIntegratedPage() {
  return (
    <>
      <SettingsPage />
      <ReceiptLogoSettings />
    </>
  )
}
