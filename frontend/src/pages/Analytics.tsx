import React, { useEffect, useState } from 'react';
import { 
  BarChart3, 
  PieChart, 
  TrendingUp, 
  MapPin,
  Download,
  Calendar,
  Filter,
  Clock,
  Users,
  Activity,
  RefreshCw
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
  ArcElement,
  LineElement,
  PointElement,
  Filler,
} from 'chart.js';
import { Bar, Pie, Line } from 'react-chartjs-2';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { useCities, useUsers } from '../hooks';
import { useAnalytics } from '../hooks/useAnalytics';
import { useUserRegistrationStats } from '../hooks/useUserRegistrationStats';
import { useTicketExport } from '../hooks/useTicketExport';
import { TicketStatus, TicketPriority } from '../types';
import { formatDate, formatDateWithLocale } from '../utils';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ExportTicketsModal from '../components/ExportTicketsModal';
import RatingsAnalytics from '../components/RatingsAnalytics';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  LineElement,
  PointElement,
  Filler
);



const Analytics: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { cities, isLoading: citiesLoading } = useCities();
  const { users, isLoading: usersLoading } = useUsers();
  const { analyticsData, dashboardData, loading: analyticsLoading, refetch: refetchAnalytics } = useAnalytics();
  const { userStats, loading: userStatsLoading, refetch: refetchUserStats } = useUserRegistrationStats();
  const { exportTickets } = useTicketExport();
  
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  const [selectedFilters, setSelectedFilters] = useState({
    status: [] as TicketStatus[],
    priority: [] as TicketPriority[],
    city: [] as string[]
  });

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'ratings'>('general');

  // ТИМЧАСОВО ВІДКЛЮЧЕНО: Автооновлення даних для виправлення 429 помилок
  // useEffect(() => {
  //   let interval: NodeJS.Timeout;
    
  //   if (autoRefresh) {
  //     interval = setInterval(async () => {
  //       try {
  //         await Promise.all([refetchAnalytics(), refetchUserStats()]);
  //         setLastUpdated(new Date());
  //       } catch (error) {
  //         console.error('Помилка оновлення даних:', error);
  //       }
  //     }, 300000); // Збільшуємо інтервал до 5 хвилин (300000 мс) замість 4 годин
  //   }
    
  //   return () => {
  //     if (interval) clearInterval(interval);
  //   };
  // }, [autoRefresh, refetchAnalytics, refetchUserStats]);



  // Дані для графіка статусів
  const getStatusCount = (status: string) => {
    return analyticsData?.ticketsByStatus?.find(item => item._id === status)?.count || 0;
  };

  const statusData = {
    labels: [t('analytics.status.open'), t('analytics.status.in_progress'), t('analytics.status.resolved'), t('analytics.status.closed')],
    datasets: [{
      data: [
        getStatusCount('open'),
        getStatusCount('in_progress'),
        getStatusCount('resolved'),
        getStatusCount('closed')
      ],
      backgroundColor: ['#E74C3C', '#F39C12', '#27AE60', '#95A5A6'],
      borderColor: ['#C0392B', '#E67E22', '#229954', '#7F8C8D'],
      borderWidth: 2,
      hoverBackgroundColor: ['#EC7063', '#F7DC6F', '#58D68D', '#AEB6BF'],
      hoverBorderColor: ['#922B21', '#B7950B', '#1E8449', '#566573'],
      hoverBorderWidth: 3
    }]
  };

  const statusChartOptions = {
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
          }
        }
      },
      tooltip: {
        callbacks: {
          label: function(context: any) {
            const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
            const percentage = ((context.parsed * 100) / total).toFixed(1);
            return `${context.label}: ${context.parsed} (${percentage}%)`;
          }
        }
      }
    }
  };

  // Дані для графіка пріоритетів
  const getPriorityCount = (priority: string) => {
    return analyticsData?.ticketsByPriority?.find(item => item._id === priority)?.count || 0;
  };

  const priorityData = {
    labels: [t('analytics.priority.low'), t('analytics.priority.medium'), t('analytics.priority.high')],
    datasets: [{
      data: [
        getPriorityCount('low'),
        getPriorityCount('medium'),
        getPriorityCount('high')
      ],
      backgroundColor: ['#27AE60', '#F39C12', '#E74C3C'],
      borderColor: ['#229954', '#E67E22', '#C0392B'],
      borderWidth: 2
    }]
  };

  const priorityChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    }
  };

  // Tickets by city data
  const cityStats = (dashboardData?.topCities || []).map(cityData => ({
    name: cityData.cityName,
    count: cityData.count,
    resolved: Math.round(cityData.count * 0.7) // Приблизний розрахунок вирішених
  })).sort((a, b) => b.count - a.count);

  // Часовий тренд (останні 14 днів)
  const last14Days = Array.from({ length: 14 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - i));
    return date.toISOString().split('T')[0];
  });

  // Визначення локалі для форматування дат відповідно до поточної мови
  const getLocale = (lang: string) => {
    switch (lang) {
      case 'pl':
        return 'pl-PL';
      case 'uk':
        return 'uk-UA';
      case 'en':
      default:
        return 'en-US';
    }
  };

  const getTrendCount = (date: string) => {
    return analyticsData?.ticketsByDay?.find(item => item._id === date)?.count || 0;
  };

  const trendData = {
    labels: last14Days.map(date => new Date(date).toLocaleDateString(getLocale(i18n.language), {
      month: 'short',
      day: 'numeric'
    })),
    datasets: [
      {
        label: t('analytics.charts.createdTickets'),
        data: last14Days.map(date => getTrendCount(date)),
        borderColor: '#3B82F6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#3B82F6',
        pointBorderColor: '#1E40AF',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8
      },
      {
        label: t('analytics.charts.resolvedTickets'),
        data: last14Days.map(date => 
          Math.round(getTrendCount(date) * 0.7) // Приблизний розрахунок вирішених
        ),
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#047857',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8
      }
    ]
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top' as const,
        labels: {
          padding: 20,
          usePointStyle: true
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: t('analytics.charts.date')
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: t('analytics.charts.ticketCount')
        },
        beginAtZero: true,
        ticks: {
          stepSize: 1
        }
      }
    },
    interaction: {
      mode: 'nearest' as const,
      axis: 'x' as const,
      intersect: false
    }
  };

  const exportData = (format: 'csv' | 'excel' | 'pdf') => {
    console.log('🚀 Export started with format:', format);
    
    // Логуємо всі доступні дані
    console.log('📊 Available data:');
    console.log('- dashboardData:', dashboardData);
    console.log('- analyticsData:', analyticsData);
    console.log('- cityStats:', cityStats);
    console.log('- exportTickets:', exportTickets);
    
    if (!analyticsData || !dashboardData) {
      console.error('❌ Missing data for export');
      alert('Дані для експорту недоступні');
      return;
    }

    const fileName = `tickets_export_${new Date().toISOString().split('T')[0]}`;
    console.log('📁 File name:', fileName);

    // Підготовка даних для експорту
    const analyticsExportData = cityStats.map((item: any) => ({
      'Місто': item.name,
      'Всього тикетів': item.count,
      'Вирішених': item.resolved
    }));
    
    console.log('📊 Analytics export data prepared:', analyticsExportData);
    console.log('📊 Analytics export data length:', analyticsExportData.length);

    if (format === 'csv') {
      console.log('📄 Starting CSV export');
      const csv = Papa.unparse(analyticsExportData);
      console.log('📄 CSV data length:', csv.length);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      console.log('📄 CSV blob size:', blob.size);
      downloadFile(blob, `${fileName}.csv`);
      console.log('📄 CSV export completed');
    } else if (format === 'excel') {
      console.log('📊 Starting Excel export');
      
      // Створюємо робочу книгу
      const workbook = XLSX.utils.book_new();
      console.log('📊 Workbook created');
      
      // Створюємо основний аркуш з аналітикою
      const worksheet = XLSX.utils.json_to_sheet(analyticsExportData);
      console.log('📊 Main worksheet created');
      console.log('📊 Worksheet data:', worksheet);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Аналітика');
      console.log('📊 Main worksheet appended');

      // Додаємо аркуш зі статистикою (беремо з analyticsData/dashboardData)
      const statsData = [
        { 'Показник': 'Всього тикетів', 'Значення': analyticsData?.overview?.totalTickets || 0 },
        { 'Показник': 'Відкритих тикетів', 'Значення': getStatusCount('open') },
        { 'Показник': 'В роботі', 'Значення': getStatusCount('in_progress') },
        { 'Показник': 'Вирішених тикетів', 'Значення': getStatusCount('resolved') },
        { 'Показник': 'Закритих тикетів', 'Значення': getStatusCount('closed') },
        { 'Показник': 'Активних користувачів', 'Значення': analyticsData?.overview?.activeUsers || 0 }
      ];
      
      console.log('📊 Stats data created:', statsData);
      const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
      console.log('📊 Stats worksheet created');
      console.log('📊 Stats worksheet data:', statsWorksheet);
      
      XLSX.utils.book_append_sheet(workbook, statsWorksheet, 'Статистика');
      console.log('📊 Stats worksheet appended');
      
      console.log('📊 Final workbook:', workbook);
      console.log('📊 Workbook sheets:', Object.keys(workbook.Sheets));
      
      console.log('📊 Writing file:', `${fileName}.xlsx`);
      // Створюємо blob для завантаження
      try {
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        console.log('📊 Excel buffer created, size:', excelBuffer.length);
        
        const blob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        console.log('📊 Excel blob created, size:', blob.size);
        
        if (blob.size === 0) {
          console.error('❌ Excel blob is empty!');
          alert('Помилка: створений файл порожній');
          return;
        }
        
        downloadFile(blob, `${fileName}.xlsx`);
        console.log('📊 Excel file download initiated successfully!');
      } catch (error) {
        console.error('❌ Error creating Excel file:', error);
        alert('Помилка при створенні Excel файлу: ' + (error instanceof Error ? error.message : String(error)));
      }
    } else if (format === 'pdf') {
      // Створюємо PDF звіт
      const { jsPDF } = require('jspdf');
      require('jspdf-autotable');
      
      const doc = new jsPDF();
      
      // Заголовок
      doc.setFontSize(16);
      doc.text('Звіт аналітики Help Desk', 20, 20);
      doc.setFontSize(12);
      doc.text(`Дата створення: ${new Date().toLocaleDateString('uk-UA')}`, 20, 30);
      doc.text(`Період: ${dateRange.start} - ${dateRange.end}`, 20, 40);
      
      // Статистика
      doc.text('Загальна статистика:', 20, 55);
      const statsTable = [
        ['Показник', 'Значення'],
        ['Всього тикетів', (analyticsData?.overview?.totalTickets || 0).toString()],
        ['Відкритих тикетів', getStatusCount('open').toString()],
        ['В роботі', getStatusCount('in_progress').toString()],
        ['Вирішених тикетів', getStatusCount('resolved').toString()],
        ['Закритих тикетів', getStatusCount('closed').toString()]
      ];
      
      doc.autoTable({
        head: [statsTable[0]],
        body: statsTable.slice(1),
        startY: 65,
        theme: 'grid'
      });
      
      // Таблиця аналітики
      const analyticsTable = cityStats.map((item: any) => [
        item.name,
        item.count.toString(),
        item.resolved.toString()
      ]);
      
      doc.autoTable({
        head: [['Місто', 'Всього тикетів', 'Вирішених']],
        body: analyticsTable,
        startY: doc.lastAutoTable.finalY + 20,
        theme: 'grid',
        styles: { fontSize: 8 }
      });
      
      doc.save(`${fileName}.pdf`);
    }
  };

  const downloadFile = (blob: Blob, filename: string) => {
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (analyticsLoading || citiesLoading || usersLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
          <p className="text-gray-600 mt-1">
            {t('analytics.periodStats', { 
              start: formatDateWithLocale(dateRange.start, { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }), 
              end: formatDateWithLocale(dateRange.end, { 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }) 
            })}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {t('analytics.lastUpdated')}: {lastUpdated.toLocaleTimeString(i18n.language === 'uk' ? 'uk-UA' : i18n.language === 'en' ? 'en-US' : 'pl-PL')}
          </p>
        </div>
        <div className="mt-4 sm:mt-0 flex space-x-2">
          <Button 
            onClick={async () => {
              if (!autoRefresh) {
                // Ручне оновлення
                try {
                  await Promise.all([refetchAnalytics(), refetchUserStats()]);
                  setLastUpdated(new Date());
                } catch (error) {
                  console.error('Помилка оновлення даних:', error);
                }
              }
              setAutoRefresh(!autoRefresh);
            }}
            variant={autoRefresh ? "primary" : "secondary"}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            {autoRefresh ? t('analytics.autoRefresh.enabled') : t('analytics.autoRefresh.enable')}
          </Button>
          <div className="flex space-x-2">
            <div className="flex space-x-1">
              <span className="text-xs text-gray-500 self-center mr-2">{t('analytics.export.analytics')}:</span>
              <Button onClick={() => exportData('csv')} size="sm">
                <Download className="h-4 w-4 mr-1" />
                {t('analytics.export.csv')}
              </Button>
              <Button onClick={() => exportData('excel')} size="sm">
                <Download className="h-4 w-4 mr-1" />
                {t('analytics.export.excel')}
              </Button>
              <Button onClick={() => exportData('pdf')} size="sm">
                <Download className="h-4 w-4 mr-1" />
                {t('analytics.export.pdf')}
              </Button>
            </div>
            <div className="border-l border-gray-300 mx-2"></div>
            <div className="flex space-x-1">
              <span className="text-xs text-gray-500 self-center mr-2">{t('analytics.export.tickets')}:</span>
              <Button 
                onClick={() => setIsExportModalOpen(true)}
                variant="primary"
                size="sm"
              >
                <Download className="h-4 w-4 mr-1" />
                {t('analytics.export.exportTickets')}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('analytics.tabs.general')}
          </button>
          <button
            onClick={() => setActiveTab('ratings')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'ratings'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('analytics.tabs.ratings')}
          </button>
        </nav>
      </div>

      {activeTab === 'general' && (
        <>
          {/* Date Range Filter */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <div className="flex items-center space-x-2">
              <Calendar className="h-5 w-5 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">{t('analytics.period')}:</span>
            </div>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
            <span className="text-gray-500">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </CardContent>
      </Card>

      {/* Advanced Filters */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="h-5 w-5 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">{t('analytics.additionalFilters')}:</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('analytics.filters.statuses')}:</label>
              <div className="space-y-2">
                {Object.values(TicketStatus).map(status => (
                  <label key={status} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.status.includes(status)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFilters(prev => ({
                            ...prev,
                            status: [...prev.status, status]
                          }));
                        } else {
                          setSelectedFilters(prev => ({
                            ...prev,
                            status: prev.status.filter(s => s !== status)
                          }));
                        }
                      }}
                      className="mr-2 rounded"
                    />
                    <span className="text-sm text-gray-600">
                      {status === TicketStatus.OPEN && t('analytics.status.open')}
                      {status === TicketStatus.IN_PROGRESS && t('analytics.status.in_progress')}
                      {status === TicketStatus.RESOLVED && t('analytics.status.resolved')}
                      {status === TicketStatus.CLOSED && t('analytics.status.closed')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('analytics.filters.priorities')}:</label>
              <div className="space-y-2">
                {Object.values(TicketPriority).map(priority => (
                  <label key={priority} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.priority.includes(priority)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFilters(prev => ({
                            ...prev,
                            priority: [...prev.priority, priority]
                          }));
                        } else {
                          setSelectedFilters(prev => ({
                            ...prev,
                            priority: prev.priority.filter(p => p !== priority)
                          }));
                        }
                      }}
                      className="mr-2 rounded"
                    />
                    <span className="text-sm text-gray-600">
                      {priority === TicketPriority.LOW && t('analytics.priority.low')}
                      {priority === TicketPriority.MEDIUM && t('analytics.priority.medium')}
                      {priority === TicketPriority.HIGH && t('analytics.priority.high')}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* City Filter */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-2">{t('analytics.filters.cities')}:</label>
              <div className="max-h-32 overflow-y-auto space-y-2">
                {cities?.slice(0, 10).map(city => (
                  <label key={city._id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedFilters.city.includes(city._id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedFilters(prev => ({
                            ...prev,
                            city: [...prev.city, city._id]
                          }));
                        } else {
                          setSelectedFilters(prev => ({
                            ...prev,
                            city: prev.city.filter(c => c !== city._id)
                          }));
                        }
                      }}
                      className="mr-2 rounded"
                    />
                    <span className="text-sm text-gray-600">{city.name}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="mt-4 pt-4 border-t">
            <Button 
              variant="secondary" 
              onClick={() => setSelectedFilters({ status: [], priority: [], city: [] })}
              className="text-sm"
            >
              {t('analytics.filters.clear')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.totalTickets')}</p>
                <p className="text-2xl font-bold text-gray-900">
                  {analyticsLoading ? '...' : (analyticsData?.overview?.totalTickets || 0)}
                </p>
              </div>
              <BarChart3 className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.resolved')}</p>
                <p className="text-2xl font-bold text-green-600">
                  {analyticsLoading ? '...' : getStatusCount('resolved')}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.highPriority')}</p>
                <p className="text-2xl font-bold text-red-600">
                  {analyticsLoading ? '...' : getPriorityCount('high')}
                </p>
              </div>
              <Filter className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.activeCities')}</p>
                <p className="text-2xl font-bold text-purple-600">
                  {analyticsLoading ? '...' : (dashboardData?.topCities?.length || 0)}
                </p>
              </div>
              <MapPin className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.averageResolutionTime')}</p>
                <p className="text-2xl font-bold text-blue-600">
                  {analyticsLoading ? '...' : `${Math.round(analyticsData?.avgResolutionTime || 0)} ${t('analytics.metrics.hours')}`}
                </p>
              </div>
              <Clock className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.activeUsers')}</p>
                <p className="text-2xl font-bold text-green-600">
                  {analyticsLoading ? '...' : (analyticsData?.overview?.activeUsers || 0)}
                </p>
              </div>
              <Users className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">{t('analytics.metrics.resolutionRate')}</p>
                <p className="text-2xl font-bold text-orange-600">
                  {analyticsLoading ? '...' : (() => {
                    const total = analyticsData?.overview?.totalTickets || 0;
                    const resolved = getStatusCount('resolved');
                    return total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%';
                  })()}
                </p>
              </div>
              <Activity className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Registration Statistics */}
      <div className="space-y-6">
        <h2 className="text-xl font-semibold text-gray-900 flex items-center">
          <Users className="h-6 w-6 mr-2 text-blue-500" />
          {t('analytics.userRegistration.title')}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('analytics.userRegistration.totalUsers')}</p>
                  <p className="text-2xl font-bold text-blue-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.totalUsers || 0)}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('analytics.userRegistration.newIn30Days')}</p>
                  <p className="text-2xl font-bold text-green-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.growthRates?.last30Days || 0)}
                  </p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('analytics.userRegistration.newIn7Days')}</p>
                  <p className="text-2xl font-bold text-purple-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.growthRates?.last7Days || 0)}
                  </p>
                </div>
                <Activity className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">{t('analytics.userRegistration.activeSources')}</p>
                  <p className="text-2xl font-bold text-orange-600">
                    {userStatsLoading ? '...' : (userStats?.registrationSources?.length || 0)}
                  </p>
                </div>
                <BarChart3 className="h-8 w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Registration Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Registration Sources Chart */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold flex items-center">
                <PieChart className="h-5 w-5 mr-2 text-blue-500" />
                {t('analytics.userRegistration.registrationSources')}
              </h3>
            </CardHeader>
            <CardContent>
              {userStatsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <LoadingSpinner />
                </div>
              ) : userStats?.registrationSources && userStats.registrationSources.length > 0 ? (
                <Pie
                  data={{
                    labels: userStats.registrationSources.map((source: any) => source._id || t('analytics.unknown')),
                    datasets: [{
                      data: userStats.registrationSources.map((source: any) => source.count),
                      backgroundColor: [
                        '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                        '#06B6D4', '#84CC16', '#F97316', '#EC4899', '#6B7280'
                      ],
                      borderWidth: 2,
                      borderColor: '#ffffff'
                    }]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const,
                        labels: {
                          padding: 20,
                          usePointStyle: true
                        }
                      }
                    }
                  }}
                  height={300}
                />
              ) : (
                <div className="flex justify-center items-center h-64 text-gray-500">
                  {t('analytics.noData')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration Status Chart */}
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold flex items-center">
                <BarChart3 className="h-5 w-5 mr-2 text-green-500" />
                {t('analytics.charts.registrationStatuses')}
              </h3>
            </CardHeader>
            <CardContent>
              {userStatsLoading ? (
                <div className="flex justify-center items-center h-64">
                  <LoadingSpinner />
                </div>
              ) : userStats?.registrationStatuses && userStats.registrationStatuses.length > 0 ? (
                <Bar
                  data={{
                    labels: userStats.registrationStatuses.map((status: any) => {
                      switch(status._id) {
                        case 'pending': return t('analytics.status.pending');
                        case 'approved': return t('analytics.status.approved');
                        case 'rejected': return t('analytics.status.rejected');
                        default: return status._id || t('analytics.status.unknown');
                      }
                    }),
                    datasets: [{
                      label: t('analytics.charts.userCount'),
                      data: userStats.registrationStatuses.map((status: any) => status.count),
                      backgroundColor: userStats.registrationStatuses.map((status: any) => {
                        switch(status._id) {
                          case 'pending': return '#F59E0B';
                          case 'approved': return '#10B981';
                          case 'rejected': return '#EF4444';
                          default: return '#6B7280';
                        }
                      }),
                      borderRadius: 4,
                      borderSkipped: false
                    }]
                  }}
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
                        beginAtZero: true,
                        ticks: {
                          stepSize: 1
                        }
                      }
                    }
                  }}
                  height={300}
                />
              ) : (
                <div className="flex justify-center items-center h-64 text-gray-500">
                  {t('analytics.noData')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily Registrations Chart */}
        <Card>
          <CardHeader>
              <h3 className="text-lg font-semibold flex items-center">
                <TrendingUp className="h-5 w-5 mr-2 text-purple-500" />
                {t('analytics.userRegistration.dailyRegistrations')}
              </h3>
            </CardHeader>
          <CardContent>
            {userStatsLoading ? (
              <div className="flex justify-center items-center h-64">
                <LoadingSpinner />
              </div>
            ) : userStats?.dailyStats && userStats.dailyStats.length > 0 ? (
              <Line
                data={{
                  labels: userStats.dailyStats.map((day: any) => 
                    new Date(day._id).toLocaleDateString('uk-UA', { 
                      month: 'short', 
                      day: 'numeric' 
                    })
                  ),
                  datasets: [{
                    label: t('analytics.userRegistration.newRegistrations'),
                    data: userStats.dailyStats.map((day: any) => day.count),
                    borderColor: '#8B5CF6',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#8B5CF6',
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: 4
                  }]
                }}
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
                      beginAtZero: true,
                      ticks: {
                        stepSize: 1
                      }
                    },
                    x: {
                      grid: {
                        display: false
                      }
                    }
                  }
                }}
                height={300}
              />
            ) : (
              <div className="flex justify-center items-center h-64 text-gray-500">
                {t('analytics.noData')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center">
              <PieChart className="h-5 w-5 mr-2" />
              {t('analytics.charts.statusDistribution')}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Pie data={statusData} options={statusChartOptions} />
            </div>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              {t('analytics.charts.priorityDistribution')}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <Bar data={priorityData} options={priorityChartOptions} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cities Statistics */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold flex items-center">
            <MapPin className="h-5 w-5 mr-2" />
            {t('analytics.charts.cityStatistics')}
          </h3>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">{t('analytics.table.city')}</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">{t('analytics.table.totalTickets')}</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">{t('analytics.table.resolved')}</th>
                  <th className="px-4 py-2 text-left text-sm font-medium text-gray-500">{t('analytics.table.resolutionRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cityStats.slice(0, 10).map((city, index) => (
                  <tr key={`city-${index}-${city.name}`}>
                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{city.name}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{city.count}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">{city.resolved}</td>
                    <td className="px-4 py-2 text-sm text-gray-500">
                      {city.count > 0 ? Math.round((city.resolved / city.count) * 100) : 0}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Trend Chart */}
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              {t('analytics.charts.timeTrend')}
            </h3>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <Line data={trendData} options={trendChartOptions} />
          </div>
        </CardContent>
      </Card>

      {/* Export Tickets Modal */}
      <ExportTicketsModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={exportTickets}
        cities={cities}
        users={users}
      />
        </>
      )}

      {activeTab === 'ratings' && (
        <RatingsAnalytics />
      )}
    </div>
  );
};

export default Analytics;