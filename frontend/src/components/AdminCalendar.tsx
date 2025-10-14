import React, { useState, useEffect } from 'react';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, CalendarIcon, ClockIcon, UserGroupIcon } from '@heroicons/react/24/outline';
import { CalendarEvent, EventType, EventPriority, EventStatus, CreateEventForm, UpdateEventForm } from '../types';
import apiService from '../services/api';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';

const AdminCalendar: React.FC = () => {
  const { t } = useTranslation();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Завантаження подій з API
  useEffect(() => {
    loadEvents();
  }, [currentDate]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Отримуємо події за поточний місяць
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const response = await apiService.getEvents({
        dateFrom: startOfMonth.toISOString().split('T')[0],
        dateTo: endOfMonth.toISOString().split('T')[0]
      });

      if (response.success && response.data) {
        setEvents(response.data);
      } else {
        setError(response.message || t('error'));
      }
    } catch (err: any) {
      console.error('Помилка завантаження подій:', err);
      setError(t('calendar.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddEvent = async (eventData: CreateEventForm) => {
    try {
      console.log('AdminCalendar: Початок створення події', eventData);
      setLoading(true);
      const response = await apiService.createEvent(eventData);
      
      console.log('AdminCalendar: Відповідь від API при створенні події', response);
      
      if (response.success && response.data) {
        console.log('AdminCalendar: Подія успішно створена', response.data);
        setShowAddEvent(false);
        // Перезавантажуємо події для гарантованого оновлення
        await loadEvents();
      } else {
        console.error('AdminCalendar: Помилка створення події', response.message);
        setError(response.message || t('calendar.createError'));
      }
    } catch (err: any) {
      console.error('AdminCalendar: Виняток при створенні події:', err);
      setError(t('calendar.createError'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateEvent = async (eventData: UpdateEventForm) => {
    if (!editingEvent) return;
    
    try {
      setLoading(true);
      const response = await apiService.updateEvent(editingEvent._id, eventData);
      
      if (response.success && response.data) {
        setEvents(prev => prev.map(event => 
          event._id === editingEvent._id ? response.data! : event
        ));
        setEditingEvent(null);
      } else {
        setError(response.message || t('calendar.updateError'));
      }
    } catch (err: any) {
      console.error('Помилка оновлення події:', err);
      setError(t('calendar.updateError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm(t('calendar.confirmDelete'))) return;
    
    try {
      setLoading(true);
      const response = await apiService.deleteEvent(eventId);
      
      if (response.success) {
        setEvents(prev => prev.filter(event => event._id !== eventId));
        setEditingEvent(null);
      } else {
        setError(response.message || t('calendar.deleteError'));
      }
    } catch (err: any) {
      console.error('Помилка видалення події:', err);
      setError(t('calendar.deleteError'));
    } finally {
      setLoading(false);
    }
  };

  const handleMarkCompleted = async (eventId: string) => {
    try {
      setLoading(true);
      const response = await apiService.markEventCompleted(eventId);
      
      if (response.success && response.data) {
        setEvents(prev => prev.map(event => 
          event._id === eventId ? response.data! : event
        ));
      } else {
        setError(response.message || t('calendar.statusUpdateError'));
      }
    } catch (err: any) {
      console.error('Помилка оновлення статусу:', err);
      setError(t('calendar.statusUpdateError'));
    } finally {
      setLoading(false);
    }
  };

  // Функції для визначення кольору та мітки
  const getEventTypeColor = (type: EventType): string => {
    const colors = {
      [EventType.MEETING]: 'bg-blue-500',
      [EventType.TASK]: 'bg-green-500',
      [EventType.REMINDER]: 'bg-yellow-500',
      [EventType.DEADLINE]: 'bg-red-500',
      [EventType.APPOINTMENT]: 'bg-purple-500',
      [EventType.HOLIDAY]: 'bg-pink-500'
    };
    return colors[type] || 'bg-gray-500';
  };

  const getEventTypeLabel = (type: EventType): string => {
    const labels = {
      [EventType.MEETING]: t('calendar.eventTypes.meeting'),
      [EventType.TASK]: t('calendar.eventTypes.task'),
      [EventType.REMINDER]: t('calendar.eventTypes.reminder'),
      [EventType.DEADLINE]: t('calendar.eventTypes.deadline'),
      [EventType.APPOINTMENT]: t('calendar.eventTypes.appointment'),
      [EventType.HOLIDAY]: t('calendar.eventTypes.holiday')
    };
    return labels[type] || type;
  };

  const getPriorityLabel = (priority: EventPriority): string => {
    const labels = {
      [EventPriority.LOW]: t('calendar.priorities.low'),
      [EventPriority.MEDIUM]: t('calendar.priorities.medium'),
      [EventPriority.HIGH]: t('calendar.priorities.high'),
      [EventPriority.URGENT]: t('calendar.priorities.urgent')
    };
    return labels[priority] || priority;
  };

  const getStatusLabel = (status: EventStatus): string => {
    const labels = {
      [EventStatus.SCHEDULED]: t('calendar.statuses.scheduled'),
      [EventStatus.IN_PROGRESS]: t('calendar.statuses.inProgress'),
      [EventStatus.COMPLETED]: t('calendar.statuses.completed'),
      [EventStatus.CANCELLED]: t('calendar.statuses.cancelled')
    };
    return labels[status] || status;
  };

  // Навігація по календарю
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Отримання днів місяця
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Додаємо порожні клітинки для днів попереднього місяця
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Додаємо дні поточного місяця
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  // Форматування дати
  const formatDate = (date: Date): string => {
    return date.toLocaleDateString(i18n.language, {
      year: 'numeric',
      month: 'long'
    });
  };

  // Фільтрація подій за датою
  const getEventsForDate = (date: Date): CalendarEvent[] => {
    const dateString = date.toISOString().split('T')[0];
    return events.filter(event => {
      const eventDate = new Date(event.date).toISOString().split('T')[0];
      return eventDate === dateString;
    });
  };

  const days = getDaysInMonth();
  const today = new Date();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('calendar.eventCalendar')}</h2>
        <div className="flex space-x-2">
          <button
            onClick={goToToday}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={() => setShowAddEvent(true)}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <PlusIcon className="h-5 w-5 mr-2" />
            {t('calendar.addEvent')}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => setError(null)}
            className="mt-2 text-sm text-red-500 hover:text-red-700"
          >
            {t('calendar.close')}
          </button>
        </div>
      )}

      {loading && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-blue-600">{t('calendar.loading')}</p>
        </div>
      )}

      {/* Навігація по місяцях */}
      <div className="flex justify-between items-center mb-6 bg-gray-50 p-4 rounded-lg">
        <button
          onClick={goToPreviousMonth}
          className="p-3 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ChevronLeftIcon className="h-6 w-6 text-gray-600" />
        </button>
        <h3 className="text-2xl font-bold text-gray-800">{formatDate(currentDate)}</h3>
        <button
          onClick={goToNextMonth}
          className="p-3 hover:bg-gray-200 rounded-full transition-colors"
        >
          <ChevronRightIcon className="h-6 w-6 text-gray-600" />
        </button>
      </div>

      {/* Календарна сітка */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm mb-6">
        <div className="grid grid-cols-7">
          {/* Заголовки днів тижня */}
          {[
            t('calendar.dayNames.sunday'),
            t('calendar.dayNames.monday'),
            t('calendar.dayNames.tuesday'),
            t('calendar.dayNames.wednesday'),
            t('calendar.dayNames.thursday'),
            t('calendar.dayNames.friday'),
            t('calendar.dayNames.saturday')
          ].map((day, index) => (
            <div key={index} className="p-6 text-center font-semibold text-gray-700 bg-gray-100 border-b border-gray-200">
              {day}
            </div>
          ))}

          {/* Дні місяця */}
          {days.map((day, index) => {
            if (!day) {
              return <div key={index} className="p-4 h-40 border-b border-r border-gray-100"></div>;
            }

            const dayEvents = getEventsForDate(day);
            const isToday = day.toDateString() === today.toDateString();
            const isSelected = selectedDate && day.toDateString() === selectedDate.toDateString();

            return (
              <div
                key={index}
                onClick={() => setSelectedDate(day)}
                className={`p-4 h-40 border-b border-r border-gray-100 cursor-pointer hover:bg-blue-50 transition-colors relative ${
                  isToday ? 'bg-blue-100 border-blue-300' : 'bg-white'
                } ${isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : ''}`}
              >
                <div className={`text-lg font-semibold mb-3 ${
                  isToday ? 'text-blue-700' : 
                  day.getMonth() !== currentDate.getMonth() ? 'text-gray-400' : 'text-gray-900'
                }`}>
                  {day.getDate()}
                </div>
                <div className="space-y-2 overflow-hidden">
                  {dayEvents.slice(0, 3).map(event => (
                    <div
                      key={event._id}
                      className={`text-xs px-2 py-1 rounded-full text-white truncate ${getEventTypeColor(event.type)} shadow-sm`}
                      title={`${event.title} - ${getEventTypeLabel(event.type)}`}
                    >
                      {event.title}
                    </div>
                  ))}
                  {dayEvents.length > 3 && (
                    <div className="text-xs text-gray-500 font-medium px-2">
                      +{dayEvents.length - 3} ще
                    </div>
                  )}
                </div>
                {isToday && (
                  <div className="absolute top-3 right-3 w-2 h-2 bg-blue-600 rounded-full"></div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Список подій для обраної дати */}
      {selectedDate && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-8 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-xl font-bold text-gray-800 flex items-center">
              <CalendarIcon className="h-6 w-6 mr-2 text-blue-600" />
              {t('calendar.eventsOn')} {selectedDate.toLocaleDateString(i18n.language, { 
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </h4>
            <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
              {getEventsForDate(selectedDate).length} {getEventsForDate(selectedDate).length === 1 ? t('calendar.event') : t('calendar.events')}
            </span>
          </div>
          
          <div className="space-y-6">
            {getEventsForDate(selectedDate).map(event => (
              <div key={event._id} className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200 hover:border-blue-300 shadow-sm">
                <div className="flex justify-between items-start gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center flex-wrap gap-2 mb-4">
                      <span className={`px-3 py-1.5 rounded-full text-sm font-medium text-white ${getEventTypeColor(event.type)} shadow-sm`}>
                        {getEventTypeLabel(event.type)}
                      </span>
                      <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                        event.priority === EventPriority.URGENT ? 'bg-red-100 text-red-800 border border-red-200' :
                        event.priority === EventPriority.HIGH ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                        event.priority === EventPriority.MEDIUM ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        {getPriorityLabel(event.priority)}
                      </span>
                      <span className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                        event.status === EventStatus.COMPLETED ? 'bg-green-100 text-green-800 border border-green-200' :
                        event.status === EventStatus.IN_PROGRESS ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                        event.status === EventStatus.CANCELLED ? 'bg-red-100 text-red-800 border border-red-200' :
                        'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        {getStatusLabel(event.status)}
                      </span>
                    </div>
                    
                    <h5 className="text-xl font-semibold text-gray-900 mb-3 leading-tight">{event.title}</h5>
                    
                    {event.description && (
                      <p className="text-gray-600 mb-4 leading-relaxed text-base">{event.description}</p>
                    )}
                    
                    <div className="flex items-center flex-wrap gap-4 text-sm text-gray-500">
                      {(event.startTime || event.endTime) && (
                        <div className="flex items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                          <ClockIcon className="h-4 w-4 mr-2 text-gray-400" />
                          <span className="font-medium">
                            {event.startTime && event.endTime ? 
                              `${event.startTime} - ${event.endTime}` :
                              event.startTime || event.endTime
                            }
                          </span>
                        </div>
                      )}
                      {event.participants && event.participants.length > 0 && (
                        <div className="flex items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                          <UserGroupIcon className="h-4 w-4 mr-2 text-gray-400" />
                          <span className="font-medium">{event.participants.length} {t('calendar.participants')}</span>
                        </div>
                      )}
                      {event.location && (
                        <div className="flex items-center bg-gray-50 px-3 py-2 rounded-lg border border-gray-100">
                          <svg className="h-4 w-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <span className="font-medium">{event.location}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {event.status !== EventStatus.COMPLETED && event.status !== EventStatus.CANCELLED && (
                      <button
                        onClick={() => handleMarkCompleted(event._id)}
                        className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors shadow-sm flex items-center whitespace-nowrap"
                        disabled={loading}
                        title={t('calendar.completeEvent')}
                      >
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="ml-1 hidden sm:inline">{t('calendar.complete')}</span>
                      </button>
                    )}
                    <button
                      onClick={() => setEditingEvent(event)}
                      className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm flex items-center whitespace-nowrap"
                      title={t('calendar.editEvent')}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                      <span className="ml-1 hidden sm:inline">{t('calendar.edit')}</span>
                    </button>
                    <button
                      onClick={() => handleDeleteEvent(event._id)}
                      className="px-3 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors shadow-sm flex items-center whitespace-nowrap"
                      disabled={loading}
                      title={t('calendar.deleteEvent')}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      <span className="ml-1 hidden sm:inline">{t('calendar.delete')}</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
            
            {getEventsForDate(selectedDate).length === 0 && (
              <div className="text-center py-12">
                <div className="mx-auto h-24 w-24 text-gray-300 mb-4">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-500 mb-2">{t('calendar.noEvents')}</h3>
                <p className="text-gray-400 mb-4">{t('calendar.createEventToStart')}</p>
                <button
                  onClick={() => setShowAddEvent(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  {t('calendar.addEvent')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Форма додавання події */}
      {showAddEvent && (
        <AddEventForm
          onSubmit={handleAddEvent}
          onCancel={() => setShowAddEvent(false)}
          loading={loading}
        />
      )}

      {/* Форма редагування події */}
      {editingEvent && (
        <EditEventForm
          event={editingEvent}
          onSubmit={handleUpdateEvent}
          onCancel={() => setEditingEvent(null)}
          loading={loading}
        />
      )}
    </div>
  );
};

// Компонент форми додавання події
interface AddEventFormProps {
  onSubmit: (event: CreateEventForm) => void;
  onCancel: () => void;
  loading: boolean;
}

const AddEventForm: React.FC<AddEventFormProps> = ({ onSubmit, onCancel, loading }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<CreateEventForm>({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    startTime: '',
    endTime: '',
    type: EventType.TASK,
    priority: EventPriority.MEDIUM,
    location: '',
    isAllDay: false
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{t('calendar.addNewEvent')}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.eventTitle')} *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.date')} *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('calendar.startTime')}
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={formData.isAllDay}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t('calendar.endTime')}
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={formData.isAllDay}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isAllDay}
                onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">{t('calendar.allDay')}</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.eventType')}
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as EventType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={EventType.MEETING}>{t('calendar.eventTypes.meeting')}</option>
              <option value={EventType.TASK}>{t('calendar.eventTypes.task')}</option>
              <option value={EventType.REMINDER}>{t('calendar.eventTypes.reminder')}</option>
              <option value={EventType.DEADLINE}>{t('calendar.eventTypes.deadline')}</option>
              <option value={EventType.APPOINTMENT}>{t('calendar.eventTypes.appointment')}</option>
              <option value={EventType.HOLIDAY}>{t('calendar.eventTypes.holiday')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.priority')}
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as EventPriority })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={EventPriority.LOW}>{t('calendar.priorities.low')}</option>
              <option value={EventPriority.MEDIUM}>{t('calendar.priorities.medium')}</option>
              <option value={EventPriority.HIGH}>{t('calendar.priorities.high')}</option>
              <option value={EventPriority.URGENT}>{t('calendar.priorities.urgent')}</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.description')}
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('calendar.location')}
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? t('calendar.saving') : t('calendar.save')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
            >
              {t('calendar.cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Компонент форми редагування події
interface EditEventFormProps {
  event: CalendarEvent;
  onSubmit: (event: UpdateEventForm) => void;
  onCancel: () => void;
  loading: boolean;
}

const EditEventForm: React.FC<EditEventFormProps> = ({ event, onSubmit, onCancel, loading }) => {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<UpdateEventForm>({
    title: event.title,
    description: event.description || '',
    date: event.date,
    startTime: event.startTime || '',
    endTime: event.endTime || '',
    type: event.type,
    priority: event.priority,
    status: event.status,
    location: event.location || '',
    isAllDay: event.isAllDay
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
        <h3 className="text-lg font-semibold mb-4">{t('calendar.editEvent')}</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Назва події *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Дата *
            </label>
            <input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Початок
              </label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={formData.isAllDay}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Кінець
              </label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={formData.isAllDay}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formData.isAllDay}
                onChange={(e) => setFormData({ ...formData, isAllDay: e.target.checked })}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Весь день</span>
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Тип події
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value as EventType })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={EventType.MEETING}>Зустріч</option>
              <option value={EventType.TASK}>Завдання</option>
              <option value={EventType.REMINDER}>Нагадування</option>
              <option value={EventType.DEADLINE}>Дедлайн</option>
              <option value={EventType.APPOINTMENT}>Призначення</option>
              <option value={EventType.HOLIDAY}>Свято</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Пріоритет
            </label>
            <select
              value={formData.priority}
              onChange={(e) => setFormData({ ...formData, priority: e.target.value as EventPriority })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={EventPriority.LOW}>Низький</option>
              <option value={EventPriority.MEDIUM}>Середній</option>
              <option value={EventPriority.HIGH}>Високий</option>
              <option value={EventPriority.URGENT}>Терміновий</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Статус
            </label>
            <select
              value={formData.status}
              onChange={(e) => setFormData({ ...formData, status: e.target.value as EventStatus })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value={EventStatus.SCHEDULED}>Заплановано</option>
              <option value={EventStatus.IN_PROGRESS}>В процесі</option>
              <option value={EventStatus.COMPLETED}>Завершено</option>
              <option value={EventStatus.CANCELLED}>Скасовано</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Опис
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Місце
            </label>
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? t('calendar.saving') : t('calendar.save')}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 bg-gray-300 text-gray-700 py-2 px-4 rounded-lg hover:bg-gray-400 transition-colors"
            >
              Скасувати
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AdminCalendar;