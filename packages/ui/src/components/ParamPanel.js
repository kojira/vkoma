import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useSceneStore, resolveSceneConfig } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";
function findSelectedTimelineItem(tracks, selectedItemId) {
    if (!selectedItemId) {
        return null;
    }
    for (const track of tracks) {
        const item = track.items.find((entry) => entry.id === selectedItemId);
        if (item) {
            return item;
        }
    }
    return null;
}
function ParameterFields({ defaultParams, params, updateParam, }) {
    return (_jsx("div", { className: "mt-4 space-y-4", children: Object.entries(defaultParams).map(([key, config]) => {
            const value = params[key] ?? config.default;
            if (config.type === "number") {
                return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsxs("div", { className: "mt-2 flex items-center gap-3", children: [_jsx("input", { type: "range", min: config.min ?? 0, max: config.max ?? 100, step: config.step ?? 1, value: Number(value), onChange: (event) => updateParam(key, Number(event.currentTarget.value)), className: "w-full" }), _jsx("span", { className: "w-14 text-right text-xs text-gray-400", children: value })] })] }, key));
            }
            if (config.type === "color") {
                return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("input", { type: "color", value: String(value), onChange: (event) => updateParam(key, event.currentTarget.value), className: "mt-2 h-10 w-full rounded border border-gray-700 bg-transparent" })] }, key));
            }
            if (config.type === "select") {
                return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("select", { value: String(value), onChange: (event) => updateParam(key, event.currentTarget.value), className: "mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white", children: (config.options ?? []).map((option) => (_jsx("option", { value: option, children: option }, option))) })] }, key));
            }
            return (_jsxs("label", { className: "block text-sm text-gray-300", children: [config.label, _jsx("input", { type: "text", value: String(value), onChange: (event) => updateParam(key, event.currentTarget.value), className: "mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white" })] }, key));
        }) }));
}
function buildTimelinePanelState(item) {
    const sceneConfig = resolveSceneConfig({
        name: typeof item.params.name === "string" && item.params.name.trim() !== ""
            ? item.params.name
            : item.sceneConfigId,
        duration: item.duration,
        params: item.params,
        sceneConfigId: item.sceneConfigId,
        renderCode: item.renderCode,
    }, "Dynamic Timeline Scene");
    return {
        title: sceneConfig?.name ??
            (typeof item.params.name === "string" && item.params.name.trim() !== ""
                ? item.params.name
                : item.assetId ?? item.sceneConfigId ?? item.id),
        duration: item.duration,
        params: item.params,
        defaultParams: sceneConfig?.defaultParams ?? {},
        updateParam: (key, value) => {
            useTimelineStore.getState().updateItemParam(item.id, key, value);
        },
        updateDuration: (duration) => {
            useTimelineStore.getState().updateItem(item.trackId, item.id, { duration });
        },
        mode: "timeline",
    };
}
export function ParamPanel() {
    const scenes = useSceneStore((state) => state.scenes);
    const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
    const updateSceneParam = useSceneStore((state) => state.updateSceneParam);
    const updateSceneDuration = useSceneStore((state) => state.updateSceneDuration);
    const tracks = useTimelineStore((state) => state.tracks);
    const selectedItemId = useTimelineStore((state) => state.selectedItemId);
    const selectedTimelineItem = findSelectedTimelineItem(tracks, selectedItemId);
    const timelinePanelState = selectedTimelineItem
        ? buildTimelinePanelState(selectedTimelineItem)
        : null;
    const scene = scenes[currentSceneIndex];
    const panelState = (selectedTimelineItem
        ? timelinePanelState
        : null) ??
        (scene
            ? {
                title: scene.name,
                duration: scene.duration,
                params: scene.params,
                defaultParams: scene.sceneConfig.defaultParams,
                updateParam: (key, value) => updateSceneParam(scene.id, key, value),
                updateDuration: (duration) => updateSceneDuration(scene.id, duration),
                mode: "scene",
            }
            : null);
    if (!panelState) {
        return (_jsx("aside", { className: "w-full shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72", children: _jsx("div", { className: "text-sm text-gray-400", children: "No scene selected." }) }));
    }
    return (_jsxs("aside", { className: "w-full shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72", children: [_jsxs("div", { className: "border-b border-gray-800 pb-4", children: [_jsx("h2", { className: "text-sm font-semibold uppercase tracking-[0.2em] text-gray-300", children: "Parameters" }), _jsxs("div", { className: "mt-3", children: [_jsx("div", { className: "text-lg font-semibold text-white", children: panelState.title }), _jsx("div", { className: "mt-1 text-xs uppercase tracking-[0.16em] text-gray-500", children: panelState.mode === "timeline" ? "Timeline item" : "Scene" }), _jsxs("label", { className: "mt-3 block text-sm text-gray-300", children: ["Duration", _jsxs("div", { className: "mt-2 flex items-center gap-3", children: [_jsx("input", { type: "range", min: 0.5, max: 15, step: 0.1, value: panelState.duration, onChange: (event) => panelState.updateDuration(Number(event.currentTarget.value)), className: "w-full" }), _jsxs("span", { className: "w-12 text-right text-xs text-gray-400", children: [panelState.duration.toFixed(1), "s"] })] })] })] })] }), _jsx(ParameterFields, { defaultParams: panelState.defaultParams, params: panelState.params, updateParam: panelState.updateParam })] }));
}
