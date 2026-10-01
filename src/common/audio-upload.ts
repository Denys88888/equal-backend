/**
 * Voice clips recorded in a browser are WebM/Opus (Chrome, Android WebView) or
 * MP4/AAC (Safari). Several Android WebViews — Pi Browser among them — label an
 * audio-only MediaRecorder blob "video/webm", so a plain `audio/*` check
 * rejected every voice intro and voice message recorded there with "File must
 * be audio", and the app only said "Couldn't save voice intro".
 */
const AUDIO_TYPES = /^(audio\/[\w.+-]+|video\/(webm|mp4|ogg|quicktime))(;.*)?$/i;
const AUDIO_EXTENSIONS = /\.(webm|ogg|oga|opus|m4a|mp4|mp3|wav|aac)$/i;

export function isAudioUpload(file: { mimetype?: string; originalname?: string; size?: number } | undefined): boolean {
  if (!file || !file.size) return false;
  const type = file.mimetype ?? '';
  if (AUDIO_TYPES.test(type)) return true;
  // Some WebViews send no useful type at all; trust a known audio extension then.
  return (type === '' || type === 'application/octet-stream') && AUDIO_EXTENSIONS.test(file.originalname ?? '');
}

export type AudioUploadEvent = {
  at: string;
  route: 'voice-intro' | 'voice-message';
  /** What the client declared — the thing to look at when an upload is refused. */
  mimetype: string | null;
  size: number;
  outcome: 'ok' | 'rejected' | 'storage_error';
  error?: string;
};

let last: AudioUploadEvent | null = null;

/**
 * The last voice upload's type, size and outcome, exposed on /v1/health (no
 * user ids, no content), so a failed upload on a device can be diagnosed with
 * one curl instead of guessing.
 */
export function recordAudioUpload(
  route: AudioUploadEvent['route'],
  file: { mimetype?: string; size?: number } | undefined,
  outcome: AudioUploadEvent['outcome'],
  error?: string,
) {
  last = {
    at: new Date().toISOString(),
    route,
    mimetype: file?.mimetype ?? null,
    size: file?.size ?? 0,
    outcome,
    ...(error ? { error: error.slice(0, 200) } : {}),
  };
}

export function audioUploadDiagnostics() {
  return last;
}
