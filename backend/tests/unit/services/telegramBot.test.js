/**
 * Тести Telegram-бота: перевірка webhook endpoint.
 * Перевіряють, що POST /api/telegram/webhook приймає оновлення (message, callback_query, фото)
 * у форматі Telegram API і повертає 200. Повний потік (реєстрація → заявка з/без фото, AI, кнопки)
 * рекомендується перевіряти вручну або E2E-тестами.
 */

const request = require('supertest');

let app;

describe('Telegram Bot Webhook', () => {
  beforeAll(() => {
    const express = require('express');
    const telegramRoutes = require('../../../routes/telegram');
    app = express();
    app.use(express.json());
    app.use('/api/telegram', telegramRoutes);
  });

  describe('GET /api/telegram/webhook', () => {
    it('повертає 200 та success', async () => {
      const res = await request(app).get('/api/telegram/webhook').expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Webhook');
    });
  });

  describe('POST /api/telegram/webhook — прийом оновлень', () => {
    it('приймає update з message (наприклад /start) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 1,
          message: {
            chat: { id: 123456789, type: 'private' },
            from: { id: 987654321, username: 'testuser' },
            text: '/start',
            message_id: 1
          }
        })
        .expect(200);
      expect(res.body).toEqual({ success: true, received: true });
    });

    it('приймає update з callback_query (реєстрація) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 2,
          callback_query: {
            id: 'cq-1',
            from: { id: 987654321 },
            message: { chat: { id: 123456789 }, message_id: 2 },
            data: 'register_user'
          }
        })
        .expect(200);
      expect(res.body).toEqual({ success: true, received: true });
    });

    it('приймає update з message.photo (фото для заявки) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 3,
          message: {
            chat: { id: 123456789, type: 'private' },
            from: { id: 987654321 },
            photo: [{ file_id: 'photo-1', file_size: 1000 }],
            message_id: 1
          }
        })
        .expect(200);
      expect(res.body.received).toBe(true);
    });

    it('приймає callback create_ticket (кнопка створення заявки) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 4,
          callback_query: {
            id: 'cq-2',
            from: { id: 987654321 },
            message: { chat: { id: 123456789 }, message_id: 3 },
            data: 'create_ticket'
          }
        })
        .expect(200);
      expect(res.body.received).toBe(true);
    });

    it('приймає callback skip_photo (пропустити фото) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 5,
          callback_query: {
            id: 'cq-3',
            from: { id: 987654321 },
            message: { chat: { id: 123456789 }, message_id: 4 },
            data: 'skip_photo'
          }
        })
        .expect(200);
      expect(res.body.received).toBe(true);
    });

    it('приймає callback confirm_create_ticket (підтвердження заявки) і повертає 200', async () => {
      const res = await request(app)
        .post('/api/telegram/webhook')
        .send({
          update_id: 6,
          callback_query: {
            id: 'cq-4',
            from: { id: 987654321 },
            message: { chat: { id: 123456789 }, message_id: 5 },
            data: 'confirm_create_ticket'
          }
        })
        .expect(200);
      expect(res.body.received).toBe(true);
    });
  });
});
