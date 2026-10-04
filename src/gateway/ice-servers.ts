/**
 * ICE servers for video calls.
 *
 * STUN alone only connects a call when at least one side can be reached
 * directly. Between two phones on mobile data (carrier-grade NAT) the media has
 * to go through a TURN relay, or the call rings, is accepted, and never
 * connects. The free Open Relay Project the app used to fall back to now
 * answers every allocation with "400" (checked from a browser on 2026-10-05),
 * so the relay has to come from configuration:
 *
 *  - CLOUDFLARE_TURN_KEY_ID + CLOUDFLARE_TURN_API_TOKEN — Cloudflare Realtime
 *    TURN. Short-lived credentials are generated server-side and cached, so
 *    the API token never reaches the browser.
 *  - TURN_URLS (comma-separated) + TURN_USERNAME + TURN_CREDENTIAL — any other
 *    TURN server with static credentials.
 *
 * With neither, calls still work wherever a direct path exists (same Wi-Fi,
 * most home networks).
 */

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const STUN: IceServer = { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] };
const CLOUDFLARE_TTL_SECONDS = 24 * 60 * 60;

let cache: { servers: IceServer[]; until: number } | null = null;
let lastError: { at: string; message: string } | null = null;

export type TurnProvider = 'cloudflare' | 'static' | 'none';

export function turnProvider(): TurnProvider {
  if (process.env.CLOUDFLARE_TURN_KEY_ID && process.env.CLOUDFLARE_TURN_API_TOKEN) return 'cloudflare';
  if (process.env.TURN_URLS && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) return 'static';
  return 'none';
}

/** For /v1/health: which relay calls use, and why it last failed. */
export function turnDiagnostics() {
  return { provider: turnProvider(), last_error: lastError };
}

/** Test hook. */
export function resetIceServerCache() {
  cache = null;
  lastError = null;
}

const toList = (urls: string | string[]) => (Array.isArray(urls) ? urls : [urls]);

/**
 * Cloudflare also lists port-53 URLs; browsers refuse that port and each one
 * just times out, slowing ICE gathering. Cloudflare's own docs say to drop them.
 */
function withoutPort53(server: IceServer): IceServer | null {
  const urls = toList(server.urls).filter((u) => !/:53(\?|$)/.test(u));
  return urls.length ? { ...server, urls } : null;
}

async function cloudflareServers(fetchImpl: typeof fetch): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const res = await fetchImpl(
    `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(keyId!)}/credentials/generate-ice-servers`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.CLOUDFLARE_TURN_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ttl: CLOUDFLARE_TTL_SECONDS }),
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) throw new Error(`Cloudflare TURN answered HTTP ${res.status}`);
  const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
  const raw = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
  const servers = raw.map(withoutPort53).filter((s): s is IceServer => s !== null);
  if (!servers.some((s) => toList(s.urls).some((u) => u.startsWith('turn')))) {
    throw new Error('Cloudflare returned no TURN server');
  }
  return servers;
}

export async function iceServers(fetchImpl: typeof fetch = fetch): Promise<IceServer[]> {
  switch (turnProvider()) {
    case 'static':
      return [
        STUN,
        {
          urls: process.env.TURN_URLS!.split(',').map((u) => u.trim()).filter(Boolean),
          username: process.env.TURN_USERNAME,
          credential: process.env.TURN_CREDENTIAL,
        },
      ];
    case 'cloudflare':
      if (cache && cache.until > Date.now()) return cache.servers;
      try {
        const servers = [STUN, ...(await cloudflareServers(fetchImpl))];
        // Refreshed at half the credential lifetime, so a call never starts
        // with credentials about to expire.
        cache = { servers, until: Date.now() + (CLOUDFLARE_TTL_SECONDS / 2) * 1000 };
        lastError = null;
        return servers;
      } catch (err) {
        lastError = { at: new Date().toISOString(), message: String((err as Error)?.message ?? err).slice(0, 200) };
        console.error('[calls] could not get TURN credentials:', lastError.message);
        // Direct calls still work; only relayed ones need TURN.
        return [STUN];
      }
    default:
      return [STUN];
  }
}
