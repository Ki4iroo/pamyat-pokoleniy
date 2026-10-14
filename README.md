# Память поколений

Telegram Mini App для записи историй жизни родственников: семья, древо, истории, аудио-приветствия.

React + Vite. Записи хранятся на устройстве (IndexedDB внутри Telegram).
По желанию — копия на сервере: оплата один раз в Telegram Stars, для участников СВО и их семей бесплатно.
Сервер — в папке `server/` (см. `server/README.md`), подключается переменной `VITE_API_URL`.

```bash
npm install
npm run dev     # разработка
npm run build   # сборка в dist/
```

Деплой на GitHub Pages происходит автоматически при пуше в `main` (`.github/workflows/deploy.yml`).
