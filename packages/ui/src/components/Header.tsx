import { useState } from "react";
import { useSceneStore } from "../stores/sceneStore";

export function Header() {
  const [exporting, setExporting] = useState(false);
  const clearProject = useSceneStore((state) => state.clearProject);
  const projectName = useSceneStore((state) => state.projectName);
  const saveProject = useSceneStore((state) => state.saveProject);
  const setProjectName = useSceneStore((state) => state.setProjectName);

  const exportVideo = async () => {
    const { currentProjectId, bgmFile } = useSceneStore.getState();
    if (!currentProjectId) {
      window.alert("プロジェクトを保存してからエクスポートしてください。");
      return;
    }

    setExporting(true);
    try {
      let response: Response;
      if (bgmFile) {
        const formData = new FormData();
        formData.append("projectId", currentProjectId);
        formData.append("fps", "30");
        formData.append("bgm", bgmFile);
        response = await fetch("/api/render", {
          method: "POST",
          body: formData,
        });
      } else {
        response = await fetch("/api/render", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId: currentProjectId, fps: 30 }),
        });
      }

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: "Export failed" }));
        window.alert(err.error || "Export failed");
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
      window.alert("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setExporting(false);
    }
  };

  const handleRenameProject = () => {
    const nextName = window.prompt("プロジェクト名を入力してください", projectName || "Untitled Project");
    if (!nextName?.trim()) {
      return;
    }

    setProjectName(nextName.trim());
  };

  return (
    <header className="flex items-center justify-between border-b border-gray-800 bg-gray-950 px-6 py-4">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => clearProject()}
          className="rounded-md border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
        >
          ← プロジェクト一覧
        </button>
        <button
          type="button"
          onClick={handleRenameProject}
          className="text-xl font-semibold tracking-wide text-white"
        >
          {`vKoma - ${projectName || "Untitled Project"}`}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void saveProject()}
          disabled={exporting}
          className="rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          💾 保存
        </button>
        <button
          type="button"
          data-testid="export-button"
          onClick={() => void exportVideo()}
          disabled={exporting}
          className="rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60"
        >
          {exporting ? "Exporting..." : "Export"}
        </button>
      </div>
    </header>
  );
}
