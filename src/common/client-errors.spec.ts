import { describe, it, expect } from 'vitest';
import { clientErrorDiagnostics, deviceOf, recordClientError, screenOf } from './client-errors';

describe('client error reports', () => {
  it('names the screen without whose it was', () => {
    expect(screenOf('#/chat/cmvfv6ufb0002f56ojo4vtsnv')).toBe('#/chat/:id');
    expect(screenOf('#/profile/cmvfv6ufb0002f56ojo4vtsnv?from=admin')).toBe('#/profile/:id');
    expect(screenOf('#/discover')).toBe('#/discover');
  });

  it('keeps only the OS and browser version of the phone', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 16_7_10 like Mac OS X) AppleWebKit/605.1.15')).toBe('iOS 16.7.10');
    expect(deviceOf('Mozilla/5.0 (Linux; Android 15; Pixel 6 Build/AP3A; wv) AppleWebKit/537.36 Chrome/124.0.6367.219 Mobile')).toBe('Android 15 WebView 124');
  });

  it('shows the newest few, trimmed', () => {
    for (let i = 0; i < 12; i++) recordClientError({ kind: 'render', message: `boom ${i}`, where: '#/chat/x' }, 'iPhone OS 17_1');
    recordClientError({ kind: 'error', message: 'x'.repeat(1000) }, undefined);
    const { total, recent } = clientErrorDiagnostics();
    expect(total).toBe(13);
    expect(recent).toHaveLength(8);
    expect(recent[0].message).toHaveLength(300);
    expect(recent[1].message).toBe('boom 11');
  });
});
