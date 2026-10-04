import { describe, it, expect } from 'vitest';
import { PUSH_KEYS, PUSH_LOCALES, PUSH_ROW_LENGTHS, pushText } from './push-texts';

/** A missing row or a dropped {name} would put a blank into someone's lock screen. */
describe('push texts', () => {
  const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

  it('ships every language the app does', () => {
    expect(PUSH_LOCALES.sort()).toEqual([
      'ar', 'bn', 'cs', 'da', 'de', 'el', 'en', 'es', 'fa', 'fi', 'fil', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it',
      'ja', 'ko', 'ms', 'nl', 'no', 'pl', 'pt', 'ro', 'ru', 'sv', 'sw', 'ta', 'th', 'tr', 'uk', 'vi', 'zh',
    ]);
  });

  it.each(PUSH_LOCALES)('%s has every key, with the same placeholders as English', (locale) => {
    expect(PUSH_ROW_LENGTHS[locale], `${locale} row length`).toBe(PUSH_KEYS.length);
    for (const key of PUSH_KEYS) {
      const raw = pushText(locale, key, { name: '{name}', hours: '{hours}' });
      const en = pushText('en', key, { name: '{name}', hours: '{hours}' });
      expect(raw, `${locale}.${key}`).toBeTruthy();
      expect(placeholders(raw), `${locale}.${key}`).toBe(placeholders(en));
    }
  });
});
