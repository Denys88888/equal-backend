import { Injectable } from '@nestjs/common';

// bad-words@3 is CommonJS and has no bundled types.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Filter = require('bad-words');

/**
 * Profanity filtering for user-authored chat text.
 *
 * bad-words only ships an English list, and this app runs in 35 locales, so a
 * small extra list covers the languages the Daily Match audience actually uses
 * (pl/ru/id/vi). This will never be exhaustive — it is a politeness filter,
 * not a moderation system. Real abuse is handled by report + auto-ban.
 */
@Injectable()
export class ProfanityService {
  private readonly filter: { clean: (s: string) => string; isProfane: (s: string) => boolean; addWords: (...w: string[]) => void };

  constructor() {
    this.filter = new Filter();
    this.filter.addWords(
      // pl
      'kurwa', 'chuj', 'pierdol', 'jebac', 'jebać', 'skurwysyn', 'spierdalaj',
      // ru / uk
      'блядь', 'блять', 'сука', 'хуй', 'пизда', 'ебать', 'ебал', 'мудак', 'пидор',
      // id
      'anjing', 'bangsat', 'kontol', 'memek', 'ngentot',
      // vi
      'địtme', 'đụmá', 'concặc', 'lồn',
    );
  }

  /** Replaces profane words with asterisks. Never throws on odd input. */
  clean(text: string): string {
    if (!text) return text;
    try {
      return this.filter.clean(text);
    } catch {
      return text;
    }
  }

  isProfane(text: string): boolean {
    if (!text) return false;
    try {
      return this.filter.isProfane(text);
    } catch {
      return false;
    }
  }
}
