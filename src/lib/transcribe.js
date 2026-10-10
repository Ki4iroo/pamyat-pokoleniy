import { isTelegram, tg } from './telegram';

// Адрес сервера расшифровки (server/transcribe.py). Задаётся при сборке:
// локально — в .env.local, на GitHub Pages — переменной репозитория VITE_TRANSCRIBE_URL.
const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL || '';

// Сервер принимает только запросы с подписанными данными запуска Telegram,
// поэтому вне Telegram диктовку не показываем.
export const transcribeEnabled = Boolean(TRANSCRIBE_URL) && isTelegram;

export async function transcribe(blob) {
  const fd = new FormData();
  fd.append('file', blob, blob.type.includes('mp4') ? 'audio.mp4' : 'audio.webm');
  const res = await fetch(TRANSCRIBE_URL, {
    method: 'POST',
    body: fd,
    headers: { 'X-Telegram-Init-Data': tg.initData },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const { text } = await res.json();
  return text?.trim() || '';
}
