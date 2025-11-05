import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Save, Eye, EyeOff, CheckCircle, XCircle, TestTube } from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { apiService } from '../services/api';

interface ActiveDirectorySettings {
  enabled: boolean;
  ldapUrl: string;
  adminDn: string;
  adminPassword: string;
  userSearchBase: string;
  computerSearchBase: string;
  usernameAttribute: string;
  timeout: number;
  connectTimeout: number;
  retryInterval: number;
  maxRetries: number;
  hasPassword: boolean;
}

const ActiveDirectorySettings: React.FC = () => {
  const { t } = useTranslation();
  const [settings, setSettings] = useState<ActiveDirectorySettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getActiveDirectorySettings();
      if (response.success && response.data) {
        setSettings(response.data);
      }
    } catch (error: any) {
      console.error('Помилка завантаження налаштувань Active Directory:', error);
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

      const response = await apiService.updateActiveDirectorySettings({
        enabled: settings.enabled,
        ldapUrl: settings.ldapUrl,
        adminDn: settings.adminDn,
        adminPassword: showPassword ? settings.adminPassword : undefined,
        userSearchBase: settings.userSearchBase,
        computerSearchBase: settings.computerSearchBase,
        usernameAttribute: settings.usernameAttribute,
        timeout: settings.timeout,
        connectTimeout: settings.connectTimeout,
        retryInterval: settings.retryInterval,
        maxRetries: settings.maxRetries
      });

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Налаштування Active Directory успішно збережено'
        });
        await loadSettings();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка збереження налаштувань'
        });
      }
    } catch (error: any) {
      console.error('Помилка збереження налаштувань Active Directory:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка збереження налаштувань'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!settings) return;

    try {
      setIsTesting(true);
      setTestResult(null);

      const response = await apiService.get('/active-directory/test') as any;
      
      if (response.success) {
        setTestResult({
          success: true,
          message: 'Підключення до Active Directory успішне'
        });
      } else {
        setTestResult({
          success: false,
          message: response.message || 'Помилка підключення'
        });
      }
    } catch (error: any) {
      console.error('Помилка тестування підключення:', error);
      setTestResult({
        success: false,
        message: error.response?.data?.message || 'Помилка підключення до Active Directory'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleChange = (field: keyof ActiveDirectorySettings, value: any) => {
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
          <Server className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-900">
            {t('settings.activeDirectory.title', 'Налаштування Active Directory')}
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

      {testResult && (
        <div className={`p-4 rounded-md flex items-center space-x-2 ${
          testResult.success
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {testResult.success ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <XCircle className="h-5 w-5" />
          )}
          <span>{testResult.message}</span>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold">
            {t('settings.activeDirectory.connectionSettings', 'Налаштування підключення')}
          </h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enabled"
              checked={settings?.enabled || false}
              onChange={(e) => handleChange('enabled', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
              {t('settings.activeDirectory.enabled', 'Увімкнути Active Directory')}
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.ldapUrl', 'LDAP URL')}
            </label>
            <Input
              type="text"
              value={settings?.ldapUrl || ''}
              onChange={(e) => handleChange('ldapUrl', e.target.value)}
              placeholder="ldap://192.168.100.2:389"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.adminDn', 'Admin DN')}
            </label>
            <Input
              type="text"
              value={settings?.adminDn || ''}
              onChange={(e) => handleChange('adminDn', e.target.value)}
              placeholder="admin@domain.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.adminPassword', 'Admin Password')}
            </label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={settings?.adminPassword || ''}
                onChange={(e) => handleChange('adminPassword', e.target.value)}
                placeholder="••••••••"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.userSearchBase', 'User Search Base')}
            </label>
            <Input
              type="text"
              value={settings?.userSearchBase || ''}
              onChange={(e) => handleChange('userSearchBase', e.target.value)}
              placeholder="dc=domain,dc=com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.computerSearchBase', 'Computer Search Base')}
            </label>
            <Input
              type="text"
              value={settings?.computerSearchBase || ''}
              onChange={(e) => handleChange('computerSearchBase', e.target.value)}
              placeholder="dc=domain,dc=com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('settings.activeDirectory.usernameAttribute', 'Username Attribute')}
            </label>
            <Input
              type="text"
              value={settings?.usernameAttribute || ''}
              onChange={(e) => handleChange('usernameAttribute', e.target.value)}
              placeholder="sAMAccountName"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.activeDirectory.timeout', 'Timeout (ms)')}
              </label>
              <Input
                type="number"
                value={settings?.timeout || 5000}
                onChange={(e) => handleChange('timeout', parseInt(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.activeDirectory.connectTimeout', 'Connect Timeout (ms)')}
              </label>
              <Input
                type="number"
                value={settings?.connectTimeout || 10000}
                onChange={(e) => handleChange('connectTimeout', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.activeDirectory.retryInterval', 'Retry Interval (ms)')}
              </label>
              <Input
                type="number"
                value={settings?.retryInterval || 120000}
                onChange={(e) => handleChange('retryInterval', parseInt(e.target.value))}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {t('settings.activeDirectory.maxRetries', 'Max Retries')}
              </label>
              <Input
                type="number"
                value={settings?.maxRetries || 3}
                onChange={(e) => handleChange('maxRetries', parseInt(e.target.value))}
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4">
            <Button
              variant="outline"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="flex items-center space-x-2"
            >
              <TestTube className="h-4 w-4" />
              <span>{isTesting ? t('common.testing', 'Тестування...') : t('common.testConnection', 'Тестувати підключення')}</span>
            </Button>
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

export default ActiveDirectorySettings;

