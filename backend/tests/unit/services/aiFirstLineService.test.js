/**
 * Тести для aiFirstLineService (частина A: класифікація question/appeal).
 * Перевіряють, що analyzeIntent повертає requestType та requestTypeConfidence у всіх гілках.
 */

const defaultSettings = {
  key: 'default',
  enabled: true,
  provider: 'openai',
  openaiApiKey: 'sk-test-key',
};

jest.mock('../../../models/AISettings', () => ({
  findOne: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(defaultSettings),
  }),
}));
const AISettings = require('../../../models/AISettings');
const aiEnhancedService = require('../../../services/aiEnhancedService');
const kbSearchService = require('../../../services/kbSearchService');

jest.mock('../../../models/Ticket', () => ({
  find: jest.fn().mockReturnValue({
    sort: jest.fn().mockReturnValue({
      limit: jest.fn().mockResolvedValue([]),
    }),
  }),
}));
jest.mock('../../../services/aiEnhancedService', () => ({
  getAllQuickSolutions: jest.fn().mockImplementation(() => []),
  findQuickSolution: jest.fn().mockImplementation(() => null),
}));
jest.mock('../../../services/kbSearchService', () => ({
  findBestMatchForBot: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('../../../utils/retryHelper');
jest.mock('../../../utils/aiResponseValidator', () => ({
  validate: jest.fn().mockReturnValue({ valid: true }),
}));
jest.mock('../../../services/metricsCollector', () => ({
  recordAIResponse: jest.fn(),
  recordValidationFailure: jest.fn(),
}));

describe('aiFirstLineService.analyzeIntent — requestType (A.1, A.2)', () => {
  const emptyContext = {};
  const dialogWithUserMessage = text => [{ role: 'user', content: text }];

  function requireFreshService(settingsOverrides = null) {
    jest.resetModules();
    AISettings.findOne.mockReturnValue({
      lean: jest.fn().mockResolvedValue(settingsOverrides || defaultSettings),
    });
    aiEnhancedService.getAllQuickSolutions.mockImplementation(() => []);
    aiEnhancedService.findQuickSolution.mockReturnValue(null);
    kbSearchService.findBestMatchForBot.mockResolvedValue(null);
    return require('../../../services/aiFirstLineService');
  }

  describe('коли AI вимкнено або немає ключа', () => {
    it('повертає requestType "question" і requestTypeConfidence 0 при enabled: false', async () => {
      const svc = requireFreshService({ enabled: false });
      const result = await svc.analyzeIntent(
        dialogWithUserMessage('принтер не працює'),
        emptyContext
      );
      expect(result).toMatchObject({
        requestType: 'question',
        requestTypeConfidence: 0,
        isTicketIntent: false,
      });
    });

    it('повертає requestType "question" при відсутньому API-ключі', async () => {
      const svc = requireFreshService({
        enabled: true,
        provider: 'openai',
        openaiApiKey: '',
      });
      const result = await svc.analyzeIntent(
        dialogWithUserMessage('не працює інтернет'),
        emptyContext
      );
      expect(result.requestType).toBe('question');
      expect(result.requestTypeConfidence).toBe(0);
    });
  });

  describe('структура відповіді (requestType завжди присутній)', () => {
    it('повертає об’єкт з полями requestType та requestTypeConfidence при будь-якому результаті', async () => {
      const svc = requireFreshService({ enabled: false });
      const result = await svc.analyzeIntent(dialogWithUserMessage('тест'), emptyContext);
      expect(result).toHaveProperty('requestType');
      expect(['question', 'appeal']).toContain(result.requestType);
      expect(result).toHaveProperty('requestTypeConfidence');
      expect(typeof result.requestTypeConfidence).toBe('number');
    });
  });
});
