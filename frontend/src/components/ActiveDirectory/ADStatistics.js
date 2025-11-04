import React, { useState, useEffect } from 'react';
import { FaUsers, FaDesktop, FaChartPie, FaBuilding, FaSync } from 'react-icons/fa';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';
import { apiService as api } from '../../services/api';
import LoadingSpinner from '../UI/LoadingSpinner';
import { useTranslation } from 'react-i18next';
import { useWindowSize } from '../../hooks';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

const ADStatistics = () => {
  const { t } = useTranslation();
  const { width } = useWindowSize();
  const isMobile = width < 640;
  const [statistics, setStatistics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchStatistics();
  }, []);

  const fetchStatistics = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.getADStatistics();
      
      if (response.success) {
        setStatistics(response.data);
      } else {
        setError(t('activeDirectory.statistics.getStatisticsError'));
      }
    } catch (err) {
      console.error('Error fetching AD statistics:', err);
      setError(err.response?.data?.message || t('activeDirectory.statistics.connectionError'));
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchStatistics();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="text-red-600 mr-3">
              <FaChartPie size={20} />
            </div>
            <div>
              <h3 className="text-red-800 font-medium">{t('activeDirectory.statistics.errorLoading')}</h3>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="text-red-600 hover:text-red-800"
          >
            <FaSync />
          </button>
        </div>
      </div>
    );
  }

  if (!statistics) {
    return null;
  }

  // Дані для графіка користувачів
  const usersChartData = {
    labels: [t('activeDirectory.statistics.active'), t('activeDirectory.statistics.inactive')],
    datasets: [
      {
        data: [statistics.users.enabled, statistics.users.disabled],
        backgroundColor: ['#10B981', '#EF4444'],
        borderColor: ['#059669', '#DC2626'],
        borderWidth: 2,
      },
    ],
  };

  // Дані для графіка комп'ютерів
  const computersChartData = {
    labels: [t('activeDirectory.statistics.active'), t('activeDirectory.statistics.inactive')],
    datasets: [
      {
        data: [statistics.computers.enabled, statistics.computers.disabled],
        backgroundColor: ['#3B82F6', '#F59E0B'],
        borderColor: ['#2563EB', '#D97706'],
        borderWidth: 2,
      },
    ],
  };

  // Дані для графіка операційних систем
  const osLabels = Object.keys(statistics.operatingSystems);
  const osData = Object.values(statistics.operatingSystems);
  const osColors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', 
    '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
  ];

  const osChartData = {
    labels: osLabels,
    datasets: [
      {
        label: t('activeDirectory.statistics.computerCount'),
        data: osData,
        backgroundColor: osColors.slice(0, osLabels.length),
        borderColor: osColors.slice(0, osLabels.length).map(color => color.replace('0.8', '1')),
        borderWidth: 1,
      },
    ],
  };

  // Дані для графіка департаментів
  const deptLabels = Object.keys(statistics.departments);
  const deptData = Object.values(statistics.departments);

  const departmentsChartData = {
    labels: deptLabels,
    datasets: [
      {
        label: t('activeDirectory.statistics.userCount'),
        data: deptData,
        backgroundColor: osColors.slice(0, deptLabels.length),
        borderColor: osColors.slice(0, deptLabels.length).map(color => color.replace('0.8', '1')),
        borderWidth: 1,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          font: {
            size: isMobile ? 10 : 12
          },
          padding: isMobile ? 8 : 12
        }
      },
      tooltip: {
        titleFont: {
          size: isMobile ? 11 : 13
        },
        bodyFont: {
          size: isMobile ? 10 : 12
        }
      }
    },
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        titleFont: {
          size: isMobile ? 11 : 13
        },
        bodyFont: {
          size: isMobile ? 10 : 12
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: isMobile ? 10 : 12
          }
        },
      },
      x: {
        ticks: {
          font: {
            size: isMobile ? 10 : 12
          }
        }
      }
    },
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Заголовок */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-0">
        <div className="flex items-center space-x-2">
          <FaChartPie className="text-purple-600" size={isMobile ? 20 : 24} />
          <h2 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-800">{t('activeDirectory.statistics.title')}</h2>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center space-x-2 bg-purple-600 text-white px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-purple-700 transition-colors text-sm sm:text-base"
        >
          <FaSync size={isMobile ? 14 : 16} />
          <span>{t('activeDirectory.refresh')}</span>
        </button>
      </div>

      {/* Загальна статистика */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 rounded-full bg-blue-100">
              <FaUsers className="text-blue-600" size={isMobile ? 18 : 24} />
            </div>
            <div className="ml-3 sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-gray-600">{t('activeDirectory.statistics.totalUsers')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{statistics.users.total}</p>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row justify-between text-xs sm:text-sm gap-1 sm:gap-0">
            <span className="text-green-600">{t('activeDirectory.statistics.enabled')}: {statistics.users.enabled}</span>
            <span className="text-red-600">{t('activeDirectory.statistics.disabled')}: {statistics.users.disabled}</span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 rounded-full bg-green-100">
              <FaDesktop className="text-green-600" size={isMobile ? 18 : 24} />
            </div>
            <div className="ml-3 sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-gray-600">{t('activeDirectory.statistics.totalComputers')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{statistics.computers.total}</p>
            </div>
          </div>
          <div className="mt-3 sm:mt-4 flex flex-col sm:flex-row justify-between text-xs sm:text-sm gap-1 sm:gap-0">
            <span className="text-green-600">{t('activeDirectory.statistics.enabled')}: {statistics.computers.enabled}</span>
            <span className="text-red-600">{t('activeDirectory.statistics.disabled')}: {statistics.computers.disabled}</span>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 rounded-full bg-purple-100">
              <FaBuilding className="text-purple-600" size={isMobile ? 18 : 24} />
            </div>
            <div className="ml-3 sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-gray-600">{t('activeDirectory.statistics.departments')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{Object.keys(statistics.departments).length}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <div className="flex items-center">
            <div className="p-2 sm:p-3 rounded-full bg-orange-100">
              <FaChartPie className="text-orange-600" size={isMobile ? 18 : 24} />
            </div>
            <div className="ml-3 sm:ml-4">
              <p className="text-xs sm:text-sm font-medium text-gray-600">{t('activeDirectory.statistics.osTypes')}</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{Object.keys(statistics.operatingSystems).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Графіки */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Графік користувачів */}
        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('activeDirectory.statistics.userDistribution')}</h3>
          <div className="h-48 sm:h-64">
            <Pie data={usersChartData} options={chartOptions} />
          </div>
        </div>

        {/* Графік комп'ютерів */}
        <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
          <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('activeDirectory.statistics.computerDistribution')}</h3>
          <div className="h-48 sm:h-64">
            <Pie data={computersChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Графіки операційних систем та департаментів */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Операційні системи */}
        {osLabels.length > 0 && (
          <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('activeDirectory.statistics.operatingSystems')}</h3>
            <div className="h-48 sm:h-64">
              <Bar data={osChartData} options={barChartOptions} />
            </div>
          </div>
        )}

        {/* Департаменти */}
        {deptLabels.length > 0 && (
          <div className="bg-white p-3 sm:p-4 lg:p-6 rounded-lg shadow-sm border">
            <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-3 sm:mb-4">{t('activeDirectory.statistics.usersByDepartments')}</h3>
            <div className="h-48 sm:h-64">
              <Bar data={departmentsChartData} options={barChartOptions} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ADStatistics;