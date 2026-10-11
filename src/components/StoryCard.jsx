import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store/StoreContext';
import { formatDate, formatDuration } from '../lib/utils';
import { confirmAction, shareToTelegram } from '../lib/telegram';
import { EditIcon, MicIcon, ShareIcon } from './Icons';
import Sheet from './Sheet';
import AudioPlayer from './AudioPlayer';
import StoryForm from './StoryForm';

export default function StoryCard({ story, showRelative = true }) {
  const { relatives, lang, t, removeStory } = useStore();
  const navigate = useNavigate();
  const [mode, setMode] = useState(null); // null | 'view' | 'edit'
  const relative = relatives.find((r) => r.id === story.relativeId);
  const date = formatDate(story.createdAt, lang);
  const title = story.title || t('voiceRecording');
  const hasText = Boolean(story.text?.trim());

  const handleShare = () => {
    const signature = relative ? `— ${relative.name}, ${t('sharedFrom')}` : `— ${t('sharedFrom')}`;
    shareToTelegram(`«${title}»\n\n${story.text}\n\n${signature}`);
  };

  const handleDelete = async () => {
    if (!(await confirmAction(t('confirmDeleteStory')))) return;
    setMode(null);
    removeStory(story.id);
  };

  return (
    <>
      <button className="card story" onClick={() => setMode('view')}>
        <span className="story__title">{title}</span>
        {hasText && <span className="story__text">{story.text}</span>}
        <div className="story__meta">
          {story.audioId && (
            <span className="story__audio-badge"><MicIcon /> {formatDuration(story.audioDuration)}</span>
          )}
          <span>{date}</span>
          {showRelative && relative && <span>· {relative.name}</span>}
        </div>
      </button>

      <Sheet open={mode === 'view'} onClose={() => setMode(null)} title={title}>
        <div className="story-full">
          <div className="story__meta story-full__meta">
            <span>{date}</span>
            {relative && (
              <>
                <span>·</span>
                <button className="link-btn" onClick={() => { setMode(null); navigate(`/relative/${relative.id}`); }}>
                  {relative.name}
                </button>
              </>
            )}
          </div>
          {story.audioId && (
            <div className="story-full__audio">
              <AudioPlayer audioId={story.audioId} duration={story.audioDuration} />
            </div>
          )}
          {hasText && <p className="story-full__text">{story.text}</p>}
          <div className="story-full__actions">
            <button className="btn btn--secondary btn--block" onClick={() => setMode('edit')}>
              <EditIcon /> {t('edit')}
            </button>
            {hasText && (
              <button className="btn btn--primary btn--block" onClick={handleShare}>
                <ShareIcon /> {t('shareStory')}
              </button>
            )}
            <button className="btn btn--danger btn--block" onClick={handleDelete}>{t('deleteStory')}</button>
          </div>
        </div>
      </Sheet>

      <Sheet open={mode === 'edit'} onClose={() => setMode('view')} title={t('editStory')}>
        {mode === 'edit' && (
          <StoryForm
            story={story}
            onDone={() => setMode('view')}
            onCancel={() => setMode('view')}
          />
        )}
      </Sheet>
    </>
  );
}
