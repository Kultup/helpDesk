const mongoose = require('mongoose');
const os = require('os');
const fs = require('fs').promises;
const { exec } = require('child_process');
const { uploadsPath } = require('../config/paths');
const util = require('util');
const execPromise = util.promisify(exec);

class HealthCheckService {
  constructor() {
    this.startTime = Date.now();
    this.checks = new Map();
    this.registerDefaultChecks();
  }

  registerDefaultChecks() {
    // Database health check
    this.checks.set('database', async () => {
      try {
        const state = mongoose.connection.readyState;
        if (state !== 1) {
          throw new Error(`Database not connected. State: ${state}`);
        }

        // Test database operation
        await mongoose.connection.db.admin().ping();

        return {
          status: 'healthy',
          details: {
            state: state,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
          },
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
        };
      }
    });

    // Memory health check
    this.checks.set('memory', () => {
      const usage = process.memoryUsage();
      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const usedMem = totalMem - freeMem;
      const memoryUsagePercent = (usedMem / totalMem) * 100;

      const status =
        memoryUsagePercent > 90 ? 'unhealthy' : memoryUsagePercent > 80 ? 'warning' : 'healthy';

      return {
        status,
        details: {
          rss: Math.round(usage.rss / 1024 / 1024),
          heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
          heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
          external: Math.round(usage.external / 1024 / 1024),
          systemMemoryUsage: Math.round(memoryUsagePercent),
          unit: 'MB',
        },
      };
    });

    // Disk space health check
    this.checks.set('disk', async () => {
      try {
        let uploadsSize = 0;
        try {
          const uploadStats = await fs.stat(uploadsPath);
          uploadsSize = uploadStats.size;
        } catch (error) {
          // Uploads directory might not exist
        }

        return {
          status: 'healthy',
          details: {
            uploadsSize: Math.round(uploadsSize / 1024 / 1024),
            unit: 'MB',
          },
        };
      } catch (error) {
        return {
          status: 'unhealthy',
          error: error.message,
        };
      }
    });

    // CPU health check
    this.checks.set('cpu', () => {
      const cpus = os.cpus();
      const loadAvg = os.loadavg();
      const cpuCount = cpus.length;

      // Calculate CPU usage percentage (simplified)
      const load1min = loadAvg[0];
      const cpuUsagePercent = (load1min / cpuCount) * 100;

      const status =
        cpuUsagePercent > 90 ? 'unhealthy' : cpuUsagePercent > 80 ? 'warning' : 'healthy';

      return {
        status,
        details: {
          cores: cpuCount,
          loadAverage: {
            '1min': Math.round(loadAvg[0] * 100) / 100,
            '5min': Math.round(loadAvg[1] * 100) / 100,
            '15min': Math.round(loadAvg[2] * 100) / 100,
          },
          usage: Math.round(cpuUsagePercent),
        },
      };
    });

    // Uptime check
    this.checks.set('uptime', () => {
      const uptime = Date.now() - this.startTime;
      const uptimeSeconds = Math.floor(uptime / 1000);

      return {
        status: 'healthy',
        details: {
          uptime: uptimeSeconds,
          formatted: this.formatUptime(uptimeSeconds),
        },
      };
    });

    // SSL Certificate check
    this.checks.set('ssl', async () => {
      try {
        const certPaths = [
          '/etc/letsencrypt/live/helpdesk.krainamriy.fun/fullchain.pem',
          '/etc/nginx/ssl/fullchain.pem',
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
          return {
            status: 'warning',
            details: {
              message: 'SSL certificate not found',
            },
          };
        }

        // Get certificate expiry date
        const { stdout } = await execPromise(`openssl x509 -in ${certPath} -noout -enddate`);
        const expiryMatch = stdout.match(/notAfter=(.+)/);

        if (!expiryMatch) {
          throw new Error('Could not parse certificate expiry date');
        }

        const expiryDate = new Date(expiryMatch[1]);
        const now = new Date();
        const daysUntilExpiry = Math.floor((expiryDate - now) / (1000 * 60 * 60 * 24));

        let status = 'healthy';
        if (daysUntilExpiry < 0) {
          status = 'unhealthy';
        } else if (daysUntilExpiry < 7) {
          status = 'unhealthy';
        } else if (daysUntilExpiry < 30) {
          status = 'warning';
        }

        return {
          status,
          details: {
            expiryDate: expiryDate.toISOString(),
            daysUntilExpiry,
            validFrom: now.toISOString(),
            certPath,
          },
        };
      } catch (error) {
        return {
          status: 'warning',
          details: {
            message: 'Could not check SSL certificate',
            error: error.message,
          },
        };
      }
    });
  }

  formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
  }

  async runCheck(checkName) {
    const check = this.checks.get(checkName);
    if (!check) {
      throw new Error(`Health check '${checkName}' not found`);
    }

    try {
      return await check();
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
      };
    }
  }

  async runAllChecks() {
    const results = {};
    let overallStatus = 'healthy';

    for (const [name] of this.checks) {
      try {
        const result = await this.runCheck(name);
        results[name] = result;

        if (result.status === 'unhealthy') {
          overallStatus = 'unhealthy';
        } else if (result.status === 'warning' && overallStatus === 'healthy') {
          overallStatus = 'warning';
        }
      } catch (error) {
        results[name] = {
          status: 'unhealthy',
          error: error.message,
        };
        overallStatus = 'unhealthy';
      }
    }

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      checks: results,
    };
  }

  // Express middleware
  middleware() {
    return async (req, res) => {
      try {
        const healthStatus = await this.runAllChecks();

        const statusCode =
          healthStatus.status === 'healthy' ? 200 : healthStatus.status === 'warning' ? 200 : 503;

        res.status(statusCode).json(healthStatus);
      } catch (error) {
        res.status(503).json({
          status: 'unhealthy',
          timestamp: new Date().toISOString(),
          error: error.message,
        });
      }
    };
  }

  // Readiness probe (for Kubernetes)
  readinessProbe() {
    return async (req, res) => {
      try {
        const dbCheck = await this.runCheck('database');

        if (dbCheck.status === 'healthy') {
          res.status(200).json({ status: 'ready' });
        } else {
          res.status(503).json({ status: 'not ready', reason: dbCheck.error });
        }
      } catch (error) {
        res.status(503).json({ status: 'not ready', error: error.message });
      }
    };
  }

  // Liveness probe (for Kubernetes)
  livenessProbe() {
    return (req, res) => {
      res.status(200).json({ status: 'alive' });
    };
  }
}

const healthCheckService = new HealthCheckService();

module.exports = {
  healthCheckService,
  healthCheck: healthCheckService.middleware(),
  readinessProbe: healthCheckService.readinessProbe(),
  livenessProbe: healthCheckService.livenessProbe(),
};
