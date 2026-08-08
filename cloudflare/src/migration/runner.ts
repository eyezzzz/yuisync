import { HttpError, randomId, sha256, stableJson } from "../runtime";
import { DOMAIN_MIGRATIONS, MIGRATION_ORDER } from "./domains";
import type { DomainResult, MigrationContext, MigrationDomain, MigrationScope, WriteUnit } from "./types";

const MAX_FAILURE_DETAILS = 200;

function sourceRecord(unit: WriteUnit, normalizedFingerprint: string) {
  return {
    source_id: unit.sourceId,
    target_table: unit.table,
    target_id: unit.targetId,
    normalized_fingerprint: normalizedFingerprint,
  };
}

async function prepareTenant(context: MigrationContext): Promise<void> {
  if (context.scope.dryRun) return;
  await context.env.DB.prepare(`
    INSERT INTO tenants(id, name, active, created_at, updated_at)
    VALUES(?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET active = 1, updated_at = CURRENT_TIMESTAMP
  `).bind(context.scope.tenantId, `Migrated tenant ${context.scope.tenantId}`).run();
}

async function recordFailure(context: MigrationContext, sourceId: string | null, error: unknown): Promise<void> {
  if (context.scope.dryRun) return;
  const message = error instanceof Error ? error.message : String(error);
  await context.env.DB.prepare(`
    INSERT INTO migration_failures(id, run_id, source_id, error_code, error_message, payload_json)
    VALUES(?, ?, ?, ?, ?, ?)
  `).bind(
    randomId("migration_failure"), context.runId, sourceId, "ROW_MIGRATION_FAILED",
    message.slice(0, 1000),
    stableJson(error instanceof Error ? { name: error.name, message: error.message } : { value: String(error) }).slice(0, 4000),
  ).run();
}

function contextDomain(context: MigrationContext): MigrationDomain {
  const value = (context as MigrationContext & { domain?: MigrationDomain }).domain;
  if (!value) throw new Error("Migration context domain missing");
  return value;
}

async function writeUnits(context: MigrationContext, units: WriteUnit[]): Promise<{ written: number; sourceRecords: ReturnType<typeof sourceRecord>[] }> {
  if (!units.length) return { written: 0, sourceRecords: [] };
  const records: ReturnType<typeof sourceRecord>[] = [];
  const statements: D1PreparedStatement[] = [];
  for (const item of units) {
    const fingerprint = await sha256(stableJson(item.fingerprint));
    records.push(sourceRecord(item, fingerprint));
    statements.push(item.statement);
    statements.push(context.env.DB.prepare(`
      INSERT INTO migration_identity_map(
        tenant_id,module_id,domain,source_system,source_id,target_table,target_id,migration_version,normalized_fingerprint,created_at
      ) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(tenant_id,module_id,domain,source_system,source_id,target_table)
      DO UPDATE SET target_id=excluded.target_id,migration_version=excluded.migration_version,normalized_fingerprint=excluded.normalized_fingerprint
    `).bind(
      context.scope.tenantId, context.scope.moduleId, contextDomain(context), item.sourceSystem, item.sourceId,
      item.table, item.targetId, context.scope.migrationVersion, fingerprint,
    ));
  }
  if (!context.scope.dryRun) await context.env.DB.batch(statements);
  return { written: units.length, sourceRecords: records };
}

async function createRun(context: MigrationContext, domain: MigrationDomain): Promise<void> {
  if (context.scope.dryRun) return;
  await context.env.DB.prepare(`INSERT INTO migration_runs(id,tenant_id,module_id,domain,migration_version,status,started_at) VALUES(?,?,?,?,?,'running',CURRENT_TIMESTAMP)`)
    .bind(context.runId, context.scope.tenantId, context.scope.moduleId, domain, context.scope.migrationVersion).run();
}

