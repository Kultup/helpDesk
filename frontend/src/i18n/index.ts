import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import ukTranslation from '../locales/uk/translation.json';
import enTranslation from '../locales/en/translation.json';
import plTranslation from '../locales/pl/translation.json';

const resources = {
  uk: {
    translation: ukTranslation,
  },
  en: {
    translation: enTranslation,
  },
  pl: {
    translation: plTranslation,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'uk',
    debug: process.env.NODE_ENV === 'development',
    
    interpolation: {
      escapeValue: false, // React already does escaping
    },
    
    detection: {
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'i18nextLng',
    },
    
    supportedLngs: ['uk', 'en', 'pl'],
    load: 'languageOnly',
    
    react: {
      useSuspense: false,
    },
  })
  .then(() => {
    const stored = localStorage.getItem('i18nextLng');
    if (!stored) {
      i18n.changeLanguage('uk');
      localStorage.setItem('i18nextLng', 'uk');
    }
  });

i18n.on('languageChanged', (lng) => {
  const hasBundle = i18n.hasResourceBundle(lng, 'translation');
  const bundle = i18n.getResourceBundle(lng, 'translation');
  
  if (bundle?.templates) {
    // Templates section exists
  }
});

export default i18n;