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
        timestamp: new Date().toISOString()
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
        timestamp: new Date().toISOString()
      });

      logger.info(`📢 Відправлено WebSocket сповіщення про зміну статусу тікету: ${ticketData._id}`);
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
        timestamp: new Date().toISOString()
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
        timestamp: new Date().toISOString()
      });

      logger.info(`📊 Відправлено WebSocket оновлення кількості тікетів: ${count}`);
    } catch (error) {
      logger.error('❌ Помилка відправки WebSocket оновлення кількості тікетів:', error);
    }
  }
}

module.exports = new TicketWebSocketService();