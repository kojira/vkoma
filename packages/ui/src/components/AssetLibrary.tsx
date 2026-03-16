import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, AssetType } from "../../../../packages/core/src/asset";
import { useSceneStore } from "../stores/sceneStore";

type TabType = "all" | AssetType;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return m > 0 ? `${m}:${s.toString().padStart(2, "0")}` : `${s}s`;
}

function AssetIcon({ type }: { type: AssetType }) {
  if (type === "image") return <span className="text-blue-400">🖼</span>;
  if (type === "audio") return <span className="text-green-400">🎵</span>;
  if (type === "video") return <span className="text-purple-400">🎬</span>;
  if (type === "font") return <span className="text-yellow-400">🔤</span>;
  return <span>📄</span>;
}

function AssetCard({ asset, onRemove }: { asset: Asset; onRemove: (id: string) => void }) {
  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData("application/vkoma-asset-id", asset.id);
      e.dataTransfer.setData("application/vkoma-asset-type", asset.type);
      e.dataTransfer.effectAllowed = "copy";
    },
    [asset.id, asset.type]
  );

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className="group flex items-center gap-2 rounded-md bg-gray-700 px-2 py-1.5 hover:bg-gray-600 cursor-grab active:cursor-grabbing"
      title={asset.filename}
    >
      {asset.thumbnailDataUrl && asset.type === "image" ? (
        <img
          src={asset.thumbnailDataUrl}
          alt={asset.name}
          className="h-8 w-8 rounded object-cover flex-shrink-0"
        />
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded bg-gray-600 text-lg">
          <AssetIcon type={asset.type} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white">{asset.name}</p>
        <p className="text-xs text-gray-400">
          {asset.type === "image" && asset.width && asset.height
            ? `${asset.width}×${asset.height} · `
            : ""}
          {asset.type === "audio" || asset.type === "video"
            ? asset.duration
              ? `${formatDuration(asset.duration)} · `
              : ""
            : ""}
          {formatFileSize(asset.size)}
        </p>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove(asset.id);
        }}
        className="hidden group-hover:flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 hover:bg-red-600 hover:text-white"
        title="削除"
      >
        ×
      </button>
    </div>
  );
}

export function AssetLibrary() {
  const projectId = useSceneStore((s) => s.currentProjectId);
  const [assets, setAssets] = useState<Asset[]>([]);

  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [search, setSearch] = useState("");
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!projectId) {
      setAssets([]);
      return;
    }

    fetch(`/api/projects/${projectId}/assets`)
      .then((r) => r.json())
      .then((data: { assets?: Asset[] }) => setAssets(data.assets ?? []))
      .catch(() => setAssets([]));
  }, [projectId]);

  const uploadAsset = useCallback(
    async (file: File) => {
      if (!projectId) return;

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        if (res.status === 400) {
          await res.json().catch(() => null);
          throw new Error("このファイル形式には対応していません");
        }
        throw new Error("Failed to upload asset");
      }

      const data = (await res.json()) as { asset?: Asset };
      if (data.asset) setAssets((prev) => [...prev, data.asset as Asset]);
    },
    [projectId]
  );

  const removeAsset = useCallback(
    async (assetId: string) => {
      if (!projectId) return;

      await fetch(`/api/projects/${projectId}/assets/${assetId}`, {
        method: "DELETE",
      });
      setAssets((prev) => prev.filter((a) => a.id !== assetId));
    },
    [projectId]
  );

  const filteredAssets = assets.filter((a) => {
    const matchesTab = activeTab === "all" || a.type === activeTab;
    const matchesSearch =
      search === "" || a.name.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      if (!projectId) return;
      setUploadError(null);
      setUploading(true);
      try {
        for (const file of Array.from(files)) {
          try {
            await uploadAsset(file);
          } catch (error) {
            setUploadError(
              error instanceof Error ? error.message : "Failed to upload asset"
            );
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [projectId, uploadAsset]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
      }
    },
    [handleFiles]
  );

  const tabs: { key: TabType; label: string }[] = [
    { key: "all", label: "全て" },
    { key: "image", label: "画像" },
    { key: "audio", label: "音声" },
    { key: "video", label: "動画" },
  ];

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-gray-800 p-3 lg:w-60">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-white">📁 アセット</span>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={!projectId || uploading}
          className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {uploading ? "…" : "+ 追加"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {uploadError ? (
        <button
          type="button"
          onClick={() => setUploadError(null)}
          className="flex items-center justify-between gap-2 rounded text-left text-xs text-red-400 hover:text-red-300"
        >
          <span>{uploadError}</span>
          <span className="text-sm leading-none">×</span>
        </button>
      ) : null}

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 検索..."
        className="w-full rounded bg-gray-700 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
      />

      {/* Tabs */}
      <div className="flex gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 rounded px-1 py-0.5 text-xs transition-colors ${
              activeTab === tab.key
                ? "bg-blue-600 text-white"
                : "text-gray-400 hover:bg-gray-700 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Asset list with drop zone */}
      <div
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setIsDraggingOver(true);
          }
        }}
        onDragLeave={() => setIsDraggingOver(false)}
        onDrop={handleDrop}
        className={`flex min-h-20 flex-col gap-1 rounded-md p-1 transition-colors ${
          isDraggingOver ? "bg-blue-900 ring-2 ring-blue-400" : ""
        }`}
      >
        {filteredAssets.length === 0 ? (
          <div className="flex flex-1 items-center justify-center py-6 text-xs text-gray-500">
            {isDraggingOver ? "ここにドロップ" : "アセットなし"}
          </div>
        ) : (
          filteredAssets.map((asset) => (
            <AssetCard key={asset.id} asset={asset} onRemove={removeAsset} />
          ))
        )}
      </div>
    </div>
  );
}
