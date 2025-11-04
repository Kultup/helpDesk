import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { AnalyticsData } from '../types';

export interface AnalyticsOverview {
  totalTickets: number;
  totalUsers: number;
  activeUsers: number;
  totalCities: number;
  totalPositions: number;
}

export interface TicketsByStatus {
  _id: string;
  count: number;
}

export interface TicketsByPriority {
  _id: string;
  count: number;
}

export interface TicketsByDay {
  _id: string;
  count: number;
}

export interface TopResolver {
  _id: string;
  count: number;
  user: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface DashboardData {
  today: {
    created: number;
    resolved: number;
  };
  week: {
    created: number;
    resolved: number;
  };
  month: {
    created: number;
    resolved: number;
  };
  topCities: Array<{
    _id: string;
    cityName: string;
    count: number;
    resolved?: number;
  }>;
}

export const useAnalytics = (startDate?: string, endDate?: string) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, isLoading: authLoading, user } = useAuth();

  const fetchAnalytics = useCallback(async () => {
    try {
      // Гейт: виконуємо запити лише після завершення аутентифікації та для адміністратора
      if (authLoading) {
        setLoading(true);
        return;
      }
      if (!isAuthenticated || user?.role !== 'admin') {
        setAnalyticsData(null);
        setDashboardData(null);
        setLoading(false);
        setError(null);
        return;
      }

      setLoading(true);
      setError(null);

      // Отримуємо дані з обох ендпоінтів з затримкою між запитами
      const analyticsResponse = await apiService.getAnalytics(startDate, endDate);
      
      // Додаємо невелику затримку між запитами для зменшення навантаження
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const dashboardResponse = await apiService.getDashboardStats();

      if (analyticsResponse.success && analyticsResponse.data) {
        console.log('📊 Analytics data loaded:', analyticsResponse.data);
        console.log('📊 Tickets by day:', analyticsResponse.data.ticketsByDay);
        console.log('📊 Resolved tickets by day:', analyticsResponse.data.resolvedTicketsByDay);
        setAnalyticsData(analyticsResponse.data);
      } else {
        throw new Error(analyticsResponse.message || 'Помилка завантаження аналітики');
      }

      if (dashboardResponse.success && dashboardResponse.data) {
        console.log('📊 Dashboard data loaded:', dashboardResponse.data);
        console.log('📊 Top cities:', dashboardResponse.data.topCities);
        setDashboardData(dashboardResponse.data);
      } else {
        throw new Error(dashboardResponse.message || 'Помилка завантаження даних дашборду');
      }

    } catch (err: any) {
      console.error('Помилка завантаження аналітики:', err);
      setError(err.message || 'Помилка завантаження аналітики');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, authLoading, isAuthenticated, user?.role]);

  useEffect(() => {
    if (!authLoading) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, authLoading]);

  return {
    analyticsData,
    dashboardData,
    loading,
    error,
    refetch: async () => {
      if (authLoading) return;
      if (!isAuthenticated || user?.role !== 'admin') {
        setAnalyticsData(null);
        setDashboardData(null);
        setLoading(false);
        setError(null);
        return;
      }
      await fetchAnalytics();
    }
  };
};