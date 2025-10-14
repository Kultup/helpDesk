import { useState, useEffect } from 'react';
import { apiService } from '../services/api';

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

  const fetchUserStats = async () => {
    try {
      setUserStatsLoading(true);
      setUserStatsError(null);
      
      // Отримуємо статистику користувачів
      const response = await apiService.get('/analytics/user-registration-stats');
      
      if (response.success && response.data) {
        setUserStats(response.data);
      } else {
        setUserStatsError(response.message || 'Помилка при отриманні статистики користувачів');
      }
    } catch (err: any) {
      console.error('Error fetching user registration stats:', err);
      setUserStatsError(err.message || 'Помилка при отриманні статистики користувачів');
    } finally {
      setUserStatsLoading(false);
    }
  };

  useEffect(() => {
    fetchUserStats();
  }, []);

  const refetchUserStats = () => {
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