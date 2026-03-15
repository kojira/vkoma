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
