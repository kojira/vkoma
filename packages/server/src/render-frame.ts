import { createCanvas } from "@napi-rs/canvas";
import {
  allScenePresets,
  defineScene,
  params as sceneParams,
  renderScene,
  type SceneItem,
  type SceneParam,
} from "../../core/src/index";
import type { Track } from "../../core/src/timeline";
import { applyTransitionIn, applyTransitionOut } from "../../core/src/utils/transition";

export interface CanvasContext2D {
  globalAlpha: number;
  globalCompositeOperation: string;
  clearRect(x: number, y: number, w: number, h: number): void;
  drawImage(image: any, x: number, y: number, w: number, h: number): void;
}

export interface BgImageRenderOptions {
  scene: SceneItem;
  ctx: CanvasContext2D;
  width: number;
  height: number;
  localTime: number;
  imageCache: Map<string, any>;
}

/**
 * Renders the scene first, then draws the background image behind it
 * using destination-over composite operation.
 */
export function renderFrameWithBg(opts: BgImageRenderOptions): void {
  const { scene, ctx, width, height, localTime, imageCache } = opts;

  ctx.clearRect(0, 0, width, height);

  // 1. Render scene content first (foreground)
  renderScene(scene, ctx as any, width, height, localTime);

  // 2. Draw background image behind the scene using destination-over
  const bgPath = scene.params?.bgImagePath;
  const hasBgImage = typeof bgPath === "string" && bgPath && imageCache.has(bgPath);

  if (hasBgImage) {
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = "destination-over";
    const bgAlpha =
      typeof scene.params?.bgAlpha === "number" ? scene.params.bgAlpha : 0.82;
    ctx.globalAlpha = bgAlpha;
    ctx.drawImage(imageCache.get(bgPath!) as any, 0, 0, width, height);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = prevOp;
  }
}

/**
 * Renders a single frame using multi-track timeline data (v2 format).
 * Tracks are sorted by zOrder (ascending = back to front) and composited
 * with source-over onto the main canvas.
 */
export async function renderFrameWithTracks(
  tracks: Track[],
  currentTime: number,
  width: number,
  height: number,
  fftBands: number[],
  projectDir: string,
): Promise<Buffer> {
  void projectDir;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d") as any;
  ctx.clearRect(0, 0, width, height);

  const videoTracks = tracks
    .filter((t) => t.type !== "audio" && t.visible && !t.muted)
    .sort((a, b) => a.zOrder - b.zOrder);

  for (const track of videoTracks) {
    const activeItems = track.items.filter(
      (item) => currentTime >= item.startTime && currentTime < item.startTime + item.duration,
    );

    for (const item of activeItems) {
      const itemTime = currentTime - item.startTime;
      const remaining = item.duration - itemTime;

      let preset = allScenePresets.find((p) => p.id === item.sceneConfigId);
      if (!preset && item.renderCode && typeof item.renderCode === "string") {
        try {
          const drawFn = new Function("ctx", "params", "time", item.renderCode) as (
            ctx: any,
            params: Record<string, unknown>,
            time: number,
          ) => void;
          const paramEntries = item.params ? Object.entries(item.params) : [];
          const defaultParams: Record<string, SceneParam> = {};
          for (const [key, value] of paramEntries) {
            if (typeof value === "number") defaultParams[key] = sceneParams.number(key, value);
            else if (typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value)) {
              defaultParams[key] = sceneParams.color(key, value);
            } else if (typeof value === "string") {
              defaultParams[key] = sceneParams.string(key, value);
            }
          }
          preset = defineScene({
            id: item.sceneConfigId || `dynamic-${item.id}`,
            name: item.id,
            duration: item.duration,
            defaultParams,
            draw: drawFn,
          });
        } catch {
          continue;
        }
      }
      if (!preset) continue;

      const sceneItem: SceneItem = {
        id: item.id,
        name: item.id,
        duration: item.duration,
        sceneConfig: preset,
        params: {
          ...Object.fromEntries(
            Object.entries(preset.defaultParams).map(([k, p]) => [k, p.default]),
          ),
          ...item.params,
          fftBands: JSON.stringify(fftBands),
        },
      };

      const offscreen = createCanvas(width, height);
      const offCtx = offscreen.getContext("2d") as any;
      offCtx.clearRect(0, 0, width, height);
      renderScene(sceneItem, offCtx, width, height, itemTime);

      const inDuration = item.transitionIn?.duration ?? 0;
      const outDuration = item.transitionOut?.duration ?? 0;

      if (item.transitionIn && itemTime < inDuration) {
        const progress = itemTime / inDuration;
        applyTransitionIn(
          ctx,
          progress,
          item.transitionIn.type,
          item.transitionIn,
          width,
          height,
          () => {
            ctx.drawImage(offscreen as any, 0, 0, width, height);
          },
        );
      } else if (item.transitionOut && remaining < outDuration) {
        const progress = remaining / outDuration;
        applyTransitionOut(
          ctx,
          progress,
          item.transitionOut.type,
          item.transitionOut,
          width,
          height,
          () => {
            ctx.drawImage(offscreen as any, 0, 0, width, height);
          },
        );
      } else {
        ctx.drawImage(offscreen as any, 0, 0, width, height);
      }
    }
  }

  return canvas.toBuffer("image/jpeg", 80);
}
