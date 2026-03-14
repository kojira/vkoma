import { useEffect, useRef, useState } from "react";
import { getSceneFrameRanges, useSceneStore } from "../stores/sceneStore";

function formatTime(frame: number, fps: number) {
  const totalSeconds = frame / fps;
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(totalSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

export function Timeline() {
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const [dragState, setDragState] = useState<{
    sceneId: string;
    edge: "left" | "right";
    startX: number;
    startDuration: number;
  } | null>(null);

  const scenes = useSceneStore((state) => state.scenes);
  const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
  const isPlaying = useSceneStore((state) => state.isPlaying);
  const currentFrame = useSceneStore((state) => state.currentFrame);
  const fps = useSceneStore((state) => state.fps);
  const addScene = useSceneStore((state) => state.addScene);
  const removeScene = useSceneStore((state) => state.removeScene);
  const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
  const setPlaying = useSceneStore((state) => state.setPlaying);
  const setCurrentFrame = useSceneStore((state) => state.setCurrentFrame);
  const updateSceneDuration = useSceneStore((state) => state.updateSceneDuration);
  const totalFrames = useSceneStore((state) => state.totalFrames());

  const ranges = getSceneFrameRanges(scenes, fps);
  const totalDuration = totalFrames / fps;

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const timeline = timelineRef.current;
      const draggedScene = scenes.find((scene) => scene.id === dragState.sceneId);
      if (!timeline || !draggedScene) {
        return;
      }

      const pixelsPerSecond = timeline.clientWidth / Math.max(totalDuration, 0.001);
      const deltaSeconds =
        ((event.clientX - dragState.startX) / Math.max(pixelsPerSecond, 1)) *
        (dragState.edge === "right" ? 1 : -1);

      updateSceneDuration(dragState.sceneId, dragState.startDuration + deltaSeconds);
    };

    const handleMouseUp = () => setDragState(null);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragState, scenes, totalDuration, updateSceneDuration]);

  const handleSeek = (clientX: number) => {
    const timeline = timelineRef.current;
    if (!timeline || totalFrames <= 0) {
      return;
    }

    const rect = timeline.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const nextFrame = Math.min(totalFrames - 1, Math.round(ratio * totalFrames));

    setCurrentFrame(nextFrame);

    const activeRange = ranges.find(
      (range) => nextFrame >= range.startFrame && nextFrame < range.endFrame,
    );
    if (activeRange) {
      setCurrentScene(activeRange.index);
    }
  };

  const selectedScene = scenes[currentSceneIndex];

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPlaying(!isPlaying)}
            className="rounded-md bg-blue-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPlaying(false);
              setCurrentFrame(0);
              setCurrentScene(0);
            }}
            className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Reset
          </button>
        </div>
        <div className="flex items-center gap-4 text-sm text-gray-300">
          <span>
            {formatTime(currentFrame, fps)} / {formatTime(totalFrames, fps)}
          </span>
          <span>Frame {currentFrame + 1}</span>
        </div>
      </div>

      <div
        ref={timelineRef}
        className="relative mt-4 h-24 overflow-hidden rounded-lg border border-gray-800 bg-gray-900"
        onMouseDown={(event) => {
          if (event.target !== event.currentTarget) {
            return;
          }
          handleSeek(event.clientX);
        }}
      >
        <div className="absolute inset-y-0 left-0 w-px bg-red-400" style={{ left: `${totalFrames > 0 ? (currentFrame / totalFrames) * 100 : 0}%` }} />
        <div className="flex h-full w-full">
          {ranges.map((range) => {
            const isSelected = range.index === currentSceneIndex;
            const widthPercent = totalFrames > 0 ? (range.frameLength / totalFrames) * 100 : 100;

            return (
              <button
                key={range.scene.id}
                type="button"
                className={`group relative h-full border-r border-gray-950 text-left transition ${
                  isSelected ? "bg-blue-500/30" : "bg-gray-800/90 hover:bg-gray-700"
                }`}
                style={{ width: `${widthPercent}%` }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setCurrentScene(range.index);
                  handleSeek(event.clientX);
                }}
              >
                <div className="flex h-full flex-col justify-between p-3">
                  <span className="truncate text-sm font-medium text-white">{range.scene.name}</span>
                  <span className="text-xs text-gray-300">{range.scene.duration.toFixed(1)}s</span>
                </div>
                <div
                  className="absolute inset-y-0 left-0 w-2 cursor-ew-resize bg-white/0 transition group-hover:bg-white/10"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    setDragState({
                      sceneId: range.scene.id,
                      edge: "left",
                      startX: event.clientX,
                      startDuration: range.scene.duration,
                    });
                  }}
                />
                <div
                  className="absolute inset-y-0 right-0 w-2 cursor-ew-resize bg-white/0 transition group-hover:bg-white/10"
                  onMouseDown={(event) => {
                    event.stopPropagation();
                    setDragState({
                      sceneId: range.scene.id,
                      edge: "right",
                      startX: event.clientX,
                      startDuration: range.scene.duration,
                    });
                  }}
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => addScene()}
            className="rounded-md bg-gray-800 px-3 py-2 text-sm font-medium text-white transition hover:bg-gray-700"
          >
            Add Scene
          </button>
          <button
            type="button"
            disabled={!selectedScene || scenes.length <= 1}
            onClick={() => {
              if (selectedScene) {
                removeScene(selectedScene.id);
              }
            }}
            className="rounded-md bg-red-500 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
          >
            Remove Scene
          </button>
        </div>
        <div className="text-sm text-gray-400">
          {selectedScene ? `${selectedScene.name} selected` : "No scene selected"}
        </div>
      </div>
    </div>
  );
}
