/**
 * Local IndexedDB store of page content captured by the content script. Shared by the
 * background script (writes) and the history page (reads, deletes): both run on the
 * extension origin, so they open the same database.
 */
export interface PageRecord {
  url: string;
  title: string;
  /** Meta description (or og:description), raw, for display. */
  description: string;
  /** Normalized "title description text" used by the search. */
  search: string;
  updatedAt: number;
}

export interface PageMessage {
  type: 'firehistory:page';
  url: string;
  title: string;
  description: string;
  text: string;
}

const DB_NAME = 'firehistory';
const STORE = 'pages';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'url' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function putPage(record: PageRecord): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(record);
  await done(tx);
}

export async function deletePages(urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return;
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  for (const url of urls) store.delete(url);
  await done(tx);
}

export async function clearPages(): Promise<void> {
  const db = await open();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).clear();
  await done(tx);
}

export async function getAllPages(): Promise<PageRecord[]> {
  const db = await open();
  const tx = db.transaction(STORE, 'readonly');
  const req = tx.objectStore(STORE).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as PageRecord[]);
    req.onerror = () => reject(req.error);
  });
}
