import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import Card, { CardContent, CardHeader } from '../components/UI/Card';
import Button from '../components/UI/Button';
import Input from '../components/UI/Input';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { Plus, Edit2, Save, X, Trash2, Settings, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface SLAPolicy {
  _id: string;
  name: string;
  description?: string;
  category?: { _id: string; name: string };
  priorities: {
    low: { responseTime: number; resolutionTime: number; enabled: boolean };
    medium: { responseTime: number; resolutionTime: number; enabled: boolean };
    high: { responseTime: number; resolutionTime: number; enabled: boolean };
    urgent: { responseTime: number; resolutionTime: number; enabled: boolean };
  };
  escalationLevels: Array<{
    level: number;
    name: string;
    percentage: number;
    action: string;
  }>;
  autoEscalation: {
    enabled: boolean;
    onResponseBreach: boolean;
    onResolutionBreach: boolean;
  };
  warnings: {
    enabled: boolean;
    levels: Array<{
      percentage: number;
      notifyUsers: string[];
      notifyChannels: string[];
    }>;
  };
  isActive: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

interface EditFormData {
  name: string;
  description: string;
  category: string;
  priorities: {
    low: { responseTime: number; resolutionTime: number; enabled: boolean };
    medium: { responseTime: number; resolutionTime: number; enabled: boolean };
    high: { responseTime: number; resolutionTime: number; enabled: boolean };
    urgent: { responseTime: number; resolutionTime: number; enabled: boolean };
  };
  escalationLevels: Array<{
    level: number;
    name: string;
    percentage: number;
    action: string;
  }>;
  autoEscalation: {
    enabled: boolean;
    onResponseBreach: boolean;
    onResolutionBreach: boolean;
  };
  warnings: {
    enabled: boolean;
    levels: Array<{
      percentage: number;
      notifyUsers: string[];
      notifyChannels: string[];
    }>;
  };
  isActive: boolean;
  isDefault: boolean;
}

interface Category {
  _id: string;
  name: string;
  color?: string;
}

const SLASettings: React.FC = () => {
  const [policies, setPolicies] = useState<SLAPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingPolicy, setEditingPolicy] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editForm, setEditForm] = useState<EditFormData>({
    name: '',
    description: '',
    category: '',
    priorities: {
      low: { responseTime: 48, resolutionTime: 120, enabled: true },
      medium: { responseTime: 24, resolutionTime: 72, enabled: true },
      high: { responseTime: 4, resolutionTime: 24, enabled: true },
      urgent: { responseTime: 1, resolutionTime: 8, enabled: true }
    },
    escalationLevels: [],
    autoEscalation: {
      enabled: false,
      onResponseBreach: false,
      onResolutionBreach: true
    },
    warnings: {
      enabled: true,
      levels: [
        { percentage: 50, notifyUsers: [], notifyChannels: ['web'] },
        { percentage: 80, notifyUsers: [], notifyChannels: ['web', 'telegram'] }
      ]
    },
    isActive: true,
    isDefault: false
  });
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    loadPolicies();
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

  const loadPolicies = async (): Promise<void> => {
    try {
      setIsLoading(true);
      const response = await apiService.getSLAPolicies({ active: true });
      if (response.success && response.data) {
        const resData = response.data as unknown as { data?: SLAPolicy[] };
        setPolicies(resData.data || []);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading SLA policies:', error);
      setError('Помилка завантаження SLA політик');
    } finally {
      setIsLoading(false);
    }
  };

  const loadCategories = async (): Promise<void> => {
    try {
      const response = await apiService.getCategories(true);
      if (response.data) {
        setCategories(response.data as Category[]);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Error loading categories:', error);
    }
  };

  const handleCreate = (): void => {
    setIsCreating(true);
    setEditingPolicy(null);
    setEditForm({
      name: '',
      description: '',
      category: '',
      priorities: {
        low: { responseTime: 48, resolutionTime: 120, enabled: true },
        medium: { responseTime: 24, resolutionTime: 72, enabled: true },
        high: { responseTime: 4, resolutionTime: 24, enabled: true },
        urgent: { responseTime: 1, resolutionTime: 8, enabled: true }
      },
      escalationLevels: [],
      autoEscalation: {
        enabled: false,
        onResponseBreach: false,
        onResolutionBreach: true
      },
      warnings: {
        enabled: true,
        levels: [
          { percentage: 50, notifyUsers: [], notifyChannels: ['web'] },
          { percentage: 80, notifyUsers: [], notifyChannels: ['web', 'telegram'] }
        ]
      },
      isActive: true,
      isDefault: false
    });
  };

  const handleEdit = (policy: SLAPolicy): void => {
    setEditingPolicy(policy._id);
    setIsCreating(false);
    setEditForm({
      name: policy.name,
      description: policy.description || '',
      category: policy.category?._id || '',
      priorities: policy.priorities,
      escalationLevels: policy.escalationLevels || [],
      autoEscalation: policy.autoEscalation,
      warnings: policy.warnings,
      isActive: policy.isActive,
      isDefault: policy.isDefault
    });
  };

  const handleSave = async (): Promise<void> => {
    try {
      setError(null);
      if (isCreating) {
        const response = await apiService.createSLAPolicy(editForm as unknown as Record<string, unknown>);
        if (response.success) {
          setSuccess('SLA політика успішно створена');
          await loadPolicies();
          setIsCreating(false);
          setEditForm({
            name: '',
            description: '',
            category: '',
            priorities: {
              low: { responseTime: 48, resolutionTime: 120, enabled: true },
              medium: { responseTime: 24, resolutionTime: 72, enabled: true },
              high: { responseTime: 4, resolutionTime: 24, enabled: true },
              urgent: { responseTime: 1, resolutionTime: 8, enabled: true }
            },
            escalationLevels: [],
            autoEscalation: {
              enabled: false,
              onResponseBreach: false,
              onResolutionBreach: true
            },
            warnings: {
              enabled: true,
              levels: [
                { percentage: 50, notifyUsers: [], notifyChannels: ['web'] },
                { percentage: 80, notifyUsers: [], notifyChannels: ['web', 'telegram'] }
              ]
            },
            isActive: true,
            isDefault: false
          });
        } else {
          setError(response.message || 'Помилка створення SLA політики');
        }
      } else if (editingPolicy) {
        const response = await apiService.updateSLAPolicy(editingPolicy, editForm as unknown as Record<string, unknown>);
        if (response.success) {
          setSuccess('SLA політика успішно оновлена');
          await loadPolicies();
          setEditingPolicy(null);
        } else {
          setError(response.message || 'Помилка оновлення SLA політики');
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error && typeof error.response === 'object' && error.response !== null && 'data' in error.response && typeof error.response.data === 'object' && error.response.data !== null && 'message' in error.response.data && typeof error.response.data.message === 'string'
        ? error.response.data.message
        : 'Помилка збереження SLA політики';
      setError(errorMessage);
    }
  };

  const handleDelete = async (policyId: string): Promise<void> => {
    if (!window.confirm('Ви впевнені, що хочете видалити цю SLA політику?')) {
      return;
    }

    try {
      const response = await apiService.deleteSLAPolicy(policyId);
      if (response.success) {
        setSuccess('SLA політика успішно видалена');
        await loadPolicies();
      } else {
        setError(response.message || 'Помилка видалення SLA політики');
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error && 'response' in error && typeof error.response === 'object' && error.response !== null && 'data' in error.response && typeof error.response.data === 'object' && error.response.data !== null && 'message' in error.response.data && typeof error.response.data.message === 'string'
        ? error.response.data.message
        : 'Помилка видалення SLA політики';
      setError(errorMessage);
    }
  };

  const handleCancel = (): void => {
    setIsCreating(false);
    setEditingPolicy(null);
    setEditForm({
      name: '',
      description: '',
      category: '',
      priorities: {
        low: { responseTime: 48, resolutionTime: 120, enabled: true },
        medium: { responseTime: 24, resolutionTime: 72, enabled: true },
        high: { responseTime: 4, resolutionTime: 24, enabled: true },
        urgent: { responseTime: 1, resolutionTime: 8, enabled: true }
      },
      escalationLevels: [],
      autoEscalation: {
        enabled: false,
        onResponseBreach: false,
        onResolutionBreach: true
      },
      warnings: {
        enabled: true,
        levels: [
          { percentage: 50, notifyUsers: [], notifyChannels: ['web'] },
          { percentage: 80, notifyUsers: [], notifyChannels: ['web', 'telegram'] }
        ]
      },
      isActive: true,
      isDefault: false
    });
  };

  const updatePriority = (priority: 'low' | 'medium' | 'high' | 'urgent', field: 'responseTime' | 'resolutionTime' | 'enabled', value: number | boolean): void => {
    setEditForm({
      ...editForm,
      priorities: {
        ...editForm.priorities,
        [priority]: {
          ...editForm.priorities[priority],
          [field]: value
        }
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

  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          SLA Налаштування
        </h1>
        <p className="text-gray-600 mt-2">Управління SLA політиками та налаштуваннями</p>
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

      {/* Форма створення/редагування */}
      {(isCreating || editingPolicy) && (
        <Card className="mb-6">
          <CardHeader
            title={isCreating ? 'Створити SLA політику' : 'Редагувати SLA політику'}
            action={
              <Button variant="outline" size="sm" onClick={handleCancel}>
                <X className="w-4 h-4" />
              </Button>
            }
          />
          <CardContent>
            <div className="space-y-4">
              <Input
                label="Назва політики"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Наприклад: Стандартна SLA політика"
                required
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Опис
                </label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Опис політики..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Категорія (опціонально)
                </label>
                <select
                  value={editForm.category}
                  onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Всі категорії</option>
                  {categories.map((cat) => (
                    <option key={cat._id} value={cat._id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* SLA по пріоритетам */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">SLA по пріоритетам</h3>
                <div className="space-y-4">
                  {['low', 'medium', 'high', 'urgent'].map((priority) => (
                    <div key={priority} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="flex items-center justify-between mb-3">
                        <label htmlFor={`priority-${priority}-enabled`} className="flex items-center gap-2">
                          <input
                            id={`priority-${priority}-enabled`}
                            type="checkbox"
                            checked={editForm.priorities[priority as keyof typeof editForm.priorities].enabled}
                            onChange={(e): void => {
                              const priorityKey = priority as 'low' | 'medium' | 'high' | 'urgent';
                              updatePriority(priorityKey, 'enabled', e.target.checked);
                            }}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="font-medium text-gray-900 capitalize">{priority}</span>
                        </label>
                      </div>
                      {editForm.priorities[priority as keyof typeof editForm.priorities].enabled && (
                        <div className="grid grid-cols-2 gap-4">
                          <Input
                            label="Час відповіді (години)"
                            type="number"
                            value={editForm.priorities[priority as keyof typeof editForm.priorities].responseTime}
                            onChange={(e): void => {
                              const priorityKey = priority as 'low' | 'medium' | 'high' | 'urgent';
                              updatePriority(priorityKey, 'responseTime', parseInt(e.target.value, 10));
                            }}
                            min="0"
                          />
                          <Input
                            label="Час вирішення (години)"
                            type="number"
                            value={editForm.priorities[priority as keyof typeof editForm.priorities].resolutionTime}
                            onChange={(e): void => {
                              const priorityKey = priority as 'low' | 'medium' | 'high' | 'urgent';
                              updatePriority(priorityKey, 'resolutionTime', parseInt(e.target.value, 10));
                            }}
                            min="0"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Автоматична ескалація */}
              <div className="border-t pt-4 mt-4">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Автоматична ескалація</h3>
                <div className="space-y-3">
                  <label htmlFor="auto-escalation-enabled" className="flex items-center gap-2">
                    <input
                      id="auto-escalation-enabled"
                      type="checkbox"
                      checked={editForm.autoEscalation.enabled}
                      onChange={(e): void =>
                        setEditForm({
                          ...editForm,
                          autoEscalation: { ...editForm.autoEscalation, enabled: e.target.checked }
                        })
                      }
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">Увімкнути автоматичну ескалацію</span>
                  </label>
                  {editForm.autoEscalation.enabled && (
                    <div className="ml-6 space-y-2">
                      <label htmlFor="auto-escalation-response-breach" className="flex items-center gap-2">
                        <input
                          id="auto-escalation-response-breach"
                          type="checkbox"
                          checked={editForm.autoEscalation.onResponseBreach}
                          onChange={(e): void =>
                            setEditForm({
                              ...editForm,
                              autoEscalation: {
                                ...editForm.autoEscalation,
                                onResponseBreach: e.target.checked
                              }
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Ескалювати при порушенні часу відповіді</span>
                      </label>
                      <label htmlFor="auto-escalation-resolution-breach" className="flex items-center gap-2">
                        <input
                          id="auto-escalation-resolution-breach"
                          type="checkbox"
                          checked={editForm.autoEscalation.onResolutionBreach}
                          onChange={(e): void =>
                            setEditForm({
                              ...editForm,
                              autoEscalation: {
                                ...editForm.autoEscalation,
                                onResolutionBreach: e.target.checked
                              }
                            })
                          }
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Ескалювати при порушенні часу вирішення</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {/* Дефолтна політика */}
              <div className="border-t pt-4 mt-4">
                <label htmlFor="is-default-policy" className="flex items-center gap-2">
                  <input
                    id="is-default-policy"
                    type="checkbox"
                    checked={editForm.isDefault}
                    onChange={(e): void => setEditForm({ ...editForm, isDefault: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Встановити як політику за замовчуванням</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleCancel}>
                  Скасувати
                </Button>
                <Button onClick={handleSave}>
                  <Save className="w-4 h-4 mr-2" />
                  Зберегти
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Список політик */}
      <Card>
        <CardHeader
          title="SLA Політики"
          action={
            !isCreating && !editingPolicy && (
              <Button onClick={handleCreate}>
                <Plus className="w-4 h-4 mr-2" />
                Створити політику
              </Button>
            )
          }
        />
        <CardContent>
          {policies.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <p>Немає SLA політик</p>
            </div>
          ) : (
            <div className="space-y-4">
              {policies.map((policy) => (
                <div
                  key={policy._id}
                  className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">{policy.name}</h3>
                        {policy.isDefault && (
                          <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                            За замовчуванням
                          </span>
                        )}
                        {!policy.isActive && (
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded">
                            Неактивна
                          </span>
                        )}
                      </div>
                      {policy.description && (
                        <p className="text-sm text-gray-600 mb-2">{policy.description}</p>
                      )}
                      {policy.category && (
                        <p className="text-xs text-gray-500">Категорія: {policy.category.name}</p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
                        <span>
                          Low: {policy.priorities.low.responseTime}/{policy.priorities.low.resolutionTime} год
                        </span>
                        <span>
                          Medium: {policy.priorities.medium.responseTime}/{policy.priorities.medium.resolutionTime} год
                        </span>
                        <span>
                          High: {policy.priorities.high.responseTime}/{policy.priorities.high.resolutionTime} год
                        </span>
                        <span>
                          Urgent: {policy.priorities.urgent.responseTime}/{policy.priorities.urgent.resolutionTime} год
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(policy)}
                        disabled={isCreating || editingPolicy !== null}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(policy._id)}
                        disabled={isCreating || editingPolicy !== null}
                        className="text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SLASettings;

