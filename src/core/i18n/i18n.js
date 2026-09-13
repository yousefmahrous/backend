import i18next from 'i18next';
import ar from './locales/ar.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };

export const SUPPORTED_LANGS = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';

export function isSupportedLang(value) {
  return typeof value === 'string' && SUPPORTED_LANGS.includes(value);
}

i18next.init({
  lng: DEFAULT_LANG,
  fallbackLng: DEFAULT_LANG,
  supportedLngs: SUPPORTED_LANGS,
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function i18nMiddleware(req, res, next) {
  const headerLang = req.headers['x-lang'];
  const cookieLang = req.cookies?.lang;
  const lang = isSupportedLang(headerLang) ? headerLang : isSupportedLang(cookieLang) ? cookieLang : DEFAULT_LANG;

  req.lang = lang;
  req.t = i18next.getFixedT(lang);
  next();
}

export default i18next;