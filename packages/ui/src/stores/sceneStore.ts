import { create } from "zustand";

interface Scene {
  id: string;
  name: string;
  duration: number;
  params: Record<string, unknown>;
}

interface SceneStore {
  scenes: Scene[];
  currentSceneIndex: number;
  addScene: (scene: Scene) => void;
  removeScene: (id: string) => void;
  updateScene: (id: string, updates: Partial<Scene>) => void;
  setCurrentScene: (index: number) => void;
}

export const useSceneStore = create<SceneStore>((set) => ({
  scenes: [],
  currentSceneIndex: 0,
  addScene: (scene) =>
    set((state) => ({
      scenes: [...state.scenes, scene],
    })),
  removeScene: (id) =>
    set((state) => ({
      scenes: state.scenes.filter((scene) => scene.id !== id),
      currentSceneIndex:
        state.currentSceneIndex >= state.scenes.length - 1
          ? Math.max(0, state.scenes.length - 2)
          : state.currentSceneIndex,
    })),
  updateScene: (id, updates) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === id ? { ...scene, ...updates } : scene,
      ),
    })),
  setCurrentScene: (index) =>
    set(() => ({
      currentSceneIndex: index,
    })),
}));
