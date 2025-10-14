import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Card, { CardHeader, CardContent, CardTitle } from './UI/Card';
import LoadingSpinner from './UI/LoadingSpinner';
import { Star, TrendingUp, Users, ThumbsUp } from 'lucide-react';
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

// Інтерфейси імпортуються з хука useRatings

const RatingsAnalytics: React.FC = () => {
  const { t } = useTranslation();
  const [period, setPeriod] = useState(30);
  
  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useRatingStats(period);
  const { ratings: recentRatings, loading: ratingsLoading, error: ratingsError, refetch: refetchRatings } = useRatings(1, 10);
  

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

  const loadRatingStats = () => {
    // Перезавантажуємо і статистику, і список рейтингів, щоб скинути можливу помилку
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
          <TrendingUp size={48} />
        </div>
        <h5 className="text-red-500 text-lg font-semibold">{t('common.error')}</h5>
        <p className="text-gray-600 mb-3">{error}</p>
        <button 
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600" 
          onClick={loadRatingStats}
        >
          {t('ratingsAnalytics.refresh')}
        </button>
      </Card>
    );
  }

  if (!stats) {
    return (
      <Card className="text-center py-5">
        <div className="text-gray-400 mb-3">
          <Star size={48} />
        </div>
        <h5 className="text-lg font-semibold">{t('common.error')}</h5>
        <p className="text-gray-600">{t('common.loading')}</p>
      </Card>
    );
  }

  // Дані для графіка розподілу рейтингів
  const distributionData = {
    labels: [t('ratingsAnalytics.distribution.1star'), t('ratingsAnalytics.distribution.2stars'), t('ratingsAnalytics.distribution.3stars'), t('ratingsAnalytics.distribution.4stars'), t('ratingsAnalytics.distribution.5stars')],
    datasets: [
      {
        data: [
          stats?.general?.distribution?.find(d => d._id === 1)?.count || 0,
          stats?.general?.distribution?.find(d => d._id === 2)?.count || 0,
          stats?.general?.distribution?.find(d => d._id === 3)?.count || 0,
          stats?.general?.distribution?.find(d => d._id === 4)?.count || 0,
          stats?.general?.distribution?.find(d => d._id === 5)?.count || 0,
        ],
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

  // Дані для графіка категорій
  const categoryData = {
    labels: [t('ratingsAnalytics.categories.resolutionSpeed'), t('ratingsAnalytics.categories.solutionQuality'), t('ratingsAnalytics.categories.communication'), t('ratingsAnalytics.categories.professionalism')],
    datasets: [
      {
        label: t('ratingsAnalytics.metrics.averageRating'),
        data: [
          stats?.categories?.avgSpeed || 0,
          stats?.categories?.avgQuality || 0,
          stats?.categories?.avgCommunication || 0,
          stats?.categories?.avgProfessionalism || 0,
        ],
        backgroundColor: 'rgba(54, 162, 235, 0.6)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: {
        beginAtZero: true,
        max: 5,
      },
    },
  };

  // Перевіряємо, чи є дані категорій
  const hasCategoryData = stats?.categories && (
    stats.categories.avgSpeed !== null || 
    stats.categories.avgQuality !== null || 
    stats.categories.avgCommunication !== null || 
    stats.categories.avgProfessionalism !== null
  );

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="mb-0">
          <Star className="me-2 text-warning" />
          {t('ratingsAnalytics.title')}
        </h2>
        <button className="btn btn-outline-primary" onClick={loadRatingStats}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          {t('ratingsAnalytics.refresh')}
        </button>
      </div>

      {/* Основні показники */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-6 text-center">
            <Users className="h-8 w-8 text-blue-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{stats?.general?.total || 0}</h3>
            <p className="text-gray-600 text-sm">{t('ratingsAnalytics.metrics.totalRatings')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <Star className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{stats?.general?.average?.averageRating?.toFixed(1) || '0.0'}</h3>
            <p className="text-gray-600 text-sm">{t('ratingsAnalytics.metrics.averageRating')}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="p-6 text-center">
            <ThumbsUp className="h-8 w-8 text-purple-500 mx-auto mb-2" />
            <h3 className="text-2xl font-bold">{recentRatings?.filter(r => r.comment).length || 0}</h3>
            <p className="text-gray-600 text-sm">{t('ratingsAnalytics.metrics.withComments')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Графіки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('ratingsAnalytics.charts.distributionTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
              <div className="h-80">
                <Doughnut data={distributionData} options={{ responsive: true, maintainAspectRatio: false }} />
              </div>
            </CardContent>
          </Card>
          

      </div>



      {/* Останні рейтинги */}
      <Card>
        <CardHeader>
          <CardTitle>{t('ratingsAnalytics.recentRatings.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {(recentRatings?.length || 0) > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2">{t('ratingsAnalytics.recentRatings.ticket')}</th>
                    <th className="text-left py-2">{t('ratingsAnalytics.recentRatings.user')}</th>
                    <th className="text-left py-2">{t('ratingsAnalytics.recentRatings.rating')}</th>
                    <th className="text-left py-2">{t('ratingsAnalytics.recentRatings.comment')}</th>
                    <th className="text-left py-2">{t('ratingsAnalytics.recentRatings.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRatings?.map((rating) => (
                    <tr key={rating._id} className="border-b">
                      <td className="py-2">
                        <div>
                          <div className="font-medium">{rating.ticket?.title || t('ratingsAnalytics.recentRatings.unknownTicket')}</div>
                          <div className="text-gray-500 text-xs">
                            {t('ratingsAnalytics.recentRatings.from')} {rating.ticket?.user?.name || t('ratingsAnalytics.recentRatings.unknownUser')}
                          </div>
                        </div>
                      </td>
                      <td className="py-2">{rating.user?.name || t('ratingsAnalytics.recentRatings.unknown')}</td>
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
                          <span className="text-gray-400">{t('ratingsAnalytics.recentRatings.noComment')}</span>
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
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">{t('ratingsAnalytics.recentRatings.noRatings')}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RatingsAnalytics;