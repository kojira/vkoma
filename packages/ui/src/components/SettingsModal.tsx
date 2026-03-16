import { useEffect, useState } from "react";

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const [projectsDir, setProjectsDir] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: { projectsDir?: string }) => {
        setProjectsDir(data.projectsDir ?? "");
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectsDir }),
      });
      const data = (await response.json()) as { ok?: boolean; error?: string; projectsDir?: string };
      if (!response.ok || !data.ok) {
        setError(data.error ?? "保存に失敗しました");
        return;
      }
      setProjectsDir(data.projectsDir ?? projectsDir);
      setSaved(true);
    } catch {
      setError("保存に失敗しました");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-full max-w-md rounded-lg bg-gray-800 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">設定</h2>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-white"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>

        {loading ? (
          <p className="text-gray-400">読み込み中...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-gray-300">プロジェクト保存先</label>
              <input
                type="text"
                value={projectsDir}
                onChange={(e) => {
                  setProjectsDir(e.target.value);
                  setSaved(false);
                }}
                className="w-full rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/Users/yourname/vkoma-projects"
              />
            </div>

            {error && <p className="text-sm text-red-400">{error}</p>}

            {saved && (
              <p className="text-sm text-green-400">✅ 保存しました。再起動せず即時反映されます。</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
              >
                保存
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
