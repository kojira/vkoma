# vKoma 仕様書

> **v**ideo + **Koma**（コマ/フレーム）  
> コードで書いたアニメーションをタイムラインGUIで微調整できる動画制作ツール

---

## 設計思想

### コードファースト、GUIで微調整

```
Claude Code / 開発者がシーンをTypeScriptで記述
        ↓
パラメータを型スキーマで定義（外部から変更可能）
        ↓
タイムラインGUIがスキーマを読んでUIを自動生成
        ↓
スライダー / テキスト入力 / ドロップダウンで値を調整
        ↓
リアルタイムプレビューに即反映
        ↓
MP4 / WebM で書き出し
```

### Remotionとの違い

| | Remotion | vKoma |
|---|---|---|
| シーン記述 | React JSX | TypeScript（React JSX） |
| タイムラインGUI | なし | あり |
| パラメータ調整 | コード編集 | GUIで微調整 |
| レンダリング | Node.js + Chromium | ブラウザ + Rust (WASM) |
| 出力 | MP4 / GIF | MP4 / WebM |

---

## アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                    vKoma (ブラウザ)                   │
│                                                     │
│  ┌──────────────┐    ┌──────────────────────────┐  │
│  │ Scene Editor │    │     Timeline GUI          │  │
│  │ (TypeScript) │    │                          │  │
│  │              │    │  [Scene A][Scene B][ScC]  │  │
│  │ defineScene({│    │  ──────────────────────  │  │
│  │  params: {}  │    │  ◆ keyframe editor        │  │
│  │  render: fn  │    │  📐 param panels           │  │
│  │ })           │    └──────────────────────────┘  │
│  └──────┬───────┘                │                  │
│         │ Scene定義              │ パラメータ変更    │
│         ▼                        ▼                  │
│  ┌──────────────────────────────────────────────┐  │
│  │              Scene Runtime                    │  │
│  │  - フレーム管理                                │  │
│  │  - パラメータ注入                              │  │
│  │  - Canvas / WebGL レンダリング                 │  │
│  └──────────────────┬───────────────────────────┘  │
│                     │                               │
│  ┌──────────────────▼───────────────────────────┐  │
│  │           Preview Player                      │  │
│  │  リアルタイムプレビュー（Canvas 2D / WebGL）   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │         Renderer (Rust / WASM)                │  │
│  │  - フレームを高速エンコード                    │  │
│  │  - MP4 / WebM 書き出し                        │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## シーン定義 API

