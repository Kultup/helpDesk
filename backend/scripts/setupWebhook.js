const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function setupWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
    process.exit(1);
  }

  // Отримуємо URL з аргументу або з .env
  let baseUrl = process.argv[2];
  
  if (!baseUrl) {
    // Спробувати використати API_BASE_URL з .env
    baseUrl = process.env.API_BASE_URL || process.env.FRONTEND_URL;
    
    if (!baseUrl) {
      console.error('❌ Потрібно вказати URL як аргумент або налаштувати API_BASE_URL/FRONTEND_URL в .env');
      console.log('\nВикористання:');
      console.log('  node setupWebhook.js https://your-domain.com');
      console.log('  або налаштуйте API_BASE_URL в backend/.env');
      process.exit(1);
    }
  }

  // Переконатися, що URL має https://
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }

  // Видаляємо trailing slash
  baseUrl = baseUrl.replace(/\/$/, '');

  // Формуємо webhook URL
  // Якщо baseUrl вже містить /api, не додаємо ще раз
  let webhookUrl;
  if (baseUrl.endsWith('/api')) {
    webhookUrl = `${baseUrl}/telegram/webhook`;
  } else {
    webhookUrl = `${baseUrl}/api/telegram/webhook`;
  }
  
  try {
    console.log(`🔧 Налаштовую webhook для бота...`);
    console.log(`📡 Webhook URL: ${webhookUrl}`);
    
    // Перевіряємо поточний webhook
    const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    if (infoResponse.data.ok && infoResponse.data.result.url) {
      console.log(`📋 Поточний webhook: ${infoResponse.data.result.url}`);
    }

    // Встановлюємо webhook
    const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      url: webhookUrl
    });

    if (response.data.ok) {
      console.log('✅ Webhook успішно налаштовано!');
      console.log(`📡 URL: ${webhookUrl}`);
      
      // Перевіряємо інформацію про webhook
      const finalInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      if (finalInfo.data.ok) {
        console.log('\n📋 Інформація про webhook:');
        console.log(JSON.stringify(finalInfo.data.result, null, 2));
        
        if (finalInfo.data.result.pending_update_count > 0) {
          console.log(`\n⚠️  Увага: є ${finalInfo.data.result.pending_update_count} необроблених оновлень`);
        }
      }
    } else {
      console.error('❌ Помилка налаштування webhook:', response.data);
      if (response.data.description) {
        console.error(`Опис помилки: ${response.data.description}`);
      }
    }
  } catch (error) {
    console.error('❌ Помилка:', error.message);
    if (error.response) {
      console.error('Відповідь сервера:', error.response.data);
    }
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('\n⚠️  Перевірте, що:');
      console.error('  1. URL правильний і доступний з інтернету');
      console.error('  2. Сервер має HTTPS з валідним сертифікатом');
      console.error('  3. Роут /api/telegram/webhook доступний');
    }
    if (error.response && error.response.data && error.response.data.description) {
      const desc = error.response.data.description;
      if (desc.includes('IP address') && desc.includes('reserved')) {
        console.error('\n⚠️  Telegram не приймає приватні IP адреси (192.168.x.x, 10.x.x.x тощо)');
        console.error('   Використайте публічний домен, наприклад:');
        console.error('   node scripts/setupWebhook.js https://krainamriy.fun');
      }
    }
  }
}

setupWebhook();