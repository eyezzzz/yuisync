import { describe, expect, it } from "vitest";
import { DOMAIN_MIGRATIONS, MIGRATION_ORDER } from "../src/migration/domains";

describe("migration dependency order", () => {
  it("orders every in-wave dependency before its dependent domain", () => {
    const index = new Map(MIGRATION_ORDER.map((domain, position) => [domain, position]));
    for (const domain of MIGRATION_ORDER) {
      for (const dependency of DOMAIN_MIGRATIONS[domain].dependencies) {
        expect(index.get(dependency)).toBeLessThan(index.get(domain));
      }
    }
  });
});
