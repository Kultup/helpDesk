import React from 'react';
import { Calendar, Check, AlertTriangle } from 'lucide-react';

interface WorkingDaysCalendarProps {
  selectedDays: string[];
  onDaysChange: (days: string[]) => void;
  disabled?: boolean;
}

const WorkingDaysCalendar: React.FC<WorkingDaysCalendarProps> = ({
  selectedDays,
  onDaysChange,
  disabled = false
}) => {
  const weekDays = [
    { value: 'monday', label: 'Пн', fullLabel: 'Понеділок' },
    { value: 'tuesday', label: 'Вт', fullLabel: 'Вівторок' },
    { value: 'wednesday', label: 'Ср', fullLabel: 'Середа' },
    { value: 'thursday', label: 'Чт', fullLabel: 'Четвер' },
    { value: 'friday', label: 'Пт', fullLabel: "П'ятниця" },
    { value: 'saturday', label: 'Сб', fullLabel: 'Субота' },
    { value: 'sunday', label: 'Нд', fullLabel: 'Неділя' }
  ];

  const handleDayToggle = (dayValue: string) => {
    if (disabled) return;
    
    const newSelectedDays = selectedDays.includes(dayValue)
      ? selectedDays.filter(day => day !== dayValue)
      : [...selectedDays, dayValue];
    
    onDaysChange(newSelectedDays);
  };

  const selectAllWeekdays = () => {
    if (disabled) return;
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    onDaysChange(weekdays);
  };

  const selectAllDays = () => {
    if (disabled) return;
    const allDays = weekDays.map(day => day.value);
    onDaysChange(allDays);
  };

  const clearAll = () => {
    if (disabled) return;
    onDaysChange([]);
  };

  return (
    <div className="space-y-4">
      {/* Заголовок з іконкою */}
      <div className="flex items-center space-x-2">
        <Calendar className="h-5 w-5 text-gray-600" />
        <label className="block text-sm font-medium text-gray-700">
          Робочі дні
        </label>
      </div>

      {/* Швидкі дії */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllWeekdays}
          disabled={disabled}
          className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Робочі дні (Пн-Пт)
        </button>
        <button
          type="button"
          onClick={selectAllDays}
          disabled={disabled}
          className="px-3 py-1 text-xs bg-green-100 text-green-700 rounded-md hover:bg-green-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Всі дні
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={disabled}
          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Очистити
        </button>
      </div>

      {/* Календарна сітка */}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((day) => {
          const isSelected = selectedDays.includes(day.value);
          const isWeekend = day.value === 'saturday' || day.value === 'sunday';
          
          return (
            <div
              key={day.value}
              onClick={() => handleDayToggle(day.value)}
              className={`
                relative cursor-pointer rounded-lg border-2 p-3 text-center transition-all duration-200
                ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:scale-105'}
                ${isSelected 
                  ? isWeekend
                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md'
                    : 'border-blue-500 bg-blue-50 text-blue-700 shadow-md'
                  : isWeekend 
                    ? 'border-orange-200 bg-orange-50 text-orange-600 hover:border-orange-300' 
                    : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50'
                }
              `}
              title={isWeekend && isSelected 
                ? `${day.fullLabel} - У вихідні дні відповідь адміністратора може бути не такою швидкою`
                : day.fullLabel
              }
            >
              {/* Іконка вибору або попередження */}
              {isSelected && (
                <div className={`absolute -top-1 -right-1 h-5 w-5 rounded-full flex items-center justify-center ${
                  isWeekend ? 'bg-orange-500' : 'bg-blue-500'
                }`}>
                  {isWeekend ? (
                    <AlertTriangle className="h-3 w-3 text-white" />
                  ) : (
                    <Check className="h-3 w-3 text-white" />
                  )}
                </div>
              )}
              
              {/* Іконка попередження для невибраних вихідних */}
              {!isSelected && isWeekend && (
                <div className="absolute -top-1 -right-1 h-4 w-4 bg-orange-400 rounded-full flex items-center justify-center">
                  <AlertTriangle className="h-2.5 w-2.5 text-white" />
                </div>
              )}
              
              {/* Скорочена назва дня */}
              <div className="text-sm font-medium">
                {day.label}
              </div>
              
              {/* Повна назва дня (для мобільних) */}
              <div className="text-xs mt-1 hidden sm:block">
                {day.fullLabel}
              </div>
            </div>
          );
        })}
      </div>

      {/* Інформація про вибрані дні */}
      <div className="space-y-2">
        <div className="text-sm text-gray-600">
          {selectedDays.length === 0 && (
            <span className="text-orange-600">Не вибрано жодного дня</span>
          )}
          {selectedDays.length === 7 && (
            <span className="text-green-600">Вибрано всі дні тижня</span>
          )}
          {selectedDays.length > 0 && selectedDays.length < 7 && (
            <span>
              Вибрано {selectedDays.length} {selectedDays.length === 1 ? 'день' : selectedDays.length < 5 ? 'дні' : 'днів'}
            </span>
          )}
        </div>

        {/* Попередження про вихідні дні */}
        {(selectedDays.includes('saturday') || selectedDays.includes('sunday')) && (
          <div className="flex items-start space-x-2 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <AlertTriangle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-orange-700">
              <div className="font-medium">Увага: Вихідні дні</div>
              <div className="mt-1">
                У вихідні дні (субота, неділя) відповідь адміністратора може бути не такою швидкою, 
                як у робочі дні. Користувачі будуть проінформовані про це.
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkingDaysCalendar;