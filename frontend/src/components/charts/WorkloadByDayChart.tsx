import React, { useState, useEffect } from 'react';
import { Bar } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import axios from 'axios';

// Реєструємо компоненти Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

interface WorkloadData {
  dayNumber: number;
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
}

const WorkloadByDayChart: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<WorkloadData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'total' | 'status'>('total');

  useEffect(() => {
    fetchWorkloadData();
  }, []);

  const fetchWorkloadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Використовуємо відносний шлях, який буде проксуватися через setupProxy
      const baseURL = '/api';
      const token = localStorage.getItem('token');
      const response = await axios.get(`${baseURL}/analytics/charts/workload-by-day`, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.data.success && Array.isArray(response.data.data)) {
        // Сортуємо дані за dayNumber для забезпечення правильного порядку
        const sortedData = response.data.data.sort((a: WorkloadData, b: WorkloadData) => a.dayNumber - b.dayNumber);
        
        // Перевіряємо на дублікати
        const uniqueData = sortedData.filter((item: WorkloadData, index: number, arr: WorkloadData[]) => 
          arr.findIndex((t: WorkloadData) => t.dayNumber === item.dayNumber) === index
        );
        
        setData(uniqueData);
        setError(null);
      } else if (response.data.success && (!response.data.data || response.data.data.length === 0)) {
        // Немає даних - це не помилка
        setData([]);
        setError(null);
      } else {
        console.error('Invalid data format or unsuccessful response:', response.data);
        setError(t('dashboard.charts.noData'));
      }
    } catch (err: any) {
      console.error('Помилка завантаження навантаження по днях:', err);
      const errorMessage = err?.response?.data?.message || err?.message || t('dashboard.charts.noData');
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getDayName = (dayNumber: number): string => {
    // Перевіряємо чи dayNumber є валідним числом
    if (dayNumber === undefined || dayNumber === null || isNaN(dayNumber)) {
      console.error('getDayName: dayNumber is invalid:', dayNumber);
      return 'N/A';
    }
    
    // Нормалізуємо номер дня до діапазону 0-6 через модуль 7
    // Це гарантує, що значення 7 (MongoDB Saturday) стає 0 (JavaScript Sunday),
    // та уникає клонування днів при некоректних значеннях
    const validDayNumber = ((Math.floor(dayNumber) % 7) + 7) % 7;
    
    const translationKey = `dashboard.charts.days.${validDayNumber}`;
    const translation = t(translationKey);
    
    // Якщо переклад не знайдено, повертаємо ключ для діагностики
    if (translation === translationKey) {
      console.warn(`Translation not found for key: ${translationKey}`);
      // Fallback до англійських назв
      const fallbackDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      return fallbackDays[validDayNumber] || 'N/A';
    }
    
    return translation;
  };

  const getTotalChartData = () => ({
    labels: validData.map(item => getDayName(item.dayNumber)),
    datasets: [
      {
        label: 'Всього тикетів',
        data: validData.map(item => item.totalTickets || 0),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  });

  const getStatusChartData = () => ({
    labels: validData.map(item => getDayName(item.dayNumber)),
    datasets: [
      {
        label: t('dashboard.charts.open'),
        data: validData.map(item => item.openTickets || 0),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: t('dashboard.charts.inProgress'),
        data: validData.map(item => item.inProgressTickets || 0),
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderColor: 'rgb(245, 158, 11)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: t('dashboard.charts.resolved'),
        data: validData.map(item => item.resolvedTickets || 0),
        backgroundColor: 'rgba(16, 185, 129, 0.8)',
        borderColor: 'rgb(16, 185, 129)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  });

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          padding: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 20,
          usePointStyle: true,
          font: {
            size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        titleFont: {
          size: typeof window !== 'undefined' && window.innerWidth < 640 ? 11 : 12
        },
        bodyFont: {
          size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 11
        },
        callbacks: {
          title: (context: any) => {
            const index = context[0].dataIndex;
            return `${getDayName(data[index]?.dayNumber)}`;
          },
          label: (context: any) => {
            return `${context.dataset.label}: ${context.parsed.y} тикетів`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          display: false
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12
          }
        }
      },
      y: {
        display: true,
        beginAtZero: true,
        grid: {
          color: 'rgba(107, 114, 128, 0.1)'
        },
        ticks: {
          color: '#6B7280',
          font: {
            size: typeof window !== 'undefined' && window.innerWidth < 640 ? 10 : 12
          },
          stepSize: 1
        }
      }
    },
    interaction: {
      intersect: false,
      mode: 'index' as const
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
        </div>
        <div className="h-48 sm:h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
        </div>
        <div className="h-48 sm:h-64 flex items-center justify-center">
          <div className="text-red-500 text-center px-2">
            <p className="text-sm sm:text-base">{error}</p>
            <button 
              onClick={fetchWorkloadData}
              className="mt-2 text-sm sm:text-base text-blue-600 hover:text-blue-800 underline"
            >
              {t('dashboard.charts.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Обчислюємо статистику з безпечними перевірками
  const validData = data.filter(item => 
    item && 
    typeof item.totalTickets === 'number' && 
    !isNaN(item.totalTickets)
  );

  const totalTickets = validData.reduce((sum, item) => sum + (item.totalTickets || 0), 0);
  const avgPerDay = validData.length > 0 ? Math.round(totalTickets / validData.length) : 0;
  
  // Знаходимо найзавантаженіший день
  const busiestDay = validData.length > 0 
    ? validData.reduce((max, item) => {
        const maxTickets = max.totalTickets || 0;
        const itemTickets = item.totalTickets || 0;
        return itemTickets > maxTickets ? item : max;
      }, validData[0])
    : { dayNumber: 0, totalTickets: 0 };

  // Знаходимо найменше завантажений день
  const leastLoadedDay = validData.length > 0
    ? validData.reduce((min, item) => {
        const minTickets = min.totalTickets || 0;
        const itemTickets = item.totalTickets || 0;
        return itemTickets < minTickets ? item : min;
      }, validData[0])
    : { dayNumber: 0, totalTickets: 0 };

  const minMaxDiff = (busiestDay.totalTickets || 0) - (leastLoadedDay.totalTickets || 0);

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 break-words">
            {t('dashboard.charts.total')}: {isNaN(totalTickets) ? 0 : totalTickets} | {t('dashboard.charts.average')}: {isNaN(avgPerDay) ? 0 : avgPerDay}{t('dashboard.charts.perDay')} | {t('dashboard.charts.busiestDay')}: {validData.length > 0 ? getDayName(busiestDay.dayNumber) : '-'}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="flex bg-gray-100 rounded-lg p-0.5 sm:p-1 flex-1 sm:flex-none">
            <button
              onClick={() => setViewMode('total')}
              className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                viewMode === 'total'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('dashboard.charts.totalMode')}
            </button>
            <button
              onClick={() => setViewMode('status')}
              className={`px-2 sm:px-3 py-1 text-xs sm:text-sm rounded-md transition-colors ${
                viewMode === 'status'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('dashboard.charts.statusMode')}
            </button>
          </div>
          <button 
            onClick={fetchWorkloadData}
            className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
            title={t('dashboard.charts.refreshData')}
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      <div className="h-48 sm:h-64">
        <Bar 
          data={viewMode === 'total' ? getTotalChartData() : getStatusChartData()} 
          options={options} 
        />
      </div>
      
      {/* Додаткова статистика */}
      <div className="mt-3 sm:mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs sm:text-sm">
        <div className="text-center">
          <p className="text-gray-500 mb-1">{t('dashboard.charts.leastLoad')}</p>
          <p className="font-semibold text-gray-900">
            {validData.length > 0 ? getDayName(leastLoadedDay.dayNumber) : '-'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 mb-1">{t('dashboard.charts.mostLoad')}</p>
          <p className="font-semibold text-gray-900">
            {validData.length > 0 ? getDayName(busiestDay.dayNumber) : '-'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-500 mb-1">{t('dashboard.charts.minMaxDiff')}</p>
          <p className="font-semibold text-gray-900">
            {isNaN(minMaxDiff) ? 0 : minMaxDiff}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorkloadByDayChart;