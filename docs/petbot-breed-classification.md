# Classificação de raças do PetBot

## Objetivo

A classificação relaciona raças comuns às classes comerciais de pelagem usadas
nos serviços de banho do tenant: `curto`, `medio`, `longo` e `duplo`.

Ela existe para reduzir perguntas desnecessárias. Quando o cliente informa uma
raça reconhecida, o backend resolve a pelagem pelo catálogo central e cruza o
resultado com o campo editável **Classificação do PetBot** do serviço. O peso
nunca é inferido pela raça e continua obrigatório quando o catálogo possui
faixas em quilogramas.

## Regra de exclusividade

Cada raça canônica aparece em uma única classe padrão. Variações de escrita não
são gravadas nos serviços:

- `spitz alemao` aparece somente em `duplo`;
- `shih tzu` aparece somente em `longo`;
- grafias como `shihtzu`, `shitzu`, `lulu da pomerania` e `pomeranian` ficam no
  código como aliases de interpretação, sem gerar entradas duplicadas na tela.

O padrão comercial é deliberadamente simples. Para raças com variedades de
pelagem, como Chihuahua e Dachshund, existe uma classe padrão única quando o
cliente informa apenas a raça. Se ele informar explicitamente uma variedade
(`dachshund de pelo longo`, por exemplo), esse detalhe explícito prevalece sem
duplicar a raça nas listas editáveis.

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

Raças não catalogadas ainda podem ser adicionadas manualmente. SRD continua sem
classe automática porque a pelagem varia por indivíduo.

## Fontes de referência

A taxonomia usa uma simplificação comercial contrastada com padrões e materiais
de organizações cinófilas. O padrão do Pomeranian/Spitz descreve pelagem dupla;
o Shih Tzu é tratado comercialmente na classe longa, apesar de o padrão também
mencionar subpelo, porque a pelagem longa é o fator operacional dominante para
esses serviços.

- American Kennel Club, Pomeranian e padrão oficial:
  https://www.akc.org/dog-breeds/pomeranian/
- American Kennel Club, padrão oficial do Shih Tzu:
  https://images.akc.org/pdf/breeds/standards/ShihTzu.pdf
- American Kennel Club, materiais sobre cães de pelagem dupla:
  https://www.akc.org/expert-advice/dog-breeds/double-coated-dog-breeds/
- Fédération Cynologique Internationale, nomenclatura e padrões oficiais:
  https://www.fci.be/en/Nomenclature/

## Atualização

O catálogo e seus aliases ficam em `shared/petbotBreedCatalog.js`. A migração
`20260721005000_petbot_exclusive_breed_classification.sql` substitui as listas
geradas anteriormente por listas canônicas exclusivas. A área permanece
editável depois da padronização.
