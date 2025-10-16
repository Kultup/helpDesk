import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Plus, X } from 'lucide-react';
import { CalendarEvent, EventType, EventPriority } from '../../types';
import apiService from '../../services/api';
import { useTranslation } from 'react-i18next';

interface HeaderCalendarProps {
  isOpen: boolean;
  onClose: () => void;
}

const HeaderCalendar: React.FC<HeaderCalendarProps> = ({ isOpen, onClose }) => {
  const { t, i18n } = useTranslation();
  
  // Кольори для типів подій
  const EVENT_COLORS = {
    [EventType.MEETING]: { bg: 'bg-blue-500', text: 'text-blue-700', border: 'border-blue-500', name: t('calendar.eventTypes.meeting') },
    [EventType.TASK]: { bg: 'bg-green-500', text: 'text-green-700', border: 'border-green-500', name: t('calendar.eventTypes.task') },
    [EventType.REMINDER]: { bg: 'bg-yellow-500', text: 'text-yellow-700', border: 'border-yellow-500', name: t('calendar.eventTypes.reminder') },
    [EventType.DEADLINE]: { bg: 'bg-red-500', text: 'text-red-700', border: 'border-red-500', name: t('calendar.eventTypes.deadline') },
    [EventType.APPOINTMENT]: { bg: 'bg-purple-500', text: 'text-purple-700', border: 'border-purple-500', name: t('calendar.eventTypes.appointment') },
    [EventType.HOLIDAY]: { bg: 'bg-pink-500', text: 'text-pink-700', border: 'border-pink-500', name: t('calendar.eventTypes.holiday') }
  };
  const [currentDate, setCurrentDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [customCategories, setCustomCategories] = useState<Array<{id: string, name: string, color: string}>>([]);
  const [hoveredDate, setHoveredDate] = useState<Date | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
  
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    time: '',
    location: '',
    type: EventType.MEETING,
    customCategory: ''
  });

  // Завантаження подій
  useEffect(() => {
    if (isOpen) {
      loadEvents();
      loadCustomCategories();
    }
  }, [isOpen, currentDate]);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
      
      const response = await apiService.getEvents({
        dateFrom: formatDateForAPI(startDate),
        dateTo: formatDateForAPI(endDate)
      });
      
      if (response.success && response.data) {
        setEvents(response.data);
      } else {
        console.error('HeaderCalendar: Помилка завантаження подій:', response.message || 'Невідома помилка');
        setEvents([]);
      }
    } catch (error: any) {
      console.error('HeaderCalendar: Виняток при завантаженні подій:', error);
      console.error('HeaderCalendar: Деталі помилки:', error.response?.data || error.message);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomCategories = () => {
    // Завантажуємо користувацькі категорії з localStorage
    const saved = localStorage.getItem('customEventCategories');
    if (saved) {
      setCustomCategories(JSON.parse(saved));
    }
  };

  const saveCustomCategories = (categories: Array<{id: string, name: string, color: string}>) => {
    localStorage.setItem('customEventCategories', JSON.stringify(categories));
    setCustomCategories(categories);
  };

  // Отримання днів місяця
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days: (Date | null)[] = [];

    // Додаємо пусті клітинки для днів попереднього місяця
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Додаємо дні поточного місяця
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day));
    }

    return days;
  };

  // Функція для форматування дати без часових поясів
  const formatDateForAPI = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Функція для створення дати з рядка без часових поясів
  const parseDateFromAPI = (dateString: string) => {
    // Обробляємо ISO формат (2025-10-02T00:00:00.000Z) або простий формат (2025-10-02)
    const dateOnly = dateString.split('T')[0]; // Беремо тільки частину з датою
    const [year, month, day] = dateOnly.split('-').map(Number);
    return new Date(year, month - 1, day);
  };

  // Отримання подій для конкретної дати
  const getEventsForDate = (date: Date) => {
    const dateEvents = events.filter(event => {
      const eventDate = parseDateFromAPI(event.date);
      const matches = eventDate.toDateString() === date.toDateString();
      return matches;
    });
    
    return dateEvents;
  };

  // Обробка наведення миші на дату
  const handleMouseEnter = (date: Date, event: React.MouseEvent) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setTooltipPosition({
      x: rect.left + rect.width / 2,
      y: rect.top - 10
    });
    setHoveredDate(date);
  };

  const handleMouseLeave = () => {
    setHoveredDate(null);
  };

  // Навігація по місяцях
  const goToPreviousMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  // Обробка вибору дати
  const handleDateSelect = (date: Date) => {
    setSelectedDate(date);
    setShowCreateForm(true);
    setFormData(prev => ({
      ...prev,
      title: '',
      description: '',
      time: '',
      location: '',
      type: EventType.MEETING,
      customCategory: ''
    }));
  };

  // Створення події
  const handleCreateEvent = async () => {
    if (!formData.title || !selectedDate) return;

    try {
      setLoading(true);
      
      const eventData = {
        title: formData.title,
        description: formData.description,
        date: formatDateForAPI(selectedDate),
        startTime: formData.time,
        endTime: '',
        location: formData.location,
        type: formData.type,
        priority: EventPriority.MEDIUM,
        isAllDay: !formData.time
      };

      await apiService.post('/events', eventData);
      
      setShowCreateForm(false);
      setFormData({
        title: '',
        description: '',
        time: '',
        location: '',
        type: EventType.MEETING,
        customCategory: ''
      });
      
      await loadEvents();
    } catch (error) {
      console.error('Помилка створення події:', error);
    } finally {
      setLoading(false);
    }
  };

  // Додавання користувацької категорії
  const addCustomCategory = () => {
    if (!formData.customCategory) return;
    
    const newCategory = {
      id: Date.now().toString(),
      name: formData.customCategory,
      color: '#' + Math.floor(Math.random()*16777215).toString(16) // Випадковий колір
    };
    
    const updated = [...customCategories, newCategory];
    saveCustomCategories(updated);
    setFormData(prev => ({ ...prev, customCategory: '' }));
  };

  // Визначення локалі для форматування дат відповідно до поточної мови
  const getLocale = (lang: string) => {
    switch (lang) {
      case 'pl':
        return 'pl-PL';
      case 'uk':
        return 'uk-UA';
      case 'en':
      default:
        return 'en-US';
    }
  };

  // Форматування дати
  const formatDate = (date: Date) => {
    return date.toLocaleDateString(getLocale(i18n.language), { 
      month: 'long', 
      year: 'numeric' 
    });
  };

  if (!isOpen) return null;

  const days = getDaysInMonth();
  const today = new Date();

  return (
    <div className="absolute right-0 mt-2 w-96 max-h-[80vh] bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden flex flex-col">
      {/* Заголовок */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">{t('calendar.title')}</h3>
          <div className="flex items-center space-x-2">
            <button
              onClick={goToToday}
              className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
{t('calendar.today')}
            </button>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded"
            >
              <X className="h-4 w-4 text-gray-600" />
            </button>
          </div>
        </div>
      </div>

      {/* Скрол контейнер для основного контенту */}
      <div className="flex-1 overflow-y-auto">
        {/* Форма створення події */}
      {showCreateForm && selectedDate && (
        <div className="p-4 border-b border-gray-200 bg-gray-50">
          <h4 className="text-md font-medium text-gray-900 mb-3">
            {t('calendar.newEvent')} {selectedDate.toLocaleDateString(getLocale(i18n.language))}
          </h4>
          
          <div className="space-y-3">
            {/* Назва події */}
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('calendar.eventTitle')}
            />

            {/* Час (опціонально) */}
            <input
              type="time"
              value={formData.time}
              onChange={(e) => setFormData(prev => ({ ...prev, time: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />

            {/* Тип події */}
            <select
              value={formData.type}
              onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as EventType }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(EVENT_COLORS).map(([type, config]) => (
                <option key={type} value={type}>{config.name}</option>
              ))}
            </select>

            {/* Місце */}
            <input
              type="text"
              value={formData.location}
              onChange={(e) => setFormData(prev => ({ ...prev, location: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('calendar.location')}
            />

            {/* Опис */}
            <textarea
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('calendar.description')}
            />

            {/* Додавання користувацької категорії */}
            <div className="flex space-x-2">
              <input
                type="text"
                value={formData.customCategory}
                onChange={(e) => setFormData(prev => ({ ...prev, customCategory: e.target.value }))}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t('calendar.newCategory')}
              />
              <button
                onClick={addCustomCategory}
                disabled={!formData.customCategory}
                className="px-3 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:bg-gray-400"
              >
                +
              </button>
            </div>

            {/* Користувацькі категорії */}
            {customCategories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customCategories.map(category => (
                  <span
                    key={category.id}
                    className="px-2 py-1 text-xs rounded-full text-white"
                    style={{ backgroundColor: category.color }}
                  >
                    {category.name}
                  </span>
                ))}
              </div>
            )}

            {/* Кнопки */}
            <div className="flex justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowCreateForm(false)}
                className="px-3 py-2 text-sm text-gray-600 bg-gray-200 rounded hover:bg-gray-300"
              >
{t('calendar.cancel')}
              </button>
              <button
                onClick={handleCreateEvent}
                disabled={!formData.title || loading}
                className="px-3 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
{loading ? t('calendar.creating') : t('calendar.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Навігація по місяцях */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <button
            onClick={goToPreviousMonth}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronLeft className="h-4 w-4 text-gray-600" />
          </button>
          <h4 className="text-lg font-medium text-gray-800">{formatDate(currentDate)}</h4>
          <button
            onClick={goToNextMonth}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <ChevronRight className="h-4 w-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* Календарна сітка */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Заголовки днів тижня */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {[t('calendar.days.sun'), t('calendar.days.mon'), t('calendar.days.tue'), t('calendar.days.wed'), t('calendar.days.thu'), t('calendar.days.fri'), t('calendar.days.sat')].map(day => (
                <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                  {day}
                </div>
              ))}
            </div>

            {/* Дні місяця */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((day, index) => {
                if (!day) {
                  return <div key={index} className="h-10"></div>;
                }

                const dayEvents = getEventsForDate(day);
                const isToday = day.toDateString() === today.toDateString();
                const hasEvents = dayEvents.length > 0;

                return (
                  <div
                    key={index}
                    onClick={() => handleDateSelect(day)}
                    onMouseEnter={(e) => handleMouseEnter(day, e)}
                    onMouseLeave={handleMouseLeave}
                    className={`h-10 flex items-center justify-center text-sm cursor-pointer rounded transition-all relative group ${
                      isToday ? 'bg-blue-100 text-blue-700 font-semibold' : 
                      day.getMonth() !== currentDate.getMonth() ? 'text-gray-400' : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <span>{day.getDate()}</span>
                    
                    {/* Індикатор подій */}
                    {hasEvents && (
                      <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 flex space-x-0.5">
                        {dayEvents.slice(0, 3).map((event, i) => (
                          <div
                            key={i}
                            className={`w-1.5 h-1.5 rounded-full ${EVENT_COLORS[event.type]?.bg || 'bg-gray-400'}`}
                          />
                        ))}
                        {dayEvents.length > 3 && (
                          <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                        )}
                      </div>
                    )}

                    {/* Кнопка + при наведенні */}
                    <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Plus className="h-4 w-4 text-green-600 bg-white rounded-full p-0.5 shadow-sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Події для обраної дати */}
      {selectedDate && !showCreateForm && (
        <div className="border-t border-gray-200 p-4 max-h-48 overflow-y-auto">
          <div className="flex justify-between items-center mb-3">
            <h5 className="text-sm font-medium text-gray-900">
{t('calendar.eventsOn')} {selectedDate.toLocaleDateString('uk-UA')}
            </h5>
            <button
              onClick={() => handleDateSelect(selectedDate)}
              className="p-1 bg-green-600 text-white rounded hover:bg-green-700"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          
          <div className="space-y-2">
            {getEventsForDate(selectedDate).length === 0 ? (
              <p className="text-sm text-gray-500">{t('calendar.noEvents')}</p>
            ) : (
              getEventsForDate(selectedDate).map(event => (
                <div key={event._id} className="flex items-start space-x-2 p-2 bg-gray-50 rounded">
                  <div className={`w-3 h-3 rounded-full mt-0.5 ${EVENT_COLORS[event.type]?.bg || 'bg-gray-400'}`}></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{event.title}</p>
                    {event.startTime && (
                      <p className="text-xs text-gray-500">{event.startTime}</p>
                    )}
                    {event.location && (
                      <p className="text-xs text-gray-500">{event.location}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tooltip з подіями при наведенні */}
      {hoveredDate && getEventsForDate(hoveredDate).length > 0 && (
        <div
          className="fixed z-[60] bg-white border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
        >
          <div className="text-sm font-medium text-gray-900 mb-2">
            {hoveredDate.toLocaleDateString('uk-UA', { 
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            })}
          </div>
          <div className="space-y-1">
            {getEventsForDate(hoveredDate).slice(0, 5).map((event, index) => {
                const eventColor = EVENT_COLORS[event.type];
                
                // Визначаємо колір для крапки
                let dotColor = '#6b7280'; // gray-500 за замовчуванням
                if (eventColor) {
                  // Конвертуємо Tailwind класи в hex кольори
                  const colorMap: { [key: string]: string } = {
                    'bg-blue-500': '#3b82f6',
                    'bg-green-500': '#10b981',
                    'bg-yellow-500': '#f59e0b',
                    'bg-red-500': '#ef4444',
                    'bg-purple-500': '#8b5cf6',
                    'bg-pink-500': '#ec4899'
                  };
                  dotColor = colorMap[eventColor.bg] || '#6b7280';
                }
               
               return (
                 <div key={index} className="flex items-center space-x-2">
                   <div 
                     className="w-2 h-2 rounded-full flex-shrink-0"
                     style={{ backgroundColor: dotColor }}
                   />
                   <span className="text-xs text-gray-700 truncate">
                     {event.title}
                   </span>
                 </div>
               );
             })}
            {getEventsForDate(hoveredDate).length > 5 && (
              <div className="text-xs text-gray-500 text-center pt-1">
+{getEventsForDate(hoveredDate).length - 5} {t('calendar.more')}
              </div>
            )}
          </div>
        </div>
      )}
      </div> {/* Закриття скрол контейнера */}
    </div>
  );
};

export default HeaderCalendar;