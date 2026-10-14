import { capture, withStores } from './idb';
import { uid } from '../lib/utils';

const LEGACY_PREFIX = 'pp:';

function dataUrlToBuffer(dataUrl) {
  const match = /^data:([^;,]+)[^,]*;base64,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { type: match[1], data: bytes.buffer };
}

function readLegacy(key) {
  try {
    const raw = localStorage.getItem(LEGACY_PREFIX + key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch { return null; }
}

async function migrateLegacy() {
  const legacyRelatives = readLegacy('relatives');
  const legacyStories = readLegacy('stories');
  if (legacyRelatives === null && legacyStories === null) return 0;
  const relatives = [];
  const blobs = [];
  for (const item of legacyRelatives || []) {
    if (!item || typeof item.id !== 'string') continue;
    const { audio, ...relative } = item;
    if (typeof audio === 'string') {
      const decoded = dataUrlToBuffer(audio);
      if (decoded) { const id = uid(); blobs.push({ id, ...decoded }); relative.audioId = id; }
    }
    relatives.push(relative);
  }
  const stories = (legacyStories || []).filter((s) => s && typeof s.id === 'string');
  await withStores(['relatives', 'stories', 'blobs'], 'readwrite', (s) => {
    relatives.forEach((r) => s.relatives.put(r));
    stories.forEach((st) => s.stories.put(st));
    blobs.forEach((b) => s.blobs.put(b));
  });
  try {
    localStorage.removeItem(LEGACY_PREFIX + 'relatives');
    localStorage.removeItem(LEGACY_PREFIX + 'stories');
  } catch {}
  return relatives.length + stories.length;
}

async function init() {
  const migrated = await migrateLegacy();
  try { await navigator.storage?.persist?.(); } catch {}
  return { migrated };
}

async function loadAll() {
  let relatives; let stories;
  await withStores(['relatives', 'stories'], 'readonly', (s) => {
    relatives = capture(s.relatives.getAll());
    stories = capture(s.stories.getAll());
  });
  return {
    relatives: (relatives.value || []).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    stories: (stories.value || []).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
  };
}

async function saveRelative(relative) {
  await withStores(['relatives'], 'readwrite', (s) => { s.relatives.put(relative); });
  return relative;
}

async function deleteRelative(id) {
  await withStores(['relatives', 'stories', 'blobs'], 'readwrite', (s) => {
    s.relatives.getAll().onsuccess = (e) => {
      for (const r of e.target.result) {
        if (r.id === id) { if (r.audioId) s.blobs.delete(r.audioId); s.relatives.delete(r.id); }
        else if (r.parentIds?.includes(id)) s.relatives.put({ ...r, parentIds: r.parentIds.filter((p) => p !== id) });
      }
    };
    s.stories.getAll().onsuccess = (e) => {
      for (const st of e.target.result) {
        if (st.relativeId !== id) continue;
        if (st.audioId) s.blobs.delete(st.audioId); s.stories.delete(st.id);
      }
    };
  });
}

async function setGreeting(relative, audio) {
  const data = audio ? await audio.blob.arrayBuffer() : null;
  const next = { ...relative, audioId: audio ? uid() : null, audioDuration: audio ? audio.duration : null };
  await withStores(['relatives', 'blobs'], 'readwrite', (s) => {
    if (relative.audioId) s.blobs.delete(relative.audioId);
    if (audio) s.blobs.put({ id: next.audioId, type: audio.blob.type || 'audio/webm', data });
    s.relatives.put(next);
  });
  return next;
}

async function saveStory(story, audio) {
  if (!audio) { await withStores(['stories'], 'readwrite', (s) => { s.stories.put(story); }); return story; }
  const data = await audio.blob.arrayBuffer();
  const next = { ...story, audioId: uid(), audioDuration: audio.duration };
  await withStores(['stories', 'blobs'], 'readwrite', (s) => {
    if (story.audioId) s.blobs.delete(story.audioId);
    s.blobs.put({ id: next.audioId, type: audio.blob.type || 'audio/webm', data });
    s.stories.put(next);
  });
  return next;
}

async function removeStoryAudio(story) {
  const next = { ...story, audioId: null, audioDuration: null };
  await withStores(['stories', 'blobs'], 'readwrite', (s) => {
    if (story.audioId) s.blobs.delete(story.audioId);
    s.stories.put(next);
  });
  return next;
}

async function deleteStory(story) {
  await withStores(['stories', 'blobs'], 'readwrite', (s) => {
    if (story.audioId) s.blobs.delete(story.audioId);
    s.stories.delete(story.id);
  });
}

async function loadAudio(id) {
  if (!id) return null;
  let record;
  await withStores(['blobs'], 'readonly', (s) => { record = capture(s.blobs.get(id)); });
  if (!record.value) return null;
  return new Blob([record.value.data], { type: record.value.type || 'audio/webm' });
}

async function clearAll() {
  await withStores(['relatives', 'stories', 'blobs', 'drafts'], 'readwrite', (s) => {
    Object.values(s).forEach((store) => store.clear());
  });
}

async function appendDraftChunk(draftId, seq, chunk) {
  await withStores(['drafts'], 'readwrite', (s) => { s.drafts.put({ draftId, seq, ...chunk }); });
}

async function discardDraft(draftId) {
  if (!draftId) return;
  await withStores(['drafts'], 'readwrite', (s) => {
    s.drafts.delete(IDBKeyRange.bound([draftId, 0], [draftId, Number.MAX_SAFE_INTEGER]));
  });
}

async function listDrafts() {
  let rows;
  await withStores(['drafts'], 'readonly', (s) => { rows = capture(s.drafts.getAll()); });
  const byId = new Map();
  for (const row of rows.value || []) {
    if (!byId.has(row.draftId)) byId.set(row.draftId, []);
    byId.get(row.draftId).push(row);
  }
  return [...byId.entries()].map(([draftId, chunks]) => {
    chunks.sort((a, b) => a.seq - b.seq);
    const first = chunks[0]; const last = chunks[chunks.length - 1];
    return { draftId, blob: new Blob(chunks.map((c) => c.data), { type: first.type || 'audio/webm' }), duration: Math.round((last.elapsedMs || 0) / 1000), startedAt: first.startedAt, relativeId: first.relativeId || '' };
  });
}

async function loadAllBlobs() {
  let rows;
  await withStores(['blobs'], 'readonly', (s) => { rows = capture(s.blobs.getAll()); });
  return rows.value || [];
}

async function listBlobIds() {
  let keys;
  await withStores(['blobs'], 'readonly', (s) => { keys = capture(s.blobs.getAllKeys()); });
  return keys.value || [];
}

async function importRecords({ relatives, stories, blobs }) {
  await withStores(['relatives', 'stories', 'blobs'], 'readwrite', (s) => {
    blobs.forEach((b) => s.blobs.put(b));
    relatives.forEach((r) => s.relatives.put(r));
    stories.forEach((st) => s.stories.put(st));
  });
}

async function estimate() {
  try { const { usage, quota } = await navigator.storage.estimate(); return { usage: usage || 0, quota: quota || 0 }; }
  catch { return null; }
}

export const localRepo = { init, loadAll, saveRelative, deleteRelative, setGreeting, saveStory, removeStoryAudio, deleteStory, loadAudio, clearAll, appendDraftChunk, discardDraft, listDrafts, loadAllBlobs, listBlobIds, importRecords, estimate };
