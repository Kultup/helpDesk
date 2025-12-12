import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { apiService } from '../services/api';
import { Ticket, TicketStatus } from '../types';
import RatingRequestModal from './RatingRequestModal';

const RatingRequestChecker: React.FC = () => {
  const { user, isAuthenticated } = useAuth();
  const [pendingRatingTicket, setPendingRatingTicket] = useState<{
    ticketId: string;
    ticketTitle: string;
  } | null>(null);
  const [checkedTickets, setCheckedTickets] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const checkForPendingRatings = async () => {
      try {
        // Отримуємо тікети користувача зі статусом resolved
        const responseResolved = await apiService.getTickets(
          {
            status: [TicketStatus.RESOLVED]
          },
          {
            page: 1,
            limit: 50
          }
        );

        // Отримуємо також тікети зі статусом closed
        const responseClosed = await apiService.getTickets(
          {
            status: [TicketStatus.CLOSED]
          },
          {
            page: 1,
            limit: 50
          }
        );

        let tickets: Ticket[] = [];
        
        // Обробляємо resolved тікети
        if (responseResolved.success && responseResolved.data) {
          const responseData = responseResolved.data as { tickets?: Ticket[]; data?: Ticket[] };
          if (Array.isArray(responseData)) {
            tickets = [...tickets, ...responseData];
          } else if (responseData.tickets && Array.isArray(responseData.tickets)) {
            tickets = [...tickets, ...responseData.tickets];
          } else if (responseData.data && Array.isArray(responseData.data)) {
            tickets = [...tickets, ...responseData.data];
          }
        }
        
        // Обробляємо closed тікети
        if (responseClosed.success && responseClosed.data) {
          const responseData = responseClosed.data as { tickets?: Ticket[]; data?: Ticket[] };
          if (Array.isArray(responseData)) {
            tickets = [...tickets, ...responseData];
          } else if (responseData.tickets && Array.isArray(responseData.tickets)) {
            tickets = [...tickets, ...responseData.tickets];
          } else if (responseData.data && Array.isArray(responseData.data)) {
            tickets = [...tickets, ...responseData.data];
          }
        }
        
        // Фільтруємо тільки тікети, створені поточним користувачем
        tickets = tickets.filter(ticket => {
          const createdBy = typeof ticket.createdBy === 'string' 
            ? ticket.createdBy 
            : ticket.createdBy?._id || ticket.createdBy;
          return createdBy === user._id;
        });

        if (tickets.length > 0) {
          
          // Знаходимо тікети, які потребують оцінки
          // (ratingRequested === true, але hasRating === false)
          const ticketsNeedingRating = tickets.filter(ticket => {
            const ticketId = ticket._id;
            // Пропускаємо тікети, які вже перевіряли
            if (checkedTickets.has(ticketId)) {
              return false;
            }
            
            return (
              ticket.qualityRating?.ratingRequested === true &&
              ticket.qualityRating?.hasRating === false &&
              (ticket.status === TicketStatus.RESOLVED || ticket.status === TicketStatus.CLOSED)
            );
          });

          // Показуємо модальне вікно для першого тікету, який потребує оцінки
          if (ticketsNeedingRating.length > 0 && !pendingRatingTicket) {
            const firstTicket = ticketsNeedingRating[0];
            setPendingRatingTicket({
              ticketId: firstTicket._id,
              ticketTitle: firstTicket.title
            });
            // Додаємо тікет до перевірених, щоб не показувати його знову
            setCheckedTickets(prev => new Set(prev).add(firstTicket._id));
          }
        }
      } catch (error) {
        console.error('Помилка перевірки тікетів для оцінки:', error);
      }
    };

    // Перевіряємо одразу після завантаження
    checkForPendingRatings();

    // Перевіряємо кожні 30 секунд
    const interval = setInterval(checkForPendingRatings, 30000);

    return () => {
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, user?._id]);

  const handleCloseRatingModal = () => {
    setPendingRatingTicket(null);
  };

  const handleRated = async () => {
    // Після оцінки перезавантажуємо тікети та шукаємо наступний
    setPendingRatingTicket(null);
    
    // Очищаємо перевірені тікети, щоб можна було перевірити знову
    // (на випадок, якщо є інші тікети, які потребують оцінки)
    setCheckedTickets(new Set());
    
    // Невелика затримка перед наступною перевіркою
    setTimeout(() => {
      // Перевірка відбудеться автоматично через useEffect
    }, 1000);
  };

  if (!pendingRatingTicket) {
    return null;
  }

  return (
    <RatingRequestModal
      ticketId={pendingRatingTicket.ticketId}
      ticketTitle={pendingRatingTicket.ticketTitle}
      isOpen={!!pendingRatingTicket}
      onClose={handleCloseRatingModal}
      onRated={handleRated}
    />
  );
};

export default RatingRequestChecker;

