import { create } from "zustand";
import {
  type SceneConfig,
  defineScene,
  fade,
  bounce,
  slide,
  params as sceneParams,
} from "../../../../packages/core/src/index";

export interface SceneItem {
  id: string;
  name: string;
  duration: number;
  sceneConfig: SceneConfig;
  params: Record<string, unknown>;
}

interface SavedSceneItem {
  id: string;
  name: string;
  duration: number;
  params: Record<string, unknown>;
  sceneConfigId: string;
}

interface SceneStore {
  scenes: SceneItem[];
  currentProjectId: string | null;
  projectName: string;
  bgmFile: File | null;
  currentSceneIndex: number;
  isPlaying: boolean;
  currentFrame: number;
  fps: number;
  totalFrames: () => number;
  loadProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;
  createProject: (name: string) => Promise<void>;
  clearProject: () => void;
  setProjectName: (name: string) => void;
  addScene: (scene?: Partial<SceneItem>) => void;
  removeScene: (id: string) => void;
  updateScene: (id: string, updates: Partial<SceneItem>) => void;
  setCurrentScene: (index: number) => void;
  setPlaying: (isPlaying: boolean) => void;
  setCurrentFrame: (frame: number) => void;
  updateSceneParam: (id: string, key: string, value: unknown) => void;
  reorderScenes: (fromIndex: number, toIndex: number) => void;
  updateSceneDuration: (id: string, duration: number) => void;
  setBgmFile: (file: File | null) => void;
}

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
    const params = rawParams as {
      text: string;
      fontSize: number;
      color: string;
      bgColor: string;
    };

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

const SubtitleScene = defineScene({
  id: "subtitle-scene",
  name: "Subtitle Scene",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Subtitle", "AI-powered video creator"),
    fontSize: sceneParams.number("Font Size", 48, { min: 16, max: 96, step: 1 }),
    color: sceneParams.color("Text Color", "#60a5fa"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const x = slide(time, 1.5, -ctx.canvas.width, ctx.canvas.width / 2);
    ctx.fillStyle = p.color;
    ctx.font = `600 ${p.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.text, x, ctx.canvas.height / 2);
  },
});

const ColorScene = defineScene({
  id: "color-scene",
  name: "Color Scene",
  duration: 3,
  defaultParams: {
    speed: sceneParams.number("Speed", 1, { min: 0.1, max: 5, step: 0.1 }),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { speed: number };
    const hue = (time * p.speed * 120) % 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 64px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.8;
    ctx.fillText("🎨 Colors!", ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.globalAlpha = 1;
  },
});

const BouncingTextScene = defineScene({
  id: "bouncing-text-scene",
  name: "Bouncing Text",
  duration: 4,
  defaultParams: {
    text: sceneParams.string("Text", "Create Amazing Videos"),
    fontSize: sceneParams.number("Font Size", 56, { min: 20, max: 100, step: 1 }),
    color: sceneParams.color("Text Color", "#fbbf24"),
    bgColor: sceneParams.color("Background", "#1e1b4b"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const b = bounce(time, 2);
    const y = ctx.canvas.height - b * (ctx.canvas.height / 2);
    ctx.fillStyle = p.color;
    ctx.font = `700 ${p.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.text, ctx.canvas.width / 2, y);
  },
});

const OutroScene = defineScene({
  id: "outro-scene",
  name: "Outro Scene",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Text", "Thank you"),
    fontSize: sceneParams.number("Font Size", 72, { min: 24, max: 120, step: 1 }),
    color: sceneParams.color("Text Color", "#ffffff"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - fade(time, 3));
    ctx.fillStyle = p.color;
    ctx.font = `700 ${p.fontSize}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(p.text, ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.globalAlpha = 1;
  },
});

const allScenePresets = [TitleScene, SubtitleScene, ColorScene, BouncingTextScene, OutroScene];

function clampDuration(duration: number): number {
  return Math.max(0.5, Number.isFinite(duration) ? duration : 0.5);
}

function clampFrame(frame: number, totalFrames: number): number {
  if (totalFrames <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(Math.floor(frame), totalFrames - 1));
}

export function getSceneFrameRanges(scenes: SceneItem[], fps: number) {
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

export function getSceneAtFrame(
  scenes: SceneItem[],
  fps: number,
  frame: number,
) {
  const ranges = getSceneFrameRanges(scenes, fps);

  if (ranges.length === 0) {
    return null;
  }

  const clampedFrame = clampFrame(frame, ranges[ranges.length - 1]?.endFrame ?? 0);
  return (
    ranges.find((range) => clampedFrame >= range.startFrame && clampedFrame < range.endFrame) ??
    ranges[ranges.length - 1]
  );
}

function createSceneFromPreset(preset: SceneConfig, index: number): SceneItem {
  return {
    id: `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: preset.name,
    duration: preset.duration,
    sceneConfig: preset,
    params: Object.fromEntries(
      Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default]),
    ),
  };
}

function createInitialScenes(): SceneItem[] {
  return allScenePresets.map((preset, index) => createSceneFromPreset(preset, index));
}

