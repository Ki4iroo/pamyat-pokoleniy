import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { MicIcon, StopIcon } from './Icons';

// URL сервера транскрипции — меняй на свой домен/IP после деплоя
const TRANSCRIBE_URL = import.meta.env.VITE_TRANSCRIBE_URL || '';

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return types.find((t) => MediaRecorder.isTypeSupported?.(t)) ?? '';
}

function VoiceButton({ onText }) {
  const [state, setState] = useState('idle'); // idle | recording | uploading | error
  const [errorMsg, setErrorMsg] = useState('');
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => {
    recRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const start = async () => {
    setErrorMsg('');
    if (!TRANSCRIBE_URL) {
      setErrorMsg('Сервер транскрипции не настроен');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMsg('Микрофон недоступен в этом браузере');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setErrorMsg('Нет доступа к микрофону');
      return;
    }

    const mimeType = pickMimeType();
    const recorder = new MediaRecorder(stream, {
      ...(mimeType && { mimeType }),
      audioBitsPerSecond: 32000,
    });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setState('uploading');
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      try {
        const fd = new FormData();
        fd.append('file', blob, 'audio.webm');
        const res = await fetch(TRANSCRIBE_URL, { method: 'POST', body: fd });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const { text } = await res.json();
        if (text) onText(text);
        else setErrorMsg('Текст не распознан');
      } catch (e) {
        setErrorMsg('Ошибка транскрипции: ' + e.message);
      }
      setState('idle');
    };

    recRef.current = recorder;
    recorder.start();
    setState('recording');
  };

  const stop = () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    setState('uploading');
  };

  if (state === 'recording') {
    return (
      <div className="recorder">
        <button type="button" className="btn btn--recording btn--block" onClick={stop}>
          <span className="rec-dot" /><StopIcon /> Остановить и расшифровать
        </button>
      </div>
    );
  }

  if (state === 'uploading') {
    return (
      <div className="recorder">
        <button type="button" className="btn btn--secondary btn--block" disabled>
          ⏳ Расшифровка...
        </button>
      </div>
    );
  }

  return (
    <div className="recorder">
      <button type="button" className="btn btn--secondary btn--block" onClick={start}>
        <MicIcon /> Надиктовать голосом
      </button>
      {errorMsg && <p className="recorder__error">{errorMsg}</p>}
    </div>
  );
}

export default function StoryForm({ defaultRelativeId = '', onSubmit, onCancel }) {
  const { t, relatives } = useStore();
  const [form, setForm] = useState({ title: '', text: '', relativeId: defaultRelativeId });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const appendText = (text) =>
    setForm((f) => ({ ...f, text: f.text ? f.text + ' ' + text : text }));

  const submit = (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.text.trim()) return;
    onSubmit({ ...form, title: form.title.trim(), text: form.text.trim() });
  };

  return (
    <form className="form" onSubmit={submit}>
      <label className="field">
        <span>{t('title')}</span>
        <input value={form.title} onChange={set('title')} autoFocus required />
      </label>
      {!defaultRelativeId && relatives.length > 0 && (
        <label className="field">
          <span>{t('about')}</span>
          <select value={form.relativeId} onChange={set('relativeId')}>
            <option value="">—</option>
            {relatives.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
      )}
      <label className="field">
        <span>{t('text')}</span>
        <textarea rows={6} value={form.text} onChange={set('text')} required />
      </label>
      <VoiceButton onText={appendText} />
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary">{t('save')}</button>
      </div>
    </form>
  );
}
