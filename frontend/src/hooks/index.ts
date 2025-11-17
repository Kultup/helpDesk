import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Ticket, 
  City, 
  User, 
  TicketFilters, 
  PaginationOptions, 
  SortOptions,
  TicketStatus,
  CreateTicketForm,
  UpdateTicketForm
} from '../types';
import { apiService } from '../services/api';
import { debounce } from '../utils';

// Хук для управління станом завантаження
export const useLoading = (initialState = false): {
  isLoading: boolean;
  startLoading: () => void;
  stopLoading: () => void;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
} => {
  const [isLoading, setIsLoading] = useState(initialState);
  
  const startLoading = useCallback((): void => setIsLoading(true), []);
  const stopLoading = useCallback((): void => setIsLoading(false), []);
  
  return { isLoading, startLoading, stopLoading, setIsLoading };
};

// Хук для роботи з тикетами
export const useTickets = (): {
  tickets: Ticket[];
  pagination: PaginationOptions;
  filters: TicketFilters;
  sort: SortOptions;
  totalPages: number;
  total: number;
  isLoading: boolean;
  error: string | null;
  updateFilters: (newFilters: Partial<TicketFilters>) => void;
  updatePagination: (newPagination: Partial<PaginationOptions>) => void;
  updateSort: (newSort: Partial<SortOptions>) => void;
  createTicket: (ticketData: CreateTicketForm) => Promise<Ticket>;
  updateTicket: (id: string, updates: UpdateTicketForm) => Promise<Ticket>;
  deleteTicket: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
} => {
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
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('Помилка завантаження тікетів:', error);
      setError((error as Error).message || 'Помилка завантаження тікетів');
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

  const createTicket = useCallback(async (ticketData: CreateTicketForm): Promise<Ticket> => {
    try {
      const response = await apiService.createTicket(ticketData);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
        return response.data as Ticket;
      } else {
        throw new Error(response.message || 'Помилка створення тикету');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка створення тикету');
    }
  }, [fetchTickets]);

  const updateTicket = useCallback(async (id: string, updates: UpdateTicketForm): Promise<Ticket> => {
    try {
      const response = await apiService.updateTicket(id, updates);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
        return response.data as Ticket;
      } else {
        throw new Error(response.message || 'Помилка оновлення тикету');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка оновлення тикету');
    }
  }, [fetchTickets]);

  const deleteTicket = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await apiService.deleteTicket(id);
      if (response.success) {
        await fetchTickets(); // Оновлюємо список
      } else {
        throw new Error(response.message || 'Помилка видалення тикету');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка видалення тикету');
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
export const useCities = (page = 1, limit = 20, search?: string): {
  cities: City[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  isLoading: boolean;
  error: string | null;
  createCity: (cityData: Omit<City, '_id'>) => Promise<City>;
  updateCity: (id: string, updates: Partial<City>) => Promise<City>;
  deleteCity: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
} => {
  const [cities, setCities] = useState<City[]>([]);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 1,
    totalItems: 0,
    hasNext: false,
    hasPrev: false
  });
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);

  const fetchCities = useCallback(async () => {
    try {
      startLoading();
      setError(null);
      
      const response = await apiService.getCities({ page, limit, search });
      
      if (response.success && response.data) {
        setCities(Array.isArray(response.data) ? response.data : []);
        // Оновлюємо пагінацію з відповіді
        if (response.pagination) {
          setPagination(response.pagination);
        }
      } else {
        setError(response.message || 'Помилка завантаження міст');
        setCities([]); // Встановлюємо порожній масив при помилці
      }
    } catch (err: unknown) {
      setError((err as Error).message || 'Помилка завантаження міст');
      setCities([]); // Встановлюємо порожній масив при помилці
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading, page, limit, search]);

  useEffect(() => {
    fetchCities();
  }, [fetchCities]);

  const createCity = useCallback(async (cityData: Omit<City, '_id'>): Promise<City> => {
    try {
      const response = await apiService.createCity(cityData);
      if (response.success && response.data) {
        await fetchCities();
        return response.data as City;
      } else {
        throw new Error(response.message || 'Помилка створення міста');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка створення міста');
    }
  }, [fetchCities]);

  const updateCity = useCallback(async (id: string, updates: Partial<City>): Promise<City> => {
    try {
      const response = await apiService.updateCity(id, updates);
      if (response.success) {
        await fetchCities();
        return (response.data as City) || ({} as City);
      } else {
        throw new Error(response.message || 'Помилка оновлення міста');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка оновлення міста');
    }
  }, [fetchCities]);

  const deleteCity = useCallback(async (id: string): Promise<void> => {
    try {
      const response = await apiService.deleteCity(id);
      if (response.success) {
        await fetchCities();
      } else {
        throw new Error(response.message || 'Помилка видалення міста');
      }
    } catch (err: unknown) {
      throw new Error((err as Error).message || 'Помилка видалення міста');
    }
  }, [fetchCities]);

  return {
    cities,
    pagination,
    isLoading,
    error,
    createCity,
    updateCity,
    deleteCity,
    refetch: fetchCities
  };
};

// Хук для роботи з користувачами
export const useUsers = (isActive?: boolean): {
  users: User[];
  isLoading: boolean;
  error: string | null;
  refetch: (activeFilter?: boolean) => Promise<void>;
  forceDeleteUser: (userId: string) => Promise<void>;
} => {
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
    } catch (err: unknown) {
      setError((err as Error).message || 'Помилка завантаження користувачів');
      setUsers([]); // Встановлюємо порожній масив при помилці
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  useEffect(() => {
    fetchUsers(isActive);
  }, [fetchUsers, isActive]);

  const refetch = useCallback((activeFilter?: boolean): Promise<void> => {
    return fetchUsers(activeFilter);
  }, [fetchUsers]);

  const forceDeleteUser = useCallback(async (userId: string): Promise<void> => {
    const response = await apiService.forceDeleteUser(userId);
    if (response.success) {
      // Оновлюємо список користувачів після видалення
      await fetchUsers();
    } else {
      throw new Error(response.message || 'Помилка видалення користувача');
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
export const useDeactivatedUsers = (): {
  deactivatedUsers: User[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  activateUser: (userId: string) => Promise<void>;
} => {
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
    } catch (err: unknown) {
      setError((err as Error).message || 'Помилка завантаження деактивованих користувачів');
      setDeactivatedUsers([]);
    } finally {
      stopLoading();
    }
  }, [startLoading, stopLoading]);

  useEffect(() => {
    fetchDeactivatedUsers();
  }, [fetchDeactivatedUsers]);

  const activateUser = useCallback(async (userId: string): Promise<void> => {
    const response = await apiService.toggleUserActive(userId);
    if (response.success) {
      // Оновлюємо список деактивованих користувачів після активації
      await fetchDeactivatedUsers();
    } else {
      throw new Error(response.message || 'Помилка активації користувача');
    }
  }, [fetchDeactivatedUsers]);

  const refetch = useCallback((): Promise<void> => {
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
    const handler = setTimeout((): void => {
      setDebouncedValue(value);
    }, delay);

    return (): void => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

// Хук для роботи з локальним сховищем
export const useLocalStorage = <T>(key: string, initialValue: T): [T, (value: T | ((val: T) => T)) => void, () => void] => {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Помилка читання з localStorage для ключа "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value: T | ((val: T) => T)): void => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Помилка запису в localStorage для ключа "${key}":`, error);
    }
  }, [key, storedValue]);

  const removeValue = useCallback((): void => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Помилка видалення з localStorage для ключа "${key}":`, error);
    }
  }, [key, initialValue]);

  return [storedValue, setValue, removeValue] as const;
};

// Хук для відстеження розміру вікна
export const useWindowSize = (): { width: number; height: number } => {
  const [windowSize, setWindowSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  useEffect(() => {
    const handleResize = debounce((): void => {
      setWindowSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    }, 100);

    window.addEventListener('resize', handleResize);
    return (): void => window.removeEventListener('resize', handleResize);
  }, []);

  return windowSize;
};

// Хук для відстеження кліків поза елементом
export const useClickOutside = (callback: () => void): React.RefObject<HTMLDivElement | null> => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        callback();
      }
    };

    document.addEventListener('mousedown', handleClick);
    return (): void => document.removeEventListener('mousedown', handleClick);
  }, [callback]);

  return ref;
};

// Хук для копіювання в буфер обміну
export const useClipboard = (): { copied: boolean; copy: (text: string) => Promise<boolean> } => {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout((): void => setCopied(false), 2000);
      return true;
    } catch (error) {
      // eslint-disable-next-line no-console
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
export const useNotifications = (): {
  notifications: Ticket[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
} => {
  const [notifications, setNotifications] = useState<Ticket[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);
  const [_socket, setSocket] = useState<unknown>(null);

  const fetchNotifications = useCallback(async (): Promise<void> => {
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
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('Помилка завантаження сповіщень:', error);
      setError((error as Error).message || 'Помилка завантаження сповіщень');
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
        // eslint-disable-next-line no-console
        console.warn('Socket URL is not configured via REACT_APP_SOCKET_URL or REACT_APP_API_URL');
        return;
      }

      const socketInstance = io(socketBase, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', (): void => {
        // eslint-disable-next-line no-console
        console.log('🔌 WebSocket підключено для тікетів');
        // Приєднуємося до кімнати адміністраторів
        socketInstance.emit('join-admin-room');
      });

      socketInstance.on('disconnect', (): void => {
        // eslint-disable-next-line no-console
        console.log('🔌 WebSocket відключено для тікетів');
      });

      // Слухаємо сповіщення про тікети
      socketInstance.on('ticket-notification', (notification: { type: string; data: Ticket }): void => {
        // eslint-disable-next-line no-console
        console.log('📢 Отримано WebSocket сповіщення про тікет:', notification);
        
        if (notification.type === 'new_ticket') {
          // Додаємо новий тікет до списку сповіщень
          setNotifications(prev => {
            const newNotifications = [notification.data, ...prev];
            // eslint-disable-next-line no-console
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
              // eslint-disable-next-line no-console
              console.log('🔔 useNotifications: Removing closed ticket, total notifications:', filtered.length);
              return filtered;
            });
          } else {
            // Оновлюємо існуючий тікет
            setNotifications(prev => {
              const updated = prev.map(ticket => 
                ticket._id === ticketData._id ? { ...ticket, ...ticketData } : ticket
              );
              // eslint-disable-next-line no-console
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
      socketInstance.on('ticket-count-update', (_data: unknown): void => {
        // eslint-disable-next-line no-console
        console.log('📊 Отримано оновлення кількості тікетів:', _data);
        // Можна використовувати для синхронізації лічильника
      });

      setSocket(socketInstance);

      return (): void => {
        socketInstance.disconnect();
      };
    });
  }, []);

  // Автоматичне оновлення кожні 4 години та резервне оновлення
  useEffect(() => {
    fetchNotifications();
    
    const interval = setInterval((): void => {
      fetchNotifications();
    }, 14400000); // 4 години (4 * 60 * 60 * 1000)

    return (): void => clearInterval(interval);
  }, [fetchNotifications]);

  return {
    notifications,
    isLoading,
    error,
    refetch: fetchNotifications
  };
};

// Хук для сповіщень про запити на реєстрацію
export const useRegistrationNotifications = (): {
  registrations: User[];
  isLoading: boolean;
  error: string | null;
  newRegistrationCount: number;
  resetNewRegistrationCount: () => void;
  refetch: () => Promise<void>;
} => {
  const [registrations, setRegistrations] = useState<User[]>([]);
  const { isLoading, startLoading, stopLoading } = useLoading();
  const [error, setError] = useState<string | null>(null);
  const [_socket, setSocket] = useState<unknown>(null);
  const [newRegistrationCount, setNewRegistrationCount] = useState(0);

  const fetchRegistrations = useCallback(async (): Promise<void> => {
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
        // API повертає User[] напряму, а не об'єкт з docs
        setRegistrations(Array.isArray(response.data) ? response.data : []);
      } else {
        setError(response.message || 'Помилка завантаження запитів на реєстрацію');
        setRegistrations([]);
      }
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error('Помилка завантаження запитів на реєстрацію:', error);
      setError((error as Error).message || 'Помилка завантаження запитів на реєстрацію');
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
        // eslint-disable-next-line no-console
        // eslint-disable-next-line no-console
        console.warn('Socket URL is not configured via REACT_APP_SOCKET_URL or REACT_APP_API_URL');
        return;
      }

      const socketInstance = io(socketBase, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketInstance.on('connect', (): void => {
        // eslint-disable-next-line no-console
        console.log('🔌 WebSocket підключено для реєстрацій');
        // Приєднуємося до кімнати адміністраторів
        socketInstance.emit('join-admin-room');
      });

      socketInstance.on('disconnect', (): void => {
        // eslint-disable-next-line no-console
        console.log('🔌 WebSocket відключено для реєстрацій');
      });

      // Слухаємо сповіщення про нові реєстрації
      socketInstance.on('registration-notification', (notification: { type: string; data: User | { status: string; userId?: string }; userId?: string }): void => {
        // eslint-disable-next-line no-console
        console.log('📢 Отримано WebSocket сповіщення про реєстрацію:', notification);
        
        if (notification.type === 'new_registration_request') {
          // Додаємо нову реєстрацію до списку
          setRegistrations(prev => {
            const newRegistrations = [notification.data as User, ...prev];
            // eslint-disable-next-line no-console
            console.log('👤 useRegistrationNotifications: Adding new registration, total:', newRegistrations.length);
            return newRegistrations;
          });
          setNewRegistrationCount(prev => {
            const newCount = prev + 1;
            // eslint-disable-next-line no-console
            console.log('👤 useRegistrationNotifications: Incrementing newRegistrationCount to:', newCount);
            return newCount;
          });
        } else if (notification.type === 'registration_status_change') {
          // Оновлюємо статус існуючої реєстрації або видаляємо її
          const dataWithStatus = notification.data as { status: string; userId?: string };
          if (dataWithStatus.status === 'approved' || dataWithStatus.status === 'rejected') {
            setRegistrations(prev => {
              const filtered = prev.filter(reg => reg._id !== (notification.userId || dataWithStatus.userId));
              // eslint-disable-next-line no-console
              console.log('👤 useRegistrationNotifications: Removing registration, total:', filtered.length);
              return filtered;
            });
          }
        }
      });

      // Слухаємо оновлення кількості реєстрацій
      socketInstance.on('registration-count-update', (_data: unknown): void => {
        // eslint-disable-next-line no-console
        console.log('📊 Отримано оновлення кількості реєстрацій:', _data);
        // Можна використовувати для синхронізації лічильника
      });

      setSocket(socketInstance);

      return (): void => {
        socketInstance.disconnect();
      };
    });
  }, []);

  // Початкове завантаження та резервне оновлення
  useEffect(() => {
    fetchRegistrations();
    
    // Резервне оновлення кожні 5 хвилин (на випадок проблем з WebSocket)
    const interval = setInterval((): void => {
      fetchRegistrations();
    }, 300000); // 5 хвилин

    return (): void => clearInterval(interval);
  }, [fetchRegistrations]);

  // Функція для скидання лічильника нових реєстрацій
  const resetNewRegistrationCount = useCallback((): void => {
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
