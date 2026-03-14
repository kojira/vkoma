import { create } from "zustand";
import { defineScene, fade, params as sceneParams, } from "../../../../packages/core/src/index";
const TitleScene = defineScene({
    id: "title-scene",
    name: "Title Scene",
    duration: 4,
    defaultParams: {
        text: sceneParams.string("Title Text", "vKoma"),
        fontSize: sceneParams.number("Font Size", 72, {
            min: 24,
            max: 120,
            step: 1,
        }),
        color: sceneParams.color("Text Color", "#ffffff"),
        bgColor: sceneParams.color("Background", "#111827"),
    },
    draw: (ctx, rawParams, time) => {
        const params = rawParams;
        ctx.save();
        ctx.fillStyle = params.bgColor;
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.globalAlpha = fade(time, 1.25);
        ctx.fillStyle = params.color;
        ctx.font = `700 ${params.fontSize}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(params.text, ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.restore();
    },
});
function createDefaultScene(index = 0) {
    return {
        id: `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: index === 0 ? "Intro" : `Scene ${index + 1}`,
        duration: TitleScene.duration,
        sceneConfig: TitleScene,
        params: Object.fromEntries(Object.entries(TitleScene.defaultParams).map(([key, param]) => [key, param.default])),
    };
}
function clampDuration(duration) {
    return Math.max(0.5, Number.isFinite(duration) ? duration : 0.5);
}
function clampFrame(frame, totalFrames) {
    if (totalFrames <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(Math.floor(frame), totalFrames - 1));
}
export function getSceneFrameRanges(scenes, fps) {
    let startFrame = 0;
    return scenes.map((scene, index) => {
        const frameLength = Math.max(1, Math.round(scene.duration * fps));
        const range = {
            index,
            scene,
            startFrame,
            endFrame: startFrame + frameLength,
            frameLength,
        };
        startFrame += frameLength;
        return range;
    });
}
export function getSceneAtFrame(scenes, fps, frame) {
    const ranges = getSceneFrameRanges(scenes, fps);
    if (ranges.length === 0) {
        return null;
    }
    const clampedFrame = clampFrame(frame, ranges[ranges.length - 1]?.endFrame ?? 0);
    return (ranges.find((range) => clampedFrame >= range.startFrame && clampedFrame < range.endFrame) ??
        ranges[ranges.length - 1]);
}
const initialScenes = [createDefaultScene(0)];
export const useSceneStore = create((set, get) => ({
    scenes: initialScenes,
    currentSceneIndex: 0,
    isPlaying: false,
    currentFrame: 0,
    fps: 30,
    totalFrames: () => {
        const { scenes, fps } = get();
        return scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration * fps)), 0);
    },
    addScene: (scene) => set((state) => {
        const nextIndex = state.scenes.length;
        const fallback = createDefaultScene(nextIndex);
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
    setCurrentFrame: (frame) => set((state) => ({
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
    updateSceneDuration: (id, duration) => set((state) => {
        const scenes = state.scenes.map((scene) => scene.id === id ? { ...scene, duration: clampDuration(duration) } : scene);
        const totalFrames = scenes.reduce((sum, scene) => sum + Math.max(1, Math.round(scene.duration * state.fps)), 0);
        return {
            scenes,
            currentFrame: clampFrame(state.currentFrame, totalFrames),
        };
    }),
}));
