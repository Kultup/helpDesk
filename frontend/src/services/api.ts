import axios, { AxiosInstance, AxiosResponse } from 'axios';
import {
  User,
  Ticket,
  City,
  Position,
  Category,
  CreatePositionData,
  CreateCategoryForm,
  UpdateCategoryForm,
  CategoryStats,
  AnalyticsData,
  ApiResponse,
  UpdateTicketResponse,
  TicketsApiResponse,
  PositionsResponse,
  LoginForm,
  CreateTicketForm,
  UpdateTicketForm,
  TicketFilters,
  PaginationOptions,
  SortOptions,
  CalendarEvent,
  CreateEventForm,
  UpdateEventForm,
  EventFilters,
  AdminNote,
  CreateNoteForm,
  UpdateNoteForm,
  NoteFilters,
  NotificationTemplate,
  CreateNotificationTemplateForm,
  Institution,
  CreateInstitutionData,
  InstitutionsResponse,
  InstitutionType,
  TelegramMessage,
} from '../types';

// Реекспорт для зручності
export type { ApiResponse } from '../types';

// У development режимі використовуємо відносний шлях /api (проксується через setupProxy)
// У production використовуємо REACT_APP_API_URL або відносний шлях
const getApiBaseUrl = (): string => {
  if (process.env.NODE_ENV === 'development') {
    // У development завжди використовуємо відносний шлях, який буде проксуватися
    return '/api';
  }
  // У production використовуємо змінну середовища або відносний шлях
  return process.env.REACT_APP_API_URL || '/api';
};

const API_BASE_URL = getApiBaseUrl();

class ApiService {
  private api: AxiosInstance;

