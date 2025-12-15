/* eslint-disable @typescript-eslint/explicit-function-return-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable jsx-a11y/label-has-associated-control */
import React, { useState, useEffect } from 'react';
// import { useTranslation } from 'react-i18next'; // TODO: Add translations later
import { 
  Server, Save, Eye, EyeOff, CheckCircle, XCircle, RefreshCw,
  Users, Plus, Edit, Trash2, AlertTriangle, Settings, Play,
  X, Check, Send
} from 'lucide-react';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import ConfirmationModal from '../components/UI/ConfirmationModal';
import { apiService } from '../services/api';
import { User, isAdminRole } from '../types';
import { useUsers } from '../hooks';

interface ZabbixConfig {
  url: string;
  apiToken?: string;
  username?: string;
  enabled: boolean;
  pollInterval: number;
  hasToken: boolean;
  hasPassword?: boolean;
  lastPollAt?: string;
  lastError?: string;
  stats?: {
    totalPolls: number;
    successfulPolls: number;
    failedPolls: number;
    alertsProcessed: number;
  };
}

interface ZabbixAlertGroup {
  _id: string;
  name: string;
  description: string;
  adminIds: string[];
  adminIds_details?: User[];
  triggerIds: string[];
  hostPatterns: string[];
  severityLevels: number[];
  enabled: boolean;
  priority: number;
  telegram?: {
    botToken?: string;
    groupId?: string;
  };
  settings: {
    notifyOnResolve: boolean;
    notifyOnAcknowledge: boolean;
    minNotificationInterval: number;
  };
  stats?: {
    alertsMatched: number;
    notificationsSent: number;
    lastNotificationAt?: string;
  };
}

