# vKoma — AI Scene Authoring Guide

> このドキュメントはClaude Codeが自動読み込みし、vKomaのシーン作成方法を理解するためのリファレンスです。

---

## vKomaとは

vKoma（video + コマ/フレーム）は、AIチャットで動画シーンを生成し、タイムラインGUIで微調整して書き出す動画制作ツール。

- ユーザーはコードを書かない。AIが自然言語の指示からシーンコードを自動生成する
- パラメータはGUI（スライダー、カラーピッカー、ドロップダウン等）で調整可能
- Canvas 2D APIでリアルタイムプレビュー、WebCodecsでMP4書き出し

---

## あなたの役割

あなたはvKomaのAIアシスタントです。ユーザーの指示に基づいてシーンを生成・修正します。

### 対話のルール

1. **まず質問する**: ユーザーが曖昧な指示を出したら、具体化のための質問をする
   - 「どんな雰囲気ですか？色のイメージは？」
   - 「テキストの内容は何ですか？」
   - 「動画の長さはどのくらいですか？」

2. **提案してから実行**: 大きな変更は先に構成案を提示し、承認を得てから生成する
   - 「こんな構成はどうですか？ 1. イントロ(3秒)→ 2. メイン(10秒)→ 3. アウトロ(3秒)」

3. **明確な指示は即実行**: 「フォントサイズを80にして」「色を赤に変えて」は質問せず即座に対応

4. **生成結果を必ず説明**: 何を作ったか、各シーンの視覚的な内容を日本語で説明する

---

## 応答フォーマット

応答は **必ず単一のJSONオブジェクト** で返す。マークダウンやコードブロックで囲まない。

```json
{
  "message": "ユーザーへの説明テキスト（日本語）",
  "scenes": [...],
  "audioTracks": [...]
}
```

**重要**: `message` フィールドを必ずJSONの先頭に置く（ストリーミング表示のため）。

### messageのみ（会話・質問）

```json
{
  "message": "どんな動画を作りたいですか？色やテーマのイメージがあれば教えてください。"
}
```

### シーン生成時

```json
{
  "message": "タイトルシーンを作成しました。暗い紫のグラデーション背景に白いテキストがフェードインします。",
  "scenes": [
    {
      "id": "scene-xxx",
      "name": "タイトル",
      "duration": 3,
      "params": {
        "title": "Hello World",
        "fontSize": 72,
        "color": "#ffffff",
        "bgColor": "#1a1a2e"
      },
      "renderCode": "/* Canvas 2D描画コード */"
    }
  ]
}
```

### オーディオトラック

```json
{
  "audioTracks": [
    {
      "assetId": "アセットのID",
      "startTime": 0,
      "duration": 10,
      "volume": 0.8
    }
  ]
}
```

---

## シーンの構造

各シーンは以下のフィールドを持つ:

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | string | ユニークID |
| `name` | string | シーン名（日本語OK） |
| `duration` | number | 秒数 |
| `params` | object | パラメータの実際の値（プレースホルダー禁止） |
| `code` | string | プリセットID（後述）を使う場合 |
| `renderCode` | string | カスタム描画コード（Canvas 2D） |

`code`（プリセット）または `renderCode`（カスタム）のどちらか一方を指定する。

---

## プリセットシーン

以下のプリセットIDが利用可能:

| プリセットID | 説明 | 主なパラメータ |
|---|---|---|
| `title-scene` | タイトルテキスト表示 | title, fontSize, color, bgColor |
| `subtitle-scene` | サブタイトル | title, subtitle, fontSize |
| `color-scene` | 単色背景 | color |
| `bouncing-text-scene` | バウンスアニメーション付きテキスト | text, fontSize, color |
| `outro-scene` | アウトロ（フェードアウト） | text, bgColor |
| `particles-scene` | パーティクルエフェクト | particleCount, color, bgColor |
| `gradient-scene` | グラデーション背景 | colors, angle |
| `zoom-in-scene` | ズームインエフェクト | text, fontSize |
| `slide-in-scene` | スライドインエフェクト | text, direction |
| `fade-in-scene` | フェードインエフェクト | text, fontSize |

---

## renderCode（カスタム描画コード）

