# vKoma 仕様書

> **v**ideo + **Koma**（コマ/フレーム）  
> コードで書いたアニメーションをタイムラインGUIで微調整できる動画制作ツール

---

## 設計思想

### AIチャットファースト、GUIで微調整

シーンコードはAI（Claude Code等）が自然言語の指示から自動生成する。ユーザーはコードを書く必要がない。スマホからAIにチャットで指示するだけでシーンが生成される。

```
AIが自然言語の指示からシーンコードを自動生成（スマホからチャットで指示可能）
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

### 全体アーキテクチャ

```
┌─────────────────────────────────────────────────────┐
│              クライアント（ブラウザ）                   │
│  ┌─────────┐ ┌──────────┐ ┌────────────────────┐   │
│  │ AIチャット│ │タイムライン│ │ プレビュープレーヤー │   │
│  └────┬─────┘ └────┬─────┘ └────────┬───────────┘   │
└───────┼────────────┼────────────────┼───────────────┘
        │            │                │
        ▼ HTTP/WS    ▼ HTTP           ▼ WS
┌─────────────────────────────────────────────────────┐
│         ローカルバックエンドサーバー（Node.js）         │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────┐  │
│  │AI CLI連携 │ │プロジェクト管理│ │WebSocket Server│  │
│  │(Adapter)  │ │(ローカルFS)   │ │(リアルタイム同期)│  │
│  └──────────┘ └──────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### ブラウザ内コンポーネント

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

## ローカルバックエンドサーバー

vKomaはローカルバックエンドサーバー（Node.js）を介して動作する。ブラウザ（PC/スマホ）はHTTP/WebSocketでバックエンドに接続する。

### 役割

- AI CLI呼び出し（Claude Code / Codex / Cursor / Gemini CLI をサブプロセスとして実行）
- プロジェクトファイル管理（ローカルファイルシステム上の読み書き）
- シーンコードのバンドル・配信（Vite をプログラマティックに起動）
- WebSocketによるリアルタイム同期（プレビュー更新・AI生成結果の配信）

### 技術

- Node.js + Hono（APIサーバー）
- WebSocket（リアルタイム通信）
- Vite（シーンコードのバンドル・HMR）

### 起動方法

```bash
vkoma serve                    # デフォルト: http://localhost:3000
vkoma serve --port 8080        # ポート指定
```

起動時にローカルIPアドレスとQRコードを表示。同一WiFi内のスマホから http://192.168.x.x:3000 でアクセス可能。

### アーキテクチャ

```
スマホ・PC（ブラウザ）
    ↓ HTTP/WebSocket
ローカルバックエンドサーバー（Node.js）
    ├── AI CLI呼び出し（Claude Code / Codex / Cursor / Gemini）
    ├── プロジェクトファイル管理（ローカルFS: ~/vkoma-projects/）
    ├── シーンコードのバンドル・実行
    └── WebSocket: プレビュー同期・AI生成結果のリアルタイム配信
```

### APIエンドポイント例

| メソッド | パス | 説明 |
|---|---|---|
| GET | /api/projects | プロジェクト一覧 |
| POST | /api/projects | 新規プロジェクト作成 |
| GET | /api/projects/:id/scenes | シーン一覧取得 |
| PUT | /api/projects/:id/scenes/:name | シーン更新 |
| POST | /api/ai/chat | AIチャットメッセージ送信 |
| WS | /ws | リアルタイム同期 |

---

## プロジェクト保存

### 保存先

プロジェクトはローカルファイルシステムに保存する。IndexedDBやFile System Access APIは使用しない。

保存先: ~/vkoma-projects/<project-name>/

### ディレクトリ構成

```
~/vkoma-projects/my-video/
├── vkoma.toml          # プロジェクト設定
├── scenes/
│   ├── TitleScene.ts   # AIが生成したシーンコード
│   ├── BodyScene.ts
│   └── OutroScene.ts
├── assets/
│   ├── bgm.mp3
│   └── logo.png
└── dist/               # ビルド成果物（.gitignore対象）
    └── output.webm
```

### 特徴

- git管理可能な構造（.gitignore で dist/ を除外）
- vkoma.toml にプロジェクト設定・シーン構成・依存パッケージを記述
- scenes/ ディレクトリにAIが生成したTypeScriptファイルを格納
- assets/ ディレクトリに画像・音声ファイルを格納

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

## AIバックエンド（プラガブル設計）

### 設計思想

- vKomaのAIコーディング機能は特定のAIツールに依存しない
- プラグイン/アダプター設計で、共通インターフェースを通じて各AIバックエンドを呼び出す
- 将来のAIツール追加も容易

### 対応AIバックエンド一覧

| バックエンド | コマンド | 特徴 | 向いている用途 |
|---|---|---|---|
| Claude Code | `claude` | 高精度なコード生成、長文コンテキスト理解 | 複雑なシーンロジック、リファクタリング |
| Codex CLI | `codex` | OpenAI製、高速レスポンス | シンプルなシーン生成、素早い修正 |
| Cursor CLI | `cursor` | エディタ統合、差分ベース編集 | 既存シーンの部分修正 |
| Gemini CLI | `gemini` | Google製、マルチモーダル対応 | 画像参照からのシーン生成 |

