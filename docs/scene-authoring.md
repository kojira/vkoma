# vKoma シーン作成ガイド

> AIがシーンコードを生成する際のリファレンス。  
> このドキュメントはAIへのプロンプトとして使用することを想定している。

---

## 設計方針

- **AIチャットファースト**: シーンコードはAIが自然言語の指示から自動生成する。ユーザーはコードを書かない。
- **パラメータは型スキーマで定義**: `params` オブジェクトで宣言したパラメータは、タイムラインGUIが自動的にスライダー/テキスト入力/セレクト等のUIを生成して外部から変更できる。
- **シーンは独立したTypeScriptファイル**: `scenes/SceneName.ts` として保存される。

---

## シーンコードの実行モデル

シーンファイルは Vite の HMR（Hot Module Replacement）で動的に読み込まれる。

```
ファイル保存 → Vite HMR → シーン再登録 → プレビュー自動更新
```

### renderの呼び出し

- `frame`: 現在のフレーム番号（0 から始まる整数）
- `duration`: シーンの総フレーム数
- `progress = frame / duration`: アニメーション進行率（**0.0 → 1.0**）
- `params`: GUIまたは `.with()` で指定されたパラメータ値
- `draw`: Canvas 2D 描画ヘルパー
- `state`: `setup()` から返した初期化データ（アセット等）

フレームレートはプロジェクト設定（デフォルト30fps）。`duration: params.duration(3, "s")` は秒指定で自動変換される。

---

## defineScene() API

```typescript
import { defineScene, params } from 'vkoma'

const TitleScene = defineScene({
  // パラメータスキーマ（GUIが自動生成される）
  params: {
    text:      params.string('Hello World'),
    font:      params.string('Noto Sans JP'),
    fontSize:  params.number(64, { min: 12, max: 200, step: 1 }),
    x:         params.number(960, { min: 0, max: 1920 }),
    y:         params.number(540, { min: 0, max: 1080 }),
    color:     params.color('#ffffff'),
    effect:    params.select('bounce', ['bounce', 'slide', 'zoom', 'fade']),
    duration:  params.duration(3, 's'),   // 秒指定
  },

  // レンダリング関数（毎フレーム呼ばれる）
  render: ({ frame, duration, params, draw }) => {
    const progress = frame / duration  // 0.0 → 1.0

    // エフェクト別アニメーション計算
    const y = applyEffect(params.effect, params.y, progress)

    draw.text(params.text, {
      x: params.x,
      y,
      font: params.font,
      fontSize: params.fontSize,
      color: params.color,
    })
  },
})

export default TitleScene
```

---

## パラメータ型一覧

| 型 | 関数 | GUI表示 | 用途 |
|---|---|---|---|
| 文字列 | `params.string(default)` | テキスト入力 | テキスト、フォント名等 |
| 数値 | `params.number(default, {min, max, step})` | スライダー | サイズ、座標、透明度等 |
| 色 | `params.color(default)` | カラーピッカー | 文字色、背景色等 |
| 選択肢 | `params.select(default, options[])` | ドロップダウン | エフェクト種類、アライメント等 |
| 時間 | `params.duration(default, unit?)` | 数値入力（秒/フレーム切替） | シーンの長さ |
| 座標 | `params.position(x, y)` | 画面上でドラッグ | 配置位置 |
| 真偽値 | `params.boolean(default)` | トグルスイッチ | 表示/非表示フラグ等 |
| 画像 | `params.image()` | ファイル選択 | ロゴ、背景画像等 |
| 動画 | `params.video()` | ファイル選択 | 背景動画等 |

---

## ライフサイクルフック

```typescript
const scene = defineScene({
  params: { ... },

  // 初期化（アセット読み込み等）- オプション
  setup: async ({ params, assets }) => {
    const img = await assets.load('logo.png')
    return { img }  // render の state として渡される
  },

  // 毎フレーム描画（必須）
  render: ({ frame, duration, params, draw, state }) => {
    // state.img でsetupの戻り値にアクセス可能
  },

  // クリーンアップ（オプション）
  cleanup: ({ state }) => {
    // リソース解放等
  },
})
```

