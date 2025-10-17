import React, { useState, useEffect } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import axios from 'axios';
import { apiService } from '../../services/api';

// Реєструємо компоненти Chart.js
ChartJS.register(ArcElement, Tooltip, Legend);

interface CategoryData {
  category: string;
  count: number;
  percentage: number;
}

const CategoryDistributionChart: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryNameById, setCategoryNameById] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchCategoryData();
    loadCategoryNames();
  }, []);

  const fetchCategoryData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const baseURL = process.env.REACT_APP_API_URL as string;
      const response = await axios.get(`${baseURL}/analytics/charts/category-distribution`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        setData(response.data.data);
      } else {
        setError('Помилка завантаження даних');
      }
    } catch (err) {
      console.error('Помилка завантаження розподілу за категоріями:', err);
      setError('Помилка завантаження даних');
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryNames = async () => {
    try {
      const response = await apiService.getCategories(true);
      const categories = response.data || [];
      const map: Record<string, string> = {};
      categories.forEach((cat: any) => {
        if (cat?._id && cat?.name) {
          map[String(cat._id)] = String(cat.name);
        }
      });
      setCategoryNameById(map);
    } catch (e) {
      // Якщо не вдалося завантажити категорії, просто продовжуємо з наявними даними
      console.warn('Не вдалося завантажити назви категорій для мапінгу ID → назва');
    }
  };

  const isObjectId = (val: string) => /^[a-f\d]{24}$/i.test(val);
  const resolveCategoryName = (raw: string): string => {
    if (!raw) return raw;
    if (isObjectId(raw) && categoryNameById[raw]) return categoryNameById[raw];
    return raw;
  };

  // Кольори для діаграми
  const colors = [
    '#3B82F6', // blue-500
    '#10B981', // emerald-500
    '#F59E0B', // amber-500
    '#EF4444', // red-500
    '#8B5CF6', // violet-500
    '#06B6D4', // cyan-500
    '#84CC16', // lime-500
    '#F97316', // orange-500
    '#EC4899', // pink-500
    '#6B7280'  // gray-500
  ];

  const chartData = {
    labels: data.map(item => resolveCategoryName(item.category)),
    datasets: [
      {
        data: data.map(item => item.count),
        backgroundColor: colors.slice(0, data.length),
        borderColor: colors.slice(0, data.length).map(color => color),
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 4
      }
    ]
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true,
          font: {
            size: 12
          },
          generateLabels: (chart: any) => {
            const original = ChartJS.defaults.plugins.legend.labels.generateLabels;
            const labels = original.call(this, chart);
            
            labels.forEach((label: any, index: number) => {
              if (data[index]) {
                const name = resolveCategoryName(data[index].category);
                label.text = `${name} (${data[index].percentage}%)`;
              }
            });
            
            return labels;
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
          label: (context: any) => {
            const item = data[context.dataIndex];
            const name = resolveCategoryName(item.category);
            return `${name}: ${item.count} тикетів (${item.percentage}%)`;
          }
        }
      }
    },
    cutout: '50%'
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.categoryDistribution')}</h3>
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
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.categoryDistribution')}</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-red-500 text-center">
            <p>{error}</p>
            <button 
              onClick={fetchCategoryData}
              className="mt-2 text-blue-600 hover:text-blue-800 underline"
            >
              {t('dashboard.charts.tryAgain')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.categoryDistribution')}</h3>
        </div>
        <div className="h-64 flex items-center justify-center">
          <div className="text-gray-500 text-center">
            <p>{t('dashboard.charts.noData')}</p>
          </div>
        </div>
      </div>
    );
  }

  const totalTickets = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{t('dashboard.charts.categoryDistribution')}</h3>
          <p className="text-sm text-gray-500">
            {t('dashboard.charts.totalTickets')}: {totalTickets}
          </p>
        </div>
        <button 
          onClick={fetchCategoryData}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          title={t('dashboard.charts.refreshData')}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <div className="h-64">
        <Doughnut data={chartData} options={options} />
      </div>
      
      {/* Додаткова інформація */}
      <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div className="text-center">
          <p className="text-gray-500">{t('dashboard.charts.mostPopular')}</p>
          <p className="font-semibold text-gray-900">{resolveCategoryName(data[0]?.category || '')}</p>
        </div>
        <div className="text-center">
          <p className="text-gray-500">{t('dashboard.charts.totalCategories')}</p>
          <p className="font-semibold text-gray-900">{data.length}</p>
        </div>
      </div>
    </div>
  );
};

export default CategoryDistributionChart;