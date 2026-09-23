import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

async function freshModule() {
  vi.resetModules();
  return import('./pi-api-status');
}

/** The refresh is fire-and-forget, so let its promise chain drain. */
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('pi-api-status', () => {
  beforeEach(() => {
    process.env.PI_API_KEY = 'some-key';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports ok:false when Pi rejects the key with 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401 }));
    const m = await freshModule();

    m.refreshPiApiStatusIfStale();
    await settle();

    const s = m.piApiStatus();
    expect(s.ok).toBe(false);
    expect(s.detail).toMatch(/rejected/i);
  });

  it('reports ok:true when Pi accepts the key (404 for a made-up id)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 404 }));
    const m = await freshModule();

    m.refreshPiApiStatusIfStale();
    await settle();

    expect(m.piApiStatus().ok).toBe(true);
  });

  it('reports ok:null — not false — when Pi is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    const m = await freshModule();

    m.refreshPiApiStatusIfStale();
    await settle();

    // A network blip must never be reported as a bad key.
    expect(m.piApiStatus().ok).toBeNull();
  });

  it('reports ok:false when the key is not set at all', async () => {
    delete process.env.PI_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const m = await freshModule();

    m.refreshPiApiStatusIfStale();
    await settle();

    expect(m.piApiStatus().ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('caches: a second call within the window does not re-probe', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ status: 404 });
    vi.stubGlobal('fetch', fetchSpy);
    const m = await freshModule();

    m.refreshPiApiStatusIfStale();
    await settle();
    m.refreshPiApiStatusIfStale();
    await settle();

    // /v1/health is Render's healthCheckPath and is hit constantly; probing Pi
    // on every request would be both slow and rate-limited.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
