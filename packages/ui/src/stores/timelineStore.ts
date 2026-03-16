import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type Track,
  type TrackItem,
  type TrackType,
  getTimelineDuration,
} from "../../../../packages/core/src/timeline";
import type { Asset } from "../../../../packages/core/src/asset";
import { migrateV1ToV2, type ProjectV1 } from "../../../../packages/core/src/migration";
import type { TransitionConfig } from "../../../../packages/core/src/utils/transition";

type FftCache = { frames: Array<{ bands: number[]; beatIntensity: number }> };

interface TimelineStore {
  projectId: string | null;
  projectName: string;
  fps: number;
  width: number;
  height: number;
  tracks: Track[];
  totalDuration: () => number;
  isPlaying: boolean;
  currentTime: number;
  selectedTrackId: string | null;
  selectedItemId: string | null;
  assets: Asset[];
  bgmFile: File | null;
  fftCache: FftCache | null;
  addTrack: (type: TrackType, name?: string) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  addItem: (trackId: string, item: Omit<TrackItem, "id" | "trackId">) => void;
  removeItem: (trackId: string, itemId: string) => void;
  updateItem: (trackId: string, itemId: string, updates: Partial<TrackItem>) => void;
  moveItem: (itemId: string, toTrackId: string, startTime: number) => void;
  updateItemParam: (itemId: string, key: string, value: unknown) => void;
  setTransition: (itemId: string, direction: "in" | "out", config: TransitionConfig | null) => void;
  uploadAsset: (file: File) => Promise<Asset>;
  removeAsset: (assetId: string) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  loadProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;
}

interface PersistedTimelineStore {
  currentProjectId: string | null;
}

interface ProjectV2Response {
  id?: string;
  name?: string;
  version?: "2.0";
  fps?: number;
  width?: number;
  height?: number;
  timeline?: {
    tracks?: Track[];
  };
  assets?: Asset[];
}

interface ProjectResponse {
  project?: ProjectV1 | ProjectV2Response;
}

