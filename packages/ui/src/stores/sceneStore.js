import { create } from "zustand";
import { defineScene, params as sceneParams, allScenePresets, getSceneFrameRanges, getSceneAtFrame, } from "../../../../packages/core/src/index";
export { allScenePresets, getSceneFrameRanges, getSceneAtFrame };
const TitleScene = allScenePresets[0];
function clampDuration(duration) {
    return Math.max(0.5, Number.isFinite(duration) ? duration : 0.5);
}
function clampFrame(frame, totalFrames) {
    if (totalFrames <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(Math.floor(frame), totalFrames - 1));
}
function createSceneFromPreset(preset, index) {
    return {
        id: `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: preset.name,
        duration: preset.duration,
        sceneConfig: preset,
        params: Object.fromEntries(Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default])),
    };
}
function createInitialScenes() {
    return allScenePresets.map((preset, index) => createSceneFromPreset(preset, index));
}
function serializeScenes(scenes) {
    return scenes.map((scene) => {
        const base = {
            id: scene.id,
            name: scene.name,
            duration: scene.duration,
            params: scene.params,
            sceneConfigId: scene.sceneConfig.id,
        };
        // renderCodeがあれば（AIで生成したdynamicシーン）保存する
        const rc = scene.renderCode ?? scene.sceneConfig?.renderCode;
        if (rc && typeof rc === "string") {
            return { ...base, renderCode: rc };
        }
        return base;
    });
}
export function resolveSceneConfig(savedScene, fallbackName = "Dynamic Scene") {
    const sceneConfigId = savedScene.sceneConfigId ?? savedScene.sceneConfig?.id;
    let preset = allScenePresets.find((entry) => entry.id === sceneConfigId);
    if (!preset && savedScene.renderCode && typeof savedScene.renderCode === "string") {
        try {
            const drawFn = new Function("ctx", "params", "time", savedScene.renderCode);
            const paramEntries = savedScene.params && typeof savedScene.params === "object"
                ? Object.entries(savedScene.params)
                : [];
            const defaultParams = {};
            for (const [key, value] of paramEntries) {
                if (typeof value === "number") {
                    defaultParams[key] = sceneParams.number(key, value);
                }
                else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
                    defaultParams[key] = sceneParams.color(key, value);
                }
                else if (typeof value === "string") {
                    defaultParams[key] = sceneParams.string(key, value);
                }
            }
            preset = defineScene({
                id: sceneConfigId || `dynamic-${Date.now()}`,
                name: typeof savedScene.name === "string" ? savedScene.name : fallbackName,
                duration: typeof savedScene.duration === "number" ? savedScene.duration : 3,
                defaultParams,
                draw: drawFn,
            });
        }
        catch {
            return null;
        }
    }
    return preset ?? null;
}
function deserializeScenes(rawScenes) {
    if (!Array.isArray(rawScenes)) {
        return createInitialScenes();
    }
    const scenes = rawScenes
        .map((scene, index) => {
        if (!scene || typeof scene !== "object") {
            return null;
        }
        const savedScene = scene;
        const preset = resolveSceneConfig(savedScene, "Dynamic Scene");
        if (!preset) {
            return null;
        }
        const item = {
            id: typeof savedScene.id === "string" && savedScene.id.length > 0
                ? savedScene.id
                : `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
            name: typeof savedScene.name === "string" ? savedScene.name : preset.name,
            duration: clampDuration(typeof savedScene.duration === "number" ? savedScene.duration : preset.duration),
            sceneConfig: preset,
            params: {
                ...Object.fromEntries(Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default])),
                ...(savedScene.params && typeof savedScene.params === "object" ? savedScene.params : {}),
            },
        };
        if (savedScene.renderCode) {
            item.renderCode = savedScene.renderCode;
        }
        return item;
    })
        .filter((scene) => scene !== null);
    return scenes.length > 0 ? scenes : createInitialScenes();
}
const initialScenes = createInitialScenes();
export const useSceneStore = create()((set, get) => ({
    scenes: initialScenes,
    currentProjectId: null,
    projectName: "",
    bgmFile: null,
    fftCache: null,
    currentSceneIndex: 0,
    isPlaying: false,
    currentFrame: 0,
    fps: 30,
    totalFrames: () => {
        const { scenes, fps } = get();
        return scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration * fps)), 0);
    },
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
        const scenes = deserializeScenes(project.scenes);
        set(() => ({
            currentProjectId: project.id ?? null,
            projectName: typeof project.name === "string" ? project.name : "",
            scenes,
            currentSceneIndex: 0,
            currentFrame: 0,
            isPlaying: false,
        }));
        try {
            const bgmResponse = await fetch(`/api/projects/${id}/bgm`);
            if (bgmResponse.ok) {
                const blob = await bgmResponse.blob();
                const contentType = bgmResponse.headers.get("content-type") ?? "audio/wav";
                const ext = contentType.includes("mpeg") ? "mp3" : "wav";
                const bgmFileObj = new File([blob], `bgm.${ext}`, { type: contentType });
                set(() => ({ bgmFile: bgmFileObj }));
            }
        }
        catch {
            // BGMなしは正常
        }
        // fft-cacheを自動取得
        try {
            const fftResponse = await fetch(`/api/projects/${id}/fft-cache`);
            if (fftResponse.ok) {
                const fftData = await fftResponse.json();
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
        const { currentProjectId, projectName, scenes } = get();
        if (!currentProjectId) {
            return;
        }
        const response = await fetch(`/api/projects/${currentProjectId}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name: projectName || "Untitled Project",
                scenes: serializeScenes(scenes),
            }),
        });
        if (!response.ok) {
            throw new Error("Failed to save project");
        }
    },
    createProject: async (name) => {
        const projectScenes = createInitialScenes();
        const response = await fetch("/api/projects", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                name,
                scenes: serializeScenes(projectScenes),
            }),
        });
        if (!response.ok) {
            throw new Error("Failed to create project");
        }
        const data = (await response.json());
        const project = data.project;
        if (!project?.id) {
            throw new Error("Invalid project response");
        }
        set(() => ({
            currentProjectId: project.id,
            projectName: typeof project.name === "string" ? project.name : name,
            scenes: deserializeScenes(project.scenes),
            currentSceneIndex: 0,
            currentFrame: 0,
            isPlaying: false,
        }));
    },
    clearProject: () => set(() => ({
        currentProjectId: null,
        projectName: "",
        scenes: createInitialScenes(),
        currentSceneIndex: 0,
        currentFrame: 0,
        isPlaying: false,
    })),
    setProjectName: (name) => set(() => ({ projectName: name })),
    addScene: (scene) => set((state) => {
        const nextIndex = state.scenes.length;
        const preset = allScenePresets[nextIndex % allScenePresets.length] ?? TitleScene;
        const fallback = {
            ...createSceneFromPreset(preset, nextIndex),
        };
        const nextScene = {
            ...fallback,
            ...scene,
            duration: clampDuration(scene?.duration ?? fallback.duration),
            sceneConfig: scene?.sceneConfig ?? fallback.sceneConfig,
            params: {
                ...fallback.params,
                ...(scene?.params ?? {}),
            },
        };
        return {
            scenes: [...state.scenes, nextScene],
            currentSceneIndex: nextIndex,
        };
    }),
    removeScene: (id) => set((state) => {
        if (state.scenes.length <= 1) {
            return {
                scenes: state.scenes,
                currentSceneIndex: 0,
                currentFrame: 0,
                isPlaying: false,
            };
        }
        const scenes = state.scenes.filter((scene) => scene.id !== id);
        const currentSceneIndex = Math.min(state.currentSceneIndex, scenes.length - 1);
        const totalFrames = scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration * state.fps)), 0);
        return {
            scenes,
            currentSceneIndex,
            currentFrame: clampFrame(state.currentFrame, totalFrames),
        };
    }),
    updateScene: (id, updates) => set((state) => ({
        scenes: state.scenes.map((scene) => scene.id === id
            ? {
                ...scene,
                ...updates,
                duration: clampDuration(updates.duration ?? scene.duration),
                params: updates.params ? { ...scene.params, ...updates.params } : scene.params,
            }
            : scene),
    })),
    setCurrentScene: (index) => set((state) => ({
        currentSceneIndex: Math.max(0, Math.min(index, state.scenes.length - 1)),
    })),
    setPlaying: (isPlaying) => set(() => ({ isPlaying })),
    setCurrentFrame: (frame) => set(() => ({
        currentFrame: clampFrame(frame, get().totalFrames()),
    })),
    updateSceneParam: (id, key, value) => set((state) => ({
        scenes: state.scenes.map((scene) => scene.id === id
            ? {
                ...scene,
                params: {
                    ...scene.params,
                    [key]: value,
                },
            }
            : scene),
    })),
    reorderScenes: (fromIndex, toIndex) => set((state) => {
        if (fromIndex === toIndex ||
            fromIndex < 0 ||
            toIndex < 0 ||
            fromIndex >= state.scenes.length ||
            toIndex >= state.scenes.length) {
            return state;
        }
        const scenes = [...state.scenes];
        const [movedScene] = scenes.splice(fromIndex, 1);
        scenes.splice(toIndex, 0, movedScene);
        return {
            scenes,
            currentSceneIndex: state.currentSceneIndex === fromIndex ? toIndex : state.currentSceneIndex,
        };
    }),
    setBgmFile: (file) => set(() => ({ bgmFile: file })),
    setFftCache: (cache) => set(() => ({ fftCache: cache })),
    updateSceneDuration: (id, duration) => set((state) => {
        const scenes = state.scenes.map((scene) => scene.id === id ? { ...scene, duration: clampDuration(duration) } : scene);
        const totalFrames = scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration * state.fps)), 0);
        return {
            scenes,
            currentFrame: clampFrame(state.currentFrame, totalFrames),
        };
    }),
}));
// 後方互換: sceneStore → timelineStore へのシム
export { useTimelineStore } from "./timelineStore";
