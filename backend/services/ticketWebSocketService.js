const logger = require('../utils/logger');

class TicketWebSocketService {
  constructor() {
    this.io = null;
  }

  initialize(io) {
    this.io = io;
    logger.info('🎫 TicketWebSocketService ініціалізовано');
  }

  // Сповіщення про новий тікет
  notifyNewTicket(ticketData) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('ticket-notification', {
        type: 'new_ticket',
        data: ticketData,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про новий тікет: ${ticketData._id}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про новий тікет:', error);
    }
  }

  // Сповіщення про зміну статусу тікету
  notifyTicketStatusChange(ticketData) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('ticket-notification', {
        type: 'ticket_status_change',
        data: ticketData,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📢 Відправлено WebSocket сповіщення про зміну статусу тікету: ${ticketData._id}`
      );
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про зміну статусу тікету:', error);
    }
  }

  // Сповіщення про призначення тікету
  notifyTicketAssignment(ticketData) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('ticket-notification', {
        type: 'ticket_assignment',
        data: ticketData,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про призначення тікету: ${ticketData._id}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про призначення тікету:', error);
    }
  }

  // Оновлення кількості активних тікетів
  notifyTicketCountUpdate(count) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо оновлення кількості всім адміністраторам в admin-room
      this.io.to('admin-room').emit('ticket-count-update', {
        count: count,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📊 Відправлено WebSocket оновлення кількості тікетів: ${count}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket оновлення кількості тікетів:', error);
    }
  }

  // Сповіщення про запит на оцінку якості (для конкретного користувача)
  notifyRatingRequest(userId, ticketData) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення конкретному користувачу через його user-room
      this.io.to(`user-${userId}`).emit('ticket-rating-request', {
        type: 'ticket_rating_request',
        data: {
          ticketId: ticketData._id?.toString() || ticketData._id,
          ticketTitle: ticketData.title,
          ticketStatus: ticketData.status,
        },
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📊 Відправлено WebSocket запит на оцінку для користувача ${userId}, тікет: ${ticketData._id}`
      );
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket запиту на оцінку:', error);
    }
  }

  // Сповіщення про новий коментар
  notifyNewComment(ticketId, comment) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('ticket-comment', {
        type: 'new_comment',
        ticketId: ticketId,
        data: comment,
        timestamp: new Date().toISOString(),
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про новий коментар до тікету: ${ticketId}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про новий коментар:', error);
    }
  }

  // Сповіщення про нове Telegram повідомлення
  notifyNewTelegramMessage(ticketId, message) {
    if (!this.io) {
      logger.warn('⚠️ TicketWebSocketService не ініціалізовано');
      return;
    }

    try {
      // Відправляємо сповіщення всім адміністраторам в admin-room
      this.io.to('admin-room').emit('telegram-message', {
        type: 'new_telegram_message',
        ticketId: ticketId,
        data: message,
        timestamp: new Date().toISOString(),
      });

      logger.info(
        `📱 Відправлено WebSocket сповіщення про нове Telegram повідомлення до тікету: ${ticketId}`
      );
    } catch (error) {
      logger.error(
        '❌ Помилка відправки WebSocket сповіщення про нове Telegram повідомлення:',
        error
      );
    }
  }

  // Сповіщення про нове пряме повідомлення (не прив'язане до тікету)
  notifyNewDirectMessage(userId, message) {
    if (!this.io) {
      return;
    }
    try {
      this.io.to('admin-room').emit('telegram-dm', {
        type: 'new_direct_message',
        userId,
        data: message,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket сповіщення про пряме повідомлення:', error);
    }
  }
}

module.exports = new TicketWebSocketService();
