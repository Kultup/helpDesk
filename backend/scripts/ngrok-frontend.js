const ngrok = require('ngrok');
require('dotenv').config();

async function startFrontendNgrok() {
  try {
    const authtoken = process.env.NGROK_AUTHTOKEN;
    const region = process.env.NGROK_REGION || 'us';
    const port = 3000;

    if (!authtoken || authtoken === 'your_ngrok_authtoken_here') {
      throw new Error('NGROK_AUTHTOKEN не налаштовано в .env файлі');
    }

    console.log('🔑 Налаштовую ngrok authtoken...');
    await ngrok.authtoken(authtoken);

    console.log(`🚀 Запускаю ngrok тунель для фронтенду на порт ${port}...`);
    const url = await ngrok.connect({ addr: port, region, authtoken });
    const publicUrl = url.startsWith('http') ? url : `https://${url}`;

    console.log(`🌐 Ngrok FRONTEND tunnel запущено: ${publicUrl}`);
    console.log('🎯 Тунель активний. Натисніть Ctrl+C для зупинки.');

    const cleanup = async () => {
      console.log('\n🛑 Зупиняю ngrok (frontend)...');
      try {
        await ngrok.disconnect();
        await ngrok.kill();
        console.log('✅ Ngrok (frontend) зупинено');
      } catch (e) {
        console.error('⚠️ Помилка зупинки ngrok (frontend):', e.message);
      }
      process.exit(0);
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  } catch (error) {
    console.error('❌ Помилка запуску ngrok для фронтенду:', error.message);
    console.error('🔍 Повна помилка:', error);
    process.exit(1);
  }
}

startFrontendNgrok();