---

## 基本エフェクト実装パターン

MVP（Phase 1）では `bounce`, `slide`, `zoom`, `fade` の4エフェクトをサポート。

```typescript
// エフェクト実装の参考パターン
function applyEffect(effect: string, baseY: number, progress: number): number {
  switch (effect) {
    case 'bounce':
      // バウンスイン: 上から落下してバウンド
      return baseY - (1 - easeOutBounce(progress)) * 200
    case 'slide':
      // スライドイン: 左から右へ
      return baseY  // x軸方向に適用する場合
    case 'zoom':
      // ズームイン: 小さくから大きく（scaleに適用）
      return baseY
    case 'fade':
      // フェードイン: opacity 0→1
      return baseY
    default:
      return baseY
  }
}

// よく使うイージング関数
function easeOutBounce(t: number): number {
  if (t < 1 / 2.75) return 7.5625 * t * t
  if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75
  if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375
  return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}
```

---

## drawヘルパー API

```typescript
// テキスト描画
draw.text(text: string, opts: {
  x: number
  y: number
  font: string
  fontSize: number
  color: string
  align?: 'left' | 'center' | 'right'
  baseline?: 'top' | 'middle' | 'bottom'
})

// 矩形
draw.rect(x, y, width, height, opts: { color: string, opacity?: number })

// 画像
draw.image(img: HTMLImageElement, x, y, width, height)

// グラデーション背景
draw.gradient(colors: string[], direction?: 'horizontal' | 'vertical')

// 透明度を一時的に変更
draw.withOpacity(opacity: number, fn: () => void)
```

---

## シーンファイルの命名規則

```
scenes/
├── TitleScene.ts       # パスカルケース + Scene suffix
├── BodyScene.ts
├── OutroScene.ts
└── LogoScene.ts
```

各ファイルは `export default SceneName` でデフォルトエクスポートすること。

---

## シーン生成時のAIへの指示例

```
「テキストが上からバウンスしながら落ちてくるタイトルシーンを作って。
フォント・サイズ・色・テキスト内容はGUIで変更できるようにして」

→ TitleScene.ts を生成、params に text/font/fontSize/color を定義
```

```
「背景が暖色系グラデーションで、中央にロゴ画像が表示されるシーンを作って。
ロゴはフェードインで2秒かけて表示される」

→ LogoBgScene.ts を生成、setup でアセット読み込み、render でフェード計算
```

---

## 注意事項

- `render` 関数は **副作用なしの純粋関数** として書くこと（同一フレームで複数回呼ばれることがある）
- アセット読み込みは必ず `setup()` で行い、`render()` 内で非同期処理を行わない
- `frame` は0から始まり `duration - 1` で終わる（`duration` フレーム目は存在しない）
- `progress = frame / duration` は **0.0 以上 1.0 未満** の値になる

---

## ビルトインパーツ

`vkoma/packages/core` が提供する4種のビルトインパーツ関数を使うと、Canvas APIを直接操作せずに主要な描画要素を簡単に追加できる。各パーツはアニメーションエフェクト・イージング・遅延をパラメータで制御できる。

---

### drawTextPart — テキスト描画

テキストをCanvasに描画する。フェード・スライド・ズーム・タイプライターエフェクトに対応。

```typescript
import { drawTextPart, type TextPartParams } from 'vkoma/packages/core/src/parts/TextPart'
```

**関数シグネチャ**

```typescript
function drawTextPart(
  ctx: CanvasRenderingContext2D,
  width: number,    // キャンバス幅（px）
  height: number,   // キャンバス高さ（px）
  time: number,     // 現在の再生時刻（秒）
  params: TextPartParams,
): void
```

