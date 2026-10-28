/**
 * The last errors the app hit on people's phones, on /v1/health.
 *
 * Pi Browser has no console we can read on a real phone, and a crash there is
 * reported as "white screen" and nothing else. The app sends what broke here;
 * health shows the newest few. No user data: the error text, the screen with
 * ids blanked out, and the phone's OS/browser version.
 */
export type ClientError = {
  at: string;
  kind: string;
  message: string;
  where: string;
  device: string;
};

const KEEP = 8;
const recent: ClientError[] = [];
let total = 0;

/** "#/chat/cmabc123…" → "#/chat/:id": routes say which screen, ids say whose. */
export function screenOf(where: unknown): string {
  if (typeof where !== 'string') return '';
  return where
    .slice(0, 120)
    .replace(/\/[A-Za-z0-9_-]{16,}/g, '/:id')
    .replace(/\?.*$/, '');
}

/** Just enough of the user agent to tell an old iPhone from a new Android. */
export function deviceOf(userAgent: unknown): string {
  if (typeof userAgent !== 'string') return '';
  const ios = userAgent.match(/iPhone OS (\d+[_\d]*)/);
  if (ios) return `iOS ${ios[1].replace(/_/g, '.')}`;
  const android = userAgent.match(/Android (\d+(?:\.\d+)?)/);
  const chrome = userAgent.match(/Chrome\/(\d+)/);
  if (android) return `Android ${android[1]}${chrome ? ` WebView ${chrome[1]}` : ''}`;
  return userAgent.slice(0, 40);
}

export function recordClientError(e: { kind?: unknown; message?: unknown; where?: unknown }, userAgent: unknown) {
  total += 1;
  recent.unshift({
    at: new Date().toISOString(),
    kind: typeof e.kind === 'string' ? e.kind.slice(0, 20) : 'error',
    message: typeof e.message === 'string' ? e.message.slice(0, 300) : String(e.message).slice(0, 300),
    where: screenOf(e.where),
    device: deviceOf(userAgent),
  });
  recent.length = Math.min(recent.length, KEEP);
}

export function clientErrorDiagnostics() {
  return { total, recent };
}
