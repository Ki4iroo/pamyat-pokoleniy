import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { confirmAction, haptic } from '../lib/telegram';
import useAudioUrl from '../hooks/useAudioUrl';
import { MicIcon, StopIcon, TrashIcon } from './Icons';

const MAX_SECONDS = 60;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export default function AudioRecorder({ relative }) {
  const { t, setGreeting } = useStore();
  const audioUrl = useAudioUrl(relative.audioId);
  const [recording, setRecording] = useState(false);
  const [saving, setSaving] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recorderRef = useRef(null);
  const timerRef = useRef(null);

  const stopTracks = () => recorderRef.current?.stream.getTracks().forEach((tr) => tr.stop());

  // Останавливаем запись, если пользователь ушёл с экрана
  useEffect(() => () => {
    clearInterval(timerRef.current);
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
    stopTracks();
  }, []);

  const start = async () => {
    setError('');
    const mimeType = pickMimeType();
    if (mimeType === null || !navigator.mediaDevices?.getUserMedia) {
      setError(t('audioUnsupported'));
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(t('micDenied'));
      return;
    }

    const recorder = new MediaRecorder(stream, {
      ...(mimeType && { mimeType }),
      audioBitsPerSecond: 32000,
    });
    const chunks = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stopTracks();
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      setSaving(true);
      try {
        await setGreeting(relative.id, { blob, duration: Math.round((Date.now() - startedAt) / 1000) });
        haptic('medium');
      } catch {
        setError(t('saveFailed'));
      } finally {
        setSaving(false);
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setRecording(true);
    setSeconds(0);
    haptic('light');

    timerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startedAt) / 1000;
      setSeconds(elapsed);
      if (elapsed >= MAX_SECONDS) stop();
    }, 250);
  };

  const stop = () => {
    clearInterval(timerRef.current);
    setRecording(false);
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  };

  const remove = async () => {
    if (!(await confirmAction(t('confirmDeleteAudio')))) return;
    setGreeting(relative.id, null).catch(() => setError(t('saveFailed')));
  };

  if (recording) {
    return (
      <div className="recorder">
        <button className="btn btn--recording btn--block" onClick={stop}>
          <span className="rec-dot" />
          <StopIcon /> {t('stopRecording')} · {formatTime(seconds)} / {formatTime(MAX_SECONDS)}
        </button>
      </div>
    );
  }

  if (saving) {
    return (
      <div className="recorder">
        <button className="btn btn--secondary btn--block" disabled>{t('saving')}</button>
      </div>
    );
  }

  return (
    <div className="recorder">
      {relative.audioId ? (
        <div className="recorder__player">
          {audioUrl ? <audio controls preload="metadata" src={audioUrl} /> : <div className="recorder__placeholder" />}
          <div className="recorder__actions">
            <button className="btn btn--secondary" onClick={start}><MicIcon /> {t('rerecord')}</button>
            <button className="icon-btn icon-btn--danger" onClick={remove} aria-label={t('delete')}>
              <TrashIcon />
            </button>
          </div>
        </div>
      ) : (
        <button className="btn btn--secondary btn--block" onClick={start}>
          <MicIcon /> {t('recordGreeting')}
        </button>
      )}
      {error && <p className="recorder__error">{error}</p>}
    </div>
  );
}
