import { describe, expect, it } from "vitest";
import { resolveMigrationDomains } from "../src/migration/runner";

describe("migration domain selection", () => {
  it("adds transitive prerequisites before appointments", () => {
    expect(resolveMigrationDomains(["appointments"])).toEqual([
      "clients_pets",
      "catalog",
      "appointments",
    ]);
  });

  it("adds the full commerce dependency chain before fiscal", () => {
    expect(resolveMigrationDomains(["fiscal"])).toEqual([
      "clients_pets",
      "catalog",
      "sales",
      "payments",
      "fiscal",
    ]);
  });

  it("keeps the canonical topological order for mixed selections", () => {
    expect(resolveMigrationDomains(["motodog", "operations"])).toEqual([
      "clients_pets",
      "catalog",
      "appointments",
      "motodog",
      "chat",
      "operations",
    ]);
  });
});
