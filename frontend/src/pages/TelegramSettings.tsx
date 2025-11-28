import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Bot, Save, Eye, EyeOff, CheckCircle, XCircle, Link, RefreshCw, Info } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface TelegramSettings {
  botToken: string;
  chatId: string;
  webhookUrl: string;
  isEnabled: boolean;
  hasToken: boolean;
}

const TelegramSettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [webhookBaseUrl, setWebhookBaseUrl] = useState('');
  const [isSettingWebhook, setIsSettingWebhook] = useState(false);
  const [isLoadingWebhookInfo, setIsLoadingWebhookInfo] = useState(false);
  const [webhookInfo, setWebhookInfo] = useState<any>(null);

  useEffect(() => {
    loadSettings();
    loadWebhookInfo();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getTelegramSettings();
      if (response.success && response.data) {
        setSettings(response.data as unknown as TelegramSettings);
      }
    } catch (error: any) {
      console.error('Помилка завантаження налаштувань Telegram:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка завантаження налаштувань'
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

      const response = await apiService.updateTelegramSettings({
        botToken: showToken ? settings.botToken : undefined,
        chatId: settings.chatId,
        webhookUrl: settings.webhookUrl,
        isEnabled: settings.isEnabled
      });

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Налаштування Telegram успішно збережено'
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка збереження налаштувань'
        });
      }
    } catch (error: any) {
      console.error('Помилка збереження налаштувань Telegram:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка збереження налаштувань'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const loadWebhookInfo = async () => {
    try {
      setIsLoadingWebhookInfo(true);
      const response = await apiService.getTelegramWebhookInfo();
      if (response.success && response.data) {
        setWebhookInfo(response.data);
      } else {
        // Якщо токен не встановлено, не показуємо помилку
        if (response.message && !response.message.includes('Bot Token не встановлено')) {
          console.warn('Помилка завантаження інформації про webhook:', response.message);
        }
        setWebhookInfo(null);
      }
    } catch (error: any) {
      console.error('Помилка завантаження інформації про webhook:', error);
      // Якщо токен не встановлено, не показуємо помилку
      if (error.response?.data?.message && !error.response.data.message.includes('Bot Token не встановлено')) {
        setMessage({
          type: 'error',
          text: error.response.data.message || 'Помилка завантаження інформації про webhook'
        });
      }
      setWebhookInfo(null);
    } finally {
      setIsLoadingWebhookInfo(false);
    }
  };

  const handleSetupWebhook = async () => {
    if (!webhookBaseUrl.trim()) {
      setMessage({
        type: 'error',
        text: 'Введіть URL сервера'
      });
      return;
    }

    try {
      setIsSettingWebhook(true);
      setMessage(null);

      const response = await apiService.setupTelegramWebhook(webhookBaseUrl.trim());

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Webhook успішно налаштовано!'
        });
        if (settings) {
          const data = response.data as { webhookUrl?: string };
          setSettings({
            ...settings,
            webhookUrl: data.webhookUrl || settings.webhookUrl
          });
        }
        await loadWebhookInfo();
        setWebhookBaseUrl('');
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка налаштування webhook'
        });
      }
    } catch (error: any) {
      console.error('Помилка налаштування webhook:', error);
      console.error('Деталі помилки:', error.response?.data);
      
      let errorMessage = 'Помилка налаштування webhook';
      if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.response?.data?.error) {
        errorMessage = typeof error.response.data.error === 'string' 
          ? error.response.data.error 
          : 'Помилка налаштування webhook';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setMessage({
        type: 'error',
        text: errorMessage
      });
    } finally {
      setIsSettingWebhook(false);
    }
  };

  const handleChange = (field: keyof TelegramSettings, value: any) => {
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
          <Bot className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.telegram.title', 'Налаштування Telegram бота')}
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
          <h2 className="text-lg font-semibold">
            {t('settings.telegram.botSettings', 'Налаштування бота')}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.telegram.botToken', 'Bot Token')}
            </label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                value={settings?.botToken || ''}
                onChange={(e) => handleChange('botToken', e.target.value)}
                placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showToken ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.telegram.botTokenDescription', 'Отримайте токен від @BotFather в Telegram')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.telegram.chatId', 'Chat ID')}
            </label>
            <Input
              type="text"
              value={settings?.chatId || ''}
              onChange={(e) => handleChange('chatId', e.target.value)}
              placeholder="-1001234567890"
            />
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.telegram.chatIdDescription', 'ID чату для відправки сповіщень (опціонально)')}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.telegram.webhookUrl', 'Webhook URL')}
            </label>
            <Input
              type="text"
              value={settings?.webhookUrl || ''}
              onChange={(e) => handleChange('webhookUrl', e.target.value)}
              placeholder="https://your-domain.com/api/telegram/webhook"
            />
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.telegram.webhookUrlDescription', 'URL для webhook (налаштовується автоматично при використанні ngrok)')}
            </p>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="isEnabled"
              checked={settings?.isEnabled || false}
              onChange={(e) => handleChange('isEnabled', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="isEnabled" className="text-sm font-medium text-gray-700">
              {t('settings.telegram.enabled', 'Увімкнути Telegram бота')}
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">
              {t('settings.telegram.webhookSettings', 'Налаштування Webhook')}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={loadWebhookInfo}
              disabled={isLoadingWebhookInfo}
              className="flex items-center space-x-2"
            >
              <RefreshCw className={`h-4 w-4 ${isLoadingWebhookInfo ? 'animate-spin' : ''}`} />
              <span>{t('common.refresh', 'Оновити')}</span>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {webhookInfo && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start space-x-2">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-blue-900 mb-2">
                    {t('settings.telegram.currentWebhook', 'Поточний Webhook')}
                  </h3>
                  <p className="text-sm text-blue-800 font-mono break-all mb-2">
                    {webhookInfo.url || t('settings.telegram.noWebhook', 'Webhook не налаштовано')}
                  </p>
                  {webhookInfo.pending_update_count > 0 && (
                    <p className="text-xs text-blue-700">
                      ⚠️ {t('settings.telegram.pendingUpdates', 'Необроблених оновлень')}: {webhookInfo.pending_update_count}
                    </p>
                  )}
                  {webhookInfo.last_error_date && (
                    <p className="text-xs text-red-700 mt-1">
                      ❌ {t('settings.telegram.lastError', 'Остання помилка')}: {new Date(webhookInfo.last_error_date * 1000).toLocaleString()}
                      {webhookInfo.last_error_message && ` - ${webhookInfo.last_error_message}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.telegram.serverUrl', 'URL сервера')}
            </label>
            <div className="flex space-x-2">
              <Input
                type="text"
                value={webhookBaseUrl}
                onChange={(e) => setWebhookBaseUrl(e.target.value)}
                placeholder="https://your-domain.com"
                className="flex-1"
              />
              <Button
                onClick={handleSetupWebhook}
                disabled={isSettingWebhook || !webhookBaseUrl.trim()}
                className="flex items-center space-x-2"
              >
                <Link className="h-4 w-4" />
                <span>
                  {isSettingWebhook 
                    ? t('settings.telegram.settingUp', 'Налаштування...') 
                    : t('settings.telegram.setupWebhook', 'Налаштувати Webhook')}
                </span>
              </Button>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {t('settings.telegram.serverUrlDescription', 'Введіть лише базовий URL сервера (наприклад, https://krainamriy.fun). Не додавайте /api або /api/telegram/webhook — система сама сформує коректний шлях.')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default TelegramSettings;

