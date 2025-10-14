import React, { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronUpIcon, LightBulbIcon, HandThumbUpIcon, HandThumbDownIcon } from '@heroicons/react/24/outline';
import { quickTipService } from '../services/quickTipService';

interface QuickTip {
  _id: string;
  title: string;
  description: string;
  steps: string[];
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatio: number;
}

interface QuickTipsDropdownProps {
  categoryId: string | null;
  isVisible: boolean;
  onClose?: () => void;
}

const QuickTipsDropdown: React.FC<QuickTipsDropdownProps> = ({
  categoryId,
  isVisible,
  onClose
}) => {
  const [quickTips, setQuickTips] = useState<QuickTip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTip, setExpandedTip] = useState<string | null>(null);
  const [ratedTips, setRatedTips] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (categoryId && isVisible) {
      fetchQuickTips();
    }
  }, [categoryId, isVisible]);

  const fetchQuickTips = async () => {
    if (!categoryId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await quickTipService.getQuickTipsByCategory(categoryId);
      setQuickTips(response.data);
    } catch (err: any) {
      setError(err.message || 'Помилка при завантаженні швидких порад');
    } finally {
      setLoading(false);
    }
  };

  const handleRateTip = async (tipId: string, isHelpful: boolean) => {
    try {
      await quickTipService.rateQuickTip(tipId, isHelpful);
      setRatedTips(prev => new Set(prev).add(tipId));
      
      // Оновлюємо локальний стан
      setQuickTips(prev => prev.map(tip => 
        tip._id === tipId 
          ? {
              ...tip,
              helpfulCount: isHelpful ? tip.helpfulCount + 1 : tip.helpfulCount,
              notHelpfulCount: !isHelpful ? tip.notHelpfulCount + 1 : tip.notHelpfulCount
            }
          : tip
      ));
    } catch (err) {
      console.error('Помилка при оцінці поради:', err);
    }
  };

  const toggleExpanded = (tipId: string) => {
    setExpandedTip(expandedTip === tipId ? null : tipId);
  };

  if (!isVisible || !categoryId) {
    return null;
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-3 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <LightBulbIcon className="h-5 w-5 text-blue-600" />
          <h3 className="text-sm font-medium text-blue-900">
            Швидкі поради для вирішення проблеми
          </h3>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-blue-400 hover:text-blue-600 transition-colors"
          >
            ×
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-sm text-blue-600">Завантаження порад...</span>
        </div>
      )}

      {error && (
        <div className="text-red-600 text-sm bg-red-50 border border-red-200 rounded p-2">
          {error}
        </div>
      )}

      {!loading && !error && quickTips.length === 0 && (
        <div className="text-gray-500 text-sm text-center py-4">
          Поради для цієї категорії поки що недоступні
        </div>
      )}

      {!loading && !error && quickTips.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-blue-700 mb-3">
            Спробуйте ці рішення перед створенням тікету:
          </p>
          
          {quickTips.map((tip) => (
            <div key={tip._id} className="bg-white border border-blue-100 rounded-lg p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <button
                    onClick={() => toggleExpanded(tip._id)}
                    className="flex items-center space-x-2 text-left w-full hover:text-blue-700 transition-colors"
                  >
                    <span className="font-medium text-sm text-gray-900">{tip.title}</span>
                    {expandedTip === tip._id ? (
                      <ChevronUpIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                  
                  <p className="text-xs text-gray-600 mt-1">{tip.description}</p>
                </div>
              </div>

              {expandedTip === tip._id && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <div className="space-y-2">
                    {tip.steps.map((step, index) => (
                      <div key={`${tip._id}-step-${index}`} className="flex items-start space-x-2">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-xs font-medium">
                          {index + 1}
                        </span>
                        <span className="text-xs text-gray-700">{step}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
                    <span className="text-xs text-gray-500">
                      Чи допомогла ця порада?
                    </span>
                    
                    {!ratedTips.has(tip._id) ? (
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleRateTip(tip._id, true)}
                          className="flex items-center space-x-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded transition-colors"
                        >
                          <HandThumbUpIcon className="h-3 w-3" />
                          <span>Так</span>
                        </button>
                        <button
                          onClick={() => handleRateTip(tip._id, false)}
                          className="flex items-center space-x-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <HandThumbDownIcon className="h-3 w-3" />
                          <span>Ні</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">Дякуємо за оцінку!</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-4 mt-2 text-xs text-gray-400">
                    <span>👍 {tip.helpfulCount}</span>
                    <span>👎 {tip.notHelpfulCount}</span>
                  </div>
                </div>
              )}
            </div>
          ))}
          
          <div className="text-xs text-gray-500 text-center pt-2 border-t border-blue-100">
            Якщо ці поради не допомогли, створіть тікет для отримання персональної допомоги
          </div>
        </div>
      )}
    </div>
  );
};

export default QuickTipsDropdown;