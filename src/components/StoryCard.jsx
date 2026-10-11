import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { formatDate } from '../lib/utils';
import { confirmAction, shareToTelegram } from '../lib/telegram';
import { ShareIcon } from './Icons';
import Sheet from './Sheet';
import useAudioUrl from '../hooks/useAudioUrl';

export default function StoryCard({ story, showRelative = true }) {
  const { relatives, lang, t, removeStory } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const relative = relatives.find((r) => r.id === story.relativeId);
  const date = formatDate(story.createdAt, lang);

  const handleShare = () => {
    const signature = relative ? `— ${relative.name}, ${t('sharedFrom')}` : `— ${t('sharedFrom')}`;
    shareToTelegram(`«${story.title}»\n\n${story.text}\n\n${signature}`);
  };

  const handleDelete = async () => {
    if (!(await confirmAction(t('confirmDeleteStory')))) return;
    setOpen(false);
    removeStory(story.id);
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
          {open && story.audioId && <StoryAudio audioId={story.audioId} />}
          <p className="story-full__text">{story.text}</p>
          <button className="btn btn--primary btn--block" onClick={handleShare}>
            <ShareIcon /> {t('shareStory')}
          </button>
          <button className="btn btn--danger btn--block story-full__delete" onClick={handleDelete}>{t('deleteStory')}</button>
        </div>
      </Sheet>
    </>
  );
}

// Отдельный компонент, чтобы запись загружалась только когда история открыта
function StoryAudio({ audioId }) {
  const url = useAudioUrl(audioId);
  return url ? <audio className="story-full__audio" controls preload="metadata" src={url} /> : null;
}
