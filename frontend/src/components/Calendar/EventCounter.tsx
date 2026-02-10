import React, { useMemo } from 'react';
import { Calendar, Clock, TrendingUp, AlertCircle } from 'lucide-react';
import { CalendarEvent, EventType, EventPriority } from '../../types';

interface EventCounterProps {
  events: CalendarEvent[];
  currentDate: Date;
  className?: string;
}

interface EventStats {
  today: number;
  thisWeek: number;
  thisMonth: number;
  upcoming: number;
  overdue: number;
  highPriority: number;
  byType: Record<EventType, number>;
}

const EventCounter: React.FC<EventCounterProps> = ({ events, currentDate, className = '' }) => {
  const stats = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

    const eventStats: EventStats = {
      today: 0,
      thisWeek: 0,
      thisMonth: 0,
      upcoming: 0,
      overdue: 0,
      highPriority: 0,
      byType: {
        [EventType.MEETING]: 0,
        [EventType.TASK]: 0,
        [EventType.REMINDER]: 0,
        [EventType.DEADLINE]: 0,
        [EventType.APPOINTMENT]: 0,
        [EventType.HOLIDAY]: 0,
      },
    };

    events.forEach(event => {
      const eventDate = new Date(event.date);
      const eventDateOnly = new Date(
        eventDate.getFullYear(),
        eventDate.getMonth(),
        eventDate.getDate()
      );

      // Підрахунок за періодами
      if (eventDateOnly.getTime() === today.getTime()) {
        eventStats.today++;
      }

      if (eventDate >= startOfWeek && eventDate <= endOfWeek) {
        eventStats.thisWeek++;
      }

      if (eventDate >= startOfMonth && eventDate <= endOfMonth) {
        eventStats.thisMonth++;
      }

      if (eventDate >= tomorrow) {
        eventStats.upcoming++;
      }

      if (eventDate < today) {
        eventStats.overdue++;
      }

      // Підрахунок високопріоритетних подій
      if (event.priority === EventPriority.HIGH) {
        eventStats.highPriority++;
      }

      // Підрахунок за типами
      if (event.type && Object.prototype.hasOwnProperty.call(eventStats.byType, event.type)) {
        eventStats.byType[event.type as EventType]++;
      }
    });

    return eventStats;
  }, [events, currentDate]);

  const getTypeIcon = (type: EventType) => {
    switch (type) {
      case EventType.MEETING:
        return '👥';
      case EventType.TASK:
        return '✅';
      case EventType.REMINDER:
        return '🔔';
      case EventType.DEADLINE:
        return '⏰';
      case EventType.APPOINTMENT:
        return '📅';
      case EventType.HOLIDAY:
        return '🎉';
      default:
        return '📋';
    }
  };

  const getTypeLabel = (type: EventType) => {
    const labels = {
      [EventType.MEETING]: 'Зустрічі',
      [EventType.TASK]: 'Завдання',
      [EventType.REMINDER]: 'Нагадування',
      [EventType.DEADLINE]: 'Дедлайни',
      [EventType.APPOINTMENT]: 'Призначення',
      [EventType.HOLIDAY]: 'Свята',
    };
    return labels[type] || 'Інше';
  };

  return (
    <div className={`bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-800 flex items-center">
          <TrendingUp className="h-4 w-4 mr-2 text-blue-600" />
          Статистика подій
        </h4>
        <div className="text-xs text-gray-500">
          {currentDate.toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      {/* Основна статистика */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">Сьогодні</div>
              <div className="text-lg font-bold text-blue-600">{stats.today}</div>
            </div>
            <Calendar className="h-5 w-5 text-blue-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">Цей тиждень</div>
              <div className="text-lg font-bold text-green-600">{stats.thisWeek}</div>
            </div>
            <Clock className="h-5 w-5 text-green-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">Цей місяць</div>
              <div className="text-lg font-bold text-purple-600">{stats.thisMonth}</div>
            </div>
            <Calendar className="h-5 w-5 text-purple-400" />
          </div>
        </div>

        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-gray-500 mb-1">Майбутні</div>
              <div className="text-lg font-bold text-indigo-600">{stats.upcoming}</div>
            </div>
            <TrendingUp className="h-5 w-5 text-indigo-400" />
          </div>
        </div>
      </div>

      {/* Попередження про прострочені та високопріоритетні */}
      {(stats.overdue > 0 || stats.highPriority > 0) && (
        <div className="mb-4 space-y-2">
          {stats.overdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-2 flex items-center">
              <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
              <span className="text-xs text-red-700">
                <strong>{stats.overdue}</strong> прострочених подій
              </span>
            </div>
          )}

          {stats.highPriority > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 flex items-center">
              <AlertCircle className="h-4 w-4 text-orange-500 mr-2" />
              <span className="text-xs text-orange-700">
                <strong>{stats.highPriority}</strong> високопріоритетних подій
              </span>
            </div>
          )}
        </div>
      )}

      {/* Розподіл за типами */}
      <div className="bg-white rounded-lg p-3 shadow-sm">
        <div className="text-xs text-gray-500 mb-2">Розподіл за типами</div>
        <div className="space-y-1">
          {Object.entries(stats.byType)
            .filter(([_, count]) => count > 0)
            .sort(([_, a], [__, b]) => b - a)
            .slice(0, 3)
            .map(([type, count]) => (
              <div key={type} className="flex items-center justify-between text-xs">
                <span className="flex items-center">
                  <span className="mr-2">{getTypeIcon(type as EventType)}</span>
                  {getTypeLabel(type as EventType)}
                </span>
                <span className="font-semibold text-gray-700">{count}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};

export default EventCounter;
