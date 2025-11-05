import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import axios from 'axios';

// Реєструємо компоненти Chart.js
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface WeeklyData {
  date: string;
  dayNumber: number;
  count: number;
}

const WeeklyTicketsChart: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchWeeklyData();
  }, []);

  const fetchWeeklyData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = process.env.REACT_APP_API_URL || 
        (process.env.NODE_ENV === 'development' ? 'http://localhost:5000/api' : '/api');
      const response = await axios.get(`${baseURL}/analytics/charts/weekly-tickets`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success && Array.isArray(response.data.data)) {
        // Обробляємо та виправляємо дані
        const processedData = response.data.data.map((item: any, index: number) => {
          // Якщо dayNumber відсутній, обчислюємо його з дати
          let dayNumber = item.dayNumber;
          if (dayNumber === undefined || dayNumber === null || isNaN(dayNumber)) {
            console.warn(`Invalid dayNumber for item ${index}, calculating from date:`, item.date);
            const date = new Date(item.date);
            dayNumber = date.getDay();
          }
          
          return {
            date: item.date,
            dayNumber: dayNumber,
            count: item.count || 0
          };
        });
        
        setData(processedData);
      } else {
        console.error('Invalid data format or unsuccessful response');
        setError('Помилка завантаження даних');
      }
    } catch (err) {
      console.error('Помилка завантаження тижневої статистики:', err);
      setError('Помилка завантаження даних');
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
    
    // Переконуємося, що dayNumber в межах 0-6
    const validDayNumber = Math.max(0, Math.min(6, Math.floor(dayNumber)));
    
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

  const chartData = {
    labels: data.map(item => getDayName(item.dayNumber)),
    datasets: [
      {
        label: 'Тикети',
        data: data.map(item => item.count),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: 'rgb(59, 130, 246)',
        pointBorderColor: 'rgb(59, 130, 246)',
        pointRadius: 4,
        pointHoverRadius: 6,
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false
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
            return data[index]?.date || '';
          },
          label: (context: any) => {
            return `Тикетів: ${context.parsed.y}`;
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
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.weeklyTickets')}</h3>
        </div>
        <div className="h-40 sm:h-48 flex items-center justify-center">
          <div className="animate-spin rounded-full h-6 w-6 sm:h-8 sm:w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3 sm:mb-4">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.weeklyTickets')}</h3>
        </div>
        <div className="h-40 sm:h-48 flex items-center justify-center">
          <div className="text-red-500 text-center px-2">
            <p className="text-sm sm:text-base">{error}</p>
            <button 
              onClick={fetchWeeklyData}
              className="mt-2 text-sm sm:text-base text-blue-600 hover:text-blue-800 underline"
            >
              Спробувати знову
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalTickets = data.reduce((sum, item) => sum + item.count, 0);
  const avgTickets = data.length > 0 ? Math.round(totalTickets / data.length) : 0;

  return (
    <div className="bg-white rounded-lg shadow p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-3 sm:mb-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900">{t('dashboard.charts.weeklyTickets')}</h3>
          <p className="text-xs sm:text-sm text-gray-500 mt-1 break-words">
            {t('dashboard.charts.total')}: {totalTickets} | {t('dashboard.charts.average')}: {avgTickets}{t('dashboard.charts.perDay')}
          </p>
        </div>
        <button 
          onClick={fetchWeeklyData}
          className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
          title="Оновити дані"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <div className="h-40 sm:h-48">
        <Line data={chartData} options={options} />
      </div>
    </div>
  );
};

export default WeeklyTicketsChart;