import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Mail, Save, TestTube, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface EmailSettings {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
    fromName: string;
  };
  imap?: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    mailbox: string;
  };
  pop3?: {
    enabled: boolean;
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
  };
  ticketEmail: string;
  autoCategorization?: {
    enabled: boolean;
    rules: Array<{
      condition: {
        type: string;
        operator: string;
        value: string;
      };
      category: string;
      priority: string;
    }>;
  };
  isActive: boolean;
}

const EmailSettings: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();
  const [settings, setSettings] = useState<EmailSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  useEffect(() => {
    loadSettings();
    loadCategories();
  }, []);

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getEmailSettings();
      if (response.success && response.data) {
        setSettings(response.data);
      } else {
        // Якщо налаштування не знайдено, створюємо дефолтні
        setSettings({
          smtp: {
            host: '',
            port: 587,
            secure: false,
            user: '',
            password: '',
            from: '',
            fromName: 'Help Desk System'
          },
          ticketEmail: '',
          isActive: true
        });
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження налаштувань');
      // Створюємо дефолтні налаштування
      setSettings({
        smtp: {
          host: '',
          port: 587,
          secure: false,
          user: '',
          password: '',
          from: '',
          fromName: 'Help Desk System'
        },
        ticketEmail: '',
        isActive: true
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const response = await apiService.getCategories(true);
      if (response.data) {
        setCategories(response.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      setError(null);
      setSuccess(null);

      const response = await apiService.updateEmailSettings(settings);
      if (response.success) {
        setSuccess('Email налаштування успішно збережено');
        await loadSettings();
      } else {
        setError(response.message || 'Помилка збереження налаштувань');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Помилка збереження налаштувань');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      setError(null);

      const response = await apiService.testEmailConnection();
      setTestResult({
        success: response.success,
        message: response.message || (response.success ? 'Підключення успішне' : 'Помилка підключення')
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Помилка тестування підключення'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleTestEmail = async () => {
    if (!testEmailAddress) {
      setError('Введіть email адресу для тесту');
      return;
    }

    try {
      setIsTesting(true);
      setTestResult(null);
      setError(null);

      const response = await apiService.testEmail(testEmailAddress);
      setTestResult({
        success: response.success,
        message: response.message || (response.success ? 'Тестовий email відправлено' : 'Помилка відправки email')
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.response?.data?.message || 'Помилка відправки тестового email'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const updateSMTP = (field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      smtp: {
        ...settings.smtp,
        [field]: value
      }
    });
  };

  const updateIMAP = (field: string, value: any) => {
    if (!settings) return;
    setSettings({
      ...settings,
      imap: {
        ...(settings.imap || {
          enabled: false,
          host: '',
          port: 993,
          secure: true,
          user: '',
          password: '',
          mailbox: 'INBOX'
        }),
        [field]: value
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner />
      </div>
    );
  }

  if (!settings) {
    return null;
  }

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Mail className="w-6 h-6" />
          Email Налаштування
        </h1>
        <p className="text-gray-600 mt-2">Налаштування SMTP та IMAP для email інтеграції</p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-700">
          {success}
        </div>
      )}

      {testResult && (
        <div className={`mb-4 p-4 border rounded-lg ${
          testResult.success
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-700'
        }`}>
          <div className="flex items-center gap-2">
            {testResult.success ? (
              <CheckCircle className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
            <span>{testResult.message}</span>
          </div>
        </div>
      )}

      {/* SMTP Налаштування */}
      <Card className="mb-6">
        <CardHeader title="SMTP Налаштування (Вихідні листи)" />
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="SMTP Host"
                type="text"
                value={settings.smtp.host}
                onChange={(e) => updateSMTP('host', e.target.value)}
                placeholder="smtp.gmail.com"
                required
              />
              <Input
                label="SMTP Port"
                type="number"
                value={settings.smtp.port}
                onChange={(e) => updateSMTP('port', parseInt(e.target.value))}
                placeholder="587"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="SMTP User"
                type="text"
                value={settings.smtp.user}
                onChange={(e) => updateSMTP('user', e.target.value)}
                placeholder="user@example.com"
                required
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  SMTP Password
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={settings.smtp.password}
                    onChange={(e) => updateSMTP('password', e.target.value)}
                    placeholder="Введіть пароль"
                    required
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="From Email"
                type="email"
                value={settings.smtp.from}
                onChange={(e) => updateSMTP('from', e.target.value)}
                placeholder="noreply@example.com"
                required
              />
              <Input
                label="From Name"
                type="text"
                value={settings.smtp.fromName}
                onChange={(e) => updateSMTP('fromName', e.target.value)}
                placeholder="Help Desk System"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={settings.smtp.secure}
                onChange={(e) => updateSMTP('secure', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label className="text-sm font-medium text-gray-700">
                Використовувати SSL/TLS
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* IMAP Налаштування */}
      <Card className="mb-6">
        <CardHeader title="IMAP Налаштування (Вхідні листи)" />
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-4">
              <input
                type="checkbox"
                checked={settings.imap?.enabled || false}
                onChange={(e) => updateIMAP('enabled', e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <label className="text-sm font-medium text-gray-700">
                Увімкнути IMAP для вхідних листів
              </label>
            </div>

            {settings.imap?.enabled && (
              <div className="space-y-4 pl-6 border-l-2 border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="IMAP Host"
                    type="text"
                    value={settings.imap.host || ''}
                    onChange={(e) => updateIMAP('host', e.target.value)}
                    placeholder="imap.gmail.com"
                    required
                  />
                  <Input
                    label="IMAP Port"
                    type="number"
                    value={settings.imap.port || 993}
                    onChange={(e) => updateIMAP('port', parseInt(e.target.value))}
                    placeholder="993"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input
                    label="IMAP User"
                    type="text"
                    value={settings.imap.user || ''}
                    onChange={(e) => updateIMAP('user', e.target.value)}
                    placeholder="user@example.com"
                    required
                  />
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      IMAP Password
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={settings.imap.password || ''}
                        onChange={(e) => updateIMAP('password', e.target.value)}
                        placeholder="Введіть пароль"
                        required
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <Input
                  label="Mailbox"
                  type="text"
                  value={settings.imap.mailbox || 'INBOX'}
                  onChange={(e) => updateIMAP('mailbox', e.target.value)}
                  placeholder="INBOX"
                  required
                />

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.imap.secure !== false}
                    onChange={(e) => updateIMAP('secure', e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <label className="text-sm font-medium text-gray-700">
                    Використовувати SSL/TLS
                  </label>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Email для тикетів */}
      <Card className="mb-6">
        <CardHeader title="Email для тикетів" />
        <CardContent>
          <div className="space-y-4">
            <Input
              label="Email адреса для створення тикетів"
              type="email"
              value={settings.ticketEmail}
              onChange={(e) => setSettings({ ...settings, ticketEmail: e.target.value })}
              placeholder="tickets@example.com"
              required
            />
            <p className="text-sm text-gray-500">
              Листи, надіслані на цю адресу, будуть автоматично створювати тикети
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Тестування */}
      <Card className="mb-6">
        <CardHeader title="Тестування" />
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button
                variant="outline"
                onClick={handleTestConnection}
                disabled={isTesting}
              >
                <TestTube className="w-4 h-4 mr-2" />
                Тестувати підключення
              </Button>
              <div className="flex-1 flex gap-2">
                <Input
                  type="email"
                  value={testEmailAddress}
                  onChange={(e) => setTestEmailAddress(e.target.value)}
                  placeholder="Email для тесту"
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  onClick={handleTestEmail}
                  disabled={isTesting || !testEmailAddress}
                >
                  <TestTube className="w-4 h-4 mr-2" />
                  Відправити тестовий email
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Збереження */}
      <div className="flex justify-end gap-2">
        <Button
          onClick={handleSave}
          disabled={isSaving}
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? 'Збереження...' : 'Зберегти налаштування'}
        </Button>
      </div>
    </div>
  );
};

export default EmailSettings;

