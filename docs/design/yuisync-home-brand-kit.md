# YuiSync — Home / Brand Kit Inicial

## Objetivo

Estabelecer uma direção visual forte para a home pública da plataforma YuiSync, com foco em identidade própria, sensação de tecnologia viva e evolução futura para um hero 3D mais sofisticado.

## Conceito central

**Yui Core**

Um núcleo visual vivo que representa:

- sincronização
- automação
- conexão entre camadas
- modularidade
- inteligência operacional

## Referência de composição

A primeira dobra deve concentrar o impacto visual da marca:

- navegação horizontal escura e discreta
- núcleo orbital central em grande escala
- quatro cartões conectados ao ecossistema: empresa, equipe, clientes e automações
- chamadas curtas abaixo do núcleo
- brilho controlado em azul, ciano, verde e violeta

A referência serve como direção, não como cópia literal. O resultado deve continuar coerente com a arquitetura e os componentes existentes do YuiSync.

## Arquivos-base

### Implementação

- `src/public/pages/PublicHomePage.jsx`
- `src/public/components/YuiCoreHero.jsx`

### Base visual salva

- `src/public/assets/yui-core-static.svg`

## Paleta principal

### Fundos

- `#030711` — fundo principal
- `#050A16` — fundo secundário
- `#081120` — cards e superfícies
- `#12234B` — profundidade do núcleo

### Acentos

- `#3AA7FF` — azul principal
- `#63E6FF` — ciano de brilho
- `#29E7A4` — verde de operação
- `#8E6BFF` — violeta de inteligência

### Neutros

- `#F3FBFF` — branco principal
- `rgba(255,255,255,0.72)` — texto secundário
- `rgba(255,255,255,0.45)` — texto sutil

## Fontes

A implementação mantém os tokens existentes do projeto:

- `font-display`: Outfit
- `font-body`: Nunito

## Princípios de movimento

### Hero

- rotação contínua e suave das órbitas
- pulso controlado do núcleo central
- partículas com fade in/out
- leve inclinação reativa ao cursor
- respeito a `prefers-reduced-motion`

### Scroll

- seções entram com fade e subida leve
- movimento apenas quando ajuda a hierarquia visual
- nada agressivo ou excessivamente gamer

### Performance

- experiência restrita à rota pública
- componente carregado junto com a home lazy-loaded
- sem Three.js na primeira fase
- base preparada para fallback estático e futura divisão de chunk

## Evolução recomendada

### Fase 2

Validar a primeira versão em desktop e mobile, ajustar proporções, textos e contraste e adicionar testes visuais da rota pública.

### Fase 3

Adicionar versão 3D real com React Three Fiber apenas se o ganho visual justificar o custo de bundle e renderização.

### Fase 4

Expandir a identidade para Login, Launcher, loading global e motion system do produto.
