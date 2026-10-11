// Тонкая обёртка над IndexedDB: открытие базы и транзакции на промисах.
// Хранилища:
//   relatives — родственники, ключ id
//   stories   — истории, ключ id
//   blobs     — аудиозаписи: { id, type, data: ArrayBuffer }, ключ id
//   drafts    — куски незавершённой записи: ключ [draftId, seq]

const DB_NAME = 'pamyat-pokoleniy';
const DB_VERSION = 1;

let dbPromise = null;

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of ['relatives', 'stories', 'blobs']) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('drafts')) {
        db.createObjectStore('drafts', { keyPath: ['draftId', 'seq'] });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

export async function withStores(names, mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    let t;
    try {
      t = db.transaction(names, mode);
    } catch (e) {
      reject(e);
      return;
    }
    let result;
    t.oncomplete = () => resolve(result);
    t.onabort = () => reject(t.error || new Error('Transaction aborted'));
    try {
      const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
      result = fn(stores, t);
    } catch (e) {
      try { t.abort(); } catch { /* уже закрыта */ }
      reject(e);
    }
  });
}

export function capture(request) {
  const box = { value: undefined };
  request.onsuccess = () => { box.value = request.result; };
  return box;
}
