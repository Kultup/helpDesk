import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Ticket, 
  City, 
  User, 
  TicketFilters, 
  PaginationOptions, 
  SortOptions,
  PaginatedResponse,
  TicketsApiResponse,
  TicketStatus
} from '../types';
import { apiService } from '../services/api';
import { debounce } from '../utils';

// Хук для управління станом завантаження
export const useLoading = (initialState = false) => {
  const [isLoading, setIsLoading] = useState(initialState);
  
  const startLoading = useCallback(() => setIsLoading(true), []);
  const stopLoading = useCallback(() => setIsLoading(false), []);
  
  return { isLoading, startLoading, stopLoading, setIsLoading };
};

// Хук для роботи з тикетами
export const useTickets = () => {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<PaginationOptions>({ page: 1, limit: 10 });
  const [filters, setFilters] = useState<TicketFilters>({});
  const [sort, setSort] = useState<SortOptions>({ field: 'createdAt', direction: 'desc' });
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);

  const fetchTickets = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      const response = await apiService.getTickets(filters, pagination, sort);
      
      if (response.success && response.data) {
        const tickets = response.data as Ticket[];
        const paginationInfo = response.pagination;
        
        setTickets(tickets || []);
        setTotalPages(paginationInfo?.totalPages || 0);
        setTotal(paginationInfo?.totalItems || 0);
      } else {
        setError(response.message || 'Помилка завантаження тікетів');
        setTickets([]);
        setTotalPages(0);
        setTotal(0);
      }
    } catch (error: any) {
      console.error('Помилка завантаження тікетів:', error);
      setError(error.message || 'Помилка завантаження тікетів');
      setTickets([]);
      setTotalPages(0);
      setTotal(0);
    } finally {
      stopLoading();
    }
  }, [filters, pagination, sort, startLoading, stopLoading]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  const updateFilters = useCallback((newFilters: Partial<TicketFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setPagination(prev => ({ ...prev, page: 1 })); // Скидаємо на першу сторінку
  }, []);

  const updatePagination = useCallback((newPagination: Partial<PaginationOptions>) => {
    setPagination(prev => ({ ...prev, ...newPagination }));
  }, []);

  const updateSort = useCallback((newSort: Partial<SortOptions>) => {
    setSort(prev => ({ ...prev, ...newSort }));
  }, []);

  const createTicket = useCallback(async (ticketData: any) => {
    try {
      const response = await apiService.createTicket(ticketData);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка створення тикету');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка створення тикету');
    }
  }, [fetchTickets]);

  const updateTicket = useCallback(async (id: string, updates: any) => {
    try {
      const response = await apiService.updateTicket(id, updates);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка оновлення тикету');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка оновлення тикету');
    }
  }, [fetchTickets]);

  const deleteTicket = useCallback(async (id: string) => {
    try {
      const response = await apiService.deleteTicket(id);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
      } else {
        throw new Error(response.message || 'Помилка видалення тикету');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка видалення тикету');
    }
  }, [fetchTickets]);

  return {
    tickets,
    pagination,
    filters,
    sort,
    totalPages,
    total,
    isLoading,
    error,
    updateFilters,
    updatePagination,
    updateSort,
    createTicket,
    updateTicket,
    deleteTicket,
    refetch: fetchTickets
  };
};

