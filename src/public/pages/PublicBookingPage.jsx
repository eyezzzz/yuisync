import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, CheckCircle2, PawPrint, Send, ShieldAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function PublicBookingPage() {
  const { slug = '' } = useParams()
  const [form, setForm] = useState({
    customer_name: '',
    pet_name: '',
    phone: '',
    service_interest: '',
    preferred_date: '',
    preferred_period: 'manha',
    transport_mode: 'dropoff',
    need_motodog: false,
    pickup_address: '',
    pickup_neighborhood: '',
    pickup_city: '',
    notes: '',
  })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    setSending(true)
    setError('')
    setSuccess('')

    try {
      const payload = {
        p_slug: slug,
        p_customer_name: form.customer_name.trim(),
        p_pet_name: form.pet_name.trim() || null,
        p_phone: form.phone.trim() || null,
        p_service_interest: form.service_interest.trim() || null,
        p_preferred_date: form.preferred_date || null,
        p_preferred_period: form.preferred_period || null,
        p_transport_mode: form.transport_mode || 'dropoff',
        p_need_motodog: form.transport_mode === 'pickup',
        p_pickup_address: form.transport_mode === 'pickup' ? (form.pickup_address.trim() || null) : null,
        p_pickup_neighborhood: form.transport_mode === 'pickup' ? (form.pickup_neighborhood.trim() || null) : null,
        p_pickup_city: form.transport_mode === 'pickup' ? (form.pickup_city.trim() || null) : null,
        p_notes: form.notes.trim() || null,
        p_channel: 'site',
      }

      if (!payload.p_customer_name) {
        throw new Error('Informe seu nome para continuar.')
      }

      const { error: rpcError } = await supabase.rpc('create_petshop_booking_request', payload)
      if (rpcError) throw rpcError

      setForm({
        customer_name: '',
        pet_name: '',
        phone: '',
        service_interest: '',
        preferred_date: '',
        preferred_period: 'manha',
        transport_mode: 'dropoff',
        need_motodog: false,
        pickup_address: '',
        pickup_neighborhood: '',
        pickup_city: '',
        notes: '',
      })
      setSuccess('Solicitacao enviada com sucesso. Em breve nossa equipe entra em contato.')
    } catch (err) {
      setError(err.message || 'Nao foi possivel enviar sua solicitacao agora.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-[#07080D] text-white px-5 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/site" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={14} />
          Voltar ao inicio
        </Link>

        <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6 space-y-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 flex items-center justify-center">
            <PawPrint size={20} />
          </div>
          <h1 className="text-3xl font-display font-black">Agendamento online</h1>
          <p className="text-sm text-white/75 leading-relaxed">
            Preencha os dados para solicitar seu horario. Nosso time confirma por WhatsApp.
          </p>
          <p className="text-xs text-emerald-300 uppercase tracking-[0.16em]">
            link da agenda: {slug}
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-center gap-2">
            <ShieldAlert size={14} />
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200 flex items-center gap-2">
            <CheckCircle2 size={14} />
            {success}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="inp-label">Seu nome *</label>
              <input
                className="inp"
                value={form.customer_name}
                onChange={(event) => setForm((prev) => ({ ...prev, customer_name: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="inp-label">Telefone</label>
              <input
                className="inp"
                value={form.phone}
                onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              />
            </div>
            <div>
              <label className="inp-label">Nome do pet</label>
              <input
                className="inp"
                value={form.pet_name}
                onChange={(event) => setForm((prev) => ({ ...prev, pet_name: event.target.value }))}
              />
            </div>
            <div>
              <label className="inp-label">Servico desejado</label>
              <input
                className="inp"
                value={form.service_interest}
                onChange={(event) => setForm((prev) => ({ ...prev, service_interest: event.target.value }))}
                placeholder="Banho, tosa, consulta..."
              />
            </div>
            <div>
              <label className="inp-label">Data preferencial</label>
              <input
                className="inp"
                type="date"
                value={form.preferred_date}
                onChange={(event) => setForm((prev) => ({ ...prev, preferred_date: event.target.value }))}
              />
            </div>
            <div>
              <label className="inp-label">Periodo</label>
              <select
                className="inp"
                value={form.preferred_period}
                onChange={(event) => setForm((prev) => ({ ...prev, preferred_period: event.target.value }))}
              >
                <option value="manha">Manha</option>
                <option value="tarde">Tarde</option>
                <option value="noite">Noite</option>
              </select>
            </div>
            <div>
              <label className="inp-label">Como sera o atendimento?</label>
              <select
                className="inp"
                value={form.transport_mode}
                onChange={(event) => setForm((prev) => ({
                  ...prev,
                  transport_mode: event.target.value,
                  need_motodog: event.target.value === 'pickup',
                }))}
              >
                <option value="dropoff">Vou levar ate o PetShop</option>
                <option value="pickup">Preciso de MotoDog</option>
              </select>
            </div>
          </div>

          {form.need_motodog && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <p className="md:col-span-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-100">
                A taxa do MotoDog sera calculada pelo PetShop conforme a opcao configurada.
              </p>
              <div>
                <label className="inp-label">Cidade</label>
                <input
                  className="inp"
                  value={form.pickup_city}
                  onChange={(event) => setForm((prev) => ({ ...prev, pickup_city: event.target.value }))}
                />
              </div>
              <div>
                <label className="inp-label">Bairro</label>
                <input
                  className="inp"
                  value={form.pickup_neighborhood}
                  onChange={(event) => setForm((prev) => ({ ...prev, pickup_neighborhood: event.target.value }))}
                />
              </div>
              <div>
                <label className="inp-label">Endereco completo</label>
                <input
                  className="inp"
                  value={form.pickup_address}
                  onChange={(event) => setForm((prev) => ({ ...prev, pickup_address: event.target.value }))}
                  placeholder="Rua, numero e complemento"
                />
              </div>
            </div>
          )}

          <div>
            <label className="inp-label">Observacoes</label>
            <textarea
              className="inp h-24 resize-none"
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              placeholder="Ex.: pet idoso, alergias, horarios preferenciais..."
            />
          </div>

          <button type="submit" className="btn btn-primary w-full justify-center" disabled={sending}>
            {sending ? <CalendarClock size={15} className="animate-spin" /> : <Send size={15} />}
            {sending ? 'Enviando...' : 'Solicitar agendamento'}
          </button>
        </form>
      </div>
    </div>
  )
}
