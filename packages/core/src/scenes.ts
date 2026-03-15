import {
  type SceneConfig,
  type Scene,
  defineScene,
  fade,
  bounce,
  slide,
  zoom,
  params as sceneParams,
} from "./base";

// ---- emoji-aware text rendering ----
interface TextPart {
  text: string;
  isEmoji: boolean;
}

function splitTextAndEmoji(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let lastIndex = 0;
  const regex = /\p{Emoji_Presentation}|\p{Extended_Pictographic}/gu;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), isEmoji: false });
    }
    parts.push({ text: match[0], isEmoji: true });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), isEmoji: false });
  }
  return parts;
}

function drawTextWithEmoji(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontWeight: string | number,
  fontSize: number,
): void {
  const parts = splitTextAndEmoji(text);
  let totalWidth = 0;
  for (const part of parts) {
    ctx.font = part.isEmoji
      ? `${fontSize}px "Apple Color Emoji"`
      : `${fontWeight} ${fontSize}px Helvetica, AppleSDGothicNeo, "Apple Color Emoji"`;
    totalWidth += ctx.measureText(part.text).width;
  }
  const align = ctx.textAlign;
  let currentX =
    align === "center"
      ? x - totalWidth / 2
      : align === "right"
        ? x - totalWidth
        : x;
  const savedAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (const part of parts) {
    ctx.font = part.isEmoji
      ? `${fontSize}px "Apple Color Emoji"`
      : `${fontWeight} ${fontSize}px Helvetica, AppleSDGothicNeo, "Apple Color Emoji"`;
    ctx.fillText(part.text, currentX, y);
    currentX += ctx.measureText(part.text).width;
  }
  ctx.textAlign = savedAlign;
}
// ---- end emoji-aware text rendering ----

const TitleScene = defineScene({
  id: "title-scene",
  name: "Title Scene",
  duration: 4,
  defaultParams: {
    text: sceneParams.string("Title Text", "vKoma"),
    fontSize: sceneParams.number("Font Size", 72, {
      min: 24,
      max: 120,
      step: 1,
    }),
    color: sceneParams.color("Text Color", "#ffffff"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const params = rawParams as {
      text: string;
      fontSize: number;
      color: string;
      bgColor: string;
    };

    ctx.save();
    ctx.fillStyle = params.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    ctx.globalAlpha = fade(time, 1.25);
    ctx.fillStyle = params.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, params.text, ctx.canvas.width / 2, ctx.canvas.height / 2, "700", params.fontSize);
    ctx.restore();
  },
});

const SubtitleScene = defineScene({
  id: "subtitle-scene",
  name: "Subtitle Scene",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Subtitle", "AI-powered video creator"),
    fontSize: sceneParams.number("Font Size", 48, { min: 16, max: 96, step: 1 }),
    color: sceneParams.color("Text Color", "#60a5fa"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const x = slide(time, 1.5, -ctx.canvas.width, ctx.canvas.width / 2);
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, x, ctx.canvas.height / 2, "600", p.fontSize);
  },
});

const ColorScene = defineScene({
  id: "color-scene",
  name: "Color Scene",
  duration: 3,
  defaultParams: {
    speed: sceneParams.number("Speed", 1, { min: 0.1, max: 5, step: 0.1 }),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { speed: number };
    const hue = (time * p.speed * 120) % 360;
    ctx.fillStyle = `hsl(${hue}, 70%, 50%)`;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.globalAlpha = 0.8;
    drawTextWithEmoji(ctx, "🎨 Colors!", ctx.canvas.width / 2, ctx.canvas.height / 2, "700", 64);
    ctx.globalAlpha = 1;
  },
});

const BouncingTextScene = defineScene({
  id: "bouncing-text-scene",
  name: "Bouncing Text",
  duration: 4,
  defaultParams: {
    text: sceneParams.string("Text", "Create Amazing Videos"),
    fontSize: sceneParams.number("Font Size", 56, { min: 20, max: 100, step: 1 }),
    color: sceneParams.color("Text Color", "#fbbf24"),
    bgColor: sceneParams.color("Background", "#1e1b4b"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const b = bounce(time, 2);
    const y = ctx.canvas.height - b * (ctx.canvas.height / 2);
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, ctx.canvas.width / 2, y, "700", p.fontSize);
  },
});

const OutroScene = defineScene({
  id: "outro-scene",
  name: "Outro Scene",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Text", "Thank you"),
    fontSize: sceneParams.number("Font Size", 72, { min: 24, max: 120, step: 1 }),
    color: sceneParams.color("Text Color", "#ffffff"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = Math.max(0, 1 - fade(time, 3));
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, ctx.canvas.width / 2, ctx.canvas.height / 2, "700", p.fontSize);
    ctx.globalAlpha = 1;
  },
});

