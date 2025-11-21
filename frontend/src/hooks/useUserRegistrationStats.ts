import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import type { ApiResponse } from '../types';

interface RegistrationSource {
  _id: string;
  count: number;
}

interface RegistrationStatus {
  _id: string;
  count: number;
}

interface DailyStats {
  _id: string;
  count: number;
}

interface UserRegistrationStats {
  registrationSources: RegistrationSource[];
  registrationStatuses: RegistrationStatus[];
  dailyStats: DailyStats[];
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  summary?: {
    totalUsers: number;
    activeUsers: number;
    pendingUsers: number;
    growthRates?: {
      last7Days: number;
      last30Days: number;
    };
  };
}

interface UseUserRegistrationStatsReturn {
  userStats: UserRegistrationStats | null;
  loading: boolean;
  userStatsLoading: boolean;
  userStatsError: string | null;
  refetch: () => void;
  refetchUserStats: () => void;
}

export const useUserRegistrationStats = (): UseUserRegistrationStatsReturn => {
  const [userStats, setUserStats] = useState<UserRegistrationStats | null>(null);
  const [userStatsLoading, setUserStatsLoading] = useState<boolean>(true);
  const [userStatsError, setUserStatsError] = useState<string | null>(null);

  const fetchUserStats = async (): Promise<void> => {
    try {
      setUserStatsLoading(true);
      setUserStatsError(null);
      
      // Отримуємо статистику користувачів
      const response = await apiService.get<ApiResponse<unknown>>('/analytics/user-registration-stats') as ApiResponse<unknown>;
      
      if (response.success && response.data) {
        setUserStats(response.data as unknown as UserRegistrationStats);
      } else {
        setUserStatsError((response as { message?: string }).message || 'Помилка при отриманні статистики користувачів');
      }
    } catch (err: unknown) {
      // eslint-disable-next-line no-console
      console.error('Error fetching user registration stats:', err);
      const errorMessage = err instanceof Error ? err.message : 'Помилка при отриманні статистики користувачів';
      setUserStatsError(errorMessage);
    } finally {
      setUserStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserStats();
  }, []);

  const refetchUserStats = (): void => {
    fetchUserStats();
  };

  return {
    userStats,
    loading: userStatsLoading,
    userStatsLoading,
    userStatsError,
    refetch: refetchUserStats,
    refetchUserStats
  };
};