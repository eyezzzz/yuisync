import { resolveAuthContext, resolveSessionIdentity } from "../auth";
import { HttpError, json, parseJson, type RuntimeEnv } from "../runtime";
import { handleAppointments } from "./appointments";
import { handleProducts, handleServices } from "./catalog";
import { handleClients } from "./clients";
import { handleSales } from "./sales";
import { handleSettings } from "./settings";

function pathParts(request: Request): string[] {
  return new URL(request.url).pathname.replace(/^\/v1\/?/, "").split("/").filter(Boolean);
}

async function sessionInfo(request: Request, env: RuntimeEnv): Promise<Response> {
  const identity = await resolveSessionIdentity(request, env);
  const memberships = await env.DB.prepare(`
    SELECT m.tenant_id,m.module_id,m.role,m.permissions_json,t.name tenant_name,t.active tenant_active
    FROM tenant_memberships m JOIN tenants t ON t.id=m.tenant_id
    WHERE m.user_id=? AND m.active=1 AND t.active=1 ORDER BY t.name,m.module_id
  `).bind(identity.userId).all<{tenant_id:string;module_id:string;role:string;permissions_json:string;tenant_name:string;tenant_active:number}>();
  return json({ data: { user: { id: identity.userId, email: identity.email, name: identity.name }, memberships: (memberships.results??[]).map((row) => ({ tenantId: row.tenant_id, tenantName: row.tenant_name, moduleId: row.module_id, role: row.role, permissions: parseJson(row.permissions_json, []) })) } });
}

export async function handleDomainApi(request: Request, env: RuntimeEnv): Promise<Response> {
  const [resource, id] = pathParts(request);
  if (resource === "session") return sessionInfo(request, env);
  const auth = await resolveAuthContext(request, env);
  switch (resource) {
    case "clients": return handleClients(request, env, auth, id);
    case "products": return handleProducts(request, env, auth, id);
    case "services": return handleServices(request, env, auth, id);
    case "appointments": return handleAppointments(request, env, auth, id);
    case "sales": return handleSales(request, env, auth, id);
    case "settings": return handleSettings(request, env, auth);
    default: throw new HttpError(404, "NOT_FOUND", "Resource not found");
  }
}
