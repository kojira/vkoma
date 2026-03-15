# @vkoma/audio-native

Rust (napi-rs + rustfft) による高速FFT音声解析ライブラリ。

## ベンチマーク

IRISOUT.wav (149.3秒, 4480フレーム @ 30fps):

| 実装 | 処理時間 | RTF | 実時間比 |
|------|---------|-----|--------|
| Node.js (fft-js) | 4.812s | 0.032x | 31x速度 |
| **Rust (このパッケージ)** | **0.034s** | **0.0002x** | **4344x速度** |

**140倍の高速化**を達成。

## インストール

```bash
cd packages/audio-native
npm install
npm run build  # release build
```

## API

### `analyzeAudioFft(pcmData, sampleRate, fps, bands)`

PCMデータをFFT解析して各フレームのバンドエネルギーを返す。

- `pcmData`: Float32Array - モノラルPCMデータ (44100Hz)
- `sampleRate`: number - サンプルレート (例: 44100)
- `fps`: number - フレームレート (例: 30)
- `bands`: Array<[number, number]> - 周波数バンド定義 [[low, high], ...]
- 戻り値: `Array<Array<number>>` - フレームごとのバンドエネルギー (0-1に正規化)

### `analyzeAudioFull(pcmData, sampleRate, fps, bands)`

バンドエネルギー + RMS + ビート検出を含む完全解析。

- 戻り値: 各フレームが `[...bandEnergies, rms, beat(0|1), beatIntensity]`

## 使い方

```typescript
import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
// CJS require (napi-rs native module)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { analyzeAudioFft, analyzeAudioFull } = require('@vkoma/audio-native');

const SAMPLE_RATE = 44100;
const FPS = 30;
const bands = [
  [20, 80],     // sub bass
  [80, 250],    // bass
  [250, 500],   // low mid
  [500, 2000],  // mid
  [2000, 8000], // high mid
  [8000, 20000] // high
];

// PCM抽出 (ffmpeg)
const tmpPath = join(tmpdir(), 'audio.raw');
execSync(`ffmpeg -y -i audio.wav -f f32le -ar ${SAMPLE_RATE} -ac 1 "${tmpPath}" 2>/dev/null`);
const raw = readFileSync(tmpPath);
const pcm = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);

// FFT解析 (140x faster than fft-js!)
const frames = analyzeAudioFft(pcm, SAMPLE_RATE, FPS, bands);
console.log(`Analyzed ${frames.length} frames`);
console.log(`Frame 0 bands:`, frames[0]);  // [0.12, 0.87, 0.34, ...]

// フルアナリシス (beat detection付き)
const fullFrames = analyzeAudioFull(pcm, SAMPLE_RATE, FPS, bands);
const [band0, band1, band2, band3, band4, band5, rms, beat, beatIntensity] = fullFrames[0];
```

## ビルド

```bash
npm run build:debug  # 開発用 (速度は遅い)
npm run build        # リリース用 (最適化済み、LTO有効)
```

## Cargo.toml の最適化設定

```toml
[profile.release]
lto = true          # Link Time Optimization
codegen-units = 1   # 単一コードユニットで最適化
opt-level = 3       # 最大最適化
```
