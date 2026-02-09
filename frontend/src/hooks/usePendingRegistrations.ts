import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole } from '../types';

interface UsePendingRegistrationsReturn {
  count: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export const usePendingRegistrations = (): UsePendingRegistrationsReturn => {
  const { t } = useTranslation();
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { isAuthenticated, user, isLoading } = useAuth();

  const fetchCount = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await apiService.getPendingRegistrationsCount();
      if (response.success && response.data) {
        setCount(response.data.count);
      } else {
        setError(response.message || t('pendingRegistrations.errorLoadingCount'));
      }
    } catch (err: any) {
      console.error('Error fetching pending registrations count:', err);
      setError(err.message || t('pendingRegistrations.errorLoadingCount'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoading && isAuthenticated && user && isAdminRole(user.role)) {
      fetchCount();
    } else {
      setCount(0);
      setLoading(false);
      setError(null);
    }
  }, [isLoading, isAuthenticated, user]);

  const refetch = () => {
    if (isAuthenticated && user && isAdminRole(user.role)) {
      fetchCount();
    }
  };

  return {
    count,
    loading,
    error,
    refetch
  };
};