### `defineScene()` — シーンの型スキーマ付き定義

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
    duration:  params.frames(90),   // フレーム数
  },

  // レンダリング関数
  render: ({ frame, duration, params, ctx }) => {
    const progress = frame / duration  // 0.0 → 1.0

    // エフェクト別アニメーション
    const y = applyEffect(params.effect, params.y, progress)

    ctx.font = `${params.fontSize}px ${params.font}`
    ctx.fillStyle = params.color
    ctx.fillText(params.text, params.x, y)
  },
})
```

### パラメータ型一覧

| 型 | 関数 | GUI表示 |
|---|---|---|
| 文字列 | `params.string(default)` | テキスト入力 |
| 数値 | `params.number(default, {min, max, step})` | スライダー |
| 色 | `params.color(default)` | カラーピッカー |
| 選択肢 | `params.select(default, options[])` | ドロップダウン |
| フレーム数 | `params.frames(default)` | タイムラインバー長さ |
| 座標 | `params.position(x, y)` | 画面上でドラッグ |
| 真偽値 | `params.boolean(default)` | トグルスイッチ |
| 画像 | `params.image()` | ファイル選択 |
| 動画 | `params.video()` | ファイル選択 |

---

## タイムラインGUI 仕様

### レイアウト

```
┌─────────────────────────────────────────────────┐
│  [▶ Preview]  [⏱ 00:03.12 / 00:10.00]  [🎬 書出] │
├─────────────────────────────────────────────────┤
│                                                 │
│           プレビュー画面 (16:9)                  │
│                                                 │
├────────┬────────────────────────────────────────┤
│ Scene  │  0s    1s    2s    3s    4s    5s       │
│ 一覧   │  ├─────────────────────────────────── │
│        │  │ TitleScene  [████████]              │
│ + Add  │  │ LogoScene         [█████]           │
│        │  │ BodyScene              [████████████│
│        │  └───────────────────────────────────  │
│        │  ◆ ◆         ◆  ← キーフレーム         │
├────────┴────────────────────────────────────────┤
│ パラメータパネル（選択中シーン: TitleScene）      │
│  text:      [Hello World          ]             │
│  fontSize:  [────●──────────] 64               │
│  effect:    [bounce       ▼]                    │
│  x:         [────────●────] 960                 │
│  y:         [──●──────────] 200                 │
└─────────────────────────────────────────────────┘
```

### タイムライン操作

- **シーンバーをドラッグ**: 開始フレーム移動
- **シーンバー端をドラッグ**: duration変更
- **シーン右クリック**: 複製 / 削除 / キーフレーム追加
- **キーフレーム (◆)**: 特定フレームでパラメータ値を固定、間は自動補間
- **スケール変更**: タイムライン横のズームイン/アウト

### キーフレームアニメーション

```typescript
// コードでキーフレームを定義することも可能
const scene = TitleScene.withKeyframes({
  fontSize: [
    { frame: 0,  value: 0   },
    { frame: 30, value: 64  },  // 0→64 にイージング
    { frame: 90, value: 64  },
  ],
  y: [
    { frame: 0,  value: 800, easing: 'easeOutBounce' },
    { frame: 30, value: 540 },
  ],
})
```

---

## レンダリングパイプライン

### プレビュー（リアルタイム）

```
useCurrentFrame() → render() → Canvas 2D / WebGL → 画面表示
```
- ブラウザのCanvas APIを使用
- 目標: 60fps（複雑なシーンは30fps）
- Web Workers で重い計算を別スレッドに

### 書き出し（高品質）

```
全フレームをCanvasで描画
      ↓
ImageData（生ピクセル列）をRust WASMに渡す
      ↓
Rust: フレームをMP4/WebMエンコード（mp4rs / webm-rs）
      ↓
Uint8Array → ブラウザでダウンロード
```

- Rust WASMでエンコード処理を高速化
- 1920×1080 / 30fps を目標

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| UI フレームワーク | React + TypeScript |
| スタイリング | Tailwind CSS |
| プレビュー描画 | Canvas 2D / WebGL (Three.js or raw) |
| 状態管理 | Zustand |
| コードエディタ | Monaco Editor (VSCode の中身) |
| ビルドツール | Vite |
| エンコーダ | Rust (WASM) — mp4rs / webm-rs |
| テスト | Vitest + Playwright |

---

## MVP スコープ（フェーズ1）

### 含む機能
- [ ] `defineScene()` API + パラメータスキーマ
- [ ] Canvas 2Dプレビュープレーヤー
- [ ] タイムライン（シーンの追加・並び替え・duration変更）
- [ ] パラメータパネル（スライダー・テキスト・セレクト）
- [ ] WebM書き出し（WebCodecs API使用、Rustなし）
- [ ] 基本エフェクト: `bounce`, `slide`, `zoom`, `fade`

### 含まない機能（フェーズ2以降）
- キーフレームアニメーション（GUIから）
- Rustエンコーダ（高速MP4書き出し）
- 画像/動画アセット読み込み
- Monaco Editor（コードエディタ統合）
- プロジェクト保存/読み込み

---

## フェーズ計画

| フェーズ | 内容 | 目標 |
|---|---|---|
| **Phase 1: MVP** | シーン定義API + タイムライン + WebM書き出し | 動くものを作る |
| **Phase 2: 品質** | Rustエンコーダ + MP4対応 + キーフレームGUI | 実用レベル |
| **Phase 3: 拡張** | Monaco Editor + アセット管理 + プロジェクト保存 | 本格ツール |
| **Phase 4: AI統合** | Claude Codeでシーン自動生成 + パラメータ提案 | AI-native制作 |

---

## ディレクトリ構成（予定）

```
vkoma/
├── packages/
│   ├── core/          # defineScene API, パラメータスキーマ
│   ├── renderer/      # Canvas/WebGL レンダリング
│   ├── encoder/       # Rust WASM エンコーダ
│   └── ui/            # React タイムラインGUI
├── apps/
│   └── studio/        # メインWebアプリ (Vite + React)
├── examples/
│   └── title-scene/   # サンプルシーン
└── SPEC.md
```
