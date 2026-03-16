import { applyEasing } from '../params';
import type { EasingType } from '../params';

export type ImageEffect = 'none' | 'fade' | 'zoom-in' | 'zoom-out' | 'slide-left' | 'slide-right';
export type ImageFit = 'contain' | 'cover' | 'fill' | 'none';

export interface ImagePartParams {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  fit: ImageFit;
  anchorX: 'left' | 'center' | 'right';
  anchorY: 'top' | 'middle' | 'bottom';
  effect: ImageEffect;
  easing: EasingType;
  delay: number;
  animDuration: number;
  brightness: number;
  contrast: number;
  grayscale: number;
  blur: number;
}

export const imagePartDefaultParams: ImagePartParams = {
  src: '',
  x: 960,
  y: 540,
  width: 400,
  height: 300,
  opacity: 1.0,
  fit: 'contain',
  anchorX: 'center',
  anchorY: 'middle',
  effect: 'none',
  easing: 'easeOut',
  delay: 0,
  animDuration: 0.5,
  brightness: 1.0,
  contrast: 1.0,
  grayscale: 0.0,
  blur: 0,
};

function getAnchorOffset(anchor: string, size: number): number {
  if (anchor === 'center' || anchor === 'middle') return -size / 2;
  if (anchor === 'right' || anchor === 'bottom') return -size;
  return 0;
}

type CanvasImageLike = HTMLImageElement | ImageBitmap | { width: number; height: number };

export function drawImagePart(
  ctx: CanvasRenderingContext2D,
  params: ImagePartParams,
  time: number,
  _duration: number,
  imageCache: Map<string, CanvasImageLike>,
): void {
  const t = Math.max(0, time - params.delay);
  const rawProgress = params.animDuration > 0 ? Math.min(1, t / params.animDuration) : 1;
  const eased = applyEasing(rawProgress, params.easing);

  let opacityMult = 1;
  let scaleX = 1, scaleY = 1;
  let offsetX = 0;

  switch (params.effect) {
    case 'fade': opacityMult = eased; break;
    case 'zoom-in': { const s = 0.8 + eased * 0.2; scaleX = s; scaleY = s; opacityMult = eased; break; }
    case 'zoom-out': { const s = 1.2 - eased * 0.2; scaleX = s; scaleY = s; opacityMult = eased; break; }
    case 'slide-left': offsetX = (1 - eased) * -params.width; opacityMult = eased; break;
    case 'slide-right': offsetX = (1 - eased) * params.width; opacityMult = eased; break;
  }

  const drawX = params.x + getAnchorOffset(params.anchorX, params.width) + offsetX;
  const drawY = params.y + getAnchorOffset(params.anchorY, params.height);

  ctx.save();
  ctx.globalAlpha = params.opacity * opacityMult;

  const img = imageCache.get(params.src);
  if (img && 'width' in img && img.width > 0) {
    ctx.translate(drawX + params.width / 2, drawY + params.height / 2);
    ctx.scale(scaleX, scaleY);
    if (params.fit === 'fill') {
      ctx.drawImage(img as CanvasImageSource, -params.width / 2, -params.height / 2, params.width, params.height);
    } else if (params.fit === 'cover') {
      const imgAspect = img.width / img.height;
      const boxAspect = params.width / params.height;
      let sw = img.width, sh = img.height, sx = 0, sy = 0;
      if (imgAspect > boxAspect) { sw = img.height * boxAspect; sx = (img.width - sw) / 2; }
      else { sh = img.width / boxAspect; sy = (img.height - sh) / 2; }
      ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, -params.width / 2, -params.height / 2, params.width, params.height);
    } else {
      const imgAspect = img.width / img.height;
      const boxAspect = params.width / params.height;
      let dw = params.width, dh = params.height;
      if (imgAspect > boxAspect) { dh = params.width / imgAspect; }
      else { dw = params.height * imgAspect; }
      ctx.drawImage(img as CanvasImageSource, -dw / 2, -dh / 2, dw, dh);
    }
  } else {
    ctx.translate(drawX + params.width / 2, drawY + params.height / 2);
    ctx.scale(scaleX, scaleY);
    ctx.fillStyle = 'rgba(128,128,128,0.3)';
    ctx.fillRect(-params.width / 2, -params.height / 2, params.width, params.height);
  }

  ctx.restore();
}
