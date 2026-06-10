import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { es } from './es';
import { en } from './en';

const STORAGE_KEY = 'genesis-lang';

function initialLang(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* private mode */
  }
  // Spanish is the default; users can switch with the language toggle.
  return 'es';
}

void i18n.use(initReactI18next).init({
  resources: {
    es: { translation: es },
    en: { translation: en },
  },
  lng: initialLang(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export function setLanguage(lng: 'es' | 'en'): void {
  void i18n.changeLanguage(lng);
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
}

export function currentLanguage(): string {
  return i18n.language;
}

export default i18n;
