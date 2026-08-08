import { handleAuthRequest } from "./auth";
import { handleAdmin } from "./admin";
import { handlePreflight, withCors } from "./cors";
import { handleDomainApi } from "./domain/api";
import { handleQueue } from "./effects";
import { errorResponse, json, type RuntimeEnv } from "./runtime";
import { readiness } from "./staging";
export { OperationCoordinator } from "./operation-coordinator";

async function route(request:Request,env:RuntimeEnv):Promise<Response>{
  const url=new URL(request.url);
  if(url.pathname==="/health")return json({ok:true,service:"yuisync-next-edge",environment:env.APP_ENV});
  if(url.pathname==="/readiness")return readiness(env);
  if(url.pathname.startsWith("/api/auth/"))return handleAuthRequest(request,env);
  if(url.pathname.startsWith("/admin/"))return handleAdmin(request,env);
  if(url.pathname.startsWith("/v1/"))return handleDomainApi(request,env);
  return json({error:{code:"NOT_FOUND",message:"Resource not found"}},404);
}

export default {
  async fetch(request:Request,env:RuntimeEnv):Promise<Response>{
    try{
      if(request.method==="OPTIONS")return handlePreflight(request,env);
      return withCors(request,env,await route(request,env));
    }catch(error){
      return withCors(request,env,errorResponse(error));
    }
  },
  async queue(batch:MessageBatch<unknown>,env:RuntimeEnv):Promise<void>{await handleQueue(batch,env);},
} satisfies ExportedHandler<RuntimeEnv>;
