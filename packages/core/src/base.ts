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
