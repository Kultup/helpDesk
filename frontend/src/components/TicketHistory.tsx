import React, { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, User, Edit } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import Button from './UI/Button';
import LoadingSpinner from './UI/LoadingSpinner';
import { formatDate } from '../utils';

interface TicketHistoryEntry {
  _id: string;
  ticketId: string;
  action: string;
  field?: string;
  oldValue?: any;
  newValue?: any;
  user: {
    _id: string;
    email: string;
    position?: string;
  } | null;
  description: string;
  metadata?: any;
  isVisible: boolean;
  createdAt: string;
}

interface TicketHistoryProps {
  ticketId: string;
}

export interface TicketHistoryRef {
  refreshHistory: () => Promise<void>;
}

const TicketHistory = forwardRef<TicketHistoryRef, TicketHistoryProps>(({ ticketId }, ref) => {
  const { t } = useTranslation();
  const [history, setHistory] = useState<TicketHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getTicketHistory(ticketId);
      if (response.success && response.data) {
        // Перевіряємо, чи response.data є об'єктом з полем history
        if (typeof response.data === 'object' && !Array.isArray(response.data) && 'history' in response.data) {
          const historyData = (response.data as any).history;
          if (Array.isArray(historyData)) {
            setHistory(historyData);
          } else {
            setHistory([]);
          }
        } else if (Array.isArray(response.data)) {
          // Якщо response.data вже є масивом
          setHistory(response.data);
        } else {
          setHistory([]);
        }
      } else {
        setError(response.message || 'Помилка завантаження історії');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження історії');
    } finally {
      setIsLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  useImperativeHandle(ref, () => ({
    refreshHistory: loadHistory
  }));



  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created':
        return <User className="w-6 h-6 text-green-600" />;
      case 'updated':
        return <Edit className="w-6 h-6 text-blue-600" />;
      case 'status_changed':
        return <Clock className="w-6 h-6 text-orange-600" />;
      default:
        return <Edit className="w-6 h-6 text-gray-600" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created':
        return 'border-green-200 bg-green-50';
      case 'updated':
        return 'border-blue-200 bg-blue-50';
      case 'status_changed':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-gray-200 bg-gray-50';
    }
  };

  const formatValue = (value: any, field?: string): string | React.ReactNode => {
    if (value === null || value === undefined) return t('common.notSpecified', 'Не вказано');
    
    // Спеціальна обробка для статусів
    if (field === 'status' || field === 'statusHistory') {
      if (typeof value === 'string') {
        const statusMap: { [key: string]: string } = {
          'open': t('common.statuses.open'),
          'in_progress': t('common.statuses.inProgress'),
          'resolved': t('common.statuses.resolved'),
          'closed': t('common.statuses.closed')
        };
        return statusMap[value] || value;
      }
    }
    
    // Спеціальна обробка для пріоритетів
    if (field === 'priority') {
      if (typeof value === 'string') {
        const priorityMap: { [key: string]: string } = {
          'low': t('common.priorities.low'),
          'medium': t('common.priorities.medium'),
          'high': t('common.priorities.high')
        };
        return priorityMap[value] || value;
      }
    }
    
    // Обробка масивів (особливо statusHistory)
    if (Array.isArray(value)) {
      if (field === 'statusHistory' && value.length > 0) {
        // Якщо це масив статусів, показуємо їх як читабельний список
        return (
          <div className="space-y-1">
            {value.map((item: any, index: number) => {
              if (typeof item === 'object' && item.status) {
                const statusLabel = String(t(`common.statuses.${item.status}`, item.status));
                const changedAt = item.changedAt ? formatDate(item.changedAt) : '';
                return (
                  <div key={index} className="text-sm">
                    <span className="font-medium">{statusLabel}</span>
                    {changedAt && <span className="text-gray-500 ml-2">({changedAt})</span>}
                  </div>
                );
              }
              return <div key={index} className="text-sm">{formatValue(item, field)}</div>;
            })}
          </div>
        );
      }
      // Для інших масивів показуємо як список
      if (value.length === 0) {
        return t('common.none', 'Жодного');
      }
      return value.map((item: any, index: number) => (
        <div key={index} className="text-sm">• {formatValue(item, field)}</div>
      ));
    }
    
    // Обробка об'єктів
    if (typeof value === 'object') {
      // Якщо це об'єкт з полями, які можна показати
      if (value._id || value.email || value.name) {
        return value.email || value.name || value._id || JSON.stringify(value);
      }
      // Для складних об'єктів показуємо структурований вигляд
      const keys = Object.keys(value);
      if (keys.length <= 3) {
        return keys.map(key => `${key}: ${formatValue(value[key], field)}`).join(', ');
      }
      // Для великих об'єктів - JSON, але з форматуванням
      return JSON.stringify(value, null, 2);
    }
    
    return String(value);
  };

  const getFieldLabel = (field: string) => {
    const labels: { [key: string]: string } = {
      status: t('common.status', 'Статус'),
      statusHistory: t('tickets.history', 'Історія статусів'),
      priority: t('common.priority', 'Пріоритет'),
      title: t('common.title', 'Заголовок'),
      description: t('common.description', 'Опис'),
      assignedTo: t('tickets.assignedTo', 'Призначено'),
      city: t('common.city', 'Місто'),
      category: t('common.category', 'Категорія'),
      subcategory: t('tickets.subcategory', 'Підкатегорія'),
      type: t('common.type', 'Тип'),
      department: t('users.department', 'Відділ'),
      location: t('common.location', 'Місцезнаходження'),
      dueDate: t('tickets.dueDate', 'Термін виконання'),
      estimatedHours: t('tickets.estimatedTime', 'Очікуваний час'),
      actualHours: t('tickets.actualTime', 'Фактичний час'),
      tags: t('tickets.tags', 'Теги')
    };
    return labels[field] || field;
  };
  
  const formatMetadata = (metadata: any): React.ReactNode => {
    if (!metadata || typeof metadata !== 'object') {
      return null;
    }
    
    // Якщо це простий об'єкт з невеликою кількістю ключів, показуємо структурований вигляд
    const keys = Object.keys(metadata);
    if (keys.length === 0) {
      return null;
    }
    
    return (
      <div className="space-y-2">
        {keys.map((key) => {
          const value = metadata[key];
          let displayValue: React.ReactNode;
          
          if (value === null || value === undefined) {
            displayValue = <span className="text-gray-400">{t('common.notSpecified', 'Не вказано')}</span>;
          } else if (typeof value === 'object') {
            if (Array.isArray(value)) {
              displayValue = value.length > 0 
                ? <div className="space-y-1">{value.map((item: any, idx: number) => (
                    <div key={idx} className="text-xs">• {typeof item === 'object' ? JSON.stringify(item) : String(item)}</div>
                  ))}</div>
                : <span className="text-gray-400">{t('common.none', 'Жодного')}</span>;
            } else {
              displayValue = <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto">{JSON.stringify(value, null, 2)}</pre>;
            }
          } else {
            displayValue = <span className="font-medium">{String(value)}</span>;
          }
          
          return (
            <div key={key} className="border-b border-gray-200 pb-2 last:border-b-0">
              <div className="text-xs font-semibold text-gray-700 mb-1">{key}:</div>
              <div className="text-sm text-gray-900">{displayValue}</div>
            </div>
          );
        })}
      </div>
    );
  };

  // Завжди показуємо всю історію
  const filteredHistory = Array.isArray(history) ? history : [];

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600">Завантаження історії...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="p-6 text-center text-red-600">
          <p>{error}</p>
          <Button onClick={loadHistory} className="mt-2" size="sm">
            Спробувати знову
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">Історія змін</h3>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500">Історія змін поки порожня</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((entry) => (
              <div
                 key={entry._id}
                 className={`border-l-4 pl-4 py-3 ${getActionColor(entry.action)}`}
               >
                 <div className="flex items-start space-x-3">
                   <div className="mt-1 flex-shrink-0">
                     {getActionIcon(entry.action)}
                   </div>
                   <div className="flex-1 min-w-0">
                     <div className="flex items-center flex-wrap gap-2 mb-2">
                       <span className="text-sm font-semibold text-gray-900">
                         {entry.user?.email || 'Невідомий користувач'}
                       </span>
                       {entry.user?.position && (
                         <span className="text-xs font-medium text-gray-700 bg-gray-200 px-2 py-1 rounded">
                           {entry.user.position}
                         </span>
                       )}
                       <span className="text-sm text-gray-600 whitespace-nowrap">
                         {formatDate(entry.createdAt)}
                       </span>
                     </div>
                     
                     <p className="text-base text-gray-900 mb-3 font-medium leading-relaxed">{entry.description}</p>
                     
                     {entry.field && (entry.oldValue !== undefined || entry.newValue !== undefined) && (
                       <div className="bg-white p-3 rounded border border-gray-200 shadow-sm text-sm">
                         <div className="font-semibold text-gray-800 mb-2">
                           Поле: {getFieldLabel(entry.field)}
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                           {entry.oldValue !== undefined && (
                             <div>
                               <span className="text-red-600 font-semibold">{t('common.was', 'Було')}:</span>
                               <div className="text-gray-900 bg-red-50 p-2 rounded mt-1 font-medium">
                                 {typeof formatValue(entry.oldValue, entry.field) === 'string' 
                                   ? formatValue(entry.oldValue, entry.field) 
                                   : <div>{formatValue(entry.oldValue, entry.field)}</div>}
                               </div>
                             </div>
                           )}
                           {entry.newValue !== undefined && (
                             <div>
                               <span className="text-green-600 font-semibold">{t('common.became', 'Стало')}:</span>
                               <div className="text-gray-900 bg-green-50 p-2 rounded mt-1 font-medium">
                                 {typeof formatValue(entry.newValue, entry.field) === 'string' 
                                   ? formatValue(entry.newValue, entry.field) 
                                   : <div>{formatValue(entry.newValue, entry.field)}</div>}
                               </div>
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                     
                     {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                       <div className="mt-2 text-sm text-gray-700">
                         <details className="cursor-pointer">
                           <summary className="hover:text-gray-900 font-medium text-gray-900">
                             • {t('common.additionalInfo', 'Додаткова інформація')}
                           </summary>
                           <div className="mt-2 bg-gray-50 p-3 rounded border border-gray-200">
                             {formatMetadata(entry.metadata)}
                           </div>
                         </details>
                       </div>
                     )}
                   </div>
                 </div>
               </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
});

TicketHistory.displayName = 'TicketHistory';

export default TicketHistory;