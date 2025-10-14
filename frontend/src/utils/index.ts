import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TicketStatus, TicketPriority } from '../types';

// Утиліта для об'єднання класів Tailwind
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Утиліти для форматування дат
export const formatDate = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('uk-UA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

// Експорт функції з dateUtils для локалізованого форматування
export { formatDateWithLocale } from './dateUtils';

export const formatDateShort = (date: string | Date): string => {
  const d = new Date(date);
  return d.toLocaleDateString('uk-UA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });
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

export const formatDaysAgo = (date: string | Date): string => {
  const now = new Date();
  const target = new Date(date);
  const diffInMs = now.getTime() - target.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) return 'Сьогодні';
  if (diffInDays === 1) return 'Вчора';
  if (diffInDays > 1) return `${diffInDays} дн тому`;
  if (diffInDays === -1) return 'Завтра';
  if (diffInDays < -1) return `Через ${Math.abs(diffInDays)} дн`;
  
  return formatDateShort(date);
};

export const getDueDateStatus = (dueDate: string | Date | null): 'overdue' | 'due-soon' | 'normal' | 'no-due-date' => {
  if (!dueDate) return 'no-due-date';
  
  const now = new Date();
  const due = new Date(dueDate);
  const diffInMs = due.getTime() - now.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInDays < 0) return 'overdue';
  if (diffInDays <= 2) return 'due-soon';
  return 'normal';
};

// Утиліти для статусів тикетів
export const getStatusColor = (status: TicketStatus): string => {
  const colors = {
    [TicketStatus.OPEN]: 'bg-red-100 text-red-800 border-red-200',
    [TicketStatus.IN_PROGRESS]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [TicketStatus.RESOLVED]: 'bg-green-100 text-green-800 border-green-200',
    [TicketStatus.CLOSED]: 'bg-gray-100 text-gray-800 border-gray-200'
  };
  return colors[status] || colors[TicketStatus.OPEN];
};

export const getStatusText = (status: TicketStatus): string => {
  const texts = {
    [TicketStatus.OPEN]: 'Відкритий',
    [TicketStatus.IN_PROGRESS]: 'В роботі',
    [TicketStatus.RESOLVED]: 'Вирішений',
    [TicketStatus.CLOSED]: 'Закритий'
  };
  return texts[status] || 'Невідомий';
};

// Утиліти для пріоритетів
export const getPriorityColor = (priority: TicketPriority): string => {
  const colors = {
    [TicketPriority.LOW]: 'bg-blue-100 text-blue-800 border-blue-200',
    [TicketPriority.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [TicketPriority.HIGH]: 'bg-red-100 text-red-800 border-red-200'
  };
  return colors[priority] || colors[TicketPriority.LOW];
};

export const getPriorityText = (priority: TicketPriority): string => {
  const texts = {
    [TicketPriority.LOW]: 'Низький',
    [TicketPriority.MEDIUM]: 'Середній',
    [TicketPriority.HIGH]: 'Високий'
  };
  return texts[priority] || 'Невідомий';
};

// Додаткові утиліти для badge кольорів
export const getStatusBadgeColor = (status: TicketStatus): string => {
  return getStatusColor(status);
};

export const getPriorityBadgeColor = (priority: TicketPriority): string => {
  return getPriorityColor(priority);
};

// Утиліта для валідації email
export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Утиліта для генерації кольорів для графіків
export const generateColors = (count: number): string[] => {
  const baseColors = [
    '#E74C3C', '#3498DB', '#2ECC71', '#F39C12', '#9B59B6',
    '#1ABC9C', '#E67E22', '#34495E', '#95A5A6', '#F1C40F'
  ];
  
  const colors = [];
  for (let i = 0; i < count; i++) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
};

// Утиліта для скорочення тексту
export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

// Утиліта для форматування розміру файлу
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Утиліта для дебаунсу
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

// Утиліта для копіювання в буфер обміну
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy text: ', err);
    return false;
  }
};

// Утиліта для перевірки мобільного пристрою
export const isMobile = (): boolean => {
  return window.innerWidth < 768;
};

// Утиліта для генерації унікального ID
export const generateId = (): string => {
  return Math.random().toString(36).substr(2, 9);
};

// Утиліта для сортування масивів
export const sortBy = <T>(
  array: T[],
  key: keyof T,
  direction: 'asc' | 'desc' = 'asc'
): T[] => {
  return [...array].sort((a, b) => {
    const aVal = a[key];
    const bVal = b[key];
    
    if (aVal < bVal) return direction === 'asc' ? -1 : 1;
    if (aVal > bVal) return direction === 'asc' ? 1 : -1;
    return 0;
  });
};

// Утиліта для групування масивів
export const groupBy = <T>(
  array: T[],
  key: keyof T
): Record<string, T[]> => {
  return array.reduce((groups, item) => {
    const group = String(item[key]);
    groups[group] = groups[group] || [];
    groups[group].push(item);
    return groups;
  }, {} as Record<string, T[]>);
};