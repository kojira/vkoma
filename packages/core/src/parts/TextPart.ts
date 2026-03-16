import { applyEasing } from '../params';
import type { EasingType } from '../params';

export type TextEffect = 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'zoom' | 'typewriter';

export interface TextPartParams {
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  color: string;
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
  effect: TextEffect;
  easing: EasingType;
  delay: number;
  animDuration: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  opacity: number;
}

export const textPartDefaultParams: TextPartParams = {
  text: 'Hello World',
  fontSize: 64,
  fontFamily: 'Helvetica, Arial, sans-serif',
  fontWeight: 'bold',
  color: '#ffffff',
  x: 0.5,
  y: 0.5,
  align: 'center',
  effect: 'fade',
  easing: 'easeOut',
  delay: 0,
  animDuration: 0.5,
  shadow: false,
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 8,
  outline: false,
  outlineColor: '#000000',
  outlineWidth: 2,
  opacity: 1,
};

export function drawTextPart(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  time: number,
  params: TextPartParams,
): void {
  const p = { ...textPartDefaultParams, ...params };
  const elapsed = Math.max(0, time - p.delay);
  const rawProgress = p.animDuration > 0 ? Math.min(1, elapsed / p.animDuration) : 1;
  const progress = applyEasing(rawProgress, p.easing);

  ctx.save();

  // Base position (params are 0-1 normalized)
  let drawX = p.x * width;
  let drawY = p.y * height;
  let alpha = p.opacity;
  let scale = 1;

  // Apply effect
  switch (p.effect) {
    case 'fade':
      alpha *= progress;
      break;
    case 'slide-left':
      alpha *= progress;
      drawX += (1 - progress) * width * 0.2;
      break;
    case 'slide-right':
      alpha *= progress;
      drawX -= (1 - progress) * width * 0.2;
      break;
    case 'slide-up':
      alpha *= progress;
      drawY += (1 - progress) * height * 0.15;
      break;
    case 'slide-down':
      alpha *= progress;
      drawY -= (1 - progress) * height * 0.15;
      break;
    case 'zoom':
      alpha *= progress;
      scale = 0.5 + progress * 0.5;
      break;
    case 'typewriter':
      // Show characters progressively
      break;
    case 'none':
    default:
      break;
  }

  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));

  // Apply scale transform for zoom effect
  if (scale !== 1) {
    ctx.translate(drawX, drawY);
    ctx.scale(scale, scale);
    ctx.translate(-drawX, -drawY);
  }

  // Font setup
  ctx.font = `${p.fontWeight} ${p.fontSize}px ${p.fontFamily}`;
  ctx.textAlign = p.align;
  ctx.textBaseline = 'middle';

  const displayText = p.effect === 'typewriter'
    ? p.text.slice(0, Math.floor(p.text.length * progress))
    : p.text;

  // Shadow
  if (p.shadow) {
    ctx.shadowColor = p.shadowColor;
    ctx.shadowBlur = p.shadowBlur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
  }

  // Outline
  if (p.outline) {
    ctx.strokeStyle = p.outlineColor;
    ctx.lineWidth = p.outlineWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(displayText, drawX, drawY);
  }

  // Fill text
  ctx.fillStyle = p.color;
  ctx.fillText(displayText, drawX, drawY);

  ctx.restore();
}