const ParticlesScene = defineScene({
  id: "particles-scene",
  name: "Particles Scene",
  duration: 4,
  defaultParams: {
    count: sceneParams.number("Particle Count", 80, { min: 10, max: 300, step: 1 }),
    speed: sceneParams.number("Speed", 2, { min: 0.1, max: 10, step: 0.1 }),
    color: sceneParams.color("Particle Color", "#60a5fa"),
    bgColor: sceneParams.color("Background", "#0f172a"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { count: number; speed: number; color: string; bgColor: string };
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = p.color;
    for (let i = 0; i < p.count; i++) {
      const seed = i * 137.508;
      const angle = seed + time * p.speed;
      const radius = ((seed * 0.3 + time * p.speed * 20) % (Math.max(w, h) * 0.6));
      const x = w / 2 + Math.cos(angle) * radius;
      const y = h / 2 + Math.sin(angle) * radius;
      const size = 2 + (i % 4);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  },
});

const GradientScene = defineScene({
  id: "gradient-scene",
  name: "Gradient Scene",
  duration: 4,
  defaultParams: {
    color1: sceneParams.color("Color 1", "#6366f1"),
    color2: sceneParams.color("Color 2", "#ec4899"),
    speed: sceneParams.number("Rotation Speed", 1, { min: 0.1, max: 5, step: 0.1 }),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { color1: string; color2: string; speed: number };
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const angle = time * p.speed;
    const cx = w / 2;
    const cy = h / 2;
    const r = Math.sqrt(cx * cx + cy * cy);
    const x0 = cx + Math.cos(angle) * r;
    const y0 = cy + Math.sin(angle) * r;
    const x1 = cx - Math.cos(angle) * r;
    const y1 = cy - Math.sin(angle) * r;
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, p.color1);
    grad.addColorStop(1, p.color2);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  },
});

const ZoomInScene = defineScene({
  id: "zoom-in-scene",
  name: "Zoom In Text",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Text", "Zoom!"),
    fontSize: sceneParams.number("Font Size", 64, { min: 16, max: 120, step: 1 }),
    color: sceneParams.color("Text Color", "#ffffff"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const scale = zoom(time, 2, 0.2, 1);
    ctx.save();
    ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
    ctx.scale(scale, scale);
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, 0, 0, "700", p.fontSize);
    ctx.restore();
  },
});

const SlideInScene = defineScene({
  id: "slide-in-scene",
  name: "Slide In Text",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Text", "Slide In"),
    fontSize: sceneParams.number("Font Size", 64, { min: 16, max: 120, step: 1 }),
    color: sceneParams.color("Text Color", "#fbbf24"),
    bgColor: sceneParams.color("Background", "#1e1b4b"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    const x = slide(time, 1.5, -ctx.canvas.width, ctx.canvas.width / 2);
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, x, ctx.canvas.height / 2, "700", p.fontSize);
  },
});

const FadeInScene = defineScene({
  id: "fade-in-scene",
  name: "Fade In Text",
  duration: 3,
  defaultParams: {
    text: sceneParams.string("Text", "Fade In"),
    fontSize: sceneParams.number("Font Size", 64, { min: 16, max: 120, step: 1 }),
    color: sceneParams.color("Text Color", "#34d399"),
    bgColor: sceneParams.color("Background", "#111827"),
  },
  draw: (ctx, rawParams, time) => {
    const p = rawParams as { text: string; fontSize: number; color: string; bgColor: string };
    ctx.fillStyle = p.bgColor;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.globalAlpha = fade(time, 1.5);
    ctx.fillStyle = p.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    drawTextWithEmoji(ctx, p.text, ctx.canvas.width / 2, ctx.canvas.height / 2, "700", p.fontSize);
    ctx.globalAlpha = 1;
  },
});

export const allScenePresets: Scene[] = [
  TitleScene, SubtitleScene, ColorScene, BouncingTextScene, OutroScene,
  ParticlesScene, GradientScene, ZoomInScene, SlideInScene, FadeInScene,
];

export interface SceneItem {
  id: string;
  name: string;
  duration: number;
  sceneConfig: SceneConfig;
  params: Record<string, unknown>;
}

export function getSceneFrameRanges(scenes: SceneItem[], fps: number) {
  let startFrame = 0;

  return scenes.map((scene, index) => {
    const frameLength = Math.max(1, Math.round(scene.duration * fps));
    const range = {
      index,
      scene,
      startFrame,
      endFrame: startFrame + frameLength,
      frameLength,
    };

    startFrame += frameLength;
    return range;
  });
}

export function getSceneAtFrame(
  scenes: SceneItem[],
  fps: number,
  frame: number,
) {
  const ranges = getSceneFrameRanges(scenes, fps);

  if (ranges.length === 0) {
    return null;
  }

  const totalFrames = ranges[ranges.length - 1]?.endFrame ?? 0;
  const clampedFrame = totalFrames <= 0
    ? 0
    : Math.max(0, Math.min(Math.floor(frame), totalFrames - 1));
  return (
    ranges.find((range) => clampedFrame >= range.startFrame && clampedFrame < range.endFrame) ??
    ranges[ranges.length - 1]
  );
}
