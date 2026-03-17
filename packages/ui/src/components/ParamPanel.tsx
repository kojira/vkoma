import type { SceneParam } from "../../../../packages/core/src/index";
import type { TrackItem } from "../../../../packages/core/src/timeline";
import { useSceneStore, resolveSceneConfig } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";

type PanelState = {
  title: string;
  duration: number;
  params: Record<string, unknown>;
  defaultParams: Record<string, SceneParam>;
  updateParam: (key: string, value: unknown) => void;
  updateDuration: (duration: number) => void;
  mode: "scene" | "timeline";
};

function findSelectedTimelineItem(
  tracks: ReturnType<typeof useTimelineStore.getState>["tracks"],
  selectedItemId: string | null,
): TrackItem | null {
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

function ParameterFields({
  defaultParams,
  params,
  updateParam,
}: {
  defaultParams: Record<string, SceneParam>;
  params: Record<string, unknown>;
  updateParam: (key: string, value: unknown) => void;
}) {
  return (
    <div className="mt-4 space-y-4">
      {Object.entries(defaultParams).map(([key, config]) => {
        const value = params[key] ?? config.default;

        if (config.type === "number") {
          return (
            <label key={key} className="block text-sm text-gray-300">
              {config.label}
              <div className="mt-2 flex items-center gap-3">
                <input
                  type="range"
                  min={config.min ?? 0}
                  max={config.max ?? 100}
                  step={config.step ?? 1}
                  value={Number(value)}
                  onChange={(event) => updateParam(key, Number(event.currentTarget.value))}
                  className="w-full"
                />
                <span className="w-14 text-right text-xs text-gray-400">{value}</span>
              </div>
            </label>
          );
        }

        if (config.type === "color") {
          return (
            <label key={key} className="block text-sm text-gray-300">
              {config.label}
              <input
                type="color"
                value={String(value)}
                onChange={(event) => updateParam(key, event.currentTarget.value)}
                className="mt-2 h-10 w-full rounded border border-gray-700 bg-transparent"
              />
            </label>
          );
        }

        if (config.type === "select") {
          return (
            <label key={key} className="block text-sm text-gray-300">
              {config.label}
              <select
                value={String(value)}
                onChange={(event) => updateParam(key, event.currentTarget.value)}
                className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              >
                {(config.options ?? []).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          );
        }

        return (
          <label key={key} className="block text-sm text-gray-300">
            {config.label}
            <input
              type="text"
              value={String(value)}
              onChange={(event) => updateParam(key, event.currentTarget.value)}
              className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white"
            />
          </label>
        );
      })}
    </div>
  );
}

function buildTimelinePanelState(item: TrackItem): PanelState | null {
  const sceneConfig = resolveSceneConfig(
    {
      name:
        typeof item.params.name === "string" && item.params.name.trim() !== ""
          ? item.params.name
          : item.sceneConfigId,
      duration: item.duration,
      params: item.params,
      sceneConfigId: item.sceneConfigId,
      renderCode: item.renderCode,
    },
    "Dynamic Timeline Scene",
  );

  return {
    title:
      sceneConfig?.name ??
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

  const panelState: PanelState | null =
    (selectedTimelineItem
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
    return (
      <aside className="w-full shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72">
        <div className="text-sm text-gray-400">No scene selected.</div>
      </aside>
    );
  }

  return (
    <aside className="w-full shrink-0 rounded-xl border border-gray-800 bg-gray-950 p-4 lg:w-72">
      <div className="border-b border-gray-800 pb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-300">
          Parameters
        </h2>
        <div className="mt-3">
          <div className="text-lg font-semibold text-white">{panelState.title}</div>
          <div className="mt-1 text-xs uppercase tracking-[0.16em] text-gray-500">
            {panelState.mode === "timeline" ? "Timeline item" : "Scene"}
          </div>
          <label className="mt-3 block text-sm text-gray-300">
            Duration
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={15}
                step={0.1}
                value={panelState.duration}
                onChange={(event) => panelState.updateDuration(Number(event.currentTarget.value))}
                className="w-full"
              />
              <span className="w-12 text-right text-xs text-gray-400">
                {panelState.duration.toFixed(1)}s
              </span>
            </div>
          </label>
        </div>
      </div>

      <ParameterFields
        defaultParams={panelState.defaultParams}
        params={panelState.params}
        updateParam={panelState.updateParam}
      />
    </aside>
  );
}
