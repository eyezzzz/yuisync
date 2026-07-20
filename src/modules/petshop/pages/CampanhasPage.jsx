import { useEffect, useState } from 'react'
import { Eye, Megaphone, RefreshCw, ShieldAlert, Users } from 'lucide-react'
import { usePetshopAdvanced, CAMPAIGN_TEMPLATES } from '../hooks/usePetshopAdvanced'

export default function CampanhasPage() {
  const { loadCampaignAudience } = usePetshopAdvanced()
  const [selectedCampaign, setSelectedCampaign] = useState('sumiram')
  const [audience, setAudience] = useState([])
  const [customMessage, setCustomMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [summary, setSummary] = useState({})

  async function loadSummary() {
    const entries = await Promise.all(
      Object.keys(CAMPAIGN_TEMPLATES).map(async (campaignId) => {
        const data = await loadCampaignAudience(campaignId)
        return [campaignId, data.length]
      })
    )

    setSummary(Object.fromEntries(entries))
  }

  async function reloadAudience(campaignId = selectedCampaign) {
    setLoading(true)
    setError('')
    try {
      const audienceData = await loadCampaignAudience(campaignId)
      setAudience(audienceData)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
    reloadAudience(selectedCampaign)
  }, [])

  useEffect(() => {
    reloadAudience(selectedCampaign)
  }, [selectedCampaign])

  function handlePreparePreview() {
    setSuccess(`Preparacao salva no modo visual. Nenhum cliente recebeu mensagem em ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`)
  }

  const template = CAMPAIGN_TEMPLATES[selectedCampaign]

  return (
    <div className="page animate-fade-up space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Megaphone size={22} className="text-amber-400" />
            Campanhas de Reengajamento
          </h1>
          <p className="page-sub">Audiencias prontas para recuperar receita e ativar a carteira.</p>
        </div>
        <button onClick={() => { loadSummary(); reloadAudience(selectedCampaign) }} className="btn btn-secondary">
          <RefreshCw size={15} /> Atualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.values(CAMPAIGN_TEMPLATES).map((campaign) => (
          <button
            key={campaign.id}
            onClick={() => setSelectedCampaign(campaign.id)}
            className={`bg-card border rounded-2xl p-5 text-left transition-colors ${
              selectedCampaign === campaign.id ? 'border-amber-400/40' : 'border-[var(--border)]'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-display font-bold text-lg text-text">{campaign.label}</p>
              <span className="badge badge-amber">{summary[campaign.id] || 0}</span>
            </div>
            <p className="text-sm text-muted">{campaign.audienceName}</p>
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 px-5 py-4">
        <p className="text-sm font-semibold text-text">Modo preparatorio ativo</p>
        <p className="text-sm text-muted mt-1">
          Esta aba ficou somente para planejamento visual. Nao disparamos mensagens, nao enfileiramos WhatsApp e nao gravamos campanhas reais para clientes por aqui.
        </p>
      </div>

      {error && (
        <p role="alert" className="text-sm rounded-xl px-4 py-3 bg-red-500/10 text-red-400 border border-red-500/20 flex items-center gap-2">
          <ShieldAlert size={14} /> {error}
        </p>
      )}

      {success && (
        <p className="text-sm rounded-xl px-4 py-3 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          {success}
        </p>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-[380px_1fr] gap-6">
        <div className="bg-card border border-[var(--border)] rounded-2xl p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Eye size={16} className="text-emerald-400" />
            <h2 className="section-title">Preparacao visual</h2>
          </div>

          <div>
            <label className="inp-label">Campanha ativa</label>
            <input aria-label="Campanha ativa" className="inp" value={template.label} readOnly />
          </div>

          <div>
            <label className="inp-label">Mensagem personalizada</label>
            <textarea
              aria-label="Mensagem personalizada"
              className="inp h-36 resize-none p-4"
              placeholder={template.buildMessage({ owner_name: 'Tutor', pet_name: 'Pet' })}
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
            />
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-white/5 p-4 space-y-2">
            <p className="text-xs uppercase tracking-widest text-muted font-bold">O que esta sendo preparado</p>
            <p className="text-sm text-text">{customMessage.trim() || template.buildMessage({ owner_name: 'Tutor', pet_name: 'Pet' })}</p>
            <p className="text-xs text-muted">{audience.length} contatos elegiveis hoje.</p>
          </div>

          <button onClick={handlePreparePreview} disabled={!audience.length} className="btn btn-primary w-full justify-center">
            <Eye size={15} /> Marcar como pronto para revisao
          </button>
        </div>

        <div className="space-y-6">
          <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border2)]">
              <h2 className="section-title">Publico alvo</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Pet / Tutor</th>
                    <th>Telefone</th>
                    <th>Ultima visita</th>
                  </tr>
                </thead>
                <tbody>
                  {audience.map((client) => (
                    <tr key={client.id}>
                      <td>
                        <p className="font-semibold text-text">{client.pet_name || client.owner_name}</p>
                        <p className="text-xs text-muted">{client.owner_name}</p>
                      </td>
                      <td>{client.phone || '-'}</td>
                      <td>{client.last_visit_at ? new Date(client.last_visit_at).toLocaleDateString('pt-BR') : 'Sem historico'}</td>
                    </tr>
                  ))}
                  {!audience.length && !loading && (
                    <tr>
                      <td colSpan={3} className="text-center text-muted py-10">Nenhum contato elegivel agora.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-card border border-[var(--border)] rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border2)]">
              <h2 className="section-title">Checklist antes de liberar no futuro</h2>
            </div>
            <div className="p-5 space-y-3 text-sm">
              <div className="rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-text">
                1. Confirmar texto, oferta e janela de envio.
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-text">
                2. Revisar o publico elegivel para evitar contatos fora do momento certo.
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-white/5 px-4 py-3 text-text">
                3. Validar com o time se a campanha vai virar disparo real em outra etapa.
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-amber-400">
                Nenhum cliente recebe mensagem desta tela nesta versao.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
