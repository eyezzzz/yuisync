# Classificação de raças do PetBot

## Objetivo

A classificação relaciona raças comuns às classes comerciais de pelagem usadas
nos serviços de banho do tenant: `curto`, `medio`, `longo` e `duplo`.

Ela existe para reduzir perguntas desnecessárias. Quando o cliente informa uma
raça reconhecida, o backend resolve a pelagem pelo campo editável
**Classificação do PetBot** do serviço. O peso nunca é inferido pela raça e
continua obrigatório quando o catálogo possui faixas em quilogramas.

## Regra operacional

Esta é uma classificação de operação de banho e secagem, não um diagnóstico
genético ou veterinário:

- `duplo`: subpelo que altera de forma relevante secagem, escovação e remoção de
  pelos, como Spitz Alemão, Labrador, Golden, Pastor Alemão e Husky.
- `longo`: pelagem longa, sedosa, caída ou com franjas, como Shih Tzu, Yorkshire,
  Lhasa Apso e Maltês.
- `medio`: pelagem cacheada, ondulada, lanosa ou dura, como Poodle, Bichon e
  Schnauzer.
- `curto`: pelagem lisa ou predominantemente curta, como Bulldog Francês,
  Pinscher, Pug, Boxer e Pit Bull.

A prioridade é sempre a classificação editada pelo tenant. O catálogo comum só
funciona como preenchimento inicial e fallback.

## Casos ambíguos

SRD e raças com variedades reais de pelagem não recebem uma classe inventada.
Exemplos: Chihuahua, Dachshund e Jack Russell sem a variedade informada. Nesses
casos o PetBot pode perguntar a pelagem, pois o dado é realmente necessário.

## Fontes de referência

A seleção de raças comuns considera levantamentos brasileiros recentes, em
especial o PetCenso 2025 da Petlove e pesquisas nacionais divulgadas em 2024.
As descrições de pelagem foram contrastadas com padrões e materiais de
organizações cinófilas:

- Petlove, **PetCenso 2025**: https://www.petlove.com.br/dicas/petcenso-2025
- American Kennel Club, **What Is a Double Coat?**:
  https://www.akc.org/expert-advice/dog-breeds/double-coated-dog-breeds/
- American Kennel Club, páginas e padrões de German Spitz, Labrador Retriever,
  German Shepherd Dog, Shih Tzu e Poodle: https://www.akc.org/dog-breeds/
- Fédération Cynologique Internationale, nomenclatura e padrões oficiais:
  https://www.fci.be/en/Nomenclature/

## Atualização

O catálogo fica em `shared/petbotBreedCatalog.js`. A migração
`20260721004000_petbot_common_breed_classification.sql` preenche somente serviços
sem lista manual e preserva alterações feitas pela loja.
