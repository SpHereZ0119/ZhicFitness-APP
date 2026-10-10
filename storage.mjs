import { createState, validateState } from './domain.mjs';

export const DATABASE_NAME = 'zhic-life-local-v1';
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('documents');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('无法打开本地数据库，请检查浏览器存储权限。'));
    request.onblocked = () => reject(new Error('本地数据库被其他窗口占用，请关闭其他应用窗口后重试。'));
  });
}
function transact(db, mode, work) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('documents', mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onabort = tx.onerror = () => reject(new Error('本地保存失败，请检查存储空间与浏览器权限。'));
    try { work(tx.objectStore('documents'), value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}
export async function loadState(db) {
  const state = await transact(db, 'readonly', (store, done) => {
    const request = store.get('current');
    request.onsuccess = () => done(request.result);
  });
  return state ? validateState(state) : createState();
}
export function saveState(db, state) {
  validateState(state);
  return transact(db, 'readwrite', store => store.put(state, 'current'));
}
export function replaceState(db, previous, next) {
  validateState(previous); validateState(next);
  return transact(db, 'readwrite', store => {
    store.put({ savedAt: new Date().toISOString(), data: previous }, 'safety');
    store.put(next, 'current');
  });
}
export function readSafety(db) {
  return transact(db, 'readonly', (store, done) => {
    const request = store.get('safety');
    request.onsuccess = () => done(request.result || null);
  });
}

// All tabs coordinate each read-modify-write. Re-read inside the lock to avoid stale writes.
export class Repository {
  constructor(db, state) { this.db = db; this.state = state; this.tail = Promise.resolve(); }
  async run(work) {
    const task = this.tail.catch(() => {}).then(() => navigator.locks.request('zhic-life-write', async () => {
      const current = await loadState(this.db);
      const next = work(current);
      await saveState(this.db, next);
      this.state = next;
      return next;
    }));
    this.tail = task;
    return task;
  }
  async replace(next) {
    const task = this.tail.catch(() => {}).then(() => navigator.locks.request('zhic-life-write', async () => {
      const current = await loadState(this.db);
      await replaceState(this.db, current, next);
      this.state = next;
      return next;
    }));
    this.tail = task;
    return task;
  }
}
