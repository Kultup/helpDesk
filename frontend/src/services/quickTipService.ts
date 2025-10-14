import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// Створюємо екземпляр axios з базовою конфігурацією
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Додаємо токен авторизації до кожного запиту
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Обробляємо помилки відповідей
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export interface QuickTip {
  _id: string;
  category: string;
  title: string;
  description: string;
  steps: string[];
  priority: number;
  isActive: boolean;
  helpfulCount: number;
  notHelpfulCount: number;
  helpfulnessRatio: number;
  tags: string[];
  createdBy: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  updatedBy?: {
    _id: string;
    firstName: string;
    lastName: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface QuickTipResponse {
  success: boolean;
  data: QuickTip[];
  category?: string;
  count?: number;
  pagination?: {
    current: number;
    pages: number;
    total: number;
  };
}

export interface CreateQuickTipData {
  category: string;
  title: string;
  description: string;
  steps: Array<{
    step: number;
    instruction: string;
  }>;
  priority?: number;
  tags?: string[];
}

export interface UpdateQuickTipData extends Partial<CreateQuickTipData> {}

export interface RateQuickTipData {
  isHelpful: boolean;
}

class QuickTipService {
  // Отримати швидкі поради по категорії
  async getQuickTipsByCategory(categoryId: string, limit: number = 5): Promise<QuickTipResponse> {
    try {
      const response = await api.get(`/quick-tips/category/${categoryId}`, {
        params: { limit }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при отриманні швидких порад');
    }
  }

  // Пошук швидких порад
  async searchQuickTips(query: string, categoryId?: string): Promise<QuickTipResponse> {
    try {
      const response = await api.get('/quick-tips/search', {
        params: { query, categoryId }
      });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при пошуку швидких порад');
    }
  }

  // Оцінити корисність поради
  async rateQuickTip(tipId: string, isHelpful: boolean): Promise<any> {
    try {
      const response = await api.post(`/quick-tips/${tipId}/rate`, { isHelpful });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при оцінці швидкої поради');
    }
  }

  // Отримати всі швидкі поради (для адміністраторів)
  async getAllQuickTips(params?: {
    page?: number;
    limit?: number;
    category?: string;
    isActive?: boolean;
  }): Promise<QuickTipResponse> {
    try {
      const response = await api.get('/quick-tips', { params });
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при отриманні швидких порад');
    }
  }

  // Створити нову швидку пораду (для адміністраторів)
  async createQuickTip(data: CreateQuickTipData): Promise<{ success: boolean; data: QuickTip; message: string }> {
    try {
      const response = await api.post('/quick-tips', data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при створенні швидкої поради');
    }
  }

  // Оновити швидку пораду (для адміністраторів)
  async updateQuickTip(tipId: string, data: UpdateQuickTipData): Promise<{ success: boolean; data: QuickTip; message: string }> {
    try {
      const response = await api.put(`/quick-tips/${tipId}`, data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при оновленні швидкої поради');
    }
  }

  // Видалити швидку пораду (для адміністраторів)
  async deleteQuickTip(tipId: string): Promise<{ success: boolean; message: string }> {
    try {
      const response = await api.delete(`/quick-tips/${tipId}`);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.message || 'Помилка при видаленні швидкої поради');
    }
  }
}

export const quickTipService = new QuickTipService();