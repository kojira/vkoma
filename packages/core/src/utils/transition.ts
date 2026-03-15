export type TransitionType =
  | "fade"
  | "crossfade"
  | "slide-left"
  | "slide-right";

export function renderWithTransition(options: {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  fromCanvas: HTMLCanvasElement | OffscreenCanvas;
  toCanvas: HTMLCanvasElement | OffscreenCanvas;
  progress: number;
  type: TransitionType;
}): void {
  const { ctx, width, height, fromCanvas, toCanvas, progress, type } = options;

  ctx.save();

  switch (type) {
    case "crossfade": {
      ctx.globalAlpha = 1 - progress;
      ctx.drawImage(fromCanvas, 0, 0, width, height);
      ctx.globalAlpha = progress;
      ctx.drawImage(toCanvas, 0, 0, width, height);
      break;
    }

    case "fade": {
      if (progress < 0.5) {
        // Fade out fromCanvas
        ctx.globalAlpha = 1 - progress * 2;
        ctx.drawImage(fromCanvas, 0, 0, width, height);
      } else {
        // Fade in toCanvas
        ctx.globalAlpha = (progress - 0.5) * 2;
        ctx.drawImage(toCanvas, 0, 0, width, height);
      }
      break;
    }

    case "slide-left": {
      const offset = progress * width;
      ctx.drawImage(fromCanvas, -offset, 0, width, height);
      ctx.drawImage(toCanvas, width - offset, 0, width, height);
      break;
    }

    case "slide-right": {
      const offset = progress * width;
      ctx.drawImage(fromCanvas, offset, 0, width, height);
      ctx.drawImage(toCanvas, -width + offset, 0, width, height);
      break;
    }
  }

  ctx.restore();
}
