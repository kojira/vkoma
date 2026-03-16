import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@napi-rs/canvas", () => {
  const makeCtx = () => ({
    globalAlpha: 1.0,
    globalCompositeOperation: "source-over" as string,
    clearRect: vi.fn(),
    drawImage: vi.fn(),
  });
  const makeCanvas = () => ({
    getContext: vi.fn(() => makeCtx()),
    toBuffer: vi.fn(() => Buffer.from("fake-jpeg")),
  });
  return {
    createCanvas: vi.fn(() => makeCanvas()),
    loadImage: vi.fn(),
    GlobalFonts: { registerFromPath: vi.fn() },
  };
});

vi.mock("../../../core/src/index", () => ({
  allScenePresets: [],
  renderScene: vi.fn(),
  defineScene: vi.fn().mockImplementation((cfg: any) => ({
    id: cfg.id ?? "dynamic",
    name: cfg.name ?? "dynamic",
    duration: cfg.duration ?? 3,
    defaultParams: cfg.defaultParams ?? {},
    draw: cfg.draw ?? vi.fn(),
  })),
  params: {
    number: vi.fn().mockImplementation((_k: string, v: number) => ({ type: "number", default: v })),
    string: vi.fn().mockImplementation((_k: string, v: string) => ({ type: "string", default: v })),
    color: vi.fn().mockImplementation((_k: string, v: string) => ({ type: "color", default: v })),
  },
}));

import { renderFrameWithTracks } from "../render-frame";
import { migrateV1ToV2, type ProjectV1 } from "../../../core/src/migration";
import type { Track } from "../../../core/src/timeline";

function makeVideoTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: "track-video-1",
    type: "video",
    name: "映像",
    zOrder: 0,
    muted: false,
    locked: false,
    visible: true,
    items: [],
    ...overrides,
  };
}

describe("renderFrameWithTracks (v2 renderer)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns Buffer for single video track with renderCode item", async () => {
    const track = makeVideoTrack({
      items: [
        {
          id: "item-1",
          trackId: "track-video-1",
          startTime: 0,
          duration: 3,
          params: {},
          renderCode: "// empty render",
        },
      ],
    });

    const result = await renderFrameWithTracks([track], 1.0, 1920, 1080, [], "/tmp/test-project");

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
  });

  it("v1 project migrated to v2 can be rendered without error", async () => {
    const v1: ProjectV1 = {
      id: "proj-v1",
      name: "Test V1 Project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      scenes: [
        {
          id: "s1",
          name: "Scene 1",
          duration: 3,
          sceneConfigId: "solid-color",
          params: { color: "#ff0000" },
        },
      ],
    };

    const v2 = migrateV1ToV2(v1);
    expect(v2.version).toBe("2.0");
    expect(v2.timeline.tracks).toHaveLength(1);

    const result = await renderFrameWithTracks(
      v2.timeline.tracks,
      0.5,
      1920,
      1080,
      [],
      "/tmp",
    );

    expect(result).toBeInstanceOf(Buffer);
  });

  it("audio track is excluded from rendering", async () => {
    const audioTrack: Track = {
      id: "track-audio-1",
      type: "audio",
      name: "BGM",
      zOrder: 1,
      muted: false,
      locked: false,
      visible: true,
      items: [
        {
          id: "audio-item-1",
          trackId: "track-audio-1",
          startTime: 0,
          duration: 10,
          params: {},
        },
      ],
    };

    const result = await renderFrameWithTracks([audioTrack], 1.0, 1920, 1080, [], "/tmp");
    expect(result).toBeInstanceOf(Buffer);
  });
});
