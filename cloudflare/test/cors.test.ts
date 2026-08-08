import { describe, expect, it } from "vitest";
import { configuredOrigins, handlePreflight, withCors } from "../src/cors";
import type { RuntimeEnv } from "../src/runtime";

const env = { CORS_ALLOWED_ORIGINS: "https://staging.example.com, http://localhost:3080/" } as RuntimeEnv;

describe("credentialed CORS boundary", () => {
  it("normalizes the configured origin list", () => {
    expect(configuredOrigins(env)).toEqual(["https://staging.example.com", "http://localhost:3080"]);
  });

  it("adds credentials only for approved origins", async () => {
    const allowed = withCors(new Request("https://edge.example.com/v1/clients", { headers: { origin: "https://staging.example.com" } }), env, Response.json({ ok: true }));
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://staging.example.com");
    expect(allowed.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = withCors(new Request("https://edge.example.com/v1/clients", { headers: { origin: "https://evil.example.com" } }), env, Response.json({ ok: true }));
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("accepts a scoped preflight from an approved origin", () => {
    const response = handlePreflight(new Request("https://edge.example.com/v1/clients", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3080",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization, x-tenant-id, x-module-id",
      },
    }), env);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3080");
  });

  it("rejects arbitrary preflight headers", () => {
    expect(() => handlePreflight(new Request("https://edge.example.com/v1/clients", {
      method: "OPTIONS",
      headers: {
        origin: "https://staging.example.com",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-untrusted-header",
      },
    }), env)).toThrow(/Headers are not allowed/);
  });
});
