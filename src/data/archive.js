import { strFromU8, strToU8, unzip, zip } from 'fflate';
import { repo } from './index';

const FORMAT = 'pamyat-pokoleniy';
const VERSION = 1;
const MAX_ARCHIVE_BYTES = 1024 * 1024 * 1024;
const MAX_RECORDS = 5000;
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AUDIO_TYPE_RE = /^audio\/[\w.+-]+(;\s*codecs=[\w.,+" -]+)?$/i;

const zipAsync = (files) => new Promise((resolve, reject) => {
  zip(files, (err, data) => (err ? reject(err) : resolve(data)));
});

function unzipAsync(bytes) {
  let total = 0;
  return new Promise((resolve, reject) => {
    unzip(bytes, {
      filter: (file) => {
        total += file.originalSize;
        if (total > MAX_ARCHIVE_BYTES) throw new Error('archive too large');
        return true;
      },
    }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function audioExt(type = '') {
  if (type.includes('mp4') || type.includes('aac')) return 'm4a';
  if (type.includes('ogg')) return 'ogg';
  if (type.includes('mpeg')) return 'mp3';
  if (type.includes('wav')) return 'wav';
  return 'webm';
}

function dataUrlToBytes(dataUrl) {
  const match = /^data:image\/[\w.+-]+;base64,(.*)$/s.exec(dataUrl || '');
  if (!match) return null;
  const binary = atob(match[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
  return btoa(binary);
}

function imageMime(bytes) {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png';
  if (bytes.length > 12 && strFromU8(bytes.subarray(0, 4)) === 'RIFF' && strFromU8(bytes.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

function storiesAsText(relatives, stories, audioFiles) {
  const nameOf = new Map(relatives.map((r) => [r.id, r.name]));
  const parts = stories.map((s) => {
    const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('ru-RU') : '';
    const who = nameOf.get(s.relativeId);
    const head = [s.title, [date, who].filter(Boolean).join(', ')].filter(Boolean).join('\n');
    const file = audioFiles.get(s.audioId);
    const audio = file ? `\n[Запись голоса: ${file}]` : '';
    return `${head}${audio}\n\n${s.text || ''}`.trim();
  });
  return parts.join('\n\n----------------------------------------\n\n') + '\n';
}

export async function buildArchive() {
  const [{ relatives, stories }, blobs] = await Promise.all([repo.loadAll(), repo.loadAllBlobs()]);
  const files = {};
  const audio = [];
  for (const b of blobs) {
    const file = `audio/${b.id}.${audioExt(b.type)}`;
    files[file] = [new Uint8Array(b.data), { level: 0 }];
    audio.push({ id: b.id, file, type: b.type });
  }
  const outRelatives = relatives.map(({ photo, ...rest }) => {
    const bytes = dataUrlToBytes(photo);
    if (!bytes) return rest;
    const file = `photos/${rest.id}.jpg`;
    files[file] = [bytes, { level: 0 }];
    return { ...rest, photoFile: file };
  });
  const manifest = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), relatives: outRelatives, stories, audio };
  files['data.json'] = strToU8(JSON.stringify(manifest, null, 2));
  files['Истории.txt'] = strToU8(storiesAsText(relatives, stories, new Map(audio.map((a) => [a.id, a.file]))));
  const bytes = await zipAsync(files);
  const day = new Date().toISOString().slice(0, 10);
  return { blob: new Blob([bytes], { type: 'application/zip' }), filename: `pamyat-pokoleniy-${day}.zip`, counts: { relatives: relatives.length, stories: stories.length } };
}

const str = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const dateOrEmpty = (value) => (typeof value === 'string' && DATE_RE.test(value) ? value : '');
const duration = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : null);

export async function readArchive(file) {
  let entries; let manifest;
  try {
    entries = await unzipAsync(new Uint8Array(await file.arrayBuffer()));
    manifest = JSON.parse(strFromU8(entries['data.json']));
  } catch { throw new Error('bad-archive'); }
  if (manifest?.format !== FORMAT || !Array.isArray(manifest.relatives) || !Array.isArray(manifest.stories)) throw new Error('bad-archive');
  if (manifest.relatives.length > MAX_RECORDS || manifest.stories.length > MAX_RECORDS) throw new Error('bad-archive');
  const blobs = [];
  const audioIds = new Set();
  for (const item of Array.isArray(manifest.audio) ? manifest.audio : []) {
    if (!item || !ID_RE.test(item.id) || audioIds.has(item.id)) continue;
    const bytes = entries[`audio/${item.id}.${audioExt(str(item.type, 100))}`];
    if (!bytes || !bytes.length) continue;
    const type = AUDIO_TYPE_RE.test(item.type) ? item.type : 'audio/webm';
    blobs.push({ id: item.id, type, data: bytes.slice().buffer });
    audioIds.add(item.id);
  }
  const relativeIds = new Set(manifest.relatives.filter((r) => r && ID_RE.test(r.id)).map((r) => r.id));
  const { relatives: existing } = await repo.loadAll();
  existing.forEach((r) => relativeIds.add(r.id));
  const relatives = [];
  for (const r of manifest.relatives) {
    if (!r || !ID_RE.test(r.id) || !str(r.name, 200).trim()) continue;
    let photo = null;
    const photoBytes = entries[`photos/${r.id}.jpg`];
    if (photoBytes) { const mime = imageMime(photoBytes); if (mime) photo = `data:${mime};base64,${bytesToBase64(photoBytes)}`; }
    const hasAudio = audioIds.has(r.audioId);
    relatives.push({ id: r.id, name: str(r.name, 200).trim(), relation: str(r.relation, 100), birthDate: dateOrEmpty(r.birthDate), deathDate: dateOrEmpty(r.deathDate), parentIds: (Array.isArray(r.parentIds) ? r.parentIds : []).filter((p) => ID_RE.test(p) && p !== r.id && relativeIds.has(p)).slice(0, 2), photo, audioId: hasAudio ? r.audioId : null, audioDuration: hasAudio ? duration(r.audioDuration) : null });
  }
  const stories = [];
  for (const s of manifest.stories) {
    if (!s || !ID_RE.test(s.id)) continue;
    const hasAudio = audioIds.has(s.audioId);
    const text = str(s.text, 500000);
    if (!text.trim() && !hasAudio) continue;
    const created = new Date(s.createdAt);
    stories.push({ id: s.id, relativeId: relativeIds.has(s.relativeId) ? s.relativeId : '', title: str(s.title, 300), text, createdAt: Number.isNaN(created.getTime()) ? new Date().toISOString() : created.toISOString(), ...(hasAudio && { audioId: s.audioId, audioDuration: duration(s.audioDuration) }) });
  }
  const used = new Set([...relatives.map((r) => r.audioId), ...stories.map((s) => s.audioId)].filter(Boolean));
  return { relatives, stories, blobs: blobs.filter((b) => used.has(b.id)) };
}

export async function saveFile(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  const touch = window.matchMedia?.('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; }
    catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return 'downloaded';
}
