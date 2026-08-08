import { applyAuthMigrations } from "./auth";
import { HttpError, constantTimeTokenMatch, header, json, required, type RuntimeEnv } from "./runtime";
import { MIGRATION_ORDER } from "./migration/domains";
import { resolveMigrationDomains, runMigrationWave, verifyRerun } from "./migration/runner";
import type { MigrationDomain } from "./migration/types";
import { certifyStaging, cutoverPlan } from "./staging";

async function requireMigrationAccess(request:Request,env:RuntimeEnv):Promise<void>{
  if(env.APP_ENV!=="staging"||env.MIGRATION_ENABLED!=="true")throw new HttpError(403,"MIGRATION_DISABLED","Migration runtime is disabled");
  const expected=required(env.MIGRATION_TOKEN,"MIGRATION_TOKEN");
  if(!(await constantTimeTokenMatch(header(request,"x-yuisync-migration-token"),expected)))throw new HttpError(401,"INVALID_MIGRATION_TOKEN","Invalid migration token");
}

function parseDomains(value: unknown): MigrationDomain[] {
  if (value == null) return MIGRATION_ORDER;
  if (!Array.isArray(value) || value.length === 0) throw new HttpError(400,"INVALID_MIGRATION_DOMAINS","domains must be a non-empty array when provided");
  const unknown = value.map(String).filter((domain) => !MIGRATION_ORDER.includes(domain as MigrationDomain));
  if (unknown.length) throw new HttpError(400,"UNKNOWN_MIGRATION_DOMAIN",`Unknown migration domains: ${unknown.join(", ")}`);
  return resolveMigrationDomains(value as MigrationDomain[]);
}

export async function handleAdmin(request:Request,env:RuntimeEnv):Promise<Response>{
  const path=new URL(request.url).pathname;
  if(path==="/admin/auth/migrate"&&request.method==="POST")return applyAuthMigrations(request,env);
  if(path==="/admin/staging/certify"&&request.method==="POST")return certifyStaging(request,env);
  if(path==="/admin/cutover/plan"&&request.method==="GET")return cutoverPlan(env);
  if(path==="/admin/migrations/run"&&request.method==="POST"){
    await requireMigrationAccess(request,env);
    const input=await request.json() as {tenantId?:string;moduleId?:string;domains?:MigrationDomain[];dryRun?:boolean;rerun?:boolean;migrationVersion?:number};
    if(!input.tenantId||!input.moduleId)throw new HttpError(400,"MISSING_SCOPE","tenantId and moduleId are required");
    const domains=parseDomains(input.domains);
    const migrationVersion=Number(input.migrationVersion??1);
    if(!Number.isInteger(migrationVersion)||migrationVersion<1)throw new HttpError(400,"INVALID_MIGRATION_VERSION","migrationVersion must be a positive integer");
    const scope={tenantId:input.tenantId,moduleId:input.moduleId,migrationVersion};
    if(input.rerun){
      const result=await verifyRerun(env,scope,domains);
      return json({domains,...result},result.pass?200:409);
    }
    return json({domains,results:await runMigrationWave(env,{...scope,dryRun:input.dryRun===true},domains)});
  }
  throw new HttpError(404,"NOT_FOUND","Resource not found");
}
