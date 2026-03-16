# vKoma 次世代アーキテクチャ設計書

> **Version:** 0.1.0-draft  
> **作成日:** 2026-03-16  
> **対象フェーズ:** Phase 2 移行設計

---

## 概要

本設計書は、現在の vKoma が抱える以下の5つの根本的な問題を解決するためのアーキテクチャ移行計画を定義する。

| # | 問題 | 影響 |
|---|---|---|
| 1 | AIが生成する `renderCode` にパラメータがハードコードされている | UIから値を変更できない |
| 2 | 標準テキストパーツがなく、AI が毎回 draw 関数を生成する | 品質のばらつき・プロンプト肥大化 |
| 3 | シーン間トランジションの概念がない | 繋ぎ目が唐突になる |
| 4 | タイムラインが1トラック・シリアル配列のみ | テロップ・オーバーレイが作れない |
| 5 | 画像・音声がタイムラインと独立している | アセットの時間的配置ができない |

---

## 1. 標準パーツ（Built-in Parts）設計

### 設計思想

「AIが毎回ゼロから draw 関数を生成する」のをやめ、**高品質な標準パーツを組み合わせる**モデルに移行する。

- AIの役割 → どのパーツをどのパラメータで配置するかを決定する
- 標準パーツ → プロが作った描画ロジックを内包し、パラメータだけ外部化する
- AIが draw 関数を生成するのは、標準パーツでは表現できない場合のみ（最終手段）

### 1.1 TextPart

テキスト表示の標準パーツ。現在の各シーン内にバラバラに実装されている `drawTextWithEmoji` を統一・強化したもの。

```typescript
// packages/core/src/parts/TextPart.ts

export interface TextPartParams {
  text: string;               // 表示テキスト（絵文字対応）
  fontSize: number;           // フォントサイズ (px)
  fontFamily: string;         // フォントファミリー
  fontWeight: string | number;// bold / 700 / etc.
  color: string;              // テキスト色 (#RRGGBB)
  x: number;                  // 中心X座標 (px)
  y: number;                  // 中心Y座標 (px)
  align: 'left' | 'center' | 'right';
  // --- アニメーション ---
  effect: 'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'
        | 'zoom' | 'bounce' | 'typewriter';
  easing: EasingType;        // 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'easeOutBounce'
  delay: number;             // アニメーション開始の遅延（秒）
  animDuration: number;      // アニメーション完了までの時間（秒）
  // --- 装飾 ---
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  outline: boolean;
  outlineColor: string;
  outlineWidth: number;
  opacity: number;           // 0.0 〜 1.0
}

export const textPartDefaultParams: TextPartParams = {
  text: 'Hello World',
  fontSize: 64,
  fontFamily: 'Helvetica, AppleSDGothicNeo, "Apple Color Emoji"',
  fontWeight: '700',
  color: '#ffffff',
  x: 960,
  y: 540,
  align: 'center',
  effect: 'fade',
  easing: 'easeOut',
  delay: 0,
  animDuration: 0.5,
  shadow: false,
  shadowColor: 'rgba(0,0,0,0.5)',
  shadowBlur: 8,
  outline: false,
  outlineColor: '#000000',
  outlineWidth: 2,
  opacity: 1.0,
};

export function drawTextPart(
  ctx: CanvasRenderingContext2D,
  params: TextPartParams,
  time: number,      // シーン内の再生時刻（秒）
  duration: number,  // シーン全体の尺（秒）
): void {
  // effectとeasingに基づいてtransform/opacityを計算してから描画
  const t = Math.max(0, time - params.delay);
  const progress = params.animDuration > 0
    ? Math.min(1, t / params.animDuration)
    : 1;
  const eased = applyEasing(progress, params.easing);

  ctx.save();
  ctx.globalAlpha = params.opacity * computeOpacity(params.effect, eased);

  const { tx, ty } = computeTranslate(params.effect, eased, params.x, params.y, ctx.canvas);
  ctx.translate(tx, ty);
  ctx.scale(...computeScale(params.effect, eased));

  if (params.shadow) {
    ctx.shadowColor = params.shadowColor;
    ctx.shadowBlur = params.shadowBlur;
  }
  if (params.outline) {
    ctx.strokeStyle = params.outlineColor;
    ctx.lineWidth = params.outlineWidth * 2;
    ctx.textAlign = params.align;
    ctx.textBaseline = 'middle';
    ctx.font = `${params.fontWeight} ${params.fontSize}px ${params.fontFamily}`;
    ctx.strokeText(params.text, 0, 0);
  }

  ctx.fillStyle = params.color;
  ctx.textAlign = params.align;
  ctx.textBaseline = 'middle';
  drawTextWithEmoji(ctx, params.text, 0, 0, params.fontWeight, params.fontSize, params.fontFamily);

  ctx.restore();
}
```

