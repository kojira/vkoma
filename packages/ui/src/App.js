import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
    const [activeTab, setActiveTab] = useState("timeline");
    useEffect(() => {
        if (autoLoadAttempted.current)
            return;
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
    if (currentProjectId === null) {
        return _jsx(ProjectSelector, {});
    }
    const assetLibraryPanel = (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200", children: "\uD83C\uDFB5 BGM\u3092\u8FFD\u52A0" }), _jsx(AssetLibrary, {})] }));
    return (_jsxs("div", { className: "min-h-screen bg-gray-900 text-white", children: [_jsx(Header, {}), showSettings && _jsx(SettingsModal, { onClose: () => setShowSettings(false) }), _jsxs("main", { className: "flex flex-col gap-4 p-4 pb-16 lg:flex-row lg:pb-0", children: [_jsxs("div", { className: "hidden lg:flex lg:flex-col lg:gap-4", children: [_jsx(ParamPanel, {}), assetLibraryPanel] }), _jsxs("div", { className: "lg:hidden", children: [activeTab === "assets" && assetLibraryPanel, activeTab === "params" && _jsx(ParamPanel, {})] }), _jsxs("section", { className: `min-w-0 flex-1 flex-col gap-4 ${activeTab === "timeline" ? "flex" : "hidden lg:flex"}`, children: [_jsx(PreviewCanvas, {}), _jsx(Timeline, {}), _jsx("div", { className: "lg:hidden", children: _jsx(ChatPanel, {}) })] }), _jsx("div", { className: "hidden lg:block", children: _jsx(ChatPanel, {}) })] }), _jsxs("nav", { className: "fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-700 bg-gray-900 lg:hidden", "aria-label": "\u30E2\u30D0\u30A4\u30EB\u30BF\u30D6", children: [_jsxs("button", { onClick: () => setActiveTab("timeline"), className: `flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${activeTab === "timeline" ? "text-blue-400" : "text-gray-400"}`, children: [_jsx("span", { className: "text-lg", "aria-hidden": "true", children: "\uD83C\uDFAC" }), "\u30BF\u30A4\u30E0\u30E9\u30A4\u30F3"] }), _jsxs("button", { onClick: () => setActiveTab("assets"), className: `flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${activeTab === "assets" ? "text-blue-400" : "text-gray-400"}`, children: [_jsx("span", { className: "text-lg", "aria-hidden": "true", children: "\uD83C\uDFB5" }), "\u30A2\u30BB\u30C3\u30C8"] }), _jsxs("button", { onClick: () => setActiveTab("params"), className: `flex flex-1 flex-col items-center justify-center gap-1 py-3 text-xs ${activeTab === "params" ? "text-blue-400" : "text-gray-400"}`, children: [_jsx("span", { className: "text-lg", "aria-hidden": "true", children: "\u2699\uFE0F" }), "\u30D1\u30E9\u30E1\u30FC\u30BF"] })] }), _jsx("button", { onClick: () => setShowSettings(true), className: "fixed bottom-20 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-gray-700 text-white shadow-lg transition-colors hover:bg-gray-600 lg:bottom-4", "aria-label": "\u8A2D\u5B9A", title: "\u8A2D\u5B9A", children: "\u2699" })] }));
}
