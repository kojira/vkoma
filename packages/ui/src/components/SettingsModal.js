import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState } from "react";
export function SettingsModal({ onClose }) {
    const [projectsDir, setProjectsDir] = useState("");
    const [saved, setSaved] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    useEffect(() => {
        fetch("/api/settings")
            .then((r) => r.json())
            .then((data) => {
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
            const data = (await response.json());
            if (!response.ok || !data.ok) {
                setError(data.error ?? "保存に失敗しました");
                return;
            }
            setProjectsDir(data.projectsDir ?? projectsDir);
            setSaved(true);
        }
        catch {
            setError("保存に失敗しました");
        }
    };
    return (_jsx("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-black/60", children: _jsxs("div", { className: "w-full max-w-md rounded-lg bg-gray-800 p-6 shadow-xl", children: [_jsxs("div", { className: "mb-4 flex items-center justify-between", children: [_jsx("h2", { className: "text-lg font-semibold text-white", children: "\u8A2D\u5B9A" }), _jsx("button", { onClick: onClose, className: "text-gray-400 transition-colors hover:text-white", "aria-label": "\u9589\u3058\u308B", children: "\u2715" })] }), loading ? (_jsx("p", { className: "text-gray-400", children: "\u8AAD\u307F\u8FBC\u307F\u4E2D..." })) : (_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "mb-1 block text-sm text-gray-300", children: "\u30D7\u30ED\u30B8\u30A7\u30AF\u30C8\u4FDD\u5B58\u5148" }), _jsx("input", { type: "text", value: projectsDir, onChange: (e) => {
                                        setProjectsDir(e.target.value);
                                        setSaved(false);
                                    }, className: "w-full rounded bg-gray-700 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500", placeholder: "/Users/yourname/vkoma-projects" })] }), error && _jsx("p", { className: "text-sm text-red-400", children: error }), saved && (_jsx("p", { className: "text-sm text-green-400", children: "\u2705 \u4FDD\u5B58\u3057\u307E\u3057\u305F\u3002\u518D\u8D77\u52D5\u305B\u305A\u5373\u6642\u53CD\u6620\u3055\u308C\u307E\u3059\u3002" })), _jsxs("div", { className: "flex justify-end gap-2", children: [_jsx("button", { onClick: onClose, className: "rounded px-4 py-2 text-sm text-gray-400 transition-colors hover:text-white", children: "\u30AD\u30E3\u30F3\u30BB\u30EB" }), _jsx("button", { onClick: handleSave, className: "rounded bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700", children: "\u4FDD\u5B58" })] })] }))] }) }));
}
