import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { haptic, tg } from '../lib/telegram';
import { MicIcon, StopIcon, TrashIcon } from './Icons';

const MAX_SECONDS = 60;
// Запись хранится в localStorage как data URL, поэтому держим её маленькой
const MAX_DATA_URL_LENGTH = 1_500_000;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function AudioRecorder({ relative }) {
  const { t, updateRelative } = useStore();
  const [recording, setRecording] = useState(false);
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
      const dataUrl = await blobToDataUrl(blob);
      if (dataUrl.length > MAX_DATA_URL_LENGTH) {
        setError(t('audioTooLarge'));
        return;
      }
      updateRelative(relative.id, {
        audio: dataUrl,
        audioDuration: Math.round((Date.now() - startedAt) / 1000),
      });
      haptic('medium');
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

  const remove = () => {
    const run = (ok) => ok && updateRelative(relative.id, { audio: null, audioDuration: null });
    if (tg?.showConfirm) tg.showConfirm(t('confirmDeleteAudio'), run);
    else run(window.confirm(t('confirmDeleteAudio')));
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

  return (
    <div className="recorder">
      {relative.audio ? (
        <div className="recorder__player">
          <audio controls preload="metadata" src={relative.audio} />
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