interface AssetsResponse {
  assets?: Asset[];
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function clampTime(time: number): number {
  return Number.isFinite(time) ? Math.max(0, time) : 0;
}

function defaultTrackName(type: TrackType, count: number): string {
  return `${type.charAt(0).toUpperCase()}${type.slice(1)} Track ${count}`;
}

function isProjectV1(project: ProjectV1 | ProjectV2Response): project is ProjectV1 {
  return Array.isArray((project as ProjectV1).scenes);
}

function isProjectV2(project: ProjectV1 | ProjectV2Response): project is ProjectV2Response {
  return (
    ("version" in project && project.version === "2.0") ||
    ("timeline" in project && typeof project.timeline === "object" && project.timeline !== null)
  );
}

function createBgmFile(blob: Blob, contentType: string): File {
  const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : "wav";
  return new File([blob], `bgm.${ext}`, { type: contentType });
}

export const useTimelineStore = create<TimelineStore>()(
  persist(
    (set, get) => ({
      projectId: null,
      projectName: "",
      fps: 30,
      width: 1920,
      height: 1080,
      tracks: [],
      totalDuration: () => getTimelineDuration(get().tracks),
      isPlaying: false,
      currentTime: 0,
      selectedTrackId: null,
      selectedItemId: null,
      assets: [],
      bgmFile: null,
      fftCache: null,
      addTrack: (type, name) =>
        set((state) => {
          const nextTrackCount = state.tracks.filter((track) => track.type === type).length + 1;
          const track: Track = {
            id: createId("track"),
            type,
            name: name ?? defaultTrackName(type, nextTrackCount),
            zOrder: state.tracks.length,
            muted: false,
            locked: false,
            visible: true,
            items: [],
          };

          return {
            tracks: [...state.tracks, track],
            selectedTrackId: track.id,
          };
        }),
      removeTrack: (id) =>
        set((state) => {
          const removedTrack = state.tracks.find((track) => track.id === id);
          const tracks = state.tracks
            .filter((track) => track.id !== id)
            .map((track, index) => ({ ...track, zOrder: index }));
          const selectedItemId =
            removedTrack?.items.some((item) => item.id === state.selectedItemId) ?? false
              ? null
              : state.selectedItemId;

          return {
            tracks,
            selectedTrackId: state.selectedTrackId === id ? null : state.selectedTrackId,
            selectedItemId,
          };
        }),
      updateTrack: (id, updates) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === id
              ? {
                  ...track,
                  ...updates,
                  id: track.id,
                  items: updates.items ?? track.items,
                }
              : track,
          ),
        })),
      reorderTracks: (fromIndex, toIndex) =>
        set((state) => {
          if (
            fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.tracks.length ||
            toIndex >= state.tracks.length
          ) {
            return state;
          }

          const tracks = [...state.tracks];
          const [movedTrack] = tracks.splice(fromIndex, 1);
          tracks.splice(toIndex, 0, movedTrack);

          return {
            tracks: tracks.map((track, index) => ({ ...track, zOrder: index })),
          };
        }),
      addItem: (trackId, item) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  items: [...track.items, { ...item, id: createId("item"), trackId }],
                }
              : track,
          ),
          selectedTrackId: trackId,
        })),
      removeItem: (trackId, itemId) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  items: track.items.filter((item) => item.id !== itemId),
                }
              : track,
          ),
          selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
        })),
      updateItem: (trackId, itemId, updates) =>
        set((state) => ({
          tracks: state.tracks.map((track) =>
            track.id === trackId
              ? {
                  ...track,
                  items: track.items.map((item) =>
                    item.id === itemId
                      ? {
                          ...item,
                          ...updates,
                          id: item.id,
                          trackId: item.trackId,
                          params: updates.params ? { ...item.params, ...updates.params } : item.params,
                          renderCode:
                            updates.renderCode === undefined ? item.renderCode : updates.renderCode,
                        }
                      : item,
                  ),
                }
              : track,
          ),
        })),
      moveItem: (itemId, toTrackId, startTime) =>
        set((state) => {
          let foundItem: TrackItem | null = null;
          const tracksWithoutItem = state.tracks.map((track) => {
            const item = track.items.find((entry) => entry.id === itemId);
            if (item) {
              foundItem = item;
              return {
                ...track,
                items: track.items.filter((entry) => entry.id !== itemId),
              };
            }

            return track;
          });

          if (!foundItem) {
            return state;
          }

          const sourceItem = foundItem as TrackItem;
          const movedItem: TrackItem = {
            id: sourceItem.id,
            trackId: toTrackId,
            duration: sourceItem.duration,
            sceneConfigId: sourceItem.sceneConfigId,
            assetId: sourceItem.assetId,
            params: sourceItem.params,
            transitionIn: sourceItem.transitionIn,
            transitionOut: sourceItem.transitionOut,
            keyframes: sourceItem.keyframes,
            renderCode: sourceItem.renderCode,
            startTime: clampTime(startTime),
          };

          return {
            tracks: tracksWithoutItem.map((track) =>
              track.id === toTrackId
                ? {
                    ...track,
                    items: [...track.items, movedItem],
                  }
                : track,
            ),
            selectedTrackId: toTrackId,
          };
        }),
      updateItemParam: (itemId, key, value) =>
        set((state) => ({
          tracks: state.tracks.map((track) => ({
            ...track,
            items: track.items.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    params: {
                      ...item.params,
                      [key]: value,
                    },
                  }
                : item,
            ),
          })),
        })),
      setTransition: (itemId, direction, config) =>
        set((state) => ({
          tracks: state.tracks.map((track) => ({
            ...track,
            items: track.items.map((item) => {
              if (item.id !== itemId) {
                return item;
              }

              return direction === "in"
                ? { ...item, transitionIn: config ?? undefined }
                : { ...item, transitionOut: config ?? undefined };
            }),
          })),
        })),
      uploadAsset: async (file) => {
        const { projectId } = get();
        if (!projectId) {
          throw new Error("Cannot upload asset without projectId");
        }

        const formData = new FormData();
        formData.append("file", file);

        const response = await fetch(`/api/projects/${projectId}/assets`, {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          throw new Error("Failed to upload asset");
        }

        const data = (await response.json()) as { asset?: Asset };
        if (!data.asset) {
          throw new Error("Invalid asset response");
        }

        set((state) => ({
          assets: [...state.assets, data.asset as Asset],
        }));

        return data.asset;
      },
      removeAsset: (assetId) =>
        set((state) => ({
          assets: state.assets.filter((asset) => asset.id !== assetId),
        })),
      setPlaying: (isPlaying) => set(() => ({ isPlaying })),
      setCurrentTime: (time) =>
        set(() => ({
          currentTime: clampTime(time),
        })),
      loadProject: async (id) => {
        const response = await fetch(`/api/projects/${id}`);
        if (!response.ok) {
          throw new Error("Failed to load project");
        }

        const data = (await response.json()) as ProjectResponse;
        const project = data.project;
        if (!project?.id) {
          throw new Error("Invalid project response");
        }

        const v2Project = isProjectV1(project)
          ? migrateV1ToV2(project)
          : isProjectV2(project)
            ? project
            : null;
        if (!v2Project) {
          throw new Error("Unsupported project format");
        }

        const assetsResponse = await fetch(`/api/projects/${id}/assets`);
        if (!assetsResponse.ok) {
          throw new Error("Failed to load assets");
        }
        const assetsData = (await assetsResponse.json()) as AssetsResponse;

        set(() => ({
          projectId: v2Project.id ?? id,
          projectName: typeof v2Project.name === "string" ? v2Project.name : "",
          fps: typeof v2Project.fps === "number" ? v2Project.fps : 30,
          width: typeof v2Project.width === "number" ? v2Project.width : 1920,
          height: typeof v2Project.height === "number" ? v2Project.height : 1080,
          tracks: Array.isArray(v2Project.timeline?.tracks) ? v2Project.timeline.tracks : [],
          assets: Array.isArray(assetsData.assets) ? assetsData.assets : [],
          bgmFile: null,
          fftCache: null,
          isPlaying: false,
          currentTime: 0,
          selectedTrackId: null,
          selectedItemId: null,
        }));

        try {
          const bgmResponse = await fetch(`/api/projects/${id}/bgm`);
          if (bgmResponse.ok) {
            const blob = await bgmResponse.blob();
            const contentType = bgmResponse.headers.get("content-type") ?? "audio/wav";
            set(() => ({ bgmFile: createBgmFile(blob, contentType) }));
          }
        } catch {
          set(() => ({ bgmFile: null }));
        }

        try {
          const fftResponse = await fetch(`/api/projects/${id}/fft-cache`);
          if (fftResponse.ok) {
            const fftData = (await fftResponse.json()) as FftCache;
            set(() => ({ fftCache: fftData }));
          } else {
            set(() => ({ fftCache: null }));
          }
        } catch {
          set(() => ({ fftCache: null }));
        }
      },
      saveProject: async () => {
        const { projectId, projectName, tracks, assets } = get();
        if (!projectId) {
          return;
        }

        const response = await fetch(`/api/projects/${projectId}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: projectName || "Untitled Project",
            tracks,
            assets,
          }),
        });
        if (!response.ok) {
          throw new Error("Failed to save project");
        }
      },
    }),
    {
      name: "vkoma-timeline-store",
      partialize: (state): PersistedTimelineStore => ({
        currentProjectId: state.projectId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as PersistedTimelineStore | undefined;

        return {
          ...currentState,
          projectId: persisted?.currentProjectId ?? currentState.projectId,
        };
      },
    },
  ),
);
