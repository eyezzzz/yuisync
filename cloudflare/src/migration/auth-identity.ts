import type { DomainMigration } from "./types";
import { boolInt, jsonArray, jsonObject, mappedFingerprint, normalizePermissionList, normalizeSpecies, normalizeTransport, nullable, stableJson, tagged, taggedChildren, targetId, text, toCents, toMilli, unit, type TaggedRow } from "./common";

export const authIdentity: DomainMigration = {
  domain: "auth_identity",
  dependencies: [],
  async extract(context) {
    return await tagged(context, "profiles", { tenantScoped: false, moduleScoped: false });
  },
  async normalize(raw, context) {
    const row = raw as TaggedRow;
    const legacyId = text(row.id);
    if (!legacyId || boolInt(row.active, true) === 0) return [];

    const role = text(row.role, "employee");
    const allowed = jsonArray(row.allowed_modules).map(String);
    const permissions = jsonObject(row.module_permissions);
    if (role !== "admin" && !allowed.includes(context.scope.moduleId)) return [];

    const t = context.scope.tenantId;
    const m = context.scope.moduleId;
    const principal = `legacy:${legacyId}`;
    const mappingId = `supabase:${legacyId}`;
    const scopedPermissions = normalizePermissionList(permissions[m] ?? permissions, role);
    const mapFp = {
      legacy_provider: "supabase",
      legacy_user_id: legacyId,
      auth_user_id: null,
      legacy_email: nullable(row.email)?.toLowerCase() ?? null,
      status: "pending_reauthentication",
      tenant_id: null,
      module_id: null,
    };
    const membershipFp = {
      id: `membership:${legacyId}:${t}:${m}`,
      user_id: principal,
      tenant_id: t,
      module_id: m,
      role,
      permissions_json: stableJson(scopedPermissions),
    };

    return [
      unit(
        context,
        row,
        "legacy_identity_mappings",
        mappingId,
        context.env.DB.prepare(`
          INSERT INTO legacy_identity_mappings(legacy_provider,legacy_user_id,auth_user_id,legacy_email,status,tenant_id,module_id,migrated_at)
          VALUES('supabase',?,?,?,'pending_reauthentication',NULL,NULL,CURRENT_TIMESTAMP)
          ON CONFLICT(legacy_provider,legacy_user_id) DO UPDATE SET legacy_email=excluded.legacy_email
        `).bind(legacyId, null, mapFp.legacy_email),
        mapFp,
      ),
      unit(
        context,
        { ...row, __source_table: `${row.__source_table}.membership` } as TaggedRow,
        "tenant_memberships",
        membershipFp.id,
        context.env.DB.prepare(`
          INSERT INTO tenant_memberships(id,user_id,tenant_id,module_id,role,permissions_json,active,created_at,updated_at)
          VALUES(?,?,?,?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
          ON CONFLICT(user_id,tenant_id,module_id) DO UPDATE SET role=excluded.role,permissions_json=excluded.permissions_json,active=1,updated_at=CURRENT_TIMESTAMP
        `).bind(membershipFp.id, principal, t, m, role, membershipFp.permissions_json),
        membershipFp,
      ),
    ];
  },
  targetFingerprint: (context) => mappedFingerprint(context, "auth_identity"),
};