**パラメータ一覧**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `text` | `string` | `'Hello World'` | 表示テキスト |
| `fontSize` | `number` | `64` | フォントサイズ（px） |
| `fontFamily` | `string` | `'Helvetica, Arial, sans-serif'` | フォントファミリー |
| `fontWeight` | `string \| number` | `'bold'` | フォントウェイト |
| `color` | `string` | `'#ffffff'` | テキスト色 |
| `x` | `number` | `0.5` | 横位置（0〜1 の正規化座標） |
| `y` | `number` | `0.5` | 縦位置（0〜1 の正規化座標） |
| `align` | `'left' \| 'center' \| 'right'` | `'center'` | テキスト揃え |
| `effect` | `TextEffect` | `'fade'` | アニメーションエフェクト（後述） |
| `easing` | `EasingType` | `'easeOut'` | イージング |
| `delay` | `number` | `0` | 登場遅延（秒） |
| `animDuration` | `number` | `0.5` | アニメーション時間（秒） |
| `shadow` | `boolean` | `false` | ドロップシャドウ有効 |
| `shadowColor` | `string` | `'rgba(0,0,0,0.5)'` | シャドウ色 |
| `shadowBlur` | `number` | `8` | シャドウぼかし半径 |
| `outline` | `boolean` | `false` | テキストアウトライン有効 |
| `outlineColor` | `string` | `'#000000'` | アウトライン色 |
| `outlineWidth` | `number` | `2` | アウトライン幅（px） |
| `opacity` | `number` | `1` | 基本透明度（0〜1） |

**TextEffect 一覧**

| 値 | 効果 |
|---|---|
| `'none'` | エフェクトなし（即時表示） |
| `'fade'` | フェードイン |
| `'slide-left'` | 左からスライドイン |
| `'slide-right'` | 右からスライドイン |
| `'slide-up'` | 下からスライドイン |
| `'slide-down'` | 上からスライドイン |
| `'zoom'` | 中央からズームイン |
| `'typewriter'` | 文字が左から順に出現 |

**使用例**

```typescript
import { drawTextPart } from 'vkoma/packages/core/src/parts/TextPart'

const TitleScene = defineScene({
  params: {
    title:    params.string('Hello World'),
    duration: params.duration(3, 's'),
  },
  render: ({ frame, duration, params, ctx, width, height }) => {
    const time = frame / 30  // 30fps換算の秒

    drawTextPart(ctx, width, height, time, {
      text:        params.title,
      fontSize:    80,
      color:       '#ffffff',
      x:           0.5,
      y:           0.5,
      effect:      'slide-up',
      animDuration: 0.6,
      shadow:      true,
    })
  },
})
```

---

### drawImagePart — 画像描画

画像をCanvasに描画する。アスペクト比調整（contain/cover/fill）とフェード・ズーム・スライドエフェクトに対応。

```typescript
import { drawImagePart, type ImagePartParams } from 'vkoma/packages/core/src/parts/ImagePart'
```

**関数シグネチャ**

```typescript
function drawImagePart(
  ctx: CanvasRenderingContext2D,
  params: ImagePartParams,
  time: number,           // 現在の再生時刻（秒）
  duration: number,       // シーンの総時間（秒）
  imageCache: Map<string, HTMLImageElement | ImageBitmap>,
): void
```

> `imageCache` は `setup()` で読み込んだ画像を `Map<src, image>` 形式で渡す。

**パラメータ一覧**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `src` | `string` | `''` | 画像パス（imageCache のキー） |
| `x` | `number` | `960` | 中心X座標（px） |
| `y` | `number` | `540` | 中心Y座標（px） |
| `width` | `number` | `400` | 描画幅（px） |
| `height` | `number` | `300` | 描画高さ（px） |
| `opacity` | `number` | `1.0` | 透明度（0〜1） |
| `fit` | `'contain' \| 'cover' \| 'fill' \| 'none'` | `'contain'` | アスペクト比の扱い |
| `anchorX` | `'left' \| 'center' \| 'right'` | `'center'` | X基準点 |
| `anchorY` | `'top' \| 'middle' \| 'bottom'` | `'middle'` | Y基準点 |
| `effect` | `ImageEffect` | `'none'` | アニメーションエフェクト |
| `easing` | `EasingType` | `'easeOut'` | イージング |
| `delay` | `number` | `0` | 登場遅延（秒） |
| `animDuration` | `number` | `0.5` | アニメーション時間（秒） |

**ImageEffect 一覧**

