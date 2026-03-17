export function interpolate(value, inputRange, outputRange, options) {
    if (inputRange.length !== outputRange.length) {
        throw new Error("inputRange and outputRange must have the same length");
    }
    if (inputRange.length < 2) {
        throw new Error("ranges must have at least 2 elements");
    }
    const extrapolateLeft = options?.extrapolateLeft ?? "clamp";
    const extrapolateRight = options?.extrapolateRight ?? "clamp";
    // Handle values below the input range
    if (value <= inputRange[0]) {
        if (extrapolateLeft === "clamp") {
            return outputRange[0];
        }
        if (extrapolateLeft === "identity") {
            return value;
        }
        // extend
        const slope = (outputRange[1] - outputRange[0]) / (inputRange[1] - inputRange[0]);
        return outputRange[0] + slope * (value - inputRange[0]);
    }
    // Handle values above the input range
    const lastIdx = inputRange.length - 1;
    if (value >= inputRange[lastIdx]) {
        if (extrapolateRight === "clamp") {
            return outputRange[lastIdx];
        }
        if (extrapolateRight === "identity") {
            return value;
        }
        // extend
        const slope = (outputRange[lastIdx] - outputRange[lastIdx - 1]) /
            (inputRange[lastIdx] - inputRange[lastIdx - 1]);
        return outputRange[lastIdx] + slope * (value - inputRange[lastIdx]);
    }
    // Find the segment
    for (let i = 1; i < inputRange.length; i++) {
        if (value <= inputRange[i]) {
            const t = (value - inputRange[i - 1]) / (inputRange[i] - inputRange[i - 1]);
            return outputRange[i - 1] + t * (outputRange[i] - outputRange[i - 1]);
        }
    }
    return outputRange[lastIdx];
}
export class Easing {
    static linear(t) {
        return t;
    }
    static ease(t) {
        return Easing.bezier(0.25, 0.1, 0.25, 1.0)(t);
    }
    static easeIn(t) {
        return t * t;
    }
    static easeOut(t) {
        return 1 - (1 - t) * (1 - t);
    }
    static easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    }
    static bezier(x1, y1, x2, y2) {
        return (t) => {
            if (t === 0)
                return 0;
            if (t === 1)
                return 1;
            // Newton's method to find t for given x
            let guessT = t;
            for (let i = 0; i < 8; i++) {
                const currentX = sampleCurve(x1, x2, guessT);
                const slope = sampleCurveDerivative(x1, x2, guessT);
                if (Math.abs(slope) < 1e-6)
                    break;
                guessT -= (currentX - t) / slope;
            }
            // Clamp
            guessT = Math.max(0, Math.min(1, guessT));
            return sampleCurve(y1, y2, guessT);
        };
    }
    static in(fn) {
        return fn;
    }
    static out(fn) {
        return (t) => 1 - fn(1 - t);
    }
    static inOut(fn) {
        return (t) => {
            if (t < 0.5) {
                return fn(t * 2) / 2;
            }
            return 1 - fn((1 - t) * 2) / 2;
        };
    }
}
function sampleCurve(a, b, t) {
    return ((1 - 3 * b + 3 * a) * t + (3 * b - 6 * a)) * t * t + 3 * a * t;
}
function sampleCurveDerivative(a, b, t) {
    return (3 * (1 - 3 * b + 3 * a) * t + 2 * (3 * b - 6 * a)) * t + 3 * a;
}
