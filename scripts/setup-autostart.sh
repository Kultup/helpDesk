#!/bin/bash

###############################################################################
# Налаштування автозапуску HelpDesk після перезавантаження сервера
###############################################################################

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║        HelpDesk Auto-Start Setup Script                   ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Перевірка прав root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${YELLOW}⚠️  Цей скрипт потребує права root${NC}"
    echo -e "${YELLOW}   Використайте: sudo ./scripts/setup-autostart.sh${NC}"
    exit 1
fi

echo -e "${BLUE}1️⃣  Налаштування PM2 startup...${NC}"

# Отримати поточного користувача (не root)
REAL_USER=${SUDO_USER:-$USER}

echo -e "${BLUE}   Користувач: $REAL_USER${NC}"

# Налаштувати PM2 startup для systemd
su - $REAL_USER -c "pm2 startup systemd -u $REAL_USER --hp /home/$REAL_USER" || \
su - $REAL_USER -c "pm2 startup systemd -u $REAL_USER --hp /root"

echo ""
echo -e "${GREEN}✅ PM2 startup налаштовано${NC}"
echo ""

echo -e "${BLUE}2️⃣  Створення systemd service для перевірки...${NC}"

# Створити systemd service
cat > /etc/systemd/system/helpdesk-check.service << 'EOF'
[Unit]
Description=HelpDesk System Check and Recovery
After=network.target mongod.service redis.service

[Service]
Type=oneshot
User=root
WorkingDirectory=/srv/helpDesk
ExecStart=/srv/helpDesk/scripts/check-and-start.sh
RemainAfterExit=yes
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

echo -e "${GREEN}✅ Systemd service створено${NC}"
echo ""

echo -e "${BLUE}3️⃣  Надання прав на виконання...${NC}"
chmod +x /srv/helpDesk/scripts/check-and-start.sh
chmod +x /srv/helpDesk/scripts/setup-autostart.sh

echo -e "${GREEN}✅ Права надано${NC}"
echo ""

echo -e "${BLUE}4️⃣  Перезавантаження systemd...${NC}"
systemctl daemon-reload

echo -e "${GREEN}✅ Systemd перезавантажено${NC}"
echo ""

echo -e "${BLUE}5️⃣  Увімкнення автозапуску...${NC}"
systemctl enable helpdesk-check.service

echo -e "${GREEN}✅ Автозапуск увімкнено${NC}"
echo ""

echo -e "${GREEN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║              ✅ НАЛАШТУВАННЯ ЗАВЕРШЕНО                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}📋 Що налаштовано:${NC}"
echo -e "   ✅ PM2 автозапуск після reboot"
echo -e "   ✅ Systemd service для перевірки портів"
echo -e "   ✅ Автоматичне звільнення зайнятих портів"
echo -e "   ✅ Health check при старті"
echo ""
echo -e "${BLUE}🧪 Тестування:${NC}"
echo -e "   1. Перевірити статус: ${YELLOW}systemctl status helpdesk-check${NC}"
echo -e "   2. Запустити вручну: ${YELLOW}sudo /srv/helpDesk/scripts/check-and-start.sh${NC}"
echo -e "   3. Перезавантажити сервер: ${YELLOW}sudo reboot${NC}"
echo ""
echo -e "${BLUE}📊 Корисні команди:${NC}"
echo -e "   Логи systemd: ${YELLOW}journalctl -u helpdesk-check -f${NC}"
echo -e "   PM2 список:   ${YELLOW}pm2 list${NC}"
echo -e "   PM2 логи:     ${YELLOW}pm2 logs${NC}"
echo ""
