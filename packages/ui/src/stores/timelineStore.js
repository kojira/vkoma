import { create } from "zustand";
import { getTimelineDuration, } from "../../../../packages/core/src/timeline";
import { migrateV1ToV2 } from "../../../../packages/core/src/migration";
function createId(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
function clampTime(time) {
    return Number.isFinite(time) ? Math.max(0, time) : 0;
}
function defaultTrackName(type, count) {
    return `${type.charAt(0).toUpperCase()}${type.slice(1)} Track ${count}`;
}
function isProjectV1(project) {
    return Array.isArray(project.scenes);
}
function isProjectV2(project) {
    return (("version" in project && project.version === "2.0") ||
        ("timeline" in project && typeof project.timeline === "object" && project.timeline !== null));
}
function createBgmFile(blob, contentType) {
    const ext = contentType.includes("mpeg") || contentType.includes("mp3") ? "mp3" : "wav";
    return new File([blob], `bgm.${ext}`, { type: contentType });
}
export const useTimelineStore = create()((set, get) => ({
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
    saveStatus: "saved",
    addTrack: (type, name) => set((state) => {
        const nextTrackCount = state.tracks.filter((track) => track.type === type).length + 1;
        const track = {
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
    removeTrack: (id) => set((state) => {
        const removedTrack = state.tracks.find((track) => track.id === id);
        const tracks = state.tracks
            .filter((track) => track.id !== id)
            .map((track, index) => ({ ...track, zOrder: index }));
        const selectedItemId = removedTrack?.items.some((item) => item.id === state.selectedItemId) ?? false
            ? null
            : state.selectedItemId;
        return {
            tracks,
            selectedTrackId: state.selectedTrackId === id ? null : state.selectedTrackId,
            selectedItemId,
        };
    }),
    updateTrack: (id, updates) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === id
            ? {
                ...track,
                ...updates,
                id: track.id,
                items: updates.items ?? track.items,
            }
            : track),
    })),
    reorderTracks: (fromIndex, toIndex) => set((state) => {
        if (fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.tracks.length ||
            toIndex >= state.tracks.length) {
            return state;
        }
        const tracks = [...state.tracks];
        const [movedTrack] = tracks.splice(fromIndex, 1);
        tracks.splice(toIndex, 0, movedTrack);
        return {
            tracks: tracks.map((track, index) => ({ ...track, zOrder: index })),
        };
    }),
    addItem: (trackId, item) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId
            ? {
                ...track,
                items: [...track.items, { ...item, id: createId("item"), trackId }],
            }
            : track),
        selectedTrackId: trackId,
    })),
    removeItem: (trackId, itemId) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId
            ? {
                ...track,
                items: track.items.filter((item) => item.id !== itemId),
            }
            : track),
        selectedItemId: state.selectedItemId === itemId ? null : state.selectedItemId,
    })),
    updateItem: (trackId, itemId, updates) => set((state) => ({
        tracks: state.tracks.map((track) => track.id === trackId
            ? {
                ...track,
                items: track.items.map((item) => item.id === itemId
                    ? {
                        ...item,
                        ...updates,
                        id: item.id,
                        trackId: item.trackId,
                        params: updates.params ? { ...item.params, ...updates.params } : item.params,
                        renderCode: updates.renderCode === undefined ? item.renderCode : updates.renderCode,
                    }
                    : item),
            }
            : track),
    })),
    moveItem: (itemId, toTrackId, startTime) => set((state) => {
        let foundItem = null;
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
        const sourceItem = foundItem;
        const movedItem = {
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
            tracks: tracksWithoutItem.map((track) => track.id === toTrackId
                ? {
                    ...track,
                    items: [...track.items, movedItem],
                }
                : track),
            selectedTrackId: toTrackId,
        };
    }),
    updateItemParam: (itemId, key, value) => set((state) => ({
        tracks: state.tracks.map((track) => ({
            ...track,
            items: track.items.map((item) => item.id === itemId
                ? {
                    ...item,
                    params: {
                        ...item.params,
                        [key]: value,
                    },
                }
                : item),
        })),
    })),
    setTransition: (itemId, direction, config) => set((state) => ({
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
        const data = (await response.json());
        if (!data.asset) {
            throw new Error("Invalid asset response");
        }
        set((state) => ({
            assets: [...state.assets, data.asset],
        }));
        return data.asset;
    },
    removeAsset: (assetId) => set((state) => ({
        assets: state.assets.filter((asset) => asset.id !== assetId),
    })),
    setPlaying: (isPlaying) => set(() => ({ isPlaying })),
    setCurrentTime: (time) => set(() => ({
        currentTime: clampTime(time),
    })),
    loadProject: async (id) => {
        const response = await fetch(`/api/projects/${id}`);
        if (!response.ok) {
            throw new Error("Failed to load project");
        }
        const data = (await response.json());
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
        const assetsData = (await assetsResponse.json());
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
            saveStatus: "saved",
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
        }
        catch {
            set(() => ({ bgmFile: null }));
        }
        try {
            const fftResponse = await fetch(`/api/projects/${id}/fft-cache`);
            if (fftResponse.ok) {
                const fftData = (await fftResponse.json());
                set(() => ({ fftCache: fftData }));
            }
            else {
                set(() => ({ fftCache: null }));
            }
        }
        catch {
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
}));
let lastSavedProjectId = null;
let lastSavedTracksSnapshot = JSON.stringify(useTimelineStore.getState().tracks);
let saveTimeout = null;
let retryTimeout = null;
function syncAutoSaveBaseline(projectId, tracks) {
    lastSavedProjectId = projectId;
    lastSavedTracksSnapshot = JSON.stringify(tracks);
}
async function patchTimeline(projectId, tracks) {
    const duration = getTimelineDuration(tracks);
    const response = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            timeline: {
                tracks,
                duration,
            },
        }),
    });
    if (!response.ok) {
        throw new Error("Failed to auto-save timeline");
    }
}
function scheduleTimelineSave() {
    if (retryTimeout) {
        clearTimeout(retryTimeout);
        retryTimeout = null;
    }
    if (saveTimeout) {
        clearTimeout(saveTimeout);
    }
    saveTimeout = setTimeout(() => {
        void runTimelineSave();
    }, 500);
}
async function runTimelineSave(isRetry = false) {
    const { projectId, tracks } = useTimelineStore.getState();
    const tracksSnapshot = JSON.stringify(tracks);
    if (!projectId) {
        syncAutoSaveBaseline(null, tracks);
        return;
    }
    if (!isRetry && lastSavedProjectId === projectId && tracksSnapshot === lastSavedTracksSnapshot) {
        return;
    }
    useTimelineStore.setState({ saveStatus: "saving" });
    try {
        await patchTimeline(projectId, tracks);
        if (retryTimeout) {
            clearTimeout(retryTimeout);
            retryTimeout = null;
        }
        syncAutoSaveBaseline(projectId, tracks);
        useTimelineStore.setState({ saveStatus: "saved" });
    }
    catch (error) {
        console.error("Timeline auto-save failed:", error);
        useTimelineStore.setState({ saveStatus: "error" });
        if (!isRetry) {
            if (retryTimeout) {
                clearTimeout(retryTimeout);
            }
            retryTimeout = setTimeout(() => {
                void runTimelineSave(true);
            }, 2000);
        }
    }
}
useTimelineStore.subscribe((state, prevState) => {
    if (state.projectId !== prevState.projectId) {
        syncAutoSaveBaseline(state.projectId, state.tracks);
    }
    if (state.tracks !== prevState.tracks) {
        scheduleTimelineSave();
    }
});
