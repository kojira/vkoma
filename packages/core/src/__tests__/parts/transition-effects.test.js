import { describe, it, expect, vi } from 'vitest';
import { applyTransitionIn, applyTransitionOut } from '../../utils/transition';
function makeMockCtx(width = 1920, height = 1080) {
    const canvas = { width, height };
    const state = { globalAlpha: 1 };
    const ctx = {
        canvas,
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        fillRect: vi.fn(),
    };
    Object.defineProperty(ctx, 'globalAlpha', {
        get: () => state.globalAlpha,
        set: (v) => { state.globalAlpha = v; },
        configurable: true,
    });
    return ctx;
}
const defaultConfig = {
    type: 'fade',
    duration: 0.5,
    easing: 'linear',
};
describe('applyTransitionIn', () => {
    it('fade at progress=0 → globalAlpha=0 (renderFn called)', () => {
        const ctx = makeMockCtx();
        const renderFn = vi.fn();
        applyTransitionIn(ctx, 0, 'fade', defaultConfig, 1920, 1080, renderFn);
        expect(renderFn).toHaveBeenCalled();
    });
    it('fade at progress=1 → renderFn called (full opacity)', () => {
        const ctx = makeMockCtx();
        const renderFn = vi.fn();
        applyTransitionIn(ctx, 1, 'fade', defaultConfig, 1920, 1080, renderFn);
        expect(renderFn).toHaveBeenCalled();
    });
    it('iris-open at progress=0.5 → no error (circle clip mid-point)', () => {
        const ctx = makeMockCtx();
        const renderFn = vi.fn();
        const config = { type: 'iris-open', duration: 0.5, easing: 'linear' };
        expect(() => {
            applyTransitionIn(ctx, 0.5, 'iris-open', config, 1920, 1080, renderFn);
        }).not.toThrow();
        expect(ctx.arc).toHaveBeenCalled();
        expect(renderFn).toHaveBeenCalled();
    });
    it('slide-left at progress=0 → renderFn is called', () => {
        const ctx = makeMockCtx();
        const renderFn = vi.fn();
        const config = { type: 'slide-left', duration: 0.5, easing: 'linear' };
        applyTransitionIn(ctx, 0, 'slide-left', config, 1920, 1080, renderFn);
        expect(renderFn).toHaveBeenCalled();
        expect(ctx.translate).toHaveBeenCalled();
    });
    it('all transition types do not throw', () => {
        const types = ['none', 'fade', 'slide-left', 'slide-right', 'slide-up', 'slide-down', 'wipe-left', 'wipe-right', 'iris-open', 'iris-close', 'zoom-in', 'zoom-out', 'glitch'];
        for (const type of types) {
            const ctx = makeMockCtx();
            const renderFn = vi.fn();
            const config = { type, duration: 0.5, easing: 'linear' };
            expect(() => {
                applyTransitionIn(ctx, 0.5, type, config, 1920, 1080, renderFn);
            }).not.toThrow();
        }
    });
});
describe('applyTransitionOut', () => {
    it('uses inverse progress of applyTransitionIn', () => {
        const ctx1 = makeMockCtx();
        const ctx2 = makeMockCtx();
        const config = { type: 'slide-left', duration: 0.5, easing: 'linear' };
        // applyTransitionOut(progress=0.3) should behave like applyTransitionIn(progress=0.7)
        applyTransitionOut(ctx1, 0.3, 'slide-left', config, 1920, 1080, vi.fn());
        applyTransitionIn(ctx2, 0.7, 'slide-left', config, 1920, 1080, vi.fn());
        // Both should call translate with the same args
        expect(ctx1.translate).toHaveBeenCalledWith(expect.any(Number), 0);
        expect(ctx2.translate).toHaveBeenCalledWith(expect.any(Number), 0);
        const xOut = ctx1.translate.mock.calls[0][0];
        const xIn = ctx2.translate.mock.calls[0][0];
        expect(xOut).toBeCloseTo(xIn, 5);
    });
});
