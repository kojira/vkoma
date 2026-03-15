import { describe, it, expect } from "vitest";
import { interpolate, Easing } from "../interpolate";

describe("interpolate", () => {
  it("maps value linearly within range", () => {
    expect(interpolate(0.5, [0, 1], [0, 100])).toBeCloseTo(50);
  });
  it("clamps by default", () => {
    expect(interpolate(-1, [0, 1], [0, 100])).toBeCloseTo(0);
    expect(interpolate(2, [0, 1], [0, 100])).toBeCloseTo(100);
  });
  it("extrapolate extend works", () => {
    const result = interpolate(2, [0, 1], [0, 100], {
      extrapolateRight: "extend",
    });
    expect(result).toBeCloseTo(200);
  });
  it("multi-range mapping", () => {
    expect(interpolate(0.5, [0, 0.5, 1], [0, 50, 200])).toBeCloseTo(50);
    expect(interpolate(0.75, [0, 0.5, 1], [0, 50, 200])).toBeCloseTo(125);
  });
});

describe("Easing", () => {
  it("linear is identity", () => {
    expect(Easing.linear(0.5)).toBeCloseTo(0.5);
  });
  it("easeIn starts slow", () => {
    expect(Easing.easeIn(0.1)).toBeLessThan(0.1);
  });
  it("easeOut ends slow", () => {
    expect(Easing.easeOut(0.9)).toBeGreaterThan(0.9);
  });
  it("bezier(0,0,1,1) is linear", () => {
    const fn = Easing.bezier(0, 0, 1, 1);
    expect(fn(0.5)).toBeCloseTo(0.5, 1);
  });
});
