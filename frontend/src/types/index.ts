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
  attachments?: Array<{
    _id: string;
    filename: string;
    originalName: string;
    mimetype: string;
    size: number;
    path: string;
    uploadedBy: User;
    uploadedAt: string;
  }>;
  qualityRating?: {
    hasRating: boolean;
    rating?: number;
    feedback?: string;
    ratedAt?: string;
    ratedBy?: User;
  };
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

// Типи для шаблонів сповіщень (для швидких повідомлень)
export type NotificationTemplateType = 'email' | 'telegram' | 'web' | 'sms';
export type NotificationTemplateCategory = 'ticket' | 'user' | 'system' | 'security' | 'maintenance';

export interface NotificationTemplate {
  _id: string;
  name: string;
  type: NotificationTemplateType;
  category: NotificationTemplateCategory;
  subject?: string; // для email/web
  content: string; // основний вміст повідомлення
  variables?: string[]; // доступні змінні
  createdBy?: string | User;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateNotificationTemplateForm {
  name: string;
  type: NotificationTemplateType;
  category: NotificationTemplateCategory;
  subject?: string;
  content: string;
  variables?: string[];
}

// Типи закладів
export enum InstitutionType {
  HOSPITAL = 'hospital',
  CLINIC = 'clinic',
  SCHOOL = 'school',
  UNIVERSITY = 'university',
  KINDERGARTEN = 'kindergarten',
  LIBRARY = 'library',
  MUSEUM = 'museum',
  THEATER = 'theater',
  CINEMA = 'cinema',
  SPORTS_CENTER = 'sports_center',
  PARK = 'park',
  RESTAURANT = 'restaurant',
  CAFE = 'cafe',
  HOTEL = 'hotel',
  BANK = 'bank',
  POST_OFFICE = 'post_office',
  POLICE_STATION = 'police_station',
  FIRE_STATION = 'fire_station',
  GOVERNMENT_OFFICE = 'government_office',
  COURT = 'court',
  SHOPPING_CENTER = 'shopping_center',
  MARKET = 'market',
  PHARMACY = 'pharmacy',
  GAS_STATION = 'gas_station',
  TRANSPORT_HUB = 'transport_hub',
  OTHER = 'other'
}

export interface Institution {
  _id: string;
  name: string;
  nameEn?: string;
  type: InstitutionType;
  typeEn?: string;
  description?: string;
  address: {
    street: string;
    city: string | City;
    postalCode?: string;
    district?: string;
  };
  coordinates?: {
    lat: number;
    lng: number;
  };
  contact: {
    phone?: string;
    email?: string;
    website?: string;
    fax?: string;
  };
  workingHours?: {
    monday?: { open: string; close: string; isClosed: boolean };
    tuesday?: { open: string; close: string; isClosed: boolean };
    wednesday?: { open: string; close: string; isClosed: boolean };
    thursday?: { open: string; close: string; isClosed: boolean };
    friday?: { open: string; close: string; isClosed: boolean };
    saturday?: { open: string; close: string; isClosed: boolean };
    sunday?: { open: string; close: string; isClosed: boolean };
  };
  capacity?: number;
  services?: Array<{
    name: string;
    description?: string;
    price?: number;
    currency?: 'UAH' | 'USD' | 'EUR';
  }>;
  rating?: {
    average: number;
    count: number;
  };
  isActive: boolean;
  isPublic: boolean;
  isVerified: boolean;
  tags?: string[];
  statistics?: {
    totalTickets: number;
    openTickets: number;
    resolvedTickets: number;
    averageResolutionTime: number;
  };
  createdBy?: string | User;
  lastModifiedBy?: string | User;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInstitutionData {
  name: string;
  nameEn?: string;
  type?: InstitutionType;
  description?: string;
  address?: {
    street?: string;
    city?: string;
    postalCode?: string;
    district?: string;
  };
  coordinates?: {
    lat?: number;
    lng?: number;
  };
  contact?: {
    phone?: string;
    email?: string;
    website?: string;
    fax?: string;
  };
  workingHours?: {
    monday?: { open: string; close: string; isClosed: boolean };
    tuesday?: { open: string; close: string; isClosed: boolean };
    wednesday?: { open: string; close: string; isClosed: boolean };
    thursday?: { open: string; close: string; isClosed: boolean };
    friday?: { open: string; close: string; isClosed: boolean };
    saturday?: { open: string; close: string; isClosed: boolean };
    sunday?: { open: string; close: string; isClosed: boolean };
  };
  capacity?: number;
  services?: Array<{
    name: string;
    description?: string;
    price?: number;
    currency?: 'UAH' | 'USD' | 'EUR';
  }>;
  isActive?: boolean;
  isPublic?: boolean;
  isVerified?: boolean;
  tags?: string[];
}

export interface InstitutionsResponse {
  success: boolean;
  data: Institution[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}