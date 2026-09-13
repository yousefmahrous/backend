import { DEFAULT_LANG, isSupportedLang } from './i18n.js';

export function pickLocalized(value, lang = DEFAULT_LANG) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const safeLang = isSupportedLang(lang) ? lang : DEFAULT_LANG;
  return value[safeLang] || value.ar || value.en || '';
}