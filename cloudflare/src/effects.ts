import { serializeError, stableJson, type RuntimeEnv } from "./runtime";

type EffectMessage = { outboxId: string };

async function processEffect(env: RuntimeEnv, message: EffectMessage): Promise<void> {
  const row = await env.DB.prepare(`
    SELECT id,tenant_id,module_id,aggregate_type,aggregate_id,effect_type,idempotency_key,payload_json,status,attempts
    FROM effect_outbox WHERE id=? LIMIT 1
  `).bind(message.outboxId).first<{
    id:string;tenant_id:string;module_id:string;aggregate_type:string;aggregate_id:string;effect_type:string;
    idempotency_key:string;payload_json:string;status:string;attempts:number;
  }>();
  if (!row || row.status === "completed") return;
  await env.DB.prepare(`UPDATE effect_outbox SET status='processing',attempts=attempts+1,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
  try {
    if (row.effect_type === "certification_probe") {
      await env.DB.prepare(`UPDATE effect_outbox SET status='completed',last_error=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(row.id).run();
      return;
    }
    throw new Error(`No effect processor registered for ${row.effect_type}`);
  } catch (error) {
    await env.DB.prepare(`UPDATE effect_outbox SET status='failed',last_error=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(stableJson(serializeError(error)).slice(0,1000),row.id).run();
    throw error;
  }
}

export async function handleQueue(batch: MessageBatch<EffectMessage>, env: RuntimeEnv): Promise<void> {
  for (const message of batch.messages) {
    try { await processEffect(env, message.body); message.ack(); }
    catch { message.retry(); }
  }
}
