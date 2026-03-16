# iOS Safari 音声ファイルアップロード問題と対策

## 問題の概要

iPhoneのSafari（iOS 16以降、特にiOS 17/18/26 beta）から `<input type="file">` を使って音声ファイル（WAV/MP3/M4A等）を選択しようとすると、**ファイルピッカーにファイルが表示されるがグレーアウトして選択できない**という問題が発生する。

写真・動画は問題なく選択できるが、音声ファイルのみが選択不可になる。

## 根本原因

iOS SafariはAppleのWebKitエンジンを使用しており（iOS上のすべてのブラウザがWebKitを使用）、HTMLの `<input type="file">` における `accept` 属性の処理に問題がある。

- `accept="audio/*"` → 音声ファイルがグレーアウト
- `accept="audio/mpeg,audio/wav,..."` (明示的MIMEタイプ列挙) → 効果なし
- `accept` 属性を削除 → 効果なし（すべてのファイルが選択可能になるはずだが、それでも音声ファイルが選択できないケースがある）

これはWebKitの既知バグであり、Apple Developer Forumsでも報告されている。iOS 26 beta時点でも修正されていない。

## 調査した代替手段

### 1. accept属性の修正 ❌ (効果なし)

```html
<!-- 試みたが効果なし -->
<input type="file" accept="audio/*">
<input type="file" accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a">
<input type="file"> <!-- accept属性なし -->
```

**結果**: iOS Safariの特定バージョンでは、accept属性の内容に関わらず音声ファイルがグレーアウトする。

### 2. URLからサーバー経由でfetch ✅ (実装済み、最も確実)

```
ユーザー → URLを入力 → vkomaサーバーがfetch → アセットとして保存
```

- サーバー側でURLのコンテンツを取得するため、クライアントのファイルピッカーを回避できる
- iOSの制限を完全に回避
- 音声ファイルをCloudStorage（例: Firebase Storage、Cloudflare R2等）や公開URLから追加可能

**制限**: CORSや認証が必要なURLは取得できない場合がある

### 3. MediaRecorder API（マイク録音） ✅ (実装済み)

```javascript
const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
const mimeType = MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm';
const recorder = new MediaRecorder(stream, { mimeType });
```

- iOS Safari 14.5以降でMediaRecorder APIがサポートされている
- `audio/mp4` (M4A/AAC) が優先的に使用可能（iOS SafariはMP4コンテナをネイティブサポート）
- `audio/webm` はフォールバック
- 既存の音声ファイルは使えないが、新規録音には対応

**制限**: マイクの権限が必要。既存ファイルのアップロードには使えない。

### 4. Web Share Target API ❌ (vkomaでは使用不可)

PWAがShareターゲットとして登録できれば、「共有」からvkomaに音声ファイルを送れる。
ただし、以下の理由で採用見送り:
- PWA登録（Service Worker + manifest.json）が必要
- ローカルサーバーで動作するvkomaでは設定が複雑
- iOSでのShare Target対応が不安定

### 5. iCloud Drive / Files App からのDropzone ❌ (根本解決にならない)

デスクトップのChromeでは、MacのFinderからドラッグ&ドロップで音声ファイルを追加できる。
iOSのSafariでは、ドロップゾーンへのドラッグ操作自体がサポートされていない。

### 6. `capture="microphone"` 属性 ⚠️ (限定的)

```html
<input type="file" accept="audio/*" capture="microphone">
```

- マイク録音にダイレクトに繋がるが、`.mov`（動画形式）で保存されることがある
- 既存ファイルの選択ができなくなる
- 使い勝手が悪いため採用見送り

### 7. IndexedDB経由 ❌ (根本解決にならない)

ファイルをIndexedDBに保存してから読み込む方法は、結局ファイル選択が必要なため解決策にならない。

### 8. WebRTC ❌ (別の用途)

WebRTCはリアルタイムの音声ストリーミング向けで、ファイルアップロードには適さない。

## 実装した対策

### 対策1: URLからアセット追加（サーバーサイドfetch）

**ファイル**: 
- `packages/server/src/index.ts` — `POST /api/projects/:id/assets/fetch-url` エンドポイント
- `packages/ui/src/components/AssetLibrary.tsx` — 「🌐 URL」ボタン

**UIフロー**:
1. 「🌐 URL」ボタンをタップ
2. URLを入力（例: `https://example.com/bgm.mp3`）
3. 「取得」ボタンをタップ
4. サーバーがURLからファイルを取得してプロジェクトのassetsに保存
5. アセット一覧に追加される

