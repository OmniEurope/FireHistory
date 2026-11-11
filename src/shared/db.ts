/**
 * Local IndexedDB store shared by the background script and the history page (both run on the
 * extension origin, so they open the same database):
 * - `pages`: page content captured by the content script (written by the background script).
 * - `visits`: per-URL visit times fetched with `history.getVisits`, kept between two openings of
 *   the history page so the "every visit" view does not refetch the whole history each time.
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

/**
 * Visits of one URL. `lastVisitTime` and `visitCount` are the history item's values when the
 * visits were fetched: a record is valid only while both still match (a new or removed visit
 * changes at least one of them).
 */
export interface VisitRecord {
  url: string;
  lastVisitTime: number;
  visitCount: number;
  ids: string[];
  times: number[];
}

const DB_NAME = 'firehistory';
const DB_VERSION = 2;
const PAGES = 'pages';
const VISITS = 'visits';
let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PAGES)) db.createObjectStore(PAGES, { keyPath: 'url' });
      if (!db.objectStoreNames.contains(VISITS)) db.createObjectStore(VISITS, { keyPath: 'url' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another context upgrading the schema must not stay blocked by this connection.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
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

async function getAll<T>(store: string): Promise<T[]> {
  const db = await open();
  const req = db.transaction(store, 'readonly').objectStore(store).getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

async function putAll(store: string, records: readonly unknown[]): Promise<void> {
  if (records.length === 0) return;
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  const os = tx.objectStore(store);
  for (const r of records) os.put(r);
  await done(tx);
}

async function deleteKeys(stores: readonly string[], urls: readonly string[]): Promise<void> {
  if (urls.length === 0) return;
  const db = await open();
  const tx = db.transaction([...stores], 'readwrite');
  for (const s of stores) {
    const os = tx.objectStore(s);
    for (const url of urls) os.delete(url);
  }
  await done(tx);
}

async function clearStore(store: string): Promise<void> {
  const db = await open();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).clear();
  await done(tx);
}

export const putPage = (record: PageRecord) => putAll(PAGES, [record]);
export const getAllPages = () => getAll<PageRecord>(PAGES);
export const clearPages = () => clearStore(PAGES);

export const getAllVisits = () => getAll<VisitRecord>(VISITS);
export const putVisits = (records: readonly VisitRecord[]) => putAll(VISITS, records);
export const clearVisits = () => clearStore(VISITS);

/** Removes both the indexed content and the cached visits of these URLs. */
export const deletePages = (urls: readonly string[]) => deleteKeys([PAGES, VISITS], urls);
