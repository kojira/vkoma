import { describe, it, expect } from "vitest";
import { parseColor, colorToString, interpolateColors } from "../colors";

describe("parseColor", () => {
  it("parses hex6", () => {
    const c = parseColor("#ff0000");
    expect(c).toEqual({ r: 255, g: 0, b: 0, a: 1 });
  });
  it("parses hex3", () => {
    const c = parseColor("#fff");
    expect(c).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });
  it("parses rgb()", () => {
    const c = parseColor("rgb(100, 150, 200)");
    expect(c).toEqual({ r: 100, g: 150, b: 200, a: 1 });
  });
  it("parses rgba()", () => {
    const c = parseColor("rgba(100, 150, 200, 0.5)");
    expect(c).toEqual({ r: 100, g: 150, b: 200, a: 0.5 });
  });
});

describe("interpolateColors", () => {
  it("returns first color at 0", () => {
    const result = interpolateColors(0, [0, 1], ["#ff0000", "#0000ff"]);
    expect(result).toBe("rgba(255, 0, 0, 1)");
  });
  it("returns last color at 1", () => {
    const result = interpolateColors(1, [0, 1], ["#ff0000", "#0000ff"]);
    expect(result).toBe("rgba(0, 0, 255, 1)");
  });
  it("interpolates midpoint", () => {
    const result = interpolateColors(0.5, [0, 1], ["#000000", "#ffffff"]);
    expect(result).toBe("rgba(128, 128, 128, 1)");
  });
  it("handles multiple keyframes", () => {
    const result = interpolateColors(0.5, [0, 0.5, 1], [
      "#ff0000",
      "#00ff00",
      "#0000ff",
    ]);
    expect(result).toBe("rgba(0, 255, 0, 1)");
  });
});
