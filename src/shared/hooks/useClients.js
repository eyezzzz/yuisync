import { Dog, Cat, Bird, Ghost, Fish, PawPrint } from 'lucide-react'
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const BASE_SELECT = 'id, module_id, type, name, document, phone, email, address, neighborhood, city, notes, active, details, created_at'

function isClientSearchRpcMissing(error) {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('function') && (
    message.includes('search_petshop_clients')
    || message.includes('does not exist')
    || message.includes('schema cache')
  )
}

const mapClientToPet = (c) => ({
  id: c.id,
  owner_name: c.name || '',
  owner_cpf: c.document || '',
  phone: c.phone || '',
  email: c.email || '',
  owner_address: c.address || '',
  owner_neighborhood: c.neighborhood || '',
  owner_city: c.city || '',
  notes: c.notes || '',
  created_at: c.created_at,
  pet_name: c.details?.pet_name || '',
  species: c.details?.species || 'other',
  breed: c.details?.breed || '',
  birth_date: c.details?.birth_date || null,
  weight_kg: c.details?.weight_kg || null,
  color: c.details?.color || '',
})

const mapPetToClient = (p, moduleId) => ({
  module_id: moduleId,
  type: moduleId === 'petshop' ? 'pet' : 'company',
  name: p.owner_name || 'Desconhecido',
  document: p.owner_cpf || null,
  phone: p.phone || null,
  email: p.email || null,
  address: p.owner_address || null,
  neighborhood: p.owner_neighborhood || null,
  city: p.owner_city || null,
  notes: p.notes || null,
  details: {
    pet_name: p.pet_name || null,
    species: p.species || null,
    breed: p.breed || null,
    birth_date: p.birth_date || null,
    weight_kg: p.weight_kg || null,
    color: p.color || null,
  }
})

export function useClients() {
  const [clients, setClients]   = useState([])
  const [clientTotal, setClientTotal] = useState(0)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const { activeModuleId }      = useModuleCtx()
  const { activeTenantId }      = useAuthCtx()

  const load = useCallback(async (options = '') => {
    if (!activeModuleId) return
    const filters = typeof options === 'string' ? { search: options } : (options || {})
    setLoading(true); setError(null)
    try {
      if (filters.paginated) {
        try {
          const page = Math.max(1, Number(filters.page || 1))
          const pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 1), 200)
          const { data, error: rpcError } = await supabase.rpc('search_petshop_clients', {
            p_tenant_id: activeTenantId || null,
            p_module_id: activeModuleId,
            p_search: filters.search || null,
            p_species: filters.species || null,
            p_plan_status: filters.planStatus || null,
            p_limit: pageSize,
            p_offset: (page - 1) * pageSize,
          })

          if (rpcError) throw rpcError

          const rows = data || []
          const mapped = rows.map(({ total_count, ...client }) => mapClientToPet(client))
          setClients(mapped)
          setClientTotal(Number(rows[0]?.total_count || 0))
          return { data: mapped, total: Number(rows[0]?.total_count || 0) }
        } catch (rpcError) {
          if (!isClientSearchRpcMissing(rpcError)) throw rpcError
          console.warn('RPC de clientes nao aplicada; usando fallback legado.', rpcError)
        }
      }

      const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let q = supabase.from('clients').select(BASE_SELECT)
          .eq('module_id', activeModuleId)
          .order('name')

        q = applyTenantFilter(q, activeTenantId, includeTenant)
        if (filters.search) q = q.or(`name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`)
        return q
      })

      if (err) throw err
      let mapped = (data || []).map(mapClientToPet)
      if (filters.species) mapped = mapped.filter((pet) => pet.species === filters.species)
      const total = mapped.length
      if (filters.paginated) {
        const page = Math.max(1, Number(filters.page || 1))
        const pageSize = Math.min(Math.max(Number(filters.pageSize || 50), 1), 200)
        const from = (page - 1) * pageSize
        mapped = mapped.slice(from, from + pageSize)
      }
      setClients(mapped)
      setClientTotal(total)
      return { data: mapped, total }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  const getById = useCallback(async (id) => {
    const { data } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('clients')
        .select(`${BASE_SELECT}, appointments(id,service_type,scheduled_at,status)`)
        .eq('id', id)
        .eq('module_id', activeModuleId)
        .single()

      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })
    
    if (!data) return null;
    const petData = mapClientToPet(data);
    petData.appointments = data.appointments;
    return petData;
  }, [activeModuleId, activeTenantId])

  const create = useCallback(async (payload) => {
    const clientPayload = mapPetToClient(payload, activeModuleId)
    const { data, error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      const payloadWithTenant = buildTenantPayload(clientPayload, activeTenantId, includeTenant)
      return supabase
        .from('clients')
        .insert(payloadWithTenant)
        .select(BASE_SELECT)
        .single()
    })

    if (error) throw error
    const newPet = mapClientToPet(data)
    setClients(prev => [newPet, ...prev])
    setClientTotal(prev => prev + 1)
    return newPet
  }, [activeModuleId, activeTenantId])

  const update = useCallback(async (id, payload) => {
    const clientPayload = mapPetToClient(payload, activeModuleId)
    // Avoid updating module_id
    delete clientPayload.module_id; 

    const { data, error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase
        .from('clients')
        .update(clientPayload)
        .eq('id', id)
        .eq('module_id', activeModuleId)
        .select(BASE_SELECT)
        .single()

      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    if (error) throw error
    const updatedPet = mapClientToPet(data)
    setClients(prev => prev.map(p => p.id === id ? updatedPet : p))
    return updatedPet
  }, [activeModuleId, activeTenantId])

  const remove = useCallback(async (id) => {
    const { error } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let q = supabase.from('clients').delete().eq('id', id).eq('module_id', activeModuleId)
      q = applyTenantFilter(q, activeTenantId, includeTenant)
      return q
    })

    if (error) throw error
    setClients(prev => prev.filter(p => p.id !== id))
    setClientTotal(prev => Math.max(0, prev - 1))
  }, [activeModuleId, activeTenantId])

  const speciesIcon = (s) => ({
    dog:Dog, cat:Cat, bird:Bird, rabbit:Ghost, fish:Fish, other:PawPrint
  }[s] || PawPrint)

  const age = (birthDate) => {
    if (!birthDate) return null
    const months = Math.floor((Date.now() - new Date(birthDate)) / (1000*60*60*24*30.44))
    return months < 12 ? `${months}m` : `${Math.floor(months/12)}a`
  }

  return { clients, clientTotal, loading, error, load, getById, create, update, remove, speciesIcon, age }
}