**UIで表示されるパラメータパネル（自動生成）:**

```
text:        [ Hello World              ]    ← テキスト入力
fontSize:    [──────●──────────────] 64     ← スライダー
fontFamily:  [ Helvetica ▼ ]                ← ドロップダウン
color:       [■] #ffffff                    ← カラーピッカー
effect:      [ fade ▼ ]                     ← ドロップダウン
easing:      [ easeOut ▼ ]                  ← ドロップダウン
opacity:     [──────────────●──────] 1.0   ← スライダー
shadow:      [○ OFF]                        ← トグル
```

### 1.2 ImagePart

画像表示の標準パーツ。

```typescript
// packages/core/src/parts/ImagePart.ts

export interface ImagePartParams {
  src: string;               // アセットID or URL
  x: number;                 // 配置X（px）
  y: number;                 // 配置Y（px）
  width: number;             // 表示幅（px）
  height: number;            // 表示高さ（px）
  opacity: number;           // 0.0 〜 1.0
  fit: 'contain' | 'cover' | 'fill' | 'none';
  anchorX: 'left' | 'center' | 'right';
  anchorY: 'top' | 'middle' | 'bottom';
  // --- アニメーション ---
  effect: 'none' | 'fade' | 'zoom-in' | 'zoom-out' | 'slide-left' | 'slide-right';
  easing: EasingType;
  delay: number;
  animDuration: number;
  // --- フィルター ---
  brightness: number;        // 0.0 〜 2.0
  contrast: number;          // 0.0 〜 2.0
  grayscale: number;         // 0.0 〜 1.0
  blur: number;              // ぼかし半径 (px)
}
```

### 1.3 ShapePart

基本図形の標準パーツ。

```typescript
// packages/core/src/parts/ShapePart.ts

export interface ShapePartParams {
  type: 'rect' | 'circle' | 'ellipse' | 'line' | 'polygon';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;              // 塗りつぶし色
  stroke: string;            // 枠線色
  strokeWidth: number;
  cornerRadius: number;      // rect のみ有効
  opacity: number;
  // --- アニメーション ---
  effect: 'none' | 'fade' | 'scale' | 'slide-left' | 'slide-right';
  easing: EasingType;
  delay: number;
  animDuration: number;
}
```

### 1.4 BackgroundPart

シーン背景の標準パーツ。現在各シーンで個別に実装されている背景描画を統一する。

```typescript
// packages/core/src/parts/BackgroundPart.ts

export interface BackgroundPartParams {
  type: 'solid' | 'gradient-linear' | 'gradient-radial' | 'image' | 'video';
  color: string;             // solid 用
  gradientColors: string[];  // グラデーション色配列
  gradientAngle: number;     // linear の角度（degree）
  imageSrc: string;          // image/video 用アセットID
  imageFit: 'cover' | 'contain' | 'fill';
  imageAlpha: number;        // 0.0 〜 1.0
  // --- トランジション用 ---
  overlayColor: string;
  overlayAlpha: number;
}
```

---

## 2. パラメータシステム改善

### 2.1 現状の問題

```typescript
// 現在（base.ts）
export type ParamType = "string" | "number" | "color" | "select" | "duration";

// 問題:
// - boolean 型がない（トグルUI が作れない）
// - select の options が string[] しかない（ラベルと値を分離できない）
// - font 型がない（フォント名を UI で選択できない）
// - easing 型がない（イージング選択が string 扱い）
// - position 型がない（x/y 座標のペアを一体で扱えない）
// - image/video 型がない（アセット選択 UI が作れない）
```

### 2.2 拡張 SceneParam 型定義

