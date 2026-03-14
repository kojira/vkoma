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
  const sceneBarRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const touchDragTimerRef = useRef<number | null>(null);
  const [dragState, setDragState] = useState<{
    sceneId: string;
    edge: "left" | "right";
    startX: number;
    startDuration: number;
  } | null>(null);
  const [touchDragState, setTouchDragState] = useState<{
    sceneId: string;
    fromIndex: number;
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    dragWidth: number;
    targetIndex: number;
    isDragging: boolean;
  } | null>(null);

  const scenes = useSceneStore((state) => state.scenes);
  const currentSceneIndex = useSceneStore((state) => state.currentSceneIndex);
  const isPlaying = useSceneStore((state) => state.isPlaying);
  const currentFrame = useSceneStore((state) => state.currentFrame);
  const fps = useSceneStore((state) => state.fps);
  const addScene = useSceneStore((state) => state.addScene);
  const removeScene = useSceneStore((state) => state.removeScene);
  const reorderScenes = useSceneStore((state) => state.reorderScenes);
  const setCurrentScene = useSceneStore((state) => state.setCurrentScene);
  const setPlaying = useSceneStore((state) => state.setPlaying);
  const setCurrentFrame = useSceneStore((state) => state.setCurrentFrame);
  const updateSceneDuration = useSceneStore((state) => state.updateSceneDuration);
  const totalFrames = useSceneStore((state) => state.totalFrames());

  const ranges = getSceneFrameRanges(scenes, fps);
  const totalDuration = totalFrames / fps;

  const clearTouchDragTimer = () => {
    if (touchDragTimerRef.current !== null) {
      window.clearTimeout(touchDragTimerRef.current);
      touchDragTimerRef.current = null;
    }
  };

  const getTouchTargetIndex = (touchX: number, draggedSceneId: string) => {
    const otherCenters = ranges
      .filter((range) => range.scene.id !== draggedSceneId)
      .map((range) => {
        const element = sceneBarRefs.current[range.scene.id];
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2;
      })
      .filter((center): center is number => center !== null);

    let nextIndex = 0;
    for (const center of otherCenters) {
      if (touchX > center) {
        nextIndex += 1;
      }
    }

    return Math.max(0, Math.min(nextIndex, scenes.length - 1));
  };

  const resetTouchDrag = () => {
    clearTouchDragTimer();
    setTouchDragState(null);
  };

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

  useEffect(() => {
    if (!touchDragState) {
      return;
    }

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      setTouchDragState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        const deltaX = touch.clientX - currentState.startX;
        const deltaY = touch.clientY - currentState.startY;

        if (!currentState.isDragging) {
          if (Math.hypot(deltaX, deltaY) > 10) {
            clearTouchDragTimer();
            return null;
          }

          return {
            ...currentState,
            currentX: touch.clientX,
            currentY: touch.clientY,
          };
        }

        event.preventDefault();

        return {
          ...currentState,
          currentX: touch.clientX,
          currentY: touch.clientY,
          targetIndex: getTouchTargetIndex(touch.clientX, currentState.sceneId),
        };
      });
    };

    const handleTouchEnd = (event: TouchEvent) => {
      clearTouchDragTimer();

      setTouchDragState((currentState) => {
        if (!currentState) {
          return currentState;
        }

        if (currentState.isDragging) {
          const touch = event.changedTouches[0];
          const targetIndex = touch
            ? getTouchTargetIndex(touch.clientX, currentState.sceneId)
            : currentState.targetIndex;

          if (targetIndex !== currentState.fromIndex) {
            reorderScenes(currentState.fromIndex, targetIndex);
          }
        }

        return null;
      });
    };

    const handleTouchCancel = () => {
      resetTouchDrag();
    };

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchCancel);

    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
    };
  }, [reorderScenes, ranges, scenes.length, touchDragState]);

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

      <div className="mt-3">
        <input
          type="range"
          min={0}
          max={totalFrames - 1}
          value={currentFrame}
          onChange={(event) => {
            const nextFrame = Number.parseInt(event.target.value, 10);
            setCurrentFrame(nextFrame);

            const activeRange = ranges.find(
              (range) => nextFrame >= range.startFrame && nextFrame < range.endFrame,
            );
            if (activeRange) {
              setCurrentScene(activeRange.index);
            }
          }}
          className="w-full h-4 cursor-pointer accent-blue-500"
          style={{ minHeight: "44px" }}
        />
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
            const isTouchDragging = touchDragState?.sceneId === range.scene.id && touchDragState.isDragging;
            const shiftX =
              touchDragState && touchDragState.isDragging && touchDragState.sceneId !== range.scene.id
                ? touchDragState.fromIndex < touchDragState.targetIndex &&
                  range.index > touchDragState.fromIndex &&
                  range.index <= touchDragState.targetIndex
                  ? -touchDragState.dragWidth
                  : touchDragState.fromIndex > touchDragState.targetIndex &&
                      range.index >= touchDragState.targetIndex &&
                      range.index < touchDragState.fromIndex
                    ? touchDragState.dragWidth
                    : 0
                : 0;
            const translateX = isTouchDragging
              ? touchDragState.currentX - touchDragState.startX
              : shiftX;

            return (
              <button
                key={range.scene.id}
                type="button"
                ref={(element) => {
                  sceneBarRefs.current[range.scene.id] = element;
                }}
                className={`group relative h-full border-r border-gray-950 text-left transition-transform duration-150 ${
                  isTouchDragging
                    ? "scale-105 bg-blue-700 opacity-90 shadow-lg z-10"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                style={{
                  width: `${widthPercent}%`,
                  transform: translateX !== 0 ? `translateX(${translateX}px)` : undefined,
                }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setCurrentScene(range.index);
                  handleSeek(event.clientX);
                }}
                onTouchStart={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest('[data-resize-handle="true"]')) {
                    return;
                  }

                  const touch = event.touches[0];
                  const rect = event.currentTarget.getBoundingClientRect();

                  setCurrentScene(range.index);
                  clearTouchDragTimer();
                  setTouchDragState({
                    sceneId: range.scene.id,
                    fromIndex: range.index,
                    startX: touch.clientX,
                    startY: touch.clientY,
                    currentX: touch.clientX,
                    currentY: touch.clientY,
                    dragWidth: rect.width,
                    targetIndex: range.index,
                    isDragging: false,
                  });

                  touchDragTimerRef.current = window.setTimeout(() => {
                    setTouchDragState((currentState) => {
                      if (!currentState || currentState.sceneId !== range.scene.id) {
                        return currentState;
                      }

                      if (
                        Math.hypot(
                          currentState.currentX - currentState.startX,
                          currentState.currentY - currentState.startY,
                        ) > 10
                      ) {
                        return null;
                      }

                      navigator.vibrate?.(50);

                      return {
                        ...currentState,
                        isDragging: true,
                        targetIndex: getTouchTargetIndex(currentState.currentX, currentState.sceneId),
                      };
                    });
                    touchDragTimerRef.current = null;
                  }, 300);
                }}
              >
                <div
                  className={`flex h-full flex-col justify-between p-3 ${
                    isSelected ? "ring-2 ring-inset ring-blue-400/70" : ""
                  }`}
                >
                  <span className="truncate text-sm font-medium text-white">{range.scene.name}</span>
                  <span className="text-xs text-gray-300">{range.scene.duration.toFixed(1)}s</span>
                </div>
                <div
                  data-resize-handle="true"
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
                  data-resize-handle="true"
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
