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

const mockTicketEmbeddingService = {
  findSimilarTickets: jest.fn(),
};
jest.mock('../../../services/ticketEmbeddingService', () => mockTicketEmbeddingService);

describe('aiFirstLineService.getSimilarResolvedTickets (Етап 1, 2б)', () => {
  function chainMock(resolvedValue) {
    return {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(resolvedValue),
      }),
    };
  }

  it('повертає "(немає)" коли немає тікетів (fallback без query)', async () => {
    jest.resetModules();
    const Ticket = require('../../../models/Ticket');
    Ticket.find.mockReturnValue(chainMock([]));
    mockTicketEmbeddingService.findSimilarTickets.mockResolvedValue([]);
    const svc = require('../../../services/aiFirstLineService');
    const result = await svc.getSimilarResolvedTickets(5, '');
    expect(result).toBe('(немає)');
    expect(Ticket.find).toHaveBeenCalled();
  });

  it('при наявному query викликає findSimilarTickets і форматує контекст', async () => {
    jest.resetModules();
    const tickets = [
      { title: 'T1', description: 'D1', resolutionSummary: 'R1', subcategory: 'S1' },
    ];
    mockTicketEmbeddingService.findSimilarTickets.mockResolvedValue([
      { ticket: tickets[0], score: 0.9 },
    ]);
    const svc = require('../../../services/aiFirstLineService');
    const result = await svc.getSimilarResolvedTickets(5, 'принтер не працює');
    expect(mockTicketEmbeddingService.findSimilarTickets).toHaveBeenCalledWith(
      'принтер не працює',
      {
        topK: 5,
      }
    );
    expect(result).toContain('T1');
    expect(result).toContain('R1');
    expect(result).not.toBe('(немає)');
  });

  it('при порожньому результаті findSimilarTickets йде у fallback за датою', async () => {
    jest.resetModules();
    const Ticket = require('../../../models/Ticket');
    mockTicketEmbeddingService.findSimilarTickets.mockResolvedValue([]);
    Ticket.find.mockReturnValue(
      chainMock([
        {
          title: 'Fallback',
          description: 'D',
          resolutionSummary: 'R',
          subcategory: 'S',
        },
      ])
    );
    const svc = require('../../../services/aiFirstLineService');
    const result = await svc.getSimilarResolvedTickets(3, 'принтер');
    expect(result).toContain('Fallback');
    expect(result).toContain('R');
    expect(Ticket.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: { $in: ['resolved', 'closed'] },
        $and: [
          {
            $or: [
              { 'qualityRating.hasRating': { $ne: true } },
              { 'qualityRating.rating': { $gte: 4 } },
            ],
          },
        ],
      })
    );
  });
});

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
