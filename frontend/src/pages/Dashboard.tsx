import React, { useEffect, useState, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { 
  Ticket, 
  Clock, 
  CheckCircle, 
  AlertTriangle,
  XCircle,
  TrendingUp,
  Users,
  MapPin,
  Briefcase,
  RefreshCw,
  BarChart3,
  Calendar,
  FileText,
  Activity,
  Zap,
  Sparkles,
  Plus,
  StickyNote,
  Monitor
} from 'lucide-react';

// Utils
import { formatDateWithLocale } from '../utils/dateUtils';

// UI Components
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';

// Chart Components
import WeeklyTicketsChart from '../components/charts/WeeklyTicketsChart';
import CategoryDistributionChart from '../components/charts/CategoryDistributionChart';
import WorkloadByDayChart from '../components/charts/WorkloadByDayChart';

// Admin Components
import AdminNotes from '../components/AdminNotes';
import CreateTicketModal from '../components/CreateTicketModal';

// Hooks and Services
import { useTickets } from '../hooks';
import { useDashboardStats, DashboardStats } from '../hooks/useDashboardStats';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';

// Types and Utils
import { TicketStatus, TicketPriority, UserRole } from '../types';
import { getStatusColor, getPriorityColor, formatDate } from '../utils';

// ============================================================================
// INTERFACES
// ============================================================================

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: number;
  onClick?: () => void;
}

// ============================================================================
// COMPONENTS
// ============================================================================

