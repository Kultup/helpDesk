import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { apiService } from '../services/api';
import { useAuth } from './AuthContext';
import { isAdminRole } from '../types';

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
    if (!isLoading && isAuthenticated && user && isAdminRole(user.role)) {
      fetchCount();

      // Підключення до WebSocket для отримання оновлень кількості реєстрацій
      let socket: any = null;
      
      const connectWebSocket = async () => {
        try {
          const { io } = await import('socket.io-client');
          const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || '') as string;
          const socketUrl = rawUrl.replace(/\/api\/?$/, '');
          socket = io(socketUrl);
          
          socket.on('connect', () => {
            console.log('Connected to WebSocket for registration count updates');
            socket.emit('join-admin-room');
          });

          socket.on('registration-count-update', (data: { data?: { count: number }, count?: number }) => {
            console.log('Received registration count update:', data);
            // Обробляємо обидва формати: { data: { count } } та { count }
            const count = data.data?.count ?? data.count ?? 0;
            setCount(count);
          });

          socket.on('disconnect', () => {
            console.log('Disconnected from WebSocket');
          });

        } catch (error) {
          console.error('Error connecting to WebSocket:', error);
        }
      };

      connectWebSocket();

      // Cleanup function
      return () => {
        if (socket) {
          socket.disconnect();
        }
      };
    } else {
      // Якщо користувач не авторизований або не admin — не запитуємо і скидаємо стан
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