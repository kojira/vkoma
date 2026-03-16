import { describe, it, expect, vi } from 'vitest';
import { drawTextPart, textPartDefaultParams } from '../../parts/TextPart';
import type { TextPartParams } from '../../parts/TextPart';

function makeMockCtx(): CanvasRenderingContext2D {
  const canvas = { width: 1920, height: 1080 };
  const ctx = {
    canvas,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  let _globalAlpha = 1;
  let _fillStyle = '#fff';
  let _strokeStyle = '#000';
  let _font = '';
  let _textAlign: CanvasTextAlign = 'left';
  let _textBaseline: CanvasTextBaseline = 'alphabetic';
  let _lineWidth = 1;
  let _shadowColor = '';
  let _shadowBlur = 0;
  let _shadowOffsetX = 0;
  let _shadowOffsetY = 0;
  let _lineJoin: CanvasLineJoin = 'miter';
  Object.defineProperties(ctx, {
    globalAlpha: { get: () => _globalAlpha, set: (v) => { _globalAlpha = v; }, configurable: true },
    fillStyle: { get: () => _fillStyle, set: (v) => { _fillStyle = v; }, configurable: true },
    strokeStyle: { get: () => _strokeStyle, set: (v) => { _strokeStyle = v; }, configurable: true },
    font: { get: () => _font, set: (v) => { _font = v; }, configurable: true },
    textAlign: { get: () => _textAlign, set: (v) => { _textAlign = v; }, configurable: true },
    textBaseline: { get: () => _textBaseline, set: (v) => { _textBaseline = v; }, configurable: true },
    lineWidth: { get: () => _lineWidth, set: (v) => { _lineWidth = v; }, configurable: true },
    shadowColor: { get: () => _shadowColor, set: (v) => { _shadowColor = v; }, configurable: true },
    shadowBlur: { get: () => _shadowBlur, set: (v) => { _shadowBlur = v; }, configurable: true },
    shadowOffsetX: { get: () => _shadowOffsetX, set: (v) => { _shadowOffsetX = v; }, configurable: true },
    shadowOffsetY: { get: () => _shadowOffsetY, set: (v) => { _shadowOffsetY = v; }, configurable: true },
    lineJoin: { get: () => _lineJoin, set: (v) => { _lineJoin = v; }, configurable: true },
  });
  return ctx;
}

describe('textPartDefaultParams', () => {
  it('has expected default values', () => {
    expect(textPartDefaultParams.text).toBe('Hello World');
    expect(textPartDefaultParams.fontSize).toBe(64);
    expect(textPartDefaultParams.opacity).toBe(1);
    expect(textPartDefaultParams.effect).toBe('fade');
    expect(textPartDefaultParams.easing).toBe('easeOut');
    expect(textPartDefaultParams.align).toBe('center');
    expect(textPartDefaultParams.x).toBe(0.5);
    expect(textPartDefaultParams.y).toBe(0.5);
  });

  it('has fontFamily set', () => {
    expect(textPartDefaultParams.fontFamily).toBeTruthy();
  });
});

describe('drawTextPart', () => {
  it('runs without error with default params at time=0', () => {
    const ctx = makeMockCtx();
    expect(() => drawTextPart(ctx, 1920, 1080, 0, textPartDefaultParams)).not.toThrow();
  });

  it('runs without error at time=duration', () => {
    const ctx = makeMockCtx();
    expect(() => drawTextPart(ctx, 1920, 1080, 3, textPartDefaultParams)).not.toThrow();
  });

  it('effect=fade: at time=0 globalAlpha should be close to 0', () => {
    const ctx = makeMockCtx();
    let capturedAlpha = 1;
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => capturedAlpha,
      set: (v) => { capturedAlpha = v; },
      configurable: true,
    });
    const p: TextPartParams = { ...textPartDefaultParams, effect: 'fade', delay: 0, animDuration: 1 };
    drawTextPart(ctx, 1920, 1080, 0, p);
    expect(capturedAlpha).toBeCloseTo(0, 2);
  });

  it('effect=fade: at time=animDuration globalAlpha should be close to 1', () => {
    const ctx = makeMockCtx();
    let capturedAlpha = 0;
    Object.defineProperty(ctx, 'globalAlpha', {
      get: () => capturedAlpha,
      set: (v) => { capturedAlpha = v; },
      configurable: true,
    });
    const p: TextPartParams = { ...textPartDefaultParams, effect: 'fade', delay: 0, animDuration: 1 };
    drawTextPart(ctx, 1920, 1080, 1, p);
    expect(capturedAlpha).toBeCloseTo(1, 2);
  });

  it('effect=slide-up: adjusts Y position at time=0', () => {
    const ctx = makeMockCtx();
    const fillTextMock = vi.fn();
    (ctx as unknown as Record<string, unknown>).fillText = fillTextMock;
    const p: TextPartParams = { ...textPartDefaultParams, effect: 'slide-up', delay: 0, animDuration: 1 };
    drawTextPart(ctx, 1920, 1080, 0, p);
    expect(fillTextMock).toHaveBeenCalled();
    // At t=0, drawY should be offset from center (0.5*1080 = 540) by 0.15*1080 = 162
    const calledY = fillTextMock.mock.calls[0][2] as number;
    expect(calledY).toBeGreaterThan(540);
  });

  it('effect=none: calls fillText with full text at normalized position', () => {
    const ctx = makeMockCtx();
    const fillTextMock = vi.fn();
    (ctx as unknown as Record<string, unknown>).fillText = fillTextMock;
    const p: TextPartParams = { ...textPartDefaultParams, effect: 'none' };
    drawTextPart(ctx, 1920, 1080, 1, p);
    expect(fillTextMock).toHaveBeenCalledWith('Hello World', 960, 540);
  });

  it('outline=true: calls strokeText', () => {
    const ctx = makeMockCtx();
    const strokeTextMock = vi.fn();
    (ctx as unknown as Record<string, unknown>).strokeText = strokeTextMock;
    const p: TextPartParams = { ...textPartDefaultParams, outline: true, effect: 'none' };
    drawTextPart(ctx, 1920, 1080, 1, p);
    expect(strokeTextMock).toHaveBeenCalled();
  });

  it('typewriter effect: clips text to visible chars at 50% progress', () => {
    const ctx = makeMockCtx();
    const fillTextMock = vi.fn();
    (ctx as unknown as Record<string, unknown>).fillText = fillTextMock;
    const p: TextPartParams = { ...textPartDefaultParams, effect: 'typewriter', text: 'Hello', delay: 0, animDuration: 1 };
    drawTextPart(ctx, 1920, 1080, 0.5, p);
    const calledText = fillTextMock.mock.calls[0][0] as string;
    expect(calledText.length).toBeLessThan(5);
    expect(calledText.length).toBeGreaterThan(0);
  });
});
