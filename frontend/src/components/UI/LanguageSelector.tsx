import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { useClickOutside } from '../../hooks';

// SVG прапори країн
const UkraineFlagIcon = () => (
  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="7.5" fill="#005BBB"/>
    <rect y="7.5" width="20" height="7.5" fill="#FFD500"/>
  </svg>
);

const UKFlagIcon = () => (
  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="15" fill="#012169"/>
    <path d="M0 0L20 15M20 0L0 15" stroke="white" strokeWidth="2"/>
    <path d="M0 0L20 15M20 0L0 15" stroke="#C8102E" strokeWidth="1"/>
    <rect x="8" y="0" width="4" height="15" fill="white"/>
    <rect x="0" y="6" width="20" height="3" fill="white"/>
    <rect x="8.5" y="0" width="3" height="15" fill="#C8102E"/>
    <rect x="0" y="6.5" width="20" height="2" fill="#C8102E"/>
  </svg>
);

const PolandFlagIcon = () => (
  <svg width="20" height="15" viewBox="0 0 20 15" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="20" height="7.5" fill="white"/>
    <rect y="7.5" width="20" height="7.5" fill="#DC143C"/>
  </svg>
);

interface Language {
  code: string;
  name: string;
  flag: React.ComponentType;
}

const languages: Language[] = [
  { code: 'uk', name: 'Українська', flag: UkraineFlagIcon },
  { code: 'en', name: 'English', flag: UKFlagIcon },
  { code: 'pl', name: 'Polski', flag: PolandFlagIcon },
];

const LanguageSelector: React.FC = () => {
  const { i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useClickOutside(() => setIsOpen(false));

  const currentLanguage = languages.find(lang => lang.code === i18n.language) || languages[0];

  const handleLanguageChange = (languageCode: string) => {
    console.log('=== LANGUAGE SELECTOR DEBUG ===');
    console.log('Attempting to change language to:', languageCode);
    console.log('Current language before change:', i18n.language);
    console.log('Available languages in i18n:', Object.keys(i18n.store.data));
    console.log('localStorage before change:', localStorage.getItem('i18nextLng'));
    
    i18n.changeLanguage(languageCode).then(() => {
      console.log('Language change completed');
      console.log('New current language:', i18n.language);
      console.log('localStorage after change:', localStorage.getItem('i18nextLng'));
      console.log('Current resource bundle:', i18n.getResourceBundle(languageCode, 'translation'));
    }).catch((error: any) => {
      console.error('Language change failed:', error);
    });
    
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors duration-200 border border-gray-200"
      >
        <currentLanguage.flag />
        <span className="text-sm font-medium text-gray-700 hidden sm:block">
          {currentLanguage.name}
        </span>
        <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {languages.map((language) => {
            const FlagComponent = language.flag;
            const isSelected = language.code === i18n.language;
            
            return (
              <button
                key={language.code}
                onClick={() => handleLanguageChange(language.code)}
                className={`flex items-center space-x-3 w-full px-4 py-2 text-sm hover:bg-gray-100 transition-colors duration-200 ${
                  isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                }`}
              >
                <FlagComponent />
                <span className="font-medium">{language.name}</span>
                {isSelected && (
                  <div className="ml-auto w-2 h-2 bg-blue-600 rounded-full"></div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LanguageSelector;