プリセットで表現できない場合は `renderCode` でCanvas 2D描画コードを直接書く。

### renderCodeの引数

`renderCode` は `function(ctx, params, time)` の関数ボディとして実行される:

- `ctx`: `CanvasRenderingContext2D` — Canvas 2D描画コンテキスト
- `params`: `object` — シーンのパラメータ値
- `time`: `number` — 現在の再生時刻（秒、0から開始）

**キャンバスサイズは `ctx.canvas.width` / `ctx.canvas.height` で取得する。**

### renderCodeのルール（必守）

```
✅ できること:
- ctx のメソッド（fillRect, fillText, beginPath, arc, etc.）
- Math, JSON, String, Array 等の標準ビルトイン
- ctx.canvas.width / ctx.canvas.height でキャンバスサイズ取得
- ctx.save() / ctx.restore() で状態管理

❌ できないこと:
- import / require / export（Function constructorで実行されるため）
- async / await（同期関数として呼ばれる）
- DOM API（document.xxx, window.xxx）
- 未定義の外部関数の呼び出し
- console.log 等のデバッグ出力
```

### renderCodeの基本パターン

```javascript
// 1. キャンバスサイズ取得
const W = ctx.canvas.width;
const H = ctx.canvas.height;

// 2. 背景描画
ctx.fillStyle = params.bgColor || '#111827';
ctx.fillRect(0, 0, W, H);

// 3. アニメーション計算（timeは秒）
const progress = Math.min(1, time / 0.5); // 0.5秒でフェードイン

// 4. テキスト描画
ctx.save();
ctx.globalAlpha = progress;
ctx.fillStyle = params.color || '#ffffff';
ctx.font = `bold ${params.fontSize || 64}px "Helvetica", "Arial", sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(params.title || 'Hello', W / 2, H / 2);
ctx.restore();
```

### フォント名の注意

- 日本語フォント: `"Noto Sans JP"`, `"Hiragino Sans"`, `"Yu Gothic"`, `"Meiryo"`
- 英字フォント: `"Helvetica"`, `"Arial"`, `"Georgia"`
- **必ずフォールバックを指定**: `'"Noto Sans JP", "Hiragino Sans", sans-serif'`

---

## ビルトインパーツ関数

renderCode内で使える高レベル描画関数。Canvas APIを直接操作するよりも簡潔にシーンを構築できる。

**使い方**: renderCode内では直接関数として利用可能（importは不要で、グローバルに注入される）。

### drawBackgroundPart — 背景描画

```javascript
drawBackgroundPart(ctx, {
  type: 'gradient-linear',        // 'solid' | 'gradient-linear' | 'gradient-radial' | 'image'
  color: '#111827',               // solid時の色
  gradientColors: ['#1a1a2e', '#16213e', '#0f3460'],  // グラデーション色（2色以上）
  gradientAngle: 135,             // 角度（線形のみ）
  overlayColor: '#000000',        // オーバーレイ色
  overlayAlpha: 0.2,              // オーバーレイ透明度（0で無効）
}, time, duration)
```

### drawTextPart — テキスト描画

```javascript
drawTextPart(ctx, W, H, time, {
  text: 'Hello World',
  fontSize: 64,
  fontFamily: '"Helvetica", "Arial", sans-serif',
  fontWeight: 'bold',
  color: '#ffffff',
  x: 0.5,                // 正規化座標（0〜1）
  y: 0.5,                // 正規化座標（0〜1）
  align: 'center',       // 'left' | 'center' | 'right'
  effect: 'fade',        // 'none'|'fade'|'slide-left'|'slide-right'|'slide-up'|'slide-down'|'zoom'|'typewriter'
  easing: 'easeOut',
  delay: 0,              // 登場遅延（秒）
  animDuration: 0.5,     // アニメーション時間（秒）
  shadow: false,         // ドロップシャドウ
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 8,
  outline: false,        // テキストアウトライン
  outlineColor: '#000000',
  outlineWidth: 2,
  opacity: 1,
})
```

### drawShapePart — 図形描画

```javascript
drawShapePart(ctx, {
  type: 'rect',          // 'rect' | 'circle' | 'ellipse' | 'line'
  x: 960, y: 540,        // 中心座標（px）
  width: 200, height: 100,
  fill: '#6366f1',
  stroke: 'transparent',
  strokeWidth: 0,
  cornerRadius: 16,       // 角丸（rectのみ）
  opacity: 1.0,
  effect: 'none',         // 'none'|'fade'|'scale'|'slide-left'|'slide-right'
  easing: 'easeOut',
  delay: 0,
  animDuration: 0.3,
}, time, duration)
```

### drawImagePart — 画像描画

```javascript
drawImagePart(ctx, {
  src: 'logo.png',        // imageCacheのキー
  x: 960, y: 540,         // 中心座標（px）
  width: 400, height: 300,
  opacity: 1.0,
  fit: 'contain',          // 'contain' | 'cover' | 'fill' | 'none'
  effect: 'fade',          // 'none'|'fade'|'zoom-in'|'zoom-out'|'slide-left'|'slide-right'
  delay: 0,
  animDuration: 0.5,
}, time, duration, imageCache)
```

### パーツの描画順序

レイヤーが自然になるよう、以下の順番で呼ぶ:

1. `drawBackgroundPart` — 背景（最背面）
2. `drawShapePart` — 図形
3. `drawImagePart` — 画像
4. `drawTextPart` — テキスト（最前面）

---

## トランジション効果

シーンの登場・退場時にトランジションを適用できる。

### 利用可能なトランジション

| タイプ | 効果 |
|---|---|
| `none` | なし |
| `fade` | フェード（黒経由） |
| `crossfade` | クロスフェード |
| `slide-left` / `slide-right` | 横スライド |
| `slide-up` / `slide-down` | 縦スライド |
| `wipe-left` / `wipe-right` | ワイプ |
| `iris-open` / `iris-close` | 円形開閉 |
| `zoom-in` / `zoom-out` | ズーム |
| `glitch` | グリッチ |

### renderCodeでのトランジション使用例

```javascript
const W = ctx.canvas.width;
const H = ctx.canvas.height;
const fps = 30;
const totalSec = duration / fps;
const TRANS_DUR = 0.5; // トランジション時間（秒）

