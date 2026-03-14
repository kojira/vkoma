export type ParamType = "string" | "number" | "color" | "select" | "duration";

export interface SceneParam {
  type: ParamType;
  label: string;
  default: any;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface SceneConfig {
  id: string;
  name: string;
  duration: number;
  defaultParams: Record<string, SceneParam>;
  setup?: (
    ctx: CanvasRenderingContext2D,
    params: Record<string, any>,
  ) => void;
  draw: (
    ctx: CanvasRenderingContext2D,
    params: Record<string, any>,
    time: number,
  ) => void;
}

export interface Scene extends SceneConfig {
  __type: "vkoma-scene";
}

export function defineScene(config: SceneConfig): Scene {
  return { ...config, __type: "vkoma-scene" };
}

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

type NumberParamOptions = Pick<SceneParam, "min" | "max" | "step">;

export const params: {
  string: (label: string, def: any) => SceneParam;
  number: (label: string, def: any, opts?: NumberParamOptions) => SceneParam;
  color: (label: string, def: any) => SceneParam;
  select: (label: string, def: any, options: string[]) => SceneParam;
  duration: (label: string, def: any) => SceneParam;
} = {
  string: (label, def) => ({ type: "string", label, default: def }),
  number: (label, def, opts) => ({
    type: "number",
    label,
    default: def,
    ...opts,
  }),
  color: (label, def) => ({ type: "color", label, default: def }),
  select: (label, def, options) => ({
    type: "select",
    label,
    default: def,
    options,
  }),
  duration: (label, def) => ({ type: "duration", label, default: def }),
};

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

export function fade(t: number, duration: number): number {
  if (duration <= 0) {
    return 1;
  }

  return Math.max(0, Math.min(1, t / duration));
}

export function bounce(t: number, duration: number): number {
  if (duration <= 0) {
    return 1;
  }

  const x = Math.max(0, Math.min(1, t / duration));
  const n1 = 7.5625;
  const d1 = 2.75;

  if (x < 1 / d1) {
    return n1 * x * x;
  }
  if (x < 2 / d1) {
    const adjusted = x - 1.5 / d1;
    return n1 * adjusted * adjusted + 0.75;
  }
  if (x < 2.5 / d1) {
    const adjusted = x - 2.25 / d1;
    return n1 * adjusted * adjusted + 0.9375;
  }

  const adjusted = x - 2.625 / d1;
  return n1 * adjusted * adjusted + 0.984375;
}

export function slide(
  t: number,
  duration: number,
  from: number,
  to: number,
): number {
  return from + (to - from) * fade(t, duration);
}

export function zoom(
  t: number,
  duration: number,
  fromScale: number,
  toScale: number,
): number {
  return fromScale + (toScale - fromScale) * fade(t, duration);
}

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
