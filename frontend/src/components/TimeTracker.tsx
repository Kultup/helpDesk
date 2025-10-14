import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Clock, Trash2, Download } from 'lucide-react';
import Card from './UI/Card';
import Button from './UI/Button';
import { apiService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { UserRole } from '../types';

interface TimeTrackerProps {
  ticketId: string;
  estimatedHours?: number;
  actualHours?: number;
  onTimeUpdate?: (actualHours: number) => void;
}

interface TimeEntry {
  _id: string;
  startTime: string;
  endTime?: string;
  duration: number;
  description?: string;
  isActive: boolean;
  user: {
    _id: string;
    email: string;
  };
  createdBy: {
    _id: string;
    email: string;
  };
  createdAt: string;
}

const TimeTracker: React.FC<TimeTrackerProps> = ({
  ticketId,
  estimatedHours = 0,
  actualHours = 0,
  onTimeUpdate
}) => {
  const [isTracking, setIsTracking] = useState(false);
  const [currentSessionTime, setCurrentSessionTime] = useState(0);
  const [currentSession, setCurrentSession] = useState<TimeEntry | null>(null);
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;

  // Таймер для відстеження поточної сесії
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isTracking && startTime) {
      interval = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
        setCurrentSessionTime(elapsed);
      }, 1000);
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [isTracking, startTime]);

  // Завантаження записів часу
  const loadTimeEntries = async () => {
    try {
      setIsLoading(true);
      const response = await apiService.getTimeEntries(ticketId);
      
      // Перевіряємо структуру відповіді
      let entries: TimeEntry[] = [];
      if (response && typeof response === 'object' && 'timeEntries' in response) {
        entries = Array.isArray(response.timeEntries) ? response.timeEntries : [];
      } else if (Array.isArray(response)) {
        entries = response;
      }
      
      setTimeEntries(entries);
      
      // Знайти активну сесію
      const activeEntry = entries.find((entry: TimeEntry) => entry.isActive);
      if (activeEntry) {
        setCurrentSession(activeEntry);
        setIsTracking(true);
      }
    } catch (error) {
      console.error('Помилка завантаження записів часу:', error);
      setTimeEntries([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTimeEntries();
  }, [ticketId]);

  // Запуск відстеження часу
  const startTracking = async () => {
    try {
      const data = await apiService.startTimeTracking(ticketId, description);
      setStartTime(new Date());
      setIsTracking(true);
      setCurrentSessionTime(0);
    } catch (error) {
      console.error('Помилка запуску відстеження часу:', error);
    }
  };

  // Пауза відстеження часу
  const pauseTracking = () => {
    setIsTracking(false);
  };

  // Відновлення відстеження часу
  const resumeTracking = () => {
    setIsTracking(true);
  };

  // Зупинка відстеження часу
  const stopAndSaveTracking = async () => {
    if (!startTime) return;

    try {
      const endTime = new Date();
      const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

      const response = await apiService.createTimeEntry(ticketId, {
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        duration,
        description: description.trim() || undefined
      });

      if (response.success) {
        setIsTracking(false);
        setStartTime(null);
        setCurrentSessionTime(0);
        setDescription('');
        await loadTimeEntries();
        
        // Оновлюємо загальний час
        const newActualHours = actualHours + (duration / 3600);
        if (onTimeUpdate) {
          onTimeUpdate(newActualHours);
        }
      }
    } catch (err: any) {
      console.error('Помилка збереження часу:', err);
    }
  };

  const deleteTimeEntry = async (entryId: string) => {
    try {
      await apiService.deleteTimeEntry(ticketId, entryId);
      setTimeEntries(prev => prev.filter(entry => entry._id !== entryId));
    } catch (error) {
      console.error('Помилка видалення запису часу:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}г ${minutes}хв`;
    }
    return `${minutes}хв`;
  };

  const totalTrackedTime = Array.isArray(timeEntries) ? timeEntries.reduce((total, entry) => total + entry.duration, 0) : 0;
  const progressPercentage = estimatedHours > 0 ? Math.min((totalTrackedTime / 3600) / estimatedHours * 100, 100) : 0;

  return (
    <Card>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-semibold flex items-center">
            <Clock className="w-5 h-5 mr-2" />
            Відстеження часу
          </h3>
          <div className="text-sm text-gray-500">
            {estimatedHours > 0 && (
              <span>Оцінка: {estimatedHours}г</span>
            )}
          </div>
        </div>

        {/* Прогрес */}
        {estimatedHours > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Прогрес</span>
              <span>{(totalTrackedTime / 3600).toFixed(1)}г / {estimatedHours}г</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  progressPercentage > 100 ? 'bg-red-500' : 'bg-blue-500'
                }`}
                style={{ width: `${Math.min(progressPercentage, 100)}%` }}
              />
            </div>
            {progressPercentage > 100 && (
              <p className="text-red-600 text-xs mt-1">
                Перевищено оцінку на {((totalTrackedTime / 3600) - estimatedHours).toFixed(1)}г
              </p>
            )}
          </div>
        )}

        {/* Поточна сесія */}
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h4 className="font-medium">Поточна сесія</h4>
              <div className="text-2xl font-mono font-bold text-blue-600">
                {formatTime(currentSessionTime)}
              </div>
            </div>
            <div className="flex space-x-2">
              {!isTracking ? (
                <Button onClick={startTracking} size="sm">
                  <Play className="w-4 h-4 mr-1" />
                  Почати
                </Button>
              ) : (
                <>
                  <Button onClick={pauseTracking} variant="outline" size="sm">
                    <Pause className="w-4 h-4 mr-1" />
                    Пауза
                  </Button>
                  <Button onClick={stopAndSaveTracking} size="sm">
                    <Square className="w-4 h-4 mr-1" />
                    Зупинити
                  </Button>
                </>
              )}
            </div>
          </div>
          
          {isTracking && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Опис роботи (необов'язково)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Що ви робили..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}
        </div>

        {/* Історія записів часу */}
        <div>
          <h4 className="font-medium mb-4">Історія записів</h4>
          {isLoading ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
            </div>
          ) : timeEntries.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Clock className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Записів часу поки немає</p>
            </div>
          ) : (
            <div className="space-y-3">
              {timeEntries.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center space-x-3">
                      <span className="font-medium text-blue-600">
                        {formatDuration(entry.duration)}
                      </span>
                      <span className="text-sm text-gray-500">
                        {new Date(entry.startTime).toLocaleDateString('uk-UA')}
                      </span>
                      <span className="text-sm text-gray-500">
                        {entry.user.email}
                      </span>
                    </div>
                    {entry.description && (
                      <p className="text-sm text-gray-600 mt-1">{entry.description}</p>
                    )}
                  </div>
                  {(isAdmin || entry.user._id === user?._id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteTimeEntry(entry._id)}
                      className="text-red-600 hover:text-red-800"
                    >
                      Видалити
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Підсумок */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Загальний час:</span>
            <span className="font-medium">{formatDuration(totalTrackedTime)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TimeTracker;