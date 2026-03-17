const MIME_TYPE_MAP = {
    // image
    'image/png': 'image',
    'image/jpeg': 'image',
    'image/jpg': 'image',
    'image/gif': 'image',
    'image/webp': 'image',
    'image/svg+xml': 'image',
    'image/bmp': 'image',
    'image/tiff': 'image',
    // video
    'video/mp4': 'video',
    'video/webm': 'video',
    'video/ogg': 'video',
    'video/quicktime': 'video',
    'video/x-msvideo': 'video',
    'video/mpeg': 'video',
    // audio
    'audio/mpeg': 'audio',
    'audio/mp3': 'audio',
    'audio/mp4': 'audio',
    'audio/wav': 'audio',
    'audio/x-m4a': 'audio',
    'audio/3gpp': 'audio',
    'audio/ogg': 'audio',
    'audio/aac': 'audio',
    'audio/flac': 'audio',
    'audio/webm': 'audio',
    'audio/x-wav': 'audio',
    // font
    'font/ttf': 'font',
    'font/otf': 'font',
    'font/woff': 'font',
    'font/woff2': 'font',
    'application/font-woff': 'font',
    'application/font-woff2': 'font',
    'application/x-font-ttf': 'font',
    'application/x-font-otf': 'font',
};
/**
 * MIMEタイプからAssetTypeを返す。未対応のMIMEタイプはnullを返す。
 */
export function getAssetType(mimeType) {
    return MIME_TYPE_MAP[mimeType] ?? null;
}
/**
 * アセット配列を指定したAssetTypeでフィルタして返す。
 */
export function getAssetsByType(assets, type) {
    return assets.filter((a) => a.type === type);
}
