import { describe, expect, it } from "vitest";
import { stableJson, toCents, toMilli } from "../src/runtime";

describe("runtime normalization", () => {
  it("stores money as integer cents", () => {
    expect(toCents("19.90")).toBe(1990);
    expect(toCents(0.1 + 0.2)).toBe(30);
  });

  it("stores fractional quantities as milliunits", () => {
    expect(toMilli("1.250")).toBe(1250);
    expect(toMilli(0.333)).toBe(333);
  });

  it("creates stable json independent of key insertion order", () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe(stableJson({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
