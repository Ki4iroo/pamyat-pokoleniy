import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { load, save } from '../lib/storage';
import { translate } from '../lib/i18n';
import { uid } from '../lib/utils';
import { repo } from '../data';

// Модель данных (хранится в IndexedDB через repo):
// relative: { id, name, relation, birthDate, deathDate, photo, audioId, audioDuration, parentIds: [] }
// story:    { id, relativeId, title, text, createdAt, audioId?, audioDuration? }
// Аудио лежит отдельно, по audioId: repo.loadAudio(id) → Blob.
// Настройки (язык, онбординг) остаются в localStorage.
const StoreContext = createContext(null);

// repo.init переносит старые данные из localStorage; второй параллельный запуск
// записал бы аудио ещё раз под новым id, поэтому запускаем его один раз на страницу.
let initPromise = null;
const initRepoOnce = () => {
  initPromise ||= repo.init().catch((e) => { initPromise = null; throw e; });
  return initPromise;
};

function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue];
}

export function StoreProvider({ children }) {
  const [relatives, setRelatives] = useState([]);
  const [stories, setStories] = useState([]);
  // loading | ready | unavailable
  const [status, setStatus] = useState('loading');
  const [saveError, setSaveError] = useState(false);
  const [lang, setLang] = usePersistentState('lang', 'ru');
  // У тех, кто уже добавлял родственников до появления онбординга, его не показываем.
  // Читается до переноса: после него pp:relatives из localStorage удаляется.
  const [onboarded, setOnboarded] = usePersistentState('onboarded', load('relatives', []).length > 0);

  // Актуальные списки для действий, которым нужно текущее значение вне setState
  const relativesRef = useRef(relatives);
  const storiesRef = useRef(stories);
  relativesRef.current = relatives;
  storiesRef.current = stories;

  const reload = useCallback(async () => {
    const data = await repo.loadAll();
    setRelatives(data.relatives);
    setStories(data.stories);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await initRepoOnce(); // перенос старых данных из localStorage, если они есть
        if (cancelled) return;
        await reload();
        if (!cancelled) setStatus('ready');
      } catch (e) {
        console.error('Storage init failed', e);
        if (!cancelled) setStatus('unavailable');
      }
    })();
    return () => { cancelled = true; };
  }, [reload]);

  // Интерфейс обновляется сразу, запись в IndexedDB идёт следом.
  // Если запись не удалась — показываем ошибку и перечитываем то, что реально сохранено.
  const persist = useCallback((promise) => promise.catch((e) => {
    console.error('Save failed', e);
    setSaveError(true);
    reload().catch(() => {});
  }), [reload]);

  const addRelative = useCallback((data) => {
    const relative = { id: uid(), parentIds: [], audioId: null, audioDuration: null, ...data };
    setRelatives((list) => [...list, relative]);
    persist(repo.saveRelative(relative));
    return relative;
  }, [persist]);

  const updateRelative = useCallback((id, patch) => {
    const current = relativesRef.current.find((r) => r.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    setRelatives((list) => list.map((r) => (r.id === id ? next : r)));
    persist(repo.saveRelative(next));
  }, [persist]);

  const removeRelative = useCallback((id) => {
    setRelatives((list) => list
      .filter((r) => r.id !== id)
      .map((r) => ({ ...r, parentIds: r.parentIds.filter((p) => p !== id) })));
    setStories((list) => list.filter((s) => s.relativeId !== id));
    persist(repo.deleteRelative(id));
  }, [persist]);

  // audio: { blob, duration } или null — удалить приветствие
  const setGreeting = useCallback(async (id, audio) => {
    const current = relativesRef.current.find((r) => r.id === id);
    if (!current) return;
    const next = await repo.setGreeting(current, audio);
    setRelatives((list) => list.map((r) => (r.id === id ? { ...r, audioId: next.audioId, audioDuration: next.audioDuration } : r)));
  }, []);

  // Истории с аудио сохраняются до обновления интерфейса: запись нужно сначала положить в IndexedDB.
  // Ошибки пробрасываются в форму, чтобы она могла их показать.
  // audio: { blob, duration } или undefined
  const addStory = useCallback(async (data, audio) => {
    const story = { id: uid(), createdAt: new Date().toISOString(), ...data };
    const saved = await repo.saveStory(story, audio || undefined);
    setStories((list) => [saved, ...list]);
    return saved;
  }, []);

  // audio — заменить запись, removeAudio — убрать её
  const updateStory = useCallback(async (id, patch, { audio, removeAudio } = {}) => {
    const current = storiesRef.current.find((s) => s.id === id);
    if (!current) return null;
    let next = { ...current, ...patch };
    if (audio) next = await repo.saveStory(next, audio);
    else if (removeAudio) next = await repo.removeStoryAudio(next);
    else await repo.saveStory(next);
    setStories((list) => list.map((s) => (s.id === id ? next : s)));
    return next;
  }, []);

  const removeStory = useCallback((id) => {
    const story = storiesRef.current.find((s) => s.id === id);
    if (!story) return;
    setStories((list) => list.filter((s) => s.id !== id));
    persist(repo.deleteStory(story));
  }, [persist]);

  const clearAll = useCallback(() => {
    setRelatives([]);
    setStories([]);
    persist(repo.clearAll());
  }, [persist]);

  const t = useCallback((key) => translate(lang, key), [lang]);

  const value = useMemo(() => ({
    relatives, stories, status, saveError, dismissSaveError: () => setSaveError(false),
    lang, setLang, t, onboarded, setOnboarded, reload,
    addRelative, updateRelative, removeRelative, setGreeting, addStory, updateStory, removeStory, clearAll,
    loadAudio: repo.loadAudio,
  }), [relatives, stories, status, saveError, lang, setLang, t, onboarded, setOnboarded, reload,
    addRelative, updateRelative, removeRelative, setGreeting, addStory, updateStory, removeStory, clearAll]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
