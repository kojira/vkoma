import { useEffect, useRef, useState, type ReactNode } from "react";
import { AssetLibrary } from "./components/AssetLibrary";
import { ChatPanel } from "./components/ChatPanel";
import { Header } from "./components/Header";
import { ParamPanel } from "./components/ParamPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { ProjectSelector } from "./components/ProjectSelector";
import { SettingsModal } from "./components/SettingsModal";
import { Timeline } from "./components/Timeline";
import { useSceneStore } from "./stores/sceneStore";
import { useTimelineStore } from "./stores/timelineStore";

export default function App() {
  const currentProjectId = useSceneStore((state) => state.currentProjectId);
  const loadProject = useSceneStore((state) => state.loadProject);
  const clearProject = useSceneStore((state) => state.clearProject);
  const autoLoadAttempted = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["terminal"]));

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

    Promise.all([
      loadProject(projectIdToLoad),
      useTimelineStore.getState().loadProject(projectIdToLoad),
    ]).catch(() => {
      clearProject();
    });
  }, [clearProject, loadProject]);

  useEffect(() => {
    if (!currentProjectId) return;

    const interval = setInterval(() => {
      // Skip polling while playing to avoid interrupting playback
      if (useTimelineStore.getState().isPlaying) return;
      void useTimelineStore.getState().loadProject(currentProjectId);
      void loadProject(currentProjectId);
    }, 3000);

    return () => clearInterval(interval);
  }, [currentProjectId, loadProject]);

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

  const toggleSection = (section: string) => {
    setOpenSections((current) => {
      const next = new Set(current);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
        if (section === "preview" || section === "timeline") {
          const projectId = useSceneStore.getState().currentProjectId;
          if (projectId) {
            void loadProject(projectId);
            void useTimelineStore.getState().loadProject(projectId);
          }
        }
      }
      return next;
    });
  };

  const renderAccordionSection = ({
    id,
    title,
    headerClassName,
    contentClassName = "",
    children,
  }: {
    id: string;
    title: string;
    headerClassName: string;
    contentClassName?: string;
    children: ReactNode;
  }) => {
    const isOpen = openSections.has(id);

    return (
      <section className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-950/80 shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          className={`flex w-full items-center justify-between gap-3 border-l-4 px-4 py-3 text-left transition ${headerClassName}`}
          aria-expanded={isOpen}
          aria-controls={`mobile-section-${id}`}
        >
          <span className="text-sm font-semibold text-white">{title}</span>
          <span className="text-sm text-gray-300">{isOpen ? "▼" : "▶"}</span>
        </button>
        <div
          id={`mobile-section-${id}`}
          className={`overflow-hidden transition-all duration-300 ease-out ${isOpen ? "max-h-[240rem] opacity-100" : "max-h-0 opacity-0"}`}
        >
          <div
            className={`border-t border-gray-800 p-3 ${contentClassName} ${isOpen ? "translate-y-0" : "-translate-y-1"} transition-transform duration-300 ease-out`}
          >
            {children}
          </div>
        </div>
      </section>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      <main className="hidden gap-4 p-4 md:flex md:flex-row">
        <div className="flex flex-col gap-4">
          <ParamPanel />
          {assetLibraryPanel}
        </div>
        <section className="min-w-0 flex-1 flex-col gap-4 flex">
          <PreviewCanvas />
          <Timeline />
        </section>
        <div className="block">
          <ChatPanel />
        </div>
      </main>
      <main className="flex min-h-[calc(100vh-73px)] flex-col overflow-y-auto p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] md:hidden">
        <div className="flex flex-col gap-3">
          {renderAccordionSection({
            id: "terminal",
            title: "🤖 AIターミナル",
            headerClassName: "border-cyan-400 bg-cyan-500/10",
            children: (
              <div className="flex flex-col" style={{ height: "min(60vh, 500px)" }}>
                <ChatPanel showNewChatButton={true} />
              </div>
            ),
          })}
          {renderAccordionSection({
            id: "preview",
            title: "▶️ プレビュー",
            headerClassName: "border-violet-400 bg-violet-500/10",
            children: (
              <div className="aspect-video overflow-hidden rounded-xl border border-gray-800 bg-black">
                <PreviewCanvas />
              </div>
            ),
          })}
          {renderAccordionSection({
            id: "timeline",
            title: "🎬 タイムライン",
            headerClassName: "border-blue-400 bg-blue-500/10",
            children: <Timeline />,
          })}
          {renderAccordionSection({
            id: "assets",
            title: "📁 アセット",
            headerClassName: "border-emerald-400 bg-emerald-500/10",
            children: assetLibraryPanel,
          })}
          {renderAccordionSection({
            id: "params",
            title: "⚙️ パラメータ",
            headerClassName: "border-amber-400 bg-amber-500/10",
            children: <ParamPanel />,
          })}
        </div>
      </main>
    </div>
  );
}