| 値 | 効果 |
|---|---|
| `'none'` | エフェクトなし |
| `'fade'` | フェードイン |
| `'zoom-in'` | 小さくからズームイン |
| `'zoom-out'` | 大きくからズームアウト |
| `'slide-left'` | 左からスライドイン |
| `'slide-right'` | 右からスライドイン |

**使用例**

```typescript
import { drawImagePart } from 'vkoma/packages/core/src/parts/ImagePart'

const LogoScene = defineScene({
  params: { duration: params.duration(3, 's') },
  setup: async ({ assets }) => {
    const logo = await assets.load('logo.png')
    return { logoCache: new Map([['logo.png', logo]]) }
  },
  render: ({ frame, params, ctx, state }) => {
    const time = frame / 30

    drawImagePart(ctx, {
      src:         'logo.png',
      x:           960,
      y:           540,
      width:       400,
      height:      200,
      fit:         'contain',
      effect:      'fade',
      animDuration: 1.0,
    }, time, params.duration, state.logoCache)
  },
})
```

---

### drawShapePart — 図形描画

矩形・円・楕円・ラインを描画する。角丸・塗り・ストロークに対応。

```typescript
import { drawShapePart, type ShapePartParams } from 'vkoma/packages/core/src/parts/ShapePart'
```

**関数シグネチャ**

```typescript
function drawShapePart(
  ctx: CanvasRenderingContext2D,
  params: ShapePartParams,
  time: number,      // 現在の再生時刻（秒）
  duration: number,  // シーンの総時間（秒）
): void
```

**パラメータ一覧**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `type` | `'rect' \| 'circle' \| 'ellipse' \| 'line'` | `'rect'` | 図形の種類 |
| `x` | `number` | `960` | 中心X座標（px） |
| `y` | `number` | `540` | 中心Y座標（px） |
| `width` | `number` | `200` | 幅（px） |
| `height` | `number` | `100` | 高さ（px） |
| `fill` | `string` | `'#6366f1'` | 塗り色（`'transparent'` で無効化） |
| `stroke` | `string` | `'transparent'` | ストローク色 |
| `strokeWidth` | `number` | `0` | ストローク幅（px） |
| `cornerRadius` | `number` | `0` | 角丸半径（rectのみ） |
| `opacity` | `number` | `1.0` | 透明度（0〜1） |
| `effect` | `ShapeEffect` | `'none'` | アニメーションエフェクト |
| `easing` | `EasingType` | `'easeOut'` | イージング |
| `delay` | `number` | `0` | 登場遅延（秒） |
| `animDuration` | `number` | `0.3` | アニメーション時間（秒） |

**ShapeEffect 一覧**

| 値 | 効果 |
|---|---|
| `'none'` | エフェクトなし |
| `'fade'` | フェードイン |
| `'scale'` | 中心からスケールイン |
| `'slide-left'` | 左からスライドイン |
| `'slide-right'` | 右からスライドイン |

**使用例**

```typescript
import { drawShapePart } from 'vkoma/packages/core/src/parts/ShapePart'

render: ({ frame, ctx }) => {
  const time = frame / 30

  // 角丸カード背景
  drawShapePart(ctx, {
    type:         'rect',
    x:            960,
    y:            540,
    width:        800,
    height:       120,
    fill:         '#1e293b',
    cornerRadius: 16,
    effect:       'scale',
    animDuration: 0.4,
  }, time, duration)

  // 区切りライン
  drawShapePart(ctx, {
    type:        'line',
    x:           960,
    y:           640,
    width:       700,
    height:      0,
    stroke:      '#6366f1',
    strokeWidth: 2,
    effect:      'fade',
    delay:       0.3,
  }, time, duration)
}
```

---

### drawBackgroundPart — 背景描画

ソリッド・線形グラデーション・放射グラデーション・画像の4種類の背景を描画する。オーバーレイの重ね合わせにも対応。

```typescript
import { drawBackgroundPart, type BackgroundPartParams } from 'vkoma/packages/core/src/parts/BackgroundPart'
```

**関数シグネチャ**