```typescript
// packages/core/src/params.ts

export type ParamType =
  | 'string'
  | 'number'
  | 'color'
  | 'select'
  | 'duration'
  // 新規追加
  | 'boolean'
  | 'font'
  | 'easing'
  | 'position'
  | 'image'
  | 'video'
  | 'audio';

export type EasingType =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'easeInQuad'
  | 'easeOutQuad'
  | 'easeInOutQuad'
  | 'easeInCubic'
  | 'easeOutCubic'
  | 'easeInOutCubic'
  | 'easeOutBounce'
  | 'easeOutElastic'
  | 'easeOutBack';

export interface SelectOption {
  value: string;
  label: string;     // 表示名（日本語可）
}

export interface SceneParam {
  type: ParamType;
  label: string;
  default: unknown;
  // number 用
  min?: number;
  max?: number;
  step?: number;
  // select 用
  options?: SelectOption[];
  // UI ヒント
  hidden?: boolean;            // UIに表示しない（内部パラメータ）
  group?: string;              // パラメータグループ名（パネルでセクション分け）
  description?: string;        // ツールチップ説明
}

// ファクトリ関数群（拡張版）
export const params = {
  string: (label: string, def: string, opts?: { description?: string; hidden?: boolean }): SceneParam =>
    ({ type: 'string', label, default: def, ...opts }),

  number: (label: string, def: number, opts?: { min?: number; max?: number; step?: number; description?: string }): SceneParam =>
    ({ type: 'number', label, default: def, ...opts }),

  color: (label: string, def: string): SceneParam =>
    ({ type: 'color', label, default: def }),

  select: (label: string, def: string, options: Array<string | SelectOption>): SceneParam => ({
    type: 'select',
    label,
    default: def,
    options: options.map(o =>
      typeof o === 'string' ? { value: o, label: o } : o
    ),
  }),

  duration: (label: string, def: number): SceneParam =>
    ({ type: 'duration', label, default: def }),

  // 新規追加
  boolean: (label: string, def: boolean): SceneParam =>
    ({ type: 'boolean', label, default: def }),

  font: (label: string, def: string): SceneParam =>
    ({ type: 'font', label, default: def }),

  easing: (label: string, def: EasingType): SceneParam =>
    ({ type: 'easing', label, default: def }),

  position: (label: string, defX: number, defY: number): SceneParam =>
    ({ type: 'position', label, default: { x: defX, y: defY } }),

  image: (label: string): SceneParam =>
    ({ type: 'image', label, default: '' }),

  video: (label: string): SceneParam =>
    ({ type: 'video', label, default: '' }),

  audio: (label: string): SceneParam =>
    ({ type: 'audio', label, default: '' }),
};
```

### 2.3 AI 生成シーンのパラメータ外部化規約

AIが `renderCode` を生成する際は、**必ず以下の規約に従う**。UIから変更可能な値をハードコードしてはならない。

**規約：`params` オブジェクトに依存するコードを生成する**

```typescript
// ✅ 良い例（AIが生成すべきコード）
// defaultParams で全パラメータを宣言し、renderCode では params から参照する
const defaultParams = {
  text: params.string('テキスト', 'こんにちは'),
  fontSize: params.number('フォントサイズ', 72, { min: 24, max: 120, step: 1 }),
  color: params.color('テキスト色', '#ffffff'),
  speed: params.number('速度', 1.0, { min: 0.1, max: 5, step: 0.1 }),
};

// renderCode（params が注入される）
function draw(ctx, params, time) {
  ctx.fillStyle = params.bgColor;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.font = `${params.fontWeight} ${params.fontSize}px sans-serif`;
  ctx.fillStyle = params.color;
  ctx.fillText(params.text, ctx.canvas.width / 2, ctx.canvas.height / 2);
}

// ❌ 悪い例（ハードコード）
function draw(ctx, params, time) {
  ctx.fillStyle = '#111827';           // ← UIから変えられない
  ctx.font = 'bold 72px Helvetica';   // ← UIから変えられない
  ctx.fillStyle = '#ffffff';
  ctx.fillText('こんにちは', 960, 540); // ← UIから変えられない
}
```

### 2.4 パラメータパネルの自動生成ルール

UI は `defaultParams` のスキーマを読んで、以下のルールでUIコンポーネントを自動生成する：

| type | UIコンポーネント | 備考 |
|---|---|---|
| `string` | `<input type="text">` | 文字列入力 |
| `number` | `<input type="range">` + 数値表示 | min/max/step を反映 |
| `color` | カラーピッカー | Chrome/Firefox ネイティブ |
| `select` | `<select>` ドロップダウン | options[].label を表示 |
| `duration` | 数値入力（秒/フレーム切替） | |
| `boolean` | トグルスイッチ | |
| `font` | フォントドロップダウン | system fonts 一覧 |
| `easing` | イージングドロップダウン + プレビュー曲線 | |
| `position` | プレビュー画面上でドラッグ | |
| `image` | アセット選択UI（ライブラリから） | |
| `video` | アセット選択UI（ライブラリから） | |
| `audio` | アセット選択UI（ライブラリから） | |

---

## 3. トランジション設計

### 3.1 トランジションの概念

シーンとシーンの境界に**トランジション**を挟むことで、映像的な繋ぎを実現する。

```
シーンA (0〜3s)  ──┐
                   ├── トランジション (0.5s 重複)
シーンB (2.5〜6s) ──┘
```

トランジション期間中は、シーンAの終端とシーンBの先端が**同時にレンダリング**され、合成される。

### 3.2 トランジション種類

