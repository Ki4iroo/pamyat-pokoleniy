import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { calcAge, formatDate, pluralYears } from '../lib/utils';
import { haptic, isTelegram, showBackButton, tg } from '../lib/telegram';
import Header from '../components/Header';
import Avatar from '../components/Avatar';
import Sheet from '../components/Sheet';
import StoryForm from '../components/StoryForm';
import StoryCard from '../components/StoryCard';
import EmptyState from '../components/EmptyState';
import AudioRecorder from '../components/AudioRecorder';
import RelativeForm from '../components/RelativeForm';
import { ChevronLeftIcon, EditIcon, PlusIcon } from '../components/Icons';

export default function RelativeProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { relatives, stories, addStory, updateRelative, removeRelative, t, lang } = useStore();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);

  const relative = relatives.find((r) => r.id === id);
  const ownStories = stories.filter((s) => s.relativeId === id);
  const goBack = () => navigate('/', { replace: true });

  // Нативная кнопка «Назад» в Telegram
  useEffect(() => showBackButton(goBack), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!relative) {
    return (
      <>
        <Header title="" left={!isTelegram && <BackBtn onClick={goBack} />} />
        <EmptyState text={t('notFound')} />
      </>
    );
  }

  const age = calcAge(relative.birthDate, relative.deathDate);
  const lifeDates = [relative.birthDate, relative.deathDate]
    .filter(Boolean).map((d) => formatDate(d, lang)).join(' — ');
  const parents = relatives.filter((r) => relative.parentIds?.includes(r.id));
  const children = relatives.filter((r) => r.parentIds?.includes(relative.id));

  const handleDelete = () => {
    const run = (ok) => {
      if (!ok) return;
      setEditing(false);
      removeRelative(relative.id);
      goBack();
    };
    if (tg?.showConfirm) tg.showConfirm(t('confirmDeleteRelative'), run);
    else run(window.confirm(t('confirmDeleteRelative')));
  };

  return (
    <>
      <Header
        title={t('profile')}
        left={!isTelegram && <BackBtn onClick={goBack} />}
        action={(
          <button className="icon-btn" onClick={() => setEditing(true)} aria-label={t('edit')}>
            <EditIcon />
          </button>
        )}
      />

      <section className="profile">
        <Avatar name={relative.name} photo={relative.photo} size={112} />
        <h2 className="profile__name">{relative.name}</h2>
        {relative.relation && <div className="muted">{relative.relation}</div>}
        {lifeDates && <div className="profile__dates">{lifeDates}</div>}
        {age !== null && <div className="muted">{pluralYears(age, lang)}</div>}

        <AudioRecorder relative={relative} />
      </section>

      <KinLinks title={t('parentsShort')} people={parents} onOpen={(rid) => navigate(`/relative/${rid}`, { replace: true })} />
      <KinLinks title={t('children')} people={children} onOpen={(rid) => navigate(`/relative/${rid}`, { replace: true })} />

      <div className="section-title">
        <span>{t('stories')}</span>
        <button className="icon-btn" onClick={() => setAdding(true)} aria-label={t('addStory')}>
          <PlusIcon />
        </button>
      </div>

      {ownStories.length === 0
        ? <EmptyState text={t('noStories')} />
        : <div className="list">{ownStories.map((s) => <StoryCard key={s.id} story={s} showRelative={false} />)}</div>}

      <Sheet open={editing} onClose={() => setEditing(false)} title={t('edit')}>
        <RelativeForm
          key={relative.id}
          initial={relative}
          onSubmit={(data) => { updateRelative(relative.id, data); haptic('medium'); setEditing(false); }}
          onCancel={() => setEditing(false)}
          onDelete={handleDelete}
        />
      </Sheet>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addStory')}>
        <StoryForm
          defaultRelativeId={id}
          onSubmit={(data) => { addStory(data); haptic('medium'); setAdding(false); }}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </>
  );
}

function KinLinks({ title, people, onOpen }) {
  if (!people.length) return null;
  return (
    <div className="kin">
      <div className="section-title"><span>{title}</span></div>
      <div className="chips">
        {people.map((p) => (
          <button key={p.id} className="chip chip--link" onClick={() => onOpen(p.id)}>{p.name}</button>
        ))}
      </div>
    </div>
  );
}

function BackBtn({ onClick }) {
  return <button className="icon-btn" onClick={onClick} aria-label="Back"><ChevronLeftIcon /></button>;
}
