import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { repo } from '../data';
import { buildArchive, readArchive, saveFile } from '../data/archive';
import { confirmAction, getTelegramUser, shareApp } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import { ShareIcon } from '../components/Icons';
import PlanSheet from '../components/PlanSheet';
import { apiEnabled } from '../lib/api';

export default function SettingsScreen() {
  const {
    t, lang, setLang, clearAll, setOnboarded, reload, relatives, stories,
    storageMode, setStorageMode, account, hasBackupPlan, cloudOn, sync, syncNow, restoreCloud,
  } = useStore();
  const [planOpen, setPlanOpen] = useState(false);
  const [cloudMsg, setCloudMsg] = useState(null); // { text, error }
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(''); // '' | 'export' | 'import' | 'restore'
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

  const chooseServer = () => {
    if (hasBackupPlan && account?.consent) setStorageMode('server');
    else setPlanOpen(true);
  };

  const handleRestore = async () => {
    if (!(await confirmAction(t('restoreConfirm')))) return;
    setBusy('restore');
    setCloudMsg(null);
    try {
      const counts = await restoreCloud();
      setCloudMsg({ text: fill(t('restoreDone'), { r: counts.relatives, s: counts.stories }) });
    } catch (e) {
      console.error('Restore failed', e);
      setCloudMsg({ text: t('restoreFailed'), error: true });
    } finally {
      setBusy('');
    }
  };

  const serverBadge = hasBackupPlan ? null : account?.priceStars ? `${account.priceStars} ⭐` : null;
  const syncText = {
    syncing: t('syncing'),
    error: t('syncError'),
  }[sync.state] || (sync.at ? fill(t('syncDone'), { time: new Date(sync.at).toLocaleString(lang === 'en' ? 'en-GB' : 'ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : t('syncNever'));

  const user = getTelegramUser();
  const fullName = user ? [user.first_name, user.last_name].filter(Boolean).join(' ') : t('guest');

  const handleClear = async () => {
    if (await confirmAction(t(cloudOn ? 'confirmClearCloud' : 'confirmClear'))) clearAll();
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

      <div className="section-title"><span>{t('storageSection')}</span></div>
      <div className="storage-options" role="radiogroup">
        <button role="radio" aria-checked={storageMode === 'device'} className={'storage-opt' + (storageMode === 'device' ? ' storage-opt--active' : '')} onClick={() => setStorageMode('device')}>
          <span className="storage-opt__radio" />
          <span className="storage-opt__body">
            <span className="storage-opt__title">{t('storageDevice')}</span>
            <span className="muted">{t('storageDeviceHint')}</span>
          </span>
        </button>
        <button role="radio" aria-checked={storageMode === 'server'} className={'storage-opt' + (storageMode === 'server' ? ' storage-opt--active' : '')} onClick={chooseServer}>
          <span className="storage-opt__radio" />
          <span className="storage-opt__body">
            <span className="storage-opt__title">{t('storageServer')}</span>
            <span className="muted">{t('storageServerHint')}</span>
          </span>
          {serverBadge && <span className="storage-opt__badge">{serverBadge}</span>}
        </button>
      </div>
      {storageMode === 'device' && <p className="muted storage-note">{t('storageDeviceWarn')}</p>}
      {storageMode === 'server' && !cloudOn && apiEnabled && <p className="muted storage-note">{t('serverOffline')}</p>}
      {cloudOn && (
        <div className="settings-data storage-note">
          {sync.state === 'needsRestore'
            ? <p className="muted">{t('needsRestore')}</p>
            : <p className={sync.state === 'error' ? 'recorder__error' : 'muted'}>{syncText}</p>}
          {sync.state !== 'needsRestore' && (
            <button className="btn btn--secondary btn--block" onClick={syncNow} disabled={!!busy || sync.state === 'syncing'}>{t('syncNow')}</button>
          )}
          <button className={'btn btn--block ' + (sync.state === 'needsRestore' ? 'btn--primary' : 'btn--secondary')} onClick={handleRestore} disabled={!!busy || sync.state === 'syncing'}>
            {busy === 'restore' ? t('importing') : t('restoreCloud')}
          </button>
          {cloudMsg && <p className={cloudMsg.error ? 'recorder__error' : 'muted'}>{cloudMsg.text}</p>}
        </div>
      )}

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

      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} onActivated={() => setStorageMode('server')} />
    </>
  );
}

const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

function formatBytes(bytes, lang) {
  const [kb, mb] = lang === 'ru' ? ['КБ', 'МБ'] : ['KB', 'MB'];
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} ${kb}`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', lang === 'ru' ? ',' : '.')} ${mb}`;
}
