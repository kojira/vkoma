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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const liveFFTRef = useRef<{ freq: number; energy: number }[]>([]);
  const timelineAudioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
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
  const bgmFile = useTimelineStore((state) => state.bgmFile);
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
    const analyser = analyserRef.current;
    if (analyser && isPlaying) {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(dataArray);
      // Convert raw FFT bins into 8 bands with {freq, energy} format
      const binCount = dataArray.length;
      const bandCount = 8;
      const freqLabels = [60, 150, 400, 1000, 2500, 6000, 10000, 16000];
      const bands: { freq: number; energy: number }[] = [];
      const binsPerBand = Math.floor(binCount / bandCount);
      for (let i = 0; i < bandCount; i++) {
        let sum = 0;
        const start = i * binsPerBand;
        const end = i === bandCount - 1 ? binCount : start + binsPerBand;
        for (let j = start; j < end; j++) {
          sum += dataArray[j] / 255;
        }
        bands.push({ freq: freqLabels[i], energy: sum / (end - start) });
      }
      liveFFTRef.current = bands;
    } else if (!isPlaying) {
      liveFFTRef.current = [];
    }

    const liveFFT = liveFFTRef.current;
    const hasLiveFFT = liveFFT.length > 0 && isPlaying;
    const fftBands = hasLiveFFT ? liveFFT : (fftFrame?.bands ?? []);
    const beatIntensity = hasLiveFFT ? 0 : (fftFrame?.beatIntensity ?? 0);

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

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.pause();

    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    }

    if (!bgmFile) {
      audio.removeAttribute("src");
      audio.load();
      return;
    }

    const objectUrl = URL.createObjectURL(bgmFile);
    audioUrlRef.current = objectUrl;
    audio.src = objectUrl;
    audio.load();
  }, [bgmFile]);

  useEffect(() => {
    return () => {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }

      if (audioUrlRef.current) {
        URL.revokeObjectURL(audioUrlRef.current);
        audioUrlRef.current = null;
      }

      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
        analyserRef.current = null;
        sourceRef.current = null;
      }
    };
  }, []);

  // Timeline audio track playback
  useEffect(() => {
    const audioTracks = tracks.filter((track) => track.type === "audio");
    const currentAudios = timelineAudioRefs.current;
    const activeIds = new Set<string>();

    for (const track of audioTracks) {
      if (track.muted) continue;
      for (const item of track.items) {
        if (!item.assetId || !projectId) continue;
        activeIds.add(item.id);

        if (!currentAudios.has(item.id)) {
          const audio = new Audio(`/api/projects/${projectId}/assets/${item.assetId}/file`);
          audio.crossOrigin = "anonymous";
          audio.preload = "auto";
          const volume = typeof item.params?.volume === "number" ? item.params.volume : 1.0;
          audio.volume = Math.max(0, Math.min(1, volume));
          currentAudios.set(item.id, audio);
        }
      }
    }

    for (const [id, audio] of currentAudios) {
      if (!activeIds.has(id)) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
        currentAudios.delete(id);
      }
    }
  }, [projectId, tracks]);

  // Sync timeline audio playback with play state and connect to AnalyserNode for FFT
  useEffect(() => {
    const audioTracks = tracks.filter((t) => t.type === "audio" && !t.muted);
    const currentAudios = timelineAudioRefs.current;
    const globalTime = currentTime;

    for (const track of audioTracks) {
      for (const item of track.items) {
        const audio = currentAudios.get(item.id);
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
            // Initialize AudioContext and connect timeline audio for FFT analysis
            if (!audioContextRef.current) {
              const ctx = new AudioContext();
              audioContextRef.current = ctx;
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 128;
              analyserRef.current = analyser;
              analyser.connect(ctx.destination);
            }
            if (!sourceRef.current) {
              try {
                const source = audioContextRef.current.createMediaElementSource(audio);
                source.connect(analyserRef.current!);
                sourceRef.current = source;
              } catch {
                // Already connected — ignore
              }
            }
            if (audioContextRef.current.state === "suspended") {
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

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !bgmFile) {
      return;
    }

    const targetTime = currentTime;
    if (Math.abs(audio.currentTime - targetTime) >= 0.5) {
      audio.currentTime = targetTime;
    }

    if (isPlaying) {
      // Initialize AudioContext on user-initiated play (autoplay policy)
      if (!audioContextRef.current) {
        const ctx = new AudioContext();
        audioContextRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 128;
        analyserRef.current = analyser;
        const source = ctx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceRef.current = source;
      }
      if (audioContextRef.current.state === "suspended") {
        void audioContextRef.current.resume();
      }
      void audio.play().catch(() => {});
      return;
    }

    audio.pause();
  }, [bgmFile, currentTime, isPlaying]);

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
