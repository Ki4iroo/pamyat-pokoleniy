// Тонкая обёртка над Telegram WebApp SDK.
// Вне Telegram (в обычном браузере) все методы безопасно ничего не делают.
export const tg = typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

export const isTelegram = Boolean(tg?.initData);

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#0f1115');
    tg.setBackgroundColor('#0f1115');
  } catch {
    // старые клиенты не поддерживают смену цветов
  }
}

export function getTelegramUser() {
  return tg?.initDataUnsafe?.user ?? null;
}

export function haptic(type = 'light') {
  tg?.HapticFeedback?.impactOccurred?.(type);
}

export function showBackButton(onClick) {
  if (!tg?.BackButton) return () => {};
  tg.BackButton.onClick(onClick);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onClick);
    tg.BackButton.hide();
  };
}

// Ссылка на приложение без hash-части: в Telegram там лежат данные запуска (tgWebAppData).
// VITE_APP_LINK позволяет указать ссылку вида https://t.me/<bot>/<app>.
export function appLink() {
  return import.meta.env.VITE_APP_LINK || window.location.origin + window.location.pathname;
}

// Лимит длины текста в ссылке t.me/share — режем с запасом
const SHARE_TEXT_LIMIT = 1500;

export function shareToTelegram(text) {
  const url = appLink();
  const body = text.length > SHARE_TEXT_LIMIT ? text.slice(0, SHARE_TEXT_LIMIT - 1).trimEnd() + '…' : text;
  const link = 'https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(body);
  if (isTelegram && tg.openTelegramLink) tg.openTelegramLink(link);
  else if (navigator.share) navigator.share({ text: body, url }).catch(() => {});
  else window.open(link, '_blank');
}

export const shareApp = shareToTelegram;
