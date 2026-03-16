import { applyEasing } from '../params';
import type { EasingType } from '../params';

export type ShapeType = 'rect' | 'circle' | 'ellipse' | 'line';
export type ShapeEffect = 'none' | 'fade' | 'scale' | 'slide-left' | 'slide-right';

export interface ShapePartParams {
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  opacity: number;
  effect: ShapeEffect;
  easing: EasingType;
  delay: number;
  animDuration: number;
}

export const shapePartDefaultParams: ShapePartParams = {
  type: 'rect',
  x: 960,
  y: 540,
  width: 200,
  height: 100,
  fill: '#6366f1',
  stroke: 'transparent',
  strokeWidth: 0,
  cornerRadius: 0,
  opacity: 1.0,
  effect: 'none',
  easing: 'easeOut',
  delay: 0,
  animDuration: 0.3,
};

export function drawShapePart(
  ctx: CanvasRenderingContext2D,
  params: ShapePartParams,
  time: number,
  _duration: number,
): void {
  const t = Math.max(0, time - params.delay);
  const rawProgress = params.animDuration > 0 ? Math.min(1, t / params.animDuration) : 1;
  const eased = applyEasing(rawProgress, params.easing);

  let opacityMult = 1;
  let sx = 1, sy = 1;
  let ox = 0;

  switch (params.effect) {
    case 'fade': opacityMult = eased; break;
    case 'scale': sx = eased; sy = eased; break;
    case 'slide-left': ox = (1 - eased) * -params.width; break;
    case 'slide-right': ox = (1 - eased) * params.width; break;
  }

  const cx = params.x + ox;
  const cy = params.y;
  const hw = params.width / 2;
  const hh = params.height / 2;

  ctx.save();
  ctx.globalAlpha = params.opacity * opacityMult;

  if (params.type === 'rect') {
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    if (params.cornerRadius > 0) {
      ctx.roundRect(-hw, -hh, params.width, params.height, params.cornerRadius);
    } else {
      ctx.rect(-hw, -hh, params.width, params.height);
    }
    if (params.fill && params.fill !== 'transparent') {
      ctx.fillStyle = params.fill;
      ctx.fill();
    }
    if (params.stroke && params.stroke !== 'transparent' && params.strokeWidth > 0) {
      ctx.strokeStyle = params.stroke;
      ctx.lineWidth = params.strokeWidth;
      ctx.stroke();
    }
  } else if (params.type === 'circle') {
    const radius = Math.min(params.width, params.height) / 2;
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    if (params.fill && params.fill !== 'transparent') {
      ctx.fillStyle = params.fill;
      ctx.fill();
    }
    if (params.stroke && params.stroke !== 'transparent' && params.strokeWidth > 0) {
      ctx.strokeStyle = params.stroke;
      ctx.lineWidth = params.strokeWidth;
      ctx.stroke();
    }
  } else if (params.type === 'ellipse') {
    ctx.translate(cx, cy);
    ctx.scale(sx, sy);
    ctx.beginPath();
    ctx.ellipse(0, 0, hw, hh, 0, 0, Math.PI * 2);
    if (params.fill && params.fill !== 'transparent') {
      ctx.fillStyle = params.fill;
      ctx.fill();
    }
    if (params.stroke && params.stroke !== 'transparent' && params.strokeWidth > 0) {
      ctx.strokeStyle = params.stroke;
      ctx.lineWidth = params.strokeWidth;
      ctx.stroke();
    }
  } else if (params.type === 'line') {
    ctx.beginPath();
    ctx.moveTo(cx - hw, cy);
    ctx.lineTo(cx + hw, cy);
    if (params.stroke && params.stroke !== 'transparent') {
      ctx.strokeStyle = params.stroke;
      ctx.lineWidth = params.strokeWidth || 2;
      ctx.stroke();
    }
  }

  ctx.restore();
}
