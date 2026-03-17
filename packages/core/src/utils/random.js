function djb2Hash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
    }
    return hash >>> 0;
}
function mulberry32(seed) {
    let t = (seed + 0x6d2b79f5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function random(seed) {
    const numericSeed = typeof seed === "string" ? djb2Hash(seed) : seed >>> 0;
    return mulberry32(numericSeed);
}
export function randomInt(seed, min, max) {
    const r = random(seed);
    return Math.floor(r * (max - min + 1)) + min;
}
