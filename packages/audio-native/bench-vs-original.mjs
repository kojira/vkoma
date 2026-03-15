/**
 * Benchmark: Rust (audio-native) vs original Node.js (audio package with fft-js)
 */
import { execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';
import { createAudioAnalyzer } from '../audio/dist/index.js';

const require = createRequire(import.meta.url);
const { analyzeAudioFft, analyzeAudioFull } = require('./index.js');

const AUDIO_PATH = '../../packages/ui/e2e/fixtures/IRISOUT.wav';
const SAMPLE_RATE = 44100;
const FPS = 30;

const BANDS_DEF = [
  [20, 80],
  [80, 250],
  [250, 500],
  [500, 2000],
  [2000, 8000],
  [8000, 20000],
];

const FREQ_BANDS = BANDS_DEF.map(([lo, hi], i) => ({
  name: `band_${i}`,
  freq: [lo, hi]
}));

// Extract PCM for Rust
console.log('Extracting PCM from IRISOUT.wav...');
const tmpPath = join(tmpdir(), `bench_audio_${Date.now()}.raw`);
execSync(`ffmpeg -y -i "${AUDIO_PATH}" -f f32le -ar ${SAMPLE_RATE} -ac 1 "${tmpPath}" 2>/dev/null`);
const raw = readFileSync(tmpPath);
try { unlinkSync(tmpPath); } catch {}

const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
const audioDuration = pcm.length / SAMPLE_RATE;
const totalFrames = Math.floor(pcm.length / (SAMPLE_RATE / FPS));

console.log(`Audio: ${audioDuration.toFixed(1)}s, ${totalFrames} frames at ${FPS}fps`);

// ============================================
// Original Node.js (fft-js) - createAudioAnalyzer
// ============================================
console.log('\n--- Original Node.js audio (fft-js via createAudioAnalyzer) ---');
const t0 = performance.now();
const analyzer = createAudioAnalyzer(AUDIO_PATH, {
  bands: FREQ_BANDS,
  fps: FPS,
});
const t1 = performance.now();
const origTime = (t1 - t0) / 1000;
const origRTF = origTime / audioDuration;
console.log(`Original time: ${origTime.toFixed(3)}s`);
console.log(`Original RTF: ${origRTF.toFixed(4)}x (${(1/origRTF).toFixed(1)}x speed)`);
console.log(`Total frames: ${analyzer.totalFrames}`);

// ============================================
// Rust FFT (release build)
// ============================================
console.log('\n--- Rust FFT (napi-rs release) ---');
const t2 = performance.now();
const rustResult = analyzeAudioFft(pcm, SAMPLE_RATE, FPS, BANDS_DEF);
const t3 = performance.now();
const rustTime = (t3 - t2) / 1000;
const rustRTF = rustTime / audioDuration;
console.log(`Rust time: ${rustTime.toFixed(3)}s`);
console.log(`Rust RTF: ${rustRTF.toFixed(4)}x (${(1/rustRTF).toFixed(1)}x speed)`);
console.log(`Total frames: ${rustResult.length}`);

// ============================================
// Rust Full Analysis
// ============================================
console.log('\n--- Rust Full Analysis (with beat detection) ---');
const t4 = performance.now();
const rustFullResult = analyzeAudioFull(pcm, SAMPLE_RATE, FPS, BANDS_DEF);
const t5 = performance.now();
const rustFullTime = (t5 - t4) / 1000;
const rustFullRTF = rustFullTime / audioDuration;
console.log(`Rust Full time: ${rustFullTime.toFixed(3)}s`);
console.log(`Rust Full RTF: ${rustFullRTF.toFixed(4)}x (${(1/rustFullRTF).toFixed(1)}x speed)`);

// ============================================
// Summary
// ============================================
const speedupVsOrig = origTime / rustTime;
const speedupVsOrigFull = origTime / rustFullTime;

console.log('\n========================================');
console.log('FINAL BENCHMARK RESULTS');
console.log('========================================');
console.log(`Audio duration:         ${audioDuration.toFixed(1)}s`);
console.log(`Total frames:           ${totalFrames}`);
console.log('');
console.log(`Original (fft-js):      ${origTime.toFixed(3)}s  RTF: ${origRTF.toFixed(4)}x  (${(1/origRTF).toFixed(0)}x speed)`);
console.log(`Rust FFT:               ${rustTime.toFixed(3)}s  RTF: ${rustRTF.toFixed(4)}x  (${(1/rustRTF).toFixed(0)}x speed)`);
console.log(`Rust Full+Beat:         ${rustFullTime.toFixed(3)}s  RTF: ${rustFullRTF.toFixed(4)}x  (${(1/rustFullRTF).toFixed(0)}x speed)`);
console.log('');
console.log(`🚀 Rust vs Original speedup: ${speedupVsOrig.toFixed(1)}x faster`);
console.log(`🚀 Rust Full vs Original:    ${speedupVsOrigFull.toFixed(1)}x faster`);
console.log('');

if (speedupVsOrig >= 10) {
  console.log('✅ 10x speedup TARGET MET!');
} else {
  console.log(`⚠️  Speedup: ${speedupVsOrig.toFixed(1)}x (target 10x not met)`);
}
if (rustRTF < 0.01) {
  console.log('✅ RTF < 0.01 (100x real-time)!');
}