```typescript
// packages/core/src/transition.ts

export type TransitionType =
  | 'none'
  | 'fade'          // クロスフェード
  | 'slide-left'    // 左からスライド
  | 'slide-right'   // 右からスライド
  | 'slide-up'      // 上からスライド
  | 'slide-down'    // 下からスライド
  | 'wipe-left'     // 左からワイプ
  | 'wipe-right'    // 右からワイプ
  | 'iris-open'     // 円形に開く
  | 'iris-close'    // 円形に閉じる
  | 'zoom-in'       // ズームイン
  | 'zoom-out'      // ズームアウト
  | 'flip'          // ページめくり風
  | 'glitch';       // グリッチエフェクト

export interface TransitionConfig {
  type: TransitionType;
  duration: number;          // トランジション尺（秒）
  easing: EasingType;
  // typeによって有効なオプション
  color?: string;            // fade のオーバーレイ色
  direction?: 'ltr' | 'rtl';
}
```

### 3.3 データモデル上の表現

トランジションは **TrackItem と TrackItem の間** に設定する。

```typescript
// TimelineItem にトランジション属性を追加
export interface TrackItem {
  id: string;
  startTime: number;         // 開始時刻（秒）
  duration: number;          // 尺（秒）
  sceneId?: string;          // SceneConfig.id（videoトラック）
  assetId?: string;          // Asset.id（audio/imageトラック）
  params: Record<string, unknown>;
  // トランジション（このアイテムへの IN トランジション）
  transitionIn?: TransitionConfig;
  // このアイテムからの OUT トランジション
  transitionOut?: TransitionConfig;
}
```

### 3.4 トランジションのレンダリング処理

```typescript
// packages/core/src/renderer.ts

export function renderFrameWithTransitions(
  tracks: Track[],
  globalTime: number,   // プロジェクト全体の再生位置（秒）
  canvas: OffscreenCanvas | HTMLCanvasElement,
): void {
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  
  // videoトラックを下から上の順に合成
  for (const track of tracks.filter(t => t.type === 'video').sort((a, b) => a.zOrder - b.zOrder)) {
    for (const item of track.items) {
      const itemTime = globalTime - item.startTime;
      if (itemTime < 0 || itemTime > item.duration) continue;
      
      // トランジションIN期間かどうか判定
      if (item.transitionIn && itemTime < item.transitionIn.duration) {
        const t = itemTime / item.transitionIn.duration;
        applyTransitionIn(ctx, item, track, t, item.transitionIn);
      }
      // トランジションOUT期間かどうか判定
      else if (item.transitionOut && itemTime > item.duration - item.transitionOut.duration) {
        const t = (item.duration - itemTime) / item.transitionOut.duration;
        applyTransitionOut(ctx, item, track, t, item.transitionOut);
      }
      else {
        // 通常レンダリング
        renderTrackItem(ctx, item, itemTime);
      }
    }
  }
}

function applyTransitionIn(
  ctx: CanvasRenderingContext2D,
  item: TrackItem,
  track: Track,
  progress: number,  // 0→1
  config: TransitionConfig,
): void {
  const eased = applyEasing(progress, config.easing);
  
  switch (config.type) {
    case 'fade':
      ctx.globalAlpha = eased;
      renderTrackItem(ctx, item, 0);
      ctx.globalAlpha = 1;
      break;
    
    case 'slide-left': {
      const offsetX = (1 - eased) * ctx.canvas.width;
      ctx.save();
      ctx.translate(-offsetX, 0);
      renderTrackItem(ctx, item, 0);
      ctx.restore();
      break;
    }
    
    case 'iris-open': {
      const radius = eased * Math.sqrt(
        ctx.canvas.width ** 2 + ctx.canvas.height ** 2
      ) / 2;
      ctx.save();
      ctx.beginPath();
      ctx.arc(ctx.canvas.width / 2, ctx.canvas.height / 2, radius, 0, Math.PI * 2);
      ctx.clip();
      renderTrackItem(ctx, item, 0);
      ctx.restore();
      break;
    }
    
    // ... 他のトランジション
  }
}
```

---

## 4. マルチトラックタイムライン設計

### 4.1 現状の問題

```typescript
// 現在: scenes: SceneItem[] の単純な配列
// → シリアル（直列）でしかシーンを並べられない
// → テロップ・ロゴ・オーバーレイを重ねられない
// → BGMトラックが scenes 配列から完全に独立している
```

### 4.2 Track・TrackItem の型定義

