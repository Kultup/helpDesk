import React, { useState, useEffect } from 'react';
import { Bell, X, Clock, MapPin, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CalendarEvent } from '../../types';

interface Notification {
  id: string;
  event: CalendarEvent;
  type: 'reminder' | 'starting' | 'overdue';
  message: string;
  timestamp: Date;
}

interface NotificationSystemProps {
  events: CalendarEvent[];
}

const NotificationSystem: React.FC<NotificationSystemProps> = ({ events }) => {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Check events and create notifications
  useEffect(() => {
    const checkEvents = () => {
      const now = new Date();
      const newNotifications: Notification[] = [];

      events.forEach(event => {
        const eventDate = new Date(event.date);
        const eventStart = new Date(`${event.date}T${event.startTime}`);
        const eventEnd = new Date(`${event.date}T${event.endTime}`);
        
        // Reminder 15 minutes before start
        const reminderTime = new Date(eventStart.getTime() - 15 * 60 * 1000);
        
        // Check if reminder should be shown
        if (now >= reminderTime && now < eventStart) {
          const existingReminder = notifications.find(n => 
            n.event._id === event._id && n.type === 'reminder'
          );
          
          if (!existingReminder) {
            newNotifications.push({
              id: `reminder-${event._id}-${Date.now()}`,
              event,
              type: 'reminder',
              message: t('notificationSystem.reminderMessage', { title: event.title }),
              timestamp: now
            });
          }
        }

        // Notification about event start
        if (now >= eventStart && now < eventEnd) {
          const existingStarting = notifications.find(n => 
            n.event._id === event._id && n.type === 'starting'
          );
          
          if (!existingStarting) {
            newNotifications.push({
              id: `starting-${event._id}-${Date.now()}`,
              event,
              type: 'starting',
              message: t('notificationSystem.startingMessage', { title: event.title }),
              timestamp: now
            });
          }
        }

        // Notification about overdue event
        if (now > eventEnd) {
          const existingOverdue = notifications.find(n => 
            n.event._id === event._id && n.type === 'overdue'
          );
          
          if (!existingOverdue) {
            newNotifications.push({
              id: `overdue-${event._id}-${Date.now()}`,
              event,
              type: 'overdue',
              message: t('notificationSystem.overdueMessage', { title: event.title }),
              timestamp: now
            });
          }
        }
      });

      if (newNotifications.length > 0) {
        setNotifications(prev => [...prev, ...newNotifications]);
        setIsVisible(true);
        
        // Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
          newNotifications.forEach(notification => {
            new Notification(notification.message, {
              icon: '/favicon.ico',
              body: `${notification.event.location ? `${t('notificationSystem.location')}: ${notification.event.location}` : ''}`
            });
          });
        }
      }
    };

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Check every minute
    const interval = setInterval(checkEvents, 60000);
    checkEvents(); // First check

    return () => clearInterval(interval);
  }, [events, notifications]);

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (notifications.length <= 1) {
      setIsVisible(false);
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'reminder': return 'bg-blue-50 border-blue-200 text-blue-800';
      case 'starting': return 'bg-green-50 border-green-200 text-green-800';
      case 'overdue': return 'bg-gray-50 border-gray-200 text-gray-800';
      default: return 'bg-gray-50 border-gray-200 text-gray-800';
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'reminder': return <Bell className="w-4 h-4" />;
      case 'starting': return <Clock className="w-4 h-4" />;
      case 'overdue': return <Calendar className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  if (!isVisible || notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map(notification => (
        <div
          key={notification.id}
          className={`p-4 rounded-lg border shadow-lg ${getNotificationColor(notification.type)} animate-slide-in`}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-2">
              <div className="flex-shrink-0 mt-0.5">
                {getNotificationIcon(notification.type)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{notification.message}</p>
                <div className="mt-1 text-xs opacity-75">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-3 h-3" />
                    <span>{notification.event.startTime} - {notification.event.endTime}</span>
                  </div>
                  {notification.event.location && (
                    <div className="flex items-center space-x-2 mt-1">
                      <MapPin className="w-3 h-3" />
                      <span>{notification.event.location}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => removeNotification(notification.id)}
              className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default NotificationSystem;