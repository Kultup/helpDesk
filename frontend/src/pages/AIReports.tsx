import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Download, Calendar, FileText, RefreshCw } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { formatDateWithLocale } from '../utils';

const AIReports: React.FC = () => {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [reportType, setReportType] = useState<'general' | 'weekly' | 'monthly' | 'detailed'>('general');
  const [report, setReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportMeta, setReportMeta] = useState<any>(null);

  const handleGenerateReport = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setReport(null);
      setReportMeta(null);

      const response = await apiService.generateAIReport(
        dateRange.start,
        dateRange.end,
        reportType
      );

      if (response.success && response.data) {
        setReport(response.data.report);
        setReportMeta(response.data);
      } else {
        setError(response.message || 'Не вдалося згенерувати звіт');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Помилка генерації звіту');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadReport = () => {
    if (!report) return;

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ai-report-${reportType}-${dateRange.start}-${dateRange.end}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyReport = async () => {
    if (!report) return;

    try {
      await navigator.clipboard.writeText(report);
      // Можна додати toast notification
    } catch (err) {
      console.error('Помилка копіювання:', err);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Sparkles className="h-6 w-6 mr-2 text-purple-600" />
            AI Звіти
          </h1>
          <p className="text-gray-600 mt-1">
            Автоматична генерація детальних звітів на основі аналізу заявок
          </p>
        </div>
      </div>

      {/* Налаштування звіту */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Параметри звіту</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Дата початку
              </label>
              <input
                type="date"
                value={dateRange.start}
                onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <Calendar className="h-4 w-4 inline mr-1" />
                Дата кінця
              </label>
              <input
                type="date"
                value={dateRange.end}
                onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <FileText className="h-4 w-4 inline mr-1" />
              Тип звіту
            </label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="general">Загальний звіт</option>
              <option value="weekly">Тижневий звіт</option>
              <option value="monthly">Місячний звіт</option>
              <option value="detailed">Детальний звіт</option>
            </select>
          </div>

          <Button
            onClick={handleGenerateReport}
            isLoading={isGenerating}
            disabled={isGenerating}
            className="w-full md:w-auto"
            variant="primary"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? 'Генеруємо звіт...' : 'Згенерувати звіт'}
          </Button>
        </CardContent>
      </Card>

      {/* Помилка */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent>
            <div className="flex items-center text-red-700">
              <span className="mr-2">❌</span>
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Згенерований звіт */}
      {report && (
        <Card className="border-2 border-purple-200">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-purple-600" />
                  Згенерований звіт
                </h2>
                {reportMeta && (
                  <p className="text-sm text-gray-600 mt-1">
                    Період: {formatDateWithLocale(reportMeta.period.start || '', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })} - {formatDateWithLocale(reportMeta.period.end || '', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                    {' | '}
                    Проаналізовано: {reportMeta.statistics.analyzedTickets} заявок з {reportMeta.statistics.totalTickets}
                  </p>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopyReport}
                >
                  Копіювати
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadReport}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Завантажити
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="bg-white rounded-lg p-6 border border-gray-200">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 font-sans leading-relaxed">
                {report}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Інформація */}
      {!report && !isGenerating && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Генерація AI звітів
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                Виберіть період та тип звіту, натисніть "Згенерувати звіт" для створення детального текстового звіту на основі аналізу заявок системи.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIReports;

