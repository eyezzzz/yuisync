import { DurableObject } from "cloudflare:workers";
import { HttpError, stableJson, type RuntimeEnv } from "./runtime";

export type OperationSnapshot = {
  operationId: string;
  tenantId: string;
  moduleId: string;
  threadId?: string | null;
  operationType: string;
  status: string;
  version: number;
  state: Record<string, unknown>;
  lastEventType?: string | null;
};

export class OperationCoordinator extends DurableObject<RuntimeEnv> {
  constructor(ctx: DurableObjectState, env: RuntimeEnv) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS operation_state (
          singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
          operation_id TEXT NOT NULL,
          tenant_id TEXT NOT NULL,
          module_id TEXT NOT NULL,
          thread_id TEXT,
          operation_type TEXT NOT NULL,
          status TEXT NOT NULL,
          version INTEGER NOT NULL,
          state_json TEXT NOT NULL,
          last_event_type TEXT,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS applied_effects (
          idempotency_key TEXT PRIMARY KEY,
          effect_type TEXT NOT NULL,
          status TEXT NOT NULL,
          result_json TEXT,
          updated_at TEXT NOT NULL
        );
      `);
    });
  }

  async getSnapshot(): Promise<OperationSnapshot | null> {
    const row = this.ctx.storage.sql.exec<{
      operation_id: string; tenant_id: string; module_id: string; thread_id: string | null;
      operation_type: string; status: string; version: number; state_json: string; last_event_type: string | null;
    }>(`SELECT operation_id,tenant_id,module_id,thread_id,operation_type,status,version,state_json,last_event_type FROM operation_state WHERE singleton=1`).toArray()[0];
    if (!row) return null;
    return {
      operationId: row.operation_id,
      tenantId: row.tenant_id,
      moduleId: row.module_id,
      threadId: row.thread_id,
      operationType: row.operation_type,
      status: row.status,
      version: row.version,
      state: JSON.parse(row.state_json) as Record<string, unknown>,
      lastEventType: row.last_event_type,
    };
  }

  async applyEvent(input: {
    expectedVersion: number;
    eventType: string;
    next: Omit<OperationSnapshot, "version" | "lastEventType">;
  }): Promise<OperationSnapshot> {
    const current = await this.getSnapshot();
    const currentVersion = current?.version ?? 0;
    if (currentVersion !== input.expectedVersion) {
      throw new HttpError(409, "STALE_OPERATION_VERSION", `Expected version ${input.expectedVersion}, found ${currentVersion}`);
    }

    const version = currentVersion + 1;
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO operation_state(singleton,operation_id,tenant_id,module_id,thread_id,operation_type,status,version,state_json,last_event_type,updated_at)
       VALUES(1,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(singleton) DO UPDATE SET
         operation_id=excluded.operation_id,tenant_id=excluded.tenant_id,module_id=excluded.module_id,thread_id=excluded.thread_id,
         operation_type=excluded.operation_type,status=excluded.status,version=excluded.version,state_json=excluded.state_json,
         last_event_type=excluded.last_event_type,updated_at=excluded.updated_at`,
      input.next.operationId,
      input.next.tenantId,
      input.next.moduleId,
      input.next.threadId ?? null,
      input.next.operationType,
      input.next.status,
      version,
      stableJson(input.next.state),
      input.eventType,
      now,
    );

    await this.env.DB.prepare(`
      INSERT INTO operation_checkpoints(operation_id,tenant_id,module_id,thread_id,operation_type,status,version,state_json,last_event_type,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
      ON CONFLICT(operation_id) DO UPDATE SET
        status=excluded.status,version=excluded.version,state_json=excluded.state_json,last_event_type=excluded.last_event_type,updated_at=CURRENT_TIMESTAMP
      WHERE excluded.version > operation_checkpoints.version
    `).bind(
      input.next.operationId, input.next.tenantId, input.next.moduleId, input.next.threadId ?? null,
      input.next.operationType, input.next.status, version, stableJson(input.next.state), input.eventType,
    ).run();

    return { ...input.next, version, lastEventType: input.eventType };
  }

  async claimEffect(input: { idempotencyKey: string; effectType: string }): Promise<{ claimed: boolean; result?: unknown }> {
    const existing = this.ctx.storage.sql.exec<{ status: string; result_json: string | null }>(
      `SELECT status,result_json FROM applied_effects WHERE idempotency_key=?`, input.idempotencyKey,
    ).toArray()[0];
    if (existing) return { claimed: false, result: existing.result_json ? JSON.parse(existing.result_json) : undefined };
    this.ctx.storage.sql.exec(
      `INSERT INTO applied_effects(idempotency_key,effect_type,status,updated_at) VALUES(?,?,'claimed',?)`,
      input.idempotencyKey, input.effectType, new Date().toISOString(),
    );
    return { claimed: true };
  }

  async completeEffect(input: { idempotencyKey: string; result: unknown }): Promise<void> {
    this.ctx.storage.sql.exec(
      `UPDATE applied_effects SET status='completed',result_json=?,updated_at=? WHERE idempotency_key=?`,
      stableJson(input.result), new Date().toISOString(), input.idempotencyKey,
    );
  }
}
