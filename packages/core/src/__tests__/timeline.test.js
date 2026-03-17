import { describe, expect, it } from "vitest";
import { getItemsAtTime, getTimelineDuration } from "../timeline";
describe("getTimelineDuration", () => {
    it("returns the max end time across multiple tracks and items", () => {
        const tracks = [
            {
                id: "track-video",
                type: "video",
                name: "Video",
                zOrder: 0,
                muted: false,
                locked: false,
                visible: true,
                items: [
                    {
                        id: "video-1",
                        trackId: "track-video",
                        startTime: 0,
                        duration: 3,
                        sceneConfigId: "title-scene",
                        params: {},
                    },
                    {
                        id: "video-2",
                        trackId: "track-video",
                        startTime: 4,
                        duration: 2,
                        sceneConfigId: "outro-scene",
                        params: {},
                    },
                ],
            },
            {
                id: "track-audio",
                type: "audio",
                name: "Audio",
                zOrder: -1,
                muted: false,
                locked: false,
                visible: true,
                items: [
                    {
                        id: "audio-1",
                        trackId: "track-audio",
                        startTime: 1,
                        duration: 8,
                        assetId: "asset-bgm",
                        params: {},
                    },
                ],
            },
        ];
        expect(getTimelineDuration(tracks)).toBe(9);
    });
});
describe("getItemsAtTime", () => {
    const tracks = [
        {
            id: "track-video",
            type: "video",
            name: "Video",
            zOrder: 0,
            muted: false,
            locked: false,
            visible: true,
            items: [
                {
                    id: "item-active",
                    trackId: "track-video",
                    startTime: 0,
                    duration: 3,
                    sceneConfigId: "title-scene",
                    params: {},
                },
            ],
        },
    ];
    it("includes an item active at time=2.5", () => {
        expect(getItemsAtTime(tracks, 2.5).map((item) => item.id)).toContain("item-active");
    });
    it("excludes an item once time reaches its end", () => {
        expect(getItemsAtTime(tracks, 5)).toHaveLength(0);
    });
});
