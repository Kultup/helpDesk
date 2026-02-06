#!/bin/bash

# Скрипт для налаштування автоматичного моніторингу
# Запускається один раз для налаштування cron та systemd

echo "🔧 Налаштування автоматичного моніторингу HelpDesk..."

# Перевіряємо чи ми root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Потрібні root права. Запустіть: sudo bash $0"
    exit 1
fi

SCRIPT_DIR="/srv/helpDesk/backend/scripts"

# 1. Створюємо cron job для моніторингу
echo "📅 Налаштовую cron job..."

# Видаляємо старі записи якщо є
crontab -l 2>/dev/null | grep -v "monitor-and-restart.sh" | crontab -

# Додаємо новий cron job (кожні 5 хвилин)
(crontab -l 2>/dev/null; echo "*/5 * * * * bash $SCRIPT_DIR/monitor-and-restart.sh >> /srv/helpDesk/backend/logs/cron.log 2>&1") | crontab -

echo "✅ Cron job налаштовано (перевірка кожні 5 хвилин)"

# 2. Створюємо systemd timer (альтернатива cron)
echo "⏰ Створюю systemd timer..."

cat > /etc/systemd/system/helpdesk-monitor.service << 'EOF'
[Unit]
Description=HelpDesk Monitor and Auto-Recovery
After=network.target

[Service]
Type=oneshot
ExecStart=/srv/helpDesk/backend/scripts/monitor-and-restart.sh
User=root
StandardOutput=append:/srv/helpDesk/backend/logs/monitor.log
StandardError=append:/srv/helpDesk/backend/logs/monitor.log

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/helpdesk-monitor.timer << 'EOF'
[Unit]
Description=HelpDesk Monitor Timer (runs every 5 minutes)
Requires=helpdesk-monitor.service

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=helpdesk-monitor.service

[Install]
WantedBy=timers.target
EOF

# Перезавантажуємо systemd
systemctl daemon-reload
systemctl enable helpdesk-monitor.timer
systemctl start helpdesk-monitor.timer

echo "✅ Systemd timer налаштовано та запущено"

# 3. Права на скрипти
echo "🔐 Встановлюю права на скрипти..."
chmod +x $SCRIPT_DIR/*.sh
echo "✅ Права встановлено"

# 4. Створюємо директорію для логів якщо немає
mkdir -p /srv/helpDesk/backend/logs
echo "✅ Директорія логів готова"

echo ""
echo "✅ Налаштування завершено!"
echo ""
echo "📊 Перевірити статус:"
echo "   systemctl status helpdesk-monitor.timer"
echo "   crontab -l"
echo ""
echo "📜 Переглянути логи моніторингу:"
echo "   tail -f /srv/helpDesk/backend/logs/monitor.log"
echo ""
echo "🔄 Тепер система автоматично:"
echo "   - Перевіряє стан сервісу кожні 5 хвилин"
echo "   - Очищує порти якщо потрібно"
echo "   - Перезапускає PM2 при проблемах"
echo "   - Логує всі дії"
