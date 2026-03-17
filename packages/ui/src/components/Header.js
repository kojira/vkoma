import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";
export function Header() {
    const [exporting, setExporting] = useState(false);
    const [exportError, setExportError] = useState(null);
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
                setExportError(err.error || "ダウンロード失敗: レンダリングしてからお試しください。");
                return;
            }
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = `${projectName || "vkoma"}.mp4`;
            link.click();
            URL.revokeObjectURL(url);
        }
        catch (e) {
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
            }
            else {
                // Use an <a> tag for Playwright-compatible download
                const link = document.createElement("a");
                link.href = `/api/render/${currentProjectId}?fps=30`;
                link.download = `${projectName || "vkoma"}.mp4`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setExportSuccess(true);
            }
        }
        catch (e) {
            setExportError("Export failed: " + (e instanceof Error ? e.message : "Unknown error"));
        }
        finally {
            setExporting(false);
        }
    };
    const handleRenameProject = () => {
        const nextName = window.prompt("プロジェクト名を入力してください", projectName || "Untitled Project");
        if (!nextName?.trim())
            return;
        setProjectName(nextName.trim());
    };
    const saveStatusTone = saveStatus === "saved"
        ? "bg-emerald-400"
        : saveStatus === "saving"
            ? "bg-amber-400"
            : "bg-red-400";
    const saveStatusLabel = saveStatus === "saved" ? "Saved" : saveStatus === "saving" ? "Saving..." : "Error";
    return (_jsxs("header", { className: "flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 bg-gray-950 px-4 py-3 sm:px-6 sm:py-4", children: [_jsxs("div", { className: "flex items-center gap-3", children: [_jsx("button", { type: "button", onClick: () => clearProject(), className: "rounded-md border border-gray-700 px-3 py-2 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white", children: "\u2190 \u4E00\u89A7" }), _jsx("button", { type: "button", onClick: handleRenameProject, className: "truncate text-lg font-semibold tracking-wide text-white sm:text-xl", children: `vKoma - ${projectName || "Untitled Project"}` })] }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("div", { className: "inline-flex items-center gap-2 rounded-full border border-gray-800 bg-gray-900/80 px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-400", children: [_jsx("span", { className: `h-2 w-2 rounded-full ${saveStatusTone}` }), saveStatusLabel] }), exportError && (_jsxs("span", { className: "rounded-md bg-red-500/20 px-3 py-1.5 text-xs font-medium text-red-400 animate-pulse", children: ["\u274C ", exportError] })), exportSuccess && (_jsx("span", { className: "rounded-md bg-green-500/20 px-3 py-1.5 text-xs font-medium text-green-400", children: "\u2705 \u30A8\u30AF\u30B9\u30DD\u30FC\u30C8\u5B8C\u4E86" })), _jsx("button", { type: "button", onClick: () => void saveProject(), disabled: exporting, className: "rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-60", children: "\uD83D\uDCBE \u4FDD\u5B58" }), _jsx("button", { type: "button", "data-testid": "download-button", onClick: () => void downloadVideo(), className: "rounded-md border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:border-gray-500 hover:text-white", children: "\u2B07 \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9" }), _jsxs("button", { type: "button", "data-testid": "export-button", onClick: () => void exportVideo(), disabled: exporting, className: "flex items-center gap-2 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-500/60", children: [exporting && (_jsxs("svg", { className: "h-4 w-4 animate-spin", viewBox: "0 0 24 24", fill: "none", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" })] })), exporting ? "書き出し中..." : "📹 Export"] })] })] }));
}
