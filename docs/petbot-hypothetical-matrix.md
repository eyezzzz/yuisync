# Matriz hipotética do PetBot

A suíte executa 500 cenários determinísticos, divididos em 100 casos por família:

- banho;
- tosa;
- veterinária;
- produtos gerais;
- ração.

Os cenários cobrem combinações de tutor, pet, raça, peso, preço, duração, horário, estoque, quantidade, entrega, retirada e pagamento.

Rejeições previstas fazem parte do contrato testado, incluindo horários que ultrapassam a jornada operacional e retirada de produtos com pagamento registrado como `a_combinar`.

A matriz é executada automaticamente por `npm run test:petbot`.
