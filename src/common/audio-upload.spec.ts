import { describe, it, expect } from 'vitest';
import { isAudioUpload } from './audio-upload';

/** Pi Browser's WebView labels audio-only recordings "video/webm" — they must pass. */
describe('isAudioUpload', () => {
  const f = (mimetype: string, originalname = 'clip.webm', size = 4000) => ({ mimetype, originalname, size });

  it.each(['audio/webm', 'audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg', 'video/webm', 'video/webm;codecs=opus', 'video/mp4'])(
    'accepts %s', (type) => expect(isAudioUpload(f(type))).toBe(true),
  );

  it('accepts an untyped upload with an audio extension', () => {
    expect(isAudioUpload(f('application/octet-stream', 'voice-intro.webm'))).toBe(true);
    expect(isAudioUpload(f('', 'voice.m4a'))).toBe(true);
  });

  it.each(['image/png', 'text/plain', 'application/pdf', 'video/x-msvideo'])('rejects %s', (type) => {
    expect(isAudioUpload(f(type, 'x.bin'))).toBe(false);
  });

  it('rejects a missing or empty file', () => {
    expect(isAudioUpload(undefined)).toBe(false);
    expect(isAudioUpload(f('audio/webm', 'a.webm', 0))).toBe(false);
  });

  it('does not trust an extension when the type says something else', () => {
    expect(isAudioUpload(f('image/png', 'sneaky.webm'))).toBe(false);
  });
});
