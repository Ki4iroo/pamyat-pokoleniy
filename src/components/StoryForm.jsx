import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/StoreContext';
import { repo } from '../data';
import useRecorder from '../lib/useRecorder';
import { formatDate, formatDuration } from '../lib/utils';
import { confirmAction, haptic } from '../lib/telegram';
import RecorderPanel from './RecorderPanel';
import AudioPlayer from './AudioPlayer';
import { TrashIcon } from './Icons';

const GUIDE_STEPS = [1, 2, 3, 4, 5];

// В guideStepN вопрос идёт после «Тема: » — берём его и делаем первую букву заглавной
function guideQuestion(step) {
  const question = step.split(': ').slice(1).join(': ') || step;
  return question.charAt(0).toUpperCase() + question.slice(1);
}

// Карточки-вопросы: нажатие вставляет начало фразы в текст истории
function StoryGuide({ onPick }) {
  const { t } = useStore();
  return (
    <div className="guide">
      <span className="guide__hint">{t('guideHint')}</span>
      <div className="guide__cards">
        {GUIDE_STEPS.map((n) => (
          <button key={n} type="button" className="guide-card" onClick={() => onPick(t(`guideStart${n}`))}>
            <span className="guide-card__title">{t(`guideTitle${n}`)}</span>
            <span className="guide-card__text">{guideQuestion(t(`guideStep${n}`))}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// Незаконченная запись, оставшаяся в черновиках (например, если Telegram закрыли посреди записи)
function DraftBanner({ draft, onRestore, onDiscard }) {
  const { t } = useStore();
  return (
    <div className="draft-banner">
      <span>{t('draftFound').replace('{time}', formatDuration(draft.duration))}</span>
      <div className="draft-banner__actions">
        <button type="button" className="link-btn" onClick={onRestore}>{t('draftRestore')}</button>
        <button type="button" className="link-btn link-btn--danger" onClick={onDiscard}>{t('delete')}</button>
      </div>
    </div>
  );
}

// Форма новой истории или редактирования существующей (story).
// Запись голоса — основной способ; заголовок и текст обязательны только без записи.
export default function StoryForm({ story, defaultRelativeId = '', onDone, onCancel }) {
  const { t, lang, relatives, addStory, updateStory } = useStore();
  const rec = useRecorder();
  const editing = Boolean(story);
  const [form, setForm] = useState({
    title: story?.title ?? '',
    text: story?.text ?? '',
    relativeId: story?.relativeId ?? defaultRelativeId,
  });
  const [audio, setAudio] = useState(null); // новая запись: { blob, duration, draftId }
  const [removeExisting, setRemoveExisting] = useState(false);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const textRef = useRef(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const existingAudio = editing && story.audioId && !removeExisting;
  const hasAudio = Boolean(audio) || existingAudio;

  // Ищем незаконченную запись только для новой истории
  useEffect(() => {
    if (editing) return undefined;
    let cancelled = false;
    repo.listDrafts().then(async (drafts) => {
      const usable = [];
      for (const d of drafts) {
        if (d.blob.size) usable.push(d);
        else await repo.discardDraft(d.draftId).catch(() => {});
      }
      usable.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
      if (!cancelled && usable[0]) setDraft(usable[0]);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [editing]);

  const restoreDraft = () => {
    setAudio({ blob: draft.blob, duration: draft.duration, draftId: draft.draftId });
    if (!form.relativeId && draft.relativeId) setForm((f) => ({ ...f, relativeId: draft.relativeId }));
    setDraft(null);
  };

  const discardDraft = async () => {
    await repo.discardDraft(draft.draftId).catch(() => {});
    setDraft(null);
  };

  const onRecorded = async (result) => {
    // Запись поверх предыдущей несохранённой — старый черновик больше не нужен
    if (audio?.draftId) repo.discardDraft(audio.draftId).catch(() => {});
    if (draft) setDraft(null);
    setAudio(result);
    setError('');
  };

  const removeAudio = async () => {
    if (!(await confirmAction(t('confirmDeleteRecording')))) return;
    if (audio) {
      if (audio.draftId) repo.discardDraft(audio.draftId).catch(() => {});
      setAudio(null);
    } else if (existingAudio) {
      setRemoveExisting(true);
    }
  };

  // Пустое поле — начинаем с фразы; иначе добавляем её новым абзацем. Курсор ставим в конец.
  const insertStarter = (starter) => {
    const current = form.text;
    const next = !current.trim() ? starter
      : current.endsWith(starter) ? current
        : current.replace(/\s+$/, '') + '\n\n' + starter;
    setForm((f) => ({ ...f, text: next }));
    haptic('light');
    requestAnimationFrame(() => {
      const el = textRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
      el.scrollTop = el.scrollHeight;
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    if (rec.active || saving) return;
    const title = form.title.trim();
    const text = form.text.trim();
    if (!hasAudio && (!title || !text)) {
      setError(t('storyNeedsContent'));
      return;
    }
    const data = {
      relativeId: form.relativeId,
      text,
      // Без заголовка у записи — «Запись от 11 октября 2026 г.»
      title: title || t('autoTitle').replace('{date}', formatDate(story?.createdAt || new Date().toISOString(), lang)),
    };
    const newAudio = audio ? { blob: audio.blob, duration: audio.duration } : undefined;

    setSaving(true);
    setError('');
    try {
      if (editing) await updateStory(story.id, data, { audio: newAudio, removeAudio: removeExisting && !audio });
      else await addStory(data, newAudio);
      if (audio?.draftId) repo.discardDraft(audio.draftId).catch(() => {});
      haptic('medium');
      onDone?.();
    } catch (err) {
      console.error('Story save failed', err);
      setError(t('saveFailed'));
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (rec.active) await rec.cancel();
    if (audio) {
      if (!(await confirmAction(t('confirmDiscardRecording')))) return;
      if (audio.draftId) repo.discardDraft(audio.draftId).catch(() => {});
    }
    onCancel();
  };

  return (
    <form className="form" onSubmit={submit}>
      {draft && !audio && <DraftBanner draft={draft} onRestore={restoreDraft} onDiscard={discardDraft} />}

      {/* Голос — основной способ рассказать историю */}
      {hasAudio && !rec.active ? (
        <div className="story-audio">
          {audio
            ? <AudioPlayer blob={audio.blob} duration={audio.duration} />
            : <AudioPlayer audioId={story.audioId} duration={story.audioDuration} />}
          <div className="story-audio__actions">
            <RecorderPanel rec={rec} relativeId={form.relativeId} onRecorded={onRecorded} label={t('rerecord')} />
            <button type="button" className="icon-btn icon-btn--danger" onClick={removeAudio} aria-label={t('deleteRecording')}>
              <TrashIcon />
            </button>
          </div>
        </div>
      ) : (
        <RecorderPanel rec={rec} relativeId={form.relativeId} onRecorded={onRecorded} />
      )}

      <label className="field">
        <span>{t('title')}{hasAudio && <em className="field__optional"> · {t('optional')}</em>}</span>
        <input value={form.title} onChange={set('title')} placeholder={hasAudio ? t('autoTitleHint') : ''} />
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
      <StoryGuide onPick={insertStarter} />
      <label className="field">
        <span>{t('text')}{hasAudio && <em className="field__optional"> · {t('optional')}</em>}</span>
        <textarea ref={textRef} rows={5} value={form.text} onChange={set('text')} />
      </label>

      {error && <p className="recorder__error">{error}</p>}
      {rec.active && <p className="muted">{t('finishRecordingFirst')}</p>}

      <div className="form__actions">
        <button type="button" className="btn btn--ghost" onClick={cancel} disabled={saving}>{t('cancel')}</button>
        <button type="submit" className="btn btn--primary" disabled={rec.active || saving}>
          {saving ? t('saving') : t('save')}
        </button>
      </div>
    </form>
  );
}