const StatCard: React.FC<StatCardProps> = ({ 
  title, 
  value, 
  icon: Icon, 
  color, 
  trend, 
  onClick 
}) => {
  const isPositiveTrend = trend !== undefined && trend >= 0;
  const trendColor = isPositiveTrend ? 'text-emerald-600' : 'text-rose-600';
  const trendIconColor = isPositiveTrend ? 'text-emerald-500' : 'text-rose-500';
  const trendSign = trend !== undefined ? (trend >= 0 ? '+' : '') : '';

  return (
    <Card 
      className={`group relative overflow-hidden backdrop-blur-sm bg-surface/80 border border-border shadow-xl hover:shadow-2xl transition-all duration-500 hover:scale-105 ${
        onClick ? 'cursor-pointer' : ''
      }`} 
      onClick={onClick}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-surface/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <CardContent className="relative p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-3 sm:gap-4">
          <div className="flex-1 min-w-0">
            <p className="text-xs sm:text-sm font-bold text-text-secondary mb-2 sm:mb-3 tracking-wider uppercase opacity-80">
              {title}
            </p>
            <p className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground mb-2 sm:mb-4 tracking-tight">
              {value.toLocaleString()}
            </p>
            {trend !== undefined && (
              <div className={`inline-flex items-center px-2 sm:px-3 py-1 sm:py-2 rounded-full text-xs font-bold ${trendColor} bg-gradient-to-r ${
                isPositiveTrend 
                  ? 'from-emerald-50 to-emerald-100 border border-emerald-200/50' 
                  : 'from-rose-50 to-rose-100 border border-rose-200/50'
              } shadow-sm`}>
                <TrendingUp className={`h-3 w-3 mr-1 sm:mr-1.5 ${trendIconColor} ${!isPositiveTrend ? 'rotate-180' : ''}`} />
                <span>{trendSign}{trend}%</span>
              </div>
            )}
          </div>
          <div className="ml-2 sm:ml-6 flex-shrink-0">
            <div className={`p-2 sm:p-3 lg:p-4 rounded-xl sm:rounded-2xl ${color} shadow-lg group-hover:shadow-xl transition-shadow duration-300`}>
              <Icon className="h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-white" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// ============================================================================
// MAIN DASHBOARD COMPONENT
// ============================================================================

const Dashboard: React.FC = () => {
  // ========================================
  // HOOKS AND STATE
  // ========================================
  
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const isAdmin = user?.role === UserRole.ADMIN;
  const basePath = isAdmin ? '/admin' : '';
  
  // Data hooks
  const { tickets, isLoading: ticketsLoading, refetch: refetchTickets } = useTickets();
  const { stats: dashboardStats, loading: statsLoading, refetch: refetchStats } = useDashboardStats();
  const typedDashboardStats = dashboardStats as DashboardStats | null;

  // Active Directory stats for Dashboard shortcut block
  const [adUsersTotal, setAdUsersTotal] = useState<number | null>(null);
  const [adComputersTotal, setAdComputersTotal] = useState<number | null>(null);
  const [adStatsLoading, setAdStatsLoading] = useState<boolean>(false);
  const [adStatsError, setAdStatsError] = useState<string | null>(null);
  
  // Create Ticket Modal state
  const [isCreateTicketModalOpen, setIsCreateTicketModalOpen] = useState(false);

  const loadAdStats = async () => {
    setAdStatsLoading(true);
    setAdStatsError(null);
    try {
      if (!isAdmin) return;
      const response = await apiService.getADStatistics();
      if (response?.success && response.data) {
        const usersTotal = response.data?.users?.total ?? null;
        const computersTotal = response.data?.computers?.total ?? null;
        setAdUsersTotal(usersTotal);
        setAdComputersTotal(computersTotal);
      } else {
        // Якщо AD недоступний, це не критична помилка
        setAdStatsError(null); // Не показуємо помилку, якщо AD просто недоступний
      }
    } catch (error: any) {
      // Якщо помилка 404 або AD недоступний, не показуємо помилку
      if (error?.response?.status !== 404 && error?.response?.status !== 500) {
        setAdStatsError(error?.message || t('activeDirectory.statistics.errorLoading'));
      } else {
        // AD недоступний - це нормально, не показуємо помилку
        setAdStatsError(null);
      }
    } finally {
      setAdStatsLoading(false);
    }
  };

  useEffect(() => {
    loadAdStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  // Local state
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);
  
  // Refs
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<number>(0);

  // ========================================
  // UTILITY FUNCTIONS
  // ========================================

  // Функція для збереження позиції скролу
  const saveScrollPosition = React.useCallback(() => {
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
  }, []);

  // Функція для відновлення позиції скролу
  const restoreScrollPosition = React.useCallback(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });
  }, []);

  // Функція для оновлення даних
  const refreshData = React.useCallback(async () => {
    try {
      saveScrollPosition();
      await Promise.all([refetchTickets(), refetchStats()]);
      setLastUpdated(new Date());
      restoreScrollPosition();
    } catch (error) {
      console.error(t('dashboard.errors.updateError'), error);
    }
  }, [refetchTickets, refetchStats, saveScrollPosition, restoreScrollPosition]);

  // Функція для обробки оновлення
  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  // ========================================
  // EFFECTS
  // ========================================

  // Автоматичне оновлення кожні 4 години
  useEffect(() => {
    refreshData();

    intervalRef.current = setInterval(() => {
      refreshData();
    }, 14400000); // 4 години

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshData]);

  // Показ повідомлення про успішне оновлення
  useEffect(() => {
    if (location.state?.message) {
      setMessage(location.state.message);
      setMessageType(location.state.type || 'success');
      setShowMessage(true);
      
      const timer = setTimeout(() => {
        setShowMessage(false);
      }, 5000);

      // Очищення state після показу повідомлення
      window.history.replaceState({}, document.title);

      return () => clearTimeout(timer);
    }
  }, [location.state]);

  // ========================================
  // DATA PROCESSING
  // ========================================

  const isLoading = ticketsLoading || statsLoading;

  // Обробка тікетів
  const recentTickets = tickets ? tickets.slice(0, 5) : [];
  const priorityTickets = tickets ? tickets.filter(ticket => ticket.priority === TicketPriority.HIGH).slice(0, 3) : [];

  // Обробка статистики з перевіркою на null/undefined
  const stats = typedDashboardStats ? {
    total: typedDashboardStats.totalTickets,
    open: typedDashboardStats.openTickets,
    inProgress: typedDashboardStats.inProgressTickets,
    resolved: typedDashboardStats.resolvedTickets,
    closed: typedDashboardStats.closedTickets,
    highPriority: typedDashboardStats.highPriorityTickets,
    trends: {
      total: typedDashboardStats.trends?.totalTickets || 0,
      open: typedDashboardStats.trends?.openTickets || 0,
      inProgress: typedDashboardStats.trends?.inProgressTickets || 0,
      resolved: typedDashboardStats.trends?.resolvedTickets || 0,
      closed: typedDashboardStats.trends?.closedTickets || 0
    }
  } : {
    total: 0,
    open: 0,
    inProgress: 0,
    resolved: 0,
    closed: 0,
    highPriority: 0,
    trends: {
      total: 0,
      open: 0,
      inProgress: 0,
      resolved: 0,
      closed: 0
    }
  };

  // Створення масиву статистики для StatCard компонентів
  const statsArray = [
    {
      title: t('dashboard.stats.totalTickets'),
      value: stats.total,
      icon: Ticket,
      color: 'bg-gradient-to-br from-blue-500 to-blue-600',
      trend: stats.trends.total,
      onClick: () => navigate(`${basePath}/tickets`)
    },
    {
      title: t('dashboard.stats.openTickets'),
      value: stats.open,
      icon: Clock,
      color: 'bg-gradient-to-br from-amber-500 to-orange-500',
      trend: stats.trends.open,
      onClick: () => navigate(`${basePath}/tickets?status=open`)
    },
    {
      title: t('dashboard.stats.inProgressTickets'),
      value: stats.inProgress,
      icon: Activity,
      color: 'bg-gradient-to-br from-purple-500 to-purple-600',
      trend: stats.trends.inProgress,
      onClick: () => navigate(`${basePath}/tickets?status=in_progress`)
    },
    {
      title: t('dashboard.stats.resolvedTickets'),
      value: stats.resolved,
      icon: CheckCircle,
      color: 'bg-gradient-to-br from-emerald-500 to-green-600',
      trend: stats.trends.resolved,
      onClick: () => navigate(`${basePath}/tickets?status=resolved`)
    },
    {
      title: t('dashboard.stats.closedTickets'),
      value: stats.closed,
      icon: XCircle,
      color: 'bg-gradient-to-br from-gray-500 to-gray-600',
      trend: stats.trends.closed,
      onClick: () => navigate(`${basePath}/tickets?status=closed`)
    }
  ];

  // ========================================
  // LOADING STATE
  // ========================================

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="relative">
          <LoadingSpinner size="xl" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-accent/20 rounded-full opacity-20 animate-pulse" />
        </div>
      </div>
    );
  }

  // ========================================
  // RENDER
  // ========================================

  return (
    <div className="min-h-screen bg-background">
      {/* Success notification */}
      {showMessage && messageType === 'success' && (
        <div className="fixed top-6 right-6 bg-gradient-to-r from-success to-success text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-slide-in-right">
          <div className="flex items-center">
            <CheckCircle className="h-5 w-5 mr-2" />
            {message}
          </div>
        </div>
      )}

      {/* Error notification */}
      {showMessage && messageType === 'error' && (
        <div className="fixed top-6 right-6 bg-gradient-to-r from-error to-error text-white px-6 py-4 rounded-xl shadow-2xl z-50 animate-slide-in-right">
          <div className="flex items-center">
            <XCircle className="h-5 w-5 mr-2" />
            {message}
          </div>
        </div>
      )}

      <div className="p-2 sm:p-4 lg:p-8 space-y-4 sm:space-y-6 lg:space-y-8">
        {/* Header Section */}
        <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-0">
            <div className="space-y-1 sm:space-y-2 flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground">
                {t('dashboard.title')}
              </h1>
              <p className="text-xs sm:text-sm text-text-secondary font-medium">
                {t('dashboard.welcome')}
              </p>
              {lastUpdated && (
                <p className="text-xs text-text-secondary/70 font-normal">
                  {t('dashboard.lastUpdated')}: {formatDateWithLocale(lastUpdated)}
                </p>
              )}
            </div>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              className="bg-gradient-to-r from-primary to-accent hover:from-primary/80 hover:to-accent/80 text-primary-foreground px-4 sm:px-6 lg:px-8 py-2 sm:py-2.5 lg:py-3 rounded-lg sm:rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base w-full sm:w-auto"
            >
              {refreshing ? (
                <div className="flex items-center">
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-2 animate-spin" />
                  {t('dashboard.updating')}
                </div>
              ) : (
                <div className="flex items-center">
                  <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  {t('dashboard.refreshData')}
                </div>
              )}
            </Button>
          </div>
        </div>

          {/* Key Metrics Section */}
          <div className="mb-6 sm:mb-8 lg:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6 flex items-center">
              <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3 text-primary" />
              {t('dashboard.keyMetrics')}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
              {statsArray.map((stat, index) => (
                <StatCard key={index} {...stat} />
              ))}
            </div>
          </div>

          {/* Main Content Grid */}
          <div className="space-y-4 sm:space-y-6 lg:space-y-8">
            {/* Top Section - Tickets */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
              {/* Left Column - Recent Tickets */}
              <div className="lg:col-span-2">
                <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0 mb-4 sm:mb-6 lg:mb-8">
                    <h2 className="text-lg sm:text-xl font-bold text-foreground flex items-center">
                      <Clock className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 text-primary" />
                      {t('dashboard.recentTickets')}
                    </h2>
                    <Button
                      onClick={() => navigate('/tickets')}
                      variant="outline"
                      className="text-primary border-primary/30 hover:bg-primary/10 hover:border-primary px-4 sm:px-6 py-2 rounded-lg sm:rounded-xl font-semibold transition-all duration-300 text-sm sm:text-base"
                    >
                      {t('dashboard.viewAll')}
                    </Button>
                  </div>
                  <div className="space-y-3 sm:space-y-4">
                    {recentTickets.length > 0 ? (
                      recentTickets.map((ticket) => (
                        <div
                          key={ticket._id}
                          className="group border border-border rounded-lg sm:rounded-xl p-4 sm:p-6 hover:shadow-lg hover:border-primary/50 transition-all duration-300 cursor-pointer backdrop-blur-sm bg-surface/50"
                          onClick={() => navigate(`/tickets/${ticket._id}`)}
                        >
                          <div className="flex justify-between items-start mb-3 sm:mb-4 gap-2">
                            <h3 className="font-bold text-foreground text-base sm:text-lg group-hover:text-primary transition-colors duration-300 flex-1 min-w-0 line-clamp-2">
                              {ticket.title}
                            </h3>
                            <span className={`px-2 sm:px-3 py-1 rounded-full text-xs font-bold flex-shrink-0 ${
                              ticket.priority === 'high' ? 'bg-gradient-to-r from-error/20 to-error/30 text-error border border-error/30' :
                              ticket.priority === 'medium' ? 'bg-gradient-to-r from-warning/20 to-warning/30 text-warning border border-warning/30' :
                              'bg-gradient-to-r from-success/20 to-success/30 text-success border border-success/30'
                            }`}>
                              {ticket.priority === 'high' ? t('dashboard.priorities.high') :
                               ticket.priority === 'medium' ? t('dashboard.priorities.medium') : t('dashboard.priorities.low')}
                            </span>
                          </div>
                          <p className="text-text-secondary mb-3 sm:mb-4 line-clamp-2 text-sm">{ticket.description}</p>
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 sm:gap-0 text-xs sm:text-sm">
                            <span className="text-text-secondary font-medium">
                                {t('dashboard.created')}: {formatDateWithLocale(ticket.createdAt)}
                              </span>
                            <span className={`px-2 sm:px-3 py-1 rounded-full font-bold text-xs ${
                              ticket.status === 'open' ? 'bg-gradient-to-r from-primary/20 to-primary/30 text-primary' :
                              ticket.status === 'in_progress' ? 'bg-gradient-to-r from-accent/20 to-accent/30 text-accent' :
                              ticket.status === 'resolved' ? 'bg-gradient-to-r from-success/20 to-success/30 text-success' :
                              'bg-gradient-to-r from-text-secondary/20 to-text-secondary/30 text-text-secondary'
                            }`}>
                              {ticket.status === 'open' ? t('dashboard.statuses.open') :
                               ticket.status === 'in_progress' ? t('dashboard.statuses.inProgress') :
                               ticket.status === 'resolved' ? t('dashboard.statuses.resolved') : t('dashboard.statuses.closed')}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-16">
                        <FileText className="h-16 w-16 text-text-secondary/50 mx-auto mb-4" />
                        <p className="text-text-secondary text-lg font-medium">{t('dashboard.noRecentTickets')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column - Quick Actions & Priority Tickets */}
              <div className="space-y-4 sm:space-y-6 lg:space-y-8">
                {/* Quick Actions */}
                <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4 sm:mb-6 lg:mb-8 flex items-center">
                    <Zap className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 text-accent" />
                    {t('dashboard.quickActions')}
                  </h2>
                  <div className="space-y-3 sm:space-y-4">
                    <Button
                      onClick={() => setIsCreateTicketModalOpen(true)}
                      className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/80 hover:to-accent/80 text-white py-3 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-sm sm:text-base"
                      style={{
                        background: 'linear-gradient(to right, var(--color-primary), var(--color-accent))',
                        color: 'white'
                      }}
                    >
                      <Plus className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3" />
                        {t('dashboard.createNewTicket')}
                    </Button>

                    <Button
                      onClick={() => navigate(`${basePath}/analytics`)}
                      variant="outline"
                      className="w-full py-3 sm:py-4 rounded-lg sm:rounded-xl font-bold transition-all duration-300 text-sm sm:text-base"
                      style={{
                        borderColor: 'var(--color-border)',
                        color: 'var(--color-text)',
                        backgroundColor: 'var(--color-surface)'
                      }}
                    >
                      <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
                      {t('dashboard.analytics')}
                    </Button>
                  </div>
                </div>

                {/* Priority Tickets - Compact */}
                <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
                  <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4 sm:mb-6 flex items-center">
                      <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 text-error" />
                      {t('dashboard.priorityTickets')}
                    </h2>
                  <div className="space-y-2 sm:space-y-3">
                    {priorityTickets.length > 0 ? (
                      priorityTickets.slice(0, 3).map((ticket) => (
                        <div
                          key={ticket._id}
                          className="group border-l-4 border-error bg-gradient-to-r from-error/10 to-error/20 p-2 sm:p-3 lg:p-4 rounded-r-lg sm:rounded-r-xl cursor-pointer hover:from-error/20 hover:to-error/30 transition-all duration-300 shadow-sm hover:shadow-md"
                          onClick={() => navigate(`/tickets/${ticket._id}`)}
                        >
                          <h3 className="font-bold text-foreground text-xs sm:text-sm mb-1 sm:mb-2 group-hover:text-error transition-colors duration-300 line-clamp-2">
                            {ticket.title}
                          </h3>
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1 sm:gap-0 text-xs">
                            <span className="text-error font-bold flex items-center">
                              <Zap className="h-3 w-3 mr-1" />
                              {t('dashboard.priorities.high')}
                            </span>
                            <span className="text-text-secondary font-medium">
                              {formatDateWithLocale(ticket.createdAt)}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 sm:py-8">
                        <AlertTriangle className="h-10 w-10 sm:h-12 sm:w-12 text-text-secondary/50 mx-auto mb-2 sm:mb-3" />
                        <p className="text-text-secondary text-xs sm:text-sm font-medium">{t('dashboard.noPriorityTickets')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Section - Full Width */}
            <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-foreground mb-4 sm:mb-6 lg:mb-8 flex items-center">
                <BarChart3 className="h-5 w-5 sm:h-6 sm:w-6 mr-2 sm:mr-3 text-primary" />
                {t('dashboard.analyticsAndReports')}
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                <div className="p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-primary/10 to-primary/20 rounded-lg sm:rounded-xl border border-primary/30 hover:shadow-lg transition-all duration-300">
                  <WeeklyTicketsChart />
                </div>
                <div className="p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-accent/10 to-accent/20 rounded-lg sm:rounded-xl border border-accent/30 hover:shadow-lg transition-all duration-300">
                  <CategoryDistributionChart />
                </div>
                <div className="p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-success/10 to-success/20 rounded-lg sm:rounded-xl border border-success/30 hover:shadow-lg transition-all duration-300">
                  <WorkloadByDayChart />
                </div>
                {/* Analytics & Reports Shortcut Block replaced with AD counters */}
                <div className="p-3 sm:p-4 lg:p-6 bg-gradient-to-br from-warning/10 to-warning/20 rounded-lg sm:rounded-xl border border-warning/30 hover:shadow-lg transition-all duration-300">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-4">
                    <h3 className="text-base sm:text-lg font-semibold text-foreground flex items-center">
                      <FileText className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-warning" />
                      {t('dashboard.analyticsAndReports')}
                    </h3>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                      <Button onClick={() => loadAdStats()} variant="ghost" size="sm" className="flex-1 sm:flex-none">
                        <RefreshCw className="h-3 w-3 sm:h-4 sm:w-4" />
                      </Button>
                      <Button onClick={() => navigate('/admin/analytics')} variant="primary" size="sm" className="flex-1 sm:flex-none text-xs sm:text-sm">
                        Відкрити
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    <div className="flex items-center p-3 sm:p-4 bg-white/40 rounded-lg border border-warning/30 shadow-md cursor-pointer hover:bg-white/60 hover:shadow-lg transition-shadow"
                         onClick={() => navigate('/admin/active-directory?view=users')}>
                      <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-warning text-white mr-3 sm:mr-4 flex-shrink-0">
                        <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                          {t('activeDirectory.statistics.totalUsers')}
                        </p>
                        {adStatsLoading ? (
                          <span className="text-xs sm:text-sm text-text-secondary">Завантаження...</span>
                        ) : adStatsError ? (
                          <span className="text-xs sm:text-sm text-rose-600">{adStatsError}</span>
                        ) : (
                          <p className="text-xl sm:text-2xl font-black text-foreground">
                            {(adUsersTotal ?? 0).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center p-3 sm:p-4 bg-white/40 rounded-lg border border-warning/30 shadow-md cursor-pointer hover:bg-white/60 hover:shadow-lg transition-shadow"
                         onClick={() => navigate('/admin/active-directory?view=computers')}>
                      <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-warning text-white mr-3 sm:mr-4 flex-shrink-0">
                        <Monitor className="h-4 w-4 sm:h-5 sm:w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-text-secondary uppercase tracking-wider">
                          {t('activeDirectory.statistics.totalComputers')}
                        </p>
                        {adStatsLoading ? (
                          <span className="text-xs sm:text-sm text-text-secondary">Завантаження...</span>
                        ) : adStatsError ? (
                          <span className="text-xs sm:text-sm text-rose-600">{adStatsError}</span>
                        ) : (
                          <p className="text-xl sm:text-2xl font-black text-foreground">
                            {(adComputersTotal ?? 0).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom Section - Admin Tools */}
            {user?.role === 'admin' && (
              <div className="backdrop-blur-sm bg-surface/80 border border-border rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 lg:p-8">
                <h2 className="text-lg sm:text-xl font-bold text-foreground mb-4 sm:mb-6 lg:mb-8 flex items-center">
                  <StickyNote className="h-4 w-4 sm:h-5 sm:w-5 mr-2 sm:mr-3 text-warning" />
                  {t('dashboard.adminTools')}
                </h2>
                <div className="space-y-4 sm:space-y-6">
                  <div className="p-4 sm:p-6 bg-gradient-to-br from-warning/10 to-warning/20 rounded-lg sm:rounded-xl border border-warning/30 hover:shadow-lg transition-all duration-300">
                    <AdminNotes />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Modal для створення тікету */}
        <CreateTicketModal
          isOpen={isCreateTicketModalOpen}
          onClose={() => setIsCreateTicketModalOpen(false)}
          onSuccess={() => {
            setIsCreateTicketModalOpen(false);
            refetchTickets(); // Оновлюємо список тікетів
            refetchStats(); // Оновлюємо статистику
          }}
        />
    </div>
  );
};

export default Dashboard;