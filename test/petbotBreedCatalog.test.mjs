import assert from 'node:assert/strict'
import test from 'node:test'

import {
  COMMON_PET_BREED_CLASSIFICATIONS,
  PETBOT_COAT_TYPES,
  buildServiceBreedPreset,
  classifyCommonPetBreed,
  commonBreedAliasesForCoatType,
  commonCanonicalBreedsForCoatType,
  inferServiceCoatType,
} from '../shared/petbotBreedCatalog.js'

test('normaliza aliases brasileiros para uma unica raca canonica', () => {
  assert.deepEqual(classifyCommonPetBreed('lulu-da-pomerânia'), {
    canonical: 'Spitz Alemão', species: 'dog', coat_type: 'duplo', ambiguous: false, classification_version: 3,
  })
  assert.equal(classifyCommonPetBreed('York')?.canonical, 'Yorkshire Terrier')
  assert.equal(classifyCommonPetBreed('shihtzu')?.canonical, 'Shih Tzu')
  assert.equal(classifyCommonPetBreed('Frenchie')?.coat_type, 'curto')
})

test('usa uma classe padrao por raca e respeita variedade explicitamente informada', () => {
  assert.equal(classifyCommonPetBreed('dachshund')?.coat_type, 'curto')
  assert.equal(classifyCommonPetBreed('chihuahua')?.coat_type, 'curto')
  assert.equal(classifyCommonPetBreed('jack russell')?.coat_type, 'curto')
  assert.equal(classifyCommonPetBreed('dachshund de pelo longo')?.coat_type, 'longo')
  assert.equal(classifyCommonPetBreed('chihuahua de pelo longo')?.coat_type, 'longo')
  assert.equal(classifyCommonPetBreed('vira-lata')?.coat_type, null)
})

test('cada raca canonica pertence a apenas uma pelagem padrao', () => {
  const assignments = new Map()
  for (const coatType of PETBOT_COAT_TYPES) {
    for (const breed of commonCanonicalBreedsForCoatType(coatType)) {
      assert.equal(assignments.has(breed), false, `${breed} apareceu em mais de uma pelagem`)
      assignments.set(breed, coatType)
    }
  }

  assert.equal(assignments.size, COMMON_PET_BREED_CLASSIFICATIONS.length)
  assert.equal(assignments.get('spitz alemao'), 'duplo')
  assert.equal(assignments.get('shih tzu'), 'longo')
})

test('gera presets editaveis apenas com nomes canonicos', () => {
  assert.equal(inferServiceCoatType('Banho 10 a 22 KG - Pelo Médio'), 'medio')
  assert.ok(commonBreedAliasesForCoatType('duplo').includes('pomerania'))

  const preset = buildServiceBreedPreset('Banho 10 a 22 KG - Pelo Longo')
  assert.equal(preset.classification_source, 'yuisync_exclusive_breed_presets_v2')
  assert.ok(preset.breed.includes('shih tzu'))
  assert.equal(preset.breed.includes('shihtzu'), false)
  assert.equal(preset.breed.includes('shitzu'), false)
})
