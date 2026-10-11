import { useEffect, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { canPause } from '../lib/useRecorder';
import { formatDuration } from '../lib/utils';
import { haptic } from '../lib/telegram';
import { MicIcon, PauseIcon, PlayIcon, StopIcon, TrashIcon } from './Icons';

const BARS = 28;

// Панель записи: кнопка старта, таймер, индикатор уровня, пауза, готово, отмена.
// rec — результат useRecorder(); onRecorded({ blob, duration, draftId }) вызывается после «Готово».
export default function RecorderPanel({ rec, relativeId = '', onRecorded, label }) {
  const { t } = useStore();
  const [history, setHistory] = useState(() => Array(BARS).fill(0));

  // История уровня для «бегущих» столбиков
  useEffect(() => {
    if (rec.status !== 'recording') return;
    setHistory((h) => [...h.slice(1), rec.level]);
  }, [rec.level, rec.status]);

  useEffect(() => {
    if (rec.status === 'idle') setHistory(Array(BARS).fill(0));
  }, [rec.status]);

  const start = () => {
    haptic('medium');
    rec.start({ relativeId });
  };

  const finish = async () => {
    haptic('medium');
    const result = await rec.stop();
    if (result) onRecorded(result);
  };

  const errorText = rec.error && t({ unsupported: 'audioUnsupported', denied: 'micDenied', failed: 'recordingFailed' }[rec.error]);

  if (!rec.active) {
    return (
      <div className="rec-panel">
        <button type="button" className="btn btn--primary btn--block rec-panel__start" onClick={start}>
          <MicIcon /> {label || t('recordVoice')}
        </button>
        {errorText && <p className="recorder__error">{errorText}</p>}
      </div>
    );
  }

  const paused = rec.status === 'paused';
  const busy = rec.status === 'starting' || rec.status === 'stopping';

  return (
    <div className={'rec-panel rec-panel--active' + (paused ? ' rec-panel--paused' : '')}>
      <div className="rec-panel__top">
        <span className="rec-panel__state">
          {!paused && !busy && <span className="rec-dot" />}
          {rec.status === 'starting' ? t('recStarting')
            : rec.status === 'stopping' ? t('saving')
              : paused ? t('recPaused') : t('recRecording')}
        </span>
        <span className="rec-panel__time">{formatDuration(rec.elapsedMs / 1000)}</span>
      </div>

      <div className="rec-panel__meter" aria-hidden="true">
        {history.map((v, i) => (
          <span key={i} style={{ transform: `scaleY(${Math.max(0.08, v)})` }} />
        ))}
      </div>

      <div className="rec-panel__actions">
        <button type="button" className="icon-btn icon-btn--danger" onClick={rec.cancel} disabled={busy} aria-label={t('recCancel')}>
          <TrashIcon />
        </button>
        {canPause && (
          <button
            type="button"
            className="btn btn--secondary rec-panel__pause"
            onClick={() => { haptic('light'); (paused ? rec.resume : rec.pause)(); }}
            disabled={busy}
          >
            {paused ? <><PlayIcon /> {t('recResume')}</> : <><PauseIcon /> {t('recPause')}</>}
          </button>
        )}
        <button type="button" className="btn btn--primary rec-panel__done" onClick={finish} disabled={busy}>
          <StopIcon /> {t('recDone')}
        </button>
      </div>
    </div>
  );
}
