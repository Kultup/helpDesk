const { spawn } = require('child_process');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.PORT || 5000;
const NGROK_PORT = 4040; // Порт для ngrok web interface

let ngrokProcess = null;
let ngrokUrl = null;

async function getNgrokUrl() {
  try {
    // Чекаємо трохи, щоб ngrok встиг запуститися
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const response = await axios.get(`http://localhost:${NGROK_PORT}/api/tunnels`);
    if (response.data && response.data.tunnels && response.data.tunnels.length > 0) {
      const httpsTunnel = response.data.tunnels.find(t => t.proto === 'https');
      if (httpsTunnel) {
        return httpsTunnel.public_url;
      }
      // Якщо немає HTTPS, беремо перший доступний
      return response.data.tunnels[0].public_url;
    }
    return null;
  } catch (error) {
    console.error('❌ Помилка отримання ngrok URL:', error.message);
    return null;
  }
}

async function setupWebhook(webhookUrl) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!botToken) {
    console.error('❌ TELEGRAM_BOT_TOKEN не знайдено в .env файлі');
    return false;
  }

  const fullWebhookUrl = `${webhookUrl}/api/telegram/webhook`;
  
  try {
    console.log(`🔧 Налаштовую webhook для бота...`);
    console.log(`📡 Webhook URL: ${fullWebhookUrl}`);
    
    // Перевіряємо поточний webhook
    const infoResponse = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
    if (infoResponse.data.ok && infoResponse.data.result.url) {
      console.log(`📋 Поточний webhook: ${infoResponse.data.result.url}`);
    }

    // Встановлюємо webhook
    const response = await axios.post(`https://api.telegram.org/bot${botToken}/setWebhook`, {
      url: fullWebhookUrl
    });

    if (response.data.ok) {
      console.log('✅ Webhook успішно налаштовано!');
      console.log(`📡 URL: ${fullWebhookUrl}`);
      
      // Перевіряємо інформацію про webhook
      const finalInfo = await axios.get(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      if (finalInfo.data.ok) {
        console.log('\n📋 Інформація про webhook:');
        console.log(JSON.stringify(finalInfo.data.result, null, 2));
        
        if (finalInfo.data.result.pending_update_count > 0) {
          console.log(`\n⚠️  Увага: є ${finalInfo.data.result.pending_update_count} необроблених оновлень`);
        }
      }
      return true;
    } else {
      console.error('❌ Помилка налаштування webhook:', response.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Помилка налаштування webhook:', error.message);
    if (error.response) {
      console.error('Відповідь сервера:', error.response.data);
    }
    return false;
  }
}

async function startNgrok() {
  console.log('🚀 Запускаю ngrok...');
  console.log(`📡 Проксіюю порт ${PORT} -> ngrok`);
  
  // Запускаємо ngrok
  ngrokProcess = spawn('ngrok', ['http', PORT.toString(), '--log=stdout'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true
  });

  ngrokProcess.stdout.on('data', (data) => {
    const output = data.toString();
    // Шукаємо URL в виводі ngrok (якщо він виводить в stdout)
    if (output.includes('https://') || output.includes('http://')) {
      const urlMatch = output.match(/https?:\/\/[a-zA-Z0-9-]+\.ngrok-free\.app/g);
      if (urlMatch && urlMatch.length > 0 && !ngrokUrl) {
        ngrokUrl = urlMatch[0];
      }
    }
  });

  ngrokProcess.stderr.on('data', (data) => {
    console.error(`ngrok stderr: ${data}`);
  });

  ngrokProcess.on('error', (error) => {
    console.error('❌ Помилка запуску ngrok:', error.message);
    console.error('\n💡 Переконайтеся, що ngrok встановлено:');
    console.error('   Windows: choco install ngrok');
    console.error('   macOS: brew install ngrok');
    console.error('   Або завантажте з: https://ngrok.com/download');
    process.exit(1);
  });

  ngrokProcess.on('exit', (code) => {
    console.log(`\n⚠️  ngrok завершив роботу з кодом ${code}`);
    process.exit(code);
  });

  // Отримуємо URL через API
  const url = await getNgrokUrl();
  
  if (url) {
    ngrokUrl = url;
    console.log(`\n✅ ngrok запущено успішно!`);
    console.log(`🌐 Публічний URL: ${ngrokUrl}`);
    console.log(`🔗 Webhook URL буде: ${ngrokUrl}/api/telegram/webhook`);
    console.log(`\n📊 Ngrok web interface: http://localhost:${NGROK_PORT}`);
    
    // Налаштовуємо webhook
    await setupWebhook(ngrokUrl);
    
    console.log('\n✨ Готово! Telegram бот тепер може отримувати повідомлення через ngrok.');
    console.log('\n💡 Натисніть Ctrl+C для зупинки ngrok');
  } else {
    console.error('❌ Не вдалося отримати ngrok URL');
    console.error('💡 Перевірте, що ngrok запущено правильно');
  }
}

// Обробка сигналів для коректного завершення
process.on('SIGINT', () => {
  console.log('\n\n🛑 Зупиняю ngrok...');
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Зупиняю ngrok...');
  if (ngrokProcess) {
    ngrokProcess.kill();
  }
  process.exit(0);
});

startNgrok();

