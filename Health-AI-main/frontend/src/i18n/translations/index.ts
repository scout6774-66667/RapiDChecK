import { en } from './en';
import { hi } from './hi';
import { bn } from './bn';

export type Language = 'en' | 'hi' | 'bn';

export type TranslationSchema = typeof en;

export const translations: Record<Language, TranslationSchema> = {
  en,
  hi,
  bn,
};

export { en, hi, bn };