```typescript
// packages/core/src/timeline.ts

export type TrackType =
  | 'video'     // 映像シーン（Canvas描画）
  | 'image'     // 画像オーバーレイ
  | 'text'      // テキストオーバーレイ（TextPart）
  | 'audio'     // 音声トラック（BGM/SE/ボーカル）
  | 'shape';    // 図形オーバーレイ（ShapePart）

export interface Track {
  id: string;
  type: TrackType;
  name: string;
  zOrder: number;           // 重ね順（大きいほど前面）
  muted: boolean;
  locked: boolean;
  visible: boolean;
  items: TrackItem[];
}

export interface TrackItem {
  id: string;
  trackId: string;
  startTime: number;        // 開始時刻（秒）
  duration: number;         // 尺（秒）
  // --- コンテンツ参照 ---
  sceneConfigId?: string;   // video トラック: SceneConfig.id
  assetId?: string;         // image/audio/video: Asset.id
  // --- パラメータ ---
  params: Record<string, unknown>;
  // --- トランジション ---
  transitionIn?: TransitionConfig;
  transitionOut?: TransitionConfig;
  // --- キーフレーム（Phase 2） ---
  keyframes?: Record<string, Keyframe[]>;
}

export interface Keyframe {
  time: number;             // トラックアイテム内の時刻（秒）
  value: unknown;
  easing: EasingType;
}
```

### 4.3 タイムラインの構造例

```typescript
// プロジェクトのタイムラインデータ
const timeline: Track[] = [
  {
    id: 'track-bg',
    type: 'video',
    name: '背景映像',
    zOrder: 0,
    muted: false,
    locked: false,
    visible: true,
    items: [
      {
        id: 'item-1',
        trackId: 'track-bg',
        startTime: 0,
        duration: 4,
        sceneConfigId: 'title-scene',
        params: { text: 'vKoma Demo', fontSize: 72, color: '#ffffff', bgColor: '#111827' },
        transitionOut: { type: 'fade', duration: 0.5, easing: 'easeInOut' },
      },
      {
        id: 'item-2',
        trackId: 'track-bg',
        startTime: 3.5,        // transitionIn のため 0.5秒オーバーラップ
        duration: 5,
        sceneConfigId: 'gradient-scene',
        params: { color1: '#6366f1', color2: '#ec4899' },
        transitionIn: { type: 'fade', duration: 0.5, easing: 'easeInOut' },
      },
    ],
  },
  {
    id: 'track-overlay',
    type: 'text',
    name: 'テロップ',
    zOrder: 10,
    muted: false,
    locked: false,
    visible: true,
    items: [
      {
        id: 'item-overlay-1',
        trackId: 'track-overlay',
        startTime: 1.0,
        duration: 3.0,
        sceneConfigId: 'text-part-scene',
        params: {
          text: '字幕テキスト',
          fontSize: 36,
          color: '#ffffff',
          y: 900,  // 画面下部
          effect: 'fade',
        },
      },
    ],
  },
  {
    id: 'track-logo',
    type: 'image',
    name: 'ロゴ',
    zOrder: 20,
    muted: false,
    locked: false,
    visible: true,
    items: [
      {
        id: 'item-logo-1',
        trackId: 'track-logo',
        startTime: 0,
        duration: 8.5,
        assetId: 'asset-logo-png',
        params: { x: 1750, y: 80, width: 120, height: 60, opacity: 0.8 },
      },
    ],
  },
  {
    id: 'track-bgm',
    type: 'audio',
    name: 'BGM',
    zOrder: -1,
    muted: false,
    locked: false,
    visible: true,
    items: [
      {
        id: 'item-bgm-1',
        trackId: 'track-bgm',
        startTime: 0,
        duration: 30,
        assetId: 'asset-bgm-mp3',
        params: { volume: 0.8, fadeIn: 1.0, fadeOut: 2.0 },
      },
    ],
  },
  {
    id: 'track-se',
    type: 'audio',
    name: 'SE',
    zOrder: -1,
    muted: false,
    locked: false,
    visible: true,
    items: [
      {
        id: 'item-se-1',
        trackId: 'track-se',
        startTime: 2.0,
        duration: 0.5,
        assetId: 'asset-click-wav',
        params: { volume: 1.0 },
      },
    ],
  },
];
```

### 4.4 レイヤー順（z-order）

```
z: 30  ── テロップ最前面
z: 20  ── ロゴ・ウォーターマーク
z: 10  ── テキストオーバーレイ
z:  5  ── 図形オーバーレイ
z:  0  ── 背景映像（ベーストラック）
z: -1  ── 音声（非表示）
```

### 4.5 タイムラインGUI の変更点

**現状（シリアル1トラック）:**
```
Scene 一覧  │  0s    1s    2s    3s
            │  [TitleScene ████][SubtitleScene ████████]
```

**新デザイン（マルチトラック）:**
```
            │  0s    1s    2s    3s    4s    5s
────────────┼───────────────────────────────────
背景映像    │  [TitleScene ████████][Gradient Scene ████████]
テロップ    │            [字幕テキスト ██████]
ロゴ        │  [ロゴ ████████████████████████████]
BGM         │  ≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈ (波形表示)
SE          │          ●(2.0s)
────────────┴───────────────────────────────────
```

