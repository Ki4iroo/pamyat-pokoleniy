import { useMemo, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { descendantIds } from '../lib/tree';
import PhotoPicker from './PhotoPicker';

const MAX_PARENTS = 2;

export default function RelativeForm({ initial, onSubmit, onCancel, onDelete }) {
  const { t, relatives } = useStore();
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    relation: initial?.relation ?? '',
    birthDate: initial?.birthDate ?? '',
    deathDate: initial?.deathDate ?? '',
    parentIds: initial?.parentIds ?? [],
    photo: initial?.photo ?? null,
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Родителем нельзя выбрать себя и своих потомков — иначе получится цикл
  const candidates = useMemo(() => {
    if (!initial) return relatives;
    const blocked = descendantIds(relatives, initial.id);
    blocked.add(initial.id);
    return relatives.filter((r) => !blocked.has(r.id));
  }, [relatives, initial]);

  const toggleParent = (id) => setForm((f) => {
    if (f.parentIds.includes(id)) return { ...f, parentIds: f.parentIds.filter((p) => p !== id) };
    if (f.parentIds.length >= MAX_PARENTS) return f;
    return { ...f, parentIds: [...f.parentIds, id] };
  });

  const submit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    onSubmit({ ...form, name: form.name.trim(), relation: form.relation.trim() });
  };

  return (
    <form className="form" onSubmit={submit}>
      <PhotoPicker name={form.name} value={form.photo} onChange={(photo) => setForm((f) => ({ ...f, photo }))} />
      <label className="field">
        <span>{t('name')}</span>
        <input value={form.name} onChange={set('name')} autoFocus={!initial} required />
      </label>
      <label className="field">
        <span>{t('relation')}</span>
        <input value={form.relation} onChange={set('relation')} placeholder={t('relationHint')} />
      </label>
      <div className="field-row">
        <label className="field">
          <span>{t('birthDate')}</span>
          <input type="date" value={form.birthDate} onChange={set('birthDate')} />
        </label>
        <label className="field">
          <span>{t('deathDate')}</span>
          <input type="date" value={form.deathDate} onChange={set('deathDate')} />
        </label>
      </div>

      {candidates.length > 0 && (
        <div className="field">
          <span>{t('parents')}</span>
          <div className="chips">
            {candidates.map((r) => {
              const active = form.parentIds.includes(r.id);
              const disabled = !active && form.parentIds.length >= MAX_PARENTS;
              return (
                <button
                  type="button"
                  key={r.id}
                  className={'chip' + (active ? ' chip--active' : '')}
                  disabled={disabled}
                  onClick={() => toggleParent(r.id)}
                >
                  {r.name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={onCancel}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary">{t('save')}</button>
      </div>
      {onDelete && (
        <button type="button" className="btn btn--danger btn--block" onClick={onDelete}>{t('deleteRelative')}</button>
      )}
    </form>
  );
}
