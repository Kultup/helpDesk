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
      const token = localStorage.getItem('token');
      const baseURL = process.env.REACT_APP_API_URL as string;
      const response = await axios.get(`${baseURL}/analytics/charts/workload-by-day`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && Array.isArray(response.data.data)) {
        // Сортуємо дані за dayNumber для забезпечення правильного порядку
        const sortedData = response.data.data.sort((a: WorkloadData, b: WorkloadData) => a.dayNumber - b.dayNumber);
        
        // Перевіряємо на дублікати
        const uniqueData = sortedData.filter((item: WorkloadData, index: number, arr: WorkloadData[]) => 
          arr.findIndex((t: WorkloadData) => t.dayNumber === item.dayNumber) === index
        );
        
        setData(uniqueData);
      } else {
        setError(t('dashboard.charts.noData'));
      }
    } catch (err) {
      console.error('Помилка завантаження навантаження по днях:', err);
      setError(t('dashboard.charts.noData'));
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
    labels: data.map(item => getDayName(item.dayNumber)),
    datasets: [
      {
        label: 'Всього тикетів',
        data: data.map(item => item.totalTickets),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }
    ]
  });

  const getStatusChartData = () => ({
    labels: data.map(item => getDayName(item.dayNumber)),
    datasets: [
      {
        label: t('dashboard.charts.open'),
        data: data.map(item => item.openTickets),
        backgroundColor: 'rgba(239, 68, 68, 0.8)',
        borderColor: 'rgb(239, 68, 68)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: t('dashboard.charts.inProgress'),
        data: data.map(item => item.inProgressTickets),
        backgroundColor: 'rgba(245, 158, 11, 0.8)',
        borderColor: 'rgb(245, 158, 11)',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      },
      {
        label: t('dashboard.charts.resolved'),
        data: data.map(item => item.resolvedTickets),
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
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12
          }
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: 'white',
        bodyColor: 'white',
        borderColor: 'rgb(59, 130, 246)',
        borderWidth: 1,
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
            size: 12
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
            size: 12
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
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-red-500 text-center">
            <p>{error}</p>
            <button 
              onClick={fetchWorkloadData}
              className="mt-2 text-blue-600 hover:text-blue-800 underline"
            >
              {t('dashboard.charts.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalTickets = data.reduce((sum, item) => sum + item.totalTickets, 0);
  const avgPerDay = data.length > 0 ? Math.round(totalTickets / data.length) : 0;
  const busiestDay = data.reduce((max, item) => 
    item.totalTickets > max.totalTickets ? item : max, data[0] || { dayNumber: 0, totalTickets: 0 });

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.workloadByDay')}</h3>
          <p className="text-sm text-gray-500">
            {t('dashboard.charts.total')}: {totalTickets} | {t('dashboard.charts.average')}: {avgPerDay}{t('dashboard.charts.perDay')} | {t('dashboard.charts.busiestDay')}: {getDayName(busiestDay.dayNumber)}
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('total')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                viewMode === 'total'
                  ? 'bg-white text-blue-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {t('dashboard.charts.totalMode')}
            </button>
            <button
              onClick={() => setViewMode('status')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
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
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title={t('dashboard.charts.refreshData')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
      <div className="h-64">
        <Bar 
          data={viewMode === 'total' ? getTotalChartData() : getStatusChartData()} 
          options={options} 
        />
      </div>
      
      {/* Додаткова статистика */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        <div className="text-center">
          <p className="text-gray-500">{t('dashboard.charts.leastLoad')}</p>
          <p className="font-semibold text-gray-900">
            {getDayName(data.reduce((min, item) => 
              item.totalTickets < min.totalTickets ? item : min, 
              data[0] || { dayNumber: 0, totalTickets: 0 }
            ).dayNumber)}
          </p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">{t('dashboard.charts.mostLoad')}</p>
          <p className="font-semibold text-gray-900">{getDayName(busiestDay.dayNumber)}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">{t('dashboard.charts.minMaxDiff')}</p>
          <p className="font-semibold text-gray-900">
            {busiestDay.totalTickets - data.reduce((min, item) => 
              item.totalTickets < min.totalTickets ? item : min, 
              data[0] || { totalTickets: 0 }
            ).totalTickets}
          </p>
        </div>
      </div>
    </div>
  );
};

export default WorkloadByDayChart;