import { describe, it, expect, vi } from 'vitest';
import { drawShapePart, shapePartDefaultParams } from '../../parts/ShapePart';
function makeMockCtx() {
    const ctx = {
        canvas: { width: 1920, height: 1080 },
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        fill: vi.fn(),
        stroke: vi.fn(),
        rect: vi.fn(),
        roundRect: vi.fn(),
        arc: vi.fn(),
        ellipse: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
    };
    let _globalAlpha = 1;
    let _fillStyle = '#fff';
    let _strokeStyle = '#000';
    let _lineWidth = 1;
    Object.defineProperties(ctx, {
        globalAlpha: { get: () => _globalAlpha, set: (v) => { _globalAlpha = v; }, configurable: true },
        fillStyle: { get: () => _fillStyle, set: (v) => { _fillStyle = v; }, configurable: true },
        strokeStyle: { get: () => _strokeStyle, set: (v) => { _strokeStyle = v; }, configurable: true },
        lineWidth: { get: () => _lineWidth, set: (v) => { _lineWidth = v; }, configurable: true },
    });
    return ctx;
}
describe('shapePartDefaultParams', () => {
    it('has expected default values', () => {
        expect(shapePartDefaultParams.type).toBe('rect');
        expect(shapePartDefaultParams.opacity).toBe(1.0);
        expect(shapePartDefaultParams.effect).toBe('none');
        expect(shapePartDefaultParams.fill).toBe('#6366f1');
    });
});
describe('drawShapePart (rect)', () => {
    it('runs without error', () => {
        const ctx = makeMockCtx();
        expect(() => drawShapePart(ctx, shapePartDefaultParams, 1, 3)).not.toThrow();
    });
    it('calls beginPath and fill', () => {
        const ctx = makeMockCtx();
        const beginPathMock = vi.fn();
        const fillMock = vi.fn();
        ctx.beginPath = beginPathMock;
        ctx.fill = fillMock;
        drawShapePart(ctx, { ...shapePartDefaultParams, effect: 'none' }, 1, 3);
        expect(beginPathMock).toHaveBeenCalled();
        expect(fillMock).toHaveBeenCalled();
    });
    it('cornerRadius > 0 calls roundRect', () => {
        const ctx = makeMockCtx();
        const roundRectMock = vi.fn();
        ctx.roundRect = roundRectMock;
        const p = { ...shapePartDefaultParams, cornerRadius: 10, effect: 'none' };
        drawShapePart(ctx, p, 1, 3);
        expect(roundRectMock).toHaveBeenCalled();
    });
});
describe('drawShapePart (circle)', () => {
    it('runs without error', () => {
        const ctx = makeMockCtx();
        const p = { ...shapePartDefaultParams, type: 'circle', effect: 'none' };
        expect(() => drawShapePart(ctx, p, 1, 3)).not.toThrow();
    });
    it('calls arc()', () => {
        const ctx = makeMockCtx();
        const arcMock = vi.fn();
        ctx.arc = arcMock;
        const p = { ...shapePartDefaultParams, type: 'circle', effect: 'none' };
        drawShapePart(ctx, p, 1, 3);
        expect(arcMock).toHaveBeenCalled();
    });
});
describe('drawShapePart (ellipse)', () => {
    it('calls ellipse()', () => {
        const ctx = makeMockCtx();
        const ellipseMock = vi.fn();
        ctx.ellipse = ellipseMock;
        const p = { ...shapePartDefaultParams, type: 'ellipse', effect: 'none' };
        drawShapePart(ctx, p, 1, 3);
        expect(ellipseMock).toHaveBeenCalled();
    });
});
describe('drawShapePart (line)', () => {
    it('calls moveTo and lineTo', () => {
        const ctx = makeMockCtx();
        const moveToMock = vi.fn();
        const lineToMock = vi.fn();
        ctx.moveTo = moveToMock;
        ctx.lineTo = lineToMock;
        const p = { ...shapePartDefaultParams, type: 'line', stroke: '#fff', strokeWidth: 2, effect: 'none' };
        drawShapePart(ctx, p, 1, 3);
        expect(moveToMock).toHaveBeenCalled();
        expect(lineToMock).toHaveBeenCalled();
    });
});
describe('drawShapePart animations', () => {
    it('effect=fade at time=0: globalAlpha near 0', () => {
        const ctx = makeMockCtx();
        let capturedAlpha = 1;
        Object.defineProperty(ctx, 'globalAlpha', {
            get: () => capturedAlpha,
            set: (v) => { capturedAlpha = v; },
            configurable: true,
        });
        const p = { ...shapePartDefaultParams, effect: 'fade', delay: 0, animDuration: 1 };
        drawShapePart(ctx, p, 0, 3);
        expect(capturedAlpha).toBeCloseTo(0, 2);
    });
});
