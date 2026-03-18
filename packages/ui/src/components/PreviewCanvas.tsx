import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import { allScenePresets, renderScene } from "@vkoma/core";
import { resolveSceneConfig } from "../stores/sceneStore";
import { useTimelineStore } from "../stores/timelineStore";

declare global {
  interface Window {
    __vkoma_seekToFrame?: (frameIndex: number, fps: number) => void;
  }
}

const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;
const imageCache = new Map<string, HTMLImageElement>();

function drawCanvasMessage(
  ctx: CanvasRenderingContext2D,
  message: string,
  color: string,
  font = "24px monospace",
) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
  ctx.restore();
}

type PreviewCanvasBoundaryProps = {
  children: ReactNode;
};

type PreviewCanvasBoundaryState = {
  hasError: boolean;
};

class PreviewCanvasErrorBoundary extends Component<
  PreviewCanvasBoundaryProps,
  PreviewCanvasBoundaryState
> {
  state: PreviewCanvasBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PreviewCanvasBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("PreviewCanvas failed to render", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full rounded-xl border border-red-900/60 bg-gray-950 p-4 shadow-2xl">
          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-red-900/60 bg-black px-6 text-center text-sm text-red-200">
            Preview rendering failed.
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const toImageUrl = (path: string): string => {
  if (path.startsWith("/") && !path.startsWith("/api/")) {
    const filename = path.split("/").pop() ?? "";
    return `/api/mv-assets/${encodeURIComponent(filename)}`;
  }
  return path;
};

function PreviewCanvasInner() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [, setImageVersion] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timelineAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  // Per-track AnalyserNode map: trackId → { analyser, source }
  const trackAnalysersRef = useRef<Map<string, { analyser: AnalyserNode; source: MediaElementAudioSourceNode }>>(new Map());
  const trackFFTRef = useRef<Map<string, { freq: number; energy: number }[]>>(new Map());
  const renderFunctionCacheRef = useRef<
    Map<
      string,
      ((ctx: CanvasRenderingContext2D, params: Record<string, unknown>, time: number) => void) | null
    >
  >(new Map());

  const isPlaying = useTimelineStore((state) => state.isPlaying);
  const currentTime = useTimelineStore((state) => state.currentTime);
  const fps = useTimelineStore((state) => state.fps);
  const tracks = useTimelineStore((state) => state.tracks);
  const projectId = useTimelineStore((state) => state.projectId);
  const fftCache = useTimelineStore((state) => state.fftCache);
  const setPlaying = useTimelineStore((state) => state.setPlaying);
  const setCurrentTime = useTimelineStore((state) => state.setCurrentTime);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const frameIndex = Math.max(0, Math.floor(currentTime * fps));
    const fftFrame = fftCache?.frames[frameIndex];

    // Compute per-track live FFT from each track's AnalyserNode
    const freqLabels = [60, 150, 400, 1000, 2500, 6000, 10000, 16000];
    const bandCount = 8;
    if (isPlaying) {
      for (const [trackId, entry] of trackAnalysersRef.current) {
        const dataArray = new Uint8Array(entry.analyser.frequencyBinCount);
        entry.analyser.getByteFrequencyData(dataArray);
        const binCount = dataArray.length;
        const binsPerBand = Math.floor(binCount / bandCount);
        const bands: { freq: number; energy: number }[] = [];
        for (let i = 0; i < bandCount; i++) {
          let sum = 0;
          const start = i * binsPerBand;
          const end = i === bandCount - 1 ? binCount : start + binsPerBand;
          for (let j = start; j < end; j++) {
            sum += dataArray[j] / 255;
          }
          bands.push({ freq: freqLabels[i], energy: sum / (end - start) });
        }
        trackFFTRef.current.set(trackId, bands);
      }
    } else {
      trackFFTRef.current.clear();
    }

    // Find first audio track ID for fallback
    const firstAudioTrackId = tracks.find((t) => t.type === "audio" && !t.muted)?.id ?? null;

    const activeVideoItems = tracks
      .filter((track) => track.type === "video" && track.visible && !track.muted)
      .sort((a, b) => a.zOrder - b.zOrder)
      .flatMap((track) =>
        track.items
          .filter(
            (item) =>
              currentTime >= item.startTime && currentTime < item.startTime + item.duration,
          )
          .map((item) => ({ item, zOrder: track.zOrder })),
      )
      .sort((a, b) => a.zOrder - b.zOrder);

    if (activeVideoItems.length === 0) {
      drawCanvasMessage(ctx, "No scenes", "#808080");
      return;
    }

    for (const { item } of activeVideoItems) {
      const localTime = currentTime - item.startTime;

      // Resolve FFT data: prefer per-track live FFT, then cached
      const fftSourceTrackId = typeof item.params?.fftSourceTrackId === "string"
        ? item.params.fftSourceTrackId
        : firstAudioTrackId;
      const trackLiveFFT = fftSourceTrackId ? trackFFTRef.current.get(fftSourceTrackId) : null;
      const hasTrackFFT = trackLiveFFT && trackLiveFFT.length > 0 && isPlaying;
      const fftBands = hasTrackFFT ? trackLiveFFT : (fftFrame?.bands ?? []);
      const beatIntensity = hasTrackFFT ? 0 : (fftFrame?.beatIntensity ?? 0);

      const params: Record<string, unknown> = {
        ...item.params,
        fftBands: JSON.stringify(fftBands),
        beatIntensity,
      };

      if (item.renderCode && typeof item.renderCode === "string") {
        let drawFn = renderFunctionCacheRef.current.get(item.renderCode);
        if (drawFn === undefined) {
          try {
            drawFn = new Function(
              "ctx",
              "params",
              "time",
              item.renderCode,
            ) as (ctx: CanvasRenderingContext2D, params: Record<string, unknown>, time: number) => void;
          } catch {
            drawFn = null;
          }
          renderFunctionCacheRef.current.set(item.renderCode, drawFn);
        }

        if (drawFn) {
          try {
            drawFn(ctx, params, localTime);
          } catch (error) {
            console.error("Preview renderCode execution failed", error);
            const message = error instanceof Error ? error.message : "Unknown render error";
            drawCanvasMessage(ctx, `Error: ${message}`, "#ff0000");
          }
        }
        continue;
      }

      if (!item.sceneConfigId) {
        continue;
      }

      const preset =
        allScenePresets.find((entry) => entry.id === item.sceneConfigId) ??
        resolveSceneConfig(
          {
            sceneConfigId: item.sceneConfigId,
            renderCode: item.renderCode,
            params: item.params,
            duration: item.duration,
            name: item.id,
          },
          item.id,
        );
      if (!preset) {
        continue;
      }

      const scene = {
        id: item.id,
        name: item.id,
        duration: item.duration,
        sceneConfig: preset,
        params: {
          ...Object.fromEntries(
            Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default]),
          ),
          ...params,
        },
      };

      const offscreen = document.createElement("canvas");
      offscreen.width = CANVAS_WIDTH;
      offscreen.height = CANVAS_HEIGHT;
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) {
        continue;
      }

      offscreenCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      try {
        renderScene(scene, offscreenCtx, CANVAS_WIDTH, CANVAS_HEIGHT, localTime);
      } catch (error) {
        console.error("Preview preset rendering failed", error);
        const message = error instanceof Error ? error.message : "Unknown render error";
        drawCanvasMessage(ctx, `Error: ${message}`, "#ff0000");
        continue;
      }

      const bgImagePath = typeof scene.params?.bgImagePath === "string" ? scene.params.bgImagePath : "";
      if (bgImagePath) {
        const imageUrl = toImageUrl(bgImagePath);
        let image = imageCache.get(imageUrl);
        if (!image) {
          image = new Image();
          image.src = imageUrl;
          imageCache.set(imageUrl, image);
          image.onload = () => {
            setImageVersion((version) => version + 1);
          };
        }

        if (image.complete && image.naturalWidth > 0) {
          try {
            offscreenCtx.globalCompositeOperation = "destination-over";
            offscreenCtx.drawImage(image, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
            offscreenCtx.globalCompositeOperation = "source-over";
          } catch {
            // Ignore drawImage errors for broken images.
          }
        }
      }

      ctx.drawImage(offscreen, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    }
  }, [currentTime, fftCache, fps, isPlaying, tracks]);

  // Cleanup AudioContext and analysers on unmount
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
      trackAnalysersRef.current.clear();
      trackFFTRef.current.clear();
    };
  }, []);

  // Timeline audio: create/remove Audio elements and connect per-track AnalyserNodes.
  // Audio elements persist across mute/unmute to keep MediaElementSource connections alive.
  useEffect(() => {
    const audioTracks = tracks.filter((track) => track.type === "audio");
    const currentAudios = timelineAudioRefs.current;
    const activeIds = new Set<string>();

    // Initialize shared AudioContext lazily
    if (!audioContextRef.current && audioTracks.some((t) => t.items.length > 0)) {
      audioContextRef.current = new AudioContext();
    }

    for (const track of audioTracks) {
      for (const item of track.items) {
        if (!item.assetId || !projectId) continue;
        const key = `${track.id}::${item.id}`;
        activeIds.add(key);

        if (!currentAudios.has(key)) {
          const audio = new Audio(`/api/projects/${projectId}/assets/${item.assetId}/file`);
          audio.crossOrigin = "anonymous";
          audio.preload = "auto";
          currentAudios.set(key, audio);

          // Connect per-track AnalyserNode (one-time, survives mute/unmute)
          if (audioContextRef.current && !trackAnalysersRef.current.has(track.id)) {
            try {
              const analyser = audioContextRef.current.createAnalyser();
              analyser.fftSize = 128;
              const source = audioContextRef.current.createMediaElementSource(audio);
              source.connect(analyser);
              analyser.connect(audioContextRef.current.destination);
              trackAnalysersRef.current.set(track.id, { analyser, source });
            } catch {
              // Already connected — ignore
            }
          }
        }

        // Apply volume: muted → 0, otherwise use item volume
        const audio = currentAudios.get(key)!;
        const vol = track.muted ? 0 : (typeof item.params?.volume === "number" ? item.params.volume : 1.0);
        audio.volume = Math.max(0, Math.min(1, vol));
      }
    }

    // Remove Audio elements for items that no longer exist
    for (const [key, audio] of currentAudios) {
      if (!activeIds.has(key)) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        currentAudios.delete(key);
        // Clean up analyser for removed tracks
        const trackId = key.split("::")[0];
        const stillHasTrack = [...activeIds].some((k) => k.startsWith(trackId + "::"));
        if (!stillHasTrack) {
          trackAnalysersRef.current.delete(trackId);
        }
      }
    }
  }, [projectId, tracks]);

  // Sync timeline audio playback with play state
  useEffect(() => {
    const audioTracks = tracks.filter((t) => t.type === "audio");
    const currentAudios = timelineAudioRefs.current;
    const globalTime = currentTime;

    for (const track of audioTracks) {
      for (const item of track.items) {
        const key = `${track.id}::${item.id}`;
        const audio = currentAudios.get(key);
        if (!audio) continue;

        const itemStart = item.startTime ?? 0;
        const itemDuration = item.duration ?? Infinity;
        const itemEnd = itemStart + itemDuration;
        const localTime = globalTime - itemStart;

        if (globalTime >= itemStart && globalTime < itemEnd) {
          if (Math.abs(audio.currentTime - localTime) >= 0.5) {
            audio.currentTime = Math.max(0, localTime);
          }
          if (isPlaying) {
            if (audioContextRef.current?.state === "suspended") {
              void audioContextRef.current.resume();
            }
            void audio.play().catch(() => {});
          } else {
            audio.pause();
          }
        } else {
          audio.pause();
        }
      }
    }
  }, [currentTime, isPlaying, tracks]);

  // Cleanup timeline audio on unmount
  useEffect(() => {
    return () => {
      for (const [, audio] of timelineAudioRefs.current) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      timelineAudioRefs.current.clear();
    };
  }, []);

  useEffect(() => {
    window.__vkoma_seekToFrame = (frameIndex: number, _fps: number) => {
      setPlaying(false);
      setCurrentTime(frameIndex / fps);
    };
    return () => {
      delete window.__vkoma_seekToFrame;
    };
  }, [fps, setCurrentTime, setPlaying]);


  return (
    <div className="w-full rounded-xl border border-gray-800 bg-gray-950 p-4 shadow-2xl">
      <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-gray-800 bg-black">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="absolute inset-0 h-full w-full"
        />
      </div>
    </div>
  );
}

export function PreviewCanvas() {
  return (
    <PreviewCanvasErrorBoundary>
      <PreviewCanvasInner />
    </PreviewCanvasErrorBoundary>
  );
}
