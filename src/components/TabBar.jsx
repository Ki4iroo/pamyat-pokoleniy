import { NavLink, useLocation } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { haptic } from '../lib/telegram';
import { BookIcon, GearIcon, TreeIcon, UsersIcon } from './Icons';

const tabs = [
  { to: '/', key: 'family', Icon: UsersIcon, end: true },
  { to: '/tree', key: 'tree', Icon: TreeIcon },
  { to: '/stories', key: 'stories', Icon: BookIcon },
  { to: '/settings', key: 'settings', Icon: GearIcon },
];

export default function TabBar() {
  const { t } = useStore();
  const { pathname } = useLocation();
  // Профиль родственника визуально относится к вкладке «Семья»
  const inProfile = pathname.startsWith('/relative/');

  return (
    <nav className="tabbar">
      {tabs.map(({ to, key, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          replace
          onClick={() => haptic('light')}
          className={({ isActive }) =>
            'tab' + (isActive || (inProfile && key === 'family') ? ' tab--active' : '')}
        >
          <Icon />
          <span>{t(key)}</span>
        </NavLink>
      ))}
    </nav>
  );
}
