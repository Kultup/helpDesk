import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  AlertCircle,
  TrendingUp,
  Clock,
  RefreshCw,
  Download,
  CheckCircle
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  Filler,
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { formatDate } from '../utils';
import { useWindowSize } from '../hooks';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  LineElement,
  PointElement,
  Filler
);

interface SLAStatistics {
  totalTickets: number;
  breachedTickets: number;
  warnedTickets: number;
  escalatedTickets: number;
  breachesByPriority: {
    low: number;
    medium: number;
    high: number;
    urgent: number;
  };
  averageResponseTime: number;
  averageResolutionTime: number;
  breachRate: number;
}

interface SLABreach {
  ticket: {
    _id: string;
    ticketNumber: string;
    title: string;
    status: string;
    priority: string;
    category: any;
    assignedTo: any;
    createdBy: any;
    createdAt: string;
  };
  breach: {
    type: string;
    percentage: number;
    breachedAt: string | null;
  };
  sla: {
    responseTime: number;
    resolutionTime: number;
    dueDate: string | null;
    policy: any;
  };
}

const SLADashboard: React.FC = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 640;
  
  const [statistics, setStatistics] = useState<SLAStatistics | null>(null);
  const [breaches, setBreaches] = useState<SLABreach[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [filters, setFilters] = useState({
    status: '',
    priority: ''
  });

  useEffect(() => {
    loadData();
  }, [dateRange, filters]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadStatistics(),
        loadBreaches()
      ]);
    } catch (error) {
      console.error('Error loading SLA data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await apiService.getSLAStatistics({
        startDate: dateRange.start,
        endDate: dateRange.end
      });
      if (response.success && response.data) {
        setStatistics(response.data);
      }
    } catch (error) {
      console.error('Error loading SLA statistics:', error);
    }
  };

  const loadBreaches = async () => {
    try {
      const response = await apiService.getSLABreaches({
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        page: 1,
        limit: 20
      });
      if (response.success && response.data) {
        const data = response.data as { data?: SLABreach[] };
        setBreaches(data.data || []);
      }
    } catch (error) {
      console.error('Error loading SLA breaches:', error);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'text-red-600 bg-red-100';
      case 'high': return 'text-orange-600 bg-orange-100';
      case 'medium': return 'text-yellow-600 bg-yellow-100';
      case 'low': return 'text-green-600 bg-green-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open': return 'text-red-600 bg-red-100';
      case 'in_progress': return 'text-yellow-600 bg-yellow-100';
      case 'resolved': return 'text-green-600 bg-green-100';
      case 'closed': return 'text-gray-600 bg-gray-100';
      default: return 'text-gray-600 bg-gray-100';
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  const breachesByPriorityData = statistics ? {
    labels: ['Low', 'Medium', 'High', 'Urgent'],
    datasets: [
      {
        label: 'Порушення SLA',
        data: [
          statistics.breachesByPriority.low,
          statistics.breachesByPriority.medium,
          statistics.breachesByPriority.high,
          statistics.breachesByPriority.urgent
        ],
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(239, 68, 68, 0.8)'
        ],
        borderColor: [
          'rgb(34, 197, 94)',
          'rgb(234, 179, 8)',
          'rgb(249, 115, 22)',
          'rgb(239, 68, 68)'
        ],
        borderWidth: 1
      }
    ]
  } : null;

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6" />
            SLA Dashboard
          </h1>
          <p className="text-gray-600 mt-2">Статистика та моніторинг SLA</p>
        </div>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Оновити
        </Button>
      </div>

      {/* Статистика */}
      {statistics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Всього тикетів</p>
                  <p className="text-2xl font-bold text-gray-900">{statistics.totalTickets}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Порушень SLA</p>
                  <p className="text-2xl font-bold text-red-600">{statistics.breachedTickets}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {statistics.breachRate.toFixed(1)}% від загальної кількості
                  </p>
                </div>
                <AlertCircle className="w-8 h-8 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Середній час відповіді</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics.averageResponseTime.toFixed(1)} год
                  </p>
                </div>
                <Clock className="w-8 h-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600 mb-1">Середній час вирішення</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {statistics.averageResolutionTime.toFixed(1)} год
                  </p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Графіки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {breachesByPriorityData && (
          <Card>
            <CardHeader title="Порушення SLA по пріоритетам" />
            <CardContent>
              <Bar
                data={breachesByPriorityData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      display: false
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true
                    }
                  }
                }}
                height={isMobile ? 200 : 300}
              />
            </CardContent>
          </Card>
        )}

        {/* Додатковий графік */}
        {statistics && (
          <Card>
            <CardHeader title="Метрики SLA" />
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Ескальовано тикетів</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {statistics.escalatedTickets}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Попереджень відправлено</span>
                  <span className="text-lg font-semibold text-gray-900">
                    {statistics.warnedTickets}
                  </span>
                </div>
                <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm text-gray-700">Процент порушень</span>
                  <span className={`text-lg font-semibold ${
                    statistics.breachRate > 10 ? 'text-red-600' :
                    statistics.breachRate > 5 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {statistics.breachRate.toFixed(1)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Фільтри */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата від
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Дата до
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Статус
              </label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Всі статуси</option>
                <option value="open">Відкрито</option>
                <option value="in_progress">В роботі</option>
                <option value="resolved">Вирішено</option>
                <option value="closed">Закрито</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Пріоритет
              </label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Всі пріоритети</option>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
                <option value="urgent">Критичний</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Список порушень */}
      <Card>
        <CardHeader title="Порушення SLA" />
        <CardContent>
          {breaches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <CheckCircle className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Немає порушень SLA</p>
            </div>
          ) : (
            <div className="space-y-4">
              {breaches.map((breach) => (
                <div
                  key={breach.ticket._id}
                  className="p-4 border border-red-200 bg-red-50 rounded-lg"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {breach.ticket.ticketNumber}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getPriorityColor(breach.ticket.priority)}`}>
                          {breach.ticket.priority}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${getStatusColor(breach.ticket.status)}`}>
                          {breach.ticket.status}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                          {breach.breach.type === 'response' ? 'Порушено час відповіді' : 'Порушено час вирішення'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 mb-2">{breach.ticket.title}</p>
                      <div className="flex flex-wrap gap-4 text-xs text-gray-600">
                        <span>Відсоток: {breach.breach.percentage}%</span>
                        {breach.breach.breachedAt && (
                          <span>Порушено: {formatDate(breach.breach.breachedAt)}</span>
                        )}
                        <span>Створено: {formatDate(breach.ticket.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SLADashboard;