function serializeScenes(scenes: SceneItem[]): SavedSceneItem[] {
  return scenes.map((scene) => ({
    id: scene.id,
    name: scene.name,
    duration: scene.duration,
    params: scene.params,
    sceneConfigId: scene.sceneConfig.id,
  }));
}

function deserializeScenes(rawScenes: unknown): SceneItem[] {
  if (!Array.isArray(rawScenes)) {
    return createInitialScenes();
  }

  const scenes = rawScenes
    .map<SceneItem | null>((scene, index) => {
      if (!scene || typeof scene !== "object") {
        return null;
      }

      const savedScene = scene as Partial<SavedSceneItem> & {
        sceneConfig?: { id?: string };
      };
      const sceneConfigId = savedScene.sceneConfigId ?? savedScene.sceneConfig?.id;
      const preset = allScenePresets.find((entry) => entry.id === sceneConfigId);
      if (!preset) {
        return null;
      }

      return {
        id:
          typeof savedScene.id === "string" && savedScene.id.length > 0
            ? savedScene.id
            : `scene-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
        name: typeof savedScene.name === "string" ? savedScene.name : preset.name,
        duration: clampDuration(
          typeof savedScene.duration === "number" ? savedScene.duration : preset.duration,
        ),
        sceneConfig: preset,
        params: {
          ...Object.fromEntries(
            Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default]),
          ),
          ...(savedScene.params && typeof savedScene.params === "object" ? savedScene.params : {}),
        },
      };
    })
    .filter((scene): scene is SceneItem => scene !== null);

  return scenes.length > 0 ? scenes : createInitialScenes();
}

const initialScenes: SceneItem[] = createInitialScenes();

export const useSceneStore = create<SceneStore>((set, get) => ({
  scenes: initialScenes,
  currentProjectId: null,
  projectName: "",
  bgmFile: null,
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

    const data = (await response.json()) as {
      project?: { id?: string; name?: string; scenes?: unknown };
    };
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

    const data = (await response.json()) as {
      project?: { id?: string; name?: string; scenes?: unknown };
    };
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
  clearProject: () =>
    set(() => ({
      currentProjectId: null,
      projectName: "",
      scenes: createInitialScenes(),
      currentSceneIndex: 0,
      currentFrame: 0,
      isPlaying: false,
    })),
  setProjectName: (name) => set(() => ({ projectName: name })),
  addScene: (scene) =>
    set((state) => {
      const nextIndex = state.scenes.length;
      const preset = allScenePresets[nextIndex % allScenePresets.length] ?? TitleScene;
      const fallback: SceneItem = {
        ...createSceneFromPreset(preset, nextIndex),
      };
      const nextScene: SceneItem = {
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
  removeScene: (id) =>
    set((state) => {
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
      const totalFrames = scenes.reduce(
        (sum, scene) => sum + Math.max(1, Math.round(scene.duration * state.fps)),
        0,
      );

      return {
        scenes,
        currentSceneIndex,
        currentFrame: clampFrame(state.currentFrame, totalFrames),
      };
    }),
  updateScene: (id, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? {
              ...scene,
              ...updates,
              duration: clampDuration(updates.duration ?? scene.duration),
              params: updates.params ? { ...scene.params, ...updates.params } : scene.params,
            }
          : scene,
      ),
    })),
  setCurrentScene: (index) =>
    set((state) => ({
      currentSceneIndex: Math.max(0, Math.min(index, state.scenes.length - 1)),
    })),
  setPlaying: (isPlaying) => set(() => ({ isPlaying })),
  setCurrentFrame: (frame) =>
    set((state) => ({
      currentFrame: clampFrame(frame, get().totalFrames()),
    })),
  updateSceneParam: (id, key, value) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id
          ? {
              ...scene,
              params: {
                ...scene.params,
                [key]: value,
              },
            }
          : scene,
      ),
    })),
  reorderScenes: (fromIndex, toIndex) =>
    set((state) => {
      if (
        fromIndex === toIndex ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= state.scenes.length ||
        toIndex >= state.scenes.length
      ) {
        return state;
      }

      const scenes = [...state.scenes];
      const [movedScene] = scenes.splice(fromIndex, 1);
      scenes.splice(toIndex, 0, movedScene);

      return {
        scenes,
        currentSceneIndex:
          state.currentSceneIndex === fromIndex ? toIndex : state.currentSceneIndex,
      };
    }),
  setBgmFile: (file) => set(() => ({ bgmFile: file })),
  updateSceneDuration: (id, duration) =>
    set((state) => {
      const scenes = state.scenes.map((scene) =>
        scene.id === id ? { ...scene, duration: clampDuration(duration) } : scene,
      );
      const totalFrames = scenes.reduce(
        (sum, scene) => sum + Math.max(1, Math.round(scene.duration * state.fps)),
        0,
      );

      return {
        scenes,
        currentFrame: clampFrame(state.currentFrame, totalFrames),
      };
    }),
}));
