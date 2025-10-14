const axios = require('axios');
require('dotenv').config();

async function setupWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
    process.exit(1);
  }

  // Отримуємо ngrok URL (потрібно вручну вказати)
  const ngrokUrl = process.argv[2];
  
  if (!ngrokUrl) {
    console.error('❌ Потрібно вказати ngrok URL як аргумент');
    console.log('Використання: node setupWebhook.js https://your-ngrok-url.ngrok.io');
    process.exit(1);
  }

  const webhookUrl = `${ngrokUrl}/api/telegram/webhook`;
  
  try {
    // Встановлюємо webhook
    const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      url: webhookUrl
    });

    if (response.data.ok) {
      console.log('✅ Webhook успішно налаштовано!');
      console.log(`📡 URL: ${webhookUrl}`);
      
      // Перевіряємо інформацію про webhook
      const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      console.log('📋 Інформація про webhook:', JSON.stringify(infoResponse.data.result, null, 2));
    } else {
      console.error('❌ Помилка налаштування webhook:', response.data);
    }
  } catch (error) {
    console.error('❌ Помилка:', error.message);
    if (error.response) {
      console.error('Відповідь сервера:', error.response.data);
    }
  }
}

setupWebhook();