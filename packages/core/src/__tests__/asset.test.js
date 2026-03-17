import { describe, expect, it } from "vitest";
import { getAssetType, getAssetsByType } from "../asset";
describe("getAssetType", () => {
    it("returns 'image' for image/png", () => {
        expect(getAssetType("image/png")).toBe("image");
    });
    it("returns 'image' for image/jpeg", () => {
        expect(getAssetType("image/jpeg")).toBe("image");
    });
    it("returns 'image' for image/webp", () => {
        expect(getAssetType("image/webp")).toBe("image");
    });
    it("returns 'audio' for audio/mpeg", () => {
        expect(getAssetType("audio/mpeg")).toBe("audio");
    });
    it("returns 'audio' for audio/wav", () => {
        expect(getAssetType("audio/wav")).toBe("audio");
    });
    it("returns 'video' for video/mp4", () => {
        expect(getAssetType("video/mp4")).toBe("video");
    });
    it("returns 'video' for video/webm", () => {
        expect(getAssetType("video/webm")).toBe("video");
    });
    it("returns 'font' for font/ttf", () => {
        expect(getAssetType("font/ttf")).toBe("font");
    });
    it("returns null for application/pdf", () => {
        expect(getAssetType("application/pdf")).toBeNull();
    });
    it("returns null for unknown MIME type", () => {
        expect(getAssetType("text/html")).toBeNull();
    });
    it("returns null for empty string", () => {
        expect(getAssetType("")).toBeNull();
    });
});
describe("getAssetsByType", () => {
    const sampleAssets = [
        {
            id: "a1",
            type: "image",
            name: "logo.png",
            filename: "logo.png",
            mimeType: "image/png",
            size: 8192,
            projectPath: "assets/logo.png",
            createdAt: "2026-03-16T00:00:00.000Z",
        },
        {
            id: "a2",
            type: "audio",
            name: "bgm.mp3",
            filename: "bgm.mp3",
            mimeType: "audio/mpeg",
            size: 4194304,
            projectPath: "assets/bgm.mp3",
            createdAt: "2026-03-16T00:00:00.000Z",
        },
        {
            id: "a3",
            type: "image",
            name: "banner.jpg",
            filename: "banner.jpg",
            mimeType: "image/jpeg",
            size: 204800,
            projectPath: "assets/banner.jpg",
            createdAt: "2026-03-16T00:00:00.000Z",
        },
        {
            id: "a4",
            type: "video",
            name: "intro.mp4",
            filename: "intro.mp4",
            mimeType: "video/mp4",
            size: 10485760,
            projectPath: "assets/intro.mp4",
            createdAt: "2026-03-16T00:00:00.000Z",
        },
    ];
    it("filters only image assets", () => {
        const images = getAssetsByType(sampleAssets, "image");
        expect(images).toHaveLength(2);
        expect(images.map((a) => a.id)).toEqual(["a1", "a3"]);
    });
    it("filters only audio assets", () => {
        const audio = getAssetsByType(sampleAssets, "audio");
        expect(audio).toHaveLength(1);
        expect(audio[0].id).toBe("a2");
    });
    it("filters only video assets", () => {
        const video = getAssetsByType(sampleAssets, "video");
        expect(video).toHaveLength(1);
        expect(video[0].id).toBe("a4");
    });
    it("returns empty array when no assets match", () => {
        const fonts = getAssetsByType(sampleAssets, "font");
        expect(fonts).toHaveLength(0);
    });
    it("returns empty array for empty input", () => {
        expect(getAssetsByType([], "image")).toHaveLength(0);
    });
});
