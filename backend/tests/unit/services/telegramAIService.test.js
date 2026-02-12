/**
 * Тести для telegramAIService (A.3: підказка з KB для appeal).
 * Перевіряють _sendKbHintForAppeal та наявність cachedRequestType.
 */

jest.mock('../../../services/kbSearchService', () => ({
  findBestMatchForBot: jest.fn(),
}));

const kbSearchService = require('../../../services/kbSearchService');

describe('TelegramAIService — A.3 requestType та KB hint', () => {
  let TelegramAIService;
  let telegramServiceMock;
  let service;

  beforeAll(() => {
    telegramServiceMock = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
    };
    TelegramAIService = require('../../../services/telegramAIService');
    service = new TelegramAIService(telegramServiceMock);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('_sendKbHintForAppeal', () => {
    it('нічого не робить при порожньому query', async () => {
      await service._sendKbHintForAppeal(123, '');
      await service._sendKbHintForAppeal(123, '   ');
      expect(kbSearchService.findBestMatchForBot).not.toHaveBeenCalled();
      expect(telegramServiceMock.sendMessage).not.toHaveBeenCalled();
    });

    it('не викликає sendMessage якщо статтю не знайдено', async () => {
      kbSearchService.findBestMatchForBot.mockResolvedValue(null);
      await service._sendKbHintForAppeal(123, 'принтер не працює');
      expect(kbSearchService.findBestMatchForBot).toHaveBeenCalledWith('принтер не працює');
      expect(telegramServiceMock.sendMessage).not.toHaveBeenCalled();
    });

    it('надсилає підказку з заголовком і уривком коли статтю знайдено', async () => {
      kbSearchService.findBestMatchForBot.mockResolvedValue({
        title: 'Як налаштувати принтер',
        content: 'Крок 1. Відкрийте налаштування. Крок 2. Оберіть принтер.',
      });
      await service._sendKbHintForAppeal(456, 'принтер');
      expect(telegramServiceMock.sendMessage).toHaveBeenCalledWith(
        456,
        expect.stringContaining('Можливо, вам допоможе')
      );
      expect(telegramServiceMock.sendMessage.mock.calls[0][1]).toContain('Як налаштувати принтер');
    });

    it('надсилає лише заголовок якщо контенту немає', async () => {
      kbSearchService.findBestMatchForBot.mockResolvedValue({
        title: 'Інструкція',
        content: '',
      });
      await service._sendKbHintForAppeal(789, 'інструкція');
      expect(telegramServiceMock.sendMessage).toHaveBeenCalledWith(
        789,
        expect.stringMatching(/Можливо, вам допоможе стаття з бази знань: «Інструкція»/)
      );
    });
  });
});
