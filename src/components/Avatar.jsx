import { initials } from '../lib/utils';

// Цвет заглушки стабильно зависит от имени
const palette = ['#4f6d7a', '#7a5c4f', '#5c7a4f', '#6a4f7a', '#7a6f4f', '#4f7a72'];

export default function Avatar({ name, photo, size = 56 }) {
  const color = palette[[...(name || '?')].reduce((s, c) => s + c.charCodeAt(0), 0) % palette.length];
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.36, background: color }}>
      {photo ? <img src={photo} alt={name} /> : initials(name) || '?'}
    </div>
  );
}
