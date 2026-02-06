module.exports = {
  apps: [
    {
      name: 'helpdesk-backend',
      script: 'app.js',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 5000
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 4000,
      // Виконується перед кожним запуском/перезапуском
      pre_start: './scripts/pre-start.sh',
      kill_timeout: 5000,
      listen_timeout: 10000
    },
    {
      name: 'helpdesk-frontend',
      script: 'npm',
      args: 'start',
      cwd: '../frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development'
      },
      env_production: {
        NODE_ENV: 'production'
      }
    }
  ]
};
