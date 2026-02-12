/**
 * Тести для analyticsController (Етап 2б: звіт якості за оцінками).
 */

const mockTicket = {
  aggregate: jest.fn(),
  find: jest.fn(),
};
jest.mock('../../../models/Ticket', () => mockTicket);

const analyticsController = require('../../../controllers/analyticsController');

describe('analyticsController.getQualityRatingsReport (Етап 2б)', () => {
  let req;
  let res;
  let jsonFn;

  beforeEach(() => {
    jsonFn = jest.fn();
    req = { query: {} };
    res = { status: jest.fn().mockReturnThis(), json: jsonFn };
    mockTicket.aggregate
      .mockResolvedValueOnce([{ averageRating: 4.2, count: 10 }])
      .mockResolvedValueOnce([
        { _id: 1, count: 1 },
        { _id: 2, count: 1 },
        { _id: 3, count: 2 },
        { _id: 4, count: 3 },
        { _id: 5, count: 3 },
      ])
      .mockResolvedValueOnce([
        { _id: 'Printing', averageRating: 4.5, count: 4 },
        { _id: 'Software', averageRating: 4, count: 6 },
      ]);
    mockTicket.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        {
          _id: 'tid1',
          ticketNumber: 'TK-2025-000001',
          title: 'Низька оцінка',
          status: 'closed',
          category: 'Software',
          subcategory: 'Other',
          qualityRating: { rating: 1, feedback: 'Погано', ratedAt: new Date() },
          createdAt: new Date(),
        },
      ]),
    });
  });

  it('повертає 200 і об’єкт з averageRating, countRated, countByRating, byCategory, lowRatedTickets', async () => {
    await analyticsController.getQualityRatingsReport(req, res);
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          averageRating: 4.2,
          countRated: 10,
          countByRating: expect.objectContaining({ 1: 1, 2: 1, 3: 2, 4: 3, 5: 3 }),
          byCategory: expect.any(Array),
          lowRatedTickets: expect.any(Array),
        }),
      })
    );
  });

  it('lowRatedTickets містить id, ticketNumber, title, rating, feedback', async () => {
    await analyticsController.getQualityRatingsReport(req, res);
    const data = jsonFn.mock.calls[0][0].data;
    expect(data.lowRatedTickets.length).toBeGreaterThanOrEqual(1);
    expect(data.lowRatedTickets[0]).toMatchObject({
      id: 'tid1',
      ticketNumber: 'TK-2025-000001',
      title: 'Низька оцінка',
      rating: 1,
      feedback: 'Погано',
    });
  });

  it('додає фільтр ratedAt при startDate/endDate в query', async () => {
    req.query = { startDate: '2025-01-01', endDate: '2025-01-31' };
    await analyticsController.getQualityRatingsReport(req, res);
    expect(mockTicket.aggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({
            'qualityRating.hasRating': true,
            'qualityRating.ratedAt': {
              $gte: new Date('2025-01-01'),
              $lte: new Date('2025-01-31'),
            },
          }),
        }),
      ])
    );
  });

  it('при помилці повертає 500 і message', async () => {
    mockTicket.aggregate.mockReset();
    mockTicket.aggregate.mockRejectedValue(new Error('DB error'));
    mockTicket.find.mockReturnValue({
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });
    await analyticsController.getQualityRatingsReport(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.any(String),
      })
    );
  });
});
