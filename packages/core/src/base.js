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
