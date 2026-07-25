# Luna Eval Platform

A plataforma separa regras operacionais de compreensão linguística.

## Fluxo

1. Uma especificação canônica descreve estado, fixtures, passos semânticos e assertions.
2. O Scenario Compiler gera variações de linguagem com IDs determinísticos.
3. O simulador executa os mesmos eventos e estados da Luna com relógio, catálogo, agenda e persistência em memória.
4. O relatório agrupa falhas por assinatura estável e guarda o caso compilado para replay.

Nenhum caso determinístico chama LLM, Supabase, catálogo real ou RPC.

## Exemplo

```json
{
  "schema_version": 1,
  "name": "booking_with_transport",
  "group": "bath",
  "initial_state": { "type": "unknown", "status": "idle" },
  "fixtures": { "base": "petshop_standard" },
  "steps": [
    { "user_intent": "request_bath", "payload": { "pet_name": "Thor", "weight_kg": 8 } },
    { "user_intent": "choose_time", "payload": { "scheduled_at": "2026-07-27T16:00:00-03:00" } },
    { "user_intent": "customer_brings", "payload": {} },
    { "user_intent": "request_summary", "payload": {} },
    { "user_intent": "confirm", "paraphrase_set": "confirm", "payload": {} }
  ],
  "assert": {
    "operation_status": "confirmed",
    "tool_calls": { "confirm_operation": 1 },
    "persistence": { "appointment_id": "$present" }
  }
}
```

## Comandos

```bash
npm run luna:eval:compile
npm run test:luna:eval
npm run luna:eval:replay -- report.json
npm run luna:eval:impact -- --base <sha> --head HEAD
```
