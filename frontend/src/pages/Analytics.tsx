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
  RefreshCw,
  BookmarkPlus,
  Bookmark,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  Lightbulb,
  Target
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
import { useCities, useUsers, useWindowSize } from '../hooks';
import { useAnalytics } from '../hooks/useAnalytics';
import { useUserRegistrationStats } from '../hooks/useUserRegistrationStats';
import { useTicketExport } from '../hooks/useTicketExport';
import { TicketStatus, TicketPriority } from '../types';
import { formatDate, formatDateWithLocale } from '../utils';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import ExportTicketsModal from '../components/ExportTicketsModal';
import { apiService } from '../services/api';

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
  const { width } = useWindowSize();
  const isMobile = width < 640;
  const { cities, isLoading: citiesLoading } = useCities();
  const { users, isLoading: usersLoading } = useUsers();
  const { userStats, loading: userStatsLoading, refetch: refetchUserStats } = useUserRegistrationStats();
  const { exportTickets } = useTicketExport();
  
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });

  // Завантаження аналітики залежить від вибраного діапазону дат
  const { analyticsData, dashboardData, loading: analyticsLoading, refetch: refetchAnalytics } = useAnalytics(dateRange.start, dateRange.end);

  const [selectedFilters, setSelectedFilters] = useState({
    status: [] as TicketStatus[],
    priority: [] as TicketPriority[],
    city: [] as string[]
  });

  const [autoRefresh, setAutoRefresh] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'general'>('general');
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);

  // Presets state
  type FilterPreset = {
    id: string;
    name: string;
    dateRange: { start: string; end: string };
    selectedFilters: { status: TicketStatus[]; priority: TicketPriority[]; city: string[] };
    createdAt: string;
  };

  const PRESETS_STORAGE_KEY = 'analyticsFilterPresets';
  const [presets, setPresets] = useState<FilterPreset[]>(() => {
    try {
      const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState('');

  const savePresetsToStorage = (items: FilterPreset[]) => {
    try {
      localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(items));
    } catch (e) {
      console.error('Failed to save presets', e);
    }
  };

  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const newPreset: FilterPreset = {
      id: `${Date.now()}`,
      name,
      dateRange: { ...dateRange },
      selectedFilters: { ...selectedFilters },
      createdAt: new Date().toISOString()
    };
    const next = [newPreset, ...presets].slice(0, 20); // ліміт 20 пресетів
    setPresets(next);
    savePresetsToStorage(next);
    setPresetName('');
  };

  const applyPreset = (preset: FilterPreset) => {
    setDateRange({ ...preset.dateRange });
    setSelectedFilters({ ...preset.selectedFilters });
    // перезавантаження даних аналітики під новий діапазон дат
    refetchAnalytics();
  };

  const deletePreset = (id: string) => {
    const next = presets.filter(p => p.id !== id);
    setPresets(next);
    savePresetsToStorage(next);
  };

  const handleAnalyzeAnalytics = async () => {
    if (isAnalyzing) return;

    try {
      // Використовуємо setTimeout для затримки оновлення стану, щоб уникнути DOM конфліктів
      setTimeout(() => setIsAnalyzing(true), 0);
      
      const response = await apiService.analyzeAnalytics(dateRange.start, dateRange.end);
      
      if (response.success && response.data) {
        setAiAnalysis(response.data);
        setTimeout(() => {
          setShowAnalysis(true);
          setIsAnalyzing(false);
        }, 0);
      } else {
        setTimeout(() => setIsAnalyzing(false), 0);
      }
    } catch (error: any) {
      console.error('Помилка аналізу аналітики:', error);
      setTimeout(() => setIsAnalyzing(false), 0);
    }
  };





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
          padding: isMobile ? 10 : 20,
          usePointStyle: true,
          font: {
            size: isMobile ? 10 : 12
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
        },
        titleFont: {
          size: isMobile ? 11 : 13
        },
        bodyFont: {
          size: isMobile ? 10 : 12
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
          padding: isMobile ? 10 : 20,
          usePointStyle: true,
          font: {
            size: isMobile ? 10 : 12
          }
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
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: isMobile ? 10 : 12
          }
        }
      },
      x: {
        ticks: {
          font: {
            size: isMobile ? 10 : 12
          }
        }
      }
    }
  };

  // Tickets by city data
  const cityStats = (dashboardData?.topCities || []).map(cityData => ({
    name: cityData.cityName,
    count: cityData.count,
    resolved: cityData.resolved || 0 // Реальні дані вирішених тикетів
  })).sort((a, b) => b.count - a.count);

  // Часовий тренд - використовуємо вибраний діапазон дат або останні 14 днів
  const startDate = new Date(dateRange.start);
  const endDate = new Date(dateRange.end);
  const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const daysToShow = Math.min(Math.max(daysDiff + 1, 7), 30); // Мінімум 7 днів, максимум 30
  
  const last14Days = Array.from({ length: daysToShow }, (_, i) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
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

  const getResolvedTrendCount = (date: string) => {
    return analyticsData?.resolvedTicketsByDay?.find(item => item._id === date)?.count || 0;
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
        pointRadius: isMobile ? 3 : 5,
        pointHoverRadius: isMobile ? 5 : 8
      },
      {
        label: t('analytics.charts.resolvedTickets'),
        data: last14Days.map(date => getResolvedTrendCount(date)), // Реальні дані вирішених тикетів
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointBackgroundColor: '#10B981',
        pointBorderColor: '#047857',
        pointBorderWidth: 2,
        pointRadius: isMobile ? 3 : 5,
        pointHoverRadius: isMobile ? 5 : 8
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
          padding: isMobile ? 10 : 20,
          usePointStyle: true,
          font: {
            size: isMobile ? 10 : 12
          }
        }
      },
      tooltip: {
        mode: 'index' as const,
        intersect: false,
        titleFont: {
          size: isMobile ? 11 : 13
        },
        bodyFont: {
          size: isMobile ? 10 : 12
        }
      }
    },
    scales: {
      x: {
        display: true,
        title: {
          display: true,
          text: t('analytics.charts.date'),
          font: {
            size: isMobile ? 11 : 13
          }
        },
        ticks: {
          font: {
            size: isMobile ? 10 : 12
          }
        }
      },
      y: {
        display: true,
        title: {
          display: true,
          text: t('analytics.charts.ticketCount'),
          font: {
            size: isMobile ? 11 : 13
          }
        },
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          font: {
            size: isMobile ? 10 : 12
          }
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
    if (!analyticsData || !dashboardData) {
      console.error('❌ Missing data for export');
      alert(t('analytics.export.dataUnavailable'));
      return;
    }

    const fileName = `tickets_export_${new Date().toISOString().split('T')[0]}`;

    // Підготовка даних для експорту
    const analyticsExportData = cityStats.map((item: any) => ({
      [t('analytics.export.columns.city')]: item.name,
      [t('analytics.export.columns.totalTickets')]: item.count,
      [t('analytics.export.columns.resolved')]: item.resolved
    }));

    if (format === 'csv') {
      const csv = Papa.unparse(analyticsExportData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      downloadFile(blob, `${fileName}.csv`);
    } else if (format === 'excel') {
      // Створюємо робочу книгу
      const workbook = XLSX.utils.book_new();
      
      // Створюємо основний аркуш з аналітикою
      const worksheet = XLSX.utils.json_to_sheet(analyticsExportData);
      
      XLSX.utils.book_append_sheet(workbook, worksheet, t('analytics.export.sheets.analytics'));

      // Додаємо аркуш зі статистикою (беремо з analyticsData/dashboardData)
      const statsData = [
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.totalTickets'), [t('analytics.export.columns.value')]: analyticsData?.overview?.totalTickets || 0 },
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.openTickets'), [t('analytics.export.columns.value')]: getStatusCount('open') },
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.inProgressTickets'), [t('analytics.export.columns.value')]: getStatusCount('in_progress') },
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.resolvedTickets'), [t('analytics.export.columns.value')]: getStatusCount('resolved') },
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.closedTickets'), [t('analytics.export.columns.value')]: getStatusCount('closed') },
        { [t('analytics.export.columns.indicator')]: t('analytics.export.indicators.activeUsers'), [t('analytics.export.columns.value')]: analyticsData?.overview?.activeUsers || 0 }
      ];
      
      const statsWorksheet = XLSX.utils.json_to_sheet(statsData);
      
      XLSX.utils.book_append_sheet(workbook, statsWorksheet, t('analytics.export.sheets.statistics'));
      
      // Створюємо blob для завантаження
      try {
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        
        const blob = new Blob([excelBuffer], { 
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
        });
        
        if (blob.size === 0) {
          console.error('❌ Excel blob is empty!');
          alert(t('analytics.export.emptyFileError'));
          return;
        }
        
        downloadFile(blob, `${fileName}.xlsx`);
      } catch (error) {
        console.error('❌ Error creating Excel file:', error);
        alert(t('analytics.export.excelError') + ': ' + (error instanceof Error ? error.message : String(error)));
      }
    } else if (format === 'pdf') {
      // Створюємо PDF звіт
      const { jsPDF } = require('jspdf');
      require('jspdf-autotable');
      
      const doc = new jsPDF();
      
      // Заголовок
      doc.setFontSize(16);
      doc.text(t('analytics.export.reportTitle'), 20, 20);
      doc.setFontSize(12);
      doc.text(`${t('analytics.export.createdDate')}: ${new Date().toLocaleDateString('uk-UA')}`, 20, 30);
      doc.text(`${t('analytics.export.period')}: ${dateRange.start} - ${dateRange.end}`, 20, 40);
      
      // Статистика
      doc.text(t('analytics.export.generalStats') + ':', 20, 55);
      const statsTable = [
        [t('analytics.export.columns.indicator'), t('analytics.export.columns.value')],
        [t('analytics.export.indicators.totalTickets'), (analyticsData?.overview?.totalTickets || 0).toString()],
        [t('analytics.export.indicators.openTickets'), getStatusCount('open').toString()],
        [t('analytics.export.indicators.inProgressTickets'), getStatusCount('in_progress').toString()],
        [t('analytics.export.indicators.resolvedTickets'), getStatusCount('resolved').toString()],
        [t('analytics.export.indicators.closedTickets'), getStatusCount('closed').toString()]
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
        head: [[t('analytics.export.columns.city'), t('analytics.export.columns.totalTickets'), t('analytics.export.columns.resolved')]],
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
    <div className="space-y-4 sm:space-y-6 p-2 sm:p-4 lg:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 mb-4 sm:mb-6">
        <div>
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{t('analytics.title')}</h1>
            <Button
              key={`ai-analyze-button-${isAnalyzing}`}
              variant="outline"
              size="sm"
              onClick={handleAnalyzeAnalytics}
              isLoading={isAnalyzing}
              disabled={isAnalyzing}
              className="flex items-center space-x-2"
            >
              <Sparkles className="h-4 w-4" />
              <span>AI Аналіз</span>
            </Button>
          </div>
          <p className="text-sm sm:text-base text-gray-600 mt-1">
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
        <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
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
            className="w-full sm:w-auto"
            size={isMobile ? "sm" : "md"}
          >
            <RefreshCw className={`h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
            <span className="text-xs sm:text-sm">{autoRefresh ? t('analytics.autoRefresh.enabled') : t('analytics.autoRefresh.enable')}</span>
          </Button>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-2">
            <div className="flex flex-wrap gap-1 sm:gap-1">
              {!isMobile && <span className="text-xs text-gray-500 self-center mr-1">{t('analytics.export.analytics')}:</span>}
              <Button onClick={() => exportData('csv')} size="sm" className="flex-1 sm:flex-none">
                <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="text-xs">{t('analytics.export.csv')}</span>
              </Button>
              <Button onClick={() => exportData('excel')} size="sm" className="flex-1 sm:flex-none">
                <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="text-xs">{t('analytics.export.excel')}</span>
              </Button>
              <Button onClick={() => exportData('pdf')} size="sm" className="flex-1 sm:flex-none">
                <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="text-xs">{t('analytics.export.pdf')}</span>
              </Button>
            </div>
            {!isMobile && <div className="border-l border-gray-300 mx-2"></div>}
            <div className="flex gap-1 sm:gap-1">
              {!isMobile && <span className="text-xs text-gray-500 self-center mr-1">{t('analytics.export.tickets')}:</span>}
              <Button 
                onClick={() => setIsExportModalOpen(true)}
                variant="primary"
                size="sm"
                className="flex-1 sm:flex-none"
              >
                <Download className="h-3 w-3 sm:h-4 sm:w-4 mr-1" />
                <span className="text-xs">{t('analytics.export.exportTickets')}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Вкладки */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-4 sm:space-x-8 overflow-x-auto" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('general')}
            className={`py-2 px-1 sm:px-2 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap ${
              activeTab === 'general'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {t('analytics.tabs.general')}
          </button>
        </nav>
      </div>

      {activeTab === 'general' && (
        <>
          {/* Date Range Filter */}
      <Card>
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium text-foreground">{t('analytics.period')}:</span>
            </div>
            <input
              type="date"
              value={dateRange.start}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
              className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 text-sm rounded-lg border border-border bg-surface text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary"
            />
            <span className="text-muted-foreground hidden sm:inline">—</span>
            <input
              type="date"
              value={dateRange.end}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
              className="flex-1 sm:flex-none px-2 sm:px-3 py-1.5 sm:py-2 text-sm rounded-lg border border-border bg-surface text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary"
            />
          </div>
        </CardContent>
      </Card>

      {/* Filter Presets */}
      <Card>
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 mb-4">
            <div className="flex items-center gap-2">
              <Bookmark className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground" />
              <span className="text-xs sm:text-sm font-medium text-foreground">{t('analytics.presets.title')}</span>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder={t('analytics.presets.namePlaceholder')}
                className="flex-1 sm:w-48 px-2 sm:px-3 py-1.5 sm:py-2 text-sm rounded-lg border border-border bg-surface text-foreground shadow-sm focus:ring-2 focus:ring-primary focus:border-primary"
              />
              <Button variant="primary" size="sm" onClick={savePreset} className="flex items-center justify-center gap-2">
                <BookmarkPlus className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="text-xs sm:text-sm">{t('analytics.presets.save')}</span>
              </Button>
            </div>
          </div>

          {presets.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t('analytics.presets.noPresets')}</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {presets.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-2 px-3 py-1 rounded-full border border-border bg-surface text-foreground text-sm cursor-pointer hover:bg-muted"
                  onClick={() => applyPreset(p)}
                  title={`${t('analytics.presets.apply')}: ${p.name}`}
                >
                  <Bookmark className="h-3 w-3 text-primary" />
                  <span>{p.name}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePreset(p.id); }}
                    className="ml-1 text-muted-foreground hover:text-rose-600"
                    title={t('analytics.presets.delete')}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Advanced Filters */}
      <Card>
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Filter className="h-4 w-4 sm:h-5 sm:w-5 text-gray-500" />
            <span className="text-xs sm:text-sm font-medium text-gray-700">{t('analytics.additionalFilters')}:</span>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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

      {/* AI Аналіз */}
      {aiAnalysis && (
        <Card className="border-2 border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
          <div className="p-6">
            <div 
              className="flex items-center justify-between cursor-pointer mb-4"
              onClick={() => setShowAnalysis(!showAnalysis)}
            >
              <div className="flex items-center space-x-3">
                <div className="bg-purple-100 p-2 rounded-full">
                  <Sparkles className="h-5 w-5 text-purple-600" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900">AI Аналіз статистики</h2>
              </div>
              {showAnalysis ? (
                <ChevronUp className="h-5 w-5 text-gray-500" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-500" />
              )}
            </div>

            {showAnalysis && (
              <div className="space-y-6 mt-4">
                {/* Короткий огляд */}
                {aiAnalysis.summary && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200">
                    <h3 className="font-semibold text-gray-900 mb-2 flex items-center">
                      <Target className="h-4 w-4 mr-2 text-purple-600" />
                      Короткий огляд
                    </h3>
                    <p className="text-gray-700">{aiAnalysis.summary}</p>
                  </div>
                )}

                {/* Ключові інсайти */}
                {aiAnalysis.keyInsights && aiAnalysis.keyInsights.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <Lightbulb className="h-4 w-4 mr-2 text-blue-600" />
                      Ключові інсайти
                    </h3>
                    <ul className="list-disc list-inside space-y-2 text-gray-700">
                      {aiAnalysis.keyInsights.map((insight: string, index: number) => (
                        <li key={index}>{insight}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Типові проблеми */}
                {aiAnalysis.commonProblems && aiAnalysis.commonProblems.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-orange-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2 text-orange-600" />
                      Типові проблеми в заявках
                    </h3>
                    <div className="space-y-4">
                      {aiAnalysis.commonProblems.map((problem: any, index: number) => (
                        <div key={index} className="border-l-4 border-orange-400 pl-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium text-gray-900">{problem.title}</h4>
                            {problem.frequency && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                                {problem.frequency} заявок
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{problem.description}</p>
                          {problem.examples && problem.examples.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs font-medium text-gray-500 mb-1">Приклади:</p>
                              <ul className="list-disc list-inside text-xs text-gray-600 space-y-1">
                                {problem.examples.map((example: string, exIndex: number) => (
                                  <li key={exIndex}>{example}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {problem.recommendation && (
                            <p className="text-sm text-blue-600 mt-2">
                              <strong>Рекомендація:</strong> {problem.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Аналіз якості */}
                {aiAnalysis.qualityAnalysis && (
                  <div className="bg-white rounded-lg p-4 border border-purple-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <Target className="h-4 w-4 mr-2 text-purple-600" />
                      Аналіз якості заявок
                    </h3>
                    <div className="space-y-3">
                      {aiAnalysis.qualityAnalysis.descriptionQuality && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">Якість описів:</span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              aiAnalysis.qualityAnalysis.descriptionQuality === 'good'
                                ? 'bg-green-100 text-green-700'
                                : aiAnalysis.qualityAnalysis.descriptionQuality === 'average'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {aiAnalysis.qualityAnalysis.descriptionQuality === 'good' ? 'Добре' :
                               aiAnalysis.qualityAnalysis.descriptionQuality === 'average' ? 'Середньо' : 'Погано'}
                            </span>
                          </div>
                          {aiAnalysis.qualityAnalysis.descriptionIssues && aiAnalysis.qualityAnalysis.descriptionIssues.length > 0 && (
                            <ul className="list-disc list-inside text-xs text-gray-600 mt-1 space-y-1">
                              {aiAnalysis.qualityAnalysis.descriptionIssues.map((issue: string, index: number) => (
                                <li key={index}>{issue}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                      {aiAnalysis.qualityAnalysis.commentQuality && (
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-gray-700">Якість коментарів:</span>
                            <span className={`text-xs px-2 py-1 rounded ${
                              aiAnalysis.qualityAnalysis.commentQuality === 'good'
                                ? 'bg-green-100 text-green-700'
                                : aiAnalysis.qualityAnalysis.commentQuality === 'average'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {aiAnalysis.qualityAnalysis.commentQuality === 'good' ? 'Добре' :
                               aiAnalysis.qualityAnalysis.commentQuality === 'average' ? 'Середньо' : 'Погано'}
                            </span>
                          </div>
                          {aiAnalysis.qualityAnalysis.commentIssues && aiAnalysis.qualityAnalysis.commentIssues.length > 0 && (
                            <ul className="list-disc list-inside text-xs text-gray-600 mt-1 space-y-1">
                              {aiAnalysis.qualityAnalysis.commentIssues.map((issue: string, index: number) => (
                                <li key={index}>{issue}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Проблеми */}
                {aiAnalysis.problems && aiAnalysis.problems.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-red-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <AlertCircle className="h-4 w-4 mr-2 text-red-600" />
                      Виявлені проблеми
                    </h3>
                    <div className="space-y-4">
                      {aiAnalysis.problems.map((problem: any, index: number) => (
                        <div key={index} className="border-l-4 border-red-400 pl-4">
                          <h4 className="font-medium text-gray-900">{problem.title}</h4>
                          <p className="text-sm text-gray-600 mt-1">{problem.description}</p>
                          {problem.recommendation && (
                            <p className="text-sm text-blue-600 mt-2">
                              <strong>Рекомендація:</strong> {problem.recommendation}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Рекомендації */}
                {aiAnalysis.recommendations && aiAnalysis.recommendations.length > 0 && (
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h3 className="font-semibold text-gray-900 mb-3 flex items-center">
                      <CheckCircle className="h-4 w-4 mr-2 text-green-600" />
                      Рекомендації
                    </h3>
                    <div className="space-y-4">
                      {aiAnalysis.recommendations.map((rec: any, index: number) => (
                        <div key={index} className="border-l-4 border-green-400 pl-4">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium text-gray-900">{rec.title}</h4>
                            <span className={`text-xs px-2 py-1 rounded ${
                              rec.priority === 'high' || rec.priority === 'urgent'
                                ? 'bg-red-100 text-red-700'
                                : rec.priority === 'medium'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}>
                              {rec.priority}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mt-1">{rec.description}</p>
                          {rec.expectedImpact && (
                            <p className="text-xs text-gray-500 mt-2 italic">
                              Очікуваний ефект: {rec.expectedImpact}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* План дій */}
                {aiAnalysis.actionItems && aiAnalysis.actionItems.length > 0 && (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <h3 className="font-semibold text-gray-900 mb-3">План дій</h3>
                    <div className="space-y-3">
                      {aiAnalysis.actionItems.map((item: any, index: number) => (
                        <div key={index} className="flex items-start space-x-3">
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            item.priority === 'urgent' || item.priority === 'high'
                              ? 'bg-red-500 text-white'
                              : item.priority === 'medium'
                              ? 'bg-yellow-500 text-white'
                              : 'bg-green-500 text-white'
                          }`}>
                            {index + 1}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900">{item.title}</h4>
                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                            {item.timeline && (
                              <p className="text-xs text-gray-500 mt-1">⏱️ {item.timeline}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Прогнози */}
                {aiAnalysis.predictions && aiAnalysis.predictions.length > 0 && (
                  <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
                    <h3 className="font-semibold text-gray-900 mb-3">Прогнози</h3>
                    <ul className="list-disc list-inside space-y-1 text-gray-700">
                      {aiAnalysis.predictions.map((prediction: string, index: number) => (
                        <li key={index}>{prediction}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Key Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.totalTickets')}</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900">
                  {analyticsLoading ? '...' : (analyticsData?.overview?.totalTickets || 0)}
                </p>
              </div>
              <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.resolved')}</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">
                  {analyticsLoading ? '...' : getStatusCount('resolved')}
                </p>
              </div>
              <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.highPriority')}</p>
                <p className="text-xl sm:text-2xl font-bold text-red-600">
                  {analyticsLoading ? '...' : getPriorityCount('high')}
                </p>
              </div>
              <Filter className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.activeCities')}</p>
                <p className="text-xl sm:text-2xl font-bold text-purple-600">
                  {analyticsLoading ? '...' : (dashboardData?.topCities?.length || 0)}
                </p>
              </div>
              <MapPin className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Performance Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 lg:gap-6">
        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.averageResolutionTime')}</p>
                <p className="text-xl sm:text-2xl font-bold text-blue-600">
                  {analyticsLoading ? '...' : `${Math.round(analyticsData?.avgResolutionTime || 0)} ${t('analytics.metrics.hours')}`}
                </p>
              </div>
              <Clock className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.activeUsers')}</p>
                <p className="text-xl sm:text-2xl font-bold text-green-600">
                  {analyticsLoading ? '...' : (analyticsData?.overview?.activeUsers || 0)}
                </p>
              </div>
              <Users className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.metrics.resolutionRate')}</p>
                <p className="text-xl sm:text-2xl font-bold text-orange-600">
                  {analyticsLoading ? '...' : (() => {
                    const total = analyticsData?.overview?.totalTickets || 0;
                    const resolved = getStatusCount('resolved');
                    return total > 0 ? `${Math.round((resolved / total) * 100)}%` : '0%';
                  })()}
                </p>
              </div>
              <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* User Registration Statistics */}
      <div className="space-y-4 sm:space-y-6">
        <h2 className="text-lg sm:text-xl font-semibold text-gray-900 flex items-center">
          <Users className="h-5 w-5 sm:h-6 sm:w-6 mr-2 text-blue-500" />
          {t('analytics.userRegistration.title')}
        </h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.userRegistration.totalUsers')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-blue-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.totalUsers || 0)}
                  </p>
                </div>
                <Users className="h-6 w-6 sm:h-8 sm:w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.userRegistration.newIn30Days')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.growthRates?.last30Days || 0)}
                  </p>
                </div>
                <TrendingUp className="h-6 w-6 sm:h-8 sm:w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.userRegistration.newIn7Days')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-purple-600">
                    {userStatsLoading ? '...' : (userStats?.summary?.growthRates?.last7Days || 0)}
                  </p>
                </div>
                <Activity className="h-6 w-6 sm:h-8 sm:w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs sm:text-sm font-medium text-gray-600">{t('analytics.userRegistration.activeSources')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-orange-600">
                    {userStatsLoading ? '...' : (userStats?.registrationSources?.length || 0)}
                  </p>
                </div>
                <BarChart3 className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* User Registration Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Registration Sources Chart */}
          <Card>
            <CardHeader className="p-3 sm:p-4 lg:p-6">
              <h3 className="text-base sm:text-lg font-semibold flex items-center">
                <PieChart className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-blue-500" />
                {t('analytics.userRegistration.registrationSources')}
              </h3>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              {userStatsLoading ? (
                <div className="flex justify-center items-center h-48 sm:h-64">
                  <LoadingSpinner />
                </div>
              ) : userStats?.registrationSources && userStats.registrationSources.length > 0 ? (
                <div className="h-48 sm:h-64">
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
                            padding: 10,
                            usePointStyle: true,
                            font: {
                              size: isMobile ? 10 : 12
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex justify-center items-center h-48 sm:h-64 text-gray-500">
                  {t('analytics.noData')}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Registration Status Chart */}
          <Card>
            <CardHeader className="p-3 sm:p-4 lg:p-6">
              <h3 className="text-base sm:text-lg font-semibold flex items-center">
                <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-green-500" />
                {t('analytics.charts.registrationStatuses')}
              </h3>
            </CardHeader>
            <CardContent className="p-3 sm:p-4 lg:p-6">
              {userStatsLoading ? (
                <div className="flex justify-center items-center h-48 sm:h-64">
                  <LoadingSpinner />
                </div>
              ) : userStats?.registrationStatuses && userStats.registrationStatuses.length > 0 ? (
                <div className="h-48 sm:h-64">
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
                            stepSize: 1,
                            font: {
                              size: isMobile ? 10 : 12
                            }
                          }
                        },
                        x: {
                          ticks: {
                            font: {
                              size: isMobile ? 10 : 12
                            }
                          }
                        }
                      }
                    }}
                  />
                </div>
              ) : (
                <div className="flex justify-center items-center h-48 sm:h-64 text-gray-500">
                  {t('analytics.noData')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Daily Registrations Chart */}
        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
              <h3 className="text-base sm:text-lg font-semibold flex items-center">
                <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mr-2 text-purple-500" />
                {t('analytics.userRegistration.dailyRegistrations')}
              </h3>
            </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            {userStatsLoading ? (
              <div className="flex justify-center items-center h-48 sm:h-64">
                <LoadingSpinner />
              </div>
            ) : userStats?.dailyStats && userStats.dailyStats.length > 0 ? (
              <div className="h-48 sm:h-64">
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
                      pointRadius: isMobile ? 3 : 4
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
                          stepSize: 1,
                          font: {
                            size: isMobile ? 10 : 12
                          }
                        }
                      },
                      x: {
                        grid: {
                          display: false
                        },
                        ticks: {
                          font: {
                            size: isMobile ? 10 : 12
                          }
                        }
                      }
                    }
                  }}
                />
              </div>
            ) : (
              <div className="flex justify-center items-center h-48 sm:h-64 text-gray-500">
                {t('analytics.noData')}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        {/* Status Distribution */}
        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
            <h3 className="text-base sm:text-lg font-semibold flex items-center">
              <PieChart className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              {t('analytics.charts.statusDistribution')}
            </h3>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="h-64 sm:h-80">
              <Pie data={statusData} options={statusChartOptions} />
            </div>
          </CardContent>
        </Card>

        {/* Priority Distribution */}
        <Card>
          <CardHeader className="p-3 sm:p-4 lg:p-6">
            <h3 className="text-base sm:text-lg font-semibold flex items-center">
              <BarChart3 className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              {t('analytics.charts.priorityDistribution')}
            </h3>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 lg:p-6">
            <div className="h-64 sm:h-80">
              <Bar data={priorityData} options={priorityChartOptions} />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cities Statistics */}
      <Card>
        <CardHeader className="p-3 sm:p-4 lg:p-6">
          <h3 className="text-base sm:text-lg font-semibold flex items-center">
            <MapPin className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
            {t('analytics.charts.cityStatistics')}
          </h3>
        </CardHeader>
        <CardContent className="p-2 sm:p-4 lg:p-6">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-500">{t('analytics.table.city')}</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-500">{t('analytics.table.totalTickets')}</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-500">{t('analytics.table.resolved')}</th>
                  <th className="px-2 sm:px-4 py-2 text-left text-xs sm:text-sm font-medium text-gray-500">{t('analytics.table.resolutionRate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {cityStats.slice(0, 10).map((city, index) => (
                  <tr key={`city-${index}-${city.name}`}>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm font-medium text-gray-900">{city.name}</td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-500">{city.count}</td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-500">{city.resolved}</td>
                    <td className="px-2 sm:px-4 py-2 text-xs sm:text-sm text-gray-500">
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
        <CardHeader className="p-3 sm:p-4 lg:p-6">
          <h3 className="text-base sm:text-lg font-semibold flex items-center">
              <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 mr-2" />
              {t('analytics.charts.timeTrend')}
            </h3>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 lg:p-6">
          <div className="h-64 sm:h-80">
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
    </div>
  );
};

export default Analytics;