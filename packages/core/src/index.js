export function defineScene(config) {
    return { ...config, __type: "vkoma-scene" };
}
export const params = {
    string: (label, def) => ({ type: "string", label, default: def }),
    number: (label, def, opts) => ({
        type: "number",
        label,
        default: def,
        ...opts,
    }),
    color: (label, def) => ({ type: "color", label, default: def }),
    select: (label, def, options) => ({
        type: "select",
        label,
        default: def,
        options,
    }),
    duration: (label, def) => ({ type: "duration", label, default: def }),
};
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
                ctx.font = options.font ?? "48px sans-serif";
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
export function fade(t, duration) {
    if (duration <= 0) {
        return 1;
    }
    return Math.max(0, Math.min(1, t / duration));
}
export function bounce(t, duration) {
    if (duration <= 0) {
        return 1;
    }
    const x = Math.max(0, Math.min(1, t / duration));
    const n1 = 7.5625;
    const d1 = 2.75;
    if (x < 1 / d1) {
        return n1 * x * x;
    }
    if (x < 2 / d1) {
        const adjusted = x - 1.5 / d1;
        return n1 * adjusted * adjusted + 0.75;
    }
    if (x < 2.5 / d1) {
        const adjusted = x - 2.25 / d1;
        return n1 * adjusted * adjusted + 0.9375;
    }
    const adjusted = x - 2.625 / d1;
    return n1 * adjusted * adjusted + 0.984375;
}
export function slide(t, duration, from, to) {
    return from + (to - from) * fade(t, duration);
}
export function zoom(t, duration, fromScale, toScale) {
    return fromScale + (toScale - fromScale) * fade(t, duration);
}
export function renderScene(scene, ctx, width, height, time) {
    const sceneConfig = "sceneConfig" in scene ? scene.sceneConfig : scene;
    const instanceParams = "sceneConfig" in scene ? scene.params ?? {} : {};
    const resolvedParams = Object.fromEntries(Object.entries(sceneConfig.defaultParams).map(([key, param]) => [
        key,
        instanceParams[key] ?? param.default,
    ]));
    ctx.clearRect(0, 0, width, height);
    sceneConfig.setup?.(ctx, resolvedParams);
    sceneConfig.draw(ctx, resolvedParams, time);
}
