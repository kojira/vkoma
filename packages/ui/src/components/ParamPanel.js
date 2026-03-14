import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSceneStore } from "../stores/sceneStore";
export function ParamPanel() {
    const scenes = useSceneStore((state) => state.scenes);
    const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
    const updateSceneParam = useSceneStore((state) => state.updateSceneParam);
    const updateSceneDuration = useSceneStore((state) => state.updateSceneDuration);
    const scene = scenes[currentSceneIndex];
    if (!scene) {
        return (_jsx("aside", { className: "hidden w-72 shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:block", children: _jsx("div", { className: "text-sm text-gray-400", children: "No scene selected." }) }));
    }
    return (_jsxs("aside", { className: "hidden w-72 shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:block", children: [_jsxs("div", { className: "border-b border-gray-800 pb-4", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-[0.2em] text-gray-300", children: "Parameters" }), _jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "text-lg font-semibold text-white", children: scene.name }), _jsxs("label", { className: "mt-3 block text-sm text-gray-300", children: ["Duration", _jsxs("div", { className: "mt-2 flex items-center gap-3", children: [_jsx("input", { type: "range", min: 0.5, max: 15, step: 0.1, value: scene.duration, onChange: (event) => updateSceneDuration(scene.id, Number(event.currentTarget.value)), className: "w-full" }), _jsxs("span", { className: "w-12 text-right text-xs text-gray-400", children: [scene.duration.toFixed(1), "s"] })] })] })] })] }), _jsx("div", { className: "mt-4 space-y-4", children: Object.entries(scene.sceneConfig.defaultParams).map(([key, config]) => {
                    const value = scene.params[key] ?? config.default;
                    if (config.type === "number") {
                        return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsxs("div", { className: "mt-2 flex items-center gap-3", children: [_jsx("input", { type: "range", min: config.min ?? 0, max: config.max ?? 100, step: config.step ?? 1, value: Number(value), onChange: (event) => updateSceneParam(scene.id, key, Number(event.currentTarget.value)), className: "w-full" }), _jsx("span", { className: "w-14 text-right text-xs text-gray-400", children: value })] })] }, key));
                    }
                    if (config.type === "color") {
                        return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("input", { type: "color", value: String(value), onChange: (event) => updateSceneParam(scene.id, key, event.currentTarget.value), className: "mt-2 h-10 w-full rounded border border-gray-700 bg-transparent" })] }, key));
                    }
                    if (config.type === "select") {
                        return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("select", { value: String(value), onChange: (event) => updateSceneParam(scene.id, key, event.currentTarget.value), className: "mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white", children: (config.options ?? []).map((option) => (_jsx("option", { value: option, children: option }, option))) })] }, key));
                    }
                    return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("input", { type: "text", value: String(value), onChange: (event) => updateSceneParam(scene.id, key, event.currentTarget.value), className: "mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white" })] }, key));
                }) })] }));
}
