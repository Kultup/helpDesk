// Тимчасово відключаємо глобальний мок для цього тесту
jest.unmock('../../../services/emailService');
const emailService = require('../../../services/emailService');

describe('EmailService', () => {
  describe('sendEmail', () => {
    it('should send email successfully', async () => {
      const result = await emailService.sendEmail(
        'test@example.com',
        'Test Subject',
        '<h1>Test HTML</h1>',
        'Test Text'
      );

      // emailService.sendEmail повертає Promise.resolve(true) в поточній реалізації
      expect(result).toBe(true);
    });

    it('should handle email sending with minimal parameters', async () => {
      const result = await emailService.sendEmail('test@example.com', 'Subject');

      expect(result).toBe(true);
    });

    it('should return true for any valid input', async () => {
      const result1 = await emailService.sendEmail('user1@example.com', 'Subject 1');
      const result2 = await emailService.sendEmail('user2@example.com', 'Subject 2', '<p>HTML</p>', 'Text');

      expect(result1).toBe(true);
      expect(result2).toBe(true);
    });
  });
});

