// Утиліти для роботи з датами
import i18n from '../i18n';

// Мапінг мов для локалізації дат
const localeMap: { [key: string]: string } = {
  'uk': 'uk-UA',
  'en': 'en-US',
  'pl': 'pl-PL'
};

// Отримання поточної локалі з i18n або за замовчуванням
const getCurrentLocale = (): string => {
  const currentLanguage = i18n.language || 'uk';
  return localeMap[currentLanguage] || 'uk-UA';
};

export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString(getCurrentLocale(), {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatDateShort = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString(getCurrentLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
};

// Функція для форматування дати з кастомними опціями
export const formatDateWithLocale = (date: string | Date, options?: Intl.DateTimeFormatOptions): string => {
  const d = new Date(date);
  return d.toLocaleDateString(getCurrentLocale(), options);
};

export const getRelativeTime = (date: string | Date): string => {
  const now = new Date();
  const target = new Date(date);
  const diffInMs = now.getTime() - target.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'щойно';
  if (diffInMinutes < 60) return `${diffInMinutes} хв тому`;
  if (diffInHours < 24) return `${diffInHours} год тому`;
  if (diffInDays < 7) return `${diffInDays} дн тому`;
  
  return formatDateShort(date);
};