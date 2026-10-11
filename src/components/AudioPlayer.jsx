import { useEffect, useRef, useState } from 'react';
import { repo } from '../data';
import { formatDuration } from '../lib/utils';
import { PauseIcon, PlayIcon } from './Icons';

// Плеер записи: берёт аудио из IndexedDB по audioId или напрямую из blob.
// duration (секунды) — запасная длительность: у webm из MediaRecorder её часто нет в метаданных.
export default function AudioPlayer({ audioId, blob, duration }) {
  const audioRef = useRef(null);
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [total, setTotal] = useState(duration || 0);

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    setPlaying(false);
    setCurrent(0);

    const use = (b) => {
      if (cancelled) return;
      if (!b) { setFailed(true); return; }
      objectUrl = URL.createObjectURL(b);
      setUrl(objectUrl);
    };
    if (blob) use(blob);
    else if (audioId) repo.loadAudio(audioId).then(use, () => use(null));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [audioId, blob]);

  useEffect(() => { if (duration) setTotal(duration); }, [duration]);

  const onLoaded = () => {
    const d = audioRef.current?.duration;
    if (Number.isFinite(d) && d > 0) setTotal(d);
  };

  const toggle = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => setPlaying(false));
    else el.pause();
  };

  const seek = (e) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = Number(e.target.value);
    setCurrent(el.currentTime);
  };

  if (failed) return null;

  return (
    <div className="player">
      <button type="button" className="player__btn" onClick={toggle} disabled={!url} aria-label={playing ? 'Pause' : 'Play'}>
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <input
        className="player__range"
        type="range"
        min="0"
        max={total || 0}
        step="0.1"
        value={Math.min(current, total || 0)}
        onChange={seek}
        disabled={!url || !total}
        style={{ '--progress': total ? `${(Math.min(current, total) / total) * 100}%` : '0%' }}
      />
      <span className="player__time">{formatDuration(playing || current ? current : total)}</span>
      {url && (
        <audio
          ref={audioRef}
          src={url}
          preload="metadata"
          onLoadedMetadata={onLoaded}
          onDurationChange={onLoaded}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setCurrent(0); }}
          onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        />
      )}
    </div>
  );
}