```typescript
function drawBackgroundPart(
  ctx: CanvasRenderingContext2D,
  params: BackgroundPartParams,
  time: number,      // 現在の再生時刻（秒）
  duration: number,  // シーンの総時間（秒）
  imageCache?: Map<string, HTMLImageElement | ImageBitmap>,
): void
```

**パラメータ一覧**

| パラメータ | 型 | デフォルト | 説明 |
|---|---|---|---|
| `type` | `'solid' \| 'gradient-linear' \| 'gradient-radial' \| 'image'` | `'solid'` | 背景の種類 |
| `color` | `string` | `'#111827'` | ソリッド色（type='solid' 時） |
| `gradientColors` | `string[]` | `['#1a1a2e', '#16213e', '#0f3460']` | グラデーション色配列（2色以上） |
| `gradientAngle` | `number` | `135` | グラデーション角度（度、線形のみ） |
| `imageSrc` | `string` | `''` | 画像パス（type='image' 時） |
| `imageFit` | `'cover' \| 'contain' \| 'fill'` | `'cover'` | 画像フィット方法 |
| `imageAlpha` | `number` | `1.0` | 画像透明度（0〜1） |
| `overlayColor` | `string` | `'#000000'` | オーバーレイ色 |
| `overlayAlpha` | `number` | `0.0` | オーバーレイ透明度（0で無効） |

**使用例**

```typescript
import { drawBackgroundPart } from 'vkoma/packages/core/src/parts/BackgroundPart'

render: ({ frame, ctx }) => {
  const time = frame / 30

  // 線形グラデーション背景
  drawBackgroundPart(ctx, {
    type:           'gradient-linear',
    gradientColors: ['#0f172a', '#1e1b4b', '#312e81'],
    gradientAngle:  135,
    overlayColor:   '#000000',
    overlayAlpha:   0.2,
  }, time, duration)

  // 放射グラデーション背景
  drawBackgroundPart(ctx, {
    type:           'gradient-radial',
    gradientColors: ['#7c3aed', '#1e1b4b'],
  }, time, duration)
}
```

---

## トランジション

シーンの登場・退場時にトランジション効果を適用できる。`applyTransitionIn` / `applyTransitionOut` を `render` 関数内で使用する。

```typescript
import {
  applyTransitionIn,
  applyTransitionOut,
  type TransitionType,
  type TransitionConfig,
} from 'vkoma/packages/core/src/utils/transition'
```

### TransitionType 一覧

| 値 | 効果 |
|---|---|
| `'none'` | トランジションなし |
| `'fade'` | フェード（黒を経由して切り替え） |
| `'crossfade'` | クロスフェード（前後シーンを重ねて切り替え） |
| `'slide-left'` | 左へスライドして退場 / 左から登場 |
| `'slide-right'` | 右へスライドして退場 / 右から登場 |
| `'slide-up'` | 上へスライドして退場 / 上から登場 |
| `'slide-down'` | 下へスライドして退場 / 下から登場 |
| `'wipe-left'` | 左からワイプイン |
| `'wipe-right'` | 右からワイプイン |
| `'iris-open'` | 円形に開いて登場 |
| `'iris-close'` | 円形に閉じて退場 |
| `'zoom-in'` | 拡大しながら登場 |
| `'zoom-out'` | 縮小しながら登場 |
| `'glitch'` | グリッチ効果で登場 |

### TransitionConfig

```typescript
interface TransitionConfig {
  type: TransitionType
  duration: number    // トランジション時間（秒）
  easing: EasingType  // イージング種別
  color?: string      // フェード等で使う色（省略時は '#000000'）
}
```

### applyTransitionIn — シーン登場

`progress` が 0→1 の間、指定されたトランジション効果でコンテンツを描画する。

```typescript
function applyTransitionIn(
  ctx: CanvasRenderingContext2D,
  progress: number,           // 0.0（登場開始）→ 1.0（登場完了）
  type: TransitionType,
  config: TransitionConfig,
  width: number,
  height: number,
  renderFn: () => void,       // 実際の描画処理
): void
```

### applyTransitionOut — シーン退場

`progress` が 0→1 の間、指定されたトランジション効果でコンテンツを退場させる。内部的には `applyTransitionIn(1 - progress, ...)` を呼び出す。

