import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card, { CardHeader, CardContent, CardTitle } from './UI/Card';
import LoadingSpinner from './UI/LoadingSpinner';
import { MessageSquare, Star, TrendingUp, Users, ThumbsUp, Send } from 'lucide-react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
} from 'chart.js';
import { useRatingStats, useRatings } from '../hooks/useRatings';

// Реєструємо компоненти Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

const TelegramReviews: React.FC = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(30);
  
  // Використовуємо хуки з фільтрацією по джерелу 'telegram'
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useRatingStats(period, 'telegram');
  const { ratings: telegramRatings, loading: ratingsLoading, error: ratingsError, refetch: refetchRatings } = useRatings(1, 50, 'telegram');

  const renderStars = (rating: number) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star 
          key={i} 
          className={`w-4 h-4 ${i <= rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
        />
      );
    }
    return <div className="flex">{stars}</div>;
  };
  
  const isLoading = statsLoading || ratingsLoading;
  const error = statsError || ratingsError;

  const loadTelegramReviews = () => {
    refetchStats();
    refetchRatings();
  };

  if (isLoading) {
    return (
      <Card className="text-center py-5">
        <LoadingSpinner size="lg" text={t('common.loading')} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="text-center py-5">
        <div className="text-red-500 mb-3">
          <MessageSquare size={48} />
        </div>
        <h5 className="text-red-500 text-lg font-semibold">{t('common.error')}</h5>
        <p className="text-gray-600 mb-3">{error}</p>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" 
          onClick={loadTelegramReviews}
        >
          {t('telegramReviews.refresh')}
        </button>
      </Card>
    );
  }

  // Обчислюємо статистику для Telegram рейтингів з серверних даних
  const telegramStats = {
    total: stats?.period?.ratings || 0,
    averageRating: stats?.period?.average || 0,
    withComments: telegramRatings.filter(r => r.comment && r.comment.trim()).length,
    recommendations: telegramRatings.filter(r => r.wouldRecommend === true).length
  };

  // Дані для розподілу рейтингів з серверної статистики
  const telegramDistribution = stats?.detailed?.map(item => item.count) || [0, 0, 0, 0, 0];

  const distributionData = {
    labels: [
      t('telegramReviews.distribution.1star'), 
      t('telegramReviews.distribution.2stars'), 
      t('telegramReviews.distribution.3stars'), 
      t('telegramReviews.distribution.4stars'), 
      t('telegramReviews.distribution.5stars')
    ],
    datasets: [
      {
        data: telegramDistribution,
        backgroundColor: [
          '#dc3545',
          '#fd7e14',
          '#ffc107',
          '#198754',
          '#20c997',
        ],
        borderWidth: 2,
        borderColor: '#fff',
      },
    ],
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">
          <Send className="me-2 text-blue-500" />
          {t('telegramReviews.title')}
        </h2>
        <button className="btn btn-outline-primary" onClick={loadTelegramReviews}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          {t('telegramReviews.refresh')}
        </button>
      </div>

      {/* Основні показники для Telegram */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-6 text-center">
            <MessageSquare className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{telegramStats.total}</h3>
            <p className="text-gray-600 text-sm">{t('telegramReviews.metrics.totalReviews')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <Star className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{telegramStats.averageRating.toFixed(1)}</h3>
            <p className="text-gray-600 text-sm">{t('telegramReviews.metrics.averageRating')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <TrendingUp className="h-8 w-8 text-green-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">
              {telegramStats.total > 0 ? 
                ((telegramStats.recommendations / telegramStats.total) * 100).toFixed(1) 
                : '0.0'}%
            </h3>
            <p className="text-gray-600 text-sm">{t('telegramReviews.metrics.recommend')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <ThumbsUp className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{telegramStats.withComments}</h3>
            <p className="text-gray-600 text-sm">{t('telegramReviews.metrics.withComments')}</p>
          </CardContent>
        </Card>
      </div>

      {telegramStats.total === 0 ? (
        <Card className="text-center py-8">
          <CardContent>
            <Send size={64} className="mx-auto mb-4 text-gray-400" />
            <h3 className="text-xl font-semibold text-gray-600 mb-2">
              {t('telegramReviews.noReviews.title')}
            </h3>
            <p className="text-gray-500 mb-4">
              {t('telegramReviews.noReviews.description')}
            </p>
            <div className="text-sm text-gray-400">
              <p>{t('telegramReviews.noReviews.instructions')}</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Графік розподілу рейтингів */}
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle>{t('telegramReviews.charts.distributionTitle')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <Doughnut data={distributionData} options={{ responsive: true, maintainAspectRatio: false }} />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Останні відгуки з Telegram */}
          <Card>
            <CardHeader>
              <CardTitle>{t('telegramReviews.recentReviews.title')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">{t('telegramReviews.recentReviews.ticket')}</th>
                      <th className="text-left py-2">{t('telegramReviews.recentReviews.user')}</th>
                      <th className="text-left py-2">{t('telegramReviews.recentReviews.rating')}</th>
                      <th className="text-left py-2">{t('telegramReviews.recentReviews.comment')}</th>
                      <th className="text-left py-2">{t('telegramReviews.recentReviews.date')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {telegramRatings.slice(0, 10).map((rating) => (
                      <tr key={rating._id} className="border-b">
                        <td className="py-2">
                          <div>
                            <div className="font-medium">{rating.ticket?.title || t('telegramReviews.recentReviews.unknownTicket')}</div>
                            <div className="text-gray-500 text-xs flex items-center">
                              <Send size={12} className="mr-1" />
                              {t('telegramReviews.recentReviews.fromTelegram')}
                            </div>
                          </div>
                        </td>
                        <td className="py-2">{rating.user?.name || t('telegramReviews.recentReviews.unknown')}</td>
                        <td className="py-2">
                          <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                            rating.rating >= 4.5 ? 'bg-green-100 text-green-800' :
                            rating.rating >= 4 ? 'bg-blue-100 text-blue-800' :
                            rating.rating >= 3 ? 'bg-yellow-100 text-yellow-800' :
                            'bg-red-100 text-red-800'
                          }`}>
                            {rating.rating}/5
                          </span>
                        </td>
                        <td className="py-2">
                          {rating.comment ? (
                            <span title={rating.comment} className="text-gray-700">
                              {rating.comment.length > 50 
                                ? `${rating.comment.substring(0, 50)}...` 
                                : rating.comment
                              }
                            </span>
                          ) : (
                            <span className="text-gray-400">{t('telegramReviews.recentReviews.noComment')}</span>
                          )}
                        </td>
                        <td className="py-2">
                          <span className="text-gray-500 text-xs">
                            {new Date(rating.createdAt).toLocaleDateString('uk-UA')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default TelegramReviews;