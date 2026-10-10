import { useState } from 'react';
import { useStore } from '../store/StoreContext';

export default function StoryForm({ defaultRelativeId = '', onSubmit, onCancel }) {
  const { t, relatives } = useStore();
  const [form, setForm] = useState({ title: '', text: '', relativeId: defaultRelativeId });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

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
      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary">{t('save')}</button>
      </div>
    </form>
  );
}
