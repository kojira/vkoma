import { getTimelineDuration, type Track, type TrackItem } from "./timeline";

export interface ProjectV1Scene {
  id: string;
  name: string;
  duration: number;
  sceneConfigId: string;
  params: Record<string, unknown>;
  renderCode?: string;
}

export interface ProjectV1 {
  id: string;
  name: string;
  scenes: ProjectV1Scene[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectV2Timeline {
  duration: number;
  tracks: Track[];
}

export interface ProjectV2 {
  id: string;
  name: string;
  version: "2.0";
  fps: number;
  width: number;
  height: number;
  timeline: ProjectV2Timeline;
  assets: unknown[];
  createdAt: string;
  updatedAt: string;
}

function createTrackId(projectId: string): string {
  return `track-video-${projectId}`;
}

export function migrateV1ToV2(v1: ProjectV1): ProjectV2 {
  const trackId = createTrackId(v1.id);
  let accumulatedStartTime = 0;

  const items: TrackItem[] = v1.scenes.map((scene) => {
    const item: TrackItem = {
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

  const videoTrack: Track = {
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
