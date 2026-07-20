import { Dog, Cat, Bird, Ghost, Fish, PawPrint } from 'lucide-react'
import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useModuleCtx } from '../../context/ModuleContext'
import { useAuthCtx } from '../../context/AuthContext'
import { applyTenantFilter, buildTenantPayload, runWithTenantFallback } from '../../lib/tenant'

const BASE_SELECT = 'id, module_id, type, name, document, phone, email, address, neighborhood, city, notes, active, details, created_at'
const CLIENT_PAGE_SIZE = 1000

async function fetchAllClientPages(buildQuery) {
  const rows = []
  for (let from = 0; ; from += CLIENT_PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + CLIENT_PAGE_SIZE - 1)
    if (error) return { data: null, error }
    rows.push(...(data || []))
    if (!data || data.length < CLIENT_PAGE_SIZE) break
  }
  return { data: rows, error: null }
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
  tutor_birth_date: c.details?.tutor_birth_date || '',
  zip_code: c.details?.zip_code || '',
  address_number: c.details?.address_number || '',
  address_reference: c.details?.address_reference || '',
  registration_status: c.details?.registration_status || inferRegistrationStatus(c),
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
    tutor_birth_date: p.tutor_birth_date || null,
    zip_code: p.zip_code || null,
    address_number: p.address_number || null,
    address_reference: p.address_reference || null,
    registration_status: p.registration_status || inferRegistrationStatus({
      document: p.owner_cpf,
      address: p.owner_address,
      neighborhood: p.owner_neighborhood,
      details: {
        tutor_birth_date: p.tutor_birth_date,
        zip_code: p.zip_code,
        address_number: p.address_number,
        address_reference: p.address_reference,
        pet_name: p.pet_name,
        breed: p.breed,
      },
    }),
  }
})

function inferRegistrationStatus(client = {}) {
  const details = client.details || {}
  if (!client.address || !client.neighborhood) return 'sem_endereco'
  if (!client.document) return 'sem_cpf'
  if (!details.tutor_birth_date || !details.zip_code || !details.address_number || !details.address_reference) return 'pendente'
  return 'completo'
}

const sanitizeSearch = (value = '') =>
  String(value || '').replace(/[%,()]/g, ' ').replace(/\s+/g, ' ').trim()

const isSearchFilterError = (error) => {
  const message = String(error?.message || '').toLowerCase()
  return message.includes('failed to parse')
    || message.includes('logic tree')
    || message.includes('unexpected')
    || message.includes('operator')
}

const applyClientSearch = (query, term, includePetFields = true) => {
  if (!term) return query
  const filters = [
    `name.ilike.%${term}%`,
    `phone.ilike.%${term}%`,
    `email.ilike.%${term}%`,
  ]
  if (includePetFields) {
    filters.push(
      `details->>pet_name.ilike.%${term}%`,
      `details->>breed.ilike.%${term}%`,
    )
  }
  return query.or(filters.join(','))
}

const normalizeSpecies = (value) => {
  const species = String(value || '').toLowerCase()
  return ['dog', 'cat', 'bird', 'rabbit', 'fish', 'other'].includes(species) ? species : 'other'
}

async function syncPetRecord(client, moduleId) {
  if (moduleId !== 'petshop' || !client?.id) return

  const payload = {
    id: client.id,
    module_id: moduleId,
    owner_name: client.owner_name || 'Cliente',
    owner_cpf: client.owner_cpf || null,
    phone: client.phone || 'sem telefone',
    email: client.email || null,
    owner_address: client.owner_address || null,
    owner_neighborhood: client.owner_neighborhood || null,
    owner_city: client.owner_city || null,
    pet_name: client.pet_name || client.owner_name || 'Pet',
    species: normalizeSpecies(client.species),
    breed: client.breed || null,
    birth_date: client.birth_date || null,
    weight_kg: client.weight_kg || null,
    color: client.color || null,
    notes: client.notes || null,
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from('pets').upsert(payload, { onConflict: 'id' })
  if (error) throw error
}

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
      const term = sanitizeSearch(search)
      const runSearch = (includePetFields = true) => runWithTenantFallback(activeTenantId, async (includeTenant) => {
        return fetchAllClientPages(() => {
          let q = supabase.from('clients').select(BASE_SELECT)
            .eq('module_id', activeModuleId)
            .order('name')

          q = applyTenantFilter(q, activeTenantId, includeTenant)
          return applyClientSearch(q, term, includePetFields)
        })
      })

      let response = await runSearch(true)
      if (response.error && term && isSearchFilterError(response.error)) {
        response = await runSearch(false)
      }

      if (response.error) throw response.error
      setClients((response.data || []).map(mapClientToPet))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [activeModuleId, activeTenantId])

  const search = useCallback(async (searchTerm = '', options = {}) => {
    if (!activeModuleId || !activeTenantId) return []
    const term = sanitizeSearch(searchTerm)
    if (!term) return []
    const limit = Math.min(50, Math.max(1, Number(options.limit || 20)))

    const runSearch = (includePetFields = true) => runWithTenantFallback(activeTenantId, async (includeTenant) => {
      let query = supabase
        .from('clients')
        .select(BASE_SELECT)
        .eq('module_id', activeModuleId)
        .order('name')
        .limit(limit)

      query = applyTenantFilter(query, activeTenantId, includeTenant)
      return applyClientSearch(query, term, includePetFields)
    })

    let response = await runSearch(true)
    if (response.error && isSearchFilterError(response.error)) {
      response = await runSearch(false)
    }
    if (response.error) throw response.error
    return (response.data || []).map(mapClientToPet)
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
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar o cliente.')
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
    await syncPetRecord(newPet, activeModuleId)
    setClients(prev => [newPet, ...prev])
    return newPet
  }, [activeModuleId, activeTenantId])

  const update = useCallback(async (id, payload) => {
    if (!activeTenantId) throw new Error('Selecione uma empresa ativa antes de salvar o cliente.')
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
    await syncPetRecord(updatedPet, activeModuleId)
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

  return { clients, loading, error, load, search, getById, create, update, remove, speciesIcon, age }
}
