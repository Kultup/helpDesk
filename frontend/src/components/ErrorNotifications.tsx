import React, { useEffect, useState, useRef } from 'react';
import { X, AlertTriangle, Info, XCircle } from 'lucide-react';
import { Socket } from 'socket.io-client';
import toast from 'react-hot-toast';

interface ErrorNotification {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  timestamp: string;
  error?: {
    name: string;
    statusCode: number;
    stack?: string;
  };
}

const ErrorNotifications: React.FC = () => {
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const maxNotifications = 5; // Максимальна кількість сповіщень одночасно

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    // Імпортуємо socket.io-client динамічно
    import('socket.io-client').then(({ io }) => {
      const socketBase = (
        process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || ''
      ).replace(/\/api\/?$/, '');

      if (!socketBase) {
        console.warn('Socket URL is not configured');
        return;
      }

      const socketInstance = io(socketBase, {
        auth: {
          token: token
        },
        transports: ['websocket', 'polling']
      });

      socketRef.current = socketInstance;

      socketInstance.on('connect', () => {
        setIsConnected(true);
        console.log('Connected to error notifications');
      });

      socketInstance.on('disconnect', () => {
        setIsConnected(false);
        console.log('Disconnected from error notifications');
      });

      socketInstance.on('error-notification', (errorNotification: ErrorNotification) => {
        // Додаємо сповіщення до списку
        setNotifications(prev => {
          const newNotifications = [errorNotification, ...prev];
          // Обмежуємо кількість сповіщень
          if (newNotifications.length > maxNotifications) {
            return newNotifications.slice(0, maxNotifications);
          }
          return newNotifications;
        });

        // Показуємо toast сповіщення
        const toastMessage = errorNotification.message || errorNotification.title;
        const toastOptions = {
          duration: errorNotification.type === 'error' ? 6000 : 4000,
        };

        if (errorNotification.type === 'error') {
          toast.error(toastMessage, toastOptions);
        } else if (errorNotification.type === 'warning') {
          toast(toastMessage, { ...toastOptions, icon: '⚠️' });
        } else {
          toast(toastMessage, { ...toastOptions, icon: 'ℹ️' });
        }
      });

      return () => {
        socketInstance.disconnect();
      };
    });
  }, []);

  const getIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      default:
        return <Info className="h-5 w-5 text-blue-500" />;
    }
  };

  const getBgColor = (type: string) => {
    switch (type) {
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  const removeNotification = (timestamp: string) => {
    setNotifications(prev => prev.filter(n => n.timestamp !== timestamp));
  };

  // Автоматично видаляємо сповіщення через 10 секунд
  useEffect(() => {
    const timer = setInterval(() => {
      setNotifications(prev => {
        const now = Date.now();
        return prev.filter(n => {
          const notificationTime = new Date(n.timestamp).getTime();
          return now - notificationTime < 10000; // 10 секунд
        });
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  if (notifications.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification, index) => (
        <div
          key={notification.timestamp}
          className={`p-4 rounded-lg border shadow-lg ${getBgColor(notification.type)} animate-slide-in-right`}
          style={{ animationDelay: `${index * 0.1}s` }}
        >
          <div className="flex items-start justify-between">
            <div className="flex items-start space-x-3 flex-1">
              <div className="flex-shrink-0 mt-0.5">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold mb-1">
                  {notification.title}
                </h4>
                <p className="text-sm opacity-90">
                  {notification.message}
                </p>
                {notification.error && process.env.NODE_ENV === 'development' && (
                  <details className="mt-2 text-xs opacity-75">
                    <summary className="cursor-pointer">Деталі помилки</summary>
                    <div className="mt-1 p-2 bg-black bg-opacity-10 rounded">
                      <div>Код: {notification.error.statusCode}</div>
                      <div>Тип: {notification.error.name}</div>
                      {notification.error.stack && (
                        <pre className="mt-1 text-xs overflow-auto max-h-32">
                          {notification.error.stack}
                        </pre>
                      )}
                    </div>
                  </details>
                )}
              </div>
            </div>
            <button
              onClick={() => removeNotification(notification.timestamp)}
              className="flex-shrink-0 ml-2 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Закрити"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default ErrorNotifications;

