import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Sparkles,
  Save,
  Eye,
  EyeOff,
  CheckCircle,
  XCircle,
  Info,
  Bot,
  Cloud,
  Zap,
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

type AIProvider = 'openai' | 'gemini' | 'groq';

interface AISettingsData {
  provider: AIProvider;
  openaiApiKey: string;
  geminiApiKey: string;
  groqApiKey: string;
  openaiModel: string;
  geminiModel: string;
  groqModel: string;
  enabled: boolean;
  monthlyTokenLimit?: number;
  topUpAmount?: number;
  remainingBalance?: number;
  hasOpenaiKey?: boolean;
  hasGeminiKey?: boolean;
  hasGroqKey?: boolean;
}

const OPENAI_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'];

const GEMINI_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro'];

const GROQ_MODELS = [
  'llama-3.3-70b-versatile',
  'llama-3.1-70b-versatile',
  'llama-3.1-8b-instant',
  'mixtral-8x7b-32768',
];

const PROVIDER_INFO: Record<
  AIProvider,
  { name: string; icon: React.ReactNode; color: string; keyPlaceholder: string; modelLabel: string }
> = {
  openai: {
    name: 'OpenAI',
    icon: <Cloud className="h-5 w-5" />,
    color: 'text-green-600',
    keyPlaceholder: 'sk-...',
    modelLabel: 'OpenAI модель',
  },
  gemini: {
    name: 'Google Gemini',
    icon: <Sparkles className="h-5 w-5" />,
    color: 'text-blue-600',
    keyPlaceholder: 'AIza...',
    modelLabel: 'Gemini модель',
  },
  groq: {
    name: 'Groq',
    icon: <Zap className="h-5 w-5" />,
    color: 'text-orange-600',
    keyPlaceholder: 'gsk_...',
    modelLabel: 'Groq модель',
  },
};

interface AISettingsProps {
  embedded?: boolean;
}