```typescript
function applyTransitionOut(
  ctx: CanvasRenderingContext2D,
  progress: number,           // 0.0（退場開始）→ 1.0（退場完了）
  type: TransitionType,
  config: TransitionConfig,
  width: number,
  height: number,
  renderFn: () => void,
): void
```

### renderCode 内でのトランジション使用例

```typescript
import { applyTransitionIn, applyTransitionOut } from 'vkoma/packages/core/src/utils/transition'
import { drawBackgroundPart } from 'vkoma/packages/core/src/parts/BackgroundPart'
import { drawTextPart } from 'vkoma/packages/core/src/parts/TextPart'

const TRANSITION_DURATION = 0.5  // 秒

render: ({ frame, duration, params, ctx, width, height }) => {
  const fps = 30
  const time = frame / fps
  const totalSec = duration / fps

  // 登場トランジション（最初の0.5秒）
  const inProgress = Math.min(1, time / TRANSITION_DURATION)

  // 退場トランジション（最後の0.5秒）
  const outStart = totalSec - TRANSITION_DURATION
  const outProgress = time > outStart
    ? Math.min(1, (time - outStart) / TRANSITION_DURATION)
    : 0

  const config = { type: 'fade' as const, duration: TRANSITION_DURATION, easing: 'easeInOut' as const }

  // 登場中はapplyTransitionIn、退場中はapplyTransitionOut
  const drawContent = () => {
    drawBackgroundPart(ctx, { type: 'solid', color: '#111827' }, time, totalSec)
    drawTextPart(ctx, width, height, time, {
      text:   params.title,
      effect: 'none',
    })
  }

  if (outProgress > 0) {
    applyTransitionOut(ctx, outProgress, 'fade', config, width, height, drawContent)
  } else {
    applyTransitionIn(ctx, inProgress, 'fade', config, width, height, drawContent)
  }
}
```

---

## ビルトインパーツ使用のベストプラクティス

### なぜビルトインパーツを使うべきか

- **一貫性**: 全パーツが共通のイージング・エフェクト設計を共有しているため、シーン間でアニメーションの見た目が統一される
- **再利用性**: 同一パーツ関数を複数のシーンで共有でき、スタイル変更を一か所に集約できる
- **型安全**: `TextPartParams` 等の型定義により、GUIがスキーマを自動認識してパラメータパネルを生成できる

### raw Canvas APIとの組み合わせ

ビルトインパーツが対応していない描画（カスタムパス、グラデーションテキスト等）は raw Canvas API と自由に組み合わせてよい。

```typescript
render: ({ frame, ctx, width, height }) => {
  const time = frame / 30

  // ビルトインパーツで背景を描画
  drawBackgroundPart(ctx, { type: 'solid', color: '#0f172a' }, time, duration / 30)

  // raw Canvas APIでカスタム描画
  ctx.save()
  ctx.strokeStyle = '#6366f1'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(200, height / 2)
  ctx.bezierCurveTo(400, 100, 600, 900, 800, height / 2)
  ctx.stroke()
  ctx.restore()

  // ビルトインパーツでテキストを重ねる
  drawTextPart(ctx, width, height, time, { text: 'vKoma', effect: 'fade' })
}
```

### アニメーション時の注意点

- **`time` は秒単位**: ビルトインパーツの `time` パラメータは秒数（`frame / fps`）で渡す。フレーム番号を直接渡さないこと
- **`delay` と `animDuration` の合計を意識**: `delay + animDuration` がシーンの `duration`（秒）以内に収まるようにする
- **`progress` と `time` の使い分け**: パーツ関数には `time`（秒）を渡す。`progress`（0〜1）は自前のアニメーション計算に使う
- **パーツは描画順が前面になる**: `drawBackgroundPart` → `drawShapePart` → `drawImagePart` → `drawTextPart` の順で呼ぶと自然なレイヤー構造になる
- **`ctx.save()` / `ctx.restore()` の対称性**: ビルトインパーツ内部では `ctx.save()/restore()` が保証されているが、パーツ呼び出し前後で状態が変わることに注意し、カスタム描画前後は自前で `save/restore` すること
