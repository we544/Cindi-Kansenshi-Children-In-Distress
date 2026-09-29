/* ============================================================
   CINDI Kansenshi — Local Media Blob Store (IndexedDB)
   ------------------------------------------------------------
   Why IndexedDB and not localStorage: localStorage only stores
   short strings and is capped around 5-10MB total per site —
   nowhere near enough for photos, and hopeless for video or PDFs.
   IndexedDB can hold much larger binary Blobs on-device.
   IMPORTANT LIMITATION (communicated again in the admin UI):
   this still only stores files in the browser profile of
   whoever uploaded them. It is local device storage, not a
   web server — other visitors to the live site will not see
   files added this way. It's meant for previewing/staging
   content in your own browser, or for a single admin browsing
   their own device. For content the public should see, use a
   hosted URL (YouTube/Vimeo for video, a cloud file link for
   documents, or an images/ path shipped with the site).
   ============================================================ */
(function (global) {
  'use strict';

  const DB_NAME = 'cindi_media_db';
  const DB_VERSION = 1;
  const STORE = 'blobs';

  function openDB() {
    return new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) { reject(new Error('IndexedDB unavailable')); return; }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function putBlob(id, blob, meta) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(Object.assign({ id, blob }, meta || {}));
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getRecord(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function deleteBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function getObjectURL(id) {
    const rec = await getRecord(id);
    if (!rec || !rec.blob) return null;
    return URL.createObjectURL(rec.blob);
  }

  async function estimateUsage() {
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const { usage, quota } = await navigator.storage.estimate();
        return { usage: usage || 0, quota: quota || 0 };
      } catch (err) { /* fall through */ }
    }
    return null;
  }

  global.CindiMediaStore = { putBlob, getRecord, deleteBlob, getObjectURL, estimateUsage };
})(window);
