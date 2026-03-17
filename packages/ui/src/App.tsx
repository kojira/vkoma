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
import { useTimelineStore } from "./stores/timelineStore";

export default function App() {
  const currentProjectId = useSceneStore((state) => state.currentProjectId);
  const loadProject = useSceneStore((state) => state.loadProject);
  const clearProject = useSceneStore((state) => state.clearProject);
  const autoLoadAttempted = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [bottomSheetContent, setBottomSheetContent] = useState<"timeline" | "assets" | "params" | null>(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [mobileToolbarVisible, setMobileToolbarVisible] = useState(false);

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
    if (bottomSheetContent) {
      setMobileToolbarVisible(false);
    }
  }, [bottomSheetContent]);

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

  const bottomSheetTitle =
    bottomSheetContent === "timeline"
      ? "Timeline"
      : bottomSheetContent === "assets"
        ? "Assets"
        : bottomSheetContent === "params"
          ? "Params"
          : null;

  const bottomSheetBody =
    bottomSheetContent === "timeline"
      ? <Timeline />
      : bottomSheetContent === "assets"
        ? assetLibraryPanel
        : bottomSheetContent === "params"
          ? <ParamPanel />
          : null;

  const toggleBottomSheet = (content: "timeline" | "assets" | "params") => {
    setBottomSheetContent((current) => (current === content ? null : content));
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
      <main className="flex min-h-[calc(100vh-73px)] flex-col p-3 pb-0 md:hidden">
        {!previewExpanded && (
          <button
            type="button"
            onClick={() => setPreviewExpanded(true)}
            className="mb-3 block flex-shrink-0 overflow-hidden rounded-xl border border-gray-800 bg-gray-950 text-left"
            aria-label="Expand preview"
          >
            <PreviewCanvas />
          </button>
        )}
        <div className="min-h-0 flex-1">
          <ChatPanel showNewChatButton={true} />
        </div>
        {mobileToolbarVisible && (
          <div
            className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-800 bg-gray-950/90 px-1 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          >
            <button
              type="button"
              onClick={() => toggleBottomSheet("timeline")}
              className={`min-h-[44px] rounded-xl border px-2 text-xs font-medium transition ${
                bottomSheetContent === "timeline"
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-200"
                  : "border-gray-800 bg-gray-900 text-gray-200"
              }`}
            >
              🎬 Timeline
            </button>
            <button
              type="button"
              onClick={() => toggleBottomSheet("assets")}
              className={`min-h-[44px] rounded-xl border px-2 text-xs font-medium transition ${
                bottomSheetContent === "assets"
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-200"
                  : "border-gray-800 bg-gray-900 text-gray-200"
              }`}
            >
              🎵 Assets
            </button>
            <button
              type="button"
              onClick={() => toggleBottomSheet("params")}
              className={`min-h-[44px] rounded-xl border px-2 text-xs font-medium transition ${
                bottomSheetContent === "params"
                  ? "border-blue-400/50 bg-blue-500/20 text-blue-200"
                  : "border-gray-800 bg-gray-900 text-gray-200"
              }`}
            >
              ⚙ Params
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMobileToolbarVisible((value) => !value)}
          className="fixed right-3 z-30 flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-gray-700 bg-gray-900/95 px-3 text-lg text-gray-200 shadow-lg backdrop-blur transition hover:border-gray-600 hover:text-white"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 0.75rem)" }}
          aria-label={mobileToolbarVisible ? "Hide mobile toolbar" : "Show mobile toolbar"}
          aria-expanded={mobileToolbarVisible}
        >
          {mobileToolbarVisible ? "✕" : "☰"}
        </button>
      </main>
      {previewExpanded && (
        <div className="fixed inset-0 z-50 bg-black md:hidden">
          <button
            type="button"
            onClick={() => setPreviewExpanded(false)}
            className="absolute right-4 top-4 z-10 rounded-full bg-black/70 px-3 py-2 text-sm font-medium text-white"
          >
            ✕ Close
          </button>
          <div className="flex h-full items-center justify-center p-4">
            <div className="w-full max-w-screen-sm overflow-hidden rounded-2xl border border-gray-800 bg-gray-950">
              <PreviewCanvas />
            </div>
          </div>
        </div>
      )}
      {bottomSheetContent && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setBottomSheetContent(null)}
          aria-hidden="true"
        >
          <div
            className="absolute inset-x-0 bottom-0 h-[70vh] rounded-t-2xl border-t border-gray-800 bg-gray-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex h-full flex-col">
              <div className="flex flex-shrink-0 flex-col items-center px-4 pt-3">
                <div className="h-1.5 w-10 rounded-full bg-gray-600" />
                <div className="mt-3 flex w-full items-center justify-between gap-3 pb-3">
                  <h2 className="text-sm font-semibold text-white">{bottomSheetTitle}</h2>
                  <button
                    type="button"
                    onClick={() => setBottomSheetContent(null)}
                    className="rounded-md border border-gray-700 px-2 py-1 text-xs text-gray-300"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
                {bottomSheetBody}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
