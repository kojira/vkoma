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

---

## テンプレートプロジェクト

プロジェクト一式をテンプレートとして保存・適用できる。

```
テンプレート一覧から選択
    ↓
プロジェクト名・基本パラメータを入力
    ↓
テンプレートが展開されて即編集開始
```

### テンプレートの内容

- シーン構成（どのシーンが何秒の順番で並ぶか）
- 各シーンのデフォルトパラメータ（フォント、色、エフェクト等）
- アセット（BGM、ロゴ画像等のプレースホルダー）

### テンプレートの保存・共有

- ローカルに保存（TOML形式）
- GitHubリポジトリとしてエクスポート → 他のユーザーが `git clone` して適用
- 将来的にvKomaテンプレートレジストリで公開

---

## パーツライブラリ（シーンパッケージ）

作成したシーンをパッケージとして管理し、複数プロジェクトで再利用できる。  
**npmパッケージと同じモデル** — ライブラリ側を修正すれば、それを使う全プロジェクトに反映される。

### 使い方

```typescript
// パッケージをインストール（ローカル or レジストリから）
// vkoma add @kojira/scenes-basic

import { TitleScene, OutroScene } from '@kojira/scenes-basic'

const project = defineProject([
  TitleScene.with({ text: 'Hello World', effect: 'bounce' }),
  OutroScene.with({ duration: 60 }),
])
```

### バージョン管理

```toml
# vkoma.toml
name = "my-video"

[scenes]
"@kojira/scenes-basic" = "^1.2.0"
"@kojira/scenes-particles" = "^0.5.1"
```

- `vkoma update` でライブラリを最新版に更新
- バージョンを固定して再現性を担保することも可能
- 不具合修正をライブラリ側でリリース → `vkoma update` 一発で全プロジェクトに反映

### パッケージの公開

```bash
# ローカルライブラリとして登録
vkoma publish --local ./my-scenes

# vKoma レジストリ（将来）or npm に公開
vkoma publish
```

### ライブラリ構造

```
@kojira/scenes-basic/
├── src/
│   ├── TitleScene.ts     # defineScene() で定義
│   ├── OutroScene.ts
│   └── index.ts
├── vkoma.toml            # パッケージメタデータ
└── vkoma.config.ts       # プレビュー用設定
```

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

### シーンコードの実行モデル

シーンの TypeScript コードは Vite の HMR（Hot Module Replacement）で動的に読み込まれる。

```
ファイル保存 → Vite HMR → シーン再登録 → プレビュー自動更新
```

