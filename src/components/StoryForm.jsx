import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { MicIcon, StopIcon } from './Icons';

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : null;

function VoiceButton({ onText }) {
  const [state, setState] = useState('idle'); // idle | listening | unsupported
  const recRef = useRef(null);

  useEffect(() => {
    if (!SpeechRecognition) setState('unsupported');
  }, []);

  const start = () => {
    const rec = new SpeechRecognition();
    rec.lang = 'ru-RU';
    rec.continuous = true;
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join(' ');
      onText(text);
    };

    rec.onerror = () => setState('idle');
    rec.onend = () => setState('idle');

    recRef.current = rec;
    rec.start();
    setState('listening');
  };

  const stop = () => {
    recRef.current?.stop();
    setState('idle');
  };

  if (state === 'unsupported') return null;

  if (state === 'listening') {
    return (
      <button type="button" className="btn btn--recording btn--block" onClick={stop}>
        <span className="rec-dot" />
        <StopIcon /> Остановить диктовку
      </button>
    );
  }

  return (
    <button type="button" className="btn btn--secondary btn--block" onClick={start}>
      <MicIcon /> Надиктовать голосом
    </button>
  );
}

export default function StoryForm({ defaultRelativeId = '', onSubmit, onCancel }) {
  const { t, relatives } = useStore();
  const [form, setForm] = useState({ title: '', text: '', relativeId: defaultRelativeId });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const appendText = (text) =>
    setForm((f) => ({
      ...f,
      text: f.text ? f.text + ' ' + text : text,
    }));

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
