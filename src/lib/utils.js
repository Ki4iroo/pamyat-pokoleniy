export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export function calcAge(birth, death) {
  if (!birth) return null;
  const b = new Date(birth);
  const e = death ? new Date(death) : new Date();
  let age = e.getFullYear() - b.getFullYear();
  const m = e.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && e.getDate() < b.getDate())) age--;
  return age;
}

export function formatDate(iso, lang = 'ru') {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-GB' : 'ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

export function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

export function pluralYears(n, lang) {
  if (lang === 'en') return `${n} ${n === 1 ? 'year' : 'years'}`;
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} год`;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return `${n} года`;
  return `${n} лет`;
}
