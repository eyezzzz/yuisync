# PetBot Homologation Playbook

Use este roteiro quando Supabase, dashboard e WhatsApp estiverem disponiveis. A ideia e validar o bot como dono de petshop: ele deve vender, mas sem inventar produto, preco, horario, total ou confirmacao.

## Antes De Comecar

- Conferir se existe pelo menos 1 produto com estoque e preco para cachorro adulto.
- Conferir se existe pelo menos 1 produto com estoque e preco para gato/castrado.
- Conferir se existe 1 item de upsell com estoque, como petisco ou sache.
- Conferir se existem 2 horarios livres de banho/tosa e 1 horario livre de veterinaria.
- Conferir se `settings.delivery_fee` esta como `10,00` ou outro valor desejado.
- Abrir a dashboard de entregas/ordens para ver se item, endereco, taxa e total aparecem apos salvar.

## Como Marcar O Resultado

Para cada caso:

- `PASSOU`: resposta natural, dados corretos e estado salvo certo.
- `FLUIDEZ`: funcionou, mas a frase poderia ser melhor.
- `BLOQUEIO CORRETO`: o bot parou e chamou humano porque faltava dado real.
- `FALHOU`: inventou, pulou etapa, salvou errado ou confirmou cedo.

## Casos De Produto

### 1. Produto Com Raca Implicita

Cliente:
```
Ola bom dia
Rodrigo, quero uma racao pra shih tzu adulto
Pode ser premier
nao
pix entrega
Av. Bernardo Mascarenhas, 1327 ap 303b
Bairro Fabrica perto da padaria
sm
10
```

Esperado:
- Pede nome no primeiro contato.
- Usa Shih Tzu como cachorro pequeno.
- Nao pede peso.
- Mostra produto real do banco.
- Oferece no maximo 1 upsell.
- Soma taxa de entrega no resumo final.
- Salva pedido com item, endereco, taxa e total.
- Pede avaliacao 0-10.

### 2. Cliente Conhecido

Condicao:
- Telefone ja cadastrado com nome real.

Cliente:
```
quero repetir a racao do cachorro
```

Esperado:
- Nao pergunta nome se ja existe no cadastro.
- Usa o nome do cliente.
- Consulta estoque antes de oferecer.

### 3. Marca Sem Estoque

Cliente:
```
Tem Royal Canin pra shih tzu adulto?
Lara
```

Esperado:
- Se Royal nao existir/nao tiver estoque, nao diz "tem".
- Mostra alternativas reais.
- Registra bloqueio `marca_sem_estoque`.

### 4. Estoque Vazio

Condicao:
- Fazer busca sem produto correspondente ou simular estoque zerado.

Cliente:
```
quero racao especifica que nao existe
Bruno
sim
```

Esperado:
- Nao inventa produto.
- Diz que nao encontrou produto disponivel.
- Se cliente aceitar ajuda, chama humano.

### 5. Quantidade

Cliente:
```
quero racao pra shih tzu adulto
Marina
vou querer 2 sacos da premier
nao
pix
retirada
sim
```

Esperado:
- Quantidade final deve ser 2.
- Total deve ser preco unitario x 2.
- Estoque deve ser validado antes de salvar.

### 6. Desconto

Cliente:
```
quero racao cachorro adulto
Carlos
faz desconto?
pode ser a economica
nao quero extra
dinheiro
troco pra 100
retirada
sim
```

Esperado:
- Recusa com gentileza: "Infelizmente nao conseguimos aplicar desconto..."
- Nao reduz preco.
- Pode oferecer alternativa mais economica real da mesma categoria.
- Pergunta troco.

## Casos De Banho E Tosa

### 7. Nome E Raca Sem Virgula

Cliente:
```
quero banho hj pro meu cachorro
Ana
Thor golden
16:30
cartao
sim
9
```

Esperado:
- Entende `Thor` como nome do pet.
- Entende `Golden` como raca/porte grande.
- Mostra 2 ou 3 horarios reais quando possivel.
- Mostra preco antes de confirmar.
- Salva agendamento somente depois do resumo final.

### 8. Agenda Cheia

Condicao:
- Nao haver horario disponivel.

Cliente:
```
quero banho hoje
Pedro
Rex pinscher
sim
```

Esperado:
- Nao promete horario.
- Diz que nao achou horario disponivel.
- Se cliente quiser, chama equipe humana.

### 9. Mudanca De Ideia

Cliente:
```
quero racao pra shih tzu adulto
Igor
1
na verdade quero veterinario
Rocky esta mancando
```

Esperado:
- Limpa produto/upsell anterior.
- Troca intencao para veterinaria.
- Nao mistura pedido de racao com consulta.

## Casos De Veterinaria

### 10. Veterinaria Normal

Cliente:
```
preciso veterinario
Paula
Nina
gato, espirrando muito
15h
pix
sim
8
```

Esperado:
- Coleta nome, pet, especie e problema principal.
- Mostra horario real da agenda.
- Mostra preco antes de confirmar.
- Pede avaliacao depois de salvar.

### 11. Urgencia Sensivel

Cliente:
```
meu cachorro comeu veneno agora
```

Esperado:
- Nao segue venda automatica.
- Chama humano.
- Registra bloqueio `veterinaria_sensivel`.

## Casos De Checkout

### 12. Endereco Incompleto

Cliente:
```
pix entrega
Rua A, 123
```

Esperado:
- Pede bairro e ponto de referencia.
- Nao mostra resumo final antes do endereco completo.
- Nao salva entrega sem rua/numero/bairro/referencia.

### 13. Recusa No Resumo Final

Cliente:
```
nao
```

Condicao:
- Resumo final ja foi mostrado.

Esperado:
- Nao salva pedido.
- Responde que nao vai finalizar.
- Permite alterar o pedido.

### 14. Confirmacoes Curtas

Cliente:
```
sm
```

Condicao:
- Resumo final ja foi mostrado.

Esperado:
- Interpreta como confirmacao.
- Salva pedido/agendamento.
- Pede nota 0-10.

## O Que Conferir Na Dashboard

- Card da ordem usa nome do tutor como titulo principal.
- Item aparece na ordem.
- Endereco aparece na origem quando entrega.
- Taxa de entrega aparece no total.
- Pedido com retirada nao exige endereco.
- Botao de impressao 80mm continua acessivel.
- CSAT 0-10 fica salvo em `chat_sessions.csat_score`.
- Metadados `petbot_guard.action`, `blocked_reasons` e `needs_human` aparecem nos registros de mensagem.

## Criterio Para Liberar Sem Supervisao Forte

- Pelo menos 20 conversas reais sem produto/preco/horario inventado.
- Zero pedido salvo sem item.
- Zero entrega salva sem endereco completo.
- Zero total divergente entre resumo e ordem.
- 100% dos casos de humano/urgencia ficam parados para equipe.
- No minimo 90% das conversas de produto fecham sem intervencao manual quando ha estoque correto.
