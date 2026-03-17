// packages/core/src/params.ts
export function applyEasing(progress, easing) {
    const t = Math.max(0, Math.min(1, progress));
    switch (easing) {
        case 'linear': return t;
        case 'easeIn':
        case 'easeInQuad': return t * t;
        case 'easeOut':
        case 'easeOutQuad': return 1 - (1 - t) * (1 - t);
        case 'easeInOut':
        case 'easeInOutQuad': return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        case 'easeInCubic': return t * t * t;
        case 'easeOutCubic': return 1 - Math.pow(1 - t, 3);
        case 'easeInOutCubic': return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        case 'easeOutBounce': {
            const n1 = 7.5625, d1 = 2.75;
            if (t < 1 / d1)
                return n1 * t * t;
            if (t < 2 / d1) {
                const x = t - 1.5 / d1;
                return n1 * x * x + 0.75;
            }
            if (t < 2.5 / d1) {
                const x = t - 2.25 / d1;
                return n1 * x * x + 0.9375;
            }
            const x = t - 2.625 / d1;
            return n1 * x * x + 0.984375;
        }
        case 'easeOutElastic': {
            if (t === 0 || t === 1)
                return t;
            return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1;
        }
        case 'easeOutBack': {
            const c1 = 1.70158, c3 = c1 + 1;
            return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
        }
        default: return t;
    }
}
export const sceneParams = {
    string: (label, def, opts) => ({ type: 'string', label, default: def, ...opts }),
    number: (label, def, opts) => ({ type: 'number', label, default: def, ...opts }),
    color: (label, def) => ({ type: 'color', label, default: def }),
    select: (label, def, options) => ({
        type: 'select', label, default: def,
        options: options.map(o => typeof o === 'string' ? { value: o, label: o } : o),
    }),
    duration: (label, def) => ({ type: 'duration', label, default: def }),
    boolean: (label, def) => ({ type: 'boolean', label, default: def }),
    font: (label, def) => ({ type: 'font', label, default: def }),
    easing: (label, def) => ({ type: 'easing', label, default: def }),
    position: (label, defX, defY) => ({ type: 'position', label, default: { x: defX, y: defY } }),
    image: (label) => ({ type: 'image', label, default: '' }),
    audio: (label) => ({ type: 'audio', label, default: '' }),
};
