import { useEffect } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { isAdminRole } from '../types';

const SocketNotifications = () => {
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    let socket: any = null;
    const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || window.location.origin) as string;
    const socketUrl = rawUrl.replace(/\/api\/?$/, '');

    const requestPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch (error) {
          // Ignore notification permission errors
        }
      }
    };

    const showNotification = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body }); } catch (error) {
          // Fallback to toast if notification fails
          toast(`${title}: ${body}`, { icon: '🔔' });
        }
      } else {
        toast(`${title}: ${body}`, { icon: '🔔' });
      }
    };

    if (isAuthenticated && user) {
      requestPermission();
      const token = localStorage.getItem('token');
      socket = io(socketUrl, {
        auth: token ? { token } : undefined,
        transports: ['websocket']
      });
      socket.on('connect', () => {
        if (user._id) {
          socket.emit('join-user-room', user._id);
        }
        // Тільки адміни приєднуються до кімнати сповіщень про тікети/реєстрації
        if (user?.role != null && isAdminRole(user.role)) {
          socket.emit('join-admin-room');
        }
      });

      // Сповіщення про тікети — тільки для адмінів (звичайні користувачі їх не отримують)
      if (user?.role != null && isAdminRole(user.role)) {
        socket.on('ticket-notification', (payload: any) => {
          const type = payload?.type;
          const title = type === 'new_ticket' ? 'Новий тікет' : type === 'ticket_status_change' ? 'Оновлення тікету' : 'Сповіщення тікетів';
          const message = payload?.data?.title || payload?.message || '';
          showNotification(title, message);
        });

        socket.on('registration-notification', (payload: any) => {
          const email = payload?.data?.email || payload?.userEmail || '';
          showNotification('Новий запит на реєстрацію', email);
        });
      }
    }

    return () => {
      if (socket) { 
        try { 
          socket.disconnect(); 
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    };
  }, [isAuthenticated, user]);

  return null;
};

export default SocketNotifications;
