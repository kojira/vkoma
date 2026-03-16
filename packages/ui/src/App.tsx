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
  const [activeTab, setActiveTab] = useState<"timeline" | "assets" | "params">("timeline");

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

  const assetLibraryPanel = (
    <div className="flex flex-col gap-2">
      <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
        🎵 BGMを追加
      </p>
      <AssetLibrary />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <main className="flex flex-col gap-4 p-4 pb-16 lg:flex-row lg:pb-0">
        <div className="hidden lg:flex lg:flex-col lg:gap-4">
          <ParamPanel />
          {assetLibraryPanel}
        </div>
        <div className="lg:hidden">
          {activeTab === "assets" && assetLibraryPanel}
          {activeTab === "params" && <ParamPanel />}
        </div>
        <section
          className={`min-w-0 flex-1 flex-col gap-4 ${
            activeTab === "timeline" ? "flex" : "hidden lg:flex"
          }`}
        >
          <PreviewCanvas />
          <Timeline />
          <div className="lg:hidden">
            <ChatPanel />
          </div>
        </section>
        <div className="hidden lg:block">
          <ChatPanel />
        </div>
      </main>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-700 bg-gray-900 lg:hidden"
        aria-label="モバイルタブ"
      >
        <button
          onClick={() => setActiveTab("timeline")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${
            activeTab === "timeline" ? "text-blue-400" : "text-gray-400"
          }`}
        >
          <span className="text-lg" aria-hidden="true">
            🎬
          </span>
          タイムライン
        </button>
        <button
          onClick={() => setActiveTab("assets")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${
            activeTab === "assets" ? "text-blue-400" : "text-gray-400"
          }`}
        >
          <span className="text-lg" aria-hidden="true">
            🎵
          </span>
          アセット
        </button>
        <button
          onClick={() => setActiveTab("params")}
          className={`flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${
            activeTab === "params" ? "text-blue-400" : "text-gray-400"
          }`}
        >
          <span className="text-lg" aria-hidden="true">
            ⚙️
          </span>
          パラメータ
        </button>
      </nav>
      <button
        onClick={() => setShowSettings(true)}
        className="fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg transition-colors hover:bg-gray-600 lg:bottom-4"
        aria-label="設定"
        title="設定"
      >
        ⚙
      </button>
    </div>
  );
}
