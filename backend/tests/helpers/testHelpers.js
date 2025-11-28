const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../../models/User');
const Ticket = require('../../models/Ticket');
const Category = require('../../models/Category');
const City = require('../../models/City');
const Position = require('../../models/Position');

// Додаємо bcrypt для використання в функціях
const bcryptHelper = bcrypt;

/**
 * Підключення до тестової бази даних
 */
const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/helpdesk_test';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
  } catch (error) {
    console.error('Помилка підключення до тестової БД:', error);
    throw error;
  }
};

/**
 * Відключення від бази даних
 */
const disconnectDB = async () => {
  try {
    await mongoose.connection.close();
  } catch (error) {
    console.error('Помилка відключення від БД:', error);
    throw error;
  }
};

/**
 * Очищення бази даних
 */
const clearDatabase = async () => {
  try {
    // Завантажуємо всі моделі щоб вони були зареєстровані
    require('../../models/User');
    require('../../models/Ticket');
    require('../../models/Category');
    require('../../models/City');
    require('../../models/Position');
    require('../../models/Comment');
    require('../../models/Notification');
    require('../../models/Tag'); // Додаємо Tag модель
    
    // Використовуємо mongoose models для видалення
    const User = require('../../models/User');
    const Ticket = require('../../models/Ticket');
    const Category = require('../../models/Category');
    const City = require('../../models/City');
    const Position = require('../../models/Position');
    const Comment = require('../../models/Comment');
    const Notification = require('../../models/Notification');
    const Tag = require('../../models/Tag');
    
    // Видаляємо документи з основних колекцій паралельно
    await Promise.all([
      User.deleteMany({}).catch(() => {}),
      Ticket.deleteMany({}).catch(() => {}),
      Category.deleteMany({}).catch(() => {}),
      City.deleteMany({}).catch(() => {}),
      Position.deleteMany({}).catch(() => {}),
      Comment.deleteMany({}).catch(() => {}),
      Notification.deleteMany({}).catch(() => {}),
      Tag.deleteMany({}).catch(() => {})
    ]);
  } catch (error) {
    // Не викидаємо помилку, щоб не зупиняти тести
    console.warn('Помилка очищення БД (ігнорується):', error.message);
  }
};

/**
 * Створення тестового користувача
 */
const createTestUser = async (overrides = {}) => {
  const uniqueEmail = overrides.email || `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@example.com`;
  const baseLogin = (overrides.login || uniqueEmail.split('@')[0]).toLowerCase();
  const sanitizedLogin = baseLogin.replace(/[^a-z0-9_]/gi, '');
  const uniqueLogin = (sanitizedLogin && sanitizedLogin.length >= 3) ? sanitizedLogin : `testuser_${Math.random().toString(36).substr(2,5)}`;
  
  // Якщо пароль передано, використовуємо його як є (модель сама захешує якщо потрібно)
  // Якщо пароль не передано, використовуємо дефолтний
  const password = overrides.password !== undefined ? overrides.password : 'password123';
  
  const defaultUser = {
    email: uniqueEmail,
    login: uniqueLogin,
    password: password,
    firstName: 'Test',
    lastName: 'User',
    role: 'user',
    department: 'IT Department',
    isActive: true,
    registrationStatus: 'approved',
    ...overrides
  };
  
  // Видаляємо password з overrides щоб не перезаписати
  delete defaultUser.password;
  defaultUser.password = password;

  // Перевірка чи існує position та city
  let city = await City.findOne({ name: 'Київ' });
  if (!city) {
    try {
      await City.updateOne(
        { name: 'Київ' },
        {
          $setOnInsert: {
            name: 'Київ',
            region: 'Київська область',
            coordinates: { lat: 50.4501, lng: 30.5234 }
          }
        },
        { upsert: true }
      );
      city = await City.findOne({ name: 'Київ' });
      if (!city) {
        city = await City.create({
          name: 'Київ',
          region: 'Київська область',
          coordinates: { lat: 50.4501, lng: 30.5234 }
        });
      }
    } catch (error) {
      city = await City.findOne({ name: 'Київ' });
      if (!city) throw error;
    }
  }

  let position = await Position.findOne({ title: 'Test Position' });
  if (!position) {
    try {
      position = await Position.create({
        title: 'Test Position',
        department: 'IT',
        isActive: true,
        isPublic: true,
        createdBy: new mongoose.Types.ObjectId()
      });
    } catch (error) {
      try {
        await mongoose.connection.collection('positions').updateOne(
          { title: 'Test Position' },
          {
            $setOnInsert: {
              title: 'Test Position',
              department: 'IT',
              isActive: true,
              isPublic: true,
              createdAt: new Date(),
              updatedAt: new Date(),
              createdBy: new mongoose.Types.ObjectId()
            }
          },
          { upsert: true }
        );
        position = await Position.findOne({ title: 'Test Position' });
      } catch (e) {
        if (error.code === 11000) {
          position = await Position.findOne({ title: 'Test Position' });
        } else {
          throw error;
        }
      }
    }
  }

  // Перевіряємо що position та city існують
  if (!position || !city) {
    throw new Error(`Position or city not found. Position: ${!!position}, City: ${!!city}`);
  }

  const user = await User.create({
    ...defaultUser,
    position: position._id,
    city: city._id,
    refreshTokens: [] // Ініціалізуємо одразу
  });
  
  // Перевіряємо що position та city правильно збережені
  if (!user.position || !user.city) {
    throw new Error('Position or city not saved correctly');
  }
  
  return user;
};

