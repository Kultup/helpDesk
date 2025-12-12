import React, { useState } from 'react';
import { X, Star } from 'lucide-react';
import { apiService } from '../services/api';
import { toast } from 'react-hot-toast';

interface RatingRequestModalProps {
  ticketId: string;
  ticketTitle: string;
  isOpen: boolean;
  onClose: () => void;
  onRated?: () => void;
}

const RatingRequestModal: React.FC<RatingRequestModalProps> = ({
  ticketId,
  ticketTitle,
  isOpen,
  onClose,
  onRated
}) => {
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleRatingClick = (rating: number) => {
    setSelectedRating(rating);
  };

  const handleSubmit = async () => {
    if (!selectedRating) {
      toast.error('Будь ласка, оберіть оцінку');
      return;
    }

    setIsSubmitting(true);
    try {
      await apiService.rateTicket(ticketId, selectedRating, feedback || undefined);
      toast.success('Дякуємо за вашу оцінку!');
      setSelectedRating(null);
      setFeedback('');
      onClose();
      if (onRated) {
        onRated();
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || 'Помилка відправки оцінки');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setSelectedRating(null);
      setFeedback('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">
            Оцініть якість вирішення
          </h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-2">Тікет:</p>
          <p className="text-base font-medium text-gray-900">{ticketTitle}</p>
        </div>

        <div className="mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Оберіть оцінку від 1 до 5:
          </p>
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4, 5].map((rating) => (
              <button
                key={rating}
                onClick={() => handleRatingClick(rating)}
                disabled={isSubmitting}
                className={`
                  w-12 h-12 rounded-full flex items-center justify-center
                  transition-all duration-200 transform hover:scale-110
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${
                    selectedRating && selectedRating >= rating
                      ? 'bg-yellow-400 text-white'
                      : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                  }
                `}
              >
                <Star
                  className={`w-6 h-6 ${
                    selectedRating && selectedRating >= rating
                      ? 'fill-current'
                      : ''
                  }`}
                />
              </button>
            ))}
          </div>
          {selectedRating && (
            <p className="text-center text-sm text-gray-600 mt-2">
              Обрано: {selectedRating} з 5
            </p>
          )}
        </div>

        <div className="mb-6">
          <label
            htmlFor="feedback"
            className="block text-sm font-medium text-gray-700 mb-2"
          >
            Відгук (необов'язково):
          </label>
          <textarea
            id="feedback"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            disabled={isSubmitting}
            rows={3}
            maxLength={500}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Залиште свій відгук про якість обслуговування..."
          />
          <p className="text-xs text-gray-500 mt-1">
            {feedback.length}/500 символів
          </p>
        </div>

        </div>
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex gap-3">
            <button
              onClick={handleClose}
              disabled={isSubmitting}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Пізніше
            </button>
            <button
              onClick={handleSubmit}
              disabled={!selectedRating || isSubmitting}
              className={`flex-1 px-4 py-2 rounded-lg transition-colors font-medium ${
                !selectedRating || isSubmitting
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  : 'bg-primary-500 text-white hover:bg-primary-600 active:bg-primary-700'
              }`}
            >
              {isSubmitting ? 'Відправка...' : 'Відправити оцінку'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RatingRequestModal;

