import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TicketStatus, TicketPriority } from '../types';

// Утиліта для об'єднання класів Tailwind
export function cn(...inputs: ClassValue[]): string {
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

// Утиліти для пріоритетів
export const getPriorityColor = (priority: TicketPriority): string => {
  const colors = {
    [TicketPriority.LOW]: 'bg-blue-100 text-blue-800 border-blue-200',
    [TicketPriority.MEDIUM]: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    [TicketPriority.HIGH]: 'bg-red-100 text-red-800 border-red-200'
  };
  return colors[priority] || colors[TicketPriority.LOW];
};

// Утиліта для дебаунсу
export const debounce = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
