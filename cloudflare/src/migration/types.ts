import type { RuntimeEnv } from "../runtime";

export type MigrationDomain =
  | "clients_pets"
  | "catalog"
  | "inventory"
  | "operational_config"
  | "appointments"
  | "motodog"
  | "sales"
  | "payments"
  | "chat"
  | "operations"
  | "fiscal"
  | "auth_identity";

export type MigrationScope = {
  tenantId: string;
  moduleId: string;
  migrationVersion: number;
  dryRun: boolean;
};

export type SourceRow = Record<string, unknown> & { id?: unknown };

export type MigrationContext = {
  env: RuntimeEnv;
  scope: MigrationScope;
  runId: string;
};

export type WriteUnit = {
  table: string;
  sourceSystem: "supabase";
  sourceId: string;
  targetId: string;
  statement: D1PreparedStatement;
  fingerprint: Record<string, unknown>;
};

export type DomainResult = {
  sourceCount: number;
  normalizedCount: number;
  writtenCount: number;
  rejectedCount: number;
  sourceFingerprint: string;
  targetFingerprint: string;
  metrics: Record<string, unknown>;
};

export type DomainMigration = {
  domain: MigrationDomain;
  dependencies: MigrationDomain[];
  extract(context: MigrationContext): Promise<SourceRow[]>;
  normalize(row: SourceRow, context: MigrationContext): Promise<WriteUnit[]>;
  targetFingerprint(context: MigrationContext): Promise<{ fingerprint: string; metrics: Record<string, unknown> }>;
};
