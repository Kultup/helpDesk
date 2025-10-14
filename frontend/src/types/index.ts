// Типи користувачів
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user'
}

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  position: string | Position;
  department: string;
  city: string | City;
  telegramId?: string;
  isActive: boolean;
  deletedAt?: string;
  deletedBy?: string;
  createdAt: string;
  updatedAt: string;
  preferences?: {
    theme: 'light' | 'dark' | 'auto';
    language: 'uk' | 'en' | 'pl';
    timezone: string;
    dateFormat: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';
    timeFormat: '12h' | '24h';
    itemsPerPage: number;
    emailNotifications: {
      newTickets: boolean;
      assignedTickets: boolean;
      statusUpdates: boolean;
      weeklyReports: boolean;
      systemUpdates: boolean;
    };
  };
}

// Типи тикетів
export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed'
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum TicketCategory {
  TECHNICAL = 'technical',
  ACCOUNT = 'account',
  BILLING = 'billing',
  GENERAL = 'general'
}

export interface Ticket {
  _id: string;
  ticketNumber: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: TicketCategory;
  city: City;
  assignedTo?: User;
  createdBy: User;
  estimatedHours?: number;
  actualHours?: number;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  comments: Comment[];
}

// Типи міст
export interface City {
  _id: string;
  name: string;
  region: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

// Типи категорій
export interface Category {
  _id: string;
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder: number;
  isActive: boolean;
  createdBy?: User;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCategoryForm {
  name: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
}

export interface UpdateCategoryForm {
  name?: string;
  description?: string;
  color?: string;
  icon?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CategoryStats {
  _id: string;
  categoryId: string;
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  avgResolutionTime: number;
}

// Типи посад
export interface Position {
  _id: string;
  title: string;
  description?: string;
  department: string;
  permissions?: Array<{
    module: string;
    actions: string[];
  }>;
  responsibilities?: string[];
  requirements?: string[];
  skills?: Array<{
    name: string;
    level: 'basic' | 'intermediate' | 'advanced' | 'expert';
    required: boolean;
  }>;
  salary?: {
    min?: number;
    max?: number;
    currency: 'UAH' | 'USD' | 'EUR';
  };
  workSchedule?: {
    type: 'full-time' | 'part-time' | 'contract' | 'remote' | 'hybrid';
    hoursPerWeek: number;
  };
  reportingTo?: string;
  isActive: boolean;
  isPublic: boolean;
  createdBy: string;
  lastModifiedBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Тип для створення позиції (без серверних полів)
export interface CreatePositionData {
  title: string;
  description?: string;
  department: string;
  permissions?: Array<{
    module: string;
    actions: string[];
  }>;
  responsibilities?: string[];
  requirements?: string[];
  skills?: Array<{
    name: string;
    level: 'basic' | 'intermediate' | 'advanced' | 'expert';
    required: boolean;
  }>;
  salary?: {
    min?: number;
    max?: number;
    currency: 'UAH' | 'USD' | 'EUR';
  };
  workSchedule?: {
    type: 'full-time' | 'part-time' | 'contract' | 'remote' | 'hybrid';
    hoursPerWeek: number;
  };
  reportingTo?: string;
  isActive: boolean;
  isPublic: boolean;
}

// Типи коментарів
export interface Comment {
  _id: string;
  content: string;
  author: User;
  ticket: string;
  createdAt: string;
}



// Типи аналітики
export interface AnalyticsData {
  overview: {
    totalTickets: number;
    totalUsers: number;
    activeUsers: number;
    totalCities: number;
    totalPositions: number;
  };
  ticketsByStatus: Array<{
    _id: string;
    count: number;
  }>;
  ticketsByPriority: Array<{
    _id: string;
    count: number;
  }>;
  ticketsByCategory: Array<{
    _id: string;
    count: number;
  }>;
  ticketsByDay: Array<{
    _id: string;
    count: number;
  }>;
  avgResolutionTime: number;
  topResolvers: Array<{
    _id: string;
    resolvedCount: number;
    user: {
      firstName: string;
      lastName: string;
      email: string;
    };
  }>;
}

export interface CityStatistics {
  city: City;
  count: number;
  percentage: number;
}

export interface StatusStatistics {
  status: TicketStatus;
  count: number;
  percentage: number;
}

export interface PriorityStatistics {
  priority: TicketPriority;
  count: number;
  percentage: number;
}

// Типи для теплової карти
export interface HeatMapData {
  region: string;
  count: number;
  intensity: number;
}

// Типи для API відповідей
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// Спеціальний тип для відповіді оновлення тікета
export interface UpdateTicketResponse extends ApiResponse<Ticket> {
  showRatingModal?: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Спеціальний тип для відповіді тікетів (фактична структура API)
export interface TicketsApiResponse {
  success: boolean;
  data: Ticket[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  message?: string;
  error?: string;
}

// Спеціальний тип для відповіді позицій
export interface PositionsResponse {
  positions: Position[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

// Типи для форм
export interface LoginForm {
  email: string;
  password: string;
}

export interface CreateTicketForm {
  title: string;
  description: string;
  priority: TicketPriority;
  category: TicketCategory;
  cityId: string;
  assignedTo?: string;
}

export interface UpdateTicketForm {
  title?: string;
  description?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
}

// Типи для контексту аутентифікації
export interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  isAuthenticated: boolean;
}

// Типи для фільтрів
export interface TicketFilters {
  status?: TicketStatus[];
  priority?: TicketPriority[];
  cityId?: string[];
  assignedTo?: string[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// Типи для сортування
export interface SortOptions {
  field: string;
  direction: 'asc' | 'desc';
}

// Типи для пагінації
export interface PaginationOptions {
  page: number;
  limit: number;
}

// Типи для експорту
export interface ExportOptions {
  format: 'csv' | 'excel' | 'pdf';
  filters?: TicketFilters;
  fields?: string[];
}

// Типи для календарних подій
export enum EventType {
  MEETING = 'meeting',
  TASK = 'task',
  REMINDER = 'reminder',
  DEADLINE = 'deadline',
  APPOINTMENT = 'appointment',
  HOLIDAY = 'holiday'
}

export enum EventStatus {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

export enum EventPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface CalendarEvent {
  _id: string;
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: EventType;
  priority: EventPriority;
  status: EventStatus;
  participants?: string[];
  location?: string;
  isAllDay: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateEventForm {
  title: string;
  description?: string;
  date: string;
  startTime?: string;
  endTime?: string;
  type: EventType;
  priority: EventPriority;
  participants?: string[];
  location?: string;
  isAllDay?: boolean;
}

export interface UpdateEventForm {
  title?: string;
  description?: string;
  date?: string;
  startTime?: string;
  endTime?: string;
  type?: EventType;
  priority?: EventPriority;
  status?: EventStatus;
  participants?: string[];
  location?: string;
  isAllDay?: boolean;
}

export interface EventFilters {
  type?: EventType[];
  status?: EventStatus[];
  priority?: EventPriority[];
  dateFrom?: string;
  dateTo?: string;
  search?: string;
}

// Типи для особистих нотаток адміністратора
export enum NotePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface AdminNote {
  _id: string;
  title: string;
  content: string;
  priority: NotePriority;
  category?: string;
  tags: string[];
  color?: string;
  isPinned: boolean;
  reminderDate?: string;
  author: string | User;
  createdAt: string;
  updatedAt: string;
  isEdited: boolean;
  editedAt?: string;
  editedBy?: string;
}

export interface CreateNoteForm {
  title: string;
  content: string;
  priority?: NotePriority;
  category?: string;
  tags?: string[];
  color?: string;
  reminderDate?: string;
}

export interface UpdateNoteForm {
  title?: string;
  content?: string;
  priority?: NotePriority;
  category?: string;
  tags?: string[];
  color?: string;
  reminderDate?: string;
}

export interface NoteFilters {
  category?: string;
  priority?: NotePriority;
  search?: string;
  limit?: number;
  skip?: number;
}