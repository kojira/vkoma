const measureCache = new Map();
export function measureTextCached(ctx, text, fontFamily, fontWeight, fontSize) {
    const key = `${text}|${fontFamily}|${fontWeight}|${fontSize}`;
    const cached = measureCache.get(key);
    if (cached)
        return cached;
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(text);
    const result = {
        width: metrics.width,
        height: fontSize,
    };
    measureCache.set(key, result);
    return result;
}
export function fitText(options) {
    const { ctx, text, withinWidth, fontFamily, fontWeight, maxFontSize = 200, minFontSize = 1, } = options;
    let low = minFontSize;
    let high = maxFontSize;
    while (low < high) {
        const mid = Math.ceil((low + high + 1) / 2);
        const { width } = measureTextCached(ctx, text, fontFamily, fontWeight, mid);
        if (width <= withinWidth) {
            low = mid;
        }
        else {
            high = mid - 1;
        }
    }
    return low;
}
export function wrapText(ctx, text, maxWidth, fontFamily, fontWeight, fontSize) {
    const words = text.split(" ");
    const lines = [];
    let currentLine = "";
    for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const { width } = measureTextCached(ctx, testLine, fontFamily, fontWeight, fontSize);
        if (width > maxWidth && currentLine) {
            lines.push(currentLine);
            currentLine = word;
        }
        else {
            currentLine = testLine;
        }
    }
    if (currentLine) {
        lines.push(currentLine);
    }
    return lines;
}
export function fillTextBox(options) {
    const { ctx, text, x, y, maxWidth, lineHeight, fontFamily, fontWeight, fontSize, color = "#ffffff", maxLines, } = options;
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