### アダプター設計

共通インターフェース `AIBackendAdapter` を定義:

```typescript
interface AIBackendAdapter {
  name: string
  command: string
  generateScene(prompt: string, context: SceneContext): Promise<GeneratedCode>
  modifyScene(prompt: string, existingCode: string): Promise<GeneratedCode>
  isAvailable(): Promise<boolean>
}
```

各バックエンドのアダプター実装クラス:

- `ClaudeCodeAdapter`
- `CodexAdapter`
- `CursorAdapter`
- `GeminiAdapter`

### バックエンド選択UI

- 設定画面でドロップダウンから選択
- AIチャット画面のヘッダーに現在のバックエンド表示
- チャット中に `/backend claude` のようなコマンドで切り替え可能

### 設定例

```toml
# vkoma.toml
[ai]
backend = "claude-code"    # claude-code | codex | cursor | gemini
auto_detect = true         # インストール済みのCLIを自動検出
fallback = "codex"         # メインが利用不可の場合のフォールバック
```

### フォールバック戦略

- 選択されたバックエンドが利用不可の場合、fallbackに自動切り替え
- 全バックエンドが利用不可の場合はエラーメッセージを表示

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| UI フレームワーク | React + TypeScript |
| スタイリング | Tailwind CSS |
| プレビュー描画 | Canvas 2D / WebGL (Three.js or raw) |
| 状態管理 | Zustand |
| ビルドツール | Vite |
| バックエンドサーバー | Node.js + Hono |
| リアルタイム通信 | WebSocket |
| エンコーダ | Rust (WASM) — mp4rs / webm-rs |
| AIバックエンド連携 | CLIアダプター（Claude Code / Codex / Cursor / Gemini） |
| テスト（ユニット・統合） | Vitest + Supertest |
| テスト（E2E） | Playwright |

---

## MVP スコープ（フェーズ1）

### 含む機能
- [ ] `defineScene()` API + パラメータスキーマ
- [ ] AIチャットUI
- [ ] AIバックエンド連携
- [ ] Canvas 2Dプレビュープレーヤー
- [ ] タイムライン（シーンの追加・並び替え・duration変更）
- [ ] パラメータパネル（スライダー・テキスト・セレクト）
- [ ] WebM書き出し（WebCodecs API使用、Rustなし）
- [ ] 基本エフェクト: `bounce`, `slide`, `zoom`, `fade`
- [ ] プロジェクト保存/読み込み（ローカルFS、vkoma.toml + scenes/）
- [ ] BGMトラック1本（Web Audio API）

### 含まない機能（フェーズ2以降）
- キーフレームアニメーション（GUIから）
- Rustエンコーダ（高速MP4書き出し）
- 画像/動画アセット読み込み

---

## テスト方針

### ユニットテスト（Vitest）

コアロジックの正確性を保証する。

- **`defineScene()` API・パラメータスキーマのバリデーション**: 各パラメータ型（`params.string`, `params.number`, `params.color` 等）のデフォルト値・制約（min/max/step）が正しく機能することを検証
- **AIバックエンドアダプター**: `AIBackendAdapter` インターフェースの各実装（`ClaudeCodeAdapter`, `CodexAdapter`, `CursorAdapter`, `GeminiAdapter`）のコマンド生成・レスポンスパース・`isAvailable()` 判定をテスト
- **プロジェクトファイルのシリアライズ/デシリアライズ**: `vkoma.toml` の読み書き、シーン構成の復元が正しく行われることを検証
- **レンダリングロジック**: フレーム計算（progress = frame / duration）、イージング関数（`easeOutBounce` 等）、キーフレーム補間の数値精度を検証

### 統合テスト（Vitest + Supertest）

バックエンドサーバーのAPIとコンポーネント間連携を検証する。

- **バックエンドAPIエンドポイント（プロジェクトCRUD）**: `GET /api/projects`, `POST /api/projects`, `PUT /api/projects/:id/scenes/:name` 等の正常系・異常系レスポンスを検証
- **AI CLI呼び出しのモック**: 各AIバックエンドアダプターのCLI実行をモックし、プロンプト送信→コード生成→シーン反映のフローをテスト
- **WebSocket通信**: `/ws` エンドポイントの接続・メッセージ送受信・リアルタイム同期（パラメータ変更→プレビュー更新通知）を検証

### E2Eテスト（Playwright）

ユーザー操作の主要シナリオをブラウザ上で検証する。

- **ビューポート**: スマホ（375×667）・デスクトップ（1920×1080）の両方でテスト実行
- **主要シナリオ**:
  1. AIチャットで動画を作成 → プレビュー確認 → 書き出し
  2. パラメータ調整（スライダー・テキスト入力・セレクト） → リアルタイムプレビュー反映
  3. プロジェクト保存 → 再読み込み → 作業再開
