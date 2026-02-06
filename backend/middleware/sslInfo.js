const { exec } = require('child_process');
const util = require('util');
const fs = require('fs').promises;
const execPromise = util.promisify(exec);

let cachedSSLInfo = null;
let lastCheck = 0;
const CACHE_DURATION = 3600000; // 1 година

/**
 * Отримати інформацію про SSL сертифікат
 */
async function getSSLInfo() {
  const now = Date.now();
  
  // Використовуємо кеш якщо він свіжий
  if (cachedSSLInfo && (now - lastCheck) < CACHE_DURATION) {
    return cachedSSLInfo;
  }

  try {
    const certPaths = [
      '/etc/letsencrypt/live/helpdesk.krainamriy.fun/fullchain.pem',
      '/etc/nginx/ssl/fullchain.pem'
    ];

    let certPath = null;
    for (const path of certPaths) {
      try {
        await fs.access(path);
        certPath = path;
        break;
      } catch {
        continue;
      }
    }

    if (!certPath) {
      cachedSSLInfo = null;
      return null;
    }

    // Отримати дату закінчення сертифіката
    const { stdout } = await execPromise(`openssl x509 -in ${certPath} -noout -enddate`);
    const expiryMatch = stdout.match(/notAfter=(.+)/);
    
    if (!expiryMatch) {
      return null;
    }

    const expiryDate = new Date(expiryMatch[1]);
    const daysUntilExpiry = Math.floor((expiryDate - Date.now()) / (1000 * 60 * 60 * 24));

    cachedSSLInfo = {
      expiryDate: expiryDate.toISOString(),
      expiryTimestamp: expiryDate.getTime(),
      daysUntilExpiry,
      valid: daysUntilExpiry > 0
    };

    lastCheck = now;
    return cachedSSLInfo;
  } catch (error) {
    console.error('SSL Info Error:', error.message);
    return null;
  }
}

/**
 * Middleware для додавання SSL інформації в headers
 */
const sslHeaderMiddleware = async (req, res, next) => {
  try {
    const sslInfo = await getSSLInfo();
    
    if (sslInfo) {
      // Додаємо кастомні headers
      res.set('X-SSL-Expires', sslInfo.expiryDate);
      res.set('X-SSL-Days-Left', sslInfo.daysUntilExpiry.toString());
      res.set('X-SSL-Valid', sslInfo.valid ? 'true' : 'false');
    }
  } catch (error) {
    // Не блокуємо запит якщо не вдалося отримати SSL info
  }
  
  next();
};

module.exports = {
  sslHeaderMiddleware,
  getSSLInfo
};
