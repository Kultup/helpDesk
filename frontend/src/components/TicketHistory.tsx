import React, { useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';
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
        return <User className="w-5 h-5 text-green-600 dark:text-green-400" />;
      case 'updated':
        return <Edit className="w-5 h-5 text-blue-600 dark:text-blue-400" />;
      case 'status_changed':
        return <Clock className="w-5 h-5 text-orange-600 dark:text-orange-400" />;
      default:
        return <Edit className="w-5 h-5 text-gray-600 dark:text-gray-400" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created':
        return 'border-green-200 dark:border-green-700 bg-green-50 dark:bg-green-900/20';
      case 'updated':
        return 'border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20';
      case 'status_changed':
        return 'border-orange-200 dark:border-orange-700 bg-orange-50 dark:bg-orange-900/20';
      default:
        return 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50';
    }
  };

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return 'Не вказано';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getFieldLabel = (field: string) => {
    const labels: { [key: string]: string } = {
      status: 'Статус',
      priority: 'Пріоритет',
      title: 'Заголовок',
      description: 'Опис',
      assignedTo: 'Призначено',
      city: 'Місто',
      category: 'Категорія',
      subcategory: 'Підкategorія',
      type: 'Тип',
      department: 'Відділ',
      location: 'Місцезнаходження',
      dueDate: 'Термін виконання',
      estimatedHours: 'Оціночний час',
      actualHours: 'Фактичний час',
      tags: 'Теги'
    };
    return labels[field] || field;
  };

  // Завжди показуємо всю історію
  const filteredHistory = Array.isArray(history) ? history : [];

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">Завантаження історії...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="p-6 text-center text-red-600 dark:text-red-400">
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
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Історія змін</h3>
        </div>

        {filteredHistory.length === 0 ? (
          <div className="text-center py-8">
            <Clock className="h-12 w-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Історія змін поки порожня</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((entry) => (
              <div
                 key={entry._id}
                 className={`border-l-4 pl-4 py-3 ${getActionColor(entry.action)}`}
               >
                 <div className="flex items-start space-x-3">
                   <div className="mt-1">
                     {getActionIcon(entry.action)}
                   </div>
                   <div className="flex-1">
                     <div className="flex items-center flex-wrap gap-2 mb-2">
                       <span className="text-sm font-medium text-gray-900 dark:text-gray-50">
                         {entry.user?.email || 'Невідомий користувач'}
                       </span>
                       {entry.user?.position && (
                         <span className="text-xs text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 px-2 py-1 rounded">
                           {entry.user.position}
                         </span>
                       )}
                       <span className="text-sm text-gray-600 dark:text-gray-400">
                         {formatDate(entry.createdAt)}
                       </span>
                     </div>
                     
                     <p className="text-sm text-gray-800 dark:text-gray-200 mb-3">{entry.description}</p>
                     
                     {entry.field && (entry.oldValue !== undefined || entry.newValue !== undefined) && (
                       <div className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 text-sm">
                         <div className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                           Поле: {getFieldLabel(entry.field)}
                         </div>
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                           {entry.oldValue !== undefined && (
                             <div>
                               <span className="text-red-600 dark:text-red-400 font-medium">Було:</span>
                               <div className="text-gray-800 dark:text-gray-200 bg-red-50 dark:bg-red-900/20 p-2 rounded mt-1">
                                 {formatValue(entry.oldValue)}
                               </div>
                             </div>
                           )}
                           {entry.newValue !== undefined && (
                             <div>
                               <span className="text-green-600 dark:text-green-400 font-medium">Стало:</span>
                               <div className="text-gray-800 dark:text-gray-200 bg-green-50 dark:bg-green-900/20 p-2 rounded mt-1">
                                 {formatValue(entry.newValue)}
                               </div>
                             </div>
                           )}
                         </div>
                       </div>
                     )}
                     
                     {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                       <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                         <details>
                           <summary className="cursor-pointer hover:text-gray-900 dark:hover:text-gray-200">• Додаткова інформація</summary>
                           <pre className="mt-1 bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs overflow-x-auto text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                             {JSON.stringify(entry.metadata, null, 2)}
                           </pre>
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