- **AI CLIモック**: E2E実行時はAI CLIをモックサーバーで代替し、決定論的なレスポンスを返す
- **CI**: GitHub Actionsで自動実行（PR作成時・mainブランチマージ時）

### テスト実行

```bash
pnpm test              # 全テスト実行
pnpm test:unit         # ユニットテストのみ
pnpm test:integration  # 統合テストのみ
pnpm test:e2e          # Playwright E2Eテスト
pnpm test:e2e:mobile   # スマホビューポートのみ
pnpm test:e2e:desktop  # デスクトップビューポートのみ
```

## フェーズ計画

| フェーズ | 内容 | 目標 |
|---|---|---|
| **Phase 1: MVP** | シーン定義API + AIチャットUI + AIバックエンド連携 + タイムライン + WebM書き出し + ユニットテスト基盤整備 | 動くものを作る |
| **Phase 2: 品質** | Rustエンコーダ + MP4対応 + キーフレームGUI + SE・複数オーディオトラック + 統合テスト・E2Eテスト整備 | 実用レベル |
| **Phase 3: ライブラリ** | パーツライブラリ + テンプレート + ライブラリのテストテンプレート | 再利用可能な資産を積む |
| **Phase 4: 拡張** | アセット管理 + レジストリ公開 + プラグインシステム + プラグインテストAPI | 本格ツール |

---

## ディレクトリ構成（予定）

```
vkoma/
├── packages/
│   ├── core/          # defineScene API, パラメータスキーマ
│   ├── renderer/      # Canvas/WebGL レンダリング
│   ├── encoder/       # Rust WASM エンコーダ
│   ├── server/        # ローカルバックエンドサーバー（Hono + WebSocket）
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

- AIチャットファースト。スマホではAIとの対話でシーン生成・修正指示を行い、プレビュー確認とパラメータ調整を組み合わせる
- PWA対応でホーム画面から直接アクセス可能に
- レスポンシブデザインで同一コードベースからデスクトップ/タブレット/スマホに対応

### デバイス別の機能マトリクス

| 機能 | デスクトップ | タブレット | スマホ |
|---|---|---|---|
| タイムライン操作 | ✅ フル機能 | ✅ フル機能 | ✅ 簡易版（縦型） |
| プレビュー再生 | ✅ | ✅ | ✅ |
| パラメータ調整 | ✅ パネル | ✅ パネル | ✅ タッチUI |
| キーフレーム編集 | ✅ | ✅ | 🤖 AIに指示 |
| 書き出し | ✅ | ✅ | ✅ |
| アセット管理 | ✅ | ✅ | 📷 カメラ撮影のみ |

### モバイルレイアウト（縦型）

スマホでは縦型レイアウトに切り替え：

```
┌─────────────────────┐
│  プレビュー (16:9)   │
│                     │
├─────────────────────┤
│ AIチャット           │
│「タイトルを少し大きく」│
│「3秒目でフェードイン」 │
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

### AIチャットフロー（スマホ）

1. プロジェクト一覧からプロジェクトを選択
2. プレビューが自動再生
3. AIチャット欄に自然言語で修正指示を入力または音声で送信
4. AIがシーンコードまたはパラメータ変更案を生成して適用
5. 必要に応じて下部パネルで細かいパラメータをタッチ調整
6. 変更はリアルタイムにプレビューに反映
7. 満足したら「書き出し」ボタンで書き出し開始

### AIチャット指示例

| やりたいこと | AIへの指示例 | 想定される反映内容 |
|---|---|---|
| タイトルを調整したい | 「タイトルをもう少し大きくして、中央に寄せて」 | `fontSize` と `x`, `y` を調整 |
| アニメーションを追加したい | 「最初の1秒でふわっとフェードインして」 | opacityやキーフレーム相当の変化を生成 |
| 雰囲気を変えたい | 「背景を暖色系グラデーションにして」 | 色パレットや背景描画ロジックを更新 |
| テンポを変えたい | 「このシーンを今より0.5秒短くして」 | durationを短縮してタイムラインに反映 |

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
| Phase 1: MVP | レスポンシブレイアウト基盤、スマホ向けAIチャットUI、スマホでプレビュー確認可能 |
| Phase 2: 品質 | タッチ対応タイムライン、パラメータ調整タッチUI |
| Phase 3: ライブラリ | PWA対応、QRコードプレビュー連携 |
| Phase 4: 拡張 | スマホからカメラ撮影でアセット追加 |

### 技術的考慮事項

- CSS Container Queries でコンポーネント単位のレスポンシブ対応
- touch-action CSSプロパティでスクロール/ズームの競合を防止
- requestAnimationFrameベースのプレビューはモバイルでもパフォーマンス維持
- WebCodecs APIのモバイルブラウザ対応状況を要確認（非対応ブラウザはサーバーサイド書き出しにフォールバック）
- 画像/動画アセットはモバイルメモリを考慮してレイジーロード
