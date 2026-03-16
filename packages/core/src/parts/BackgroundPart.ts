export type BackgroundType = 'solid' | 'gradient-linear' | 'gradient-radial' | 'image';

export interface BackgroundPartParams {
  type: BackgroundType;
  color: string;
  gradientColors: string[];
  gradientAngle: number;
  imageSrc: string;
  imageFit: 'cover' | 'contain' | 'fill';
  imageAlpha: number;
  overlayColor: string;
  overlayAlpha: number;
}

export const backgroundPartDefaultParams: BackgroundPartParams = {
  type: 'solid',
  color: '#111827',
  gradientColors: ['#1a1a2e', '#16213e', '#0f3460'],
  gradientAngle: 135,
  imageSrc: '',
  imageFit: 'cover',
  imageAlpha: 1.0,
  overlayColor: '#000000',
  overlayAlpha: 0.0,
};

type CanvasImageLike = HTMLImageElement | ImageBitmap | { width: number; height: number };

export function drawBackgroundPart(
  ctx: CanvasRenderingContext2D,
  params: BackgroundPartParams,
  _time: number,
  _duration: number,
  imageCache?: Map<string, CanvasImageLike>,
): void {
  const w = ctx.canvas?.width ?? 1920;
  const h = ctx.canvas?.height ?? 1080;

  ctx.save();

  switch (params.type) {
    case 'solid': {
      ctx.fillStyle = params.color;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'gradient-linear': {
      const angleRad = (params.gradientAngle * Math.PI) / 180;
      const cos = Math.cos(angleRad);
      const sin = Math.sin(angleRad);
      const halfLen = Math.sqrt(w * w + h * h) / 2;
      const gx0 = w / 2 - cos * halfLen;
      const gy0 = h / 2 - sin * halfLen;
      const gx1 = w / 2 + cos * halfLen;
      const gy1 = h / 2 + sin * halfLen;
      const gradient = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
      const colors = params.gradientColors.length >= 2 ? params.gradientColors : ['#000000', '#ffffff'];
      colors.forEach((c, i) => {
        gradient.addColorStop(i / (colors.length - 1), c);
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'gradient-radial': {
      const gradient = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.sqrt(w * w + h * h) / 2);
      const colors = params.gradientColors.length >= 2 ? params.gradientColors : ['#000000', '#ffffff'];
      colors.forEach((c, i) => {
        gradient.addColorStop(i / (colors.length - 1), c);
      });
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, w, h);
      break;
    }
    case 'image': {
      const img = imageCache?.get(params.imageSrc);
      if (img && 'width' in img && img.width > 0) {
        ctx.globalAlpha = params.imageAlpha;
        if (params.imageFit === 'fill') {
          ctx.drawImage(img as CanvasImageSource, 0, 0, w, h);
        } else if (params.imageFit === 'cover') {
          const imgAspect = img.width / img.height;
          const boxAspect = w / h;
          let sw = img.width, sh = img.height, sx = 0, sy = 0;
          if (imgAspect > boxAspect) { sw = img.height * boxAspect; sx = (img.width - sw) / 2; }
          else { sh = img.width / boxAspect; sy = (img.height - sh) / 2; }
          ctx.drawImage(img as CanvasImageSource, sx, sy, sw, sh, 0, 0, w, h);
        } else {
          const imgAspect = img.width / img.height;
          const boxAspect = w / h;
          let dw = w, dh = h, dx = 0, dy = 0;
          if (imgAspect > boxAspect) { dh = w / imgAspect; dy = (h - dh) / 2; }
          else { dw = h * imgAspect; dx = (w - dw) / 2; }
          ctx.drawImage(img as CanvasImageSource, dx, dy, dw, dh);
        }
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
  }

  if (params.overlayAlpha > 0) {
    ctx.globalAlpha = params.overlayAlpha;
    ctx.fillStyle = params.overlayColor;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
