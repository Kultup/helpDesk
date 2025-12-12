import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import RatingRequestModal from './RatingRequestModal';

const SocketNotifications = () => {
  const { user, isAuthenticated } = useAuth();
  const [ratingRequest, setRatingRequest] = useState<{
    ticketId: string;
    ticketTitle: string;
  } | null>(null);

  useEffect(() => {
    let socket: any = null;
    const rawUrl = (process.env.REACT_APP_SOCKET_URL || process.env.REACT_APP_API_URL || window.location.origin) as string;
    const socketUrl = rawUrl.replace(/\/api\/?$/, '');

    const requestPermission = async () => {
      if ('Notification' in window && Notification.permission === 'default') {
        try { await Notification.requestPermission(); } catch {}
      }
    };

    const showNotification = (title: string, body: string) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification(title, { body }); } catch {}
      } else {
        toast(`${title}: ${body}`, { icon: '🔔' });
      }
    };

    if (isAuthenticated && user) {
      requestPermission();
      socket = io(socketUrl, { transports: ['websocket'] });
      socket.on('connect', () => {
        // Підключаємося до кімнати користувача для персональних сповіщень
        if (user._id) {
          socket.emit('join-user-room', user._id);
        }
        if (user?.role === 'admin') {
          socket.emit('join-admin-room');
        }
      });

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

      // Обробка запиту на оцінку якості
      socket.on('ticket-rating-request', (payload: any) => {
        if (payload?.data?.ticketId && payload?.data?.ticketTitle) {
          setRatingRequest({
            ticketId: payload.data.ticketId,
            ticketTitle: payload.data.ticketTitle
          });
          showNotification('📊 Оцініть якість вирішення', `Тікет "${payload.data.ticketTitle}" вирішено. Будь ласка, оцініть якість обслуговування.`);
        }
      });
    }

    return () => {
      if (socket) { try { socket.disconnect(); } catch {} }
    };
  }, [isAuthenticated, user]);

  const handleCloseRatingModal = () => {
    setRatingRequest(null);
  };

  const handleRated = () => {
    // Можна додати логіку оновлення списку тікетів
    setRatingRequest(null);
  };

  return (
    <>
      {ratingRequest && (
        <RatingRequestModal
          ticketId={ratingRequest.ticketId}
          ticketTitle={ratingRequest.ticketTitle}
          isOpen={!!ratingRequest}
          onClose={handleCloseRatingModal}
          onRated={handleRated}
        />
      )}
    </>
  );
};

export default SocketNotifications;
