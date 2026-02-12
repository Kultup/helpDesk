/**
 * Тести для ticketEmbeddingService (Етап 1: семантичний пошук по тікетах, Етап 2б: фільтр/вага за оцінкою).
 */

const mockEmbedding = [0.1, 0.2, 0.3];

jest.mock('../../../services/kbEmbeddingService', () => ({
  getEmbeddingSettings: jest.fn().mockResolvedValue({ openaiApiKey: 'sk-test' }),
  getEmbedding: jest.fn().mockResolvedValue(mockEmbedding),
}));

const mockTicketsWithEmbedding = [
  {
    _id: 'tid1',
    title: 'Принтер не друкує',
    description: 'Опис',
    resolutionSummary: 'Перезавантажили',
    subcategory: 'Printing',
    embedding: [0.1, 0.2, 0.3],
    qualityRating: { hasRating: true, rating: 5 },
  },
  {
    _id: 'tid2',
    title: 'Не відкривається PDF',
    description: 'Опис 2',
    resolutionSummary: 'Оновлено Adobe',
    subcategory: 'Software',
    embedding: [0.11, 0.19, 0.31],
    qualityRating: { hasRating: true, rating: 4 },
  },
  {
    _id: 'tid3',
    title: 'Низька оцінка',
    description: 'Д',
    resolutionSummary: 'Р',
    subcategory: 'Other',
    embedding: [0.12, 0.21, 0.29],
    qualityRating: { hasRating: true, rating: 1 },
  },
  {
    _id: 'tid4',
    title: 'Без оцінки',
    description: 'Д',
    resolutionSummary: 'Р',
    subcategory: 'Other',
    embedding: [0.09, 0.22, 0.31],
    qualityRating: { hasRating: false },
  },
];

const mockTicket = {
  find: jest.fn(),
  updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
  findById: jest.fn(),
};
jest.mock('../../../models/Ticket', () => mockTicket);

const kbEmbeddingService = require('../../../services/kbEmbeddingService');
let ticketEmbeddingService;

beforeEach(() => {
  jest.resetModules();
  kbEmbeddingService.getEmbeddingSettings.mockResolvedValue({ openaiApiKey: 'sk-test' });
  kbEmbeddingService.getEmbedding.mockResolvedValue(mockEmbedding);
  mockTicket.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue(mockTicketsWithEmbedding),
    }),
  });
  ticketEmbeddingService = require('../../../services/ticketEmbeddingService');
});

describe('ticketEmbeddingService.getIndexableTextForTicket (Етап 1)', () => {
  it('збирає title, description, resolutionSummary через \\n\\n', () => {
    const text = ticketEmbeddingService.getIndexableTextForTicket({
      title: 'Заголовок',
      description: 'Опис',
      resolutionSummary: 'Рішення',
    });
    expect(text).toBe('Заголовок\n\nОпис\n\nРішення');
  });

  it('повертає порожній рядок для порожнього тікета', () => {
    const text = ticketEmbeddingService.getIndexableTextForTicket({});
    expect(text).toBe('');
  });

  it('ігнорує порожні та пробільні поля', () => {
    const text = ticketEmbeddingService.getIndexableTextForTicket({
      title: '  ',
      description: 'Опис',
      resolutionSummary: '',
    });
    expect(text).toBe('Опис');
  });

  it('обрізає текст до 8000 символів', () => {
    const long = 'a'.repeat(9000);
    const text = ticketEmbeddingService.getIndexableTextForTicket({
      title: long,
    });
    expect(text.length).toBe(8000);
    expect(text).toBe(long.slice(0, 8000));
  });
});

describe('ticketEmbeddingService.findSimilarTickets (Етап 1, 2б)', () => {
  it('повертає [] для порожнього query', async () => {
    const result = await ticketEmbeddingService.findSimilarTickets('');
    expect(result).toEqual([]);
    expect(mockTicket.find).not.toHaveBeenCalled();
  });

  it('фільтрує тікети з оцінкою 1 або 2 (Етап 2б)', async () => {
    const result = await ticketEmbeddingService.findSimilarTickets('принтер', { topK: 10 });
    const ids = result.map(r => r.ticket._id);
    expect(ids).not.toContain('tid3');
    expect(ids).toContain('tid1');
    expect(ids).toContain('tid2');
    expect(ids).toContain('tid4');
  });

  it('включає тікети без оцінки та з оцінкою >= 4', async () => {
    const result = await ticketEmbeddingService.findSimilarTickets('принтер', { topK: 10 });
    expect(result.length).toBeGreaterThanOrEqual(1);
    const withRating1or2 = result.filter(
      r =>
        r.ticket.qualityRating?.hasRating &&
        (r.ticket.qualityRating?.rating === 1 || r.ticket.qualityRating?.rating === 2)
    );
    expect(withRating1or2.length).toBe(0);
  });

  it('повертає не більше topK результатів', async () => {
    const result = await ticketEmbeddingService.findSimilarTickets('принтер', { topK: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('кожен елемент має ticket та score', async () => {
    const result = await ticketEmbeddingService.findSimilarTickets('принтер', { topK: 5 });
    result.forEach(item => {
      expect(item).toHaveProperty('ticket');
      expect(item).toHaveProperty('score');
      expect(typeof item.score).toBe('number');
    });
  });
});

describe('ticketEmbeddingService.indexTicket (Етап 1)', () => {
  it('повертає false для неіснуючого тікета', async () => {
    mockTicket.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue(null),
    });
    const result = await ticketEmbeddingService.indexTicket('nonexistent');
    expect(result).toBe(false);
  });

  it('повертає false для тікета зі статусом open', async () => {
    mockTicket.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 't1',
        status: 'open',
        title: 'T',
        resolutionSummary: 'R',
      }),
    });
    const result = await ticketEmbeddingService.indexTicket('t1');
    expect(result).toBe(false);
  });

  it('повертає false якщо немає контенту (немає resolutionSummary і aiDialogHistory)', async () => {
    mockTicket.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 't1',
        status: 'resolved',
        title: 'T',
        resolutionSummary: '',
        aiDialogHistory: [],
      }),
    });
    const result = await ticketEmbeddingService.indexTicket('t1');
    expect(result).toBe(false);
  });

  it('повертає true та викликає updateOne для resolved тікета з resolutionSummary', async () => {
    mockTicket.findById.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: 't1',
        status: 'resolved',
        title: 'T',
        description: 'D',
        resolutionSummary: 'R',
      }),
    });
    mockTicket.updateOne.mockResolvedValue({ modifiedCount: 1 });
    const result = await ticketEmbeddingService.indexTicket('t1');
    expect(result).toBe(true);
    expect(mockTicket.updateOne).toHaveBeenCalledWith(
      { _id: 't1' },
      expect.objectContaining({ $set: expect.objectContaining({ embedding: expect.any(Array) }) })
    );
  });
});
