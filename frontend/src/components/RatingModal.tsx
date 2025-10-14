import React, { useState } from 'react';
import { Star, StarIcon } from 'lucide-react';
import api from '../services/api';

interface RatingModalProps {
  show: boolean;
  onHide: () => void;
  ticketId: string;
  onRatingSubmitted?: () => void;
}

interface RatingData {
  overallRating: number;
  categoryRatings: {
    speed: number;
    quality: number;
    communication: number;
    professionalism: number;
  };
  wouldRecommend: boolean;
}

const RatingModal: React.FC<RatingModalProps> = ({ 
  show, 
  onHide, 
  ticketId, 
  onRatingSubmitted 
}) => {
  const [rating, setRating] = useState<RatingData>({
    overallRating: 0,
    categoryRatings: {
      speed: 0,
      quality: 0,
      communication: 0,
      professionalism: 0
    },
    wouldRecommend: false
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStarClick = (field: string, value: number) => {
    if (field === 'overall') {
      setRating(prev => ({ ...prev, overallRating: value }));
    } else {
      setRating(prev => ({
        ...prev,
        categoryRatings: {
          ...prev.categoryRatings,
          [field]: value
        }
      }));
    }
  };

  const renderStars = (field: string, currentValue: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <button
          key={i}
          type="button"
          onClick={() => handleStarClick(field, i)}
          className="p-1 hover:scale-110 transition-transform"
        >
          <Star
            size={24}
            className={`${
              i <= currentValue 
                ? 'fill-yellow-400 text-yellow-400' 
                : 'text-gray-300 hover:text-yellow-300'
            } transition-colors`}
          />
        </button>
      );
    }
    return <div className="flex items-center gap-1">{stars}</div>;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      await api.post('/ratings', {
        ticket: ticketId,
        overallRating: rating.overallRating,
        categoryRatings: rating.categoryRatings,
        wouldRecommend: rating.wouldRecommend
      });

      if (onRatingSubmitted) {
        onRatingSubmitted();
      }
      onHide();
    } catch (error: any) {
      console.error('Помилка відправки рейтингу:', error);
      setError(error.response?.data?.message || 'Помилка відправки рейтингу');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = () => {
    return rating.overallRating > 0 && 
           rating.categoryRatings.speed > 0 &&
           rating.categoryRatings.quality > 0 &&
           rating.categoryRatings.communication > 0 &&
           rating.categoryRatings.professionalism > 0;
  };

  const handleClose = () => {
    setRating({
      overallRating: 0,
      categoryRatings: {
        speed: 0,
        quality: 0,
        communication: 0,
        professionalism: 0
      },
      wouldRecommend: false
    });
    setError(null);
    onHide();
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-2">
            <Star className="text-yellow-400" size={24} />
            <h2 className="text-xl font-semibold">Оцініть якість роботи</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        {/* Body */}
        <div className="p-6">
          <p className="text-gray-600 mb-6">
            Ваш відгук допоможе нам покращити якість обслуговування
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Загальна оцінка */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Загальна оцінка <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                {renderStars('overall', rating.overallRating)}
                <span className="text-gray-500 text-sm">
                  ({rating.overallRating > 0 ? rating.overallRating : 'Не обрано'}/5)
                </span>
              </div>
            </div>

            {/* Оцінки за категоріями */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Швидкість <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  {renderStars('speed', rating.categoryRatings.speed)}
                  <span className="text-gray-500 text-sm">
                    ({rating.categoryRatings.speed > 0 ? rating.categoryRatings.speed : 'Не обрано'}/5)
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Якість <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  {renderStars('quality', rating.categoryRatings.quality)}
                  <span className="text-gray-500 text-sm">
                    ({rating.categoryRatings.quality > 0 ? rating.categoryRatings.quality : 'Не обрано'}/5)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Комунікація <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  {renderStars('communication', rating.categoryRatings.communication)}
                  <span className="text-gray-500 text-sm">
                    ({rating.categoryRatings.communication > 0 ? rating.categoryRatings.communication : 'Не обрано'}/5)
                  </span>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Професіоналізм <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-3">
                  {renderStars('professionalism', rating.categoryRatings.professionalism)}
                  <span className="text-gray-500 text-sm">
                    ({rating.categoryRatings.professionalism > 0 ? rating.categoryRatings.professionalism : 'Не обрано'}/5)
                  </span>
                </div>
              </div>
            </div>



            {/* Рекомендація */}
            <div className="mb-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rating.wouldRecommend}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRating(prev => ({ ...prev, wouldRecommend: e.target.checked }))}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Я б рекомендував цю службу підтримки іншим</span>
              </label>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t bg-gray-50">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Пропустити
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid() || isSubmitting}
            className="px-4 py-2 text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Відправляємо...' : 'Відправити оцінку'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default RatingModal;