const AISettings: React.FC<AISettingsProps> = ({ embedded = false }) => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<AISettingsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showKeys, setShowKeys] = useState({ openai: false, gemini: false, groq: false });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getAiSettings();
      if (response.success && response.data) {
        const data = response.data as unknown as AISettingsData;
        setSettings({
          provider: data.provider || 'openai',
          openaiApiKey: data.hasOpenaiKey ? '••••••••••••' : '',
          geminiApiKey: data.hasGeminiKey ? '••••••••••••' : '',
          groqApiKey: data.hasGroqKey ? '••••••••••••' : '',
          openaiModel: data.openaiModel || 'gpt-4o-mini',
          geminiModel: data.geminiModel || 'gemini-1.5-flash',
          groqModel: data.groqModel || 'llama-3.3-70b-versatile',
          enabled: !!data.enabled,
          monthlyTokenLimit:
            typeof data.monthlyTokenLimit === 'number' ? data.monthlyTokenLimit : 0,
          topUpAmount: typeof data.topUpAmount === 'number' ? data.topUpAmount : 0,
          remainingBalance: typeof data.remainingBalance === 'number' ? data.remainingBalance : 0,
        });
      }
    } catch (error: unknown) {
      console.error('Помилка завантаження налаштувань AI:', error);
      setMessage({
        type: 'error',
        text:
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Помилка завантаження налаштувань AI',
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
        openaiModel: settings.openaiModel,
        geminiModel: settings.geminiModel,
        groqModel: settings.groqModel,
        enabled: settings.enabled,
        monthlyTokenLimit: settings.monthlyTokenLimit ?? 0,
        topUpAmount: settings.topUpAmount ?? 0,
        remainingBalance: settings.remainingBalance ?? 0,
      };
      if (settings.openaiApiKey && !settings.openaiApiKey.startsWith('••')) {
        payload.openaiApiKey = settings.openaiApiKey;
      }
      if (settings.geminiApiKey && !settings.geminiApiKey.startsWith('••')) {
        payload.geminiApiKey = settings.geminiApiKey;
      }
      if (settings.groqApiKey && !settings.groqApiKey.startsWith('••')) {
        payload.groqApiKey = settings.groqApiKey;
      }

      const response = await apiService.updateAiSettings(payload);

      if (response.success) {
        setMessage({
          type: 'success',
          text: t('settings.ai.saved', 'Налаштування AI збережено'),
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: (response as { message?: string }).message || 'Помилка збереження',
        });
      }
    } catch (error: unknown) {
      console.error('Помилка збереження налаштувань AI:', error);
      setMessage({
        type: 'error',
        text:
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          'Помилка збереження налаштувань AI',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleChange = (field: keyof AISettingsData, value: string | boolean | number) => {
    if (settings) {
      setSettings({
        ...settings,
        [field]: value,
      });
    }
  };

  const toggleKeyVisibility = (provider: 'openai' | 'gemini' | 'groq') => {
    setShowKeys(prev => ({ ...prev, [provider]: !prev[provider] }));
  };

  const getCurrentKey = (): string => {
    if (!settings) return '';
    switch (settings.provider) {
      case 'openai':
        return settings.openaiApiKey;
      case 'gemini':
        return settings.geminiApiKey;
      case 'groq':
        return settings.groqApiKey;
      default:
        return '';
    }
  };

  const getCurrentModel = (): string => {
    if (!settings) return '';
    switch (settings.provider) {
      case 'openai':
        return settings.openaiModel;
      case 'gemini':
        return settings.geminiModel;
      case 'groq':
        return settings.groqModel;
      default:
        return '';
    }
  };

  const getModelsForProvider = (): string[] => {
    if (!settings) return [];
    switch (settings.provider) {
      case 'openai':
        return OPENAI_MODELS;
      case 'gemini':
        return GEMINI_MODELS;
      case 'groq':
        return GROQ_MODELS;
      default:
        return [];
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
      <div className="space-y-4 p-4">
        <div className="text-red-600">
          {t('settings.ai.loadError', 'Не вдалося завантажити налаштування AI.')}
        </div>
        {message && (
          <div className="p-4 rounded-md bg-red-50 text-red-800 border border-red-200 flex items-center space-x-2">
            <XCircle className="h-5 w-5 flex-shrink-0" />
            <span>{message.text}</span>
          </div>
        )}
        <p className="text-sm text-gray-600">
          {t(
            'settings.ai.loadErrorHint',
            'Переконайтеся, що ви ввійшли як адміністратор. Якщо помилка повторюється — перезайдіть у систему або зверніться до адміністратора.'
          )}
        </p>
        <Button
          onClick={() => {
            setMessage(null);
            loadSettings();
          }}
          variant="outline"
        >
          {t('common.retry', 'Повторити')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!embedded && (
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Sparkles className="h-8 w-8 text-violet-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              {t('settings.ai.title', 'Налаштування AI')}
            </h1>
          </div>
        </div>
      )}

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
            <Bot className="h-5 w-5 text-violet-600" />
            <span>{t('settings.ai.firstLine', 'AI перша лінія (Telegram бот)')}</span>
          </h2>
          <p className="text-sm text-gray-600 mt-1">
            {t(
              'settings.ai.description',
              'Збір інформації та створення тікетів через діалог з AI.'
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="aiEnabled"
              checked={settings.enabled}
              onChange={e => handleChange('enabled', e.target.checked)}
              className="h-4 w-4 text-violet-600 focus:ring-violet-500 border-gray-300 rounded"
            />
            <label htmlFor="aiEnabled" className="text-sm font-medium text-gray-700">
              {t('settings.ai.enabled', 'Увімкнути AI першу лінію в Telegram боті')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">AI Провайдер</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {(['openai', 'gemini', 'groq'] as AIProvider[]).map(provider => {
                const info = PROVIDER_INFO[provider];
                const isSelected = settings.provider === provider;
                return (
                  <button
                    key={provider}
                    type="button"
                    onClick={() => handleChange('provider', provider)}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      isSelected
                        ? `border-violet-500 bg-violet-50 ${info.color}`
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      {info.icon}
                      <span className="font-medium">{info.name}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center space-x-2 mb-4">
              {PROVIDER_INFO[settings.provider].icon}
              <h3 className="font-semibold text-gray-800">
                {PROVIDER_INFO[settings.provider].name} - Налаштування
              </h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {settings.provider === 'openai'
                    ? 'OpenAI'
                    : settings.provider === 'gemini'
                      ? 'Google'
                      : 'Groq'}{' '}
                  API Key
                </label>
                <div className="relative">
                  <Input
                    type={showKeys[settings.provider] ? 'text' : 'password'}
                    value={getCurrentKey()}
                    onChange={e =>
                      handleChange(
                        settings.provider === 'openai'
                          ? 'openaiApiKey'
                          : settings.provider === 'gemini'
                            ? 'geminiApiKey'
                            : 'groqApiKey',
                        e.target.value
                      )
                    }
                    placeholder={PROVIDER_INFO[settings.provider].keyPlaceholder}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => toggleKeyVisibility(settings.provider)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showKeys[settings.provider] ? (
                      <EyeOff className="h-5 w-5" />
                    ) : (
                      <Eye className="h-5 w-5" />
                    )}
                  </button>
                </div>
                <p className="mt-1 text-sm text-gray-500 flex items-center gap-1">
                  <Info className="h-4 w-4" />
                  <a
                    href={
                      settings.provider === 'openai'
                        ? 'https://platform.openai.com/api-keys'
                        : settings.provider === 'gemini'
                          ? 'https://makersuite.google.com/app/apikey'
                          : 'https://console.groq.com/keys'
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-violet-600 hover:underline"
                  >
                    {settings.provider === 'openai'
                      ? 'platform.openai.com/api-keys'
                      : settings.provider === 'gemini'
                        ? 'makersuite.google.com/app/apikey'
                        : 'console.groq.com/keys'}
                  </a>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  {PROVIDER_INFO[settings.provider].modelLabel}
                </label>
                <select
                  value={getCurrentModel()}
                  onChange={e =>
                    handleChange(
                      settings.provider === 'openai'
                        ? 'openaiModel'
                        : settings.provider === 'gemini'
                          ? 'geminiModel'
                          : 'groqModel',
                      e.target.value
                    )
                  }
                  className="block w-full rounded-md border border-gray-300 bg-white py-2 px-3 shadow-sm focus:border-violet-500 focus:ring-violet-500 sm:text-sm"
                >
                  {getModelsForProvider().map(model => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Місячний ліміт токенів (0 = без ліміту)
            </label>
            <Input
              type="number"
              min={0}
              value={settings.monthlyTokenLimit ?? 0}
              onChange={e =>
                handleChange(
                  'monthlyTokenLimit',
                  e.target.value === '' ? 0 : parseInt(e.target.value, 10) || 0
                )
              }
              placeholder="0"
            />
            <p className="mt-1 text-sm text-gray-500">
              У боті (кнопка «Перевірити токени AI») буде показано, скільки залишилось по квоті.
            </p>
          </div>

          {settings.provider === 'openai' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Сума поповнення (USD)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settings.topUpAmount ?? 0}
                  onChange={e =>
                    handleChange(
                      'topUpAmount',
                      e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="0"
                />
                <p className="mt-1 text-sm text-gray-500">
                  На яку суму поповнювали рахунок OpenAI (для контролю).
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Залишок по сумі (USD)
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={settings.remainingBalance ?? 0}
                  onChange={e =>
                    handleChange(
                      'remainingBalance',
                      e.target.value === '' ? 0 : parseFloat(e.target.value) || 0
                    )
                  }
                  placeholder="0"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Скільки залишилось на рахунку. Можна оновити кнопкою нижче або вручну.
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-4">
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2"
            >
              <Save className="h-4 w-4" />
              <span>
                {isSaving ? t('common.saving', 'Збереження...') : t('common.save', 'Зберегти')}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AISettings;
