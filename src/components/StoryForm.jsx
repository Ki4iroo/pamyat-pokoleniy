import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { transcribe, transcribeEnabled } from '../lib/transcribe';
import { MicIcon, StopIcon } from './Icons';

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

function VoiceButton({ onText }) {
  const { t } = useStore();
  const [state, setState] = useState('idle'); // idle | recording | uploading
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => {
    mountedRef.current = false;
    if (recRef.current?.state === 'recording') {
      recRef.current.onstop = null;
      recRef.current.stop();
    }
    recRef.current?.stream.getTracks().forEach((tr) => tr.stop());
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

    const recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32000 });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((tr) => tr.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' });
      try {
        const text = await transcribe(blob);
        if (!mountedRef.current) return;
        if (text) onText(text);
        else setError(t('dictationEmpty'));
      } catch {
        if (mountedRef.current) setError(t('dictationFailed'));
      }
      if (mountedRef.current) setState('idle');
    };

    recRef.current = recorder;
    recorder.start();
    setState('recording');
  };

  const stop = () => {
    if (recRef.current?.state === 'recording') recRef.current.stop();
    setState('uploading');
  };

  return (
    <div className="recorder dictation">
      {state === 'recording' && (
        <button type="button" className="btn btn--recording btn--block" onClick={stop}>
          <span className="rec-dot" /><StopIcon /> {t('dictationStop')}
        </button>
      )}
      {state === 'uploading' && (
        <button type="button" className="btn btn--secondary btn--block" disabled>{t('dictationBusy')}</button>
      )}
      {state === 'idle' && (
        <button type="button" className="btn btn--secondary btn--block" onClick={start}>
          <MicIcon /> {t('dictate')}
        </button>
      )}
      <p className="muted dictation__note">{t('dictationNote')}</p>
      {error && <p className="recorder__error">{error}</p>}
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
      {transcribeEnabled && <VoiceButton onText={appendText} />}
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary">{t('save')}</button>
      </div>
    </form>
  );
}