- 開発時: Vite dev server がシーンファイルを監視、変更時に即座にプレビュー反映
- ライブラリ: `node_modules` から通常の ESM import で読み込み
- 書き出し時: 全シーンを静的にバンドルして Web Worker 内で実行

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
    duration:  params.duration(3, "s"),   // 秒指定（フレーム指定も可）
  },

  // レンダリング関数
  render: ({ frame, duration, params, draw }) => {
    const progress = frame / duration  // 0.0 → 1.0

    // エフェクト別アニメーション
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
```

### パラメータ型一覧

| 型 | 関数 | GUI表示 |
|---|---|---|
| 文字列 | `params.string(default)` | テキスト入力 |
| 数値 | `params.number(default, {min, max, step})` | スライダー |
| 色 | `params.color(default)` | カラーピッカー |
| 選択肢 | `params.select(default, options[])` | ドロップダウン |
| 時間 | `params.duration(default, unit?)` | 数値入力（秒/フレーム切替） |
| 座標 | `params.position(x, y)` | 画面上でドラッグ |
| 真偽値 | `params.boolean(default)` | トグルスイッチ |
| 画像 | `params.image()` | ファイル選択 |
| 動画 | `params.video()` | ファイル選択 |

### ライフサイクルフック

```typescript
const scene = defineScene({
  params: { ... },

  // 初期化（アセット読み込み等）
  setup: async ({ params, assets }) => {
    const img = await assets.load("logo.png")
    return { img }  // render に渡される
  },

  // 毎フレーム描画
  render: ({ frame, duration, params, draw, state }) => { ... },

  // クリーンアップ
  cleanup: ({ state }) => { ... },
})
```

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
- **Undo / Redo**: `Cmd+Z` / `Cmd+Shift+Z`（全操作が対象）
- **レイヤー**: 同一時間帯に複数シーンを重ねて配置可能。上のレイヤーが前面に描画
- **スナップ**: シーンバーをドラッグ時、他のシーンの開始/終了フレームに自動スナップ

### キーフレームアニメーション

```typescript
// .with() でパラメータ指定とキーフレーム指定を統合
const scene = TitleScene.with({
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

## オーディオ

### オーディオトラック

タイムライン上にオーディオトラックを配置できる。

```typescript
import { defineScene, params, audio } from "vkoma"

const project = defineProject({
  scenes: [...],
  audio: [
    audio.bgm("./assets/bgm.mp3", { volume: 0.8 }),
    audio.se("./assets/click.wav", { startAt: "2s", volume: 1.0 }),
  ],
})
```

### オーディオパラメータ型

| 型 | 関数 | GUI表示 |
|---|---|---|
| BGM | `audio.bgm(src, opts)` | 波形付きトラック |
| 効果音 | `audio.se(src, opts)` | タイムライン上のマーカー |
| ボリューム | `volume: 0.0〜1.0` | スライダー |
| フェード | `fadeIn / fadeOut` (秒指定) | トラック上の傾斜表示 |

### MVP でのオーディオ対応

Phase 1 では BGM 1トラックのみ対応（Web Audio API）。
SE・複数トラックは Phase 2 以降。

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
- [ ] プロジェクト保存/読み込み（JSON形式）
- [ ] BGMトラック1本（Web Audio API）

### 含まない機能（フェーズ2以降）
- キーフレームアニメーション（GUIから）
- Rustエンコーダ（高速MP4書き出し）
- 画像/動画アセット読み込み
- Monaco Editor（コードエディタ統合）

---

## フェーズ計画

| フェーズ | 内容 | 目標 |
|---|---|---|
| **Phase 1: MVP** | シーン定義API + タイムライン + WebM書き出し | 動くものを作る |
| **Phase 2: 品質** | Rustエンコーダ + MP4対応 + キーフレームGUI + SE・複数オーディオトラック | 実用レベル |
| **Phase 3: ライブラリ** | パーツライブラリ + テンプレート | 再利用可能な資産を積む |
| **Phase 4: 拡張** | Monaco Editor + アセット管理 + レジストリ公開 | 本格ツール |
| **Phase 5: AI統合** | Claude Codeでシーン自動生成 + パラメータ提案 | AI-native制作 |

---

## ディレクトリ構成（予定）

```
vkoma/
├── packages/
│   ├── core/          # defineScene API, パラメータスキーマ
│   ├── renderer/      # Canvas/WebGL レンダリング
│   ├── encoder/       # Rust WASM エンコーダ
│   ├── ui/            # React タイムラインGUI
│   └── cli/           # vkoma add / update / publish コマンド
├── apps/
│   └── studio/        # メインWebアプリ (Vite + React)
├── scenes/            # 公式シーンパッケージ
│   ├── scenes-basic/  # 基本シーン集（タイトル、アウトロ等）
│   └── scenes-fx/     # エフェクト集（パーティクル、グリッチ等）
├── templates/         # プロジェクトテンプレート
│   ├── intro-video/
│   └── study-session/
├── examples/
│   └── title-scene/   # サンプルシーン
└── SPEC.md
```

---

## モバイル対応

### 基本方針

- コード編集はデスクトップ/AI専用。スマホでは「プレビュー確認」「パラメータ微調整」「書き出し」に特化
- PWA対応でホーム画面から直接アクセス可能に
- レスポンシブデザインで同一コードベースからデスクトップ/タブレット/スマホに対応

### デバイス別の機能マトリクス

| 機能 | デスクトップ | タブレット | スマホ |
|---|---|---|---|
| シーンコード編集 | ✅ Monaco Editor | ✅ 簡易エディタ | ❌ 非対応 |
| タイムライン操作 | ✅ フル機能 | ✅ フル機能 | ✅ 簡易版（縦型） |
| プレビュー再生 | ✅ | ✅ | ✅ |
| パラメータ調整 | ✅ パネル | ✅ パネル | ✅ タッチUI |
| キーフレーム編集 | ✅ | ✅ | ❌ 非対応 |
| 書き出し | ✅ | ✅ | ✅ |
| アセット管理 | ✅ | ✅ | 📷 カメラ撮影のみ |

### モバイルレイアウト（縦型）

スマホでは縦型レイアウトに切り替え：

```
┌─────────────────────┐
│  プレビュー (16:9)   │
│                     │
├─────────────────────┤
│ ◀ ▶ ⏱ 00:03/00:10  │
├─────────────────────┤
│ [Scene A][Scene B]   │ ← 横スクロール
│ ─────────────────── │
├─────────────────────┤
│ パラメータ調整       │
│ text: [Hello World] │
│ fontSize: [●────] 64│
│ effect: [bounce ▼]  │
│                     │
│ [🎬 書き出し]        │
└─────────────────────┘
```

### タッチ対応タイムライン

- 横スクロールでタイムラインをスクラブ
- ピンチイン/アウトでズーム
- シーンバーの長押しで移動モード
- シーンバーのダブルタップでパラメータパネルを開く
- スワイプアップでシーン一覧表示

### パラメータ調整のタッチUI

- 数値パラメータ: 大きめのスライダー（44px以上のタッチターゲット）
- テキスト: タップでフルスクリーンテキスト入力
- カラー: タッチ対応カラーホイール
- セレクト: ネイティブセレクトUI活用
- 座標(position): プレビュー画面上で直接ドラッグ
- 微調整モード: スライダー長押しで0.1刻みの精密調整

### プレビュー確認フロー（スマホ）

1. プロジェクト一覧からプロジェクトを選択
2. プレビューが自動再生
3. シーンをタップして選択
4. 下部パネルでパラメータをスワイプで調整
5. 変更はリアルタイムにプレビューに反映
6. 満足したら「書き出し」ボタンで書き出し開始

### QRコードでスマホプレビュー

- デスクトップ編集中にQRコードを表示
- スマホで読み取るとプレビューページが開く
- WebSocket経由でリアルタイム同期（デスクトップで編集→スマホで即反映）
- 同一LAN内ならローカルサーバーで低遅延プレビュー

### PWA対応

- Service Workerでオフラインプレビュー対応
- ホーム画面に追加でネイティブアプリ風に起動
- プッシュ通知で書き出し完了を通知

### フェーズ計画へのモバイル対応組み込み

| フェーズ | モバイル対応内容 |
|---|---|
| Phase 1: MVP | レスポンシブレイアウト基盤、スマホでプレビュー確認可能 |
| Phase 2: 品質 | タッチ対応タイムライン、パラメータ調整タッチUI |
| Phase 3: ライブラリ | PWA対応、QRコードプレビュー連携 |
| Phase 4: 拡張 | スマホからカメラ撮影でアセット追加 |
| Phase 5: AI統合 | スマホから音声でAIにシーン生成指示 |

### 技術的考慮事項

- CSS Container Queries でコンポーネント単位のレスポンシブ対応
- touch-action CSSプロパティでスクロール/ズームの競合を防止
- requestAnimationFrameベースのプレビューはモバイルでもパフォーマンス維持
- WebCodecs APIのモバイルブラウザ対応状況を要確認（非対応ブラウザはサーバーサイド書き出しにフォールバック）
- 画像/動画アセットはモバイルメモリを考慮してレイジーロード
