import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { formatDate } from '../lib/utils';
import { tg } from '../lib/telegram';
import Sheet from './Sheet';

export default function StoryCard({ story, showRelative = true }) {
  const { relatives, lang, t, removeStory } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const relative = relatives.find((r) => r.id === story.relativeId);
  const date = formatDate(story.createdAt, lang);

  const handleDelete = () => {
    const run = (ok) => {
      if (!ok) return;
      setOpen(false);
      removeStory(story.id);
    };
    if (tg?.showConfirm) tg.showConfirm(t('confirmDeleteStory'), run);
    else run(window.confirm(t('confirmDeleteStory')));
  };

  return (
    <>
      <button className="card story" onClick={() => setOpen(true)}>
        <span className="story__title">{story.title}</span>
        <span className="story__text">{story.text}</span>
        <div className="story__meta">
          <span>{date}</span>
          {showRelative && relative && <span>· {relative.name}</span>}
        </div>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={story.title}>
        <div className="story-full">
          <div className="story__meta story-full__meta">
            <span>{date}</span>
            {relative && (
              <>
                <span>·</span>
                <button className="link-btn" onClick={() => { setOpen(false); navigate(`/relative/${relative.id}`); }}>
                  {relative.name}
                </button>
              </>
            )}
          </div>
          <p className="story-full__text">{story.text}</p>
          <button className="btn btn--danger btn--block" onClick={handleDelete}>{t('deleteStory')}</button>
        </div>
      </Sheet>
    </>
  );
}
