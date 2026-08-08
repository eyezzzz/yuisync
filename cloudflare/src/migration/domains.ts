import type { DomainMigration, MigrationDomain } from "./types";
import { clientsPets } from "./clients-pets";
import { catalog, inventory } from "./reference";
import { appointments, motodog, operationalConfig } from "./operational";
import { payments, sales } from "./commerce";
import { chat, fiscal, operations } from "./conversation";
import { authIdentity } from "./auth-identity";

export const DOMAIN_MIGRATIONS: Record<MigrationDomain, DomainMigration> = {
  clients_pets: clientsPets,
  catalog,
  inventory,
  operational_config: operationalConfig,
  appointments,
  motodog,
  sales,
  payments,
  chat,
  operations,
  fiscal,
  auth_identity: authIdentity,
};

export const MIGRATION_ORDER: MigrationDomain[] = [
  "clients_pets", "catalog", "operational_config", "inventory", "appointments", "motodog",
  "sales", "payments", "chat", "operations", "fiscal", "auth_identity",
];