/**
 * Створення тестового адміністратора
 */
const createTestAdmin = async (overrides = {}) => {
  const adminEmail = overrides.email || `admin-${Date.now()}-${Math.random().toString(36).substr(2,5)}@example.com`;
  return await createTestUser({
    email: adminEmail,
    firstName: 'Admin',
    lastName: 'User',
    role: 'admin',
    ...overrides
  });
};

/**
 * Генерація JWT токена для тестування
 */
const generateAuthToken = (user) => {
  return jwt.sign(
    { userId: user._id.toString(), email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

/**
 * Створення тестової категорії
 */
const createTestCategory = async (user, overrides = {}) => {
  // Якщо user не передано, створюємо тестового користувача
  if (!user) {
    user = await createTestUser();
  }
  
  const uniqueName = overrides.name || `Test Category ${Date.now()}`;
  const defaultCategory = {
    name: uniqueName,
    description: 'Test category description',
    color: '#FF5733',
    isActive: true,
    createdBy: user._id,
    ...overrides
  };

  return await Category.create(defaultCategory);
};

/**
 * Створення тестового тикету
 */
const createTestTicket = async (user, overrides = {}) => {
  // Якщо user не передано, створюємо тестового користувача
  if (!user) {
    user = await createTestUser();
  }
  
  let category = await Category.findOne();
  if (!category) {
    category = await createTestCategory(user);
  }

  let city = await City.findOne();
  if (!city) {
    await City.updateOne(
      { name: 'Київ' },
      {
        $setOnInsert: {
          name: 'Київ',
          region: 'Київська область',
          coordinates: { lat: 50.4501, lng: 30.5234 }
        }
      },
      { upsert: true }
    );
    city = await City.findOne({ name: 'Київ' });
  }

  let ticketNumber = overrides.ticketNumber;
  if (!ticketNumber) {
    const year = new Date().getFullYear();
    for (let i = 0; i < 5; i++) {
      const candidate = `TK-${year}-${String(Math.floor(Math.random() * 999999)).padStart(6, '0')}`;
      const existing = await Ticket.findOne({ ticketNumber: candidate });
      if (!existing) { ticketNumber = candidate; break; }
    }
  }

  const defaultTicket = {
    title: 'Test Ticket',
    description: 'Test ticket description',
    status: 'open',
    priority: 'medium',
    category: category._id,
    city: city._id,
    createdBy: user._id,
    ticketNumber,
    ...overrides
  };

  return await Ticket.create(defaultTicket);
};

/**
 * Очікування асинхронної операції
 */
const waitFor = (ms) => new Promise(resolve => setTimeout(resolve, ms));

module.exports = {
  connectDB,
  disconnectDB,
  clearDatabase,
  createTestUser,
  createTestAdmin,
  generateAuthToken,
  createTestCategory,
  createTestTicket,
  waitFor
};

