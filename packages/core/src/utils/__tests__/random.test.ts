import { describe, it, expect } from "vitest";
import { random, randomInt } from "../random";

describe("random", () => {
  it("returns value between 0 and 1", () => {
    expect(random(42)).toBeGreaterThanOrEqual(0);
    expect(random(42)).toBeLessThan(1);
  });
  it("is deterministic with same seed", () => {
    expect(random(42)).toBe(random(42));
  });
  it("different seeds give different values", () => {
    expect(random(1)).not.toBe(random(2));
  });
  it("works with string seeds", () => {
    expect(random("hello")).toBeGreaterThanOrEqual(0);
    expect(random("hello")).toBe(random("hello"));
  });
});

describe("randomInt", () => {
  it("returns integer in range", () => {
    const val = randomInt(1, 5, 10);
    expect(val).toBeGreaterThanOrEqual(5);
    expect(val).toBeLessThanOrEqual(10);
    expect(Number.isInteger(val)).toBe(true);
  });
});