  constructor() {
    // Перевірка налаштування API URL
    if (process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('[API SERVICE] Development режим: використовується відносний шлях /api (проксується через setupProxy)');
    } else if (!process.env.REACT_APP_API_URL) {
      // eslint-disable-next-line no-console
      console.warn('[API SERVICE] REACT_APP_API_URL не встановлено, використовується відносний шлях /api');
    }
    
    this.api = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Інтерцептор для додавання токену
    this.api.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('token');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Інтерцептор для обробки відповідей
    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      (error: unknown) => {
        const err = error as { config?: { url?: string }; response?: { status?: number; data?: unknown } };
        // eslint-disable-next-line no-console
        console.error('API: Помилка запиту до:', err.config?.url, 'статус:', err.response?.status);
        // eslint-disable-next-line no-console
        console.error('API: Деталі помилки:', err.response?.data);
        
        // Видаляємо автоматичне перенаправлення на логін
        // Дозволяємо AuthContext обробити 401 помилки
        if (err.response?.status === 401) {
          // Тільки логуємо помилку, не перенаправляємо автоматично
        }
        return Promise.reject(error);
      }
    );
  }

  // Загальні HTTP методи
  async get<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T> {
    const response: AxiosResponse<T> = await this.api.get(url, config);
    return response.data;
  }

  async post<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T> {
    const response: AxiosResponse<T> = await this.api.post(url, data, config);
    return response.data;
  }

  async put<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T> {
    const response: AxiosResponse<T> = await this.api.put(url, data, config);
    return response.data;
  }

  async delete<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T> {
    const response: AxiosResponse<T> = await this.api.delete(url, config);
    return response.data;
  }

  async patch<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T> {
    const response: AxiosResponse<T> = await this.api.patch(url, data, config);
    return response.data;
  }

  // Методи аутентифікації
  async login(credentials: LoginForm): Promise<ApiResponse<{ user: User; token: string }>> {
    const response: AxiosResponse<ApiResponse<{ user: User; token: string }>> = 
      await this.api.post('/auth/login', credentials);
    return response.data;
  }

  async logout(): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.post('/auth/logout');
    return response.data;
  }

  async getCurrentUser(): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.get('/auth/me');
    return response.data;
  }

  // Методи для тикетів
  async getTickets(
    filters?: TicketFilters,
    pagination?: PaginationOptions,
    sort?: SortOptions
  ): Promise<TicketsApiResponse> {
    const params = new URLSearchParams();
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else {
            params.append(key, String(value));
          }
        }
      });
    }
    
    if (pagination) {
      params.append('page', String(pagination.page));
      params.append('limit', String(pagination.limit));
    }
    
    if (sort) {
      params.append('sortBy', sort.field);
      params.append('sortOrder', sort.direction);
    }

    const response: AxiosResponse<TicketsApiResponse> = 
      await this.api.get(`/tickets?${params.toString()}`);
    return response.data;
  }

  async getTicketById(id: string): Promise<ApiResponse<Ticket>> {
    const response: AxiosResponse<ApiResponse<Ticket>> = await this.api.get(`/tickets/${id}`);
    return response.data;
  }

  async createTicket(ticket: CreateTicketForm, files?: File[]): Promise<ApiResponse<Ticket>> {
    // Мапимо cityId на city для бекенду
    const { cityId, ...rest } = ticket;
    const ticketData = {
      ...rest,
      city: cityId
    };
    
    // Перевірка наявності обов'язкових полів
    if (!ticketData.city) {
      throw new Error('Місто є обов\'язковим полем');
    }
    if (!ticketData.title || !ticketData.title.trim()) {
      throw new Error('Заголовок є обов\'язковим полем');
    }
    if (!ticketData.description || !ticketData.description.trim()) {
      throw new Error('Опис є обов\'язковим полем');
    }
    
    // eslint-disable-next-line no-console
    console.log('📤 Відправляю дані для створення тикету:', JSON.stringify(ticketData, null, 2));
    if (files && files.length > 0) {
      // eslint-disable-next-line no-console
      console.log('📎 Файли для відправки:', files.map(f => f.name));
    }
    
    try {
      // Якщо є файли, використовуємо FormData
      if (files && files.length > 0) {
        const formData = new FormData();
        formData.append('title', ticketData.title);
        formData.append('description', ticketData.description);
        formData.append('priority', ticketData.priority);
        formData.append('city', ticketData.city);

        // Додаємо файли
        files.forEach((file) => {
          formData.append('attachments', file);
        });

        // Axios автоматично встановлює Content-Type для FormData з правильним boundary
        // Не встановлюємо Content-Type вручну, щоб axios міг додати boundary
        const response: AxiosResponse<ApiResponse<Ticket>> = await this.api.post('/tickets', formData);
        // eslint-disable-next-line no-console
        console.log('✅ Тикет успішно створено з файлами:', response.data);
        return response.data;
      } else {
        // Якщо немає файлів, використовуємо JSON
        const response: AxiosResponse<ApiResponse<Ticket>> = await this.api.post('/tickets', ticketData);
        // eslint-disable-next-line no-console
        console.log('✅ Тикет успішно створено:', response.data);
        return response.data;
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: unknown; status?: number }; message?: string };
      // eslint-disable-next-line no-console
      console.error('❌ Помилка створення тикету:', err.response?.data || err.message);
      // eslint-disable-next-line no-console
      console.error('❌ Деталі помилки:', JSON.stringify(err.response?.data, null, 2));
      // eslint-disable-next-line no-console
      console.error('❌ Статус помилки:', err.response?.status);
      throw error;
    }
  }

  async updateTicket(id: string, updates: UpdateTicketForm): Promise<UpdateTicketResponse> {
    const response: AxiosResponse<UpdateTicketResponse> = 
      await this.api.put(`/tickets/${id}`, updates);
    return response.data;
  }

  async deleteTicket(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(`/tickets/${id}`);
    return response.data;
  }

  async bulkDeleteTickets(ticketIds: string[]): Promise<ApiResponse<{ deletedCount: number }>> {
    const response: AxiosResponse<ApiResponse<{ deletedCount: number }>> = 
      await this.api.delete('/tickets/bulk/delete', { data: { ticketIds } });
    return response.data;
  }


  // Методи для коментарів
  async addComment(ticketId: string, content: string): Promise<ApiResponse<Comment>> {
    const response: AxiosResponse<ApiResponse<Comment>> = 
      await this.api.post(`/tickets/${ticketId}/comments`, { content });
    return response.data;
  }

  async deleteComment(ticketId: string, commentId: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = 
      await this.api.delete(`/tickets/${ticketId}/comments/${commentId}`);
    return response.data;
  }

  async sendTelegramMessage(ticketId: string, message: string): Promise<ApiResponse<{ ticketId: string; sentAt: string }>> {
    const response: AxiosResponse<ApiResponse<{ ticketId: string; sentAt: string }>> = 
      await this.api.post(`/tickets/${ticketId}/send-telegram-message`, { message });
    return response.data;
  }



  // Методи для міст
  async getCities(params?: { page?: number; limit?: number; search?: string; region?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }): Promise<ApiResponse<City[]> & { pagination?: Record<string, unknown> }> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.region) queryParams.append('region', params.region);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const url = queryParams.toString() ? `/cities?${queryParams.toString()}` : '/cities';
    const response: AxiosResponse<ApiResponse<City[]> & { pagination?: Record<string, unknown> }> = await this.api.get(url);
    return response.data;
  }

  async getSimpleCities(): Promise<ApiResponse<Array<{ id: string; name: string; region: string }>>> {
    const response: AxiosResponse<ApiResponse<Array<{ id: string; name: string; region: string }>>> = await this.api.get('/cities/simple/list');
    return response.data;
  }

  async createCity(city: Omit<City, '_id'>): Promise<ApiResponse<City>> {
    const response: AxiosResponse<ApiResponse<City>> = await this.api.post('/cities', city);
    return response.data;
  }

  async updateCity(id: string, updates: Partial<City>): Promise<ApiResponse<City>> {
    const response: AxiosResponse<ApiResponse<City>> = 
      await this.api.put(`/cities/${id}`, updates);
    return response.data;
  }

  async deleteCity(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(`/cities/${id}`);
    return response.data;
  }

  // Методи для посад
  async getPositions(params?: {
    isActive?: boolean | 'all';
    page?: number;
    limit?: number;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<PositionsResponse>> {
    const queryParams = new URLSearchParams();
    if (params?.isActive !== undefined) {
      queryParams.append('isActive', String(params.isActive));
    }
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const url = queryParams.toString() ? `/positions?${queryParams.toString()}` : '/positions';
    const response: AxiosResponse<ApiResponse<PositionsResponse>> = await this.api.get(url);
    return response.data;
  }

  async getSimplePositions(): Promise<ApiResponse<Array<{ id: string; title: string; department: string }>>> {
    const response: AxiosResponse<ApiResponse<Array<{ id: string; title: string; department: string }>>> = await this.api.get('/positions/simple/list');
    return response.data;
  }

  async createPosition(position: CreatePositionData): Promise<ApiResponse<Position>> {
    const response: AxiosResponse<ApiResponse<Position>> = 
      await this.api.post('/positions', position);
    return response.data;
  }

  async updatePosition(id: string, updates: Partial<Position>): Promise<ApiResponse<Position>> {
    const response: AxiosResponse<ApiResponse<Position>> = 
      await this.api.put(`/positions/${id}`, updates);
    return response.data;
  }

  async deletePosition(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = 
      await this.api.delete(`/positions/${id}`);
    return response.data;
  }

  async bulkDeletePositions(positionIds: string[]): Promise<ApiResponse<{ deletedCount: number }>> {
    const response: AxiosResponse<ApiResponse<{ deletedCount: number }>> = 
      await this.api.delete('/positions/bulk/delete', { data: { positionIds } });
    return response.data;
  }

  async activatePosition(id: string): Promise<ApiResponse<Position>> {
    const response: AxiosResponse<ApiResponse<Position>> = 
      await this.api.patch(`/positions/${id}/activate`);
    return response.data;
  }

  // Методи для категорій
  async getCategories(includeInactive?: boolean): Promise<ApiResponse<Category[]>> {
    const params = new URLSearchParams();
    if (includeInactive !== undefined) {
      params.append('includeInactive', String(includeInactive));
    }
    
    const response: AxiosResponse<ApiResponse<Category[]>> = 
      await this.api.get(`/categories${params.toString() ? `?${params.toString()}` : ''}`);
    return response.data;
  }

  async getCategoryById(id: string): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = await this.api.get(`/categories/${id}`);
    return response.data;
  }

  async createCategory(category: CreateCategoryForm): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = 
      await this.api.post('/categories', category);
    return response.data;
  }

  async uploadCategoryIcon(file: File): Promise<ApiResponse<{ url: string }>> {
    const formData = new FormData();
    formData.append('icon', file);
    
    const response: AxiosResponse<ApiResponse<{ url: string }>> = 
      await this.api.post('/categories/upload-icon', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
    return response.data;
  }

  async updateCategory(id: string, updates: UpdateCategoryForm): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = 
      await this.api.put(`/categories/${id}`, updates);
    return response.data;
  }

  async deleteCategory(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = 
      await this.api.delete(`/categories/${id}`);
    return response.data;
  }

  async deactivateCategory(id: string): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = 
      await this.api.patch(`/categories/${id}/deactivate`);
    return response.data;
  }

  async activateCategory(id: string): Promise<ApiResponse<Category>> {
    const response: AxiosResponse<ApiResponse<Category>> = 
      await this.api.patch(`/categories/${id}/activate`);
    return response.data;
  }

  async getCategoryStats(): Promise<ApiResponse<CategoryStats[]>> {
    const response: AxiosResponse<ApiResponse<CategoryStats[]>> = 
      await this.api.get('/categories/stats/usage');
    return response.data;
  }

  // Методи для користувачів
  async getUsers(params?: {
    isActive?: boolean;
    page?: number;
    limit?: number;
    search?: string;
    role?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<User[]>> {
    const queryParams = new URLSearchParams();
    if (params?.isActive !== undefined) {
      queryParams.append('isActive', String(params.isActive));
    }
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.role) queryParams.append('role', params.role);
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);
    
    const response: AxiosResponse<ApiResponse<User[]>> = 
      await this.api.get(`/users${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  }

  async getPendingRegistrations(params?: {
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }): Promise<ApiResponse<User[]>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.sortBy) queryParams.append('sortBy', params.sortBy);
    if (params?.sortOrder) queryParams.append('sortOrder', params.sortOrder);

    const response: AxiosResponse<ApiResponse<User[]>> = 
      await this.api.get(`/users/pending-registrations${queryParams.toString() ? `?${queryParams.toString()}` : ''}`);
    return response.data;
  }

  async getPendingRegistrationsCount(): Promise<ApiResponse<{ count: number }>> {
    const response: AxiosResponse<ApiResponse<{ docs: User[], pagination: { totalItems: number } }>> = 
      await this.api.get('/users/pending-registrations?limit=1');
    
    return {
      success: response.data.success,
      data: { count: response.data.data?.pagination?.totalItems || 0 },
      message: response.data.message
    };
  }

  async getUserById(id: string): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = await this.api.get(`/users/${id}`);
    return response.data;
  }

  async createUser(userData: Omit<User, '_id' | 'createdAt' | 'updatedAt'>): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = 
      await this.api.post('/users', userData);
    return response.data;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = 
      await this.api.put(`/users/${id}`, updates);
    return response.data;
  }

  async deleteUser(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(`/users/${id}`);
    return response.data;
  }

  async forceDeleteUser(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(`/users/${id}/force`);
    return response.data;
  }

  async toggleUserActive(id: string): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = 
      await this.api.patch(`/users/${id}/toggle-active`);
    return response.data;
  }

  async bulkToggleUsers(userIds: string[], action: 'activate' | 'deactivate'): Promise<ApiResponse<{ updated: number; errors: Array<Record<string, unknown>> }>> {
    const response: AxiosResponse<ApiResponse<{ updated: number; errors: Array<Record<string, unknown>> }>> = 
      await this.api.patch('/users/bulk/toggle-active', { userIds, action });
    return response.data;
  }

  // Методи для Active Directory
  async testADConnection(): Promise<ApiResponse<Record<string, unknown>>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = await this.api.get('/active-directory/test');
    return response.data;
  }

  async getADUsers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    filterStatus?: 'all' | 'enabled' | 'disabled';
  }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.filterStatus) queryParams.append('filterStatus', params.filterStatus);
    
    const url = queryParams.toString() ? `/active-directory/users?${queryParams.toString()}` : '/active-directory/users';
    const response: AxiosResponse<ApiResponse<Array<Record<string, unknown>>>> = await this.api.get(url);
    return response.data;
  }

  async getADComputers(params?: {
    page?: number;
    limit?: number;
    search?: string;
    filterStatus?: 'all' | 'enabled' | 'disabled';
    filterOS?: 'all' | 'windows' | 'linux' | 'mac';
  }): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const queryParams = new URLSearchParams();
    if (params?.page) queryParams.append('page', params.page.toString());
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.search) queryParams.append('search', params.search);
    if (params?.filterStatus) queryParams.append('filterStatus', params.filterStatus);
    if (params?.filterOS) queryParams.append('filterOS', params.filterOS);
    
    const url = queryParams.toString() ? `/active-directory/computers?${queryParams.toString()}` : '/active-directory/computers';
    const response: AxiosResponse<ApiResponse<Array<Record<string, unknown>>>> = await this.api.get(url);
    return response.data;
  }

  async getADStatistics(): Promise<ApiResponse<Record<string, unknown>>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = await this.api.get('/active-directory/statistics');
    return response.data;
  }

  // Методи для аналітики
  async getAnalytics(
    dateFrom?: string,
    dateTo?: string
  ): Promise<ApiResponse<AnalyticsData>> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('startDate', dateFrom);
    if (dateTo) params.append('endDate', dateTo);

    const queryString = params.toString();
    const url = queryString ? `/analytics/overview?${queryString}` : '/analytics/overview';
    
    const response: AxiosResponse<ApiResponse<AnalyticsData>> = 
      await this.api.get(url);
    return response.data;
  }

  async getDashboardStats(): Promise<ApiResponse<Record<string, unknown>>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = await this.api.get('/analytics/dashboard');
    return response.data;
  }

  async getUserMonthlyStats(): Promise<ApiResponse<{
    currentMonth: { count: number; name: string; start: string; end: string };
    previousMonth: { count: number; name: string; start: string; end: string };
    totalUsers: number;
    growth: number;
    growthAbsolute: number;
  }>> {
    const response: AxiosResponse<ApiResponse<{
      currentMonth: { count: number; name: string; start: string; end: string };
      previousMonth: { count: number; name: string; start: string; end: string };
      totalUsers: number;
      growth: number;
      growthAbsolute: number;
    }>> = await this.api.get('/analytics/user-monthly-stats');
    return response.data;
  }

  async getHeatMapData(
    dateFrom?: string,
    dateTo?: string
  ): Promise<ApiResponse<Record<string, unknown>>> {
    const params = new URLSearchParams();
    if (dateFrom) params.append('dateFrom', dateFrom);
    if (dateTo) params.append('dateTo', dateTo);

    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = 
      await this.api.get(`/analytics/heatmap?${params.toString()}`);
    return response.data;
  }

  // Методи для експорту
  async exportTickets(
    format: 'csv' | 'excel',
    filters?: TicketFilters
  ): Promise<Blob> {
    const params = new URLSearchParams();
    params.append('format', format);
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v));
          } else {
            params.append(key, String(value));
          }
        }
      });
    }

    const response = await this.api.get(`/export/tickets?${params.toString()}`, {
      responseType: 'blob',
    });
    return response.data;
  }

  // Методи для користувачів
  async getAdmins(): Promise<ApiResponse<User[]>> {
    const response: AxiosResponse<ApiResponse<User[]>> = await this.api.get('/users/admins');
    return response.data;
  }

  // Методи для історії тікетів
  async getTicketHistory(ticketId: string): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const response: AxiosResponse<ApiResponse<Array<Record<string, unknown>>>> = 
      await this.api.get(`/tickets/${ticketId}/history`);
    return response.data;
  }

  async getTicketHistoryStats(ticketId: string): Promise<ApiResponse<Record<string, unknown>>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = 
      await this.api.get(`/tickets/${ticketId}/history/stats`);
    return response.data;
  }

  async addHistoryEntry(ticketId: string, data: {
    action: string;
    description: string;
    field?: string;
    oldValue?: unknown;
    newValue?: unknown;
    metadata?: Record<string, unknown>;
  }): Promise<ApiResponse<Record<string, unknown>>> {
    const response: AxiosResponse<ApiResponse<Record<string, unknown>>> = 
      await this.api.post(`/tickets/${ticketId}/history`, data);
    return response.data;
  }

  async deleteHistoryEntry(entryId: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = 
      await this.api.delete(`/tickets/history/${entryId}`);
    return response.data;
  }

  // Методи для календарних подій
  async getEvents(filters?: EventFilters): Promise<ApiResponse<CalendarEvent[]>> {
    const params = new URLSearchParams();
    
    if (filters) {
      if (filters.type?.length) {
        filters.type.forEach(type => params.append('type', type));
      }
      if (filters.status?.length) {
        filters.status.forEach(status => params.append('status', status));
      }
      if (filters.priority?.length) {
        filters.priority.forEach(priority => params.append('priority', priority));
      }
      if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
      if (filters.dateTo) params.append('dateTo', filters.dateTo);
      if (filters.search) params.append('search', filters.search);
    }

    const queryString = params.toString();
    const url = queryString ? `/events?${queryString}` : '/events';
    
    const response: AxiosResponse<ApiResponse<CalendarEvent[]>> = await this.api.get(url);
    return response.data;
  }

  async getEventById(id: string): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.get(`/events/${id}`);
    return response.data;
  }

  async createEvent(event: CreateEventForm): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.post('/events', event);
    return response.data;
  }

  async updateEvent(id: string, event: UpdateEventForm): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.put(`/events/${id}`, event);
    return response.data;
  }

  async deleteEvent(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = 
      await this.api.delete(`/events/${id}`);
    return response.data;
  }

  async getUpcomingEvents(): Promise<ApiResponse<CalendarEvent[]>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent[]>> = 
      await this.api.get('/events/upcoming');
    return response.data;
  }

  async addEventParticipant(eventId: string, userId: string): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.post(`/events/${eventId}/participants`, { userId });
    return response.data;
  }

  async removeEventParticipant(eventId: string, userId: string): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.delete(`/events/${eventId}/participants/${userId}`);
    return response.data;
  }

  async markEventCompleted(eventId: string): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.patch(`/events/${eventId}/complete`);
    return response.data;
  }

  async cancelEvent(eventId: string): Promise<ApiResponse<CalendarEvent>> {
    const response: AxiosResponse<ApiResponse<CalendarEvent>> = 
      await this.api.patch(`/events/${eventId}/cancel`);
    return response.data;
  }

  // ===== TIME TRACKING METHODS =====
  
  // Отримати записи часу для тікету
  async getTimeEntries(ticketId: string): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const response = await this.api.get(`/tickets/${ticketId}/time-entries`);
    return response.data;
  }

  // Створити новий запис часу
  async createTimeEntry(ticketId: string, data: {
    startTime: string;
    endTime?: string;
    duration?: number;
    description?: string;
    isActive?: boolean;
  }): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.post(`/tickets/${ticketId}/time-entries`, data);
    return response.data;
  }

  // Оновити запис часу
  async updateTimeEntry(ticketId: string, entryId: string, data: {
    endTime?: string;
    duration?: number;
    description?: string;
    isActive?: boolean;
  }): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.put(`/tickets/${ticketId}/time-entries/${entryId}`, data);
    return response.data;
  }

  // Видалити запис часу
  async deleteTimeEntry(ticketId: string, entryId: string): Promise<ApiResponse<null>> {
    const response = await this.api.delete(`/tickets/${ticketId}/time-entries/${entryId}`);
    return response.data;
  }

  // Отримати активну сесію відстеження часу
  async getActiveTimeSession(ticketId: string): Promise<ApiResponse<Record<string, unknown> | null>> {
    const response = await this.api.get(`/tickets/${ticketId}/time-entries/active`);
    return response.data;
  }

  // Запустити відстеження часу
  async startTimeTracking(ticketId: string, description?: string): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.post(`/tickets/${ticketId}/time-entries/start`, {
      description
    });
    return response.data;
  }

  // Зупинити відстеження часу
  async stopTimeTracking(ticketId: string, entryId: string): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.post(`/tickets/${ticketId}/time-entries/${entryId}/stop`);
    return response.data;
  }

  // Отримати статистику часу для тікету
  async getTimeStatistics(ticketId: string): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.get(`/tickets/${ticketId}/time-statistics`);
    return response.data;
  }

  // ===== TAGS METHODS =====
  
  // Отримати всі доступні теги
  async getTags(): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const response = await this.api.get('/tags');
    return response.data;
  }

  // Створити новий тег
  async createTag(data: { name: string; color: string; description?: string }): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.post('/tags', data);
    return response.data;
  }

  // Оновити тег
  async updateTag(tagId: string, data: { name?: string; color?: string; description?: string }): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.put(`/tags/${tagId}`, data);
    return response.data;
  }

  // Видалити тег
  async deleteTag(tagId: string): Promise<ApiResponse<null>> {
    const response = await this.api.delete(`/tags/${tagId}`);
    return response.data;
  }

  // Додати тег до тікету
  async addTagToTicket(ticketId: string, tagId: string): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.post(`/tickets/${ticketId}/tags/${tagId}`);
    return response.data;
  }

  // Видалити тег з тікету
  async removeTagFromTicket(ticketId: string, tagId: string): Promise<ApiResponse<null>> {
    const response = await this.api.delete(`/tickets/${ticketId}/tags/${tagId}`);
    return response.data;
  }

  // Отримати теги тікету
  async getTicketTags(ticketId: string): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    const response = await this.api.get(`/tickets/${ticketId}/tags`);
    return response.data;
  }

  // ===== NOTES METHODS =====
  
  // Отримати нотатки тікету
  async getTicketNotes(ticketId: string) {
    const response = await this.api.get(`/tickets/${ticketId}/notes`);
    return response.data;
  }

  // Створити нову нотатку
  async createTicketNote(ticketId: string, data: { content: string; isPrivate: boolean }) {
    const response = await this.api.post(`/tickets/${ticketId}/notes`, data);
    return response.data;
  }

  // Оновити нотатку
  async updateTicketNote(ticketId: string, noteId: string, data: { content?: string; isPrivate?: boolean }) {
    const response = await this.api.put(`/tickets/${ticketId}/notes/${noteId}`, data);
    return response.data;
  }

  // Видалити нотатку
  async deleteTicketNote(ticketId: string, noteId: string) {
    const response = await this.api.delete(`/tickets/${ticketId}/notes/${noteId}`);
    return response.data;
  }

  // Методи для Telegram
  async linkTelegram(telegramId: string): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = 
      await this.api.post('/telegram/link', { telegramId });
    return response.data;
  }

  async unlinkTelegram(): Promise<ApiResponse<User>> {
    const response: AxiosResponse<ApiResponse<User>> = 
      await this.api.delete('/telegram/link');
    return response.data;
  }

  // Швидкі сповіщення через Telegram в групу
  async sendTelegramNotification(payload: { message: string; type?: 'info' | 'warning' | 'error' | 'success' }): Promise<ApiResponse<{ sent: boolean; groupChatId: string }>> {
    const response: AxiosResponse<ApiResponse<{ sent: boolean; groupChatId: string }>> =
      await this.api.post('/telegram/send-notification', payload);
    return response.data;
  }




  // Методи для особистих нотаток адміністратора
  async getAdminNotes(filters?: NoteFilters): Promise<ApiResponse<AdminNote[]>> {
    const response = await this.api.get('/admin-notes', { params: filters });
    return response.data;
  }

  async getAdminNoteById(id: string): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.get(`/admin-notes/${id}`);
    return response.data;
  }

  async createAdminNote(data: CreateNoteForm): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.post('/admin-notes', data);
    return response.data;
  }

  async updateAdminNote(id: string, data: UpdateNoteForm): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.put(`/admin-notes/${id}`, data);
    return response.data;
  }

  async deleteAdminNote(id: string): Promise<ApiResponse<void>> {
    const response = await this.api.delete(`/admin-notes/${id}`);
    return response.data;
  }

  async togglePinNote(id: string): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.patch(`/admin-notes/${id}/pin`);
    return response.data;
  }



  async getPinnedNotes(): Promise<ApiResponse<AdminNote[]>> {
    const response = await this.api.get('/admin-notes/pinned');
    return response.data;
  }

  // ===== Notifications Templates (Quick messages) =====
  async getNotificationTemplates(params?: { type?: 'telegram' | 'web' | 'sms'; category?: 'ticket' | 'user' | 'system' | 'security' | 'maintenance' }): Promise<ApiResponse<NotificationTemplate[]>> {
    const queryParams = new URLSearchParams();
    if (params?.type) queryParams.append('type', params.type);
    if (params?.category) queryParams.append('category', params.category);
    const url = `/notifications/templates/list${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;
    const response: AxiosResponse<ApiResponse<NotificationTemplate[]>> = await this.api.get(url);
    return response.data;
  }

  async createNotificationTemplate(data: CreateNotificationTemplateForm): Promise<ApiResponse<NotificationTemplate>> {
    const response: AxiosResponse<ApiResponse<NotificationTemplate>> = await this.api.post('/notifications/templates', data);
    return response.data;
  }

  async deleteNotificationTemplate(id: string): Promise<ApiResponse<null>> {
    const response: AxiosResponse<ApiResponse<null>> = await this.api.delete(`/notifications/templates/${id}`);
    return response.data;
  }

  async addTagToNote(id: string, tag: string): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.post(`/admin-notes/${id}/tags`, { tag });
    return response.data;
  }

  async removeTagFromNote(id: string, tag: string): Promise<ApiResponse<AdminNote>> {
    const response = await this.api.delete(`/admin-notes/${id}/tags`, { data: { tag } });
    return response.data;
  }

  async getNotesStatistics(): Promise<ApiResponse<Record<string, unknown>>> {
    const response = await this.api.get('/admin-notes/statistics');
    return response.data;
  }

  // Методи для роботи з закладами
  async getInstitutions(params?: {
    page?: number;
    limit?: number;
    search?: string;
    type?: InstitutionType;
    city?: string;
    isActive?: boolean;
    isPublic?: boolean;
    isVerified?: boolean;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
    lat?: number;
    lng?: number;
    radius?: number;
  }): Promise<InstitutionsResponse> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const queryString = queryParams.toString();
    // Використовуємо автентифікований endpoint для отримання закладів (показує всі активні, не лише публічні)
    return this.get<InstitutionsResponse>(`/institutions${queryString ? `?${queryString}` : ''}`);
  }

  async getInstitutionById(id: string): Promise<ApiResponse<Institution>> {
    return this.get(`/institutions/${id}`);
  }

  async createInstitution(institution: CreateInstitutionData): Promise<ApiResponse<Institution>> {
    return this.post('/institutions', institution);
  }

  async updateInstitution(id: string, updates: Partial<Institution>): Promise<ApiResponse<Institution>> {
    return this.put(`/institutions/${id}`, updates);
  }

  async deleteInstitution(id: string): Promise<ApiResponse<null>> {
    return this.delete(`/institutions/${id}`);
  }

  async bulkDeleteInstitutions(institutionIds: string[]): Promise<ApiResponse<{ deletedCount: number }>> {
    return this.post('/institutions/bulk-delete', { institutionIds });
  }

  async toggleInstitutionActive(id: string): Promise<ApiResponse<Institution>> {
    return this.patch(`/institutions/${id}/toggle-active`);
  }

  async getInstitutionTypes(): Promise<ApiResponse<Array<{ value: InstitutionType; label: string; labelEn: string }>>> {
    return this.get('/institutions/types');
  }

  async searchInstitutions(params: {
    query: string;
    type?: InstitutionType;
    city?: string;
    limit?: number;
  }): Promise<ApiResponse<Institution[]>> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    return this.get(`/institutions/search?${queryParams.toString()}`);
  }

  async getNearbyInstitutions(params: {
    lat: number;
    lng: number;
    radius?: number;
    type?: InstitutionType;
    limit?: number;
  }): Promise<ApiResponse<Institution[]>> {
    const queryParams = new URLSearchParams();
    
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, value.toString());
      }
    });

    return this.get(`/institutions/nearby?${queryParams.toString()}`);
  }

  async getInstitutionStatistics(params?: {
    type?: 'general' | 'by-type' | 'by-city' | 'by-period';
    startDate?: string;
    endDate?: string;
    city?: string;
    institutionType?: InstitutionType;
  }): Promise<ApiResponse<Record<string, unknown>>> {
    const queryParams = new URLSearchParams();
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const queryString = queryParams.toString();
    return this.get(`/institutions/statistics${queryString ? `?${queryString}` : ''}`);
  }

  async addInstitutionService(id: string, service: {
    name: string;
    nameEn?: string;
    description?: string;
    descriptionEn?: string;
    price?: number;
    currency?: string;
  }): Promise<ApiResponse<Institution>> {
    return this.post(`/institutions/${id}/services`, service);
  }

  async removeInstitutionService(id: string, serviceId: string): Promise<ApiResponse<Institution>> {
    return this.delete(`/institutions/${id}/services/${serviceId}`);
  }

  async exportInstitutions(
    format: 'csv' | 'excel',
    filters?: {
      type?: InstitutionType;
      city?: string;
      isActive?: boolean;
      isPublic?: boolean;
      isVerified?: boolean;
    }
  ): Promise<Blob> {
    const queryParams = new URLSearchParams({ format });
    
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }

    const response = await this.api.get(`/institutions/export?${queryParams.toString()}`, {
      responseType: 'blob',
    });

    return response.data;
  }

  async getSimpleInstitutions(): Promise<ApiResponse<Array<{ id: string; name: string; type: InstitutionType; city: string }>>> {
    return this.get('/institutions/simple');
  }


  // Knowledge Base API methods
  async getKBArticles(params?: {
    q?: string;
    category?: string;
    status?: string;
    tags?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
  }): Promise<ApiResponse<Array<Record<string, unknown>>> & {
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    return this.get(`/kb/articles${queryString ? `?${queryString}` : ''}`);
  }

  async getKBArticle(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get(`/kb/articles/${id}`);
  }

  async getSharedKBArticle(token: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get(`/kb/articles/share/${token}`);
  }

  async generateKBShareToken(id: string): Promise<ApiResponse<{ shareToken: string; shareUrl: string }>> {
    return this.post(`/kb/articles/${id}/share-token`);
  }

  async createKBArticle(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/kb/articles', data);
  }

  async updateKBArticle(id: string, data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put(`/kb/articles/${id}`, data);
  }

  async deleteKBArticle(id: string): Promise<ApiResponse<null>> {
    return this.delete(`/kb/articles/${id}`);
  }

  async searchKBArticles(params?: {
    q?: string;
    category?: string;
    status?: string;
    tags?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
  }): Promise<ApiResponse<{
    data: Array<Record<string, unknown>>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      pages: number;
    };
  }>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    return this.get(`/kb/search${queryString ? `?${queryString}` : ''}`);
  }

  async markKBArticleHelpful(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post(`/kb/articles/${id}/helpful`);
  }

  async markKBArticleNotHelpful(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post(`/kb/articles/${id}/not-helpful`);
  }

  async getKBCategories(): Promise<ApiResponse<Array<Record<string, unknown>>>> {
    return this.get('/kb/categories');
  }

  async generateKBArticleFromTicket(ticketId: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post(`/kb/articles/generate-from-ticket/${ticketId}`);
  }

  async uploadKBFiles(files: File[]): Promise<ApiResponse<Array<{
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path: string;
    url: string;
    uploadedBy: string;
    uploadedAt: string;
  }>>> {
    const formData = new FormData();
    files.forEach(file => {
      formData.append('files', file);
    });

    const response: AxiosResponse<ApiResponse<Array<{
      filename: string;
      originalName: string;
      mimetype: string;
      size: number;
      path: string;
      url: string;
      uploadedBy: string;
      uploadedAt: string;
    }>>> = await this.api.post('/kb/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data;
  }

  // Оцінити якість вирішення тікету
  async rateTicket(ticketId: string, rating: number, feedback?: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post(`/tickets/${ticketId}/rate`, { rating, feedback });
  }

  // Отримати Telegram повідомлення для тікету
  async getTelegramMessages(ticketId: string): Promise<ApiResponse<TelegramMessage[]>> {
    return this.get(`/tickets/${ticketId}/telegram-messages`);
  }

  // Відправити Telegram повідомлення користувачу
  async sendTelegramMessageToUser(ticketId: string, content: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post(`/tickets/${ticketId}/send-telegram-message`, { content });
  }


  // Налаштування Telegram
  async getTelegramSettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/settings/telegram');
  }

  async updateTelegramSettings(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put('/settings/telegram', data);
  }

  async setupTelegramWebhook(baseUrl: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/settings/telegram/webhook', { baseUrl });
  }

  async getTelegramWebhookInfo(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/settings/telegram/webhook');
  }

  // Налаштування бота
  async getBotSettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/settings/bot');
  }

  async updateBotSettings(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put('/settings/bot', data);
  }

  // Налаштування Active Directory
  async getActiveDirectorySettings(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/settings/active-directory');
  }

  async updateActiveDirectorySettings(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put('/settings/active-directory', data);
  }

  // Методи для Zabbix
  async getZabbixConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/zabbix/config');
  }

  async updateZabbixConfig(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put('/zabbix/config', data);
  }

  async testZabbixConnection(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/zabbix/test-connection');
  }

  async pollZabbixNow(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/zabbix/poll-now');
  }

  async getZabbixAlerts(params?: {
    page?: number;
    limit?: number;
    severity?: number;
    status?: string;
    resolved?: boolean;
    host?: string;
  }): Promise<ApiResponse<Record<string, unknown>>> {
    const queryParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, value.toString());
        }
      });
    }
    const queryString = queryParams.toString();
    return this.get(`/zabbix/alerts${queryString ? `?${queryString}` : ''}`);
  }

  async getZabbixAlert(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get(`/zabbix/alerts/${id}`);
  }

  async getZabbixGroups(): Promise<ApiResponse<Record<string, unknown>>> {
    return this.get('/zabbix/groups');
  }

  async createZabbixGroup(data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/zabbix/groups', data);
  }

  async updateZabbixGroup(id: string, data: Record<string, unknown>): Promise<ApiResponse<Record<string, unknown>>> {
    return this.put(`/zabbix/groups/${id}`, data);
  }

  async deleteZabbixGroup(id: string): Promise<ApiResponse<Record<string, unknown>>> {
    return this.delete(`/zabbix/groups/${id}`);
  }

  async testZabbixAlert(data: { groupId?: string; alertId?: string }): Promise<ApiResponse<Record<string, unknown>>> {
    return this.post('/zabbix/test-alert', data);
  }


}

// Експорт єдиного екземпляру
export const apiService = new ApiService();
export default apiService;
