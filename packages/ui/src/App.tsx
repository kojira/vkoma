import { useEffect, useRef, useState } from "react";
import { AssetLibrary } from "./components/AssetLibrary";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ProjectSelector } from "./components/ProjectSelector";
import { SettingsModal } from "./components/SettingsModal";
import { Timeline } from "./components/Timeline";
import { useSceneStore } from "./stores/sceneStore";

export default function App() {
  const currentProjectId = useSceneStore((state) => state.currentProjectId);
  const loadProject = useSceneStore((state) => state.loadProject);
  const clearProject = useSceneStore((state) => state.clearProject);
  const autoLoadAttempted = useRef(false);
  const [showSettings, setShowSettings] = useState(false);

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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
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
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-4 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg transition-colors hover:bg-gray-600"
        aria-label="設定"
        title="設定"
      >
        ⚙
      </button>
    </div>
  );
}
