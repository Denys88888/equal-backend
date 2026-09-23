/**
 * Is PI_API_KEY actually accepted by Pi right now?
 *
 * A dead key makes every approve/complete fail with a Pi 401, which surfaces to
 * the user as a payment that hangs and then fails — with nothing anywhere
 * saying "the key is invalid". This exposes it on /v1/health instead, so the
 * question is one curl away rather than an afternoon of guessing.
 *
 * The probe is cached and refreshed in the background: /v1/health is Render's
 * healthCheckPath, so it must stay instant and must never fail because Pi is
 * unreachable, or a Pi outage would restart-loop the service.
 */
const MAX_AGE_MS = 5 * 60 * 1000;
const PROBE_URL = 'https://api.minepi.com/v2/payments/health_probe_nonexistent';

type Status = { ok: boolean | null; detail: string; checkedAt: number };

let cache: Status = { ok: null, detail: 'not checked yet', checkedAt: 0 };
let inFlight = false;

export function piApiStatus(): { ok: boolean | null; detail: string; checkedAt: string | null } {
  return {
    ok: cache.ok,
    detail: cache.detail,
    checkedAt: cache.checkedAt ? new Date(cache.checkedAt).toISOString() : null,
  };
}

/** Fire-and-forget; never throws, never awaited by the health handler. */
export function refreshPiApiStatusIfStale(): void {
  if (inFlight || Date.now() - cache.checkedAt < MAX_AGE_MS) return;
  inFlight = true;

  void (async () => {
    const key = process.env.PI_API_KEY;
    if (!key) {
      cache = { ok: false, detail: 'PI_API_KEY is not set', checkedAt: Date.now() };
      inFlight = false;
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(PROBE_URL, {
        headers: { Authorization: `Key ${key}` },
        signal: controller.signal,
      });
      // 401 is the key being rejected. Any other status (404 for this made-up
      // id, say) means Pi accepted the key and simply had nothing to return.
      cache =
        res.status === 401
          ? {
              ok: false,
              detail: 'Pi rejected PI_API_KEY (401) — approve/complete cannot work; issue a new key in the Pi Developer Portal',
              checkedAt: Date.now(),
            }
          : { ok: true, detail: `Pi accepted PI_API_KEY (probe HTTP ${res.status})`, checkedAt: Date.now() };
    } catch (err) {
      // Unknown, not false: a network blip must not be reported as a bad key.
      cache = { ok: null, detail: `could not reach Pi API: ${(err as Error).message}`, checkedAt: Date.now() };
    } finally {
      clearTimeout(timer);
      inFlight = false;
    }
  })();
}
