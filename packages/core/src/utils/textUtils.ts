interface Dimensions {
  width: number;
  height: number;
}

const measureCache = new Map<string, Dimensions>();

export function measureTextCached(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontFamily: string,
  fontWeight: string | number,
  fontSize: number,
): Dimensions {
  const key = `${text}|${fontFamily}|${fontWeight}|${fontSize}`;
  const cached = measureCache.get(key);
  if (cached) return cached;

  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(text);
  const result: Dimensions = {
    width: metrics.width,
    height: fontSize,
  };
  measureCache.set(key, result);
  return result;
}

export function fitText(options: {
  ctx: CanvasRenderingContext2D;
  text: string;
  withinWidth: number;
  fontFamily: string;
  fontWeight: string | number;
  maxFontSize?: number;
  minFontSize?: number;
}): number {
  const {
    ctx,
    text,
    withinWidth,
    fontFamily,
    fontWeight,
    maxFontSize = 200,
    minFontSize = 1,
  } = options;

  let low = minFontSize;
  let high = maxFontSize;

  while (low < high) {
    const mid = Math.ceil((low + high + 1) / 2);
    const { width } = measureTextCached(ctx, text, fontFamily, fontWeight, mid);
    if (width <= withinWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return low;
}

export function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  fontFamily: string,
  fontWeight: string | number,
  fontSize: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const { width } = measureTextCached(
      ctx,
      testLine,
      fontFamily,
      fontWeight,
      fontSize,
    );
    if (width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

export function fillTextBox(options: {
  ctx: CanvasRenderingContext2D;
  text: string;
  x: number;
  y: number;
  maxWidth: number;
  lineHeight: number;
  fontFamily: string;
  fontWeight: string | number;
  fontSize: number;
  color?: string;
  maxLines?: number;
}): void {
  const {
    ctx,
    text,
    x,
    y,
    maxWidth,
    lineHeight,
    fontFamily,
    fontWeight,
    fontSize,
    color = "#ffffff",
    maxLines,
  } = options;

  let lines = wrapText(ctx, text, maxWidth, fontFamily, fontWeight, fontSize);
  if (maxLines !== undefined && lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
  }

  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }

  ctx.restore();
}
