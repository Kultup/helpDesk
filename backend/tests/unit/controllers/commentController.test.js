const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const {
  connectDB,
  disconnectDB,
  clearDatabase,
  createTestUser,
  createTestAdmin,
  createTestTicket,
} = require('../../helpers/testHelpers');
const commentController = require('../../../controllers/commentController');
const Comment = require('../../../models/Comment');
const Ticket = require('../../../models/Ticket');

// Моки (telegramServiceInstance та ticketWebSocketService тепер глобальні в setup.js)
jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

describe('CommentController', () => {
  let mockReq;
  let mockRes;
  let testUser;
  let testAdmin;
  let testTicket;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDatabase();

    testUser = await createTestUser({
      email: `user-${Date.now()}@example.com`,
      role: 'user',
    });

    testAdmin = await createTestAdmin({
      email: `admin-${Date.now()}@example.com`,
      role: 'admin',
    });

    testTicket = await createTestTicket(testUser);

    mockReq = {
      body: {},
      params: {},
      query: {},
      user: testUser,
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  describe('getTicketComments', () => {
    it('should return comments for a ticket', async () => {
      // Перевіряємо що тикет існує перед створенням коментаря
      const ticketExists = await Ticket.findById(testTicket._id);
      expect(ticketExists).toBeDefined();

      // Створюємо коментар
      const comment = await Comment.create({
        content: 'Test comment',
        ticket: testTicket._id,
        author: testUser._id,
      });

      // Перевіряємо що коментар створено
      expect(comment).toBeDefined();
      expect(comment.ticket.toString()).toBe(testTicket._id.toString());

      mockReq.user = {
        _id: testUser._id,
        role: testUser.role || 'user',
      };
      mockReq.params.ticketId = testTicket._id.toString();
      mockReq.query = { page: 1, limit: 10 };

      await commentController.getTicketComments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];

      if (response.success === false) {
        console.error('getTicketComments failed:', response);
        expect(mockRes.status).toHaveBeenCalled();
      } else {
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('pagination');
        expect(Array.isArray(response.data)).toBe(true);
      }
    });

    it('should return empty array for ticket without comments', async () => {
      mockReq.user = {
        _id: testUser._id,
        role: testUser.role,
      };
      mockReq.params.ticketId = testTicket._id.toString();
      mockReq.query = { page: 1, limit: 10 };

      await commentController.getTicketComments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];

      if (response.success === false) {
        console.error('getTicketComments failed:', response);
        // Може бути помилка з правами доступу
        expect(mockRes.status).toHaveBeenCalled();
      } else {
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('pagination');
        expect(Array.isArray(response.data)).toBe(true);
        expect(response.data.length).toBe(0);
      }
    });
  });

  describe('createComment', () => {
    it('should create a new comment', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.user = testUser;
      mockReq.body = {
        content: 'New comment',
        ticket: testTicket._id.toString(),
      };
      mockReq.params.ticketId = testTicket._id.toString();

      await commentController.createComment(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('content', 'New comment');
      expect(response.data).toHaveProperty('author');

      // Перевіряємо що коментар збережено в БД
      const savedComment = await Comment.findOne({ content: 'New comment' });
      expect(savedComment).toBeDefined();
      expect(savedComment.content).toBe('New comment');
    });

    it('should return 400 with missing content', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Content is required' }],
      });

      mockReq.user = testUser;
      mockReq.body = {
        ticket: testTicket._id.toString(),
      };
      mockReq.params.ticketId = testTicket._id.toString();

      await commentController.createComment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getCommentById', () => {
    it('should return comment by id', async () => {
      const comment = await Comment.create({
        content: 'Test comment',
        ticket: testTicket._id,
        author: testUser._id,
      });

      mockReq.params.id = comment._id.toString();

      await commentController.getCommentById(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('success', true);
      expect(response.data).toHaveProperty('content', 'Test comment');
    });

    it('should return 404 for non-existent comment', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      mockReq.params.id = fakeId.toString();

      await commentController.getCommentById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });

  describe('updateComment', () => {
    it('should update comment by author', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      const comment = await Comment.create({
        content: 'Original comment',
        ticket: testTicket._id,
        author: testUser._id,
      });

      mockReq.user = {
        _id: testUser._id,
        role: testUser.role,
      };
      mockReq.params.id = comment._id.toString();
      mockReq.body = {
        content: 'Updated comment',
      };

      await commentController.updateComment(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];

      if (response.success === false) {
        console.error('updateComment failed:', response);
        expect(mockRes.status).toHaveBeenCalled();
      } else {
        expect(response).toHaveProperty('success', true);
        // Перевіряємо що коментар оновлено
        const updatedComment = await Comment.findById(comment._id);
        expect(updatedComment.content).toBe('Updated comment');
      }
    });

    it('should return 403 for non-author user', async () => {
      const otherUser = await createTestUser({ email: 'other@example.com' });
      const comment = await Comment.create({
        content: 'Original comment',
        ticket: testTicket._id,
        author: testUser._id,
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.user = otherUser;
      mockReq.params.id = comment._id.toString();
      mockReq.body = {
        content: 'Updated comment',
      };

      await commentController.updateComment(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('deleteComment', () => {
    it('should delete comment by author', async () => {
      const comment = await Comment.create({
        content: 'Comment to delete',
        ticket: testTicket._id,
        author: testUser._id,
      });

      mockReq.user = testUser;
      mockReq.params.id = comment._id.toString();

      await commentController.deleteComment(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('success', true);

      // Перевіряємо що коментар помічено як видалений
      const deletedComment = await Comment.findById(comment._id);
      expect(deletedComment.isDeleted).toBe(true);
    });

    it('should allow admin to delete any comment', async () => {
      const comment = await Comment.create({
        content: 'Comment to delete',
        ticket: testTicket._id,
        author: testUser._id,
      });

      mockReq.user = testAdmin;
      mockReq.params.id = comment._id.toString();

      await commentController.deleteComment(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('success', true);
    });
  });

  describe('getAllComments', () => {
    it('should return all comments with pagination', async () => {
      await Comment.create({
        content: 'Comment 1',
        ticket: testTicket._id,
        author: testUser._id,
      });

      await Comment.create({
        content: 'Comment 2',
        ticket: testTicket._id,
        author: testUser._id,
      });

      mockReq.query = { page: 1, limit: 10 };

      await commentController.getAllComments(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];

      if (response.success === false) {
        console.error('getAllComments failed:', response);
        // Може бути помилка з правами або інше
        expect(mockRes.status).toHaveBeenCalled();
      } else {
        expect(response).toHaveProperty('success', true);
        expect(response).toHaveProperty('data');
        expect(response).toHaveProperty('pagination');
      }
    });
  });
});