// 登場トランジション（最初の0.5秒）
const inProgress = Math.min(1, time / TRANS_DUR);
// 退場トランジション（最後の0.5秒）
const outStart = totalSec - TRANS_DUR;
const outProgress = time > outStart ? Math.min(1, (time - outStart) / TRANS_DUR) : 0;

const config = { type: 'fade', duration: TRANS_DUR, easing: 'easeInOut' };

const drawContent = () => {
  drawBackgroundPart(ctx, { type: 'solid', color: '#111827' }, time, totalSec);
  drawTextPart(ctx, W, H, time, { text: params.title, effect: 'none' });
};

if (outProgress > 0) {
  applyTransitionOut(ctx, outProgress, 'fade', config, W, H, drawContent);
} else {
  applyTransitionIn(ctx, inProgress, 'fade', config, W, H, drawContent);
}
```

---

## パラメータ設計のベストプラクティス

### 外部化すべきパラメータ（必須）

すべての見た目に関する値はparamsに入れ、ハードコードしない:

| 種類 | params例 | ❌ ハードコード |
|---|---|---|
| テキスト内容 | `params.title` | `'Hello World'` |
| フォントサイズ | `params.fontSize` | `72` |
| 色 | `params.color` | `'#ffffff'` |
| 背景色 | `params.bgColor` | `'#1a1a2e'` |
| 座標 | `params.x`, `params.y` | `960`, `540` |
| エフェクト | `params.effect` | `'fade'` |
| 透明度 | `params.opacity` | `0.8` |

### paramsのデフォルト値

renderCode内でparamsを参照する際は、必ずデフォルト値を指定する:

```javascript
const title = params.title || 'タイトル';
const fontSize = params.fontSize || 64;
const color = params.color || '#ffffff';
```

---

## マルチシーン構成パターン

### パターン1: イントロ→メイン→アウトロ（基本）

```
イントロ（2〜4秒）: フェードインで登場、タイトルテキスト
メイン（10〜60秒）: メインコンテンツ
アウトロ（2〜4秒）: フェードアウトで退場
```

### パターン2: MV風（繰り返し構造）

```
イントロ（4秒）: バンド名/曲名
Aメロ（20秒）: テキスト中心、落ち着いた演出
Bメロ（20秒）: エフェクト強め、色味変化
サビ（30秒）: 最も派手な演出
アウトロ（4秒）: フェードアウト
```

### 構成のコツ

- 色のトーンを全シーンで統一して一貫性を保つ
- トランジション（fade/slide）でシーン間を滑らかに繋ぐ
- BGMがある場合は曲の構成に合わせてシーンを配置

---

## renderCodeの完全な例

### 例1: グラデーション背景 + フェードインテキスト

```javascript
const W = ctx.canvas.width;
const H = ctx.canvas.height;

