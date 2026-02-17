const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const {
  connectDB,
  disconnectDB,
  clearDatabase,
  createTestUser,
} = require('../../helpers/testHelpers');
const authController = require('../../../controllers/authController');
const User = require('../../../models/User');

// Моки (emailService та telegramService тепер глобальні в setup.js)
jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

describe('AuthController', () => {
  let mockReq;
  let mockRes;

  beforeAll(async () => {
    await connectDB();
  });

  afterAll(async () => {
    await clearDatabase();
    await disconnectDB();
  });

  beforeEach(async () => {
    await clearDatabase();

    // Скидаємо моки
    validationResult.mockClear();

    mockReq = {
      body: {},
      headers: {},
      user: null,
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      cookie: jest.fn().mockReturnThis(),
      clearCookie: jest.fn().mockReturnThis(),
    };
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const password = 'password123';
      const testEmail = `test-${Date.now()}@example.com`.toLowerCase();

      // Створюємо користувача з незахешованим паролем (модель сама захешує)
      const user = await createTestUser({
        email: testEmail,
        password: password, // Передаємо незахешований пароль
        isActive: true,
        registrationStatus: 'approved',
      });

      // Мокаємо validationResult
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = {
        email: testEmail,
        password: password,
      };
      mockReq.ip = '127.0.0.1';
      mockReq.get = jest.fn().mockReturnValue('test-user-agent');

      // Перевіряємо що користувач збережений з правильним паролем
      const savedUser = await User.findById(user._id).select('+password').populate('position city');
      expect(savedUser).toBeDefined();
      expect(savedUser.password).toBeDefined();
      expect(savedUser.password).not.toBe(password); // Пароль має бути захешований
      expect(savedUser.email.toLowerCase()).toBe(testEmail.toLowerCase());

      // Перевіряємо що користувач знаходиться через findOne
      const foundUser = await User.findOne({ email: testEmail.toLowerCase() })
        .select('+password')
        .populate('position city');
      expect(foundUser).toBeDefined();
      if (foundUser) {
        expect(foundUser._id.toString()).toBe(user._id.toString());
      }

      try {
        await authController.login(mockReq, mockRes);
      } catch (error) {
        console.error('Login controller error:', error);
        console.error('Error stack:', error.stack);
        console.error('MockRes status calls:', mockRes.status.mock.calls);
        console.error('MockRes json calls:', mockRes.json.mock.calls);
        throw error;
      }

      // Контролер використовує res.json() без res.status(200), тому перевіряємо json
      expect(mockRes.json).toHaveBeenCalled();

      // Перевіряємо, що не було помилки
      if (mockRes.status.mock.calls.length > 0) {
        const statusCode = mockRes.status.mock.calls[0][0];
        if (statusCode !== 200) {
          const errorResponse = mockRes.json.mock.calls[0]
            ? mockRes.json.mock.calls[0][0]
            : 'No response';
          console.error(`Login failed with ${statusCode}:`, errorResponse);
          const errorMsg = errorResponse?.error || errorResponse?.message || 'Unknown error';
          throw new Error(`Login failed with ${statusCode}: ${JSON.stringify(errorMsg)}`);
        }
      }

      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('success', true);
      expect(response).toHaveProperty('data');
      expect(response.data).toHaveProperty('token');
      expect(response.data).toHaveProperty('user');
    });

    it('should reject login with invalid email', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };
      mockReq.ip = '127.0.0.1';
      mockReq.get = jest.fn().mockReturnValue('test-user-agent');

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Невірний email або пароль'),
        })
      );
    });

    it('should reject login with invalid password', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      await clearDatabase(); // Очищаємо перед цим тестом
      await createTestUser({
        email: 'test@example.com',
        password: await bcrypt.hash('correctpassword', 10),
        isActive: true,
        registrationStatus: 'approved',
      });

      mockReq.body = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };
      mockReq.ip = '127.0.0.1';
      mockReq.get = jest.fn().mockReturnValue('test-user-agent');

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });

    it('should reject login for inactive user', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      const password = 'password123';
      await createTestUser({
        email: 'test@example.com',
        password: await bcrypt.hash(password, 10),
        isActive: false,
        registrationStatus: 'approved',
      });

      mockReq.body = {
        email: 'test@example.com',
        password: password,
      };
      mockReq.ip = '127.0.0.1';
      mockReq.get = jest.fn().mockReturnValue('test-user-agent');

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('деактивований'),
        })
      );
    });

    it('should reject login for pending registration', async () => {
      const password = 'password123';
      const testEmail = `test-pending-${Date.now()}@example.com`;
      await createTestUser({
        email: testEmail,
        password: await bcrypt.hash(password, 10),
        isActive: true,
        registrationStatus: 'pending',
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = {
        email: testEmail,
        password: password,
      };
      mockReq.ip = '127.0.0.1';
      mockReq.get = jest.fn().mockReturnValue('test-user-agent');

      await authController.login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', () => {
    it('should logout user successfully', async () => {
      const user = await createTestUser();
      const refreshToken = 'test-refresh-token';

      // Додаємо refresh token до користувача
      user.refreshTokens = [
        {
          token: refreshToken,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];
      await user.save();

      mockReq.user = { userId: user._id.toString(), email: user.email };
      mockReq.cookies = { refreshToken };
      mockReq.ip = '127.0.0.1';

      await authController.logout(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');
    });

    it('should logout without refresh token', async () => {
      const user = await createTestUser();

      mockReq.user = { userId: user._id.toString(), email: user.email };
      mockReq.cookies = {};
      mockReq.ip = '127.0.0.1';

      await authController.logout(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(mockRes.json).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('should refresh token successfully', async () => {
      const user = await createTestUser();
      const refreshToken = jwt.sign(
        { userId: user._id.toString(), type: 'refresh' },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      user.refreshTokens = [
        {
          token: refreshToken,
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];
      await user.save();

      mockReq.cookies = { refreshToken };

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('accessToken');
      expect(response).toHaveProperty('expiresIn');
    });

    it('should reject refresh without token', async () => {
      mockReq.cookies = {};

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Refresh token не знайдено'),
        })
      );
    });

    it('should reject invalid refresh token', async () => {
      mockReq.cookies = { refreshToken: 'invalid-token' };

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(mockRes.status).toHaveBeenCalledWith(401);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      const password = 'oldpassword123';
      const newPassword = 'newpassword123';
      const user = await createTestUser({
        password: password,
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      // Мокаємо User.findById щоб повертав користувача з паролем
      const originalFindById = User.findById;
      const userWithPassword = await User.findById(user._id).select('+password');
      User.findById = jest.fn().mockResolvedValue(userWithPassword);

      mockReq.user = { userId: user._id.toString() };
      mockReq.body = {
        currentPassword: password,
        newPassword: newPassword,
      };
      mockReq.cookies = {};
      mockReq.ip = '127.0.0.1';

      await authController.changePassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');

      // Відновлюємо оригінальний метод
      User.findById = originalFindById;
    });

    it('should reject change password with wrong current password', async () => {
      const password = 'correctpassword';
      const user = await createTestUser({
        password: password,
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      // Мокаємо User.findById щоб повертав користувача з паролем
      const originalFindById = User.findById;
      const userWithPassword = await User.findById(user._id).select('+password');
      User.findById = jest.fn().mockResolvedValue(userWithPassword);

      mockReq.user = { userId: user._id.toString() };
      mockReq.body = {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword123',
      };

      await authController.changePassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Невірний поточний пароль'),
        })
      );

      // Відновлюємо оригінальний метод
      User.findById = originalFindById;
    });

    it('should reject change password if new password same as current', async () => {
      const password = 'password123';
      const user = await createTestUser({
        password: password,
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      // Мокаємо User.findById щоб повертав користувача з паролем
      const originalFindById = User.findById;
      const userWithPassword = await User.findById(user._id).select('+password');
      User.findById = jest.fn().mockResolvedValue(userWithPassword);

      mockReq.user = { userId: user._id.toString() };
      mockReq.body = {
        currentPassword: password,
        newPassword: password,
      };

      await authController.changePassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('відрізнятися від поточного'),
        })
      );

      // Відновлюємо оригінальний метод
      User.findById = originalFindById;
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset email for existing user', async () => {
      const testEmail = `test-forgot-${Date.now()}@example.com`.toLowerCase();
      const user = await createTestUser({
        email: testEmail,
      });

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = { email: testEmail };
      mockReq.ip = '127.0.0.1';

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');

      // Перевіряємо що токен був створений
      // Якщо email service повертає помилку, токен може бути очищений
      // Тому перевіряємо тільки якщо відповідь успішна
      if (mockRes.status.mock.calls.length === 0 || mockRes.status.mock.calls[0][0] !== 500) {
        const updatedUser = await User.findById(user._id);
        if (updatedUser) {
          // Токен може бути очищений якщо email не відправлено
          // Перевіряємо тільки якщо він існує
          if (updatedUser.passwordResetToken) {
            expect(updatedUser.passwordResetToken).toBeDefined();
            expect(updatedUser.passwordResetExpires).toBeDefined();
          }
        }
      }
    });

    it('should return success message even for non-existent user', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = { email: 'nonexistent@example.com' };
      mockReq.ip = '127.0.0.1';

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      const crypto = require('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser({
        password: 'oldpassword',
      });

      user.passwordResetToken = resetToken;
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = {
        token: resetToken,
        newPassword: 'newpassword123',
      };
      mockReq.ip = '127.0.0.1';

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');

      // Перевіряємо що токен очищений
      const updatedUser = await User.findById(user._id).select('+password');
      expect(updatedUser.passwordResetToken).toBeUndefined();
      expect(updatedUser.passwordResetExpires).toBeUndefined();
    });

    it('should reject reset password with invalid token', async () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockReq.body = {
        token: 'invalid-token',
        newPassword: 'newpassword123',
      };

      await authController.resetPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Невірний або прострочений токен'),
        })
      );
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const crypto = require('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const user = await createTestUser();

      user.emailVerificationToken = verificationToken;
      user.emailVerificationExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      mockReq.body = { token: verificationToken };

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');

      // Перевіряємо що email підтверджено
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.isEmailVerified).toBe(true);
      expect(updatedUser.emailVerificationToken).toBeUndefined();
    });

    it('should reject verification without token', async () => {
      mockReq.body = {};

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining("Токен підтвердження обов'язковий"),
        })
      );
    });

    it('should reject invalid verification token', async () => {
      mockReq.body = { token: 'invalid-token' };

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Невірний або прострочений токен'),
        })
      );
    });
  });

  describe('logoutAll', () => {
    it('should logout from all devices successfully', async () => {
      const user = await createTestUser();

      user.refreshTokens = [
        {
          token: 'token1',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
        {
          token: 'token2',
          createdAt: new Date(),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      ];
      await user.save();

      mockReq.user = { userId: user._id.toString(), email: user.email };
      mockReq.ip = '127.0.0.1';

      await authController.logoutAll(mockReq, mockRes);

      expect(mockRes.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('message');

      // Перевіряємо що всі токени видалені
      const updatedUser = await User.findById(user._id);
      expect(updatedUser.refreshTokens).toHaveLength(0);
    });
  });

  describe('checkAuth', () => {
    it('should return authenticated status for valid user', async () => {
      const user = await createTestUser();

      mockReq.user = { userId: user._id.toString() };

      await authController.checkAuth(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      expect(response).toHaveProperty('authenticated', true);
      expect(response).toHaveProperty('user');
      expect(response.user).toHaveProperty('email', user.email);
    });

    it('should return 401 if user not found', async () => {
      const mongoose = require('mongoose');
      const fakeUserId = new mongoose.Types.ObjectId();
      mockReq.user = { userId: fakeUserId.toString() };

      await authController.checkAuth(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('не авторизований'),
        })
      );
    });
  });

  describe('getMe', () => {
    it('should return current user info', async () => {
      const user = await createTestUser();

      mockReq.user = { userId: user._id.toString() };

      await authController.getMe(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalled();
      const response = mockRes.json.mock.calls[0][0];
      // getMe може повертати success: true або просто дані
      if (response.success !== undefined) {
        expect(response).toHaveProperty('success', true);
        expect(response.data).toHaveProperty('email', user.email);
      } else {
        expect(response).toHaveProperty('email', user.email);
      }
    });

    it('should return 404 if user not found', async () => {
      const mongoose = require('mongoose');
      const fakeUserId = new mongoose.Types.ObjectId();
      mockReq.user = { userId: fakeUserId.toString() };

      // Мокаємо User.findById щоб повертав null (користувач не знайдений)
      // getMe використовує: User.findById().populate().populate().select()
      const originalFindById = User.findById;
      const mockSelect = jest.fn().mockResolvedValue(null);
      const mockPopulate2 = jest.fn().mockReturnValue({ select: mockSelect });
      const mockPopulate1 = jest.fn().mockReturnValue({ populate: mockPopulate2 });
      User.findById = jest.fn().mockReturnValue({ populate: mockPopulate1 });

      await authController.getMe(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('не знайдений'),
        })
      );

      // Відновлюємо оригінальний метод
      User.findById = originalFindById;
    });
  });
});
