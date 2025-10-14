// Типи для мобільного додатку адмін панелі

export interface User {
  id: string;
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator'
}

export interface Ticket {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  category: Category;
  assignedTo?: User;
  createdBy: User;
  createdAt: string;
  updatedAt: string;
  comments?: Comment[];
}

export enum TicketStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  RESOLVED = 'resolved',
  CLOSED = 'closed'
}

export enum TicketPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

export interface Category {
  id: string;
  name: string;
  description?: string;
  color?: string;
}

export interface Comment {
  id: string;
  content: string;
  author: User;
  ticketId: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface DashboardStats {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  closedTickets: number;
  totalUsers: number;
  activeUsers: number;
  adminUsers: number;
  moderatorUsers: number;
}

// Навігаційні типи
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  Dashboard: undefined;
  Tickets: undefined;
  TicketDetails: { ticketId: string };
  Users: undefined;
  UserDetails: { userId: string };
  Analytics: undefined;
  Profile: undefined;
};

export type TabParamList = {
  Dashboard: undefined;
  Tickets: undefined;
  Users: undefined;
  Analytics: undefined;
  Profile: undefined;
};