import { HttpError, constantTimeTokenMatch, header, json, randomId, required, stableJson, type RuntimeEnv } from "./runtime";
import { REQUIRED_TABLES, idempotencyProbe, migrationRerunChecks, tableSet, tenantIsolationProbe } from "./staging-probes";

async function queueProbe(env: RuntimeEnv): Promise<{pass:boolean;status:string;probeId:string}> {
  const recent = await env.DB.prepare(`SELECT id,status FROM effect_outbox WHERE effect_type='certification_probe' ORDER BY created_at DESC LIMIT 1`).first<{id:string;status:string}>();
  if (recent?.status === "completed") return { pass:true,status:"completed",probeId:recent.id };
  if (recent && ["pending","processing"].includes(recent.status)) return { pass:false,status:recent.status,probeId:recent.id };
  const id = randomId("probe");
  await env.DB.prepare(`INSERT INTO effect_outbox(id,tenant_id,module_id,aggregate_type,aggregate_id,effect_type,idempotency_key,payload_json,status) VALUES(?,?,?,?,?,?,?,?, 'pending')`).bind(id,"__certification__","__certification__","system",id,"certification_probe",`certification:${id}`,"{}").run();
  await env.ASYNC_EFFECTS.send({outboxId:id});
  return { pass:false,status:"queued",probeId:id };
}

async function durableObjectProbe(env: RuntimeEnv): Promise<boolean> {
  const stub = env.OPERATION_COORDINATOR.getByName("staging-certification-probe") as unknown as { getSnapshot(): Promise<{ version:number } | null> };
  const snapshot = await stub.getSnapshot();
  return snapshot === null || typeof snapshot.version === "number";
}

async function authCheck(env: RuntimeEnv): Promise<Record<string, unknown>> {
  const tables = await tableSet(env.AUTH_DB);
  const boundary = tables.has("yuisync_auth_meta");
  if (env.BETTER_AUTH_ENABLED !== "true") return {pass:false,boundary,enabled:false,reason:"BETTER_AUTH_ENABLED=false"};
  const core = ["user","session","account","verification"];
  return {pass:boundary && core.every((name) => tables.has(name)),boundary,enabled:true,core:core.filter((name) => tables.has(name))};
}

export async function readiness(env: RuntimeEnv): Promise<Response> {
  const mainTables = await tableSet(env.DB);
  const schema = await env.DB.prepare(`SELECT value FROM schema_meta WHERE key='schema_version'`).first<{value:string}>();
  const missing = REQUIRED_TABLES.filter((name) => !mainTables.has(name));
  const auth = await authCheck(env);
  const ready = env.APP_ENV === "staging" && schema?.value === env.SCHEMA_VERSION && missing.length === 0 && auth.pass === true;
  return json({ready,environment:env.APP_ENV,schemaVersion:schema?.value ?? null,expectedSchemaVersion:env.SCHEMA_VERSION,missingTables:missing,auth,cutoverMode:env.CUTOVER_MODE});
}

export async function certifyStaging(request:Request,env:RuntimeEnv):Promise<Response>{
  if(env.APP_ENV!=="staging"||env.STAGING_CERTIFICATION_ENABLED!=="true")throw new HttpError(403,"CERTIFICATION_DISABLED","Staging certification is disabled");
  const token=required(env.STAGING_CERTIFICATION_TOKEN,"STAGING_CERTIFICATION_TOKEN");
  if(!(await constantTimeTokenMatch(header(request,"x-yuisync-certification-token"),token)))throw new HttpError(401,"INVALID_CERTIFICATION_TOKEN","Invalid certification token");
  const input=await request.json() as {tenantId?:string;moduleId?:string;gitSha?:string;rollbackBookmark?:string};
  if(!input.tenantId||!input.moduleId||!input.gitSha||!input.rollbackBookmark)throw new HttpError(400,"MISSING_CERTIFICATION_INPUT","tenantId, moduleId, gitSha and rollbackBookmark are required");

  const mainTables=await tableSet(env.DB);const schema=await env.DB.prepare(`SELECT value FROM schema_meta WHERE key='schema_version'`).first<{value:string}>();
  const migration=await migrationRerunChecks(env,input.tenantId,input.moduleId);const queue=await queueProbe(env);const auth=await authCheck(env);const durableObject=await durableObjectProbe(env);const tenantIsolation=await tenantIsolationProbe(env);const idempotency=await idempotencyProbe(env);
  const missingTables=REQUIRED_TABLES.filter((name)=>!mainTables.has(name));
  const migrationPass=Object.values(migration).every((value)=>(value as {pass?:boolean}).pass===true);
  const checks={environment:env.APP_ENV==="staging",schema:schema?.value===env.SCHEMA_VERSION,requiredTables:missingTables.length===0,migrationRerun:migrationPass,tenantIsolation,idempotency,queue:queue.pass,durableObject,auth:auth.pass===true,cutoverDisabled:env.CUTOVER_MODE==="disabled",rollbackBookmark:Boolean(input.rollbackBookmark),details:{missingTables,migration,queue,auth}};
  const pass=Object.entries(checks).filter(([key])=>key!=="details").every(([,value])=>value===true);
  const id=randomId("staging_cert");
  await env.DB.prepare(`INSERT INTO staging_certifications(id,tenant_id,module_id,git_sha,schema_version,status,checks_json,rollback_bookmark,created_at) VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`).bind(id,input.tenantId,input.moduleId,input.gitSha,Number(env.SCHEMA_VERSION),pass?"pass":"fail",stableJson(checks),input.rollbackBookmark).run();
  return json({certificationId:id,pass,checks},pass?200:409);
}

export async function cutoverPlan(env:RuntimeEnv):Promise<Response>{
  const cert=await env.DB.prepare(`SELECT id,git_sha,schema_version,status,rollback_bookmark,created_at FROM staging_certifications ORDER BY created_at DESC LIMIT 1`).first<Record<string,unknown>>();
  return json({executable:false,productionMutationAvailable:false,reason:"Production cutover is intentionally not implemented in the Worker. It requires an explicit operator-controlled release after a passing staging certification.",latestCertification:cert??null,required:["passing staging certification","production preflight","production D1 Time Travel bookmark","explicit textual authorization","operator-controlled deployment"]});
}
