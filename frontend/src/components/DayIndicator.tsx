import React from 'react';
import { cn } from '../utils';

interface DayIndicatorProps {
  date: string | Date;
  className?: string;
  showRelative?: boolean;
}

const DayIndicator: React.FC<DayIndicatorProps> = ({ 
  date, 
  className = '', 
  showRelative = true 
}) => {
  const targetDate = new Date(date);
  const now = new Date();
  const diffInMs = now.getTime() - targetDate.getTime();
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  const getDayText = () => {
    if (!showRelative) {
      return targetDate.toLocaleDateString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });
    }

    if (diffInDays === 0) return 'Сьогодні';
    if (diffInDays === 1) return 'Вчора';
    if (diffInDays === -1) return 'Завтра';
    if (diffInDays > 1) return `${diffInDays} дн тому`;
    if (diffInDays < -1) return `Через ${Math.abs(diffInDays)} дн`;
    
    return targetDate.toLocaleDateString('uk-UA', {
      day: '2-digit',
      month: '2-digit'
    });
  };

  const getColorClass = () => {
    if (diffInDays === 0) return 'text-green-600 bg-green-50 border-green-200';
    if (diffInDays === 1) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (diffInDays > 1 && diffInDays <= 7) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (diffInDays > 7) return 'text-gray-600 bg-gray-50 border-gray-200';
    if (diffInDays < 0) return 'text-purple-600 bg-purple-50 border-purple-200';
    
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-1 rounded-md text-xs font-medium border',
        getColorClass(),
        className
      )}
      title={targetDate.toLocaleDateString('uk-UA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })}
    >
      {getDayText()}
    </span>
  );
};

export default DayIndicator;