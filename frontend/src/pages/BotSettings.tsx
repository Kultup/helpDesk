import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Save, Eye, EyeOff, CheckCircle, XCircle, Sparkles, Trash2 } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface BotSettings {
  groqApiKey: string;
  groqModel: string;
  aiEnabled: boolean;
  aiSystemPrompt: string;
  hasGroqApiKey: boolean;
  aiPrompts?: {
    intentAnalysis?: string;
    questionGeneration?: string;
    ticketAnalysis?: string;
  };
}

const BotSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<BotSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [originalApiKey, setOriginalApiKey] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await apiService.getBotSettings();
      if (response.success && response.data) {
        const data = response.data as unknown as BotSettings;
        setSettings(data);
        setOriginalApiKey(data.groqApiKey || '');
      }
    } catch (error) {
      console.error('Помилка завантаження налаштувань бота:', error);
      setMessage({
        type: 'error',
        text: (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Помилка завантаження налаштувань'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async (): Promise<void> => {
    if (!settings) return;

    try {
      setIsSaving(true);
      setMessage(null);

      // Відправляємо API ключ тільки якщо він був змінений
      const apiKeyToSend = settings.groqApiKey !== originalApiKey
        ? settings.groqApiKey
        : undefined;

      const response = await apiService.updateBotSettings({
        groqApiKey: apiKeyToSend,
        groqModel: settings.groqModel,
        aiEnabled: settings.aiEnabled,
        aiSystemPrompt: settings.aiSystemPrompt,
        aiPrompts: settings.aiPrompts
      });

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Налаштування бота успішно збережено'
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка збереження налаштувань'
        });
      }
    } catch (error) {
      console.error('Помилка збереження налаштувань бота:', error);
      setMessage({
        type: 'error',
        text: (error as { response?: { data?: { message?: string } } }).response?.data?.message || 'Помилка збереження налаштувань'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof BotSettings, value: string | boolean): void => {
    if (settings) {
      setSettings({
        ...settings,
        [field]: value
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Sparkles className="h-8 w-8 text-purple-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.bot.title', 'Налаштування AI асистента')}
          </h1>
        </div>
      </div>

      {message && (
        <div className={`p-4 rounded-md flex items-center space-x-2 ${
          message.type === 'success'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <Bot className="h-5 w-5 text-purple-600" />
            <span>{t('settings.bot.groqSettings', 'Налаштування Groq AI')}</span>
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
            <p className="text-sm text-blue-800">
              💡 <strong>Groq</strong> - це швидка AI платформа. Отримайте безкоштовний API ключ на{' '}
              <a
                href="https://console.groq.com/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-blue-900"
              >
                console.groq.com/keys
              </a>
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.bot.groqApiKey', 'Groq API Key')}
            </label>
            <div className="relative">
              <Input
                type={showApiKey ? 'text' : 'password'}
                value={settings?.groqApiKey || ''}
                onChange={(e): void => handleChange('groqApiKey', e.target.value)}
                placeholder="gsk_..."
                className="pr-20"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                <button
                  type="button"
                  onClick={(): void => setShowApiKey(!showApiKey)}
                  className="text-gray-500 hover:text-gray-700"
                  title="Показати/Приховати ключ"
                >
                  {showApiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
                {settings?.hasGroqApiKey && (
                  <button
                    type="button"
                    onClick={(): void => {
                      if (window.confirm('Ви впевнені, що хочете видалити Groq API ключ?')) {
                        handleChange('groqApiKey', '');
                        setShowApiKey(true);
                      }
                    }}
                    className="text-red-500 hover:text-red-700"
                    title="Видалити ключ"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
              </div>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.bot.groqApiKeyDescription', 'API ключ для доступу до Groq AI')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.bot.groqModel', 'Модель AI')}
            </label>
            <select
              value={settings?.groqModel || 'llama-3.3-70b-versatile'}
              onChange={(e): void => handleChange('groqModel', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="llama-3.3-70b-versatile">Llama 3.3 70B (рекомендована, найновіша)</option>
              <option value="llama3-8b-8192">Llama 3 8B (швидка)</option>
              <option value="llama3-70b-8192">Llama 3 70B (потужна)</option>
              <option value="mixtral-8x7b-32768">Mixtral 8x7B (великий контекст)</option>
              <option value="gemma2-9b-it">Gemma 2 9B</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.bot.groqModelDescription', 'Виберіть модель AI для відповідей')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.bot.aiSystemPrompt', 'Системний промпт')}
            </label>
            <textarea
              value={settings?.aiSystemPrompt || ''}
              onChange={(e): void => handleChange('aiSystemPrompt', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500"
              placeholder="Ви - корисний AI асистент служби підтримки..."
            />
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.bot.aiSystemPromptDescription', 'Інструкції для AI, як він повинен відповідати')}
            </p>
          </div>

          <div className="flex items-center space-x-2 p-4 bg-purple-50 border border-purple-200 rounded-md">
            <input
              type="checkbox"
              id="aiEnabled"
              checked={settings?.aiEnabled || false}
              onChange={(e): void => handleChange('aiEnabled', e.target.checked)}
              className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 rounded"
            />
            <label htmlFor="aiEnabled" className="text-sm font-medium text-gray-700">
              {t('settings.bot.aiEnabled', 'Увімкнути AI асистента в Telegram боті')}
            </label>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? t('common.saving', 'Збереження...') : t('common.save', 'Зберегти')}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-purple-600" />
            <span>AI Промпти (розширені налаштування)</span>
          </h2>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              ⚠️ <strong>Увага!</strong> Ці налаштування для досвідчених користувачів. 
              Залиште поля порожніми щоб використовувати дефолтні промпти з коду.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              🎯 Промпт аналізу наміру користувача
            </label>
            <textarea
              value={settings?.aiPrompts?.intentAnalysis || ''}
              onChange={(e): void => {
                if (settings) {
                  setSettings({
                    ...settings,
                    aiPrompts: {
                      ...settings.aiPrompts,
                      intentAnalysis: e.target.value
                    }
                  });
                }
              }}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
              placeholder="Залиште порожнім для використання дефолтного промпту..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Промпт для визначення чи хоче користувач створити тікет
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              💬 Промпт генерації уточнюючих питань
            </label>
            <textarea
              value={settings?.aiPrompts?.questionGeneration || ''}
              onChange={(e): void => {
                if (settings) {
                  setSettings({
                    ...settings,
                    aiPrompts: {
                      ...settings.aiPrompts,
                      questionGeneration: e.target.value
                    }
                  });
                }
              }}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
              placeholder="Залиште порожнім для використання дефолтного промпту..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Промпт для генерації питань під час збору інформації
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              📊 Промпт аналізу тікета та SLA
            </label>
            <textarea
              value={settings?.aiPrompts?.ticketAnalysis || ''}
              onChange={(e): void => {
                if (settings) {
                  setSettings({
                    ...settings,
                    aiPrompts: {
                      ...settings.aiPrompts,
                      ticketAnalysis: e.target.value
                    }
                  });
                }
              }}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-xs"
              placeholder="Залиште порожнім для використання дефолтного промпту..."
            />
            <p className="mt-1 text-sm text-gray-500">
              Промпт для аналізу тікета, рекомендацій та розрахунку SLA
            </p>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>{isSaving ? 'Збереження...' : 'Зберегти промпти'}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t('settings.bot.howItWorks', 'Як це працює?')}
          </h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
              1
            </div>
            <div>
              <p className="text-sm text-gray-700">
                Користувач пише повідомлення в Telegram боті (не команду, не під час створення тікета)
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
              2
            </div>
            <div>
              <p className="text-sm text-gray-700">
                AI асистент автоматично відповідає на питання, використовуючи Groq API
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
              3
            </div>
            <div>
              <p className="text-sm text-gray-700">
                Історія розмови зберігається (останні 10 повідомлень) для контексту
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-sm font-bold">
              4
            </div>
            <div>
              <p className="text-sm text-gray-700">
                Після відповіді показуються кнопки для швидких дій (створити тікет, мої тікети тощо)
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BotSettings;
