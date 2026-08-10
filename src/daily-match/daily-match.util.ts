/**
 * Timezone helpers for Daily Match.
 *
 * Every user picks their own local delivery time (default 15:00) in their own
 * timezone, so the cron cannot compare raw UTC — it has to ask "what time is it
 * right now where this user is". Intl does that without pulling in a tz library.
 */

/** Minutes since local midnight for `date` in `timeZone`. */
export function localMinutes(date: Date, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    const [h, m] = parts.split(':').map(Number);
    return h * 60 + m;
  } catch {
    // Unknown/garbage timezone string — fall back to UTC rather than skipping
    // the user entirely, which would silently exclude them from matching.
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

/** "HH:mm" -> minutes since midnight. Returns null if malformed. */
export function parseHHmm(value: string | null | undefined): number | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * True when `now` falls inside the [target, target + windowMinutes) slot in the
 * user's local day. Wraps around midnight so a 23:55 match time still fires.
 */
export function isDue(now: Date, timeZone: string, hhmm: string, windowMinutes = 15): boolean {
  const target = parseHHmm(hhmm);
  if (target === null) return false;
  const current = localMinutes(now, timeZone);
  const diff = (current - target + 1440) % 1440;
  return diff < windowMinutes;
}

/** Start of the current local day, expressed as a UTC Date. */
export function localDayStart(now: Date, timeZone: string): Date {
  const mins = localMinutes(now, timeZone);
  return new Date(now.getTime() - mins * 60_000);
}

/** Non-empty intersection of two arrays (case-insensitive, trimmed). */
export function intersect(a: string[] = [], b: string[] = []): string[] {
  const normalise = (s: string) => s.trim().toLowerCase();
  const setB = new Set(b.map(normalise));
  return a.filter((item) => setB.has(normalise(item)));
}

/**
 * Mutual gender compatibility.
 *
 * lookingFor is a string[] on Profile (an existing column) and may contain
 * plural forms ("women") while gender is singular ("woman") — the same mismatch
 * that broke Discover's filters before, so both sides are canonicalised here.
 */
export function canon(value: string): string {
  const v = value.trim().toLowerCase();
  const map: Record<string, string> = {
    men: 'male', man: 'male', male: 'male', guys: 'male',
    women: 'female', woman: 'female', female: 'female', girls: 'female',
    everyone: 'all', all: 'all', any: 'all', both: 'all',
    other: 'other', 'non-binary': 'other', nonbinary: 'other',
  };
  return map[v] ?? v;
}

export function genderCompatible(
  aGender: string | null | undefined,
  aLookingFor: string[] = [],
  bGender: string | null | undefined,
  bLookingFor: string[] = [],
): boolean {
  // Missing data must not hard-block matching in a young app with sparse
  // profiles — treat an unset preference as "open to anyone".
  const aWants = aLookingFor.map(canon);
  const bWants = bLookingFor.map(canon);
  const aG = aGender ? canon(aGender) : null;
  const bG = bGender ? canon(bGender) : null;

  const aOk = aWants.length === 0 || aWants.includes('all') || (bG !== null && aWants.includes(bG));
  const bOk = bWants.length === 0 || bWants.includes('all') || (aG !== null && bWants.includes(aG));
  return aOk && bOk;
}
