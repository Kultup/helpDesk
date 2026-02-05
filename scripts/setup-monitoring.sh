#!/bin/bash

###############################################################################
# Налаштування автоматичного моніторингу
###############################################################################

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     HelpDesk Auto-Monitoring Setup Script                 ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Перевірка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  Цей скрипт потребує права root${NC}"
    echo -e "${YELLOW}   Використайте: sudo ./scripts/setup-monitoring.sh${NC}"
    exit 1
fi

echo -e "${BLUE}1️⃣  Надання прав на виконання скриптів...${NC}"
chmod +x /srv/helpDesk/scripts/*.sh
echo -e "${GREEN}✅ Права надано${NC}"
echo ""

echo -e "${BLUE}2️⃣  Налаштування cron job...${NC}"

# Створити cron job для моніторингу (кожні 5 хвилин)
CRON_CMD="*/5 * * * * /srv/helpDesk/scripts/health-monitor.sh >> /srv/helpDesk/backend/logs/cron.log 2>&1"

# Перевірити чи вже існує
if crontab -l 2>/dev/null | grep -q "health-monitor.sh"; then
    echo -e "${YELLOW}⚠️  Cron job вже існує. Оновлюю...${NC}"
    (crontab -l 2>/dev/null | grep -v "health-monitor.sh"; echo "$CRON_CMD") | crontab -
else
    (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
fi

echo -e "${GREEN}✅ Cron job налаштовано (кожні 5 хвилин)${NC}"
echo ""

echo -e "${BLUE}3️⃣  Створення systemd timer для додаткового моніторингу...${NC}"

# Створити systemd timer
cat > /etc/systemd/system/helpdesk-monitor.timer << 'EOF'
[Unit]
Description=HelpDesk Health Monitor Timer
After=network.target

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Unit=helpdesk-monitor.service

[Install]
WantedBy=timers.target
EOF

# Створити systemd service
cat > /etc/systemd/system/helpdesk-monitor.service << 'EOF'
[Unit]
Description=HelpDesk Health Monitor
After=network.target

[Service]
Type=oneshot
User=root
ExecStart=/srv/helpDesk/scripts/health-monitor.sh
StandardOutput=append:/srv/helpDesk/backend/logs/systemd-monitor.log
StandardError=append:/srv/helpDesk/backend/logs/systemd-monitor.log
EOF

# Перезавантажити systemd
systemctl daemon-reload

# Увімкнути timer
systemctl enable helpdesk-monitor.timer
systemctl start helpdesk-monitor.timer

echo -e "${GREEN}✅ Systemd timer налаштовано${NC}"
echo ""

echo -e "${BLUE}4️⃣  Оновлення PM2 конфігурації...${NC}"

cd /srv/helpDesk

# Зупинити процеси
pm2 stop all || true

# Видалити старі процеси
pm2 delete all || true

# Запустити з новою конфігурацією
pm2 start ecosystem.config.js

# Зберегти
pm2 save

echo -e "${GREEN}✅ PM2 оновлено з auto-restart${NC}"
echo ""

echo -e "${BLUE}5️⃣  Створення лог ротації...${NC}"

cat > /etc/logrotate.d/helpdesk << 'EOF'
/srv/helpDesk/backend/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    missingok
    create 0644 root root
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
EOF

echo -e "${GREEN}✅ Лог ротація налаштована${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║         ✅ АВТОМАТИЧНИЙ МОНІТОРИНГ НАЛАШТОВАНО             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Що працює:${NC}"
echo -e "   ✅ PM2 auto-restart при падінні процесу"
echo -e "   ✅ Cron job перевірка кожні 5 хвилин"
echo -e "   ✅ Systemd timer для додаткової надійності"
echo -e "   ✅ Автоматична перевірка MongoDB, Redis"
echo -e "   ✅ Health check endpoint моніторинг"
echo -e "   ✅ Автоматичне відновлення при помилках"
echo -e "   ✅ Лог ротація (зберігає 7 днів)"
echo ""
echo -e "${BLUE}📊 Моніторинг логів:${NC}"
echo -e "   Health monitor: ${YELLOW}tail -f /srv/helpDesk/backend/logs/health-monitor.log${NC}"
echo -e "   Cron log:       ${YELLOW}tail -f /srv/helpDesk/backend/logs/cron.log${NC}"
echo -e "   PM2 backend:    ${YELLOW}pm2 logs helpdesk-backend${NC}"
echo -e "   PM2 frontend:   ${YELLOW}pm2 logs helpdesk-frontend${NC}"
echo ""
echo -e "${BLUE}🔧 Перевірка статусу:${NC}"
echo -e "   Cron jobs:      ${YELLOW}crontab -l${NC}"
echo -e "   Systemd timer:  ${YELLOW}systemctl status helpdesk-monitor.timer${NC}"
echo -e "   PM2 список:     ${YELLOW}pm2 list${NC}"
echo ""
echo -e "${BLUE}🧪 Тестування:${NC}"
echo -e "   Вбити backend:  ${YELLOW}pm2 stop helpdesk-backend${NC}"
echo -e "   Дивитись логи: ${YELLOW}tail -f /srv/helpDesk/backend/logs/health-monitor.log${NC}"
echo -e "   Через 5 хвилин система автоматично відновиться!"
echo ""
