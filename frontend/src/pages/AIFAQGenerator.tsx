import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Download, Calendar, FileText, Save, CheckCircle, XCircle, Tag, TrendingUp } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';
import { formatDateWithLocale } from '../utils';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  tags: string[];
  frequency: number;
  examples: string[];
  priority: string;
}

interface FAQResult {
  faqItems: FAQItem[];
  summary: string;
  totalQuestions: number;
  categories: string[];
  savedArticles?: string[];
  analyzedTickets: number;
}

const AIFAQGenerator: React.FC = () => {
  const { t } = useTranslation();
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // Останні 90 днів
    end: new Date().toISOString().split('T')[0]
  });
  const [minFrequency, setMinFrequency] = useState(2);
  const [maxItems, setMaxItems] = useState(20);
  const [autoSave, setAutoSave] = useState(false);
  const [faqResult, setFaqResult] = useState<FAQResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  const handleGenerateFAQ = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      setFaqResult(null);
      setExpandedItems(new Set());

      const response = await apiService.generateFAQ(
        dateRange.start,
        dateRange.end,
        minFrequency,
        maxItems,
        autoSave
      );

      if (response.success && response.data) {
        setFaqResult(response.data);
        // Розгортаємо перші 3 елементи
        if (response.data?.faqItems && Array.isArray(response.data.faqItems)) {
          const initialExpanded = new Set([0, 1, 2].filter(i => i < response.data.faqItems.length));
          setExpandedItems(initialExpanded);
        }
      } else {
        setError(response.message || 'Не вдалося згенерувати FAQ');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Помилка генерації FAQ');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleItem = (index: number) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleDownloadFAQ = () => {
    if (!faqResult) return;

    const faqText = `FAQ - Часті питання\n` +
      `Період: ${formatDateWithLocale(dateRange.start, { year: 'numeric', month: 'long', day: 'numeric' })} - ${formatDateWithLocale(dateRange.end, { year: 'numeric', month: 'long', day: 'numeric' })}\n` +
      `Всього питань: ${faqResult.totalQuestions}\n` +
      `Проаналізовано заявок: ${faqResult.analyzedTickets}\n\n` +
      `${faqResult.summary}\n\n` +
      `---\n\n` +
      faqResult.faqItems.map((item, index) => 
        `${index + 1}. ${item.question}\n\n${item.answer}\n\n` +
        `Категорія: ${item.category}\n` +
        `Частота: ${item.frequency} заявок\n` +
        `Теги: ${item.tags.join(', ')}\n` +
        (item.examples.length > 0 ? `\nПриклади:\n${item.examples.map((ex, i) => `  ${i + 1}. ${ex}`).join('\n')}\n` : '') +
        `\n---\n`
      ).join('\n');

    const blob = new Blob([faqText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `faq-${dateRange.start}-${dateRange.end}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-600 bg-red-50';
      case 'medium':
        return 'text-yellow-600 bg-yellow-50';
      case 'low':
        return 'text-green-600 bg-green-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center">
            <Sparkles className="h-6 w-6 mr-2 text-purple-600" />
            Генерація FAQ
          </h1>
          <p className="text-gray-600 mt-1">
            Автоматичне створення FAQ статей на основі аналізу вирішених заявок
          </p>
        </div>
      </div>

      {/* Налаштування генерації */}
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-gray-900">Параметри генерації</h2>
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Мінімальна частота
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={minFrequency}
                onChange={(e) => setMinFrequency(parseInt(e.target.value) || 2)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Мінімальна кількість подібних заявок для включення в FAQ
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Максимум питань
              </label>
              <input
                type="number"
                min="5"
                max="50"
                value={maxItems}
                onChange={(e) => setMaxItems(parseInt(e.target.value) || 20)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Максимальна кількість FAQ статей
              </p>
            </div>
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  className="mr-2 w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                />
                <span className="text-sm font-medium text-gray-700">
                  Автоматично зберегти в базу знань
                </span>
              </label>
            </div>
          </div>

          <Button
            onClick={handleGenerateFAQ}
            isLoading={isGenerating}
            disabled={isGenerating}
            className="w-full md:w-auto"
            variant="primary"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? 'Генеруємо FAQ...' : 'Згенерувати FAQ'}
          </Button>
        </CardContent>
      </Card>

      {/* Помилка */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent>
            <div className="flex items-center text-red-700">
              <XCircle className="h-5 w-5 mr-2" />
              <span>{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Результати */}
      {faqResult && (
        <>
          {/* Статистика */}
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Всього FAQ</p>
                  <p className="text-2xl font-bold text-purple-600">{faqResult.totalQuestions}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Проаналізовано заявок</p>
                  <p className="text-2xl font-bold text-purple-600">{faqResult.analyzedTickets}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Категорій</p>
                  <p className="text-2xl font-bold text-purple-600">{faqResult.categories.length}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Збережено</p>
                  <p className="text-2xl font-bold text-green-600">
                    {faqResult.savedArticles ? faqResult.savedArticles.length : 0}
                  </p>
                </div>
              </div>
              {faqResult.summary && (
                <div className="mt-4 pt-4 border-t border-purple-200">
                  <p className="text-sm text-gray-700">{faqResult.summary}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Категорії */}
          {faqResult.categories.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900">Категорії</h3>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {faqResult.categories.map((category, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium"
                    >
                      {category}
                    </span>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* FAQ статті */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Згенеровані FAQ статті</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadFAQ}
                >
                  <Download className="h-4 w-4 mr-1" />
                  Завантажити
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {faqResult.faqItems.map((item, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div
                      className="p-4 bg-gray-50 cursor-pointer"
                      onClick={() => toggleItem(index)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium text-gray-500">
                              #{index + 1}
                            </span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getPriorityColor(item.priority)}`}>
                              {item.priority === 'high' ? 'Високий' : item.priority === 'medium' ? 'Середній' : 'Низький'}
                            </span>
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                              {item.category}
                            </span>
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium flex items-center">
                              <TrendingUp className="h-3 w-3 mr-1" />
                              {item.frequency} разів
                            </span>
                          </div>
                          <h4 className="text-lg font-semibold text-gray-900">
                            {item.question}
                          </h4>
                        </div>
                        <div className="ml-4">
                          {expandedItems.has(index) ? (
                            <span className="text-gray-500">▼</span>
                          ) : (
                            <span className="text-gray-500">▶</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {expandedItems.has(index) && (
                      <div className="p-4 bg-white border-t border-gray-200">
                        <div className="prose max-w-none">
                          <p className="text-gray-700 whitespace-pre-wrap mb-4">
                            {item.answer}
                          </p>
                        </div>
                        {item.tags.length > 0 && (
                          <div className="mb-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Tag className="h-4 w-4 text-gray-500" />
                              <span className="text-sm font-medium text-gray-700">Теги:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {item.tags.map((tag, tagIndex) => (
                                <span
                                  key={tagIndex}
                                  className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {item.examples.length > 0 && (
                          <div>
                            <p className="text-sm font-medium text-gray-700 mb-2">Приклади заявок:</p>
                            <ul className="list-disc list-inside space-y-1 text-sm text-gray-600">
                              {item.examples.map((example, exIndex) => (
                                <li key={exIndex}>{example}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Повідомлення про збереження */}
          {faqResult.savedArticles && faqResult.savedArticles.length > 0 && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="p-4">
                <div className="flex items-center text-green-700">
                  <CheckCircle className="h-5 w-5 mr-2" />
                  <span>
                    Успішно збережено {faqResult.savedArticles.length} FAQ статей в базу знань (статус: чернетка)
                  </span>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Інформація */}
      {!faqResult && !isGenerating && (
        <Card>
          <CardContent>
            <div className="text-center py-8">
              <Sparkles className="h-12 w-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Генерація FAQ статей
              </h3>
              <p className="text-gray-600 max-w-md mx-auto">
                AI проаналізує вирішені заявки з коментарями та автоматично створить FAQ статті з найчастішими питаннями та відповідями.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AIFAQGenerator;

