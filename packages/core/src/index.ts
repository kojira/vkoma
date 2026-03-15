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
        ctx.font = options.font ?? '48px sans-serif, "Apple Color Emoji"';
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

export interface BeatSyncConfig {
  type: 'kick' | 'beat' | 'bass';
  effect: 'pulse' | 'hue-rotation' | 'particle-burst' | 'vignette' | 'flash' | 'color-pulse';
  intensity: number;
}

export function getBeatIntensity(
  currentTime: number,
  beatTimings: number[],
  decayMs: number = 200,
): number {
  const decaySec = decayMs / 1000;
  for (const beatTime of beatTimings) {
    const diff = currentTime - beatTime;
    if (diff >= 0 && diff < decaySec) {
      return Math.pow(1 - diff / decaySec, 2);
    }
  }
  return 0;
}

export function applyBeatEffect(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  beatIntensity: number,
  config: BeatSyncConfig,
): void {
  if (beatIntensity <= 0) return;
  const maxIntensity = config.intensity * beatIntensity;
  if (config.effect === 'flash') {
    ctx.save();
    ctx.globalAlpha = maxIntensity * 0.5;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (config.effect === 'color-pulse') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = maxIntensity * 0.6;
    ctx.fillStyle = '#ff4400';
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (config.effect === 'pulse') {
    // Beat Pulse - radial glow from center
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const cx = width / 2;
    const cy = height / 2;
    const maxRadius = Math.sqrt(cx * cx + cy * cy);
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
    gradient.addColorStop(0, `rgba(255, 255, 255, ${maxIntensity * 0.3})`);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${maxIntensity * 0.1})`);
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (config.effect === 'hue-rotation') {
    // Hue Rotation - color overlay that shifts with beat
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.globalAlpha = maxIntensity * 0.4;
    const hue = (beatIntensity * 360) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  } else if (config.effect === 'particle-burst') {
    // Particle Burst - radial streaks from center
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = maxIntensity * 0.8;
    const pcx = width / 2;
    const pcy = height / 2;
    const lineCount = 100;
    const maxLen = 200 * beatIntensity;
    for (let i = 0; i < lineCount; i++) {
      const angle = (i / lineCount) * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const hueVal = (i / lineCount) * 360;
      ctx.strokeStyle = `hsl(${hueVal}, 100%, 60%)`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pcx + cos * 20, pcy + sin * 20);
      ctx.lineTo(pcx + cos * (20 + maxLen), pcy + sin * (20 + maxLen));
      ctx.stroke();
    }
    ctx.restore();
  } else if (config.effect === 'vignette') {
    // Vignette Pulse - pulsating dark edges
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const vcx = width / 2;
    const vcy = height / 2;
    const innerRadius = (width / 2) * (1 - maxIntensity * 0.3);
    const outerRadius = Math.sqrt(width * width + height * height) / 2;
    const vGradient = ctx.createRadialGradient(vcx, vcy, innerRadius, vcx, vcy, outerRadius);
    vGradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    vGradient.addColorStop(1, `rgba(0, 0, 0, ${0.8 * maxIntensity})`);
    ctx.fillStyle = vGradient;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
