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
    console.log('=== i18n INITIALIZED ===');
    console.log('Current language:', i18n.language);
    console.log('Detected language:', i18n.language);
    console.log('Available resources:', Object.keys(i18n.options.resources || {}));
    console.log('localStorage language:', localStorage.getItem('i18nextLng'));
    console.log('Resource bundle for current language:', !!i18n.getResourceBundle(i18n.language, 'translation'));
    console.log('Templates section in current language:', i18n.getResourceBundle(i18n.language, 'translation')?.templates);
    console.log('========================');
  });

// Add language change listener
i18n.on('languageChanged', (lng) => {
  console.log('=== LANGUAGE CHANGED ===');
  console.log('New language:', lng);
  console.log('localStorage updated to:', localStorage.getItem('i18nextLng'));
  
  // Check if resource bundle exists
  const hasBundle = i18n.hasResourceBundle(lng, 'translation');
  console.log('Resource bundle exists:', hasBundle);
  
  // Get the full resource bundle
  const bundle = i18n.getResourceBundle(lng, 'translation');
  console.log('Full resource bundle:', bundle);
  
  // Check templates section specifically
  console.log('Templates section:', bundle?.templates);
  console.log('Templates section type:', typeof bundle?.templates);
  
  // Check if we can access specific keys
  if (bundle?.templates) {
    console.log('newTemplate key:', bundle.templates.newTemplate);
    console.log('title key:', bundle.templates.title);
  }
});

export default i18n;