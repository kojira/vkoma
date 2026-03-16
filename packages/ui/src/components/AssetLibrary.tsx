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
      className="group flex cursor-grab items-center gap-2 rounded-md bg-gray-700 px-2 py-1.5 hover:bg-gray-600 active:cursor-grabbing"
      title={asset.filename}
    >
      {asset.thumbnailDataUrl && asset.type === "image" ? (
        <img
          src={asset.thumbnailDataUrl}
          alt={asset.name}
          className="h-8 w-8 flex-shrink-0 rounded object-cover"
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
        className="hidden h-5 w-5 flex-shrink-0 items-center justify-center rounded text-gray-400 group-hover:flex hover:bg-red-600 hover:text-white"
        title="削除"
      >
        ×
      </button>
    </div>
  );
}

function getAcceptForTab(tab: TabType): string {
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

function supportsRecording(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    "mediaDevices" in navigator &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
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
  const [showUrlForm, setShowUrlForm] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSupported, setRecordingSupported] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

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

  useEffect(() => {
    setRecordingSupported(supportsRecording());
  }, []);

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        recorder.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const appendAsset = useCallback((asset: Asset | undefined) => {
    if (!asset) {
      return;
    }
    setAssets((prev) => [...prev, asset]);
  }, []);

  const uploadAsset = useCallback(
    async (file: File) => {
      if (!projectId) {
        throw new Error("プロジェクトが選択されていません");
      }

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(`/api/projects/${projectId}/assets`, {
        method: "POST",
        body: formData,
      });
      const data = (await res.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | Asset
        | null;

      if (!res.ok) {
        throw new Error(
          data && "error" in data && typeof data.error === "string"
            ? data.error
            : "Failed to upload asset"
        );
      }

      const asset =
        data && "asset" in data ? data.asset : ((data as Asset | null | undefined) ?? undefined);
      appendAsset(asset);
    },
    [appendAsset, projectId]
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
      const data = (await response.json().catch(() => null)) as
        | { asset?: Asset; error?: string }
        | null;
      if (!response.ok) {
        throw new Error(data?.error ?? "URLからの取得に失敗しました");
      }

      appendAsset(data?.asset);
      setUrlInput("");
      setShowUrlForm(false);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "URLからの取得に失敗しました"
      );
    } finally {
      setFetchingUrl(false);
    }
  }, [appendAsset, projectId, urlInput]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (!projectId) {
      return;
    }
    if (!recordingSupported) {
      setUploadError("このブラウザでは録音に対応していません");
      return;
    }

    setUploadError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => {
        setUploadError("録音中にエラーが発生しました");
      };
      recorder.onstop = async () => {
        setRecording(false);
        mediaRecorderRef.current = null;
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;

        if (chunks.length === 0) {
          setUploadError("録音データを取得できませんでした");
          return;
        }

        const actualMimeType = recorder.mimeType || mimeType || "audio/webm";
        const extension = actualMimeType.includes("mp4") ? "mp4" : "webm";
        const file = new File(chunks, `recording_${Date.now()}.${extension}`, {
          type: actualMimeType,
        });

        setUploading(true);
        try {
          await uploadAsset(file);
        } catch (error) {
          setUploadError(
            error instanceof Error
              ? error.message
              : "録音ファイルのアップロードに失敗しました"
          );
        } finally {
          setUploading(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "マイクの権限がありません"
          : "録音を開始できませんでした";
      setUploadError(message);
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setRecording(false);
    }
  }, [projectId, recordingSupported, uploadAsset]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      if (e.dataTransfer.files.length > 0) {
        void handleFiles(e.dataTransfer.files);
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
  const showRecordingButton = activeTab === "all" || activeTab === "audio";

  return (
    <div className="flex w-full flex-col gap-2 rounded-lg bg-gray-800 p-3 lg:w-60">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-white">📁 アセット</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={!projectId || uploading || recording}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {uploading ? "…" : "+ 追加"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowUrlForm((prev) => !prev);
                setUploadError(null);
              }}
              disabled={!projectId || fetchingUrl || recording}
              className="rounded bg-sky-700 px-2 py-0.5 text-xs text-white hover:bg-sky-600 disabled:opacity-50"
            >
              🌐 URL
            </button>
            {showRecordingButton ? (
              recording ? (
                <button
                  type="button"
                  onClick={stopRecording}
                  disabled={!projectId || uploading}
                  className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
                >
                  ⏹ 停止
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    void startRecording();
                  }}
                  disabled={!projectId || uploading || fetchingUrl}
                  className="rounded bg-emerald-700 px-2 py-0.5 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
                >
                  🎤 録音
                </button>
              )
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={getAcceptForTab(activeTab)}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) {
                void handleFiles(e.target.files);
              }
              e.target.value = "";
            }}
          />
        </div>

        {showUrlForm ? (
          <div className="flex flex-col gap-2 rounded-md bg-gray-700 p-2">
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/audio.mp3"
              disabled={!projectId || fetchingUrl}
              className="w-full rounded bg-gray-800 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
            />
            <div className="flex justify-end gap-1">
              <button
                type="button"
                onClick={() => {
                  setShowUrlForm(false);
                  setUrlInput("");
                }}
                className="rounded bg-gray-600 px-2 py-1 text-xs text-white hover:bg-gray-500"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleFetchFromUrl();
                }}
                disabled={!projectId || fetchingUrl || urlInput.trim() === ""}
                className="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-500 disabled:opacity-50"
              >
                {fetchingUrl ? "取得中…" : "取得"}
              </button>
            </div>
          </div>
        ) : null}
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

      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 検索..."
        className="w-full rounded bg-gray-700 px-2 py-1 text-xs text-white placeholder-gray-400 outline-none focus:ring-1 focus:ring-blue-500"
      />

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
