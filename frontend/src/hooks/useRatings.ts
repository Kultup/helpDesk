import { useState, useEffect } from 'react';
import api from '../utils/api';

export interface RatingStats {
  general: {
    distribution: Array<{ _id: number; count: number }>;
    total: number;
    average: {
      _id: null;
      averageRating: number;
      totalRatings: number;
      averageSpeed?: number;
      averageQuality?: number;
      averageCommunication?: number;
      averageProfessionalism?: number;
    };
  };
  period?: {
    days: number;
    ratings: number;
    average: number;
  };
  detailed?: Array<{
    _id: number;
    count: number;
    percentage: number;
  }>;
  categories: {
    _id: null;
    avgSpeed?: number;
    avgQuality?: number;
    avgCommunication?: number;
    avgProfessionalism?: number;
  };
  recommendations: Array<{
    _id: null;
    count: number;
  }>;
}

export interface Rating {
  _id: string;
  ticket: {
    _id: string;
    title: string;
    user: {
      name: string;
      email: string;
    };
  };
  user: {
    _id: string;
    name: string;
    email: string;
  };
  rating: number;
  comment?: string;
  categories: {
    speed?: number;
    quality?: number;
    communication?: number;
    professionalism?: number;
  };
  wouldRecommend?: boolean;
  source?: string; // Додаємо поле source
  createdAt: string;
  updatedAt: string;
}

export const useRatingStats = (period: number = 30, source?: string) => {
  const [stats, setStats] = useState<RatingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ period: period.toString() });
      if (source) {
        params.append('source', source);
      }
      
      const data = await api.get(`/ratings/stats?${params.toString()}`);

      const apiSuccess = data?.success;
      const payload = data?.data;
      const hasData = !!payload;

      if (apiSuccess === true && hasData) {
        setStats(payload);
      } else if (hasData) {
        // Якщо бекенд не повертає success, але є корисні дані – приймаємо
        setStats(payload);
      } else {
        console.warn('Ratings stats: unexpected API response', { data });
        setError(data?.message || 'Помилка завантаження статистики');
      }
    } catch (err: any) {
      console.error('Помилка завантаження статистики рейтингів:', err);
      setError(err.response?.data?.message || 'Помилка завантаження статистики');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, [period, source]);

  return {
    stats,
    loading,
    error,
    refetch: fetchStats
  };
};

export const useRatings = (page: number = 1, limit: number = 10, source?: string) => {
  const [ratings, setRatings] = useState<Rating[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRatings = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params = new URLSearchParams({ 
        page: page.toString(), 
        limit: limit.toString() 
      });
      if (source) {
        params.append('source', source);
      }
      
      const data = await api.get(`/ratings?${params.toString()}`);
      
      if (data?.success) {
        setRatings(data?.data?.ratings || []);
        setTotal(data?.data?.total || 0);
      } else if (data?.data) {
        // Підтримка відповіді без success, якщо є корисні дані
        setRatings(data?.data?.ratings || []);
        setTotal(data?.data?.total || 0);
      } else {
        setError(data?.message || 'Помилка завантаження рейтингів');
      }
    } catch (err: any) {
      console.error('Помилка завантаження рейтингів:', err);
      setError(err.response?.data?.message || 'Помилка завантаження рейтингів');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRatings();
  }, [page, limit, source]);

  return {
    ratings,
    total,
    loading,
    error,
    refetch: fetchRatings
  };
};