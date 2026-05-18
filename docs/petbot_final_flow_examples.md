# PetBot Final Flow Examples

Base curta para homologar fluidez e autonomia. Todos os exemplos chegam ate resumo final, confirmacao, salvamento esperado e avaliacao.

## Produto

### Produto 1 - Racao Shih Tzu Adulto Com Entrega
Cliente:
```text
ola bom dia
Rodrigo
quero racao pra shih tzu adulto
Premier, qualquer pacote
1
nao
pix entrega
Av. Bernardo Mascarenhas, 1327 ap 303b
Bairro Fabrica, perto da padaria
sim
10
```
Esperado: produto real com `product_id`, taxa de entrega no total, endereco completo, `sale_id`, `order_id` e CSAT.

### Produto 2 - Racao Gato Adulto Com Retirada
Cliente:
```text
oi
Camila
quero racao para gato adulto
sem preferencia
1
nao
cartao
retirada
confirmo
9
```
Esperado: nao oferecer produto de cachorro, resumo final antes de salvar, retirada sem endereco.

### Produto 3 - Gato Castrado Saco 15kg
Cliente:
```text
boa tarde
Lara
quero racao para gato castrado
saco de 15kg, sem marca
1
nao
pix
retirada
sim
10
```
Esperado: filtro por embalagem, alternativa real se nao houver match exato, total correto.

### Produto 4 - Antipulgas Com Troco
Cliente:
```text
oi
Joao
tem antipulgas para cachorro de 8kg?
1
nao
dinheiro
troco para 200
retirada
sim
8
```
Esperado: usa peso para selecionar faixa correta, pergunta troco, nao mistura com shampoo aleatorio.

### Produto 5 - Areia Higienica Com Entrega
Cliente:
```text
ola
Denise
tem areia higienica para gato?
1
nao
pix entrega
Rua A, 123
Centro, portao azul
sim
10
```
Esperado: areia higienica continua como produto, entende bairro + referencia em mensagem curta, soma taxa.

## Banho/Tosa

### Banho/Tosa 1 - Banho Cachorro Grande
Cliente:
```text
oi
Ana
quero banho para Thor golden
sem observacao
14:00
pix
sim
10
```
Esperado: Golden vira porte grande, usa agenda de banho, salva `appointment_id` e `order_id`.

### Banho/Tosa 2 - Banho E Tosa Com Observacao
Cliente:
```text
boa tarde
Marcos
quero banho e tosa para Nina shih tzu, sem perfume
16:30
cartao
sim
9
```
Esperado: observacao operacional aparece no resumo e nas notas do agendamento.

### Banho/Tosa 3 - Pedido Generico De Agendamento
Cliente:
```text
oi
Clara
quero agendar
banho e tosa
Mel poodle
ela tem alergia ao perfume
16:30
pix
sim
10
```
Esperado: pergunta tipo de servico antes da agenda, depois pergunta pet e observacoes.

### Banho/Tosa 4 - Pet Bravo Com Dinheiro
Cliente:
```text
ola
Rafael
quero banho para Rex pinscher bravo
14:00
dinheiro
sem troco
sim
8
```
Esperado: observacao "bravo" salva, pergunta troco e agenda somente horario real.

### Banho/Tosa 5 - Tosa Higienica
Cliente:
```text
oi
Bia
quero tosa higienica para Toby spitz
sem observacao
16:30
pix
sim
10
```
Esperado: usa aba/agenda banho-tosa, nao mostra consulta veterinaria.

## Veterinaria

### Veterinaria 1 - Cachorro Com Coceira
Cliente:
```text
oi
Paula
quero veterinario para Bob cachorro com coceira
15:00
pix
sim
10
```
Esperado: salva consulta veterinaria com sintoma e horario real.

### Veterinaria 2 - Gata Espirrando
Cliente:
```text
boa tarde
Priscila
preciso de consulta para Mia gata espirrando
15:00
cartao
sim
9
```
Esperado: usa especie gato, nao diagnostica, registra agenda.

### Veterinaria 3 - Cachorro Mancando Com Dinheiro
Cliente:
```text
ola
Fernanda
quero vet para Apollo cachorro mancando
15h
dinheiro
troco para 100
sim
8
```
Esperado: entende "vet", aceita 15h como horario, pergunta troco.

### Veterinaria 4 - Vacina Anual
Cliente:
```text
oi
Nicole
quero vacina para Luna gato
vacina anual
17:00
pix
sim
10
```
Esperado: usa agenda veterinaria/vacina, motivo "vacina" fica salvo.

### Veterinaria 5 - Gato Sem Comer
Cliente:
```text
bom dia
Bruno
preciso de veterinario para Simba gato, nao esta comendo
15:00
cartao
sim
7
```
Esperado: triagem cautelosa, sem diagnostico, salva consulta se nao for caso critico.
