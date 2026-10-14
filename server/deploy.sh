#!/usr/bin/env bash
# Установка и обновление сервера «Памяти поколений» на чистом VPS с Ubuntu 24.04.
# Запуск (от root):
#   curl -fsSL https://raw.githubusercontent.com/ki4iroo/pamyat-pokoleniy/main/server/deploy.sh | bash
# Повторный запуск обновляет код сервера и сохраняет настройки (/etc/pamyat.env).
set -euo pipefail

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/ki4iroo/pamyat-pokoleniy/main}"
APP_DIR=/opt/pamyat
DATA_DIR=/var/lib/pamyat
ENV_FILE=/etc/pamyat.env

[ "$(id -u)" -eq 0 ] || { echo "Запустите от root"; exit 1; }

echo "==> Пакеты: Node.js и Caddy"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nodejs caddy curl openssl >/dev/null
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || { echo "Нужен Node.js 18+, установлен $(node -v)"; exit 1; }

echo "==> Пользователь и папки"
id pamyat >/dev/null 2>&1 || useradd --system --home "$DATA_DIR" --shell /usr/sbin/nologin pamyat
mkdir -p "$APP_DIR" "$DATA_DIR"
chown pamyat:pamyat "$DATA_DIR"
chmod 700 "$DATA_DIR"

echo "==> Код сервера"
curl -fsSL "$REPO_RAW/server/index.mjs" -o "$APP_DIR/index.mjs.new"
node --check "$APP_DIR/index.mjs.new"
mv "$APP_DIR/index.mjs.new" "$APP_DIR/index.mjs"

if [ ! -f "$ENV_FILE" ]; then
  echo "==> Настройки (один раз)"
  read -r -p "Токен бота от @BotFather: " BOT_TOKEN </dev/tty
  read -r -p "Ваш chat id (узнать у @userinfobot): " ADMIN_CHAT_ID </dev/tty
  IP=$(hostname -I | awk '{print $1}')
  DEFAULT_DOMAIN="api.${IP//./-}.sslip.io"
  read -r -p "Домен сервера [$DEFAULT_DOMAIN]: " DOMAIN </dev/tty
  DOMAIN=${DOMAIN:-$DEFAULT_DOMAIN}
  umask 077
  cat > "$ENV_FILE" <<ENV
BOT_TOKEN=$BOT_TOKEN
ADMIN_CHAT_ID=$ADMIN_CHAT_ID
PUBLIC_URL=https://$DOMAIN
WEBHOOK_SECRET=$(openssl rand -hex 32)
ALLOWED_ORIGIN=https://ki4iroo.github.io
APP_URL=https://t.me/kinmory_bot/memory
PRICE_STARS=1000
TEST_PAYMENTS=1
DATA_DIR=$DATA_DIR
PORT=8080
DOMAIN=$DOMAIN
ENV
  chown root:pamyat "$ENV_FILE"
  chmod 640 "$ENV_FILE"
fi
DOMAIN=$(grep '^DOMAIN=' "$ENV_FILE" | cut -d= -f2)

echo "==> Служба"
cat > /etc/systemd/system/pamyat.service <<UNIT
[Unit]
Description=Pamyat Pokoleniy server
After=network-online.target
Wants=network-online.target

[Service]
User=pamyat
EnvironmentFile=$ENV_FILE
WorkingDirectory=$DATA_DIR
ExecStart=/usr/bin/node $APP_DIR/index.mjs
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA_DIR
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now pamyat >/dev/null
systemctl restart pamyat

echo "==> HTTPS (Caddy)"
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
  request_body {
    max_size 320MB
  }
  reverse_proxy localhost:8080
}
CADDY
systemctl reload caddy || systemctl restart caddy
if command -v ufw >/dev/null && ufw status | grep -q active; then ufw allow 80,443/tcp >/dev/null; fi

echo "==> Проверка"
sleep 3
systemctl is-active --quiet pamyat && echo "Сервер работает" || { journalctl -u pamyat -n 30 --no-pager; exit 1; }
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "https://$DOMAIN/health" >/dev/null 2>&1; then OK=1; break; fi
  sleep 3
done
[ "${OK:-}" = 1 ] && echo "HTTPS работает: https://$DOMAIN/health" || echo "HTTPS ещё не поднялся — проверьте: journalctl -u caddy -n 50"
journalctl -u pamyat -n 5 --no-pager | grep -E 'Webhook|Server on' || true

cat <<DONE

Готово. Осталось:
  GitHub → репозиторий → Settings → Secrets and variables → Actions → Variables →
  New variable:  VITE_API_URL = https://$DOMAIN
  и запустить деплой заново (Actions → Deploy to GitHub Pages → Run workflow).

Логи: journalctl -u pamyat -f
Данные: $DATA_DIR
Боевой режим оплаты: в $ENV_FILE поставить TEST_PAYMENTS=0, затем systemctl restart pamyat
DONE
