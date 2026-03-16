import { useSceneStore } from "../stores/sceneStore";

export function ParamPanel() {
  const scenes = useSceneStore((state) => state.scenes);
  const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
  const updateSceneParam = useSceneStore((state) => state.updateSceneParam);
  const updateSceneDuration = useSceneStore((state) => state.updateSceneDuration);

  const scene = scenes[currentSceneIndex];

  if (!scene) {
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
          <div className="text-lg font-semibold text-white">{scene.name}</div>
          <label className="mt-3 block text-sm text-gray-300">
            Duration
            <div className="mt-2 flex items-center gap-3">
              <input
                type="range"
                min={0.5}
                max={15}
                step={0.1}
                value={scene.duration}
                onChange={(event) =>
                  updateSceneDuration(scene.id, Number(event.currentTarget.value))
                }
                className="w-full"
              />
              <span className="w-12 text-right text-xs text-gray-400">
                {scene.duration.toFixed(1)}s
              </span>
            </div>
          </label>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {Object.entries(scene.sceneConfig.defaultParams).map(([key, config]) => {
          const value = scene.params[key] ?? config.default;

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
                    onChange={(event) =>
                      updateSceneParam(scene.id, key, Number(event.currentTarget.value))
                    }
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
                  onChange={(event) => updateSceneParam(scene.id, key, event.currentTarget.value)}
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
                  onChange={(event) => updateSceneParam(scene.id, key, event.currentTarget.value)}
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
                onChange={(event) => updateSceneParam(scene.id, key, event.currentTarget.value)}
                className="mt-2 w-full rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-white"
              />
            </label>
          );
        })}
      </div>
    </aside>
  );
}
