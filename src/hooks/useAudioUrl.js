import { useEffect, useState } from 'react';
import { useStore } from '../store/StoreContext';

// Загружает запись по audioId из IndexedDB и отдаёт временный URL для <audio>
export default function useAudioUrl(audioId) {
  const { loadAudio } = useStore();
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!audioId) {
      setUrl(null);
      return undefined;
    }
    let objectUrl = null;
    let cancelled = false;
    loadAudio(audioId)
      .then((blob) => {
        if (cancelled || !blob) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setUrl(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioId, loadAudio]);

  return url;
}
