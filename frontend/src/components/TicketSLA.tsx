import React, { useEffect, useState } from 'react';
import { Clock, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';
import { apiService } from '../services/api';
import Card from './UI/Card';
import LoadingSpinner from './UI/LoadingSpinner';
import { formatDate } from '../utils';

interface TicketSLAProps {
  ticketId: string;
}

interface SLAStatus {
  ticket: {
    _id: string;
    ticketNumber: string;
    status: string;
    priority: string;
  };
  sla: {
    responseTime: number;
    resolutionTime: number;
    dueDate: string | null;
    policy: {
      _id: string;
      name: string;
    } | null;
  };
  metrics: {
    responseTime: number;
    resolutionTime: number;
    escalationCount: number;
  };
  status: {
    isBreached: boolean;
    breachType: string | null;
    percentage: number;
    timeRemaining: number;
    responseDeadline: string;
    resolutionDeadline: string;
    firstResponseAt: string | null;
    resolvedAt: string | null;
  };
  warnings: Array<{
    percentage: number;
    sentAt: string;
    notifiedUsers: any[];
  }>;
  escalationHistory: Array<{
    level: number;
    escalatedAt: string;
    escalatedBy: any;
    escalatedTo: any;
    reason: string;
    percentage: number;
    slaBreachType: string;
  }>;
}

const TicketSLA: React.FC<TicketSLAProps> = ({ ticketId }) => {
  const [slaStatus, setSlaStatus] = useState<SLAStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSLAStatus();
  }, [ticketId]);

  const loadSLAStatus = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await apiService.getTicketSLAStatus(ticketId);
      if (response.success && response.data) {
        setSlaStatus(response.data);
      } else {
        setError(response.message || 'Помилка завантаження SLA статусу');
      }
    } catch (err: any) {
      setError(err.message || 'Помилка завантаження SLA статусу');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <div className="p-6 text-center">
          <LoadingSpinner />
          <p className="mt-2 text-sm text-gray-600">Завантаження SLA статусу...</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="p-6 text-center text-red-600">
          <p>{error}</p>
        </div>
      </Card>
    );
  }

  if (!slaStatus) {
    return null;
  }

  const { sla, metrics, status, warnings, escalationHistory } = slaStatus;

  // Визначаємо колір індикатора
  const getStatusColor = () => {
    if (status.isBreached) return 'text-red-600 bg-red-50 border-red-200';
    if (status.percentage >= 80) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    if (status.percentage >= 50) return 'text-blue-600 bg-blue-50 border-blue-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getStatusIcon = () => {
    if (status.isBreached) return <AlertCircle className="w-5 h-5 text-red-600" />;
    if (status.percentage >= 80) return <Clock className="w-5 h-5 text-yellow-600" />;
    return <CheckCircle className="w-5 h-5 text-green-600" />;
  };

  const formatTime = (hours: number) => {
    if (hours < 1) {
      return `${Math.round(hours * 60)} хв`;
    }
    if (hours < 24) {
      return `${Math.round(hours)} год`;
    }
    const days = Math.floor(hours / 24);
    const remainingHours = Math.round(hours % 24);
    return `${days} дн ${remainingHours} год`;
  };

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold text-gray-900">SLA Статус</h3>
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${getStatusColor()}`}>
            {getStatusIcon()}
            <span className="text-sm font-medium">
              {status.isBreached ? 'Порушено' : `${status.percentage}%`}
            </span>
          </div>
        </div>

        {/* Прогрес-бар */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Прогрес виконання</span>
            <span className="text-sm text-gray-600">
              {status.timeRemaining > 0 ? `Залишилось: ${formatTime(status.timeRemaining)}` : 'Час вичерпано'}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-300 ${
                status.isBreached
                  ? 'bg-red-500'
                  : status.percentage >= 80
                  ? 'bg-yellow-500'
                  : status.percentage >= 50
                  ? 'bg-blue-500'
                  : 'bg-green-500'
              }`}
              style={{ width: `${Math.min(100, status.percentage)}%` }}
            />
          </div>
        </div>

        {/* SLA Інформація */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Час відповіді</span>
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {sla.responseTime} год
            </div>
            {status.firstResponseAt && (
              <div className="text-xs text-gray-500 mt-1">
                Відповідь: {formatDate(status.firstResponseAt)}
              </div>
            )}
            {!status.firstResponseAt && (
              <div className="text-xs text-gray-500 mt-1">
                Дедлайн: {formatDate(status.responseDeadline)}
              </div>
            )}
          </div>

          <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">Час вирішення</span>
            </div>
            <div className="text-lg font-semibold text-gray-900">
              {sla.resolutionTime} год
            </div>
            {status.resolvedAt && (
              <div className="text-xs text-gray-500 mt-1">
                Вирішено: {formatDate(status.resolvedAt)}
              </div>
            )}
            {!status.resolvedAt && (
              <div className="text-xs text-gray-500 mt-1">
                Дедлайн: {formatDate(status.resolutionDeadline)}
              </div>
            )}
          </div>
        </div>

        {/* Метрики */}
        {metrics.responseTime > 0 || metrics.resolutionTime > 0 ? (
          <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Фактичні метрики</h4>
            <div className="grid grid-cols-2 gap-4">
              {metrics.responseTime > 0 && (
                <div>
                  <span className="text-xs text-gray-600">Час відповіді:</span>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatTime(metrics.responseTime)}
                  </div>
                </div>
              )}
              {metrics.resolutionTime > 0 && (
                <div>
                  <span className="text-xs text-gray-600">Час вирішення:</span>
                  <div className="text-sm font-semibold text-gray-900">
                    {formatTime(metrics.resolutionTime)}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}

        {/* Попередження */}
        {warnings.length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Відправлені попередження</h4>
            <div className="space-y-2">
              {warnings.map((warning, index) => (
                <div
                  key={index}
                  className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-gray-700">
                      Попередження при {warning.percentage}% використання часу
                    </span>
                    <span className="text-gray-500 text-xs">
                      {formatDate(warning.sentAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Історія ескалацій */}
        {escalationHistory.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">Історія ескалацій</h4>
            <div className="space-y-2">
              {escalationHistory.map((escalation, index) => (
                <div
                  key={index}
                  className="p-3 bg-orange-50 rounded-lg border border-orange-200 text-sm"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-gray-900">
                      Ескалація рівень {escalation.level}
                    </span>
                    <span className="text-gray-500 text-xs">
                      {formatDate(escalation.escalatedAt)}
                    </span>
                  </div>
                  {escalation.reason && (
                    <div className="text-gray-700 text-xs mt-1">{escalation.reason}</div>
                  )}
                  <div className="text-gray-500 text-xs mt-1">
                    {escalation.percentage}% використано часу
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SLA Політика */}
        {sla.policy && (
          <div className="mt-6 pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-600">
              <span className="font-medium">SLA Політика:</span> {sla.policy.name}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default TicketSLA;

