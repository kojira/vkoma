import { applyEasing } from "../params";
export function applyEasingValue(progress, easing) {
    return applyEasing(progress, easing);
}
export function applyTransitionIn(ctx, progress, type, config, width, height, renderFn) {
    const eased = applyEasingValue(progress, config.easing);
    switch (type) {
        case "none": {
            renderFn();
            break;
        }
        case "fade":
        case "crossfade": {
            ctx.save();
            ctx.globalAlpha = eased;
            renderFn();
            ctx.restore();
            break;
        }
        case "slide-left": {
            ctx.save();
            ctx.translate(-(1 - eased) * width, 0);
            renderFn();
            ctx.restore();
            break;
        }
        case "slide-right": {
            ctx.save();
            ctx.translate((1 - eased) * width, 0);
            renderFn();
            ctx.restore();
            break;
        }
        case "slide-up": {
            ctx.save();
            ctx.translate(0, -(1 - eased) * height);
            renderFn();
            ctx.restore();
            break;
        }
        case "slide-down": {
            ctx.save();
            ctx.translate(0, (1 - eased) * height);
            renderFn();
            ctx.restore();
            break;
        }
        case "wipe-left": {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, eased * width, height);
            ctx.clip();
            renderFn();
            ctx.restore();
            break;
        }
        case "wipe-right": {
            ctx.save();
            ctx.beginPath();
            ctx.rect((1 - eased) * width, 0, eased * width, height);
            ctx.clip();
            renderFn();
            ctx.restore();
            break;
        }
        case "iris-open": {
            const radius = eased * Math.sqrt(width * width + height * height) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
            ctx.clip();
            renderFn();
            ctx.restore();
            break;
        }
        case "iris-close": {
            const radius = (1 - eased) * Math.sqrt(width * width + height * height) / 2;
            ctx.save();
            ctx.beginPath();
            ctx.arc(width / 2, height / 2, radius, 0, Math.PI * 2);
            ctx.clip();
            renderFn();
            ctx.restore();
            break;
        }
        case "zoom-in": {
            const cx = width / 2, cy = height / 2;
            const scale = 0.5 + eased * 0.5;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
            renderFn();
            ctx.restore();
            break;
        }
        case "zoom-out": {
            const cx = width / 2, cy = height / 2;
            const scale = 1.5 - eased * 0.5;
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.translate(-cx, -cy);
            renderFn();
            ctx.restore();
            break;
        }
        case "glitch": {
            const count = 3;
            for (let i = 0; i < count; i++) {
                const offsetX = (Math.random() * 2 - 1) * 20 * (1 - eased);
                const offsetY = (Math.random() * 2 - 1) * 10 * (1 - eased);
                ctx.save();
                ctx.globalAlpha = i === 0 ? 1 : 0.5;
                ctx.translate(offsetX, offsetY);
                renderFn();
                ctx.restore();
            }
            break;
        }
    }
}
export function applyTransitionOut(ctx, progress, type, config, width, height, renderFn) {
    applyTransitionIn(ctx, 1 - progress, type, config, width, height, renderFn);
}
export function renderWithTransition(options) {
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
                ctx.globalAlpha = 1 - progress * 2;
                ctx.drawImage(fromCanvas, 0, 0, width, height);
            }
            else {
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
