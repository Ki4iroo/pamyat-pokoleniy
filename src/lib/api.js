// Запросы к серверу «Памяти поколений». Сервер подключается переменной VITE_API_URL при сборке.
// Без неё (или вне Telegram) приложение работает только с хранилищем на устройстве.
import { isTelegram, tg } from './telegram';

const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const apiEnabled = Boolean(API_URL) && isTelegram;

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export async function apiFetch(path, { method = 'GET', json, body, headers = {}, raw = false } = {}) {
  if (!apiEnabled) throw new ApiError(0, 'api disabled');
  const res = await fetch(API_URL + path, {
    method,
    headers: {
      authorization: 'tma ' + tg.initData,
      ...(json !== undefined && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : body,
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).error || message; } catch {}
    throw new ApiError(res.status, message);
  }
  return raw ? res : res.json();
}

// Открывает счёт Telegram Stars. Возвращает 'paid' | 'cancelled' | 'failed' | 'pending'.
export function openInvoice(link) {
  return new Promise((resolve) => {
    if (!tg?.openInvoice) { resolve('failed'); return; }
    tg.openInvoice(link, (status) => resolve(status));
  });
}
