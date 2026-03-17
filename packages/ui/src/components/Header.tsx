import { useEffect, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";

export function Header() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);
  const clearProject = useSceneStore((state) => state.clearProject);
  const projectName = useSceneStore((state) => state.projectName);
  const saveProject = useSceneStore((state) => state.saveProject);
  const setProjectName = useSceneStore((state) => state.setProjectName);
  const saveStatus = useTimelineStore((state) => state.saveStatus);

  useEffect(() => {
    if (exportSuccess) {
      const timer = setTimeout(() => setExportSuccess(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [exportSuccess]);

  useEffect(() => {
    if (exportError) {
      const timer = setTimeout(() => setExportError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [exportError]);

  const downloadVideo = async () => {
    const { currentProjectId } = useSceneStore.getState();
    if (!currentProjectId) {
      setExportError("プロジェクトを保存してからダウンロードしてください。");
      return;
    }
    try {
      const response = await fetch(`/api/projects/${currentProjectId}/download`);
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Download failed" }));
        setExportError((err as { error?: string }).error || "ダウンロード失敗: レンダリングしてからお試しください。");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${projectName || "vkoma"}.mp4`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError("Download failed: " + (e instanceof Error ? e.message : "Unknown error"));
    }
  };

  const exportVideo = async () => {
    const { currentProjectId, bgmFile } = useSceneStore.getState();
    if (!currentProjectId) {
      setExportError("プロジェクトを保存してからエクスポートしてください。");
      return;
    }

    setExporting(true);
    setExportError(null);
    setExportSuccess(false);
    try {
      if (bgmFile) {
        const formData = new FormData();
        formData.append("projectId", currentProjectId);
        formData.append("fps", "30");
        formData.append("bgm", bgmFile);
        const response = await fetch("/api/render", {
          method: "POST",
          body: formData,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({ error: "Export failed" }));
          setExportError(err.error || "Export failed");
          return;
        }
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${projectName || "vkoma"}.mp4`;
        link.click();
        URL.revokeObjectURL(url);
        setExportSuccess(true);
      } else {
        // Use an <a> tag for Playwright-compatible download
        const link = document.createElement("a");
        link.href = `/api/render/${currentProjectId}?fps=30`;
        link.download = `${projectName || "vkoma"}.mp4`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setExportSuccess(true);
      }
    } catch (e) {
      setExportError("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const handleRenameProject = () => {
    const nextName = window.prompt("プロジェクト名を入力してください", projectName || "Untitled Project");
    if (!nextName?.trim()) return;
    setProjectName(nextName.trim());
  };

  const saveStatusTone =
    saveStatus === "saved"
      ? "bg-emerald-400"
      : saveStatus === "saving"
        ? "bg-amber-400"
        : "bg-red-400";

  const saveStatusLabel =
    saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Error";

  return (
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3 sm:px-6 sm:py-4">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => clearProject()} className="rounded-md border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white">
          ← 一覧
        </button>
        <button type="button" onClick={handleRenameProject} className="truncate text-lg font-semibold tracking-wide text-white sm:text-xl">
          {`vKoma - ${projectName || "Untitled Project"}`}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-400">
          <span className={`h-2 w-2 rounded-full ${saveStatusTone}`} />
          {saveStatusLabel}
        </div>
        {exportError && (
          <span className="rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 animate-pulse">
            ❌ {exportError}
          </span>
        )}
        {exportSuccess && (
          <span className="rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400">
            ✅ エクスポート完了
          </span>
        )}
        <button type="button" onClick={() => void saveProject()} disabled={exporting} className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60">
          💾 保存
        </button>
        <button
          type="button"
          data-testid="download-button"
          onClick={() => void downloadVideo()}
          className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white"
        >
          ⬇ ダウンロード
        </button>
        <button type="button" data-testid="export-button" onClick={() => void exportVideo()} disabled={exporting} className="flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60">
          {exporting && (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {exporting ? "書き出し中..." : "📹 Export"}
        </button>
      </div>
    </header>
  );
}
