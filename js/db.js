// db.js — a small IndexedDB wrapper. Everything lives on this device, in this
// browser. Nothing is sent anywhere except an optional, best-effort barcode
// lookup (see scanner.js) which only ever sends the scanned number, never
// your collection data.

const DB_NAME = 'whiskey-vault';
const DB_VERSION = 1;
const STORE_BOTTLES = 'bottles';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_BOTTLES)) {
        const store = db.createObjectStore(STORE_BOTTLES, { keyPath: 'id' });
        store.createIndex('barcode', 'barcode', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const DB = {
  async all() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOTTLES, 'readonly');
      const req = tx.objectStore(STORE_BOTTLES).getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.dateAdded.localeCompare(a.dateAdded)));
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOTTLES, 'readonly');
      const req = tx.objectStore(STORE_BOTTLES).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  },

  async findByBarcode(barcode) {
    if (!barcode) return null;
    const all = await this.all();
    return all.find((b) => b.barcode === barcode) || null;
  },

  async save(bottle) {
    const db = await openDB();
    if (!bottle.id) bottle.id = uuid();
    if (!bottle.dateAdded) bottle.dateAdded = new Date().toISOString();
    bottle.dateUpdated = new Date().toISOString();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOTTLES, 'readwrite');
      tx.objectStore(STORE_BOTTLES).put(bottle);
      tx.oncomplete = () => resolve(bottle);
      tx.onerror = () => reject(tx.error);
    });
  },

  async remove(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOTTLES, 'readwrite');
      tx.objectStore(STORE_BOTTLES).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async exportAll() {
    const bottles = await this.all();
    return { exportedAt: new Date().toISOString(), version: DB_VERSION, bottles };
  },

  async importAll(payload, { replace = false } = {}) {
    const db = await openDB();
    const incoming = Array.isArray(payload) ? payload : payload.bottles || [];
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_BOTTLES, 'readwrite');
      const store = tx.objectStore(STORE_BOTTLES);
      if (replace) store.clear();
      incoming.forEach((b) => {
        if (!b.id) b.id = uuid();
        store.put(b);
      });
      tx.oncomplete = () => resolve(incoming.length);
      tx.onerror = () => reject(tx.error);
    });
  },

  uuid,
};

export default DB;
