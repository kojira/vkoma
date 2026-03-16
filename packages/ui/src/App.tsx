import { useEffect, useRef } from "react";
import { AssetLibrary } from "./components/AssetLibrary";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ProjectSelector } from "./components/ProjectSelector";
import { Timeline } from "./components/Timeline";
import { useSceneStore } from "./stores/sceneStore";

export default function App() {
  const currentProjectId = useSceneStore((state) => state.currentProjectId);
  const loadProject = useSceneStore((state) => state.loadProject);
  const clearProject = useSceneStore((state) => state.clearProject);
  const autoLoadAttempted = useRef(false);

  useEffect(() => {
    if (autoLoadAttempted.current) return;

    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("projectId");
    const persistedProjectId = useSceneStore.getState().currentProjectId;
    const projectIdToLoad = urlProjectId ?? persistedProjectId;

    autoLoadAttempted.current = true;

    if (!projectIdToLoad) {
      return;
    }

    loadProject(projectIdToLoad).catch(() => {
      clearProject();
    });
  }, [clearProject, loadProject]);

  if (currentProjectId === null) {
    return <ProjectSelector />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      <main className="flex flex-col gap-4 p-4 lg:flex-row">
        <div className="hidden lg:flex lg:flex-col lg:gap-4">
          <ParamPanel />
          <AssetLibrary />
        </div>
        <section className="flex min-w-0 flex-1 flex-col gap-4">
          <PreviewCanvas />
          <Timeline />
        </section>
        <ChatPanel />
      </main>
    </div>
  );
}
