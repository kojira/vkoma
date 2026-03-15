export type {
  ParamType,
  SceneParam,
  SceneConfig,
  Scene,
} from "./base";

export {
  defineScene,
  params,
  fade,
  bounce,
  slide,
  zoom,
} from "./base";

export interface DrawRectOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  radius?: number;
  opacity?: number;
}

export interface DrawCircleOptions {
  fill?: string;
  stroke?: string;
  lineWidth?: number;
  opacity?: number;
}

export interface DrawTextOptions {
  color?: string;
  font?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  maxWidth?: number;
  opacity?: number;
}

export interface DrawImageOptions {
  opacity?: number;
}

export interface DrawAPI {
  clear: (color?: string) => void;
  rect: (
    x: number,
    y: number,
    width: number,
    height: number,
    options?: DrawRectOptions,
  ) => void;
  circle: (
    x: number,
    y: number,
    radius: number,
    options?: DrawCircleOptions,
  ) => void;
  text: (
    value: string,
    x: number,
    y: number,
    options?: DrawTextOptions,
  ) => void;
  image: (
    source: CanvasImageSource,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: DrawImageOptions,
  ) => void;
}

function withOpacity(
  ctx: CanvasRenderingContext2D,
  opacity: number | undefined,
  draw: () => void,
) {
  ctx.save();
  if (opacity !== undefined) {
    ctx.globalAlpha = opacity;
  }
  draw();
  ctx.restore();
}

export function createDrawAPI(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): DrawAPI {
  return {
    clear: (color = "transparent") => {
      ctx.save();
      ctx.clearRect(0, 0, width, height);
      if (color !== "transparent") {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    },
    rect: (x, y, rectWidth, rectHeight, options = {}) => {
      withOpacity(ctx, options.opacity, () => {
        ctx.beginPath();
        if (options.radius && options.radius > 0) {
          ctx.roundRect(x, y, rectWidth, rectHeight, options.radius);
        } else {
          ctx.rect(x, y, rectWidth, rectHeight);
        }

        if (options.fill) {
          ctx.fillStyle = options.fill;
          ctx.fill();
        }

        if (options.stroke) {
          ctx.strokeStyle = options.stroke;
          ctx.lineWidth = options.lineWidth ?? 1;
          ctx.stroke();
        }
      });
    },
    circle: (x, y, radius, options = {}) => {
      withOpacity(ctx, options.opacity, () => {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);

        if (options.fill) {
          ctx.fillStyle = options.fill;
          ctx.fill();
        }

        if (options.stroke) {
          ctx.strokeStyle = options.stroke;
          ctx.lineWidth = options.lineWidth ?? 1;
          ctx.stroke();
        }
      });
    },
    text: (value, x, y, options = {}) => {
      withOpacity(ctx, options.opacity, () => {
        ctx.fillStyle = options.color ?? "#ffffff";
        ctx.font = options.font ?? "48px sans-serif";
        ctx.textAlign = options.align ?? "left";
        ctx.textBaseline = options.baseline ?? "alphabetic";
        ctx.fillText(value, x, y, options.maxWidth);
      });
    },
    image: (source, x, y, imageWidth, imageHeight, options = {}) => {
      withOpacity(ctx, options.opacity, () => {
        ctx.drawImage(source, x, y, imageWidth, imageHeight);
      });
    },
  };
}

import type { SceneConfig } from "./base";

type SceneRenderTarget =
  | SceneConfig
  | {
      sceneConfig: SceneConfig;
      params?: Record<string, any>;
    };

export function renderScene(
  scene: SceneRenderTarget,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
): void {
  const sceneConfig = "sceneConfig" in scene ? scene.sceneConfig : scene;
  const instanceParams = "sceneConfig" in scene ? scene.params ?? {} : {};
  const resolvedParams = Object.fromEntries(
    Object.entries(sceneConfig.defaultParams).map(([key, param]) => [
      key,
      instanceParams[key] ?? param.default,
    ]),
  );

  ctx.clearRect(0, 0, width, height);
  sceneConfig.setup?.(ctx, resolvedParams);
  sceneConfig.draw(ctx, resolvedParams, time);
}

export { allScenePresets, getSceneFrameRanges, getSceneAtFrame } from "./scenes";
export type { SceneItem } from "./scenes";
