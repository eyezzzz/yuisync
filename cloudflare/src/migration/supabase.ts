import { HttpError, required } from "../runtime";
import type { MigrationContext, SourceRow } from "./types";

const PAGE_SIZE = 1000;

function encodeEq(value: string): string {
  return `eq.${value}`;
}

export async function extractTable(
  context: MigrationContext,
  table: string,
  options: {
    select?: string;
    tenantScoped?: boolean;
    moduleScoped?: boolean;
    extra?: Record<string, string>;
    optional?: boolean;
  } = {},
): Promise<SourceRow[]> {
  const baseUrl = required(context.env.SUPABASE_URL, "SUPABASE_URL").replace(/\/$/, "");
  const serviceRole = required(context.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY");
  const rows: SourceRow[] = [];

  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = new URL(`${baseUrl}/rest/v1/${table}`);
    url.searchParams.set("select", options.select ?? "*");
    if (options.tenantScoped !== false) url.searchParams.set("tenant_id", encodeEq(context.scope.tenantId));
    if (options.moduleScoped !== false) url.searchParams.set("module_id", encodeEq(context.scope.moduleId));
    for (const [key, value] of Object.entries(options.extra ?? {})) url.searchParams.set(key, value);

    const response = await fetch(url, {
      headers: {
        apikey: serviceRole,
        authorization: `Bearer ${serviceRole}`,
        range: `${offset}-${offset + PAGE_SIZE - 1}`,
        "range-unit": "items",
        prefer: "count=exact",
      },
    });

    if (!response.ok) {
      if (options.optional && response.status === 404) return [];
      const body = await response.text();
      if (options.optional && /does not exist|schema cache|could not find/i.test(body)) return [];
      throw new HttpError(502, "SOURCE_EXTRACT_FAILED", `Failed to extract ${table}`, {
        status: response.status,
        body: body.slice(0, 500),
      });
    }

    const page = await response.json() as SourceRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function extractFirstAvailable(
  context: MigrationContext,
  tables: string[],
  options: Parameters<typeof extractTable>[2] = {},
): Promise<{ table: string; rows: SourceRow[] }> {
  for (const table of tables) {
    const rows = await extractTable(context, table, { ...options, optional: true });
    if (rows.length) return { table, rows };
  }
  return { table: tables[0] ?? "unknown", rows: [] };
}
