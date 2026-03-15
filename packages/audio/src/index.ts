import { execSync } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
// @ts-ignore
import fftjs from "fft-js";

export interface FreqBand {
  name: string;
  freq: [number, number];
}

export interface AudioAnalyzerOptions {
  bands: number | FreqBand[];
  freqRange?: [number, number];
  fps: number;
}

export interface FrameData {
  bands: number[];
  bandMap: Record<string, number>;
  beat: boolean;
  beatIntensity: number;
  rms: number;
}

const SAMPLE_RATE = 44100;
const FFT_SIZE = 2048;

function hanning(n: number, N: number): number {
  return 0.5 * (1 - Math.cos((2 * Math.PI * n) / (N - 1)));
}

function buildBands(bandsOpt: number | FreqBand[], freqRange: [number, number]): FreqBand[] {
  if (Array.isArray(bandsOpt)) return bandsOpt;
  const N = bandsOpt as number;
  const [fMin, fMax] = freqRange;
  const logMin = Math.log10(Math.max(fMin, 1));
  const logMax = Math.log10(fMax);
  const bands: FreqBand[] = [];
  for (let i = 0; i < N; i++) {
    const f0 = Math.pow(10, logMin + (logMax - logMin) * (i / N));
    const f1 = Math.pow(10, logMin + (logMax - logMin) * ((i + 1) / N));
    bands.push({ name: `band_${i}`, freq: [f0, f1] });
  }
  return bands;
}

function freqToBin(freq: number): number {
  return Math.round((freq * FFT_SIZE) / SAMPLE_RATE);
}

