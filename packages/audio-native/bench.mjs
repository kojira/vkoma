import { execSync } from 'child_process';
import { readFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { analyzeAudioFft, analyzeAudioFull } = require('./index.js');

const AUDIO_PATH = '../../packages/ui/e2e/fixtures/IRISOUT.wav';
const SAMPLE_RATE = 44100;
const FPS = 30;
const FFT_SIZE = 2048;

const BANDS_DEF = [
  [20, 80],
  [80, 250],
  [250, 500],
  [500, 2000],
  [2000, 8000],
  [8000, 20000],
];

// Extract PCM
console.log('Extracting PCM from IRISOUT.wav...');
const tmpPath = join(tmpdir(), `bench_audio_${Date.now()}.raw`);
execSync(`ffmpeg -y -i "${AUDIO_PATH}" -f f32le -ar ${SAMPLE_RATE} -ac 1 "${tmpPath}" 2>/dev/null`);
const raw = readFileSync(tmpPath);
try { unlinkSync(tmpPath); } catch {}

const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
console.log(`PCM samples: ${pcm.length} (${(pcm.length / SAMPLE_RATE).toFixed(1)}s)`);

const frameSamples = SAMPLE_RATE / FPS;
const totalFrames = Math.floor(pcm.length / frameSamples);
console.log(`Total frames: ${totalFrames} at ${FPS}fps`);

// ============================================
// Rust FFT Benchmark
// ============================================
console.log('\n--- Rust FFT (audio-native) ---');
const t0 = performance.now();
const rustResult = analyzeAudioFft(pcm, SAMPLE_RATE, FPS, BANDS_DEF);
const t1 = performance.now();
const rustTime = (t1 - t0) / 1000;
const rustRTF = rustTime / (pcm.length / SAMPLE_RATE);

console.log(`Rust time: ${rustTime.toFixed(3)}s`);
console.log(`Rust RTF: ${rustRTF.toFixed(4)}x (${(1/rustRTF).toFixed(1)}x real-time speed)`);
console.log(`Rust frames: ${rustResult.length}`);

// ============================================
// Rust Full Analysis Benchmark (with beat detection)
// ============================================
console.log('\n--- Rust Full Analysis (with beat) ---');
const t2 = performance.now();
const rustFullResult = analyzeAudioFull(pcm, SAMPLE_RATE, FPS, BANDS_DEF);
const t3 = performance.now();
const rustFullTime = (t3 - t2) / 1000;
const rustFullRTF = rustFullTime / (pcm.length / SAMPLE_RATE);

console.log(`Rust Full time: ${rustFullTime.toFixed(3)}s`);
console.log(`Rust Full RTF: ${rustFullRTF.toFixed(4)}x (${(1/rustFullRTF).toFixed(1)}x real-time speed)`);

// ============================================
// Node.js FFT Benchmark (Cooley-Tukey implementation)
// ============================================
console.log('\n--- Node.js FFT (Cooley-Tukey) ---');

function hanning(n, N) {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
}

function computeFFTMag(pcmSlice) {
  const N = FFT_SIZE;
  const real = new Float64Array(N);
  const imag = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    real[i] = (i < pcmSlice.length ? pcmSlice[i] : 0) * hanning(i, N);
  }
  
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < N; i++) {
    let bit = N >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let tmp = real[i]; real[i] = real[j]; real[j] = tmp;
      tmp = imag[i]; imag[i] = imag[j]; imag[j] = tmp;
    }
  }
  
  // FFT butterfly
  for (let len = 2; len <= N; len *= 2) {
    const halfLen = len / 2;
    const ang = -2 * Math.PI / len;
    const wre = Math.cos(ang);
    const wim = Math.sin(ang);
    for (let i = 0; i < N; i += len) {
      let ure = 1, uim = 0;
      for (let k = 0; k < halfLen; k++) {
        const tre = real[i + k + halfLen] * ure - imag[i + k + halfLen] * uim;
        const tim = real[i + k + halfLen] * uim + imag[i + k + halfLen] * ure;
        real[i + k + halfLen] = real[i + k] - tre;
        imag[i + k + halfLen] = imag[i + k] - tim;
        real[i + k] += tre;
        imag[i + k] += tim;
        const newUre = ure * wre - uim * wim;
        uim = ure * wim + uim * wre;
        ure = newUre;
      }
    }
  }
  
  const mag = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) {
    mag[i] = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]);
  }
  return mag;
}

function freqToBin(freq) {
  return Math.round((freq * FFT_SIZE) / SAMPLE_RATE);
}

const t4 = performance.now();

for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
  const centerSample = Math.round((frameIdx + 0.5) * frameSamples);
  const startSample = Math.max(0, centerSample - FFT_SIZE / 2);
  const slice = pcm.subarray(startSample, startSample + FFT_SIZE);
  const mag = computeFFTMag(slice);
  
  BANDS_DEF.map(([lo, hi]) => {
    const b0 = Math.max(0, freqToBin(lo));
    const b1 = Math.min(mag.length - 1, freqToBin(hi));
    if (b1 < b0) return 0;
    let sum = 0;
    for (let b = b0; b <= b1; b++) sum += mag[b] * mag[b];
    return Math.sqrt(sum / Math.max(1, b1 - b0 + 1));
  });
}

const t5 = performance.now();
const jsTime = (t5 - t4) / 1000;
const jsRTF = jsTime / (pcm.length / SAMPLE_RATE);

console.log(`Node.js time: ${jsTime.toFixed(3)}s`);
console.log(`Node.js RTF: ${jsRTF.toFixed(4)}x (${(1/jsRTF).toFixed(1)}x real-time speed)`);
console.log(`Node.js frames: ${totalFrames}`);

// ============================================
// Comparison
// ============================================
const speedup = jsTime / rustTime;
const audioDuration = pcm.length / SAMPLE_RATE;

console.log('\n========================================');
console.log('BENCHMARK RESULTS');
console.log('========================================');
console.log(`Audio duration:    ${audioDuration.toFixed(1)}s`);
console.log(`Total frames:      ${totalFrames}`);
console.log('');
console.log(`Rust FFT:          ${rustTime.toFixed(3)}s  (RTF: ${rustRTF.toFixed(4)}x, ${(1/rustRTF).toFixed(0)}x speed)`);
console.log(`Rust Full+Beat:    ${rustFullTime.toFixed(3)}s  (RTF: ${rustFullRTF.toFixed(4)}x, ${(1/rustFullRTF).toFixed(0)}x speed)`);
console.log(`Node.js FFT:       ${jsTime.toFixed(3)}s  (RTF: ${jsRTF.toFixed(4)}x, ${(1/jsRTF).toFixed(0)}x speed)`);
console.log('');
console.log(`🚀 Rust vs Node.js speedup: ${speedup.toFixed(1)}x faster`);
console.log('');

if (rustRTF < 0.1) {
  console.log('✅ RTF < 0.1 achieved!');
}
if (speedup >= 10) {
  console.log('✅ 10x speedup target met!');
} else {
  console.log(`⚠️  Speedup ${speedup.toFixed(1)}x (target: 10x) — debug build, release will be faster`);
}
