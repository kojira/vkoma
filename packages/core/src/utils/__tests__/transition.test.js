import { describe, it, expect, vi } from "vitest";
import { renderWithTransition } from "../transition";
function makeCanvas(w = 100, h = 100) {
    return {
        width: w,
        height: h,
    };
}
function makeMockCtx() {
    return {
        save: vi.fn(),
        restore: vi.fn(),
        globalAlpha: 1,
        drawImage: vi.fn(),
        translate: vi.fn(),
        fillRect: vi.fn(),
        fillStyle: "",
        clearRect: vi.fn(),
    };
}
describe("renderWithTransition", () => {
    it("crossfade at progress=0 draws fromCanvas full opacity", () => {
        const ctx = makeMockCtx();
        const from = makeCanvas();
        const to = makeCanvas();
        renderWithTransition({
            ctx,
            width: 100,
            height: 100,
            fromCanvas: from,
            toCanvas: to,
            progress: 0,
            type: "crossfade",
        });
        expect(ctx.drawImage).toHaveBeenCalled();
    });
    it("crossfade at progress=1 draws toCanvas", () => {
        const ctx = makeMockCtx();
        const from = makeCanvas();
        const to = makeCanvas();
        renderWithTransition({
            ctx,
            width: 100,
            height: 100,
            fromCanvas: from,
            toCanvas: to,
            progress: 1,
            type: "crossfade",
        });
        expect(ctx.drawImage).toHaveBeenCalled();
    });
    it("fade transition works", () => {
        const ctx = makeMockCtx();
        const from = makeCanvas();
        const to = makeCanvas();
        expect(() => renderWithTransition({
            ctx,
            width: 100,
            height: 100,
            fromCanvas: from,
            toCanvas: to,
            progress: 0.5,
            type: "fade",
        })).not.toThrow();
    });
});