export function createAudioAnalyzer(
  audioPath: string,
  options: AudioAnalyzerOptions
): {
  getFrame: (frameIndex: number) => FrameData;
  totalFrames: number;
  bpm: number;
} {
  const { fps } = options;
  const freqRange = options.freqRange ?? [20, 20000];
  const bands = buildBands(options.bands, freqRange);

  // Extract PCM via ffmpeg (synchronous)
  const tmpPath = path.join(tmpdir(), `vkoma_audio_${Date.now()}.raw`);
  try {
    execSync(
      `ffmpeg -y -i "${audioPath}" -f f32le -ar ${SAMPLE_RATE} -ac 1 "${tmpPath}" 2>/dev/null`,
      { stdio: "pipe" }
    );
  } catch (e) {
    // retry without 2>/dev/null redirect
    execSync(`ffmpeg -y -i "${audioPath}" -f f32le -ar ${SAMPLE_RATE} -ac 1 "${tmpPath}"`);
  }

  const raw = readFileSync(tmpPath);
  try { unlinkSync(tmpPath); } catch {}

  const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const totalSamples = pcm.length;
  const frameSamples = SAMPLE_RATE / fps;
  const totalFrames = Math.floor(totalSamples / frameSamples);

  // Pre-compute all frames
  const frameCache: FrameData[] = [];

  // First pass: compute FFT and raw energies
  const rawBandEnergies: number[][] = []; // [frame][band]
  const lowFreqEnergies: number[] = [];
  const rmsValues: number[] = [];

  const lowBin0 = freqToBin(20);
  const lowBin1 = freqToBin(150);

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    const centerSample = Math.round((frameIdx + 0.5) * frameSamples);
    const startSample = Math.max(0, centerSample - FFT_SIZE / 2);

    // Build windowed FFT input
    const phasors: [number, number][] = [];
    for (let i = 0; i < FFT_SIZE; i++) {
      const sampleIdx = startSample + i;
      const sample = sampleIdx < totalSamples ? pcm[sampleIdx] : 0;
      const windowed = sample * hanning(i, FFT_SIZE);
      phasors.push([windowed, 0]);
    }

    // Run FFT
    const result = fftjs.fft(phasors);
    const magnitudes = fftjs.util.fftMag(result);

    // Compute RMS
    let rmsSum = 0;
    for (let i = 0; i < FFT_SIZE / 2; i++) rmsSum += magnitudes[i] * magnitudes[i];
    rmsValues.push(Math.sqrt(rmsSum / (FFT_SIZE / 2)));

    // Compute low-freq energy for beat detection
    let lowSum = 0;
    for (let b = lowBin0; b <= Math.min(lowBin1, magnitudes.length - 1); b++) {
      lowSum += magnitudes[b] * magnitudes[b];
    }
    lowFreqEnergies.push(Math.sqrt(lowSum / Math.max(1, lowBin1 - lowBin0 + 1)));

    // Compute per-band energy
    const bandEnergies: number[] = [];
    for (const band of bands) {
      const b0 = Math.max(0, freqToBin(band.freq[0]));
      const b1 = Math.min(magnitudes.length - 1, freqToBin(band.freq[1]));
      if (b1 < b0) {
        bandEnergies.push(0);
        continue;
      }
      let sum = 0;
      for (let b = b0; b <= b1; b++) sum += magnitudes[b] * magnitudes[b];
      bandEnergies.push(Math.sqrt(sum / Math.max(1, b1 - b0 + 1)));
    }
    rawBandEnergies.push(bandEnergies);
  }

  // Normalize energies to 0-1
  const maxBandEnergy: number[] = new Array(bands.length).fill(0);
  for (const frame of rawBandEnergies) {
    for (let b = 0; b < bands.length; b++) {
      if (frame[b] > maxBandEnergy[b]) maxBandEnergy[b] = frame[b];
    }
  }
  const maxRms = Math.max(...rmsValues, 1e-10);
  const maxLow = Math.max(...lowFreqEnergies, 1e-10);

  // Beat detection with rolling window
  const windowFrames = Math.round(fps * 1.0); // 1 second window
  let beatIntensity = 0;

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    // Rolling average of low freq energy
    const wStart = Math.max(0, frameIdx - windowFrames);
    let wSum = 0;
    for (let i = wStart; i < frameIdx; i++) wSum += lowFreqEnergies[i];
    const wAvg = (frameIdx - wStart) > 0 ? wSum / (frameIdx - wStart) : lowFreqEnergies[frameIdx];

    const beat = lowFreqEnergies[frameIdx] > Math.max(1.5 * wAvg, maxLow * 0.1);
    if (beat) {
      beatIntensity = 1.0;
    } else {
      beatIntensity *= 0.85;
    }

    const normalizedBands = rawBandEnergies[frameIdx].map((e, b) =>
      maxBandEnergy[b] > 0 ? Math.min(1, e / maxBandEnergy[b]) : 0
    );

    const bandMap: Record<string, number> = {};
    for (let b = 0; b < bands.length; b++) {
      bandMap[bands[b].name] = normalizedBands[b];
    }

    frameCache.push({
      bands: normalizedBands,
      bandMap,
      beat,
      beatIntensity,
      rms: rmsValues[frameIdx] / maxRms,
    });
  }

  // Estimate BPM from beat intervals
  const beatFrames = frameCache
    .map((f, i) => (f.beat ? i : -1))
    .filter((i) => i >= 0);

  let bpm = 120;
  if (beatFrames.length >= 2) {
    const intervals: number[] = [];
    for (let i = 1; i < Math.min(beatFrames.length, 30); i++) {
      const intervalSec = (beatFrames[i] - beatFrames[i - 1]) / fps;
      if (intervalSec > 0.2 && intervalSec < 2.0) intervals.push(intervalSec);
    }
    if (intervals.length > 0) {
      intervals.sort((a, b) => a - b);
      let estimatedBpm = 60 / intervals[Math.floor(intervals.length / 2)];
      while (estimatedBpm < 60) estimatedBpm *= 2;
      while (estimatedBpm > 200) estimatedBpm /= 2;
      bpm = Math.round(estimatedBpm);
    }
  }

  const emptyFrame: FrameData = {
    bands: new Array(bands.length).fill(0),
    bandMap: Object.fromEntries(bands.map((b) => [b.name, 0])),
    beat: false,
    beatIntensity: 0,
    rms: 0,
  };

  return {
    getFrame: (frameIndex: number): FrameData => {
      if (frameIndex < 0 || frameIndex >= frameCache.length) return emptyFrame;
      return frameCache[frameIndex];
    },
    totalFrames,
    bpm,
  };
}
