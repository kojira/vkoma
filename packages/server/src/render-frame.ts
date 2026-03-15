import { renderScene, type SceneItem } from "../../core/src/index";

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
