import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CalendarClock, PawPrint, ShieldAlert, Star } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const toDateTime = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export default function PublicClientPortalPage() {
  const { token = '' } = useParams()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [snapshot, setSnapshot] = useState(null)

  async function loadSnapshot() {
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('get_petshop_portal_snapshot', {
        p_token: token,
      })
      if (rpcError) throw rpcError
      setSnapshot(data || null)
    } catch (err) {
      setError(err.message || 'Nao foi possivel abrir o portal.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSnapshot()
  }, [token])

  return (
    <div className="h-screen overflow-y-auto overflow-x-hidden bg-[#07080D] text-white px-5 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link to="/site" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white">
          <ArrowLeft size={14} />
          Voltar ao inicio
        </Link>

        {loading ? (
          <div className="rounded-3xl border border-white/10 bg-[#11131a] p-8 text-center text-sm text-white/70">
            Carregando portal do cliente...
          </div>
        ) : error ? (
          <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 text-sm text-red-200 flex items-center gap-2">
            <ShieldAlert size={15} />
            {error}
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-white/10 bg-[#11131a] p-6 space-y-3">
              <div className="w-11 h-11 rounded-xl bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 flex items-center justify-center">
                <PawPrint size={20} />
              </div>
              <h1 className="text-3xl font-display font-black">{snapshot?.pet_name || 'Portal do Pet'}</h1>
              <p className="text-sm text-white/75">
                Tutor: <span className="text-white">{snapshot?.owner_name || '-'}</span>
              </p>
              <p className="text-sm text-white/70">
                Contato: {snapshot?.phone || '-'} {snapshot?.email ? `• ${snapshot.email}` : ''}
              </p>
              <p className="inline-flex items-center gap-2 text-xs text-emerald-300 uppercase tracking-[0.16em]">
                <Star size={12} />
                Saldo fidelidade: {Number(snapshot?.loyalty_balance || 0)} pts
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-4">
              <h2 className="font-display font-bold text-xl flex items-center gap-2">
                <CalendarClock size={17} className="text-sky-300" />
                Proximos agendamentos
              </h2>
              <div className="space-y-2">
                {(snapshot?.next_appointments || []).map((appointment, index) => (
                  <div key={`${appointment.scheduled_at}-${index}`} className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm">
                    <p className="text-white font-semibold">{appointment.service_type || 'Servico'}</p>
                    <p className="text-white/70">{toDateTime(appointment.scheduled_at)}</p>
                    <p className="text-xs text-emerald-300 uppercase tracking-[0.14em] mt-1">{appointment.status || '-'}</p>
                  </div>
                ))}
                {(!snapshot?.next_appointments || snapshot.next_appointments.length === 0) && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/70">
                    Nenhum agendamento futuro encontrado.
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
