const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { verifyTelegramAuth } = require('../services/telegramService');
const logger = require('../utils/logger');

class AuthController {
  // Примітка: Логіка реєстрації перенесена в routes/auth.js
  // Цей контролер зараз не використовується для реєстрації

  // Вхід користувача
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Помилка валідації',
          errors: errors.array()
        });
      }

      const { email, password, rememberMe = false } = req.body;

      logger.info('🔍 Login attempt:', { email, passwordLength: password?.length });

      // Пошук користувача
      const user = await User.findOne({ 
        email: email.toLowerCase() 
      }).select('+password').populate('position city');

      logger.info('👤 User found:', !!user);
      if (user) {
        logger.info('📧 User email:', user.email);
        logger.info('🔑 User role:', user.role);
        logger.info('✅ User active:', user.isActive);
        logger.info('🔐 Password present:', !!user.password);
        logger.info('🔒 Password length:', user.password?.length);
      }

      if (!user) {
        return res.status(401).json({
          message: 'Невірний email або пароль'
        });
      }

      // Перевірка чи акаунт заблокований
      if (user.isLocked) {
        const lockTimeRemaining = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
        return res.status(423).json({
          message: `Акаунт заблокований на ${lockTimeRemaining} хвилин через багато невдалих спроб входу`
        });
      }

      // Перевірка чи акаунт активний
      if (!user.isActive) {
        return res.status(403).json({
          message: 'Акаунт деактивований. Зверніться до адміністратора.'
        });
      }

      // Перевірка паролю
      logger.info('🔐 Comparing passwords...');
      logger.info('🔑 Input password:', password);
      logger.info('🔒 Stored hash:', user.password?.substring(0, 20) + '...');
      
      const isPasswordValid = await bcrypt.compare(password, user.password);
      logger.info('✅ Password valid:', isPasswordValid);
      
      if (!isPasswordValid) {
        // Збільшення лічильника невдалих спроб
        await user.incrementLoginAttempts();
        
        const attemptsLeft = 5 - user.loginAttempts;
        if (attemptsLeft > 0) {
          return res.status(401).json({
            message: `Невірний email або пароль. Залишилось спроб: ${attemptsLeft}`
          });
        } else {
          return res.status(423).json({
            message: 'Акаунт заблокований на 30 хвилин через багато невдалих спроб входу'
          });
        }
      }

      // Скидання лічильника спроб при успішному вході
      if (user.loginAttempts > 0) {
        user.loginAttempts = 0;
        user.lockUntil = undefined;
        await user.save();
      }

      // Генерація JWT токенів
      const tokenExpiry = rememberMe ? '30d' : '24h';
      const refreshTokenExpiry = rememberMe ? '60d' : '7d';

      const accessToken = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: tokenExpiry }
      );

      const refreshToken = jwt.sign(
        { 
          userId: user._id, 
          type: 'refresh' 
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: refreshTokenExpiry }
      );

      // Оновлення інформації про останній вхід
      user.lastLogin = new Date();
      
      // Ініціалізуємо refreshTokens якщо не існує
      if (!user.refreshTokens) {
        user.refreshTokens = [];
      }
      
      user.refreshTokens.push({
        token: refreshToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + (rememberMe ? 60 : 7) * 24 * 60 * 60 * 1000),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      // Обмеження кількості активних сесій (максимум 5)
      if (user.refreshTokens.length > 5) {
        user.refreshTokens = user.refreshTokens.slice(-5);
      }

      // Зберігаємо зміни через user.save(), щоб спрацювали mongoose hooks та валідація
      user.markModified('refreshTokens');
      await user.save({ validateModifiedOnly: true });

      // Логування успішного входу
      logger.info(`Користувач увійшов в систему: ${email}`, {
        userId: user._id,
        email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        rememberMe
      });

      // Підготовка відповіді користувача
      const userResponse = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        position: user.position,
        city: user.city,
        role: user.role,
        isEmailVerified: user.isEmailVerified || false,
        telegramId: user.telegramId,
        profile: user.profile || {},
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      };

      // Встановлення HTTP-only cookie для refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: (rememberMe ? 60 : 7) * 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Успішний вхід в систему',
        data: {
          user: userResponse,
          token: accessToken
        },
        expiresIn: tokenExpiry
      });

    } catch (error) {
      logger.error('Помилка входу:', error);
      res.status(500).json({
        success: false,
        message: 'Внутрішня помилка сервера',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Щось пішло не так'
      });
    }
  }

  // Вихід користувача
  async logout(req, res) {
    try {
      const { refreshToken } = req.cookies;
      const userId = req.user.userId;

      if (refreshToken) {
        // Видалення refresh token з бази даних
        await User.findByIdAndUpdate(userId, {
          $pull: { refreshTokens: { token: refreshToken } }
        });
      }

      // Очищення cookie
      res.clearCookie('refreshToken');

      logger.info(`Користувач вийшов з системи: ${req.user.email}`, {
        userId,
        ip: req.ip
      });

      res.json({
        message: 'Успішний вихід з системи'
      });

    } catch (error) {
      logger.error('Помилка виходу:', error);
      res.status(500).json({
        message: 'Помилка при виході з системи'
      });
    }
  }

  // Оновлення access token за допомогою refresh token
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.cookies;

      if (!refreshToken) {
        return res.status(401).json({
          message: 'Refresh token не знайдено'
        });
      }

      // Верифікація refresh token
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      // Пошук користувача та перевірка чи token існує в базі
      const user = await User.findOne({
        _id: decoded.userId,
        'refreshTokens.token': refreshToken
      });

      if (!user) {
        res.clearCookie('refreshToken');
        return res.status(401).json({
          message: 'Невірний refresh token'
        });
      }

      // Перевірка чи token не прострочений
      const tokenData = user.refreshTokens.find(t => t.token === refreshToken);
      if (tokenData && tokenData.expiresAt < new Date()) {
        // Видалення прострочених токенів
        await User.findByIdAndUpdate(user._id, {
          $pull: { refreshTokens: { expiresAt: { $lt: new Date() } } }
        });
        
        res.clearCookie('refreshToken');
        return res.status(401).json({
          message: 'Refresh token прострочений'
        });
      }

      // Генерація нового access token
      const newAccessToken = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        accessToken: newAccessToken,
        expiresIn: '24h'
      });

    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        res.clearCookie('refreshToken');
        return res.status(401).json({
          message: 'Невірний refresh token'
        });
      }

      logger.error('Помилка оновлення токену:', error);
      res.status(500).json({
        message: 'Помилка оновлення токену'
      });
    }
  }

  // Підтвердження email
  async verifyEmail(req, res) {
    try {
      const { token } = req.body;

      if (!token) {
        return res.status(400).json({
          message: 'Токен підтвердження обов\'язковий'
        });
      }

      // Пошук користувача з токеном
      const user = await User.findOne({
        emailVerificationToken: token,
        emailVerificationExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          message: 'Невірний або прострочений токен підтвердження'
        });
      }

      // Підтвердження email
      user.isEmailVerified = true;
      user.emailVerificationToken = undefined;
      user.emailVerificationExpires = undefined;
      await user.save();

      logger.info(`Email підтверджено для користувача: ${user.email}`, {
        userId: user._id
      });

      res.json({
        message: 'Email успішно підтверджено'
      });

    } catch (error) {
      logger.error('Помилка підтвердження email:', error);
      res.status(500).json({
        message: 'Помилка підтвердження email'
      });
    }
  }

  // Запит на відновлення паролю
  async forgotPassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Помилка валідації',
          errors: errors.array()
        });
      }

      const { email } = req.body;

      const user = await User.findOne({ email: email.toLowerCase() });

      // Завжди повертаємо успішну відповідь для безпеки
      const successMessage = 'Якщо акаунт з таким email існує, інструкції для відновлення паролю будуть відправлені на пошту';

      if (!user) {
        return res.json({ message: successMessage });
      }

      // Генерація токену для скидання паролю
      const resetToken = crypto.randomBytes(32).toString('hex');
      const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 година

      user.passwordResetToken = resetToken;
      user.passwordResetExpires = resetTokenExpires;
      await user.save();

      // Відправка email з інструкціями
      try {
        await sendEmail({
          to: email,
          subject: 'Відновлення паролю Help Desk системи',
          template: 'password-reset',
          data: {
            firstName: user.firstName,
            resetLink: `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`,
            expiresIn: '1 година'
          }
        });

        logger.info(`Запит на відновлення паролю: ${email}`, {
          userId: user._id,
          ip: req.ip
        });

      } catch (emailError) {
        logger.error('Помилка відправки email відновлення:', emailError);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        return res.status(500).json({
          message: 'Помилка відправки email. Спробуйте пізніше.'
        });
      }

      res.json({ message: successMessage });

    } catch (error) {
      logger.error('Помилка запиту відновлення паролю:', error);
      res.status(500).json({
        message: 'Внутрішня помилка сервера'
      });
    }
  }

  // Скидання паролю
  async resetPassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Помилка валідації',
          errors: errors.array()
        });
      }

      const { token, newPassword } = req.body;

      // Пошук користувача з токеном
      const user = await User.findOne({
        passwordResetToken: token,
        passwordResetExpires: { $gt: new Date() }
      });

      if (!user) {
        return res.status(400).json({
          message: 'Невірний або прострочений токен скидання паролю'
        });
      }

      // Оновлення паролю та очищення токенів
      user.password = newPassword; // Пароль буде захешований в middleware моделі
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      user.passwordChangedAt = new Date();
      user.security.lastPasswordChange = new Date();
      
      // Видалення всіх refresh токенів для безпеки
      user.refreshTokens = [];
      
      await user.save();

      logger.info(`Пароль скинуто для користувача: ${user.email}`, {
        userId: user._id,
        ip: req.ip
      });

      res.json({
        message: 'Пароль успішно змінено. Увійдіть з новим паролем.'
      });

    } catch (error) {
      logger.error('Помилка скидання паролю:', error);
      res.status(500).json({
        message: 'Помилка скидання паролю'
      });
    }
  }

  // Зміна паролю (для авторизованих користувачів)
  async changePassword(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          message: 'Помилка валідації',
          errors: errors.array()
        });
      }

      const { currentPassword, newPassword } = req.body;
      const userId = req.user.userId;

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Користувач не знайдений'
        });
      }

      // Перевірка поточного паролю
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        return res.status(400).json({
          message: 'Невірний поточний пароль'
        });
      }

      // Перевірка чи новий пароль відрізняється від поточного
      const isSamePassword = await bcrypt.compare(newPassword, user.password);
      if (isSamePassword) {
        return res.status(400).json({
          message: 'Новий пароль повинен відрізнятися від поточного'
        });
      }

      // Оновлення паролю
      user.password = newPassword; // Пароль буде захешований в middleware моделі
      user.passwordChangedAt = new Date();
      user.security.lastPasswordChange = new Date();
      
      // Видалення всіх refresh токенів крім поточного
      const currentRefreshToken = req.cookies.refreshToken;
      if (currentRefreshToken) {
        user.refreshTokens = user.refreshTokens.filter(
          tokenData => tokenData.token === currentRefreshToken
        );
      } else {
        user.refreshTokens = [];
      }
      
      await user.save();

      logger.info(`Пароль змінено користувачем: ${user.email}`, {
        userId: user._id,
        ip: req.ip
      });

      res.json({
        message: 'Пароль успішно змінено'
      });

    } catch (error) {
      logger.error('Помилка зміни паролю:', error);
      res.status(500).json({
        message: 'Помилка зміни паролю'
      });
    }
  }

  // Авторизація через Telegram
  async telegramAuth(req, res) {
    try {
      const { telegramData } = req.body;

      // Верифікація даних від Telegram
      const isValid = verifyTelegramAuth(telegramData, process.env.TELEGRAM_BOT_TOKEN);
      
      if (!isValid) {
        return res.status(400).json({
          message: 'Невірні дані авторизації Telegram'
        });
      }

      const { id: telegramId, username, first_name, last_name, photo_url } = telegramData;

      // Пошук користувача за Telegram ID
      let user = await User.findOne({ telegramId }).populate('position city');

      if (!user) {
        // Пошук за username якщо ID не знайдено
        user = await User.findOne({ 
          telegramUsername: username 
        }).populate('position city');

        if (user) {
          // Прив'язка Telegram ID до існуючого акаунту
          user.telegramId = telegramId;
          user.telegramUsername = username;
          if (photo_url && !user.profile.avatar) {
            user.profile.avatar = photo_url;
          }
          await user.save();
        } else {
          // Створення нового користувача через Telegram
          const newUser = new User({
            email: `telegram_${telegramId}@temp.com`, // Тимчасовий email
            firstName: first_name || 'Telegram',
            lastName: last_name || 'User',
            telegramId,
            telegramUsername: username,
            role: 'user',
            isActive: true,
            isEmailVerified: false,
            profile: {
              avatar: photo_url || null,
              bio: '',
              timezone: 'Europe/Kiev',
              language: 'uk',
              notifications: {
                email: false,
                telegram: true,
                web: true
              }
            },
            security: {
              twoFactorEnabled: false,
              lastPasswordChange: new Date()
            }
          });

          user = await newUser.save();
        }
      }

      // Перевірка чи акаунт активний
      if (!user.isActive) {
        return res.status(403).json({
          message: 'Акаунт деактивований. Зверніться до адміністратора.'
        });
      }

      // Генерація JWT токенів
      const accessToken = jwt.sign(
        { 
          userId: user._id, 
          email: user.email, 
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
      );

      const refreshToken = jwt.sign(
        { 
          userId: user._id, 
          type: 'refresh' 
        },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '7d' }
      );

      // Оновлення інформації про останній вхід
      user.lastLogin = new Date();
      user.refreshTokens.push({
        token: refreshToken,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });

      await user.save();

      logger.info(`Telegram авторизація: ${user.email}`, {
        userId: user._id,
        telegramId,
        username,
        ip: req.ip
      });

      // Підготовка відповіді
      const userResponse = {
        _id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        position: user.position,
        city: user.city,
        role: user.role,
        telegramId: user.telegramId,
        telegramUsername: user.telegramUsername,
        profile: user.profile,
        lastLogin: user.lastLogin,
        createdAt: user.createdAt
      };

      // Встановлення cookie
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      res.json({
        message: 'Успішна авторизація через Telegram',
        accessToken,
        user: userResponse,
        expiresIn: '24h'
      });

    } catch (error) {
      logger.error('Помилка Telegram авторизації:', error);
      res.status(500).json({
        message: 'Помилка авторизації через Telegram'
      });
    }
  }

  // Отримання інформації про поточного користувача
  async getMe(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId)
        .populate('position', 'name department')
        .populate('city', 'name region')
        .select('-password -refreshTokens -emailVerificationToken -passwordResetToken');

      if (!user) {
        return res.status(404).json({
          message: 'Користувач не знайдений'
        });
      }

      res.json({
        success: true,
        data: user,
        message: 'Профіль користувача отримано успішно'
      });

    } catch (error) {
      logger.error('Помилка отримання профілю:', error);
      res.status(500).json({
        success: false,
        message: 'Помилка отримання профілю користувача'
      });
    }
  }

  // Вихід з усіх пристроїв
  async logoutAll(req, res) {
    try {
      const userId = req.user.userId;

      // Видалення всіх refresh токенів
      await User.findByIdAndUpdate(userId, {
        $set: { refreshTokens: [] }
      });

      // Очищення cookie
      res.clearCookie('refreshToken');

      logger.info(`Користувач вийшов з усіх пристроїв: ${req.user.email}`, {
        userId,
        ip: req.ip
      });

      res.json({
        message: 'Успішний вихід з усіх пристроїв'
      });

    } catch (error) {
      logger.error('Помилка виходу з усіх пристроїв:', error);
      res.status(500).json({
        message: 'Помилка при виході з усіх пристроїв'
      });
    }
  }

  // Перевірка статусу аутентифікації
  async checkAuth(req, res) {
    try {
      const userId = req.user.userId;

      const user = await User.findById(userId)
        .populate('position', 'name')
        .populate('city', 'name')
        .select('email firstName lastName role isEmailVerified telegramId profile lastLogin');

      if (!user) {
        return res.status(401).json({
          message: 'Користувач не авторизований'
        });
      }

      res.json({
        authenticated: true,
        user
      });

    } catch (error) {
      res.status(401).json({
        authenticated: false,
        message: 'Помилка перевірки авторизації'
      });
    }
  }
}

module.exports = new AuthController();
