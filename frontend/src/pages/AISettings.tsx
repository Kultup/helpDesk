import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles, Save, Eye, EyeOff, CheckCircle, XCircle, Info } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface AISettingsData {
  provider: 'groq' | 'openai';
  groqApiKey: string;
  openaiApiKey: string;
  groqModel: string;
  openaiModel: string;
  enabled: boolean;
  hasGroqKey?: boolean;
  hasOpenaiKey?: boolean;
}

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-8b-instant',
  'llama3-70b-8192',
  'mixtral-8x7b-32768'
];

const OPENAI_MODELS = [
  'gpt-4o-mini',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-3.5-turbo'
];

const AISettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getAiSettings();
      if (response.success && response.data) {
        const data = response.data as AISettingsData & { hasGroqKey?: boolean; hasOpenaiKey?: boolean };
        setSettings({
          provider: data.provider || 'groq',
          groqApiKey: data.hasGroqKey ? '••••••••••••' : '',
          openaiApiKey: data.hasOpenaiKey ? '••••••••••••' : '',
          groqModel: data.groqModel || 'llama-3.3-70b-versatile',
          openaiModel: data.openaiModel || 'gpt-4o-mini',
          enabled: !!data.enabled
        });
      }
    } catch (error: unknown) {
      console.error('Помилка завантаження налаштувань AI:', error);
      setMessage({
        type: 'error',
        text: (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Помилка завантаження налаштувань AI'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    try {
      setIsSaving(true);
      setMessage(null);

      const payload: Record<string, unknown> = {
        provider: settings.provider,
        groqModel: settings.groqModel,
        openaiModel: settings.openaiModel,
        enabled: settings.enabled
      };
      if (settings.groqApiKey && !settings.groqApiKey.startsWith('••')) {
        payload.groqApiKey = settings.groqApiKey;
      }
      if (settings.openaiApiKey && !settings.openaiApiKey.startsWith('••')) {
        payload.openaiApiKey = settings.openaiApiKey;
      }

      const response = await apiService.updateAiSettings(payload);

      if (response.success) {
        setMessage({
          type: 'success',
          text: t('settings.ai.saved', 'Налаштування AI збережено')
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: (response as { message?: string }).message || 'Помилка збереження'
        });
      }
    } catch (error: unknown) {
      console.error('Помилка збереження налаштувань AI:', error);
      setMessage({
        type: 'error',
        text: (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Помилка збереження налаштувань AI'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof AISettingsData, value: string | boolean) => {
    if (settings) {
      setSettings({
        ...settings,
        [field]: value
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <LoadingSpinner />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-4 text-red-600">
        {t('settings.ai.loadError', 'Не вдалося завантажити налаштування AI.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Sparkles className="h-8 w-8 text-violet-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.ai.title', 'Налаштування AI')}
          </h1>
        </div>
      </div>

      {message && (
        <div
          className={`p-4 rounded-md flex items-center space-x-2 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5 flex-shrink-0" />
          ) : (
            <XCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold flex items-center space-x-2">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <span>{t('settings.ai.firstLine', 'AI перша лінія (Telegram бот)')}</span>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {t('settings.ai.description', 'Збір інформації та створення тікетів через діалог з AI. Підтримуються Groq (безкоштовно) та OpenAI (ChatGPT).')}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="aiEnabled"
              checked={settings.enabled}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
            />
            <label htmlFor="aiEnabled" className="text-sm font-medium text-gray-700">
              {t('settings.ai.enabled', 'Увімкнути AI першу лінію в Telegram боті')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.ai.provider', 'Провайдер')}
            </label>
            <select
              value={settings.provider}
              onChange={(e) => handleChange('provider', e.target.value as 'groq' | 'openai')}
              className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
            >
              <option value="groq">Groq (швидко, безкоштовно)</option>
              <option value="openai">OpenAI (ChatGPT, платно)</option>
            </select>
          </div>

          {settings.provider === 'groq' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Groq API Key
                </label>
                <div className="relative">
                  <Input
                    type={showGroqKey ? 'text' : 'password'}
                    value={settings.groqApiKey}
                    onChange={(e) => handleChange('groqApiKey', e.target.value)}
                    placeholder="gsk_..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowGroqKey(!showGroqKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showGroqKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  <a
                    href="https://console.groq.com/keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline"
                  >
                    console.groq.com/keys
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Groq модель
                </label>
                <select
                  value={settings.groqModel}
                  onChange={(e) => handleChange('groqModel', e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                >
                  {GROQ_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {settings.provider === 'openai' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OpenAI API Key
                </label>
                <div className="relative">
                  <Input
                    type={showOpenaiKey ? 'text' : 'password'}
                    value={settings.openaiApiKey}
                    onChange={(e) => handleChange('openaiApiKey', e.target.value)}
                    placeholder="sk-..."
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showOpenaiKey ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline"
                  >
                    platform.openai.com/api-keys
                  </a>
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  OpenAI модель
                </label>
                <select
                  value={settings.openaiModel}
                  onChange={(e) => handleChange('openaiModel', e.target.value)}
                  className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                >
                  {OPENAI_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex justify-end pt-4">
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
    </div>
  );
};

export default AISettings;
