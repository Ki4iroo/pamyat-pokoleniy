# Сервер «Памяти поколений»

Принимает оплату в Telegram Stars, заявки на бесплатный тариф для участников СВО
и хранит резервные копии записей. Node 18+, без зависимостей, данные — файлы в `DATA_DIR`.

## Что нужно

- VPS в России (152-ФЗ: персональные данные граждан РФ хранятся на серверах в РФ),
  например Timeweb Cloud, Selectel, Yandex Cloud. Хватит 1 vCPU / 1 ГБ RAM, диск — по объёму записей
  (час голоса ≈ 30–60 МБ).
- Домен с HTTPS (Telegram требует https для вебхука и Mini App), например через Caddy.

## Быстрая установка на VPS (Ubuntu 24.04)

В консоли сервера от root:

```bash
curl -fsSL https://raw.githubusercontent.com/ki4iroo/pamyat-pokoleniy/main/server/deploy.sh | bash
```

Скрипт спросит токен бота и ваш chat id, поставит Node.js и Caddy, получит HTTPS-сертификат
(без своего домена — адрес вида `api.1-2-3-4.sslip.io`) и включит **тестовый режим оплаты**
(`TEST_PAYMENTS=1`: оплата подтверждается без списания Stars). Повторный запуск обновляет код.

## Запуск вручную

```bash
cd server
BOT_TOKEN=123:ABC \
ADMIN_CHAT_ID=<ваш chat id> \
PUBLIC_URL=https://api.example.ru \
WEBHOOK_SECRET=<длинная случайная строка> \
ALLOWED_ORIGIN=https://ki4iroo.github.io \
APP_URL=https://t.me/kinmory_bot/memory \
PRICE_STARS=1000 \
DATA_DIR=/var/lib/pamyat \
node index.mjs
```

При старте сервер сам ставит вебхук бота на `PUBLIC_URL/bot/webhook`.
Свой chat id можно узнать у @userinfobot.

Для постоянной работы — systemd-юнит или `pm2 start index.mjs`.
Caddy: `api.example.ru { reverse_proxy localhost:8080 }`.

## Приложение

В репозитории на GitHub: Settings → Secrets and variables → Actions → Variables →
`VITE_API_URL = https://api.example.ru`. После следующего пуша приложение увидит сервер.
Без этой переменной приложение работает как раньше — только с хранилищем на устройстве.

## Команды бота (только из ADMIN_CHAT_ID)

- `/grant <id>` — одобрить заявку СВО (хранение бесплатно)
- `/deny <id>` — отклонить заявку
- `/refund <id>` — вернуть Stars за оплату (тестовую оплату или тариф СВО — просто сбросить)

Пользователям доступны `/start`, `/terms`, `/paysupport` (Telegram требует эти команды у ботов с оплатой).

## API

Все запросы `/api/*` — с заголовком `Authorization: tma <initData>`, подпись проверяется токеном бота.

| Метод | Путь | Что делает |
|---|---|---|
| GET | /api/me | тариф, согласие, статус заявки СВО, цена |
| POST | /api/consent | согласие на хранение |
| POST | /api/invoice | ссылка на счёт в Stars |
| POST | /api/svo-request | заявка `{ who, name, comment }` |
| GET | /api/blobs | id аудио на сервере |
| PUT/GET | /api/blobs/:id | загрузить / скачать аудио |
| PUT/GET | /api/meta | родственники и истории; лишние аудио удаляются |
| DELETE | /api/data | удалить копию |

## Данные

`DATA_DIR/users/<telegram id>/` — `account.json` (тариф, оплата, согласие, заявка),
`meta.json`, `blobs/`. Делайте резервную копию этой папки (например, ежедневно в объектное хранилище).
