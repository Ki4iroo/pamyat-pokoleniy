import { useCallback, useEffect, useRef, useState } from 'react';
import { repo } from '../data';
import { uid } from './utils';

// Запись голоса без сервера: MediaRecorder + пауза + таймер + индикатор уровня.
// Каждую секунду кусок записи сохраняется в IndexedDB как черновик (repo.appendDraftChunk),
// поэтому если Telegram или вкладку закроют посреди записи, её можно восстановить
// через repo.listDrafts().

const TIMESLICE_MS = 1000;
export const MAX_RECORDING_MS = 60 * 60 * 1000;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

export const recordingSupported = typeof window !== 'undefined'
  && typeof MediaRecorder !== 'undefined'
  && Boolean(navigator.mediaDevices?.getUserMedia);

export const canPause = typeof MediaRecorder !== 'undefined'
  && typeof MediaRecorder.prototype.pause === 'function';

// status: idle | starting | recording | paused | stopping
// error:  '' | 'unsupported' | 'denied' | 'failed'
export default function useRecorder({ maxMs = MAX_RECORDING_MS } = {}) {
  const [status, setStatus] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState('');
  const sessionRef = useRef(null);

  const elapsedOf = (session) => session.accumulated + (session.segmentStart ? Date.now() - session.segmentStart : 0);

  const releaseDevices = (session) => {
    clearInterval(session.timer);
    cancelAnimationFrame(session.raf);
    session.stream.getTracks().forEach((track) => track.stop());
    session.audioCtx?.close().catch(() => {});
  };

  const stop = useCallback(() => {
    const session = sessionRef.current;
    if (!session) return Promise.resolve(null);
    if (session.stopPromise) return session.stopPromise;
    if (session.segmentStart) {
      session.accumulated += Date.now() - session.segmentStart;
      session.segmentStart = null;
    }
    setElapsedMs(session.accumulated);
    setStatus('stopping');
    session.stopPromise = new Promise((resolve) => {
      session.resolveStop = resolve;
      try {
        session.recorder.stop();
      } catch {
        resolve(null);
      }
    });
    return session.stopPromise;
  }, []);

  // Остановить и выбросить черновик
  const cancel = useCallback(async () => {
    const result = await stop();
    if (result) await repo.discardDraft(result.draftId).catch(() => {});
  }, [stop]);

  const start = useCallback(async ({ relativeId = '' } = {}) => {
    if (sessionRef.current) return;
    setError('');
    const mimeType = pickMimeType();
    if (!recordingSupported || mimeType === null) {
      setError('unsupported');
      return;
    }
    setStatus('starting');

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      setError('denied');
      setStatus('idle');
      return;
    }

    let recorder;
    try {
      recorder = new MediaRecorder(stream, { ...(mimeType && { mimeType }), audioBitsPerSecond: 32000 });
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setError('unsupported');
      setStatus('idle');
      return;
    }

    const session = {
      recorder,
      stream,
      draftId: uid(),
      seq: 0,
      chunks: [],
      pending: [],
      type: recorder.mimeType || mimeType || 'audio/webm',
      startedAt: new Date().toISOString(),
      relativeId,
      accumulated: 0,
      segmentStart: Date.now(),
    };
    sessionRef.current = session;

    recorder.ondataavailable = (e) => {
      if (!e.data?.size) return;
      session.chunks.push(e.data);
      const seq = session.seq++;
      const chunkElapsed = elapsedOf(session);
      // В IndexedDB кладём ArrayBuffer: Blob в IndexedDB ненадёжен в старых WebKit
      session.pending.push(
        e.data.arrayBuffer()
          .then((data) => repo.appendDraftChunk(session.draftId, seq, {
            data,
            type: session.type,
            elapsedMs: chunkElapsed,
            startedAt: session.startedAt,
            relativeId: session.relativeId,
          }))
          .catch((err) => console.error('Draft chunk save failed', err)),
      );
    };

    recorder.onstop = async () => {
      releaseDevices(session);
      await Promise.all(session.pending);
      const result = session.chunks.length
        ? {
          blob: new Blob(session.chunks, { type: session.type }),
          duration: Math.max(1, Math.round(session.accumulated / 1000)),
          draftId: session.draftId,
          relativeId: session.relativeId,
        }
        : null;
      if (sessionRef.current === session) sessionRef.current = null;
      setStatus('idle');
      setLevel(0);
      session.resolveStop?.(result);
    };

    recorder.onerror = () => {
      setError('failed');
      stop();
    };

    // Индикатор уровня: RMS сигнала через AnalyserNode, ~15 обновлений в секунду
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new Ctx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      audioCtx.createMediaStreamSource(stream).connect(analyser);
      const buf = new Uint8Array(analyser.fftSize);
      let lastUpdate = 0;
      const tick = (now) => {
        if (now - lastUpdate > 66) {
          lastUpdate = now;
          analyser.getByteTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) {
            const d = (v - 128) / 128;
            sum += d * d;
          }
          const rms = Math.sqrt(sum / buf.length);
          setLevel(recorder.state === 'recording' ? Math.min(1, rms * 4) : 0);
        }
        session.raf = requestAnimationFrame(tick);
      };
      session.audioCtx = audioCtx;
      session.raf = requestAnimationFrame(tick);
    } catch {
      // без индикатора уровня запись всё равно работает
    }

    session.timer = setInterval(() => {
      const ms = elapsedOf(session);
      setElapsedMs(ms);
      if (ms >= maxMs) stop();
    }, 250);

    recorder.start(TIMESLICE_MS);
    setElapsedMs(0);
    setStatus('recording');
  }, [maxMs, stop]);

  const pause = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !canPause || session.recorder.state !== 'recording') return;
    session.recorder.pause();
    session.accumulated += Date.now() - session.segmentStart;
    session.segmentStart = null;
    setElapsedMs(session.accumulated);
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    const session = sessionRef.current;
    if (!session || session.recorder.state !== 'paused') return;
    session.recorder.resume();
    session.segmentStart = Date.now();
    setStatus('recording');
  }, []);

  // Уход с экрана: останавливаем запись, черновик остаётся в IndexedDB для восстановления
  useEffect(() => () => {
    const session = sessionRef.current;
    if (session && session.recorder.state !== 'inactive') {
      try { session.recorder.stop(); } catch { releaseDevices(session); }
    }
  }, []);

  return {
    status,
    active: status !== 'idle',
    elapsedMs,
    level,
    error,
    start,
    pause,
    resume,
    stop,
    cancel,
  };
}
