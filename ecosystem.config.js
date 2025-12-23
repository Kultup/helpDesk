module.exports = {
  apps: [
    {
      name: 'helpdesk-backend',
      script: './backend/app.js',
      cwd: '/srv/helpDesk',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './backend/logs/pm2-error.log',
      out_file: './backend/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DDTHH:mm:ss',
      merge_logs: true,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G'
    },
    {
      name: 'helpdesk-frontend',
      script: 'npm',
      args: 'start',
      cwd: '/srv/helpDesk/frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '512M'
    }
  ]
};
