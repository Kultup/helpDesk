const jwt = require('jsonwebtoken');
const { connectDB, disconnectDB, clearDatabase, createTestUser, generateAuthToken } = require('../../helpers/testHelpers');
const { authenticateToken } = require('../../../middleware/auth');
const User = require('../../../models/User');

describe('authenticateToken middleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDatabase();
    
    mockReq = {
      headers: {},
      user: null
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    
    mockNext = jest.fn();
  });

  it('should authenticate user with valid token', async () => {
    const user = await createTestUser({
      isActive: true,
      registrationStatus: 'approved'
    });
    const token = generateAuthToken(user);

    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticateToken(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockReq.user).toBeDefined();
    expect(mockReq.user.email).toBe(user.email);
  });

  it('should reject request without token', async () => {
    await authenticateToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('не надано')
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request with invalid token', async () => {
    mockReq.headers.authorization = 'Bearer invalid-token';

    await authenticateToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request for inactive user', async () => {
    const user = await createTestUser({
      isActive: false,
      registrationStatus: 'approved'
    });
    const token = generateAuthToken(user);

    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticateToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('деактивовано')
      })
    );
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject request for pending registration', async () => {
    const user = await createTestUser({
      isActive: true,
      registrationStatus: 'pending'
    });
    const token = generateAuthToken(user);

    mockReq.headers.authorization = `Bearer ${token}`;

    await authenticateToken(mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('should reject token without Bearer prefix', async () => {
    const user = await createTestUser({
      isActive: true,
      registrationStatus: 'approved'
    });
    const token = generateAuthToken(user);

    mockReq.headers.authorization = token; // без "Bearer " префіксу

    await authenticateToken(mockReq, mockRes, mockNext);

    // Token without Bearer prefix should be rejected (split will return undefined for [1])
    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});