---

## 5. アセット管理

### 5.1 Asset 型定義

```typescript
// packages/core/src/asset.ts

export type AssetType = 'image' | 'video' | 'audio' | 'font';

export interface Asset {
  id: string;                // UUID
  type: AssetType;
  name: string;              // 表示名
  filename: string;          // 実ファイル名
  mimeType: string;
  size: number;              // バイト数
  // メタデータ（型によって異なる）
  width?: number;            // image/video
  height?: number;           // image/video
  duration?: number;         // video/audio（秒）
  // プロジェクト内パス
  projectPath: string;       // "assets/logo.png"
  // サムネイル（image/videoの場合）
  thumbnailDataUrl?: string;
  createdAt: string;
}

export interface AssetLibrary {
  assets: Asset[];
}
```

### 5.2 アセット保存先

```
~/vkoma-projects/my-video/
├── vkoma.toml
├── assets/
│   ├── logo.png            ← 画像アセット
│   ├── bgm.mp3             ← BGMアセット
│   ├── click.wav           ← SEアセット
│   └── intro.mp4           ← 動画アセット
├── scenes/
│   └── ...
└── project.json            ← timeline + assets のメタデータ
```

### 5.3 バックエンドAPIエンドポイント（追加分）

| メソッド | パス | 説明 |
|---|---|---|
| GET | `/api/projects/:id/assets` | アセット一覧取得 |
| POST | `/api/projects/:id/assets` | ファイルアップロード（multipart/form-data） |
| GET | `/api/projects/:id/assets/:assetId` | アセットファイル取得（ストリーミング） |
| DELETE | `/api/projects/:id/assets/:assetId` | アセット削除 |
| GET | `/api/projects/:id/assets/:assetId/thumbnail` | サムネイル取得 |

### 5.4 アセットライブラリUI

```
┌──────────────────────────────────────┐
│  📁 アセットライブラリ    [+ アップロード] │
├──────────────────────────────────────┤
│  🔍 [検索...]                         │
│  [ 全て ] [ 画像 ] [ 動画 ] [ 音声 ]   │
├──────────────────────────────────────┤
│  [🖼 logo.png     120x60  8KB ]       │
│  [🎵 bgm.mp3     3:24    4.2MB]       │
│  [🎵 click.wav   0.5s    12KB]        │
│  [🎬 intro.mp4   5s HD   12MB]        │
└──────────────────────────────────────┘
```

- アイテムをタイムラインにドラッグ&ドロップして配置
- 画像・動画はドロップ先のトラックタイプに応じて自動的に TrackItem 化

---

## 6. データモデル（JSON 構造）

### 6.1 現在の project.json 構造

```json
{
  "id": "my-video",
  "name": "My Video",
  "scenes": [
    {
      "id": "scene-xxx",
      "name": "Title Scene",
      "duration": 4,
      "sceneConfigId": "title-scene",
      "params": {
        "text": "Hello World",
        "fontSize": 72,
        "color": "#ffffff",
        "bgColor": "#111827"
      }
    },
    {
      "id": "scene-yyy",
      "name": "Dynamic Scene",
      "duration": 3,
      "sceneConfigId": "dynamic-xxx",
      "renderCode": "ctx.fillStyle = '#111827'; ...",
      "params": {
        "textColor": "#ffffff"
      }
    }
  ],
  "createdAt": "2026-03-16T00:00:00.000Z",
  "updatedAt": "2026-03-16T00:00:00.000Z"
}
```

### 6.2 新しい project.json 構造

