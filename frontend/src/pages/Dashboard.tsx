import React, { useEffect, useState, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Ticket,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Users,
  RefreshCw,
  BarChart3,
  FileText,
  Activity,
  Zap,
  Plus,
  Monitor,
  ArrowRight,
} from 'lucide-react';

import { formatDateWithLocale } from '../utils/dateUtils';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import WeeklyTicketsChart from '../components/charts/WeeklyTicketsChart';
import WorkloadByDayChart from '../components/charts/WorkloadByDayChart';
import MiniKanban from '../components/MiniKanban';
import CreateTicketModal from '../components/CreateTicketModal';
import { useTickets } from '../hooks';
import { useDashboardStats, DashboardStats } from '../hooks/useDashboardStats';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { TicketPriority, UserRole, isAdminRole } from '../types';

// ─── Stat Card ────────────────────────────────────────────────────────────────

interface StatCardProps {
  title: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  trend?: number;
  onClick?: () => void;
}

const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  icon: Icon,
  iconBg,
  iconColor,
  trend,
  onClick,
}) => (
  <div
    className={`bg-white border border-gray-100 rounded-xl p-4 flex items-center gap-4 shadow-sm hover:shadow-md transition-all duration-200 ${onClick ? 'cursor-pointer hover:border-gray-200' : ''}`}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={
      onClick
        ? e => {
            if (e.key === 'Enter') onClick();
          }
        : undefined
    }
  >
    <div className={`p-2.5 rounded-lg ${iconBg} flex-shrink-0`}>
      <Icon className={`h-5 w-5 ${iconColor}`} />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide truncate">{title}</p>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{value.toLocaleString()}</p>
    </div>
    {trend !== undefined && (
      <div
        className={`flex items-center gap-0.5 text-xs font-semibold flex-shrink-0 ${trend >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}
      >
        {trend >= 0 ? (
          <TrendingUp className="h-3.5 w-3.5" />
        ) : (
          <TrendingDown className="h-3.5 w-3.5" />
        )}
        {trend >= 0 ? '+' : ''}
        {trend}%
      </div>
    )}
  </div>
);

// ─── Status badge ─────────────────────────────────────────────────────────────

const statusStyle: Record<string, string> = {
  open: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-amber-50 text-amber-700',
  resolved: 'bg-emerald-50 text-emerald-700',
  closed: 'bg-gray-100 text-gray-500',
};

const statusLabel: Record<string, string> = {
  open: 'Відкритий',
  in_progress: 'В роботі',
  resolved: 'Вирішено',
  closed: 'Закрито',
};

const priorityStyle: Record<string, string> = {
  high: 'bg-red-50 text-red-600 border border-red-100',
  medium: 'bg-amber-50 text-amber-600 border border-amber-100',
  low: 'bg-green-50 text-green-600 border border-green-100',
};

const priorityLabel: Record<string, string> = {
  high: 'Високий',
  medium: 'Середній',
  low: 'Низький',
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

const Dashboard: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isAdmin = user ? isAdminRole(user.role as UserRole) : false;
  const basePath = isAdmin ? '/admin' : '';

  const { tickets, isLoading: ticketsLoading, refetch: refetchTickets } = useTickets();
  const {
    stats: dashboardStats,
    loading: statsLoading,
    refetch: refetchStats,
  } = useDashboardStats();
  const typedDashboardStats = dashboardStats as DashboardStats | null;

  const [adUsersTotal, setAdUsersTotal] = useState<number | null>(null);
  const [adComputersTotal, setAdComputersTotal] = useState<number | null>(null);
  const [adStatsLoading, setAdStatsLoading] = useState(false);
  const [userMonthlyStats, setUserMonthlyStats] = useState<{
    currentMonth: { count: number; name: string };
    totalUsers: number;
    growth: number;
  } | null>(null);
  const [isCreateTicketModalOpen, setIsCreateTicketModalOpen] = useState(false);
  const [showMessage, setShowMessage] = useState(false);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error'>('success');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<number>(0);

  const loadAdStats = async () => {
    setAdStatsLoading(true);
    try {
      const response = await apiService.getADStatistics();
      if (response?.success && response.data) {
        const data = response.data as {
          users?: { total?: number };
          computers?: { total?: number };
        };
        setAdUsersTotal(data.users?.total ?? null);
        setAdComputersTotal(data.computers?.total ?? null);
      }
    } catch {
      // AD unavailable — not critical
    } finally {
      setAdStatsLoading(false);
    }
  };

  const loadUserMonthlyStats = React.useCallback(async () => {
    if (!isAdmin) return;
    try {
      const response = await apiService.getUserMonthlyStats();
      if (response?.success && response.data) {
        setUserMonthlyStats({
          currentMonth: response.data.currentMonth,
          totalUsers: response.data.totalUsers,
          growth: response.data.growth,
        });
      }
    } catch {
      /* ignore */
    }
  }, [isAdmin]);

  const saveScrollPosition = React.useCallback(() => {
    scrollPositionRef.current = window.pageYOffset || document.documentElement.scrollTop;
  }, []);

  const restoreScrollPosition = React.useCallback(() => {
    requestAnimationFrame(() => {
      window.scrollTo(0, scrollPositionRef.current);
    });
  }, []);

  const refreshData = React.useCallback(async () => {
    try {
      saveScrollPosition();
      await Promise.all([refetchTickets(), refetchStats(), loadUserMonthlyStats()]);
      setLastUpdated(new Date());
      restoreScrollPosition();
    } catch {
      /* ignore */
    }
  }, [
    refetchTickets,
    refetchStats,
    loadUserMonthlyStats,
    saveScrollPosition,
    restoreScrollPosition,
  ]);

  const handleRefresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshData();
    } finally {
      setRefreshing(false);
    }
  }, [refreshData]);

  useEffect(() => {
    loadAdStats();
    loadUserMonthlyStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  useEffect(() => {
    refreshData();
    intervalRef.current = setInterval(refreshData, 14400000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [refreshData]);

  useEffect(() => {
    if (location.state?.message) {
      setMessage(location.state.message);
      setMessageType(location.state.type || 'success');
      setShowMessage(true);
      const timer = setTimeout(() => setShowMessage(false), 5000);
      window.history.replaceState({}, document.title);
      return () => clearTimeout(timer);
    }
  }, [location.state]);

  const isLoading = ticketsLoading || statsLoading;

  const recentTickets = tickets ? tickets.slice(0, 6) : [];
  const priorityTickets = tickets
    ? tickets.filter(t => t.priority === TicketPriority.HIGH).slice(0, 4)
    : [];

  const stats = typedDashboardStats
    ? {
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
          closed: typedDashboardStats.trends?.closedTickets || 0,
        },
      }
    : {
        total: 0,
        open: 0,
        inProgress: 0,
        resolved: 0,
        closed: 0,
        highPriority: 0,
        trends: { total: 0, open: 0, inProgress: 0, resolved: 0, closed: 0 },
      };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Доброго ранку';
    if (h < 18) return 'Добрий день';
    return 'Добрий вечір';
  })();

  const userName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email
    : '';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Toast notifications */}
      {showMessage && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white ${messageType === 'success' ? 'bg-emerald-500' : 'bg-red-500'}`}
        >
          {messageType === 'success' ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          {message}
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4 sm:p-6 space-y-6">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              {greeting}
              {userName ? `, ${userName.split(' ')[0]}` : ''} 👋
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Оновлено: {formatDateWithLocale(lastUpdated)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setIsCreateTicketModalOpen(true)}
              variant="primary"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Нова заявка
            </Button>
            <Button
              onClick={handleRefresh}
              disabled={refreshing}
              variant="outline"
              size="sm"
              className="flex items-center gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Оновлення...' : 'Оновити'}
            </Button>
          </div>
        </div>

        {/* ── Stat Cards ─────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <StatCard
              title={t('dashboard.stats.totalTickets')}
              value={stats.total}
              icon={Ticket}
              iconBg="bg-blue-100"
              iconColor="text-blue-600"
              trend={stats.trends.total}
              onClick={() => navigate(`${basePath}/tickets`)}
            />
            <StatCard
              title={t('dashboard.stats.openTickets')}
              value={stats.open}
              icon={Clock}
              iconBg="bg-amber-100"
              iconColor="text-amber-600"
              trend={stats.trends.open}
              onClick={() => navigate(`${basePath}/tickets?status=open`)}
            />
            <StatCard
              title={t('dashboard.stats.inProgressTickets')}
              value={stats.inProgress}
              icon={Activity}
              iconBg="bg-purple-100"
              iconColor="text-purple-600"
              trend={stats.trends.inProgress}
              onClick={() => navigate(`${basePath}/tickets?status=in_progress`)}
            />
            <StatCard
              title={t('dashboard.stats.closedTickets')}
              value={stats.closed}
              icon={XCircle}
              iconBg="bg-gray-100"
              iconColor="text-gray-500"
              trend={stats.trends.closed}
              onClick={() => navigate(`${basePath}/tickets?status=closed`)}
            />
            {userMonthlyStats && (
              <StatCard
                title={`Користувачі (${userMonthlyStats.currentMonth.name})`}
                value={userMonthlyStats.currentMonth.count}
                icon={Users}
                iconBg="bg-indigo-100"
                iconColor="text-indigo-600"
                trend={userMonthlyStats.growth}
                onClick={() => navigate(`${basePath}/users`)}
              />
            )}
          </div>
        )}

        {/* ── Main Grid ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Recent tickets */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 shadow-sm flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                {t('dashboard.recentTickets')}
              </h2>
              <button
                onClick={() => navigate(`${basePath}/tickets`)}
                className="flex items-center gap-1 text-xs text-blue-600 font-medium hover:text-blue-700"
              >
                Всі заявки <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex-1 divide-y divide-gray-50">
              {recentTickets.length > 0 ? (
                recentTickets.map(ticket => (
                  <div
                    key={ticket._id}
                    className="px-5 py-3.5 flex items-center gap-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`${basePath}/tickets/${ticket._id}`)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') navigate(`${basePath}/tickets/${ticket._id}`);
                    }}
                  >
                    <span
                      className={`h-2 w-2 rounded-full flex-shrink-0 ${
                        ticket.status === 'open'
                          ? 'bg-blue-500'
                          : ticket.status === 'in_progress'
                            ? 'bg-amber-500'
                            : ticket.status === 'resolved'
                              ? 'bg-emerald-500'
                              : 'bg-gray-300'
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{ticket.title}</p>
                      <p className="text-xs text-gray-400">
                        {formatDateWithLocale(ticket.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${priorityStyle[ticket.priority] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {priorityLabel[ticket.priority] || ticket.priority}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${statusStyle[ticket.status] || 'bg-gray-100 text-gray-500'}`}
                      >
                        {statusLabel[ticket.status] || ticket.status}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                  <FileText className="h-10 w-10 mb-2" />
                  <p className="text-sm">{t('dashboard.noRecentTickets')}</p>
                </div>
              )}
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Quick actions */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                <Zap className="h-4 w-4 text-gray-400" />
                {t('dashboard.quickActions')}
              </h2>
              <div className="space-y-2">
                <button
                  onClick={() => setIsCreateTicketModalOpen(true)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  {t('dashboard.createNewTicket')}
                </button>
                {isAdmin && (
                  <button
                    onClick={() => navigate(`${basePath}/analytics`)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-100"
                  >
                    <BarChart3 className="h-4 w-4 text-gray-400" />
                    {t('dashboard.analytics')}
                  </button>
                )}
                {isAdmin && (
                  <button
                    onClick={() => navigate('/admin/tickets?status=open')}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 text-gray-700 rounded-lg text-sm font-medium transition-colors border border-gray-100"
                  >
                    <Clock className="h-4 w-4 text-gray-400" />
                    Відкриті заявки
                  </button>
                )}
              </div>
            </div>

            {/* High priority tickets */}
            {isAdmin && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                  {t('dashboard.priorityTickets')}
                </h2>
                <div className="space-y-2">
                  {priorityTickets.length > 0 ? (
                    priorityTickets.map(ticket => (
                      <div
                        key={ticket._id}
                        className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 cursor-pointer hover:bg-red-100 transition-colors"
                        onClick={() => navigate(`${basePath}/tickets/${ticket._id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={e => {
                          if (e.key === 'Enter') navigate(`${basePath}/tickets/${ticket._id}`);
                        }}
                      >
                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 line-clamp-2">
                            {ticket.title}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {formatDateWithLocale(ticket.createdAt)}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-gray-400 text-center py-4">
                      {t('dashboard.noPriorityTickets')}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* AD counters */}
            {isAdmin && (adUsersTotal !== null || adComputersTotal !== null || adStatsLoading) && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                  <Monitor className="h-4 w-4 text-gray-400" />
                  Active Directory
                </h2>
                <div className="grid grid-cols-2 gap-2">
                  <div
                    className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => navigate('/admin/active-directory?view=users')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') navigate('/admin/active-directory?view=users');
                    }}
                  >
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Користувачі</p>
                    {adStatsLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <p className="text-xl font-bold text-gray-800">
                        {adUsersTotal !== null ? adUsersTotal.toLocaleString() : '—'}
                      </p>
                    )}
                  </div>
                  <div
                    className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => navigate('/admin/active-directory?view=computers')}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => {
                      if (e.key === 'Enter') navigate('/admin/active-directory?view=computers');
                    }}
                  >
                    <p className="text-[10px] text-gray-400 uppercase font-medium">Комп'ютери</p>
                    {adStatsLoading ? (
                      <LoadingSpinner size="sm" />
                    ) : (
                      <p className="text-xl font-bold text-gray-800">
                        {adComputersTotal !== null ? adComputersTotal.toLocaleString() : '—'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Charts ─────────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <WeeklyTicketsChart />
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <WorkloadByDayChart />
            </div>
          </div>
        )}

        {/* ── Kanban ─────────────────────────────────────────────────── */}
        {isAdmin && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <MiniKanban />
          </div>
        )}
      </div>

      <CreateTicketModal
        isOpen={isCreateTicketModalOpen}
        onClose={() => setIsCreateTicketModalOpen(false)}
        onSuccess={() => {
          setIsCreateTicketModalOpen(false);
          refetchTickets();
          refetchStats();
        }}
      />
    </div>
  );
};

export default Dashboard;
