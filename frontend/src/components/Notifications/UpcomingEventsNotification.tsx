import React, { useState, useEffect } from 'react';
import { Bell, Clock, MapPin, Calendar, X, AlertCircle } from 'lucide-react';
import { CalendarEvent, EventType, EventPriority } from '../../types';
import apiService from '../../services/api';

interface UpcomingEventsNotificationProps {
  className?: string;
}

const UpcomingEventsNotification: React.FC<UpcomingEventsNotificationProps> = ({ className = '' }) => {
  const [upcomingEvents, setUpcomingEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [dismissedEvents, setDismissedEvents] = useState<Set<string>>(new Set());

  // Кольори для типів подій
  const EVENT_COLORS = {
    [EventType.MEETING]: { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-300', icon: 'text-blue-500' },
    [EventType.TASK]: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-300', icon: 'text-green-500' },
    [EventType.REMINDER]: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-300', icon: 'text-yellow-500' },
    [EventType.DEADLINE]: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-300', icon: 'text-red-500' },
    [EventType.APPOINTMENT]: { bg: 'bg-purple-100', text: 'text-purple-700', border: 'border-purple-300', icon: 'text-purple-500' },
    [EventType.HOLIDAY]: { bg: 'bg-pink-100', text: 'text-pink-700', border: 'border-pink-300', icon: 'text-pink-500' }
  };

  // Завантаження найближчих подій
  const loadUpcomingEvents = async () => {
    try {
      setLoading(true);
      const response = await apiService.getUpcomingEvents();
      if (response.success) {
        setUpcomingEvents(response.data || []);
      }
    } catch (error) {
      console.error('Помилка завантаження найближчих подій:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUpcomingEvents();
    // Оновлювати кожні 5 хвилин
    const interval = setInterval(loadUpcomingEvents, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Фільтрація подій, які не були відхилені
  const visibleEvents = upcomingEvents.filter(event => !dismissedEvents.has(event._id));

  // Функція для відхилення сповіщення
  const dismissEvent = (eventId: string) => {
    setDismissedEvents(prev => new Set(Array.from(prev).concat(eventId)));
  };

  // Функція для форматування дати
  const formatEventDate = (date: string) => {
    const eventDate = new Date(date);
    const now = new Date();
    const diffTime = eventDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Сьогодні';
    } else if (diffDays === 1) {
      return 'Завтра';
    } else if (diffDays <= 7) {
      return `Через ${diffDays} дн.`;
    } else {
      return eventDate.toLocaleDateString('uk-UA', { 
        day: 'numeric', 
        month: 'short' 
      });
    }
  };

  // Функція для отримання пріоритету
  const getPriorityIcon = (priority: EventPriority) => {
    if (priority === EventPriority.URGENT || priority === EventPriority.HIGH) {
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
    return null;
  };

  // Якщо немає подій для відображення
  if (visibleEvents.length === 0) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Кнопка сповіщень */}
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
        title="Найближчі події"
      >
        <Bell className="h-5 w-5" />
        {visibleEvents.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {visibleEvents.length}
          </span>
        )}
      </button>

      {/* Випадаюче меню з сповіщеннями */}
      {showNotifications && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 max-h-96 overflow-y-auto">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-800">Найближчі події</h3>
              <button
                onClick={() => setShowNotifications(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-gray-500">
                Завантаження...
              </div>
            ) : (
              <div className="space-y-2 p-2">
                {visibleEvents.map((event) => {
                  const eventColors = EVENT_COLORS[event.type] || EVENT_COLORS[EventType.REMINDER];
                  
                  return (
                    <div
                      key={event._id}
                      className={`p-3 rounded-lg border ${eventColors.bg} ${eventColors.border} hover:shadow-md transition-shadow`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <Calendar className={`h-4 w-4 ${eventColors.icon}`} />
                            <span className={`text-sm font-medium ${eventColors.text}`}>
                              {event.title}
                            </span>
                            {getPriorityIcon(event.priority)}
                          </div>
                          
                          <div className="flex items-center space-x-4 text-xs text-gray-600">
                            <div className="flex items-center space-x-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatEventDate(event.date)}</span>
                            </div>
                            
                            {event.startTime && (
                              <div className="flex items-center space-x-1">
                                <Clock className="h-3 w-3" />
                                <span>{event.startTime}</span>
                              </div>
                            )}
                            
                            {event.location && (
                              <div className="flex items-center space-x-1">
                                <MapPin className="h-3 w-3" />
                                <span className="truncate max-w-20">{event.location}</span>
                              </div>
                            )}
                          </div>
                          
                          {event.description && (
                            <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                        
                        <button
                          onClick={() => dismissEvent(event._id)}
                          className="ml-2 text-gray-400 hover:text-gray-600 flex-shrink-0"
                          title="Відхилити сповіщення"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {visibleEvents.length > 0 && (
            <div className="p-3 border-t border-gray-200 text-center">
              <button
                onClick={() => setShowNotifications(false)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Переглянути всі події
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default UpcomingEventsNotification;