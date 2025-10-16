const ngrok = require('ngrok');
const axios = require('axios');
require('dotenv').config();

async function startNgrok() {
  try {
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    const authtoken = process.env.NGROK_AUTHTOKEN;
    const region = process.env.NGROK_REGION || 'us';
    const port = process.env.PORT || 5000;

    if (!botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
    }

    if (!authtoken || authtoken === 'your_ngrok_authtoken_here') {
      throw new Error('NGROK_AUTHTOKEN не налаштовано в .env файлі. Отримайте токен на https://dashboard.ngrok.com/get-started/your-authtoken');
    }

    console.log('🔑 Налаштовую ngrok authtoken...');
    await ngrok.authtoken(authtoken);

    console.log(`🚀 Запускаю ngrok тунель на порт ${port}...`);
    
    // Для ngrok 5.x використовуємо новий API
    const url = await ngrok.connect({
      addr: port,
      region: region,
      authtoken: authtoken
    });
    
    const publicUrl = url.startsWith('http') ? url : `https://${url}`;
    const webhookUrl = `${publicUrl}/api/telegram/webhook`;

    console.log(`🌐 Ngrok tunnel запущено: ${publicUrl}`);
    console.log(`🔗 Налаштовую Telegram webhook: ${webhookUrl}`);

    try {
      const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
        url: webhookUrl,
        drop_pending_updates: true
      });

      if (response && response.data && response.data.ok) {
        console.log('✅ Webhook успішно налаштовано');
      } else {
        console.error('❌ Помилка налаштування webhook:', response?.data || 'Немає відповіді');
        throw new Error(`Webhook setup failed: ${JSON.stringify(response?.data || 'No response')}`);
      }
    } catch (webhookError) {
      console.error('❌ Помилка при налаштуванні webhook:', webhookError.message);
      if (webhookError.response) {
        console.error('📄 Відповідь від Telegram API:', JSON.stringify(webhookError.response.data, null, 2));
      }
      throw webhookError;
    }

    console.log('🎯 Ngrok тунель для бота активний. Натисніть Ctrl+C для зупинки.');

    const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    if (infoResponse && infoResponse.data && infoResponse.data.result) {
      console.log('📋 Інформація про webhook:', JSON.stringify(infoResponse.data.result, null, 2));
    } else {
      console.log('⚠️ Не вдалося отримати інформацію про webhook');
    }

    const cleanup = async () => {
      console.log('\n🛑 Зупиняю ngrok...');
      try {
        await axios.post(`https://api.telegram.org/bot${botToken}/deleteWebhook`);
        console.log('✅ Webhook видалено');
      } catch (e) {
        console.error('⚠️ Не вдалося видалити webhook:', e.message);
      }
      try {
        await ngrok.disconnect();
        await ngrok.kill();
        console.log('✅ Ngrok зупинено');
      } catch (e) {
        console.error('⚠️ Помилка зупинки ngrok:', e.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    console.error('❌ Помилка запуску ngrok або налаштування webhook:', error.message);
    console.error('🔍 Повна помилка:', error);
    
    if (error.response && error.response.data) {
      console.error('📄 Відповідь сервера:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code) {
      console.error('🔍 Код помилки:', error.code);
    }
    
    if (error.stack) {
      console.error('📍 Stack trace:', error.stack);
    }
    
    if (error.message.includes('authtoken')) {
      console.error('💡 Перевірте правильність NGROK_AUTHTOKEN в .env файлі');
    }
    
    if (error.message.includes('tunnel')) {
      console.error('💡 Можливо, інший процес вже використовує цей порт або ngrok');
    }
    
    process.exit(1);
  }
}

startNgrok();