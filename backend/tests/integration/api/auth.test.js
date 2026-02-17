const request = require('supertest');

const express = require('express');
const {
  connectDB,
  disconnectDB,
  clearDatabase,
  createTestUser,
  generateAuthToken,
} = require('../../helpers/testHelpers');

// Створюємо тестовий app без ініціалізації всіх сервісів
let app;

beforeAll(async () => {
  await connectDB();

  // Створюємо спрощений app для тестів
  app = express();
  app.use(express.json());

  // Моки для logger та WebSocket сервісів тепер глобальні в setup.js

  // Імпортуємо тільки auth routes
  const authRoutes = require('../../../routes/auth');
  app.use('/api/auth', authRoutes);
});

afterAll(async () => {
  await clearDatabase();
  await disconnectDB();
});

beforeEach(async () => {
  await clearDatabase();
});

describe('POST /api/auth/login', () => {
  it('should login user with valid credentials', async () => {
    const password = 'password123';
    const testEmail = `test-${Date.now()}@example.com`.toLowerCase();

    // Створюємо користувача з незахешованим паролем (модель сама захешує)
    const user = await createTestUser({
      email: testEmail,
      password: password,
      isActive: true,
      registrationStatus: 'approved',
    });

    // Перевіряємо що користувач збережений
    expect(user).toBeDefined();
    expect(user.isActive).toBe(true);
    expect(user.registrationStatus).toBe('approved');

    // Перевіряємо що пароль правильно захешований
    const savedUser = await require('../../../models/User')
      .findOne({ email: testEmail })
      .select('+password');
    expect(savedUser).toBeDefined();
    expect(savedUser.password).toBeDefined();
    expect(savedUser.password).not.toBe(password);

    // Перевіряємо що користувач активний та має правильний статус
    expect(savedUser.isActive).toBe(true);
    expect(savedUser.registrationStatus).toBe('approved');

    // Чекаємо трохи щоб переконатися що всі операції завершилися
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await request(app).post('/api/auth/login').send({
      email: testEmail,
      password: password,
    });

    // Додаємо діагностику якщо тест не проходить
    if (response.status !== 200) {
      console.error('Login failed:', {
        status: response.status,
        body: response.body,
        testEmail,
        savedUserEmail: savedUser?.email,
        savedUserActive: savedUser?.isActive,
        savedUserStatus: savedUser?.registrationStatus,
        error: response.body?.error || response.body?.message,
        stack: response.body?.stack,
      });

      // Перевіряємо пароль вручну
      const bcrypt = require('bcryptjs');
      const passwordMatch = await bcrypt.compare(password, savedUser.password);
      console.error('Password match:', passwordMatch);
    }

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('token');
    expect(response.body.data).toHaveProperty('user');
  });

  it('should return 401 with invalid credentials', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@example.com',
      password: 'wrongpassword',
    });

    expect(response.status).toBe(401);
  });

  it('should return 400 with missing fields', async () => {
    const response = await request(app).post('/api/auth/login').send({
      email: 'test@example.com',
      // password missing
    });

    expect(response.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('should return user info with valid token', async () => {
    const password = 'password123';
    const testEmail = `test-me-${Date.now()}@example.com`.toLowerCase();

    // Створюємо користувача з незахешованим паролем (модель сама захешує)
    const user = await createTestUser({
      email: testEmail,
      password: password,
      isActive: true,
      registrationStatus: 'approved',
    });

    const token = generateAuthToken(user);

    const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body.data).toHaveProperty('email', user.email);
  });

  it('should return 401 without token', async () => {
    const response = await request(app).get('/api/auth/me');

    expect(response.status).toBe(401);
  });
});
