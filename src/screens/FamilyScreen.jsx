import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { calcAge, pluralYears } from '../lib/utils';
import { haptic } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import Sheet from '../components/Sheet';
import RelativeForm from '../components/RelativeForm';
import EmptyState from '../components/EmptyState';
import { PlusIcon, UsersIcon } from '../components/Icons';

export default function FamilyScreen() {
  const { relatives, addRelative, t, lang } = useStore();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [params, setParams] = useSearchParams();

  // /?add=1 — открыть форму сразу (переход из онбординга)
  useEffect(() => {
    if (params.get('add')) {
      setAdding(true);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const handleAdd = (data) => {
    addRelative(data);
    haptic('medium');
    setAdding(false);
  };

  return (
    <>
      <Header title={t('family')} />

      {relatives.length === 0 ? (
        <EmptyState icon={<UsersIcon />} text={t('noRelatives')} />
      ) : (
        <ul className="list">
          {relatives.map((r) => {
            const age = calcAge(r.birthDate, r.deathDate);
            return (
              <li key={r.id}>
                <button className="card relative-card" onClick={() => navigate(`/relative/${r.id}`)}>
                  <Avatar name={r.name} photo={r.photo} />
                  <div className="relative-card__info">
                    <div className="relative-card__name">{r.name}</div>
                    <div className="muted">
                      {[r.relation, age !== null && pluralYears(age, lang)].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <button className="btn btn--primary btn--block btn--floating" onClick={() => setAdding(true)}>
        <PlusIcon /> {t('addRelative')}
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addRelative')}>
        <RelativeForm onSubmit={handleAdd} onCancel={() => setAdding(false)} />
      </Sheet>
    </>
  );
}
