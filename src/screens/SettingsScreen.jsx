import { useStore } from '../store/StoreContext';
import { getTelegramUser, shareApp, tg } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import { ShareIcon } from '../components/Icons';

export default function SettingsScreen() {
  const { t, lang, setLang, clearAll } = useStore();
  const user = getTelegramUser();
  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : t('guest');

  const handleClear = () => {
    const run = (ok) => ok && clearAll();
    if (tg?.showConfirm) tg.showConfirm(t('confirmClear'), run);
    else run(window.confirm(t('confirmClear')));
  };

  return (
    <>
      <Header title={t('settings')} />

      <section className="card settings-profile">
        <Avatar name={fullName} photo={user?.photo_url} size={64} />
        <div>
          <div className="relative-card__name">{fullName}</div>
          <div className="muted">{user?.username ? '@' + user.username : t('notInTelegram')}</div>
        </div>
      </section>

      <div className="section-title"><span>{t('language')}</span></div>
      <div className="segmented">
        {[['ru', 'Русский'], ['en', 'English']].map(([code, label]) => (
          <button
            key={code}
            className={'segmented__item' + (lang === code ? ' segmented__item--active' : '')}
            onClick={() => setLang(code)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="settings-actions">
        <button className="btn btn--secondary btn--block" onClick={() => shareApp(t('shareText'))}>
          <ShareIcon /> {t('share')}
        </button>
        <button className="btn btn--danger btn--block" onClick={handleClear}>{t('clearData')}</button>
      </div>
    </>
  );
}