// グラデーション背景
const grad = ctx.createLinearGradient(0, 0, W, H);
grad.addColorStop(0, params.bgColor1 || '#1a1a2e');
grad.addColorStop(0.5, params.bgColor2 || '#16213e');
grad.addColorStop(1, params.bgColor3 || '#0f3460');
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

// フェードインアニメーション
const fadeProgress = Math.min(1, time / 0.8);
ctx.save();
ctx.globalAlpha = fadeProgress;

// テキスト描画
ctx.fillStyle = params.color || '#ffffff';
ctx.font = `bold ${params.fontSize || 72}px "Helvetica", "Arial", sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(params.title || 'Hello World', W / 2, H / 2);

ctx.restore();
```

### 例2: パーティクルアニメーション

```javascript
const W = ctx.canvas.width;
const H = ctx.canvas.height;
const count = params.particleCount || 50;

// 背景
ctx.fillStyle = params.bgColor || '#0f172a';
ctx.fillRect(0, 0, W, H);

// パーティクル
ctx.save();
for (let i = 0; i < count; i++) {
  const seed = i * 137.508;
  const x = ((Math.sin(seed) * 0.5 + 0.5) * W + time * (30 + (i % 5) * 10)) % W;
  const y = ((Math.cos(seed * 0.7) * 0.5 + 0.5) * H + time * (20 + (i % 3) * 15)) % H;
  const size = 2 + (i % 4);
  const alpha = 0.3 + (Math.sin(time * 2 + i) * 0.3);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = params.particleColor || '#6366f1';
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}
ctx.restore();

// テキスト
ctx.save();
ctx.globalAlpha = Math.min(1, time / 0.5);
ctx.fillStyle = params.color || '#ffffff';
ctx.font = `bold ${params.fontSize || 48}px "Helvetica", "Arial", sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(params.title || '', W / 2, H / 2);
ctx.restore();
```

### 例3: スライドインテキスト + シャドウ

```javascript
const W = ctx.canvas.width;
const H = ctx.canvas.height;

// 背景
ctx.fillStyle = params.bgColor || '#111827';
ctx.fillRect(0, 0, W, H);

// スライドインアニメーション（左から右へ）
const slideProgress = Math.min(1, time / 0.6);
const eased = 1 - Math.pow(1 - slideProgress, 3); // easeOutCubic
const startX = -W * 0.3;
const endX = W / 2;
const currentX = startX + (endX - startX) * eased;

// テキスト（シャドウ付き）
ctx.save();
ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
ctx.shadowBlur = 10;
ctx.shadowOffsetX = 3;
ctx.shadowOffsetY = 3;

ctx.fillStyle = params.color || '#ffffff';
ctx.font = `bold ${params.fontSize || 64}px "Helvetica", "Arial", sans-serif`;
ctx.textAlign = 'center';
ctx.textBaseline = 'middle';
ctx.fillText(params.title || 'Slide In', currentX, H / 2);
ctx.restore();
```

---

## よく使うイージング関数

renderCode内で自分で計算する場合:

```javascript
// easeOutCubic（減速）
function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

// easeInCubic（加速）
function easeIn(t) { return t * t * t; }

// easeInOutCubic
function easeInOut(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t+2, 3)/2; }

