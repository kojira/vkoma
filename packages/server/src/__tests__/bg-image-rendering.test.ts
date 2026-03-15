import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @napi-rs/canvas (imported transitively by render-frame -> core)
vi.mock("@napi-rs/canvas", () => ({
  createCanvas: vi.fn(),
  loadImage: vi.fn(),
  GlobalFonts: { registerFromPath: vi.fn() },
}));

// Mock core's renderScene so we can observe calls without side effects
vi.mock("../../../core/src/index", () => ({
  renderScene: vi.fn(),
}));

import { renderFrameWithBg, type CanvasContext2D } from "../render-frame";
import { renderScene } from "../../../core/src/index";

function makeCtx(): CanvasContext2D & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    globalAlpha: 1.0,
    globalCompositeOperation: 'source-over' as string,
    clearRect: vi.fn((..._args: any[]) => {
      calls.push("clearRect");
    }),
    drawImage: vi.fn((..._args: any[]) => {
      calls.push("drawImage");
    }),
  };
}

function makeScene(params: Record<string, unknown> = {}) {
  return {
    id: "test-scene",
    name: "Test",
    duration: 3,
    sceneConfig: { id: "test", name: "Test", duration: 3, defaultParams: {}, draw: vi.fn() },
    params,
  };
}

describe("renderFrameWithBg", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders without bg image: globalAlpha stays 1.0 throughout", () => {
    const ctx = makeCtx();
    const scene = makeScene({});
    const imageCache = new Map<string, any>();

    renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 0, imageCache });

    expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 1920, 1080);
    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(renderScene).toHaveBeenCalledWith(scene, ctx, 1920, 1080, 0);
    expect(ctx.globalAlpha).toBe(1.0);
  });

  it("draws bg image and sets globalAlpha to default 0.82 when bgAlpha is not specified", () => {
    const ctx = makeCtx();
    const fakeImage = { width: 1920, height: 1080 };
    const imageCache = new Map<string, any>([["bg.png", fakeImage]]);
    const scene = makeScene({ bgImagePath: "bg.png" });

    // Capture globalAlpha at the time drawImage is called (destination-over)
    let alphaAtDrawImage: number | undefined;
    ctx.drawImage = vi.fn((..._args: any[]) => {
      alphaAtDrawImage = ctx.globalAlpha;
      ctx.calls.push("drawImage");
    });

    vi.mocked(renderScene).mockImplementation(() => {
      ctx.calls.push("renderScene");
    });

    renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 1.5, imageCache });

    expect(ctx.drawImage).toHaveBeenCalledWith(fakeImage, 0, 0, 1920, 1080);
    expect(alphaAtDrawImage).toBe(0.82);
    // After render, globalAlpha must be reset to 1.0
    expect(ctx.globalAlpha).toBe(1.0);
  });

  it("uses custom bgAlpha when provided", () => {
    const ctx = makeCtx();
    const fakeImage = {};
    const imageCache = new Map<string, any>([["bg.png", fakeImage]]);
    const scene = makeScene({ bgImagePath: "bg.png", bgAlpha: 0.5 });

    let alphaAtDrawImage: number | undefined;
    ctx.drawImage = vi.fn((..._args: any[]) => {
      alphaAtDrawImage = ctx.globalAlpha;
      ctx.calls.push("drawImage");
    });

    vi.mocked(renderScene).mockImplementation(() => {
      ctx.calls.push("renderScene");
    });

    renderFrameWithBg({ scene, ctx, width: 800, height: 600, localTime: 0, imageCache });

    expect(alphaAtDrawImage).toBe(0.5);
    expect(ctx.globalAlpha).toBe(1.0);
  });

  it("renderScene throw propagates and drawImage is not called", () => {
    const ctx = makeCtx();
    const fakeImage = {};
    const imageCache = new Map<string, any>([["bg.png", fakeImage]]);
    const scene = makeScene({ bgImagePath: "bg.png" });

    vi.mocked(renderScene).mockImplementation(() => {
      throw new Error("render error");
    });

    // renderScene throws before drawImage (destination-over) is reached
    expect(() =>
      renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 0, imageCache }),
    ).toThrow("render error");

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });

  it("does not draw bg image when bgImagePath is not in cache", () => {
    const ctx = makeCtx();
    const imageCache = new Map<string, any>();
    const scene = makeScene({ bgImagePath: "missing.png" });

    renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 0, imageCache });

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1.0);
  });

  it("does not draw bg image when bgImagePath is empty string", () => {
    const ctx = makeCtx();
    const imageCache = new Map<string, any>([["", {}]]);
    const scene = makeScene({ bgImagePath: "" });

    renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 0, imageCache });

    expect(ctx.drawImage).not.toHaveBeenCalled();
    expect(ctx.globalAlpha).toBe(1.0);
  });

  it("call order: clearRect -> renderScene -> drawImage (destination-over)", () => {
    const ctx = makeCtx();
    const fakeImage = {};
    const imageCache = new Map<string, any>([["bg.png", fakeImage]]);
    const scene = makeScene({ bgImagePath: "bg.png" });

    vi.mocked(renderScene).mockImplementation(() => {
      ctx.calls.push("renderScene");
    });

    renderFrameWithBg({ scene, ctx, width: 1920, height: 1080, localTime: 0, imageCache });

    expect(ctx.calls).toEqual(["clearRect", "renderScene", "drawImage"]);
  });
});
