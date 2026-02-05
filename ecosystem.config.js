module.exports = {
  apps: [
    {
      name: 'helpdesk-backend',
      script: './backend/app.js',
      cwd: '/srv/helpDesk',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 5000,
      listen_timeout: 30000,
      env: {
        NODE_ENV: 'production'
      },
      error_file: './backend/logs/pm2-frontend-error.log',
      out_file: './backend/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DDTHH:mm:ss',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      exp_backoff_restart_delay: 100,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 5000,
      listen_timeout: 10000
    },
    {
      name: 'helpdesk-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/srv/helpDesk/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    }
  ]
};
