import { describe, expect, it } from "vitest";
import { migrateV1ToV2 } from "../migration";
describe("migrateV1ToV2", () => {
    const v1Project = {
        id: "project-1",
        name: "Demo Project",
        scenes: [
            {
                id: "scene-0",
                name: "Scene 0",
                duration: 3,
                sceneConfigId: "title-scene",
                params: { text: "Hello" },
            },
            {
                id: "scene-1",
                name: "Scene 1",
                duration: 2,
                sceneConfigId: "outro-scene",
                params: { text: "World" },
            },
        ],
        createdAt: "2026-03-16T00:00:00.000Z",
        updatedAt: "2026-03-16T00:00:00.000Z",
    };
    it("sets version to 2.0", () => {
        expect(migrateV1ToV2(v1Project).version).toBe("2.0");
    });
    it("converts scenes[0] into the first item on the first timeline track", () => {
        const migrated = migrateV1ToV2(v1Project);
        expect(migrated.timeline.tracks[0].items[0]).toMatchObject({
            id: "scene-0",
            sceneConfigId: "title-scene",
            params: { text: "Hello" },
        });
    });
    it("accumulates serial start times", () => {
        const migrated = migrateV1ToV2(v1Project);
        expect(migrated.timeline.tracks[0].items[0].startTime).toBe(0);
        expect(migrated.timeline.tracks[0].items[1].startTime).toBe(3);
    });
});
