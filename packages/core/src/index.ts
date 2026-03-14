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
