import axios from 'axios';
import { Platform } from 'react-native';
// Читаємо конфіг із app.json (без потреби у resolveJsonModule)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const appConfig = require('../../app.json');
import { User } from '../types';

// Простий замінник AsyncStorage
const SimpleStorage = {
  async getItem(key: string): Promise<string | null> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
    return null;
  },
  async setItem(key: string, value: string): Promise<void> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
  },
  async removeItem(key: string): Promise<void> {
    // В реальному додатку тут буде використовуватися localStorage або інше сховище
  }
};

// Базові типи для API
interface ApiResponse<T> {
  data: T;
  message?: string;
}

interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  closedTickets: number;
  pendingTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  moderatorUsers: number;
  avgResolutionTime: number;
  customerSatisfaction: number;
}

interface Category {
  id: string;
  name: string;
  description?: string;
}

class ApiService {
  private api: any;
  private baseURL: string = (
    (appConfig?.config && appConfig.config.apiBaseUrl) ||
    (Platform.OS === 'android' ? 'http://10.0.2.2:5000/api' : 'http://localhost:5000/api')
  );

  constructor() {
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Додаємо токен до кожного запиту
    this.api.interceptors.request.use(async (config: any) => {
      const token = await SimpleStorage.getItem('authToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Обробляємо відповіді та помилки
    this.api.interceptors.response.use(
      (response: any) => response,
      async (error: any) => {
        if (error.response?.status === 401) {
          // Токен недійсний, видаляємо його
          await SimpleStorage.removeItem('authToken');
          await SimpleStorage.removeItem('user');
        }
        return Promise.reject(error);
      }
    );
  }

  // Аутентифікація
  async login(credentials: any): Promise<any> {
    const response = await this.api.post('/auth/login', credentials);
    
    if (response.data.token) {
      await SimpleStorage.setItem('authToken', response.data.token);
      await SimpleStorage.setItem('user', JSON.stringify(response.data.user));
    }
    
    return response.data;
  }

  async logout(): Promise<void> {
    await SimpleStorage.removeItem('authToken');
    await SimpleStorage.removeItem('user');
  }

  async getCurrentUser(): Promise<User | null> {
    const userStr = await SimpleStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  // Дашборд
  async getDashboardStats(): Promise<DashboardStats> {
    const response = await this.api.get('/analytics/dashboard');
    return response.data.data || response.data;
  }

  // Тікети
  async getTickets(page = 1, limit = 20): Promise<{ tickets: any[], total: number }> {
    const response = await this.api.get(`/tickets?page=${page}&limit=${limit}`);
    return response.data.data || response.data;
  }

  async getTicketById(id: string): Promise<any> {
    const response = await this.api.get(`/tickets/${id}`);
    return response.data.data || response.data;
  }

  async updateTicketStatus(id: string, status: string): Promise<any> {
    const response = await this.api.patch(`/tickets/${id}`, { status });
    return response.data.data || response.data;
  }

  async assignTicket(id: string, userId: string): Promise<any> {
    const response = await this.api.patch(`/tickets/${id}`, { assignedTo: userId });
    return response.data.data || response.data;
  }

  // Користувачі
  async getUsers(page = 1, limit = 20): Promise<{ users: User[], total: number }> {
    const response = await this.api.get(`/users?page=${page}&limit=${limit}`);
    return response.data.data || response.data;
  }

  async getUserById(id: string): Promise<User> {
    const response = await this.api.get(`/users/${id}`);
    return response.data.data || response.data;
  }

  async updateUserStatus(id: string, isActive: boolean): Promise<User> {
    const response = await this.api.patch(`/users/${id}`, { isActive });
    return response.data.data || response.data;
  }

  // Категорії
  async getCategories(): Promise<Category[]> {
    const response = await this.api.get('/categories');
    return response.data.data || response.data;
  }

  // Перевірка з'єднання
  async checkConnection(): Promise<boolean> {
    try {
      await this.api.get('/test');
      return true;
    } catch {
      return false;
    }
  }
}

export default new ApiService();