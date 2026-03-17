import { describe, it, expect, vi } from "vitest";
import { measureTextCached, fitText, wrapText } from "../textUtils";
function makeMockCtx() {
    const ctx = {
        measureText: vi.fn((text) => ({ width: text.length * 10 })),
        font: "",
        fillStyle: "",
        textAlign: "left",
        textBaseline: "alphabetic",
        fillText: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        globalAlpha: 1,
    };
    return ctx;
}
describe("measureTextCached", () => {
    it("caches results", () => {
        const ctx = makeMockCtx();
        measureTextCached(ctx, "hello", "Helvetica", "normal", 16);
        measureTextCached(ctx, "hello", "Helvetica", "normal", 16);
        expect(ctx.measureText).toHaveBeenCalledTimes(1);
    });
});
describe("fitText", () => {
    it("returns a fontSize that fits within width", () => {
        const ctx = makeMockCtx();
        const size = fitText({
            ctx,
            text: "hello",
            withinWidth: 200,
            fontFamily: "Helvetica",
            fontWeight: "normal",
        });
        expect(size).toBeGreaterThan(0);
    });
});
describe("wrapText", () => {
    it("wraps text into lines", () => {
        const ctx = makeMockCtx();
        const lines = wrapText(ctx, "hello world", 60, "Helvetica", "normal", 16);
        expect(lines.length).toBeGreaterThan(1);
    });
    it("keeps short text as one line", () => {
        const ctx = makeMockCtx();
        const lines = wrapText(ctx, "hi", 200, "Helvetica", "normal", 16);
        expect(lines).toHaveLength(1);
        expect(lines[0]).toBe("hi");
    });
});
