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
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_file: './logs/pm2-combined.log',
      time: true,
      merge_logs: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '30s', // Збільшено з 10s до 30s
      restart_delay: 8000, // Збільшено з 4s до 8s
      // Виконується перед кожним запуском/перезапуском
      pre_start: './scripts/pre-start.sh',
      kill_timeout: 10000, // Збільшено з 5s до 10s
      listen_timeout: 15000, // Збільшено з 10s до 15s
      // Захист від crash loop
      stop_on_fail: false,
      wait_ready: true,
      ready_timeout: 10000,
    },
    {
      name: 'helpdesk-frontend',
      script: 'npm',
      args: 'start',
      cwd: '../frontend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
