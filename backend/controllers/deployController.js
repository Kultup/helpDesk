const { exec } = require('child_process');
const crypto = require('crypto');
const logger = require('../utils/logger');

/**
 * GitHub Webhook для автоматичного деплою
 */
exports.githubWebhook = async (req, res) => {
  try {
    const signature = req.headers['x-hub-signature-256'];
    const event = req.headers['x-github-event'];

    // Перевірка секрету (якщо налаштовано)
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret) {
      const hmac = crypto.createHmac('sha256', secret);
      const digest = 'sha256=' + hmac.update(JSON.stringify(req.body)).digest('hex');

      if (signature !== digest) {
        logger.warn('❌ Webhook: невірна підпис');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Реагуємо тільки на push в master/main
    if (event === 'push') {
      const branch = req.body.ref;
      const repo = req.body.repository?.full_name;

      logger.info(`📥 Webhook отримано: ${repo} → ${branch}`);

      if (branch === 'refs/heads/master' || branch === 'refs/heads/main') {
        logger.info('🚀 Запускаю автоматичний деплой...');

        // Виконуємо деплой скрипт
        exec(
          'cd /srv/helpDesk && git pull && pm2 restart all',
          { timeout: 60000 },
          (error, stdout, stderr) => {
            if (error) {
              logger.error('❌ Помилка деплою:', error);
              logger.error('stderr:', stderr);
              return;
            }

            logger.info('✅ Деплой успішний!');
            logger.info('stdout:', stdout);

            // Логування в окремий файл
            const fs = require('fs');
            const deployLog = `/srv/helpDesk/backend/logs/deploy.log`;
            const timestamp = new Date().toISOString();
            fs.appendFileSync(
              deployLog,
              `\n\n=== ${timestamp} ===\n${stdout}\n${stderr}\n`
            );
          }
        );

        return res.status(200).json({
          status: 'success',
          message: 'Deployment started',
          branch,
          repo
        });
      } else {
        logger.info(`ℹ️ Ігнорую push в гілку ${branch}`);
        return res.status(200).json({
          status: 'ignored',
          message: 'Not master/main branch'
        });
      }
    }

    // Інші події ігноруємо
    return res.status(200).json({
      status: 'ignored',
      event
    });
  } catch (error) {
    logger.error('💥 Помилка webhook:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * Ручний деплой (для адмінів)
 */
exports.manualDeploy = async (req, res) => {
  try {
    logger.info('🔧 Ручний деплой запущено адміністратором');

    exec(
      'cd /srv/helpDesk && git pull && pm2 restart all',
      { timeout: 60000 },
      (error, stdout, stderr) => {
        if (error) {
          logger.error('❌ Помилка деплою:', error);
          return res.status(500).json({
            success: false,
            error: error.message,
            stderr
          });
        }

        logger.info('✅ Ручний деплой успішний');

        return res.json({
          success: true,
          message: 'Deployment completed',
          output: stdout
        });
      }
    );

    // Відповідаємо одразу (деплой йде в фоні)
    res.json({
      success: true,
      message: 'Deployment started in background'
    });
  } catch (error) {
    logger.error('💥 Помилка ручного деплою:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * Статус останнього деплою
 */
exports.getDeployStatus = async (req, res) => {
  try {
    const fs = require('fs');
    const deployLog = '/srv/helpDesk/backend/logs/deploy.log';

    if (!fs.existsSync(deployLog)) {
      return res.json({
        success: true,
        lastDeploy: null,
        message: 'No deployments yet'
      });
    }

    // Читаємо останні 50 рядків
    const content = fs.readFileSync(deployLog, 'utf8');
    const lines = content.split('\n').slice(-50).join('\n');

    return res.json({
      success: true,
      lastDeploy: lines
    });
  } catch (error) {
    logger.error('💥 Помилка читання логів деплою:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