**APIエンドポイント**:
```
POST /api/projects/:id/assets/fetch-url
Content-Type: application/json

{
  "url": "https://example.com/audio.mp3",
  "filename": "custom-name.mp3"  // オプション
}

→ 201 Created
{
  "asset": { ... }
}
```

**特徴**:
- タイムアウト60秒（大きいファイル対応）
- Content-TypeヘッダーからMIMEタイプを自動判定
- URLからファイル名を自動推測
- HTTP/HTTPSのみ対応（セキュリティ対策）

### 対策2: マイク録音（MediaRecorder API）

**ファイル**: `packages/ui/src/components/AssetLibrary.tsx` — 「🎤 録音」ボタン

**UIフロー**:
1. 「🎤 録音」ボタンをタップ（音声タブまたは全タブで表示）
2. マイクの権限を許可
3. 録音開始（ボタンが「⏹ 停止」に変わる）
4. 「⏹ 停止」をタップして録音終了
5. 録音ファイルが自動でアップロードされアセット一覧に追加

**iOS Safari対応の工夫**:
```typescript
const mimeType = MediaRecorder.isTypeSupported('audio/mp4') 
  ? 'audio/mp4'  // iOS Safari: M4A/AACで録音
  : MediaRecorder.isTypeSupported('audio/webm') 
    ? 'audio/webm'  // Chrome/Firefox
    : '';  // フォールバック（ブラウザのデフォルト）
```

**ファイル命名**:
- `recording_<timestamp>.mp4` (iOS Safari)
- `recording_<timestamp>.webm` (Chrome/Firefox)

## 推奨ワークフロー（iOSユーザー向け）

### シナリオA: 既存音声ファイルをアップロードしたい

1. 音声ファイルをiCloud Drive、Google Drive、Dropbox等のクラウドストレージにアップロード
2. 共有リンク（公開URL）を取得
3. vKomaのアセットパネルで「🌐 URL」をタップ
4. URLを貼り付けて「取得」

### シナリオB: 新しい音声を録音したい

1. vKomaのアセットパネルで「🎤 録音」をタップ
2. マイクを許可して録音
3. 停止後、自動でアセットに追加される

### シナリオC: PCで編集してスマホで確認したい

1. PCのブラウザからファイル選択でアップロード（Windowsは問題なし）
2. スマホからWiFi経由でvKomaにアクセス
3. アセットはサーバーに保存済みなのでそのまま使える

## 技術的注意事項

### サーバーサイドfetchの制限

- **CORS**: URLがCORSを制限している場合でも、サーバーサイドfetchなのでブラウザのCORS制限は関係ない
- **認証**: Authorizationヘッダーが必要なURLは対応していない（将来実装予定）
- **大きいファイル**: タイムアウト60秒。大きいファイル（100MB以上）は失敗する可能性がある
- **プロトコル**: HTTP/HTTPSのみ。`file://` や `data:` URLは不可

### MediaRecorderの対応状況

| ブラウザ | 対応 | 出力形式 |
|---|---|---|
| iOS Safari 14.5+ | ✅ | audio/mp4 (M4A/AAC) |
| Chrome (Android/Desktop) | ✅ | audio/webm |
| Firefox | ✅ | audio/ogg または audio/webm |
| Safari (macOS) | ✅ | audio/mp4 |

### WebCodecs API（書き出し）のiOS対応

音声アップロードとは別件だが、vKomaの動画書き出しで使用するWebCodecs APIのiOS対応状況:
- iOS 16以降のSafariでWebCodecs APIをサポート
- ただし一部コーデックは非対応
- 非対応時はサーバーサイドエンコードにフォールバック予定

## 関連Issue / 参考リンク

- [react-dropzone issue #1039: iOS audio files grayed out](https://github.com/react-dropzone/react-dropzone/issues/1039)
- [gradio issue #4021: iOS Safari file upload](https://github.com/gradio-app/gradio/issues/4021)
- [Apple Developer Forums: file upload not working](https://developer.apple.com/forums/thread/737827)
- [MDN: MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [addpipe.com: Safari MediaRecorder PCM support](https://blog.addpipe.com/record-high-quality-audio-in-safari-with-alac-and-pcm-support-via-mediarecorder/)

## 変更履歴

| 日付 | バージョン | 内容 |
|---|---|---|
| 2026-03-16 | cf60216 | URLからのアセット追加、マイク録音機能を実装 |
| 2026-03-16 | dca4709 | accept属性にファイル拡張子を追加（効果限定的） |
| 2026-03-16 | 914ad52 | accept属性を明示的MIMEタイプに変更（効果なし） |
