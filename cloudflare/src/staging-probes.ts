import { randomId, type RuntimeEnv } from "./runtime";
import { MIGRATION_ORDER } from "./migration/domains";

export const REQUIRED_TABLES = [
  "tenants","tenant_memberships","clients","pets","products","services","inventory_balances","inventory_movements",
  "operational_configs","appointments","appointment_services","motodog_options","sales","sale_items","payments","payment_splits",
  "financial_effects","chat_threads","chat_messages","operation_checkpoints","operation_effects","fiscal_documents","effect_outbox",
  "migration_runs","migration_identity_map","migration_failures","reconciliation_results","staging_certifications",
];

export async function tableSet(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all<{name:string}>();
  return new Set((rows.results ?? []).map((row) => row.name));
}

export async function migrationRerunChecks(env: RuntimeEnv, tenantId: string, moduleId: string): Promise<Record<string, unknown>> {
  const checks: Record<string, unknown> = {};
  for (const domain of MIGRATION_ORDER) {
    const rows = await env.DB.prepare(`
      SELECT rr.status,rr.source_fingerprint,rr.target_fingerprint,mr.rejected_count,mr.completed_at
      FROM reconciliation_results rr JOIN migration_runs mr ON mr.id=rr.run_id
      WHERE rr.domain=? AND rr.tenant_id=? AND rr.module_id=? ORDER BY rr.created_at DESC LIMIT 2
    `).bind(domain, tenantId, moduleId).all<{status:string;source_fingerprint:string;target_fingerprint:string;rejected_count:number;completed_at:string}>();
    const pair = rows.results ?? [];
    checks[domain] = {
      pass: pair.length === 2 && pair.every((row) => row.status === "pass" && row.rejected_count === 0 && row.source_fingerprint === row.target_fingerprint) && pair[0]?.target_fingerprint === pair[1]?.target_fingerprint,
      runs: pair.length,
    };
  }
  return checks;
}

export async function tenantIsolationProbe(env: RuntimeEnv): Promise<boolean> {
  const tenantA = randomId("cert_tenant_a");
  const tenantB = randomId("cert_tenant_b");
  const clientId = randomId("cert_client");
  try {
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tenants(id,name,active,created_at,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(tenantA,"Certification A"),
      env.DB.prepare(`INSERT INTO tenants(id,name,active,created_at,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(tenantB,"Certification B"),
      env.DB.prepare(`INSERT INTO clients(id,tenant_id,module_id,name,active,source_id,created_at,updated_at) VALUES(?,?,?,'Isolation probe',1,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(clientId,tenantA,"petshop",`cert:${clientId}`),
    ]);
    const visibleA = await env.DB.prepare(`SELECT count(*) count FROM clients WHERE id=? AND tenant_id=? AND module_id='petshop'`).bind(clientId,tenantA).first<{count:number}>();
    const visibleB = await env.DB.prepare(`SELECT count(*) count FROM clients WHERE id=? AND tenant_id=? AND module_id='petshop'`).bind(clientId,tenantB).first<{count:number}>();
    return Number(visibleA?.count ?? 0) === 1 && Number(visibleB?.count ?? 0) === 0;
  } finally {
    await env.DB.batch([
      env.DB.prepare(`DELETE FROM clients WHERE id=? AND tenant_id=?`).bind(clientId,tenantA),
      env.DB.prepare(`DELETE FROM tenants WHERE id IN (?,?)`).bind(tenantA,tenantB),
    ]);
  }
}

export async function idempotencyProbe(env: RuntimeEnv): Promise<boolean> {
  const tenantId = randomId("cert_idem_tenant");
  const saleA = randomId("cert_sale_a");
  const saleB = randomId("cert_sale_b");
  const key = randomId("cert_idem_key");
  try {
    await env.DB.prepare(`INSERT INTO tenants(id,name,active,created_at,updated_at) VALUES(?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(tenantId,"Idempotency probe").run();
    await env.DB.prepare(`INSERT INTO sales(id,tenant_id,module_id,subtotal_cents,discount_cents,total_cents,status,idempotency_key,created_at,updated_at) VALUES(?,?,?,100,0,100,'completed',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(saleA,tenantId,"petshop",key).run();
    let duplicateRejected = false;
    try {
      await env.DB.prepare(`INSERT INTO sales(id,tenant_id,module_id,subtotal_cents,discount_cents,total_cents,status,idempotency_key,created_at,updated_at) VALUES(?,?,?,100,0,100,'completed',?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).bind(saleB,tenantId,"petshop",key).run();
    } catch {
      duplicateRejected = true;
    }
    const count = await env.DB.prepare(`SELECT count(*) count FROM sales WHERE tenant_id=? AND module_id='petshop' AND idempotency_key=?`).bind(tenantId,key).first<{count:number}>();
    return duplicateRejected && Number(count?.count ?? 0) === 1;
  } finally {
    await env.DB.prepare(`DELETE FROM tenants WHERE id=?`).bind(tenantId).run();
  }
}
