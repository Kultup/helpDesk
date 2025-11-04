const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

async function checkWebhook() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
    process.exit(1);
  }

  try {
    console.log('🔍 Перевіряю інформацію про webhook...\n');
    
    const response = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    
    if (response.data.ok) {
      const info = response.data.result;
      console.log('📋 Інформація про webhook:');
      console.log(JSON.stringify(info, null, 2));
      
      console.log('\n📊 Статус:');
      console.log(`  URL: ${info.url || 'не встановлено'}`);
      console.log(`  Необроблені оновлення: ${info.pending_update_count || 0}`);
      console.log(`  IP адреса: ${info.ip_address || 'не вказано'}`);
      console.log(`  Макс. з'єднань: ${info.max_connections || 'не вказано'}`);
      
      if (info.last_error_date) {
        console.log(`\n⚠️  Остання помилка:`);
        console.log(`  Дата: ${new Date(info.last_error_date * 1000).toLocaleString()}`);
        console.log(`  Повідомлення: ${info.last_error_message}`);
      }
      
      if (info.url) {
        console.log('\n🔗 Перевіряю доступність URL...');
        try {
          const urlResponse = await axios.get(info.url.replace('/api/telegram/webhook', '/api/health'), {
            timeout: 5000,
            validateStatus: () => true
          });
          console.log(`✅ URL доступний (статус: ${urlResponse.status})`);
        } catch (urlError) {
          console.log(`⚠️  URL може бути недоступний: ${urlError.message}`);
        }
      }
    } else {
      console.error('❌ Помилка отримання інформації про webhook:', response.data);
    }
  } catch (error) {
    console.error('❌ Помилка:', error.message);
    if (error.response) {
      console.error('Відповідь сервера:', error.response.data);
    }
  }
}

checkWebhook();

