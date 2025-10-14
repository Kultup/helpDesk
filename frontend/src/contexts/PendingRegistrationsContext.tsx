import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';

interface PendingRegistrationsContextType {
  count: number;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const PendingRegistrationsContext = createContext<PendingRegistrationsContextType | undefined>(undefined);

interface PendingRegistrationsProviderProps {
  children: ReactNode;
}

export const PendingRegistrationsProvider: React.FC<PendingRegistrationsProviderProps> = ({ children }) => {
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
    // Виконуємо запит лише після завершення ініціалізації авторизації
    // і тільки якщо користувач автентифікований та має роль admin
    if (!isLoading && isAuthenticated && user?.role === 'admin') {
      fetchCount();
    } else {
      // Якщо користувач не авторизований або не admin — не запитуємо і скидаємо стан
      setCount(0);
      setLoading(false);
      setError(null);
    }
  }, [isLoading, isAuthenticated, user]);

  const refetch = () => {
    if (isAuthenticated && user?.role === 'admin') {
      fetchCount();
    }
  };

  const value: PendingRegistrationsContextType = {
    count,
    loading,
    error,
    refetch
  };

  return (
    <PendingRegistrationsContext.Provider value={value}>
      {children}
    </PendingRegistrationsContext.Provider>
  );
};

export const usePendingRegistrationsContext = (): PendingRegistrationsContextType => {
  const context = useContext(PendingRegistrationsContext);
  if (context === undefined) {
    throw new Error('usePendingRegistrationsContext must be used within a PendingRegistrationsProvider');
  }
  return context;
};

export default PendingRegistrationsContext;