```json
{
  "id": "my-video",
  "name": "My Video",
  "version": "2.0",
  "fps": 30,
  "width": 1920,
  "height": 1080,

  "timeline": {
    "duration": 30.0,
    "tracks": [
      {
        "id": "track-bg",
        "type": "video",
        "name": "背景映像",
        "zOrder": 0,
        "muted": false,
        "locked": false,
        "visible": true,
        "items": [
          {
            "id": "item-1",
            "trackId": "track-bg",
            "startTime": 0,
            "duration": 4,
            "sceneConfigId": "title-scene",
            "params": {
              "text": "Hello World",
              "fontSize": 72,
              "color": "#ffffff",
              "bgColor": "#111827"
            },
            "transitionOut": {
              "type": "fade",
              "duration": 0.5,
              "easing": "easeInOut"
            }
          },
          {
            "id": "item-2",
            "trackId": "track-bg",
            "startTime": 3.5,
            "duration": 5,
            "sceneConfigId": "gradient-scene",
            "params": {
              "color1": "#6366f1",
              "color2": "#ec4899",
              "speed": 1
            },
            "transitionIn": {
              "type": "fade",
              "duration": 0.5,
              "easing": "easeInOut"
            }
          }
        ]
      },
      {
        "id": "track-text",
        "type": "text",
        "name": "テロップ",
        "zOrder": 10,
        "muted": false,
        "locked": false,
        "visible": true,
        "items": [
          {
            "id": "item-caption-1",
            "trackId": "track-text",
            "startTime": 1.0,
            "duration": 3.0,
            "sceneConfigId": "__builtin__:text-part",
            "params": {
              "text": "字幕テキストはここに入ります",
              "fontSize": 36,
              "color": "#ffffff",
              "y": 900,
              "effect": "fade",
              "easing": "easeOut"
            }
          }
        ]
      },
      {
        "id": "track-bgm",
        "type": "audio",
        "name": "BGM",
        "zOrder": -1,
        "muted": false,
        "locked": false,
        "visible": true,
        "items": [
          {
            "id": "item-bgm",
            "trackId": "track-bgm",
            "startTime": 0,
            "duration": 30,
            "assetId": "asset-001",
            "params": {
              "volume": 0.8,
              "fadeIn": 1.0,
              "fadeOut": 2.0,
              "loop": false
            }
          }
        ]
      }
    ]
  },

  "assets": [
    {
      "id": "asset-001",
      "type": "audio",
      "name": "BGM",
      "filename": "bgm.mp3",
      "mimeType": "audio/mpeg",
      "size": 4404480,
      "duration": 204.0,
      "projectPath": "assets/bgm.mp3",
      "createdAt": "2026-03-16T00:00:00.000Z"
    },
    {
      "id": "asset-002",
      "type": "image",
      "name": "ロゴ",
      "filename": "logo.png",
      "mimeType": "image/png",
      "size": 8192,
      "width": 120,
      "height": 60,
      "projectPath": "assets/logo.png",
      "createdAt": "2026-03-16T00:00:00.000Z"
    }
  ],

  "createdAt": "2026-03-16T00:00:00.000Z",
  "updatedAt": "2026-03-16T00:00:00.000Z"
}
```

### 6.3 マイグレーション戦略

既存の v1 フォーマット（`scenes[]` のフラット配列）から v2 フォーマット（`timeline.tracks[]`）への自動変換を実装する。

```typescript
// packages/core/src/migration.ts

export function migrateV1ToV2(v1: ProjectV1): ProjectV2 {
  // v1 の scenes[] を単一の video トラックに変換
  const videoTrack: Track = {
    id: generateId(),
    type: 'video',
    name: '映像',
    zOrder: 0,
    muted: false,
    locked: false,
    visible: true,
    items: v1.scenes.map((scene, i) => {
      // シリアル配置: 前のシーンの終端に続けて配置
      const startTime = v1.scenes
        .slice(0, i)
        .reduce((sum, s) => sum + s.duration, 0);
      return {
        id: scene.id,
        trackId: videoTrack.id,
        startTime,
        duration: scene.duration,
        sceneConfigId: scene.sceneConfigId,
        params: scene.params,
        // renderCode がある場合は保持
        ...(scene.renderCode ? { renderCode: scene.renderCode } : {}),
      };
    }),
  };

  // BGM を音声トラックに変換（v1 では bgmFile として独立）
  const audioTracks: Track[] = [];
  // ※ BGM情報は project.json 外（サーバー側）で管理されているため、
  //    マイグレーション時に別途取得が必要

  return {
    ...v1,
    version: '2.0',
    fps: 30,
    width: 1920,
    height: 1080,
    timeline: {
      duration: videoTrack.items.reduce((sum, item) => sum + item.duration, 0),
      tracks: [videoTrack, ...audioTracks],
    },
    assets: [],
  };
}
```

---

## 7. Zustand ストアの再設計

### 7.1 現在のストア構造の問題

```typescript
// 現在: シーンリストがフラット配列
interface SceneStore {
  scenes: SceneItem[];         // ← シリアル1トラック
  bgmFile: File | null;        // ← タイムラインと分離
  fftCache: ...;               // ← BGM専用
}
```

### 7.2 新しいストア構造

