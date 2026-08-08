import { applyAuthMigrations } from "./auth";
import { HttpError, constantTimeTokenMatch, header, json, required, type RuntimeEnv } from "./runtime";
import { MIGRATION_ORDER } from "./migration/domains";
import { runMigrationWave, verifyRerun } from "./migration/runner";
import type { MigrationDomain } from "./migration/types";
import { certifyStaging, cutoverPlan } from "./staging";

async function requireMigrationAccess(request:Request,env:RuntimeEnv):Promise<void>{
  if(env.APP_ENV!=="staging"||env.MIGRATION_ENABLED!=="true")throw new HttpError(403,"MIGRATION_DISABLED","Migration runtime is disabled");
  const expected=required(env.MIGRATION_TOKEN,"MIGRATION_TOKEN");
  if(!(await constantTimeTokenMatch(header(request,"x-yuisync-migration-token"),expected)))throw new HttpError(401,"INVALID_MIGRATION_TOKEN","Invalid migration token");
}

export async function handleAdmin(request:Request,env:RuntimeEnv):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==="/admin/auth/migrate"&&request.method==="POST")return applyAuthMigrations(request,env);
  if(path==="/admin/staging/certify"&&request.method==="POST")return certifyStaging(request,env);
  if(path==="/admin/cutover/plan"&&request.method==="GET")return cutoverPlan(env);
  if(path==="/admin/migrations/run"&&request.method==="POST"){
    await requireMigrationAccess(request,env);const input=await request.json() as {tenantId?:string;moduleId?:string;domains?:MigrationDomain[];dryRun?:boolean;rerun?:boolean;migrationVersion?:number};
    if(!input.tenantId||!input.moduleId)throw new HttpError(400,"MISSING_SCOPE","tenantId and moduleId are required");
    const domains=(input.domains?.length?input.domains:MIGRATION_ORDER).filter(d=>MIGRATION_ORDER.includes(d));
    const scope={tenantId:input.tenantId,moduleId:input.moduleId,migrationVersion:input.migrationVersion??1};
    if(input.rerun){const result=await verifyRerun(env,scope,domains);return json(result,result.pass?200:409);}
    return json(await runMigrationWave(env,{...scope,dryRun:input.dryRun===true},domains));
  }
  throw new HttpError(404,"NOT_FOUND","Resource not found");
}
