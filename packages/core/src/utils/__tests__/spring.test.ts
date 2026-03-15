import { describe, it, expect } from "vitest";
import { spring } from "../spring";

describe("spring", () => {
  it("starts near from value", () => {
    expect(spring({ frame: 0, fps: 30 })).toBeCloseTo(0, 2);
  });
  it("converges to 1 by frame 60", () => {
    const val = spring({ frame: 60, fps: 30 });
    expect(val).toBeGreaterThan(0.95);
  });
  it("respects from/to", () => {
    const val = spring({ frame: 60, fps: 30, from: 100, to: 200 });
    expect(val).toBeGreaterThan(195);
  });
  it("with high damping no overshoot", () => {
    const val = spring({
      frame: 30,
      fps: 30,
      config: { damping: 30, stiffness: 100, overshootClamping: true },
    });
    expect(val).toBeGreaterThanOrEqual(0);
    expect(val).toBeLessThanOrEqual(1);
  });
});
