import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildServiceBreedPreset,
  classifyCommonPetBreed,
  commonBreedAliasesForCoatType,
  inferServiceCoatType,
} from '../shared/petbotBreedCatalog.js'

test('normaliza aliases brasileiros das racas comuns', () => {
  assert.deepEqual(classifyCommonPetBreed('lulu-da-pomerânia'), {
    canonical: 'Spitz Alemão', species: 'dog', coat_type: 'duplo', ambiguous: false, classification_version: 2,
  })
  assert.equal(classifyCommonPetBreed('York')?.canonical, 'Yorkshire Terrier')
  assert.equal(classifyCommonPetBreed('Frenchie')?.coat_type, 'curto')
})

test('nao inventa pelagem para racas realmente ambiguas', () => {
  assert.equal(classifyCommonPetBreed('salsicha')?.ambiguous, true)
  assert.equal(classifyCommonPetBreed('chihuahua')?.coat_type, null)
  assert.equal(classifyCommonPetBreed('vira-lata')?.coat_type, null)
})

test('gera presets editaveis por nome do servico', () => {
  assert.equal(inferServiceCoatType('Banho 10 a 22 KG - Pelo Médio'), 'medio')
  assert.ok(commonBreedAliasesForCoatType('duplo').includes('spitz alemao'))
  const preset = buildServiceBreedPreset('Banho 10 a 22 KG - Pelo Longo')
  assert.equal(preset.classification_source, 'yuisync_common_breed_presets_v1')
  assert.ok(preset.breed.includes('shih tzu'))
})
