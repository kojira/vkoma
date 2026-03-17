export { defineScene, params, fade, bounce, slide, zoom, } from "./base";
function withOpacity(ctx, opacity, draw) {
    ctx.save();
    if (opacity !== undefined) {
        ctx.globalAlpha = opacity;
    }
    draw();
    ctx.restore();
}
export function createDrawAPI(ctx, width, height) {
    return {
        clear: (color = "transparent") => {
            ctx.save();
            ctx.clearRect(0, 0, width, height);
            if (color !== "transparent") {
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, width, height);
            }
            ctx.restore();
        },
        rect: (x, y, rectWidth, rectHeight, options = {}) => {
            withOpacity(ctx, options.opacity, () => {
                ctx.beginPath();
                if (options.radius && options.radius > 0) {
                    ctx.roundRect(x, y, rectWidth, rectHeight, options.radius);
                }
                else {
                    ctx.rect(x, y, rectWidth, rectHeight);
                }
                if (options.fill) {
                    ctx.fillStyle = options.fill;
                    ctx.fill();
                }
                if (options.stroke) {
                    ctx.strokeStyle = options.stroke;
                    ctx.lineWidth = options.lineWidth ?? 1;
                    ctx.stroke();
                }
            });
        },
        circle: (x, y, radius, options = {}) => {
            withOpacity(ctx, options.opacity, () => {
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                if (options.fill) {
                    ctx.fillStyle = options.fill;
                    ctx.fill();
                }
                if (options.stroke) {
                    ctx.strokeStyle = options.stroke;
                    ctx.lineWidth = options.lineWidth ?? 1;
                    ctx.stroke();
                }
            });
        },
        text: (value, x, y, options = {}) => {
            withOpacity(ctx, options.opacity, () => {
                ctx.fillStyle = options.color ?? "#ffffff";
                ctx.font = options.font ?? '48px sans-serif, "Apple Color Emoji"';
                ctx.textAlign = options.align ?? "left";
                ctx.textBaseline = options.baseline ?? "alphabetic";
                ctx.fillText(value, x, y, options.maxWidth);
            });
        },
        image: (source, x, y, imageWidth, imageHeight, options = {}) => {
            withOpacity(ctx, options.opacity, () => {
                ctx.drawImage(source, x, y, imageWidth, imageHeight);
            });
        },
    };
}
export function renderScene(scene, ctx, width, height, time) {
    const sceneConfig = "sceneConfig" in scene ? scene.sceneConfig : scene;
    const instanceParams = "sceneConfig" in scene ? scene.params ?? {} : {};
    const resolvedParams = {
        ...Object.fromEntries(Object.entries(sceneConfig.defaultParams).map(([key, param]) => [
            key,
            instanceParams[key] ?? param.default,
        ])),
        ...instanceParams, // dynamically injected params (fftBands, beatIntensity, etc.)
    };
    ctx.clearRect(0, 0, width, height);
    sceneConfig.setup?.(ctx, resolvedParams);
    sceneConfig.draw(ctx, resolvedParams, time);
}
export { allScenePresets, getSceneFrameRanges, getSceneAtFrame } from "./scenes";
// Utils
export { interpolate, Easing } from "./utils/interpolate";
export { spring } from "./utils/spring";
export { random, randomInt } from "./utils/random";
export { measureTextCached, fitText, wrapText, fillTextBox } from "./utils/textUtils";
export { renderWithTransition } from "./utils/transition";
export { parseColor, colorToString, interpolateColors } from "./utils/colors";
export function getBeatIntensity(currentTime, beatTimings, decayMs = 200) {
    const decaySec = decayMs / 1000;
    for (const beatTime of beatTimings) {
        const diff = currentTime - beatTime;
        if (diff >= 0 && diff < decaySec) {
            return Math.pow(1 - diff / decaySec, 2);
        }
    }
    return 0;
}
export function applyBeatEffect(ctx, width, height, beatIntensity, config) {
    if (beatIntensity <= 0)
        return;
    const maxIntensity = config.intensity * beatIntensity;
    if (config.effect === 'scale') {
        // Subtle scale pulse via canvas transform (max 1.03)
        const scale = 1 + Math.min(maxIntensity * 0.03, 0.03);
        const cx = width / 2;
        const cy = height / 2;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(scale, scale);
        ctx.translate(-cx, -cy);
        ctx.restore();
    }
    else if (config.effect === 'particle-burst') {
        // Particle Burst - dynamic particles from center, no glow
        ctx.save();
        ctx.globalAlpha = maxIntensity * 0.6;
        const pcx = width / 2;
        const pcy = height / 2;
        const particleCount = Math.floor(20 * beatIntensity);
        for (let i = 0; i < particleCount; i++) {
            const angle = (i / particleCount) * Math.PI * 2;
            const dist = 30 + Math.random() * 150 * beatIntensity;
            const x = pcx + Math.cos(angle) * dist;
            const y = pcy + Math.sin(angle) * dist;
            const size = 2 + Math.random() * 6 * beatIntensity;
            ctx.fillStyle = '#00ff88';
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}
// Extended params system
export { sceneParams, applyEasing } from './params';
// Built-in parts
export { drawTextPart, textPartDefaultParams } from './parts/TextPart';
export { drawImagePart, imagePartDefaultParams } from './parts/ImagePart';
export { drawShapePart, shapePartDefaultParams } from './parts/ShapePart';
export { drawBackgroundPart, backgroundPartDefaultParams } from './parts/BackgroundPart';
export { getTimelineDuration, getItemsAtTime } from './timeline';
export { migrateV1ToV2 } from './migration';
export { getAssetType, getAssetsByType } from './asset';
