export function parseColor(color) {
    // Hex formats
    if (color.startsWith("#")) {
        const hex = color.slice(1);
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
                a: 1,
            };
        }
        if (hex.length === 6) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: 1,
            };
        }
        if (hex.length === 8) {
            return {
                r: parseInt(hex.slice(0, 2), 16),
                g: parseInt(hex.slice(2, 4), 16),
                b: parseInt(hex.slice(4, 6), 16),
                a: parseInt(hex.slice(6, 8), 16) / 255,
            };
        }
    }
    // rgba(r, g, b, a)
    const rgbaMatch = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/);
    if (rgbaMatch) {
        return {
            r: parseInt(rgbaMatch[1]),
            g: parseInt(rgbaMatch[2]),
            b: parseInt(rgbaMatch[3]),
            a: parseFloat(rgbaMatch[4]),
        };
    }
    // rgb(r, g, b)
    const rgbMatch = color.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgbMatch) {
        return {
            r: parseInt(rgbMatch[1]),
            g: parseInt(rgbMatch[2]),
            b: parseInt(rgbMatch[3]),
            a: 1,
        };
    }
    // hsl(h, s%, l%)
    const hslMatch = color.match(/hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)/);
    if (hslMatch) {
        const h = parseInt(hslMatch[1]) / 360;
        const s = parseInt(hslMatch[2]) / 100;
        const l = parseInt(hslMatch[3]) / 100;
        const { r, g, b } = hslToRgb(h, s, l);
        return { r, g, b, a: 1 };
    }
    throw new Error(`Cannot parse color: ${color}`);
}
function hslToRgb(h, s, l) {
    if (s === 0) {
        const v = Math.round(l * 255);
        return { r: v, g: v, b: v };
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    return {
        r: Math.round(hueToRgb(p, q, h + 1 / 3) * 255),
        g: Math.round(hueToRgb(p, q, h) * 255),
        b: Math.round(hueToRgb(p, q, h - 1 / 3) * 255),
    };
}
function hueToRgb(p, q, t) {
    if (t < 0)
        t += 1;
    if (t > 1)
        t -= 1;
    if (t < 1 / 6)
        return p + (q - p) * 6 * t;
    if (t < 1 / 2)
        return q;
    if (t < 2 / 3)
        return p + (q - p) * (2 / 3 - t) * 6;
    return p;
}
export function colorToString(color) {
    return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
}
export function interpolateColors(progress, keyframes, colors) {
    if (keyframes.length !== colors.length) {
        throw new Error("keyframes and colors must have the same length");
    }
    const parsed = colors.map((c) => parseColor(c));
    // Clamp to range
    if (progress <= keyframes[0]) {
        return colorToString(parsed[0]);
    }
    if (progress >= keyframes[keyframes.length - 1]) {
        return colorToString(parsed[parsed.length - 1]);
    }
    // Find segment
    for (let i = 1; i < keyframes.length; i++) {
        if (progress <= keyframes[i]) {
            const t = (progress - keyframes[i - 1]) / (keyframes[i] - keyframes[i - 1]);
            const from = parsed[i - 1];
            const to = parsed[i];
            return colorToString({
                r: Math.round(from.r + (to.r - from.r) * t),
                g: Math.round(from.g + (to.g - from.g) * t),
                b: Math.round(from.b + (to.b - from.b) * t),
                a: from.a + (to.a - from.a) * t,
            });
        }
    }
    return colorToString(parsed[parsed.length - 1]);
}