```typescript
// packages/ui/src/stores/timelineStore.ts

interface TimelineStore {
  // --- プロジェクト ---
  projectId: string | null;
  projectName: string;
  fps: number;
  width: number;
  height: number;

  // --- タイムライン ---
  tracks: Track[];
  totalDuration: () => number;

  // --- 再生状態 ---
  isPlaying: boolean;
  currentTime: number;          // 秒（フレームからの変換）

  // --- 選択状態 ---
  selectedTrackId: string | null;
  selectedItemId: string | null;

  // --- アセット ---
  assets: Asset[];

  // --- アクション: トラック ---
  addTrack: (type: TrackType, name?: string) => void;
  removeTrack: (id: string) => void;
  updateTrack: (id: string, updates: Partial<Track>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

  // --- アクション: トラックアイテム ---
  addItem: (trackId: string, item: Omit<TrackItem, 'id' | 'trackId'>) => void;
  removeItem: (trackId: string, itemId: string) => void;
  updateItem: (trackId: string, itemId: string, updates: Partial<TrackItem>) => void;
  moveItem: (itemId: string, toTrackId: string, startTime: number) => void;
  updateItemParam: (itemId: string, key: string, value: unknown) => void;
  setTransition: (itemId: string, direction: 'in' | 'out', config: TransitionConfig | null) => void;

  // --- アクション: アセット ---
  uploadAsset: (file: File) => Promise<Asset>;
  removeAsset: (assetId: string) => void;

  // --- アクション: 再生 ---
  setPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;

  // --- プロジェクト永続化 ---
  loadProject: (id: string) => Promise<void>;
  saveProject: () => Promise<void>;
}
```

---

## 8. 実装ロードマップ

### Phase 2.1: 標準パーツ + パラメータシステム（2〜3週間）

**優先度: 最高**（他の機能の基盤となるため）

- [ ] `packages/core/src/params.ts` を拡張（boolean/font/easing/position/image/audio型追加）
- [ ] `packages/core/src/parts/TextPart.ts` を実装（TextPartParams + drawTextPart）
- [ ] `packages/core/src/parts/BackgroundPart.ts` を実装
- [ ] `packages/core/src/parts/ImagePart.ts` を実装
- [ ] `packages/core/src/parts/ShapePart.ts` を実装
- [ ] `packages/ui` のパラメータパネルに新型コンポーネントを追加（BooleanInput, FontSelect, EasingSelect等）
- [ ] AI生成規約のシステムプロンプト更新

**受け入れ基準:**
- TextPart を使ったシーンで、文字の大きさ・フォント・エフェクトがUIから変更できる
- AI が生成したシーンのパラメータがパネルに表示される

### Phase 2.2: マルチトラックタイムライン（3〜4週間）

- [ ] `packages/core/src/timeline.ts` に Track/TrackItem 型定義を追加
- [ ] `packages/core/src/migration.ts` で v1→v2 マイグレーション実装
- [ ] `packages/ui/src/stores/timelineStore.ts` をリライト
- [ ] `packages/ui` のタイムラインコンポーネントをマルチトラック対応に更新
- [ ] レンダラー（server/render-frame.ts）をマルチトラック合成対応に更新

**受け入れ基準:**
- 背景映像トラック + テロップトラック + 音声トラックが同時に再生できる
- 既存の v1 プロジェクトが自動マイグレーションで開ける

### Phase 2.3: トランジション（1〜2週間）

- [ ] `packages/core/src/transition.ts` に TransitionConfig 型定義を追加
- [ ] fade / slide-left / slide-right / iris-open / iris-close を実装
- [ ] UIでトランジション設定ダイアログを実装（シーンバーを右クリック→トランジション設定）
- [ ] レンダラーでトランジション合成ロジックを実装

**受け入れ基準:**
- タイムライン上のシーン間にフェードトランジションを設定して書き出しできる

### Phase 2.4: アセット管理（1〜2週間）

- [ ] `packages/core/src/asset.ts` に Asset 型定義を追加
- [ ] バックエンドにアセットCRUDエンドポイントを追加
- [ ] UIにアセットライブラリパネルを追加
- [ ] アセットからタイムラインへのドラッグ&ドロップ実装

---

## 9. 後方互換性

- **v1 プロジェクト:** `version` フィールドがないか `"1.0"` の場合、自動的に v2 へマイグレーション
- **renderCode シーン:** v2 でも継続サポート。`sceneConfigId` が `"dynamic-*"` の場合は `renderCode` から動的シーンを生成する
- **BGMファイル:** 既存の BGM（バイナリ）は `assets/bgm.mp3` に移動し、Asset として登録

---

## 10. まとめ

| 問題 | 解決策 |
|---|---|
| AIがrenderCodeにハードコード | AI生成規約の強制 + パラメータ型の拡張 |
| 標準テキストパーツがない | TextPart/ImagePart/ShapePart の実装 |
| トランジションがない | TransitionConfig + 合成レンダラー |
| 1トラックのみ | Track/TrackItem によるマルチトラック |
| 画像・音声がタイムライン外 | アセット管理 + 全トラックタイプの統一 |

これらの変更により、vKoma は「AIが毎回同じような draw 関数を生成するツール」から、**プロ仕様の映像制作ツール**へと進化する。
