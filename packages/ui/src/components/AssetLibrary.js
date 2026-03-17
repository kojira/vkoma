import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSceneStore } from "../stores/sceneStore";
function formatFileSize(bytes) {
    if (bytes < 1024)
        return `${bytes}B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
function formatDuration(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}
function AssetIcon({ type }) {
    if (type === "image")
        return _jsx("span", { className: "text-blue-400", children: "\uD83D\uDDBC" });
    if (type === "audio")
        return _jsx("span", { className: "text-green-400", children: "\uD83C\uDFB5" });
    if (type === "video")
        return _jsx("span", { className: "text-purple-400", children: "\uD83C\uDFAC" });
    if (type === "font")
        return _jsx("span", { className: "text-yellow-400", children: "\uD83D\uDD24" });
    return _jsx("span", { children: "\uD83D\uDCC4" });
}
function AssetCard({ asset, onRemove }) {
    const handleDragStart = useCallback((e) => {
        e.dataTransfer.setData("application/vkoma-asset-id", asset.id);
        e.dataTransfer.setData("application/vkoma-asset-type", asset.type);
        e.dataTransfer.effectAllowed = "copy";
    }, [asset.id, asset.type]);
    return (_jsxs("div", { draggable: true, onDragStart: handleDragStart, className: "group flex cursor-grab items-center gap-2 rounded-md bg-gray-700 px-2 py-1.5 hover:bg-gray-600 active:cursor-grabbing", title: asset.filename, children: [asset.thumbnailDataUrl && asset.type === "image" ? (_jsx("img", { src: asset.thumbnailDataUrl, alt: asset.name, className: "h-8 w-8 flex-shrink-0 rounded object-cover" })) : (_jsx("div", { className: "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-600 text-lg", children: _jsx(AssetIcon, { type: asset.type }) })), _jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("p", { className: "truncate text-xs text-white", children: asset.name }), _jsxs("p", { className: "text-xs text-gray-400", children: [asset.type === "image" && asset.width && asset.height
                                ? `${asset.width}×${asset.height} · `
                                : "", asset.type === "audio" || asset.type === "video"
                                ? asset.duration
                                    ? `${formatDuration(asset.duration)} · `
                                    : ""
                                : "", formatFileSize(asset.size)] })] }), _jsx("button", { onClick: (e) => {
                    e.stopPropagation();
                    onRemove(asset.id);
                }, className: "hidden h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 group-hover:flex hover:bg-red-600 hover:text-white", title: "\u524A\u9664", children: "\u00D7" })] }));
}
function getAcceptForTab(tab) {
    switch (tab) {
        case "image":
            return "image/*,.jpg,.jpeg,.png,.gif,.webp,.svg";
        case "audio":
            return "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4";
        case "video":
            return "video/*,.mp4,.webm,.mov";
        default:
            return "image/*,audio/*,video/*,.jpg,.jpeg,.png,.gif,.webp,.svg,.mp3,.wav,.m4a,.aac,.ogg,.flac,.mp4,.webm,.mov";
    }
}
export function AssetLibrary() {
    const projectId = useSceneStore((s) => s.currentProjectId);
    const [assets, setAssets] = useState([]);
    const [activeTab, setActiveTab] = useState("all");
    const [search, setSearch] = useState("");
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState(null);
    const [showUrlForm, setShowUrlForm] = useState(false);
    const [urlInput, setUrlInput] = useState("");
    const [fetchingUrl, setFetchingUrl] = useState(false);
    const fileInputRef = useRef(null);
    useEffect(() => {
        if (!projectId) {
            setAssets([]);
            return;
        }
        fetch(`/api/projects/${projectId}/assets`)
            .then((r) => r.json())
            .then((data) => setAssets(data.assets ?? []))
            .catch(() => setAssets([]));
    }, [projectId]);
    const appendAsset = useCallback((asset) => {
        if (!asset) {
            return;
        }
        setAssets((prev) => [...prev, asset]);
    }, []);
    const uploadAsset = useCallback(async (file) => {
        if (!projectId) {
            throw new Error("プロジェクトが選択されていません");
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(`/api/projects/${projectId}/assets`, {
            method: "POST",
            body: formData,
        });
        const data = (await res.json().catch(() => null));
        if (!res.ok) {
            throw new Error(data && "error" in data && typeof data.error === "string"
                ? data.error
                : "Failed to upload asset");
        }
        const asset = data && "asset" in data ? data.asset : (data ?? undefined);
        appendAsset(asset);
    }, [appendAsset, projectId]);
    const removeAsset = useCallback(async (assetId) => {
        if (!projectId)
            return;
        await fetch(`/api/projects/${projectId}/assets/${assetId}`, {
            method: "DELETE",
        });
        setAssets((prev) => prev.filter((a) => a.id !== assetId));
    }, [projectId]);
    const filteredAssets = assets.filter((a) => {
        const matchesTab = activeTab === "all" || a.type === activeTab;
        const matchesSearch = search === "" || a.name.toLowerCase().includes(search.toLowerCase());
        return matchesTab && matchesSearch;
    });
    const handleFiles = useCallback(async (files) => {
        if (!projectId)
            return;
        setUploadError(null);
        setUploading(true);
        try {
            for (const file of Array.from(files)) {
                try {
                    await uploadAsset(file);
                }
                catch (error) {
                    setUploadError(error instanceof Error ? error.message : "Failed to upload asset");
                }
            }
        }
        finally {
            setUploading(false);
        }
    }, [projectId, uploadAsset]);
    const handleFetchFromUrl = useCallback(async () => {
        if (!projectId || urlInput.trim() === "") {
            return;
        }
        setUploadError(null);
        setFetchingUrl(true);
        try {
            const response = await fetch(`/api/projects/${projectId}/assets/fetch-url`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ url: urlInput.trim() }),
            });
            const data = (await response.json().catch(() => null));
            if (!response.ok) {
                throw new Error(data?.error ?? "URLからの取得に失敗しました");
            }
            appendAsset(data?.asset);
            setUrlInput("");
            setShowUrlForm(false);
        }
        catch (error) {
            setUploadError(error instanceof Error ? error.message : "URLからの取得に失敗しました");
        }
        finally {
            setFetchingUrl(false);
        }
    }, [appendAsset, projectId, urlInput]);
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files.length > 0) {
            void handleFiles(e.dataTransfer.files);
        }
    }, [handleFiles]);
    const tabs = [
        { key: "all", label: "全て" },
        { key: "image", label: "画像" },
        { key: "audio", label: "音声" },
        { key: "video", label: "動画" },
    ];
    return (_jsxs("div", { className: "flex w-full flex-col gap-2 rounded-lg bg-gray-800 p-3 lg:w-60", children: [_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex items-center justify-between gap-2", children: [_jsx("span", { className: "text-sm font-semibold text-white", children: "\uD83D\uDCC1 \u30A2\u30BB\u30C3\u30C8" }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: () => fileInputRef.current?.click(), disabled: !projectId || uploading, className: "rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50", children: uploading ? "…" : "+ 追加" }), _jsx("button", { type: "button", onClick: () => {
                                            setShowUrlForm((prev) => !prev);
                                            setUploadError(null);
                                        }, disabled: !projectId || fetchingUrl, className: "rounded bg-sky-700 px-2 py-0.5 text-xs text-white hover:bg-sky-600 disabled:opacity-50", children: "\uD83C\uDF10 URL" })] }), _jsx("input", { ref: fileInputRef, type: "file", multiple: true, accept: getAcceptForTab(activeTab), className: "hidden", onChange: (e) => {
                                    if (e.target.files) {
                                        void handleFiles(e.target.files);
                                    }
                                    e.target.value = "";
                                } })] }), showUrlForm ? (_jsxs("div", { className: "flex flex-col gap-2 rounded-md bg-gray-700 p-2", children: [_jsx("input", { type: "url", value: urlInput, onChange: (e) => setUrlInput(e.target.value), placeholder: "https://example.com/audio.mp3", disabled: !projectId || fetchingUrl, className: "w-full rounded bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50" }), _jsxs("div", { className: "flex justify-end gap-1", children: [_jsx("button", { type: "button", onClick: () => {
                                            setShowUrlForm(false);
                                            setUrlInput("");
                                        }, className: "rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-500", children: "\u30AD\u30E3\u30F3\u30BB\u30EB" }), _jsx("button", { type: "button", onClick: () => {
                                            void handleFetchFromUrl();
                                        }, disabled: !projectId || fetchingUrl || urlInput.trim() === "", className: "rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-500 disabled:opacity-50", children: fetchingUrl ? "取得中…" : "取得" })] })] })) : null] }), uploadError ? (_jsxs("button", { type: "button", onClick: () => setUploadError(null), className: "flex items-center justify-between gap-2 rounded text-left text-xs text-red-400 hover:text-red-300", children: [_jsx("span", { children: uploadError }), _jsx("span", { className: "text-sm leading-none", children: "\u00D7" })] })) : null, _jsx("input", { type: "text", value: search, onChange: (e) => setSearch(e.target.value), placeholder: "\uD83D\uDD0D \u691C\u7D22...", className: "w-full rounded bg-gray-700 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500" }), _jsx("div", { className: "flex gap-1", children: tabs.map((tab) => (_jsx("button", { onClick: () => setActiveTab(tab.key), className: `flex-1 rounded px-1 py-0.5 text-xs transition-colors ${activeTab === tab.key
                        ? "bg-blue-600 text-white"
                        : "text-gray-400 hover:bg-gray-700 hover:text-white"}`, children: tab.label }, tab.key))) }), _jsx("div", { onDragOver: (e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                        e.preventDefault();
                        setIsDraggingOver(true);
                    }
                }, onDragLeave: () => setIsDraggingOver(false), onDrop: handleDrop, className: `flex min-h-20 flex-col gap-1 rounded-md p-1 transition-colors ${isDraggingOver ? "bg-blue-900 ring-2 ring-blue-400" : ""}`, children: filteredAssets.length === 0 ? (_jsx("div", { className: "flex flex-1 items-center justify-center py-6 text-xs text-gray-500", children: isDraggingOver ? "ここにドロップ" : "アセットなし" })) : (filteredAssets.map((asset) => (_jsx(AssetCard, { asset: asset, onRemove: removeAsset }, asset.id)))) })] }));
}
