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

export function shareApp(text) {
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(window.location.href) +
    '&text=' + encodeURIComponent(text);
  if (tg?.openTelegramLink) tg.openTelegramLink(url);
  else if (navigator.share) navigator.share({ text, url: window.location.href }).catch(() => {});
  else window.open(url, '_blank');
}
