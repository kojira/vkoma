import { getTimelineDuration } from "./timeline";
function createTrackId(projectId) {
    return `track-video-${projectId}`;
}
export function migrateV1ToV2(v1) {
    const trackId = createTrackId(v1.id);
    let accumulatedStartTime = 0;
    const items = v1.scenes.map((scene) => {
        const item = {
            id: scene.id,
            trackId,
            startTime: accumulatedStartTime,
            duration: scene.duration,
            sceneConfigId: scene.sceneConfigId,
            params: scene.params,
            ...(scene.renderCode ? { renderCode: scene.renderCode } : {}),
        };
        accumulatedStartTime += scene.duration;
        return item;
    });
    const videoTrack = {
        id: trackId,
        type: "video",
        name: "映像",
        zOrder: 0,
        muted: false,
        locked: false,
        visible: true,
        items,
    };
    return {
        id: v1.id,
        name: v1.name,
        version: "2.0",
        fps: 30,
        width: 1920,
        height: 1080,
        timeline: {
            duration: getTimelineDuration([videoTrack]),
            tracks: [videoTrack],
        },
        assets: [],
        createdAt: v1.createdAt,
        updatedAt: v1.updatedAt,
    };
}