async function completeRun(context: MigrationContext, result: DomainResult): Promise<void> {
  if (context.scope.dryRun) return;
  const pass = result.rejectedCount === 0 && result.sourceFingerprint === result.targetFingerprint;
  await context.env.DB.prepare(`
    UPDATE migration_runs SET status=?,source_count=?,normalized_count=?,written_count=?,rejected_count=?,completed_at=CURRENT_TIMESTAMP,metadata_json=? WHERE id=?
  `).bind(pass ? "completed" : "reconciliation_failed", result.sourceCount, result.normalizedCount, result.writtenCount, result.rejectedCount, stableJson(result.metrics), context.runId).run();
  await context.env.DB.prepare(`
    INSERT INTO reconciliation_results(id,run_id,tenant_id,module_id,domain,status,source_fingerprint,target_fingerprint,metrics_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
  `).bind(randomId("reconciliation"), context.runId, context.scope.tenantId, context.scope.moduleId, contextDomain(context), pass ? "pass" : "fail", result.sourceFingerprint, result.targetFingerprint, stableJson(result.metrics)).run();
}

export async function runDomainMigration(env: MigrationContext["env"], scope: MigrationScope, domain: MigrationDomain): Promise<DomainResult> {
  const migration = DOMAIN_MIGRATIONS[domain];
  if (!migration) throw new HttpError(400, "UNKNOWN_MIGRATION_DOMAIN", `Unknown migration domain: ${domain}`);
  const context = { env, scope, runId: randomId("migration_run"), domain } as MigrationContext & { domain: MigrationDomain };
  await prepareTenant(context); await createRun(context, domain);
  const source = await migration.extract(context);
  const sourceRecords: ReturnType<typeof sourceRecord>[] = [];
  let normalizedCount = 0, writtenCount = 0, rejectedCount = 0;
  for (const row of source) {
    try {
      const units = await migration.normalize(row, context);
      normalizedCount += units.length;
      const result = await writeUnits(context, units);
      writtenCount += result.written; sourceRecords.push(...result.sourceRecords);
    } catch (error) {
      rejectedCount += 1;
      if (rejectedCount <= MAX_FAILURE_DETAILS) await recordFailure(context, row.id == null ? null : String(row.id), error);
    }
  }
  sourceRecords.sort((a,b)=>`${a.source_id}|${a.target_table}|${a.target_id}`.localeCompare(`${b.source_id}|${b.target_table}|${b.target_id}`));
  const sourceFingerprint = await sha256(stableJson(sourceRecords));
  let targetFingerprint = sourceFingerprint; let targetMetrics: Record<string,unknown>={mappedRows:sourceRecords.length};
  if (!scope.dryRun) {
    const target = await migration.targetFingerprint(context);
    const targetRecords = JSON.parse(target.fingerprint) as unknown[];
    targetFingerprint = await sha256(stableJson(targetRecords)); targetMetrics = target.metrics;
  }
  const result: DomainResult = { sourceCount:source.length, normalizedCount, writtenCount:scope.dryRun?0:writtenCount, rejectedCount, sourceFingerprint, targetFingerprint, metrics:{dryRun:scope.dryRun,domain,sourceRows:source.length,normalizedRows:normalizedCount,target:targetMetrics} };
  await completeRun(context,result); return result;
}

export async function runMigrationWave(env:MigrationContext["env"],scope:MigrationScope,domains:MigrationDomain[]=MIGRATION_ORDER):Promise<Record<string,DomainResult>>{
  const requested=new Set(domains),ordered=MIGRATION_ORDER.filter((domain)=>requested.has(domain)),results:Record<string,DomainResult>={};
  for(const domain of ordered){const migration=DOMAIN_MIGRATIONS[domain];for(const dependency of migration.dependencies){if(requested.has(dependency)&&!results[dependency])throw new HttpError(409,"MIGRATION_DEPENDENCY_ORDER",`${domain} requires ${dependency}`);}const result=await runDomainMigration(env,scope,domain);results[domain]=result;if(result.rejectedCount>0||result.sourceFingerprint!==result.targetFingerprint)break;}return results;
}

export async function verifyRerun(env:MigrationContext["env"],scope:Omit<MigrationScope,"dryRun">,domains:MigrationDomain[]):Promise<{first:Record<string,DomainResult>;second:Record<string,DomainResult>;pass:boolean}>{const actual={...scope,dryRun:false};const first=await runMigrationWave(env,actual,domains);const second=await runMigrationWave(env,actual,domains);const pass=domains.every((domain)=>{const a=first[domain],b=second[domain];return!!a&&!!b&&a.rejectedCount===0&&b.rejectedCount===0&&a.targetFingerprint===b.targetFingerprint&&b.sourceFingerprint===b.targetFingerprint;});return{first,second,pass};}
