/* eslint-disable no-console */
/**
 * Скрипт для видалення користувача з бази даних
 *
 * Використання:
 *   node backend/scripts/deleteUser.js --id <userId>                    - видалити за ID
 *   node backend/scripts/deleteUser.js --telegramId <telegramId>       - видалити за telegramId
 *   node backend/scripts/deleteUser.js --email <email>                 - видалити за email
 *   node backend/scripts/deleteUser.js --login <login>                 - видалити за login
 *
 * Опції:
 *   --force          - примусове видалення (навіть якщо є активні тікети)
 *   --soft           - м'яке видалення (тільки деактивація)
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const User = require('../models/User');
const PendingRegistration = require('../models/PendingRegistration');
const PositionRequest = require('../models/PositionRequest');
const Ticket = require('../models/Ticket');

async function deleteUser(options) {
  try {
    // Підключення до MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/helpdesk', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log('✅ Підключено до бази даних');

    let user = null;

    // Знаходимо користувача за різними параметрами
    if (options.id) {
      if (!mongoose.Types.ObjectId.isValid(options.id)) {
        console.error('❌ Невірний формат ID');
        process.exit(1);
      }
      user = await User.findById(options.id);
    } else if (options.telegramId) {
      user = await User.findOne({
        $or: [
          { telegramId: String(options.telegramId) },
          { telegramId: options.telegramId },
          { telegramChatId: String(options.telegramId) },
          { telegramChatId: String(options.telegramId) },
        ],
      });
    } else if (options.email) {
      user = await User.findOne({ email: options.email.toLowerCase() });
    } else if (options.login) {
      user = await User.findOne({ login: options.login.toLowerCase() });
    } else {
      console.error('❌ Помилка: Не вказано параметр для пошуку користувача');
      console.log(
        'Використання: node backend/scripts/deleteUser.js --id <userId> | --telegramId <telegramId> | --email <email> | --login <login>'
      );
      process.exit(1);
    }

    if (!user) {
      console.error('❌ Користувача не знайдено');
      process.exit(1);
    }

    console.log('📋 Знайдено користувача:');
    console.log('   ID:', user._id);
    console.log("   Ім'я:", user.firstName, user.lastName);
    console.log('   Email:', user.email);
    console.log('   Login:', user.login);
    console.log('   Telegram ID:', user.telegramId);
    console.log('   Telegram Chat ID:', user.telegramChatId);
    console.log('   Статус реєстрації:', user.registrationStatus);
    console.log('   Активний:', user.isActive);
    console.log('   Роль:', user.role);

    // Перевіряємо активні тікети
    const activeTicketsCount = await Ticket.countDocuments({
      $or: [{ createdBy: user._id }, { assignedTo: user._id }],
      status: { $in: ['open', 'in_progress'] },
    });

    const allTicketsCount = await Ticket.countDocuments({
      $or: [{ createdBy: user._id }, { assignedTo: user._id }],
    });

    console.log('\n📊 Статистика тікетів:');
    console.log('   Активні тікети:', activeTicketsCount);
    console.log('   Всього тікетів:', allTicketsCount);

    // М'яке видалення
    if (options.soft) {
      console.log("\n🔄 Виконується м'яке видалення (деактивація)...");
      user.isActive = false;
      user.deletedAt = new Date();
      await user.save();
      console.log('✅ Користувача деактивовано');
    }
    // Повне видалення
    else if (options.force || activeTicketsCount === 0) {
      if (activeTicketsCount > 0 && !options.force) {
        console.log(
          '\n⚠️  У користувача є активні тікети. Використайте --force для примусового видалення.'
        );
        process.exit(1);
      }

      console.log('\n🗑️  Виконується повне видалення...');

      // Видаляємо PendingRegistration
      const pendingReg = await PendingRegistration.findOne({
        $or: [{ telegramId: user.telegramId }, { telegramChatId: user.telegramChatId }],
      });
      if (pendingReg) {
        await PendingRegistration.deleteOne({ _id: pendingReg._id });
        console.log('   ✅ Видалено PendingRegistration');
      }

      // Видаляємо PositionRequest
      if (user.telegramId) {
        const positionRequests = await PositionRequest.find({
          telegramId: user.telegramId,
        });
        if (positionRequests.length > 0) {
          await PositionRequest.deleteMany({ telegramId: user.telegramId });
          console.log(`   ✅ Видалено ${positionRequests.length} PositionRequest(ів)`);
        }
      }

      // Видаляємо користувача
      await User.findByIdAndDelete(user._id);
      console.log('   ✅ Користувача видалено з бази даних');
      console.log('\n✅ Повне видалення завершено!');
    } else {
      console.log(
        '\n⚠️  У користувача є активні тікети. Використайте --force для примусового видалення або --soft для деактивації.'
      );
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Помилка:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Відключено від бази даних');
  }
}

// Парсинг аргументів командного рядка
const args = process.argv.slice(2);
const options = {
  force: args.includes('--force'),
  soft: args.includes('--soft'),
};

// Знаходимо параметри
const idIndex = args.indexOf('--id');
const telegramIdIndex = args.indexOf('--telegramId');
const emailIndex = args.indexOf('--email');
const loginIndex = args.indexOf('--login');

if (idIndex !== -1 && args[idIndex + 1]) {
  options.id = args[idIndex + 1];
} else if (telegramIdIndex !== -1 && args[telegramIdIndex + 1]) {
  options.telegramId = args[telegramIdIndex + 1];
} else if (emailIndex !== -1 && args[emailIndex + 1]) {
  options.email = args[emailIndex + 1];
} else if (loginIndex !== -1 && args[loginIndex + 1]) {
  options.login = args[loginIndex + 1];
}

deleteUser(options);
