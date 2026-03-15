import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import {
  type SceneParam,
  defineScene,
  params as sceneParams,
  renderScene,
  allScenePresets,
  getSceneAtFrame,
  getBeatIntensity,
  applyBeatEffect,
  type SceneItem,
  type BeatSyncConfig,
} from "../../core/src/index";

GlobalFonts.registerFromPath("/System/Library/Fonts/Apple Color Emoji.ttc", "Apple Color Emoji");
GlobalFonts.registerFromPath("/System/Library/Fonts/AppleSDGothicNeo.ttc", "AppleSDGothicNeo");
GlobalFonts.registerFromPath("/System/Library/Fonts/Helvetica.ttc", "Helvetica");

interface SavedSceneItem {
  id: string;
  name: string;
  duration: number;
  params: Record<string, unknown>;
  sceneConfigId: string;
  renderCode?: string;
  sceneConfig?: { id?: string };
}

function deserializeServerScenes(rawScenes: unknown): SceneItem[] {
  if (!Array.isArray(rawScenes)) return [];

  return rawScenes
    .map<SceneItem | null>((scene, index) => {
      if (!scene || typeof scene !== "object") return null;

      const saved = scene as Partial<SavedSceneItem>;
      const sceneConfigId = saved.sceneConfigId ?? saved.sceneConfig?.id;
      let preset = allScenePresets.find((entry) => entry.id === sceneConfigId);

      if (!preset && saved.renderCode && typeof saved.renderCode === "string") {
        try {
          const drawFn = new Function("ctx", "params", "time", saved.renderCode) as (
            ctx: any,
            params: Record<string, unknown>,
            time: number,
          ) => void;

          const paramEntries =
            saved.params && typeof saved.params === "object" ? Object.entries(saved.params) : [];
          const defaultParams: Record<string, SceneParam> = {};
          for (const [key, value] of paramEntries) {
            if (typeof value === "number") {
              defaultParams[key] = sceneParams.number(key, value);
            } else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
              defaultParams[key] = sceneParams.color(key, value);
            } else if (typeof value === "string") {
              defaultParams[key] = sceneParams.string(key, value);
            }
          }

          preset = defineScene({
            id: sceneConfigId || `dynamic-${Date.now()}-${index}`,
            name: typeof saved.name === "string" ? saved.name : "Dynamic Scene",
            duration: typeof saved.duration === "number" ? saved.duration : 3,
            defaultParams,
            draw: drawFn,
          });
        } catch {
          return null;
        }
      }

      if (!preset) return null;

      return {
        id:
          typeof saved.id === "string" && saved.id.length > 0
            ? saved.id
            : `scene-${Date.now()}-${index}`,
        name: typeof saved.name === "string" ? saved.name : preset.name,
        duration: typeof saved.duration === "number" ? Math.max(0.5, saved.duration) : preset.duration,
        sceneConfig: preset,
        params: {
          ...Object.fromEntries(
            Object.entries(preset.defaultParams).map(([key, param]) => [key, param.default]),
          ),
          ...(saved.params && typeof saved.params === "object" ? saved.params : {}),
        },
      };
    })
    .filter((scene): scene is SceneItem => scene !== null);
}

// Read JSON input from stdin
let inputData = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => { inputData += chunk; });
process.stdin.on("end", async () => {
  const { rawScenes, fps, startFrame, endFrame, width, height, beatTimings, precomputedFftData } = JSON.parse(inputData) as {
    rawScenes: unknown[];
    fps: number;
    startFrame: number;
    endFrame: number;
    width: number;
    height: number;
    beatTimings?: number[];
    precomputedFftData?: Array<{ bands: number[]; beat: boolean; beatIntensity: number; rms: number }>;
  };

  const scenes = deserializeServerScenes(rawScenes);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Write raw JPEG buffers directly to stdout, each prefixed with 4-byte length
  for (let frame = startFrame; frame < endFrame; frame++) {
    const hit = getSceneAtFrame(scenes, fps, frame);
    if (!hit) continue;

    const localFrame = frame - hit.startFrame;
    const localTime = localFrame / fps;

    // Inject FFT data for equalizer scenes
    if (precomputedFftData && hit.scene.sceneConfig.id === "equalizer-scene") {
      const frameIndex = frame - startFrame;
      const fftData = precomputedFftData[frameIndex];
      if (fftData) {
        hit.scene.params = {
          ...hit.scene.params,
          fftBands: JSON.stringify(fftData.bands),
          beatIntensity: fftData.beatIntensity,
        };
      }
    }

    ctx.clearRect(0, 0, width, height);
    renderScene(hit.scene, ctx as any, width, height, localTime);

    if (beatTimings && beatTimings.length > 0) {
      const globalTime = frame / fps;
      const beatIntensity = getBeatIntensity(globalTime, beatTimings, 200);
      if (beatIntensity > 0.05) {
        // Particle Burst (動きで表現、光の明滅なし)
        applyBeatEffect(ctx as any, width, height, beatIntensity, { type: 'kick', effect: 'particle-burst', intensity: 1.0 });
      }
    }

    const jpegBuf = canvas.toBuffer("image/jpeg", 80);
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jpegBuf.length, 0);
    process.stdout.write(lenBuf);
    process.stdout.write(jpegBuf);
  }
});
