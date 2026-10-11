import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { repo } from '../data';
import { buildArchive, readArchive, saveFile } from '../data/archive';
import { confirmAction, getTelegramUser, shareApp } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import { ShareIcon } from '../components/Icons';

export default function SettingsScreen() {
  const { t, lang, setLang, clearAll, setOnboarded, reload, relatives, stories } = useStore();
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(''); // '' | 'export' | 'import'
  const [message, setMessage] = useState(null); // { text, error }
  const [usage, setUsage] = useState(null);

  // Сколько места занято на устройстве — обновляем при изменении данных
  useEffect(() => {
    let cancelled = false;
    repo.estimate().then((e) => !cancelled && setUsage(e));
    return () => { cancelled = true; };
  }, [relatives, stories]);

  const handleExport = async () => {
    setBusy('export');
    setMessage(null);
    try {
      const { blob, filename, counts } = await buildArchive();
      const result = await saveFile(blob, filename);
      if (result !== 'cancelled') {
        setMessage({ text: fill(t('exportDone'), { r: counts.relatives, s: counts.stories }) });
      }
    } catch (e) {
      console.error('Export failed', e);
      setMessage({ text: t('exportFailed'), error: true });
    } finally {
      setBusy('');
    }
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // чтобы можно было выбрать тот же файл ещё раз
    if (!file || !(await confirmAction(t('importConfirm')))) return;
    setBusy('import');
    setMessage(null);
    try {
      const records = await readArchive(file);
      await repo.importRecords(records);
      await reload();
      setMessage({ text: fill(t('importDone'), { r: records.relatives.length, s: records.stories.length }) });
    } catch (err) {
      console.error('Import failed', err);
      setMessage({ text: t(err?.message === 'bad-archive' ? 'importBad' : 'importFailed'), error: true });
    } finally {
      setBusy('');
    }
  };

  const user = getTelegramUser();
  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : t('guest');

  const handleClear = async () => {
    if (await confirmAction(t('confirmClear'))) clearAll();
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

      <div className="section-title"><span>{t('dataSection')}</span></div>
      <div className="settings-data">
        <button className="btn btn--secondary btn--block" onClick={handleExport} disabled={!!busy}>
          {busy === 'export' ? t('exporting') : t('exportData')}
        </button>
        <button className="btn btn--secondary btn--block" onClick={() => fileRef.current?.click()} disabled={!!busy}>
          {busy === 'import' ? t('importing') : t('importData')}
        </button>
        <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={handleImportFile} />
        {message && <p className={message.error ? 'recorder__error' : 'muted'}>{message.text}</p>}
        {usage && <p className="muted">{fill(t('storageUsed'), { size: formatBytes(usage.usage, lang) })}</p>}
      </div>

      <div className="settings-actions">
        <button className="btn btn--secondary btn--block" onClick={() => shareApp(t('shareText'))}>
          <ShareIcon /> {t('share')}
        </button>
        <button className="btn btn--secondary btn--block" onClick={() => setOnboarded(false)}>
          {t('showOnboarding')}
        </button>
        <button className="btn btn--danger btn--block" onClick={handleClear}>{t('clearData')}</button>
      </div>
    </>
  );
}

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

function formatBytes(bytes, lang) {
  const [kb, mb] = lang === 'ru' ? ['КБ', 'МБ'] : ['KB', 'MB'];
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', lang === 'ru' ? ',' : '.')} ${mb}`;
}