const ZabbixSettings: React.FC = () => {
  // const { t } = useTranslation(); // TODO: Add translations later
  const [config, setConfig] = useState<ZabbixConfig | null>(null);
  const [groups, setGroups] = useState<ZabbixAlertGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { users: allUsers } = useUsers(1, 1000, undefined, undefined, true); // Отримуємо активних користувачів
  
  
  // Фільтруємо всіх адміністраторів (включаючи super_admin)
  // Показуємо всіх адміністраторів для вибору, а не тільки з Telegram ID
  const admins = allUsers.filter(user => 
    isAdminRole(user.role)
  );
  
  // Адміністратори з Telegram (ID або username) для інформації
  const adminsWithTelegram = allUsers.filter(user => 
    isAdminRole(user.role) && (user.telegramId || user.telegramUsername)
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [tokenChanged, setTokenChanged] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordChanged, setPasswordChanged] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'config' | 'groups' | 'alerts'>('config');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ZabbixAlertGroup | null>(null);
  const [testingConnection, setTestingConnection] = useState(false);
  const [pollingNow, setPollingNow] = useState(false);
  const [testingGroup, setTestingGroup] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ show: boolean; groupId: string | null }>({ show: false, groupId: null });

  // Форма групи
  const [groupForm, setGroupForm] = useState({
    name: '',
    description: '',
    adminIds: [] as string[],
    triggerIds: [] as string[],
    hostPatterns: [] as string[],
    severityLevels: [] as number[],
    enabled: true,
    priority: 0,
    telegram: {
      botToken: '',
      groupId: ''
    },
    settings: {
      notifyOnResolve: false,
      notifyOnAcknowledge: false,
      minNotificationInterval: 0
    }
  });

  // Фільтри для алертів
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [alerts, setAlerts] = useState<any[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsPage, setAlertsPage] = useState(1);
  const [alertsFilters, setAlertsFilters] = useState({
    severity: undefined as number | undefined,
    status: undefined as string | undefined,
    resolved: undefined as boolean | undefined,
    host: ''
  });

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'alerts') {
      loadAlerts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, alertsPage, alertsFilters.severity, alertsFilters.status, alertsFilters.resolved, alertsFilters.host]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadConfig(),
        loadGroups()
      ]);
    } catch (error) {
      console.error('Помилка завантаження даних:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const response = await apiService.getZabbixConfig();
      if (response.success && response.data) {
        const data = response.data as unknown as ZabbixConfig;
        setConfig({
          ...data,
          apiToken: ''
        });
        setTokenChanged(false);
        setPasswordInput('');
        setPasswordChanged(false);
        setShowToken(false);
        setShowPassword(false);
      }
    } catch (error: any) {
      console.error('Помилка завантаження конфігурації:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка завантаження конфігурації'
      });
    }
  };

  const loadGroups = async () => {
    try {
      const response = await apiService.getZabbixGroups();
      if (response.success && response.data) {
        const data = response.data as { data?: ZabbixAlertGroup[] };
        setGroups(Array.isArray(data) ? data : (data.data || []));
      }
    } catch (error: any) {
      console.error('Помилка завантаження груп:', error);
    }
  };


  const loadAlerts = async () => {
    try {
      setAlertsLoading(true);
      const response = await apiService.getZabbixAlerts({
        page: alertsPage,
        limit: 50,
        ...alertsFilters
      });
      if (response.success && response.data) {
        const data = response.data as { alerts?: unknown[] };
        setAlerts((data.alerts || []) as unknown[]);
      }
    } catch (error: any) {
      console.error('Помилка завантаження алертів:', error);
    } finally {
      setAlertsLoading(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!config) return;

    try {
      setIsSaving(true);
      setMessage(null);

      const payload: Record<string, any> = {
        url: config.url,
        enabled: config.enabled,
        pollInterval: config.pollInterval,
        username: config.username ?? ''
      };

      if (tokenChanged) {
        payload.apiToken = config.apiToken ?? '';
      }

      if (passwordChanged) {
        payload.password = passwordInput;
      }

      const response = await apiService.updateZabbixConfig(payload);

      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Налаштування Zabbix успішно збережено'
        });
        await loadConfig();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка збереження налаштувань'
        });
      }
    } catch (error: any) {
      console.error('Помилка збереження налаштувань:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка збереження налаштувань'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    try {
      setTestingConnection(true);
      setMessage(null);

      const response = await apiService.testZabbixConnection();

      if (response.success) {
        setMessage({
          type: 'success',
          text: `Підключення успішне! Версія Zabbix: ${response.data?.version || 'невідома'}`
        });
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка підключення до Zabbix'
        });
      }
    } catch (error: any) {
      console.error('Помилка тестування підключення:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка підключення до Zabbix'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const handlePollNow = async () => {
    try {
      setPollingNow(true);
      setMessage(null);

      const response = await apiService.pollZabbixNow();

      if (response.success) {
        setMessage({
          type: 'success',
          text: `Опитування завершено. Оброблено ${response.data?.alertsProcessed || 0} алертів, відправлено ${response.data?.notificationsSent || 0} сповіщень.`
        });
        await loadConfig();
        if (activeTab === 'alerts') {
          await loadAlerts();
        }
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка опитування Zabbix'
        });
      }
    } catch (error: any) {
      console.error('Помилка опитування:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка опитування Zabbix'
      });
    } finally {
      setPollingNow(false);
    }
  };

  const handleOpenGroupModal = (group?: ZabbixAlertGroup) => {
    if (group) {
      setEditingGroup(group);
      setGroupForm({
        name: group.name,
        description: group.description,
        adminIds: group.adminIds,
        triggerIds: group.triggerIds,
        hostPatterns: group.hostPatterns,
        severityLevels: group.severityLevels,
        enabled: group.enabled,
        priority: group.priority,
        telegram: {
          botToken: group.telegram?.botToken || '',
          groupId: group.telegram?.groupId || ''
        },
        settings: group.settings
      });
    } else {
      setEditingGroup(null);
      setGroupForm({
        name: '',
        description: '',
        adminIds: [],
        triggerIds: [],
        hostPatterns: [],
        severityLevels: [],
        enabled: true,
        priority: 0,
        telegram: {
          botToken: '',
          groupId: ''
        },
        settings: {
          notifyOnResolve: false,
          notifyOnAcknowledge: false,
          minNotificationInterval: 0
        }
      });
    }
    setShowGroupModal(true);
  };

  const handleCloseGroupModal = () => {
    setShowGroupModal(false);
    setEditingGroup(null);
  };

  const handleTestGroup = async () => {
    try {
      setTestingGroup(true);
      setMessage(null);

      // Якщо редагуємо групу, використовуємо її ID
      // Якщо створюємо нову, спочатку збережемо тимчасово для тестування
      let groupIdForTest: string | undefined;

      if (editingGroup) {
        // Використовуємо існуючий ID
        groupIdForTest = editingGroup._id;
      } else {
        // Створюємо тимчасову групу для тестування
        const groupData = {
          name: groupForm.name || 'Test Group',
          description: groupForm.description,
          adminIds: groupForm.adminIds,
          triggerIds: groupForm.triggerIds.filter(id => id.trim() !== ''),
          hostPatterns: groupForm.hostPatterns.filter(pattern => pattern.trim() !== ''),
          severityLevels: groupForm.severityLevels,
          enabled: groupForm.enabled,
          priority: groupForm.priority,
          telegram: {
            botToken: groupForm.telegram.botToken?.trim() || null,
            groupId: groupForm.telegram.groupId?.trim() || null
          },
          settings: groupForm.settings
        };

        const createResponse = await apiService.createZabbixGroup(groupData);
        
        if (!createResponse.success || !createResponse.data?._id) {
          throw new Error(createResponse.message || 'Не вдалося створити тимчасову групу для тестування');
        }

        groupIdForTest = (createResponse.data as { _id?: string })._id || '';
      }

      // Тестуємо відправку алерту
      let response;
      try {
        response = await apiService.testZabbixAlert({ groupId: groupIdForTest });
      } catch (testError: any) {
        console.error('Помилка тестування алерту:', testError);
        throw testError;
      }

      // Якщо це була тимчасова група, видаляємо її після тесту (навіть якщо була помилка)
      if (!editingGroup && groupIdForTest) {
        try {
          await apiService.deleteZabbixGroup(groupIdForTest);
        } catch (deleteError) {
          console.error('Помилка видалення тимчасової групи:', deleteError);
          // Не кидаємо помилку, щоб не перекрити результат тестування
        }
      }

      if (response.success) {
        const data = response.data as { result?: { sent?: number; failed?: number; errors?: unknown[] } };
        const result = data.result;
        const sentCount = result?.sent || 0;
        const failedCount = result?.failed || 0;
        const errors = result?.errors || [];
        
        if (sentCount > 0) {
          let messageText = `✅ Тестове сповіщення успішно відправлено! Відправлено: ${sentCount}`;
          if (failedCount > 0) {
            messageText += `, Помилок: ${failedCount}`;
          }
          setMessage({
            type: 'success',
            text: messageText
          });
        } else {
          let errorText = `❌ Тестове сповіщення не відправлено. Помилок: ${failedCount}.`;
          
          if (errors.length > 0) {
            const errorDetails = errors.map((err: any) => {
              if (err.type === 'no_admins') {
                return `Група "${err.group}": немає адміністраторів з Telegram ID та не вказано Telegram групу`;
              } else if (err.type === 'admin_no_telegram_id') {
                return `Адміністратор ${err.admin} не має Telegram ID`;
              } else if (err.type === 'telegram_group') {
                let errorText = `Помилка відправки в Telegram групу "${err.group}": ${err.error}`;
                if (err.code) {
                  errorText += ` (код: ${err.code})`;
                }
                if (err.details && typeof err.details === 'object' && err.details.description) {
                  errorText += `\n  Деталі: ${err.details.description}`;
                }
                return errorText;
              } else if (err.type === 'admin_notification') {
                return `Помилка відправки адміністратору ${err.admin}: ${err.error}`;
              } else {
                return `Група "${err.group}": ${err.error}`;
              }
            }).join('\n');
            
            errorText += '\n\nДеталі помилок:\n' + errorDetails;
          } else {
            errorText += '\n\nМожливі причини:\n- Telegram сервіс не ініціалізований\n- Група не має Telegram ID і немає адміністраторів з Telegram ID\n- Неправильний токен бота або ID групи';
          }
          
          setMessage({
            type: 'error',
            text: errorText
          });
        }
      } else {
        setMessage({
          type: 'error',
          text: response.message || response.error || 'Помилка відправки тестового сповіщення'
        });
      }
    } catch (error: any) {
      console.error('Помилка тестування групи:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || error.message || 'Помилка тестування групи'
      });
    } finally {
      setTestingGroup(false);
    }
  };

  const handleSaveGroup = async () => {
    try {
      setIsSaving(true);
      setMessage(null);

      const groupData = {
        name: groupForm.name,
        description: groupForm.description,
        adminIds: groupForm.adminIds,
        triggerIds: groupForm.triggerIds.filter(id => id.trim() !== ''),
        hostPatterns: groupForm.hostPatterns.filter(pattern => pattern.trim() !== ''),
        severityLevels: groupForm.severityLevels,
        enabled: groupForm.enabled,
        priority: groupForm.priority,
        telegram: {
          botToken: groupForm.telegram.botToken?.trim() || null,
          groupId: groupForm.telegram.groupId?.trim() || null
        },
        settings: groupForm.settings
      };

      let response;
      if (editingGroup) {
        response = await apiService.updateZabbixGroup(editingGroup._id, groupData);
      } else {
        response = await apiService.createZabbixGroup(groupData);
      }

      if (response.success) {
        setMessage({
          type: 'success',
          text: editingGroup ? 'Групу успішно оновлено' : 'Групу успішно створено'
        });
        await loadGroups();
        handleCloseGroupModal();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка збереження групи'
        });
      }
    } catch (error: any) {
      console.error('Помилка збереження групи:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка збереження групи'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    try {
      setIsSaving(true);
      const response = await apiService.deleteZabbixGroup(groupId);
      if (response.success) {
        setMessage({
          type: 'success',
          text: 'Групу успішно видалено'
        });
        await loadGroups();
      } else {
        setMessage({
          type: 'error',
          text: response.message || 'Помилка видалення групи'
        });
      }
    } catch (error: any) {
      console.error('Помилка видалення групи:', error);
      setMessage({
        type: 'error',
        text: error.response?.data?.message || 'Помилка видалення групи'
      });
    } finally {
      setIsSaving(false);
      setDeleteConfirm({ show: false, groupId: null });
    }
  };

  const handleAddTriggerId = () => {
    setGroupForm({
      ...groupForm,
      triggerIds: [...groupForm.triggerIds, '']
    });
  };

  const handleRemoveTriggerId = (index: number) => {
    setGroupForm({
      ...groupForm,
      triggerIds: groupForm.triggerIds.filter((_, i) => i !== index)
    });
  };

  const handleUpdateTriggerId = (index: number, value: string) => {
    const newTriggerIds = [...groupForm.triggerIds];
    newTriggerIds[index] = value;
    setGroupForm({
      ...groupForm,
      triggerIds: newTriggerIds
    });
  };

  const handleAddHostPattern = () => {
    setGroupForm({
      ...groupForm,
      hostPatterns: [...groupForm.hostPatterns, '']
    });
  };

  const handleRemoveHostPattern = (index: number) => {
    setGroupForm({
      ...groupForm,
      hostPatterns: groupForm.hostPatterns.filter((_, i) => i !== index)
    });
  };

  const handleUpdateHostPattern = (index: number, value: string) => {
    const newHostPatterns = [...groupForm.hostPatterns];
    newHostPatterns[index] = value;
    setGroupForm({
      ...groupForm,
      hostPatterns: newHostPatterns
    });
  };

  const handleToggleSeverity = (severity: number) => {
    const newSeverityLevels = groupForm.severityLevels.includes(severity)
      ? groupForm.severityLevels.filter(s => s !== severity)
      : [...groupForm.severityLevels, severity];
    setGroupForm({
      ...groupForm,
      severityLevels: newSeverityLevels
    });
  };

  const handleToggleAdmin = (adminId: string) => {
    const newAdminIds = groupForm.adminIds.includes(adminId)
      ? groupForm.adminIds.filter(id => id !== adminId)
      : [...groupForm.adminIds, adminId];
    setGroupForm({
      ...groupForm,
      adminIds: newAdminIds
    });
  };

  const getSeverityLabel = (severity: number) => {
    const labels: { [key: number]: string } = {
      0: 'Not classified',
      1: 'Information',
      2: 'Warning',
      3: 'High',
      4: 'Disaster'
    };
    return labels[severity] || 'Unknown';
  };

  const getSeverityEmoji = (severity: number) => {
    const emojis: { [key: number]: string } = {
      0: '⚪',
      1: 'ℹ️',
      2: '⚠️',
      3: '🔴',
      4: '🚨'
    };
    return emojis[severity] || '❓';
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
            Налаштування Zabbix
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

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('config')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'config'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Settings className="h-4 w-4" />
              <span>Конфігурація</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'groups'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Users className="h-4 w-4" />
              <span>Групи адміністраторів</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('alerts')}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'alerts'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4" />
              <span>Алерти</span>
            </div>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-6">
        {activeTab === 'config' && config && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold">Налаштування підключення</h2>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  URL Zabbix сервера
                </label>
                <Input
                  type="text"
                  value={config.url || ''}
                  onChange={(e) => setConfig({ ...config, url: e.target.value })}
                  placeholder="https://zabbix.example.com"
                />
                <p className="mt-1 text-sm text-gray-500">
                  URL Zabbix сервера (наприклад, https://zabbix.example.com)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  API Token
                </label>
                <div className="relative">
                  <Input
                    type={showToken ? 'text' : 'password'}
                    value={config.apiToken || ''}
                    onChange={(e) => {
                      setTokenChanged(true);
                      setConfig({ ...config, apiToken: e.target.value });
                    }}
                    placeholder="Введіть API токен"
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
                  API токен для автентифікації в Zabbix (створіть в Users → API tokens)
                </p>
                {config.hasToken && !tokenChanged && (
                  <div className="mt-1 text-sm text-gray-500">
                    Поточний токен вже збережений. Щоб оновити, введіть новий токен або{' '}
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setTokenChanged(true);
                        setConfig({ ...config, apiToken: '' });
                      }}
                    >
                      очистіть токен
                    </button>.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Логін (для user.login)
                </label>
                <Input
                  type="text"
                  value={config.username || ''}
                  onChange={(e) => setConfig({ ...config, username: e.target.value })}
                  placeholder="Ім'я користувача Zabbix"
                />
                <p className="mt-1 text-sm text-gray-500">
                  Використовуйте, якщо потрібно автентифікуватися через user.login (для версій без API токенів або при відмові токена).
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Пароль
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={passwordInput}
                    onChange={(e) => {
                      setPasswordInput(e.target.value);
                      setPasswordChanged(true);
                    }}
                    placeholder={
                      config.hasPassword && !passwordChanged
                        ? 'Залиште поле порожнім, щоб не змінювати'
                        : 'Введіть пароль користувача'
                    }
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
                {config.hasPassword && !passwordChanged ? (
                  <div className="mt-1 text-sm text-gray-500">
                    Пароль збережений. Введіть новий, щоб оновити, або{' '}
                    <button
                      type="button"
                      className="text-blue-600 hover:underline"
                      onClick={() => {
                        setPasswordInput('');
                        setPasswordChanged(true);
                      }}
                    >
                      очистіть пароль
                    </button>.
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">
                    Пароль шифрується та зберігається на сервері. Якщо поле залишити порожнім, пароль не буде змінено.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Інтервал опитування (хвилини)
                </label>
                <Input
                  type="number"
                  min="1"
                  max="60"
                  value={config.pollInterval || 5}
                  onChange={(e) => setConfig({ ...config, pollInterval: parseInt(e.target.value) || 5 })}
                />
                <p className="mt-1 text-sm text-gray-500">
                  Як часто система буде опитувати Zabbix API (1-60 хвилин)
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={config.enabled || false}
                  onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                  Увімкнути інтеграцію Zabbix
                </label>
              </div>

              {config.stats && (
                <div className="p-4 bg-gray-50 rounded-md">
                  <h3 className="text-sm font-medium text-gray-700 mb-2">Статистика</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Всього опитувань:</span>
                      <span className="ml-2 font-medium">{config.stats.totalPolls || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Успішних:</span>
                      <span className="ml-2 font-medium text-green-600">{config.stats.successfulPolls || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Помилок:</span>
                      <span className="ml-2 font-medium text-red-600">{config.stats.failedPolls || 0}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Оброблено алертів:</span>
                      <span className="ml-2 font-medium">{config.stats.alertsProcessed || 0}</span>
                    </div>
                  </div>
                  {config.lastPollAt && (
                    <div className="mt-2 text-sm text-gray-500">
                      Останнє опитування: {new Date(config.lastPollAt).toLocaleString('uk-UA')}
                    </div>
                  )}
                  {config.lastError && (
                    <div className="mt-2 text-sm text-red-600">
                      Остання помилка: {config.lastError}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end space-x-3 pt-4">
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={testingConnection}
                  className="flex items-center space-x-2"
                >
                  <RefreshCw className={`h-4 w-4 ${testingConnection ? 'animate-spin' : ''}`} />
                  <span>Тестувати підключення</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePollNow}
                  disabled={pollingNow}
                  className="flex items-center space-x-2"
                >
                  <Play className={`h-4 w-4 ${pollingNow ? 'animate-spin' : ''}`} />
                  <span>Опитувати зараз</span>
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  disabled={isSaving}
                  className="flex items-center space-x-2"
                >
                  <Save className="h-4 w-4" />
                  <span>{isSaving ? 'Збереження...' : 'Зберегти'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {activeTab === 'groups' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">Групи адміністраторів</h2>
              <Button
                onClick={() => handleOpenGroupModal()}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Створити групу</span>
              </Button>
            </div>

            {groups.length === 0 ? (
              <Card>
                <CardContent className="text-center py-8">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Групи адміністраторів не створені</p>
                  <Button
                    onClick={() => handleOpenGroupModal()}
                    className="mt-4 flex items-center space-x-2 mx-auto"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Створити першу групу</span>
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {groups.map((group) => (
                  <Card key={group._id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="text-lg font-semibold">{group.name}</h3>
                          {group.description && (
                            <p className="text-sm text-gray-500 mt-1">{group.description}</p>
                          )}
                        </div>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenGroupModal(group)}
                            className="flex items-center space-x-2"
                          >
                            <Edit className="h-4 w-4" />
                            <span>Редагувати</span>
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDeleteConfirm({ show: true, groupId: group._id })}
                            className="flex items-center space-x-2 text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                            <span>Видалити</span>
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            group.enabled
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {group.enabled ? 'Увімкнено' : 'Вимкнено'}
                          </span>
                          <span className="text-sm text-gray-500">
                            Пріоритет: {group.priority}
                          </span>
                        </div>

                        {/* Telegram група */}
                        {group.telegram && group.telegram.groupId && (
                          <div>
                            <span className="text-sm font-medium text-gray-700">Telegram група:</span>
                            <div className="mt-1">
                              <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs">
                                📢 Група: {group.telegram.groupId}
                                {group.telegram.botToken && (
                                  <span className="ml-1 text-green-600" title="Використовується кастомний бот">[Кастомний бот]</span>
                                )}
                                {!group.telegram.botToken && (
                                  <span className="ml-1 text-blue-600" title="Використовується глобальний бот">[Глобальний бот]</span>
                                )}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Адміністратори (показуємо тільки якщо немає Telegram групи) */}
                        {(!group.telegram || !group.telegram.groupId) && (
                          <div>
                            <span className="text-sm font-medium text-gray-700">Адміністратори:</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {group.adminIds && group.adminIds.length > 0 ? (
                                group.adminIds.map((adminId: any, index: number) => {
                                  // Якщо adminId - це об'єкт (після populate), використовуємо його напряму
                                  // Якщо це ID, знаходимо адміністратора в списку
                                  const admin = typeof adminId === 'object' && adminId !== null && adminId._id
                                    ? adminId
                                    : admins.find(a => a._id === adminId || a._id?.toString() === adminId?.toString());
                                  if (!admin) {
                                    // Якщо не знайдено, показуємо ID
                                    return (
                                      <span
                                        key={index}
                                        className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs"
                                      >
                                        ID: {typeof adminId === 'object' ? adminId._id : adminId}
                                      </span>
                                    );
                                  }
                                  return (() => {
                                    // Перевіряємо, чи telegramUsername є числовим ID
                                    const telegramUsernameStr = admin.telegramUsername ? String(admin.telegramUsername) : null;
                                    const isUsernameNumeric = telegramUsernameStr && /^\d+$/.test(telegramUsernameStr);
                                    const actualTelegramId = admin.telegramId || (isUsernameNumeric ? telegramUsernameStr : null);
                                    const actualTelegramUsername = telegramUsernameStr && !isUsernameNumeric ? telegramUsernameStr : null;
                                    
                                    return (
                                      <span
                                        key={admin._id || index}
                                        className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs"
                                        title={actualTelegramId ? `Telegram ID: ${actualTelegramId}` : undefined}
                                      >
                                        {admin.firstName} {admin.lastName} ({admin.email})
                                        {actualTelegramUsername && (
                                          <span className="ml-1 text-blue-600" title="Telegram username">[@{actualTelegramUsername}]</span>
                                        )}
                                        {actualTelegramId && !actualTelegramUsername && (
                                          <span className="ml-1 text-gray-600" title="Telegram ID">[ID: {actualTelegramId}]</span>
                                        )}
                                        {actualTelegramId && actualTelegramUsername && (
                                          <span className="ml-1 text-gray-600" title="Telegram ID">[ID: {actualTelegramId}]</span>
                                        )}
                                        {!actualTelegramId && !actualTelegramUsername && (
                                          <span className="ml-1 text-red-500" title="Немає Telegram ID">[Немає Telegram]</span>
                                        )}
                                      </span>
                                    );
                                  })();
                                })
                              ) : (
                                <span className="text-sm text-gray-500">Не призначено</span>
                              )}
                            </div>
                          </div>
                        )}

                        {group.severityLevels.length > 0 && (
                          <div>
                            <span className="text-sm font-medium text-gray-700">Рівні важливості:</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {group.severityLevels.map((severity) => (
                                <span
                                  key={severity}
                                  className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs flex items-center space-x-1"
                                >
                                  <span>{getSeverityEmoji(severity)}</span>
                                  <span>{getSeverityLabel(severity)}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {group.triggerIds.length > 0 && (
                          <div>
                            <span className="text-sm font-medium text-gray-700">Тригери:</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {group.triggerIds.map((triggerId, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs font-mono"
                                >
                                  {triggerId}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {group.hostPatterns.length > 0 && (
                          <div>
                            <span className="text-sm font-medium text-gray-700">Патерни хостів:</span>
                            <div className="mt-1 flex flex-wrap gap-2">
                              {group.hostPatterns.map((pattern, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs"
                                >
                                  {pattern}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {group.stats && (
                          <div className="pt-2 border-t">
                            <div className="text-sm text-gray-500">
                              Алертів знайдено: {group.stats.alertsMatched || 0} | 
                              Сповіщень відправлено: {group.stats.notificationsSent || 0}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'alerts' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <h2 className="text-lg font-semibold">Алерти Zabbix</h2>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Severity
                        </label>
                        <select
                          value={alertsFilters.severity || ''}
                          onChange={(e) => setAlertsFilters({
                            ...alertsFilters,
                            severity: e.target.value ? parseInt(e.target.value) : undefined
                          })}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="">Всі</option>
                          <option value="0">Not classified</option>
                          <option value="1">Information</option>
                          <option value="2">Warning</option>
                          <option value="3">High</option>
                          <option value="4">Disaster</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Статус
                        </label>
                        <select
                          value={alertsFilters.status || ''}
                          onChange={(e) => setAlertsFilters({
                            ...alertsFilters,
                            status: e.target.value || undefined
                          })}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="">Всі</option>
                          <option value="PROBLEM">PROBLEM</option>
                          <option value="OK">OK</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Вирішено
                        </label>
                        <select
                          value={alertsFilters.resolved === undefined ? '' : alertsFilters.resolved.toString()}
                          onChange={(e) => setAlertsFilters({
                            ...alertsFilters,
                            resolved: e.target.value === '' ? undefined : e.target.value === 'true'
                          })}
                          className="w-full border border-gray-300 rounded-md px-3 py-2"
                        >
                          <option value="">Всі</option>
                          <option value="false">Не вирішено</option>
                          <option value="true">Вирішено</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Хост
                        </label>
                        <Input
                          type="text"
                          value={alertsFilters.host}
                          onChange={(e) => setAlertsFilters({
                            ...alertsFilters,
                            host: e.target.value
                          })}
                          placeholder="Пошук по хосту"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setAlertsFilters({
                            severity: undefined,
                            status: undefined,
                            resolved: undefined,
                            host: ''
                          });
                          setAlertsPage(1);
                        }}
                        className="flex items-center space-x-2"
                      >
                        <X className="h-4 w-4" />
                        <span>Скинути фільтри</span>
                      </Button>
                    </div>
                  </div>

                  {alertsLoading ? (
                    <div className="flex justify-center py-8">
                      <LoadingSpinner />
                    </div>
                  ) : alerts.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      Алерти не знайдено
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {alerts.map((alert) => (
                        <Card key={alert._id}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-2">
                                  <span className="text-xl">{getSeverityEmoji(alert.severity)}</span>
                                  <span className="font-semibold">{alert.host}</span>
                                  <span className={`px-2 py-1 rounded text-xs ${
                                    alert.status === 'PROBLEM'
                                      ? 'bg-red-100 text-red-800'
                                      : 'bg-green-100 text-green-800'
                                  }`}>
                                    {alert.status}
                                  </span>
                                  {alert.resolved && (
                                    <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded text-xs">
                                      Вирішено
                                    </span>
                                  )}
                                  {alert.acknowledged && (
                                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                                      Підтверджено
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-gray-700 mb-1">{alert.triggerName}</p>
                                {alert.message && (
                                  <p className="text-sm text-gray-500 mb-2">{alert.message}</p>
                                )}
                                <div className="text-xs text-gray-400">
                                  {new Date(alert.eventTime).toLocaleString('uk-UA')}
                                </div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Group Modal */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">
                  {editingGroup ? 'Редагувати групу' : 'Створити групу'}
                </h2>
                <button
                  onClick={handleCloseGroupModal}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Назва групи *
                  </label>
                  <Input
                    type="text"
                    value={groupForm.name}
                    onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                    placeholder="Назва групи"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Опис
                  </label>
                  <textarea
                    value={groupForm.description}
                    onChange={(e) => setGroupForm({ ...groupForm, description: e.target.value })}
                    placeholder="Опис групи"
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={3}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Адміністратори
                    <span className="ml-2 text-xs text-gray-500 font-normal">
                      {groupForm.telegram && groupForm.telegram.groupId && groupForm.telegram.groupId.trim()
                        ? '(Необов\'язково, якщо вказано Telegram групу)'
                        : '*(Обов\'язково, якщо не вказано Telegram групу)'}
                    </span>
                  </label>
                  {groupForm.telegram && groupForm.telegram.groupId && groupForm.telegram.groupId.trim() && (
                    <div className="mb-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800">
                      ℹ️ Оскільки вказано Telegram групу, адміністратори не обов&apos;язкові. Сповіщення будуть відправлятися в групу.
                    </div>
                  )}
                  {adminsWithTelegram.length > 0 && adminsWithTelegram.length < admins.length && (
                    <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
                      ⚠️ {adminsWithTelegram.length} з {admins.length} адміністраторів мають Telegram ID. 
                      Сповіщення будуть відправлятися тільки адміністраторам з числовим Telegram ID.
                    </div>
                  )}
                  <div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
                    {admins.length === 0 ? (
                      <p className="text-sm text-gray-500">
                        Адміністратори не знайдені. Створіть адміністратора в розділі користувачів.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {admins.map((admin) => {
                          // Перевіряємо, чи telegramUsername є числовим ID
                          const telegramUsernameStr = admin.telegramUsername ? String(admin.telegramUsername) : null;
                          const isUsernameNumeric = telegramUsernameStr && /^\d+$/.test(telegramUsernameStr);
                          const actualTelegramId = admin.telegramId || (isUsernameNumeric ? telegramUsernameStr : null);
                          const actualTelegramUsername = telegramUsernameStr && !isUsernameNumeric ? telegramUsernameStr : null;
                          const hasTelegramId = !!actualTelegramId;
                          const hasTelegramUsername = !!actualTelegramUsername;
                          const canReceiveNotifications = hasTelegramId;
                          
                          return (
                            <label
                              key={admin._id}
                              className={`flex items-start space-x-2 cursor-pointer p-2 rounded ${
                                !canReceiveNotifications ? 'bg-gray-50' : ''
                              }`}
                              title={
                                !canReceiveNotifications 
                                  ? 'Для отримання сповіщень потрібен числовий Telegram ID. Додайте його в деталях користувача.'
                                  : undefined
                              }
                            >
                              <input
                                type="checkbox"
                                checked={groupForm.adminIds.includes(admin._id)}
                                onChange={() => handleToggleAdmin(admin._id)}
                                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded mt-0.5"
                              />
                              <div className="flex-1">
                                <span className="text-sm font-medium">
                                  {admin.firstName} {admin.lastName}
                                </span>
                                <span className="text-xs text-gray-500 ml-1">
                                  ({admin.email})
                                </span>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {hasTelegramUsername && (
                                    <span className="text-xs text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded" title="Telegram username">
                                      @{actualTelegramUsername}
                                    </span>
                                  )}
                                  {hasTelegramId && (
                                    <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded" title="Telegram ID (може отримувати сповіщення)">
                                      ID: {actualTelegramId} ✓
                                    </span>
                                  )}
                                  {!canReceiveNotifications && (
                                    <span className="text-xs text-red-600 bg-red-50 px-1.5 py-0.5 rounded" title="Немає числового Telegram ID - сповіщення не будуть відправлятися">
                                      ⚠️ Немає Telegram ID
                                    </span>
                                  )}
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Рівні важливості (Severity)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 2, 3, 4].map((severity) => (
                      <button
                        key={severity}
                        type="button"
                        onClick={() => handleToggleSeverity(severity)}
                        className={`px-3 py-2 rounded-md text-sm font-medium flex items-center space-x-2 ${
                          groupForm.severityLevels.includes(severity)
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        <span>{getSeverityEmoji(severity)}</span>
                        <span>{getSeverityLabel(severity)}</span>
                        {groupForm.severityLevels.includes(severity) && (
                          <Check className="h-4 w-4" />
                        )}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Оберіть рівні важливості для фільтрації. Якщо не вибрано жодного, будуть оброблятися всі рівні.
                  </p>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      ID тригерів (опціонально)
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddTriggerId}
                      className="flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Додати</span>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {groupForm.triggerIds.map((triggerId, index) => (
                      <div key={index} className="flex space-x-2">
                        <Input
                          type="text"
                          value={triggerId}
                          onChange={(e) => handleUpdateTriggerId(index, e.target.value)}
                          placeholder="Trigger ID"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveTriggerId(index)}
                          className="text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Патерни хостів (опціонально)
                    </label>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAddHostPattern}
                      className="flex items-center space-x-1"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Додати</span>
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {groupForm.hostPatterns.map((pattern, index) => (
                      <div key={index} className="flex space-x-2">
                        <Input
                          type="text"
                          value={pattern}
                          onChange={(e) => handleUpdateHostPattern(index, e.target.value)}
                          placeholder="Регулярний вираз або частина назви хоста"
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRemoveHostPattern(index)}
                          className="text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">Налаштування Telegram</h3>
                  <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded">
                    <p className="text-sm text-blue-800 mb-2">
                      <strong>Режими відправки сповіщень:</strong>
                    </p>
                    <ul className="text-xs text-blue-700 list-disc list-inside space-y-1">
                      <li><strong>В групу Telegram:</strong> Якщо вказано ID групи - сповіщення відправляються в групу</li>
                      <li><strong>Окремим адміністраторам:</strong> Якщо ID групи не вказано - сповіщення відправляються кожному адміністратору з Telegram ID</li>
                    </ul>
                  </div>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ID групи Telegram (chat_id) *
                    </label>
                    <Input
                      type="text"
                      value={groupForm.telegram.groupId || ''}
                      onChange={(e) => setGroupForm({
                        ...groupForm,
                        telegram: {
                          ...groupForm.telegram,
                          groupId: e.target.value
                        }
                      })}
                      placeholder="-1001234567890"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      ID групи Telegram (зазвичай починається з -100). Якщо вказано - сповіщення відправляються в групу, інакше - окремим адміністраторам.
                    </p>
                    <p className="mt-1 text-xs text-blue-600">
                      💡 Щоб отримати ID групи: додайте бота в групу та перешліть будь-яке повідомлення. Потім перейдіть на https://api.telegram.org/bot&lt;TOKEN&gt;/getUpdates і знайдіть chat.id
                    </p>
                  </div>

                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Токен бота Telegram (опціонально)
                    </label>
                    <Input
                      type="password"
                      value={groupForm.telegram.botToken || ''}
                      onChange={(e) => setGroupForm({
                        ...groupForm,
                        telegram: {
                          ...groupForm.telegram,
                          botToken: e.target.value
                        }
                      })}
                      placeholder="Якщо не вказано - використовується глобальний бот"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Залиште порожнім, щоб використовувати глобальний бот з налаштувань. Вкажіть токен, щоб використовувати окремий бот для цієї групи.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Пріоритет
                  </label>
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    value={groupForm.priority}
                    onChange={(e) => setGroupForm({ ...groupForm, priority: parseInt(e.target.value) || 0 })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Визначає порядок перевірки груп при обробці алертів. Групи з вищим пріоритетом перевіряються першими. Якщо алерт відповідає кільком групам - всі вони отримають сповіщення, але обробка почнеться з групи з найвищим пріоритетом (0-100).
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Мінімальний інтервал між сповіщеннями (хвилини)
                  </label>
                  <Input
                    type="number"
                    min="0"
                    value={groupForm.settings.minNotificationInterval}
                    onChange={(e) => setGroupForm({
                      ...groupForm,
                      settings: {
                        ...groupForm.settings,
                        minNotificationInterval: parseInt(e.target.value) || 0
                      }
                    })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    0 = без обмежень
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={groupForm.enabled}
                      onChange={(e) => setGroupForm({ ...groupForm, enabled: e.target.checked })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Увімкнути групу</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={groupForm.settings.notifyOnResolve}
                      onChange={(e) => setGroupForm({
                        ...groupForm,
                        settings: {
                          ...groupForm.settings,
                          notifyOnResolve: e.target.checked
                        }
                      })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Відправляти сповіщення про вирішення проблем</span>
                  </label>
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={groupForm.settings.notifyOnAcknowledge}
                      onChange={(e) => setGroupForm({
                        ...groupForm,
                        settings: {
                          ...groupForm.settings,
                          notifyOnAcknowledge: e.target.checked
                        }
                      })}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm font-medium text-gray-700">Відправляти сповіщення про підтвердження проблем</span>
                  </label>
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <Button
                    variant="outline"
                    onClick={handleTestGroup}
                    disabled={testingGroup || isSaving}
                    className="flex items-center space-x-2"
                  >
                    <Send className={`h-4 w-4 ${testingGroup ? 'animate-pulse' : ''}`} />
                    <span>{testingGroup ? 'Тестування...' : 'Тестувати'}</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleCloseGroupModal}
                  >
                    Скасувати
                  </Button>
                  <Button
                    onClick={handleSaveGroup}
                    disabled={
                      isSaving || 
                      !groupForm.name || 
                      (
                        (!groupForm.telegram || !groupForm.telegram.groupId || !groupForm.telegram.groupId.trim()) &&
                        groupForm.adminIds.length === 0
                      )
                    }
                  >
                    {isSaving ? 'Збереження...' : 'Зберегти'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirm.show}
        title="Видалити групу"
        message="Ви впевнені, що хочете видалити цю групу? Ця дія незворотна."
        confirmText="Видалити"
        cancelText="Скасувати"
        onConfirm={() => deleteConfirm.groupId && handleDeleteGroup(deleteConfirm.groupId)}
        onCancel={() => setDeleteConfirm({ show: false, groupId: null })}
        type="danger"
      />
    </div>
  );
};

export default ZabbixSettings;