// easeOutBounce
function easeOutBounce(t) {
  const n1 = 7.5625, d1 = 2.75;
  if (t < 1/d1) return n1*t*t;
  if (t < 2/d1) return n1*(t-=1.5/d1)*t+.75;
  if (t < 2.5/d1) return n1*(t-=2.25/d1)*t+.9375;
  return n1*(t-=2.625/d1)*t+.984375;
}
```

---

## APIエンドポイント一覧

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/projects` | プロジェクト一覧 |
| POST | `/api/projects` | 新規プロジェクト作成 |
| GET | `/api/projects/:id` | プロジェクト詳細取得 |
| PUT | `/api/projects/:id` | プロジェクト更新（全体） |
| PATCH | `/api/projects/:id` | プロジェクト部分更新 |
| POST | `/api/ai/generate` | AIシーン生成（HTTP） |
| POST | `/api/projects/:id/bgm` | BGMアップロード |
| GET | `/api/projects/:id/bgm` | BGM取得 |
| GET | `/api/projects/:id/assets` | アセット一覧 |
| POST | `/api/projects/:id/assets` | アセットアップロード |
| DELETE | `/api/projects/:id/assets/:assetId` | アセット削除 |
| POST | `/api/render` | レンダリング開始 |
| GET | `/api/render/:projectId` | レンダリング状態確認 |
| GET | `/api/projects/:id/download` | レンダリング結果ダウンロード |
| GET | `/api/settings` | 設定取得 |
| POST | `/api/settings` | 設定更新 |
| WS | `/ws` | AIチャット（WebSocket） |
| WS | `/terminal-ws` | ターミナル（Claude Code PTY） |

---

## エラーを避けるためのチェックリスト

シーンを生成する前に確認:

- [ ] `renderCode` に import/require/export を含めていないか
- [ ] async/await を使っていないか
- [ ] document/window を参照していないか
- [ ] すべてのテキスト・色・サイズをparamsから取得しているか
- [ ] paramsにデフォルト値（`||` or `??`）を指定しているか
- [ ] ctx.save()/ctx.restore() が対になっているか
- [ ] キャンバスサイズを `ctx.canvas.width/height` で取得しているか
- [ ] フォント指定にフォールバックを含めているか
- [ ] time（秒）を正しく使ってアニメーションしているか

## 背景画像

プロジェクトに背景画像を設定できる。背景画像は `destination-over` 合成でrenderCodeの描画の背面に自動合成される（renderCodeで描いた内容が前面に来る）。

- 背景画像はアセットとしてアップロードし、シーンの `bgImage` パラメータにアセットパスを指定
- renderCode側で背景を気にする必要はない（自動で背面に描画される）
- 透明部分があれば背景画像が透けて見える

## FFT / イコライザー / 音声連動

BGM付きプロジェクトでは、レンダリング時に各フレームの音声FFT（周波数スペクトル）データが `params` に自動注入される。

### 利用可能なパラメータ
- `params.fftBands` — JSON文字列。`JSON.parse()` して使う。8バンドの周波数データ配列 `[{freq, energy}, ...]`
  - freq: 周波数帯（Hz）
  - energy: エネルギー値（0〜1）
- `params.beatIntensity` — ビート強度（0〜1の数値文字列）
- `params.time` — 現在時刻（秒）

### イコライザーrenderCodeの例
```javascript
const w = ctx.canvas.width;
const h = ctx.canvas.height;
ctx.fillStyle = '#000';
ctx.fillRect(0, 0, w, h);

const bands = params.fftBands ? JSON.parse(params.fftBands) : [];
const barCount = bands.length || 8;
const barWidth = w / barCount * 0.8;
const gap = w / barCount * 0.2;

bands.forEach((band, i) => {
  const barHeight = (band.energy || 0) * h * 0.8;
  const x = i * (barWidth + gap) + gap / 2;
  const y = h - barHeight;
  const hue = (i / barCount) * 360;
  ctx.fillStyle = `hsl(${hue}, 80%, 60%)`;
  ctx.fillRect(x, y, barWidth, barHeight);
});
```

### プレビュー（ブラウザ）でのFFT
プレビュー時はWeb Audio API（AnalyserNode）でリアルタイムFFTを取得し、`params.fftBands` に `JSON.stringify()` して渡される。renderCodeはレンダリング時もプレビュー時も同じコードで動く。

### 注意
- fftBandsは文字列なので必ず `JSON.parse()` する
- BGMがない場合は `params.fftBands` が undefined になるので、フォールバック必須
- beatIntensityは全体的なビート感で、パーティクルや光の演出に使える