// Хук для роботи з містами
export const useCities = () => {
  const [cities, setCities] = useState<City[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);

  const fetchCities = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      const response = await apiService.getCities();
      
      if (response.success && response.data) {
        setCities(Array.isArray(response.data) ? response.data : []);
      } else {
        setError(response.message || 'Помилка завантаження міст');
        setCities([]); // Встановлюємо порожній масив при помилці
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження міст');
      setCities([]); // Встановлюємо порожній масив при помилці
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  const createCity = useCallback(async (cityData: Omit<City, '_id'>) => {
    try {
      const response = await apiService.createCity(cityData);
      if (response.success) {
        await fetchCities();
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка створення міста');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка створення міста');
    }
  }, [fetchCities]);

  const updateCity = useCallback(async (id: string, updates: Partial<City>) => {
    try {
      const response = await apiService.updateCity(id, updates);
      if (response.success) {
        await fetchCities();
        return response.data;
      } else {
        throw new Error(response.message || 'Помилка оновлення міста');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка оновлення міста');
    }
  }, [fetchCities]);

  const deleteCity = useCallback(async (id: string) => {
    try {
      const response = await apiService.deleteCity(id);
      if (response.success) {
        await fetchCities();
      } else {
        throw new Error(response.message || 'Помилка видалення міста');
      }
    } catch (err: any) {
      throw new Error(err.message || 'Помилка видалення міста');
    }
  }, [fetchCities]);

  return {
    cities,
    isLoading,
    error,
    createCity,
    updateCity,
    deleteCity,
    refetch: fetchCities
  };
};

// Хук для роботи з користувачами
export const useUsers = (isActive?: boolean) => {
  const [users, setUsers] = useState<User[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async (activeFilter?: boolean) => {
    try {
      startLoading();
      setError(null);
      
      const response = await apiService.getUsers(activeFilter);
      
      if (response.success && response.data) {
        setUsers(Array.isArray(response.data) ? response.data : []);
      } else {
        setError(response.message || 'Помилка завантаження користувачів');
        setUsers([]); // Встановлюємо порожній масив при помилці
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження користувачів');
      setUsers([]); // Встановлюємо порожній масив при помилці
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  useEffect(() => {
    fetchUsers(isActive);
  }, [fetchUsers, isActive]);

  const refetch = useCallback((activeFilter?: boolean) => {
    return fetchUsers(activeFilter);
  }, [fetchUsers]);

  const forceDeleteUser = useCallback(async (userId: string) => {
    try {
      const response = await apiService.forceDeleteUser(userId);
      if (response.success) {
        // Оновлюємо список користувачів після видалення
        await fetchUsers();
        return response;
      } else {
        throw new Error(response.message || 'Помилка видалення користувача');
      }
    } catch (error: any) {
      throw error;
    }
  }, [fetchUsers]);

  return {
    users,
    isLoading,
    error,
    refetch,
    forceDeleteUser
  };
};

// Хук для роботи з деактивованими користувачами
export const useDeactivatedUsers = () => {
  const [deactivatedUsers, setDeactivatedUsers] = useState<User[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);

  const fetchDeactivatedUsers = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      const response = await apiService.getUsers(false); // false для деактивованих користувачів
      
      if (response.success && response.data) {
        setDeactivatedUsers(Array.isArray(response.data) ? response.data : []);
      } else {
        setError(response.message || 'Помилка завантаження деактивованих користувачів');
        setDeactivatedUsers([]);
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження деактивованих користувачів');
      setDeactivatedUsers([]);
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  useEffect(() => {
    fetchDeactivatedUsers();
  }, [fetchDeactivatedUsers]);

  const activateUser = useCallback(async (userId: string) => {
    try {
      const response = await apiService.toggleUserActive(userId);
      if (response.success) {
        // Оновлюємо список деактивованих користувачів після активації
        await fetchDeactivatedUsers();
        return response;
      } else {
        throw new Error(response.message || 'Помилка активації користувача');
      }
    } catch (error: any) {
      throw error;
    }
  }, [fetchDeactivatedUsers]);

  const refetch = useCallback(() => {
    return fetchDeactivatedUsers();
  }, [fetchDeactivatedUsers]);

  return {
    deactivatedUsers,
    isLoading,
    error,
    refetch,
    activateUser
  };
};

// Хук для дебаунсу пошуку
export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Хук для роботи з локальним сховищем
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Помилка читання з localStorage для ключа "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Помилка запису в localStorage для ключа "${key}":`, error);
    }
  }, [key, storedValue]);

  const removeValue = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.error(`Помилка видалення з localStorage для ключа "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue] as const;
};

// Хук для відстеження розміру вікна
export const useWindowSize = () => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = debounce(() => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 100);

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

// Хук для відстеження кліків поза елементом
export const useClickOutside = (callback: () => void) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [callback]);

  return ref;
};

// Хук для копіювання в буфер обміну
export const useClipboard = () => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return true;
    } catch (error) {
      console.error('Помилка копіювання:', error);
      setCopied(false);
      return false;
    }
  }, []);

  return { copied, copy };
};

// Експорт додаткових хуків
export { useRouteHistory } from './useRouteHistory';

// Хук для сповіщень (незалежний від основного useTickets)
export const useNotifications = () => {
  const [notifications, setNotifications] = useState<Ticket[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      // Отримуємо тільки відкриті та в роботі тікети для сповіщень
      const response = await apiService.getTickets(
        { status: [TicketStatus.OPEN, TicketStatus.IN_PROGRESS] }, // Фільтр тільки для активних тікетів
        { page: 1, limit: 50 }, // Достатньо для сповіщень
        { field: 'createdAt', direction: 'desc' } // Сортування за датою створення
      );
      
      if (response.success && response.data) {
        const tickets = response.data as Ticket[];
        setNotifications(tickets || []);
      } else {
        setError(response.message || 'Помилка завантаження сповіщень');
        setNotifications([]);
      }
    } catch (error: any) {
      console.error('Помилка завантаження сповіщень:', error);
      setError(error.message || 'Помилка завантаження сповіщень');
      setNotifications([]);
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  // WebSocket підключення для тікетів
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    

    // Імпортуємо socket.io-client динамічно
    import('socket.io-client').then(({ io }) => {
      const socketBase = (
        process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || ''
      ).replace(/\/api\/?$/, '');

      if (!socketBase) {
        console.warn('Socket URL is not configured via REACT_APP_SOCKET_URL or REACT_APP_API_URL');
        return;
      }

      const socketInstance = io(socketBase, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('🔌 WebSocket підключено для тікетів');
        // Приєднуємося до кімнати адміністраторів
        socketInstance.emit('join-admin-room');
      });

      socketInstance.on('disconnect', () => {
        console.log('🔌 WebSocket відключено для тікетів');
      });

      // Слухаємо сповіщення про тікети
      socketInstance.on('ticket-notification', (notification: any) => {
        console.log('📢 Отримано WebSocket сповіщення про тікет:', notification);
        
        if (notification.type === 'new_ticket') {
          // Додаємо новий тікет до списку сповіщень
          setNotifications(prev => {
            const newNotifications = [notification.data, ...prev];
            console.log('🔔 useNotifications: Adding new ticket, total notifications:', newNotifications.length);
            return newNotifications;
          });
        } else if (notification.type === 'ticket_status_change') {
          // Оновлюємо статус існуючого тікету або видаляємо його
          const ticketData = notification.data;
          if (ticketData.status === 'closed' || ticketData.status === 'resolved') {
            // Видаляємо закриті/вирішені тікети зі списку сповіщень
            setNotifications(prev => {
              const filtered = prev.filter(ticket => ticket._id !== ticketData._id);
              console.log('🔔 useNotifications: Removing closed ticket, total notifications:', filtered.length);
              return filtered;
            });
          } else {
            // Оновлюємо існуючий тікет
            setNotifications(prev => {
              const updated = prev.map(ticket => 
                ticket._id === ticketData._id ? { ...ticket, ...ticketData } : ticket
              );
              console.log('🔔 useNotifications: Updating ticket status, total notifications:', updated.length);
              return updated;
            });
          }
        } else if (notification.type === 'ticket_assignment') {
          // Оновлюємо призначення тікету
          const ticketData = notification.data;
          setNotifications(prev => 
            prev.map(ticket => 
              ticket._id === ticketData._id ? { ...ticket, ...ticketData } : ticket
            )
          );
        }
      });

      // Слухаємо оновлення кількості тікетів
      socketInstance.on('ticket-count-update', (data: any) => {
        console.log('📊 Отримано оновлення кількості тікетів:', data);
        // Можна використовувати для синхронізації лічильника
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
      };
    });
  }, []);

  // Автоматичне оновлення кожні 4 години та резервне оновлення
  useEffect(() => {
    fetchNotifications();
    
    const interval = setInterval(() => {
      fetchNotifications();
    }, 14400000); // 4 години (4 * 60 * 60 * 1000)

    return () => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    isLoading,
    error,
    refetch: fetchNotifications
  };
};

// Хук для сповіщень про запити на реєстрацію
export const useRegistrationNotifications = () => {
  const [registrations, setRegistrations] = useState<User[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<any>(null);
  const [newRegistrationCount, setNewRegistrationCount] = useState(0);

  const fetchRegistrations = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      // Отримуємо останні 20 запитів на реєстрацію
      const response = await apiService.getPendingRegistrations({
        page: 1,
        limit: 20,
        sortBy: 'createdAt',
        sortOrder: 'desc'
      });
      
      if (response.success && response.data) {
        setRegistrations(response.data.docs || []);
      } else {
        setError(response.message || 'Помилка завантаження запитів на реєстрацію');
        setRegistrations([]);
      }
    } catch (error: any) {
      console.error('Помилка завантаження запитів на реєстрацію:', error);
      setError(error.message || 'Помилка завантаження запитів на реєстрацію');
      setRegistrations([]);
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  // WebSocket підключення
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    

    // Імпортуємо socket.io-client динамічно
    import('socket.io-client').then(({ io }) => {
      const socketBase = (
        process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || ''
      ).replace(/\/api\/?$/, '');

      if (!socketBase) {
        console.warn('Socket URL is not configured via REACT_APP_SOCKET_URL or REACT_APP_API_URL');
        return;
      }

      const socketInstance = io(socketBase, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', () => {
        console.log('🔌 WebSocket підключено для реєстрацій');
        // Приєднуємося до кімнати адміністраторів
        socketInstance.emit('join-admin-room');
      });

      socketInstance.on('disconnect', () => {
        console.log('🔌 WebSocket відключено для реєстрацій');
      });

      // Слухаємо сповіщення про нові реєстрації
      socketInstance.on('registration-notification', (notification: any) => {
        console.log('📢 Отримано WebSocket сповіщення про реєстрацію:', notification);
        
        if (notification.type === 'new_registration_request') {
          // Додаємо нову реєстрацію до списку
          setRegistrations(prev => {
            const newRegistrations = [notification.data, ...prev];
            console.log('👤 useRegistrationNotifications: Adding new registration, total:', newRegistrations.length);
            return newRegistrations;
          });
          setNewRegistrationCount(prev => {
            const newCount = prev + 1;
            console.log('👤 useRegistrationNotifications: Incrementing newRegistrationCount to:', newCount);
            return newCount;
          });
        } else if (notification.type === 'registration_status_change') {
          // Оновлюємо статус існуючої реєстрації або видаляємо її
          if (notification.data.status === 'approved' || notification.data.status === 'rejected') {
            setRegistrations(prev => {
              const filtered = prev.filter(reg => reg._id !== notification.data.userId);
              console.log('👤 useRegistrationNotifications: Removing registration, total:', filtered.length);
              return filtered;
            });
          }
        }
      });

      // Слухаємо оновлення кількості реєстрацій
      socketInstance.on('registration-count-update', (data: any) => {
        console.log('📊 Отримано оновлення кількості реєстрацій:', data);
        // Можна використовувати для синхронізації лічильника
      });

      setSocket(socketInstance);

      return () => {
        socketInstance.disconnect();
      };
    });
  }, []);

  // Початкове завантаження та резервне оновлення
  useEffect(() => {
    fetchRegistrations();
    
    // Резервне оновлення кожні 5 хвилин (на випадок проблем з WebSocket)
    const interval = setInterval(() => {
      fetchRegistrations();
    }, 300000); // 5 хвилин

    return () => clearInterval(interval);
  }, [fetchRegistrations]);

  // Функція для скидання лічильника нових реєстрацій
  const resetNewRegistrationCount = useCallback(() => {
    setNewRegistrationCount(0);
  }, []);

  return {
    registrations,
    isLoading,
    error,
    newRegistrationCount,
    resetNewRegistrationCount,
    refetch: fetchRegistrations
  };
};
