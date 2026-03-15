import { spawn } from "node:child_process";

export interface AudioAnalysis {
  bpm: number;
  duration: number;
  beats: number[];
  kicks: number[];
}

export async function analyzeAudio(audioPath: string): Promise<AudioAnalysis> {
  const duration = await getAudioDuration(audioPath);
  const kicks = await detectKicks(audioPath, duration);
  const bpm = estimateBPM(kicks);
  const beats = generateBeatGrid(bpm, duration);
  return { bpm, duration, beats, kicks };
}

async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_format", audioPath]);
    let stdout = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error("ffprobe failed")); return; }
      try { resolve(parseFloat(JSON.parse(stdout).format?.duration || "0")); }
      catch { reject(new Error("Failed to parse ffprobe output")); }
    });
    proc.on("error", reject);
  });
}

async function detectKicks(audioPath: string, duration: number): Promise<number[]> {
  const sampleRate = 100;
  const pcmData = await extractLowFreqPCM(audioPath, sampleRate);
  return findEnergyPeaks(pcmData, sampleRate, duration);
}

async function extractLowFreqPCM(audioPath: string, sampleRate: number): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-i", audioPath, "-af", `lowpass=f=150,aresample=${sampleRate}`, "-ac", "1", "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1"]);
    const chunks: Buffer[] = [];
    proc.stdout.on("data", (d: Buffer) => { chunks.push(d); });
    let stderr = "";
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    proc.on("close", (code) => {
      if (code !== 0) { reject(new Error(`ffmpeg PCM extraction failed: ${stderr.slice(-200)}`)); return; }
      const raw = Buffer.concat(chunks);
      const samples = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
      resolve(samples);
    });
    proc.on("error", reject);
  });
}

function findEnergyPeaks(samples: Float32Array, sampleRate: number, duration: number): number[] {
  const n = samples.length;
  if (n === 0) return [];
  const windowSize = Math.floor(sampleRate * 0.05);
  const hopSize = Math.floor(sampleRate * 0.01);
  const energies: number[] = [];
  for (let i = 0; i + windowSize <= n; i += hopSize) {
    let sum = 0;
    for (let j = i; j < i + windowSize; j++) sum += samples[j] * samples[j];
    energies.push(Math.sqrt(sum / windowSize));
  }
  const meanEnergy = energies.reduce((a, b) => a + b, 0) / energies.length;
  const variance = energies.reduce((a, b) => a + (b - meanEnergy) ** 2, 0) / energies.length;
  const threshold = meanEnergy + 1.2 * Math.sqrt(variance);
  const minSpacingSamples = Math.floor(0.15 / (hopSize / sampleRate));
  const kicks: number[] = [];
  let lastPeakIdx = -minSpacingSamples;
  for (let i = 1; i < energies.length - 1; i++) {
    if (energies[i] > threshold && energies[i] >= energies[i - 1] && energies[i] >= energies[i + 1] && i - lastPeakIdx >= minSpacingSamples) {
      const timeSeconds = (i * hopSize) / sampleRate;
      if (timeSeconds <= duration) { kicks.push(timeSeconds); lastPeakIdx = i; }
    }
  }
  return kicks;
}

function estimateBPM(kicks: number[]): number {
  if (kicks.length < 2) return 120;
  const intervals: number[] = [];
  for (let i = 1; i < Math.min(kicks.length, 30); i++) {
    const interval = kicks[i] - kicks[i - 1];
    if (interval > 0.2 && interval < 2.0) intervals.push(interval);
  }
  if (intervals.length === 0) return 120;
  intervals.sort((a, b) => a - b);
  let bpm = 60 / intervals[Math.floor(intervals.length / 2)];
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm);
}

function generateBeatGrid(bpm: number, duration: number): number[] {
  const beatInterval = 60 / bpm;
  const beats: number[] = [];
  for (let t = 0; t < duration; t += beatInterval) beats.push(Math.round(t * 1000) / 1000);
  return beats;
}
