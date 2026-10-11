import { useState } from 'react';
import { useStore } from '../store/StoreContext';
import Header from '../components/Header';
import Sheet from '../components/Sheet';
import StoryForm from '../components/StoryForm';
import StoryCard from '../components/StoryCard';
import EmptyState from '../components/EmptyState';
import { BookIcon, PlusIcon } from '../components/Icons';

export default function StoriesScreen() {
  const { stories, t } = useStore();
  const [adding, setAdding] = useState(false);

  return (
    <>
      <Header title={t('stories')} />

      {stories.length === 0
        ? <EmptyState icon={<BookIcon />} text={t('noStories')} />
        : <div className="list">{stories.map((s) => <StoryCard key={s.id} story={s} />)}</div>}

      <button className="btn btn--primary btn--block btn--floating" onClick={() => setAdding(true)}>
        <PlusIcon /> {t('addStory')}
      </button>

      <Sheet open={adding} onClose={() => setAdding(false)} title={t('addStory')}>
        <StoryForm
          onDone={() => setAdding(false)}
          onCancel={() => setAdding(false)}
        />
      </Sheet>
    </>
  );
}
