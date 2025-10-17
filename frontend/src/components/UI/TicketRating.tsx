import React from 'react';
import { cn } from '../../utils';

interface TicketRatingProps {
  rating?: number;
  feedback?: string;
  ratedAt?: string;
  showFeedback?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const TicketRating: React.FC<TicketRatingProps> = ({
  rating,
  feedback,
  ratedAt,
  showFeedback = false,
  size = 'md',
  className
}) => {
  if (!rating) {
    return null;
  }

  const sizeClasses = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-lg'
  };

  const starSizes = {
    sm: 'w-3 h-3',
    md: 'w-4 h-4',
    lg: 'w-5 h-5'
  };

  const renderStars = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <svg
          key={i}
          className={cn(
            starSizes[size],
            i <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'
          )}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      );
    }
    return stars;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('uk-UA', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className={cn('flex flex-col gap-1', sizeClasses[size], className)}>
      <div className="flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {renderStars()}
        </div>
        <span className="text-gray-600 font-medium">
          {rating}/5
        </span>
        {ratedAt && (
          <span className="text-gray-400 text-xs ml-2">
            {formatDate(ratedAt)}
          </span>
        )}
      </div>
      
      {showFeedback && feedback && (
        <div className="mt-1">
          <p className="text-gray-700 text-sm italic">
            "{feedback}"
          </p>
        </div>
      )}
    </div>
  );
};

export default TicketRating;