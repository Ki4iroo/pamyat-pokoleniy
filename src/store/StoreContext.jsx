import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { load, save } from '../lib/storage';
import { translate } from '../lib/i18n';
import { uid } from '../lib/utils';

// Модель данных:
// relative: { id, name, relation, birthDate, deathDate, photo, audio, parentIds: [] }
// story:    { id, relativeId, title, text, createdAt }
const StoreContext = createContext(null);

function usePersistentState(key, fallback) {
  const [value, setValue] = useState(() => load(key, fallback));
  useEffect(() => save(key, value), [key, value]);
  return [value, setValue];
}

export function StoreProvider({ children }) {
  const [relatives, setRelatives] = usePersistentState('relatives', []);
  const [stories, setStories] = usePersistentState('stories', []);
  const [lang, setLang] = usePersistentState('lang', 'ru');

  const addRelative = useCallback((data) => {
    const relative = { id: uid(), parentIds: [], ...data };
    setRelatives((list) => [...list, relative]);
    return relative;
  }, [setRelatives]);

  const updateRelative = useCallback((id, patch) => {
    setRelatives((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, [setRelatives]);

  const removeRelative = useCallback((id) => {
    setRelatives((list) => list
      .filter((r) => r.id !== id)
      .map((r) => ({ ...r, parentIds: r.parentIds.filter((p) => p !== id) })));
    setStories((list) => list.filter((s) => s.relativeId !== id));
  }, [setRelatives, setStories]);

  const addStory = useCallback((data) => {
    setStories((list) => [{ id: uid(), createdAt: new Date().toISOString(), ...data }, ...list]);
  }, [setStories]);

  const removeStory = useCallback((id) => {
    setStories((list) => list.filter((s) => s.id !== id));
  }, [setStories]);

  const clearAll = useCallback(() => {
    setRelatives([]);
    setStories([]);
  }, [setRelatives, setStories]);

  const t = useCallback((key) => translate(lang, key), [lang]);

  const value = useMemo(() => ({
    relatives, stories, lang, setLang, t,
    addRelative, updateRelative, removeRelative, addStory, removeStory, clearAll,
  }), [relatives, stories, lang, setLang, t,
    addRelative, updateRelative, removeRelative, addStory, removeStory, clearAll]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
