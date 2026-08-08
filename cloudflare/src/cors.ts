import { HttpError, type RuntimeEnv } from "./runtime";

const ALLOWED_HEADERS = [
  "authorization",
  "content-type",
  "x-idempotency-key",
  "x-module-id",
  "x-tenant-id",
];

export function configuredOrigins(env: RuntimeEnv): string[] {
  return String(env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function requestOriginAllowed(request: Request, env: RuntimeEnv): string | null {
  const origin = request.headers.get("origin")?.trim().replace(/\/$/, "");
  if (!origin) return null;
  return configuredOrigins(env).includes(origin) ? origin : null;
}

export function withCors(request: Request, env: RuntimeEnv, response: Response): Response {
  const origin = requestOriginAllowed(request, env);
  if (!origin) return response;
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", origin);
  headers.set("access-control-allow-credentials", "true");
  headers.append("vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export function handlePreflight(request: Request, env: RuntimeEnv): Response {
  const origin = request.headers.get("origin")?.trim().replace(/\/$/, "");
  if (!origin || !configuredOrigins(env).includes(origin)) {
    throw new HttpError(403, "CORS_ORIGIN_DENIED", "Origin is not allowed");
  }
  const requestedHeaders = String(request.headers.get("access-control-request-headers") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const denied = requestedHeaders.filter((value) => !ALLOWED_HEADERS.includes(value));
  if (denied.length) throw new HttpError(403, "CORS_HEADERS_DENIED", `Headers are not allowed: ${denied.join(", ")}`);
  const headers = new Headers({
    "access-control-allow-origin": origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": ALLOWED_HEADERS.join(", "),
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "vary": "Origin, Access-Control-Request-Headers, Access-Control-Request-Method",
  });
  return new Response(null, { status: 204, headers });
}
