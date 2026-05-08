import { Dog, Cat, Bird, Ghost, Fish, PawPrint } from 'lucide-react'
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const BASE_SELECT = 'id, module_id, type, name, document, phone, email, address, neighborhood, city, notes, active, details, created_at'

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
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const { activeModuleId }      = useModuleCtx()
  const { activeTenantId }      = useAuthCtx()

  const load = useCallback(async (search = '') => {
    if (!activeModuleId) return
    setLoading(true); setError(null)
    try {
      const { data, error: err } = await runWithTenantFallback(activeTenantId, async (includeTenant) => {
        let q = supabase.from('clients').select(BASE_SELECT)
          .eq('module_id', activeModuleId)
          .order('name')

        q = applyTenantFilter(q, activeTenantId, includeTenant)
        if (search) q = q.or(`name.ilike.%${search}%,phone.ilike.%${search}%`)
        return q
      })

      if (err) throw err
      setClients((data || []).map(mapClientToPet))
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
  }, [activeModuleId, activeTenantId])

  const speciesIcon = (s) => ({
    dog:Dog, cat:Cat, bird:Bird, rabbit:Ghost, fish:Fish, other:PawPrint
  }[s] || PawPrint)

  const age = (birthDate) => {
    if (!birthDate) return null
    const months = Math.floor((Date.now() - new Date(birthDate)) / (1000*60*60*24*30.44))
    return months < 12 ? `${months}m` : `${Math.floor(months/12)}a`
  }

  return { clients, loading, error, load, getById, create, update, remove, speciesIcon, age }
}
