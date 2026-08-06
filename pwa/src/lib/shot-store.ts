// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT ROLL — a small, capped, newest-first store of PNG blobs, kept
// in IndexedDB. Generic React/UI game code: it knows nothing about this game,
// only that something wants to keep a handful of pictures the player took and
// browse them later.
//
// WHY INDEXEDDB AND NOT localStorage. Every other persisted thing in this app
// is a few kilobytes of JSON, so localStorage is the right home for it. A
// screenshot is not: a single 1688x780 PNG of a pixel-art field runs to
// hundreds of kilobytes, and localStorage's whole budget is 5 MB of UTF-16 —
// which base64 inflates by a third before the first shot is even stored. So the
// roll gets the one API in the browser that takes a Blob as a Blob.
//
// IT MUST NEVER BE LOAD-BEARING. A private-mode Safari tab, a browser with
// storage disabled, a quota that filled up mid-write: all of them are ordinary,
// and none of them may stop the game (or even the capture) from working. Every
// entry point here resolves rather than rejects, and a store that could not
// open falls back to an in-memory roll that lives as long as the tab does — the
// player still gets the flash, the viewer and the share sheet, and only loses
// the pictures when they close the game.
//
// THE ROLL IS CAPPED, oldest-out. An uncapped roll is a disk leak with a nice
// UI: nothing in a game ever prompts the player to prune it, so a year of
// pressing the screenshot key would quietly eat a gigabyte of their profile.

/** One picture in the roll, as it is stored and as it is handed back. */
export type Shot = {
  /** Sortable and unique: the capture time, then a counter for the same ms. */
  id: string;
  /** When it was taken (epoch ms) — what the roll is ordered by. */
  takenAt: number;
  /** The picture's own pixel size, so a viewer can lay it out before decoding. */
  width: number;
  height: number;
  /** One line of caller-supplied context (this game writes the venue's name). */
  label: string;
  /** The PNG itself. */
  blob: Blob;
};

/** Everything but the pixels — what a list view needs. */
export type ShotMeta = Omit<Shot, "blob">;

export type ShotStoreOptions = {
  /** The IndexedDB database name — namespace it per game/app. */
  dbName: string;
  /** How many pictures the roll keeps before the oldest falls off. */
  limit: number;
};

const STORE = "shots";

/**
 * The in-memory roll: what the store degrades to when IndexedDB is unavailable,
 * and also the read cache in front of it (the viewer flips between pictures
 * with arrow keys, and a round trip to disk per press would show as a stutter).
 * Ordered NEWEST FIRST, which is the order every reader wants.
 */
let roll: Shot[] = [];
let loaded = false;
let options: ShotStoreOptions = { dbName: "shots", limit: 50 };

type Listener = (shots: readonly ShotMeta[]) => void;
const listeners = new Set<Listener>();

let counter = 0;

/** Name the store. Call once at boot, before anything reads the roll. */
export function configureShotStore(next: ShotStoreOptions): void {
  options = next;
}

/** Open the database, or null where there is none to open. Never throws. */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    let db: IDBFactory | undefined;
    try {
      db = typeof indexedDB === "undefined" ? undefined : indexedDB;
    } catch {
      db = undefined; // some privacy modes throw on the property itself
    }
    if (!db) {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = db.open(options.dbName, 1);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const opened = request.result;
      if (!opened.objectStoreNames.contains(STORE)) {
        opened.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Run `work` inside one transaction and resolve false if anything refuses. */
async function withStore(
  mode: "readonly" | "readwrite",
  work: (store: IDBObjectStore) => void,
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  try {
    return await new Promise<boolean>((resolve) => {
      const tx = db.transaction(STORE, mode);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
      tx.onabort = () => resolve(false);
      work(tx.objectStore(STORE));
    });
  } catch {
    return false;
  } finally {
    db.close();
  }
}

function meta(shots: readonly Shot[]): ShotMeta[] {
  return shots.map(({ id, takenAt, width, height, label }) => ({
    id,
    takenAt,
    width,
    height,
    label,
  }));
}

function announce(): void {
  const snapshot = meta(roll);
  for (const listener of listeners) listener(snapshot);
}

/**
 * Read the roll in, once per session. Resolves to the roll itself, newest
 * first; an unreadable store simply resolves to whatever is in memory.
 */
export async function loadShots(): Promise<readonly ShotMeta[]> {
  if (loaded) return meta(roll);
  loaded = true;
  const db = await openDb();
  if (!db) return meta(roll);
  const stored = await new Promise<Shot[]>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as Shot[]) ?? []);
      request.onerror = () => resolve([]);
      tx.onabort = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
  db.close();
  // Anything captured while the read was in flight is already newer than
  // everything on disk, so the merge is a concat rather than a sort-and-dedupe.
  const held = new Set(roll.map((shot) => shot.id));
  roll = [
    ...roll,
    ...stored.filter((shot) => !held.has(shot.id)).sort(byNewest),
  ];
  announce();
  return meta(roll);
}

function byNewest(a: Shot, b: Shot): number {
  return b.takenAt - a.takenAt;
}

/** Every picture's metadata, newest first. Synchronous — `loadShots` first. */
export function shotList(): readonly ShotMeta[] {
  return meta(roll);
}

/** One picture, pixels included, or null if it is no longer in the roll. */
export function shot(id: string): Shot | null {
  return roll.find((entry) => entry.id === id) ?? null;
}

/** Watch the roll. Returns the unsubscribe. */
export function subscribeShots(listener: Listener): () => void {
  listeners.add(listener);
  listener(meta(roll));
  return () => listeners.delete(listener);
}

/**
 * File a new picture. Returns its metadata immediately — the roll is updated in
 * memory first, so the flash can show the miniature on the very next frame
 * whether or not the write lands.
 */
export function putShot(entry: {
  takenAt: number;
  width: number;
  height: number;
  label: string;
  blob: Blob;
}): ShotMeta {
  counter = (counter + 1) % 1_000_000;
  const id = `${entry.takenAt}-${counter.toString().padStart(6, "0")}`;
  const full: Shot = { id, ...entry };
  roll = [full, ...roll].slice(0, Math.max(1, options.limit));
  const kept = new Set(roll.map((held) => held.id));
  announce();
  void (async () => {
    await withStore("readwrite", (store) => {
      store.put(full);
    });
    // Prune whatever the cap pushed off, on disk as well as in memory. Done
    // after the write so a store that refused the put never deletes anything.
    await withStore("readwrite", (store) => {
      const request = store.getAllKeys();
      request.onsuccess = () => {
        for (const key of request.result) {
          if (typeof key === "string" && !kept.has(key)) store.delete(key);
        }
      };
    });
  })();
  return {
    id,
    takenAt: entry.takenAt,
    width: entry.width,
    height: entry.height,
    label: entry.label,
  };
}

/** Drop one picture. */
export async function deleteShot(id: string): Promise<void> {
  roll = roll.filter((entry) => entry.id !== id);
  announce();
  await withStore("readwrite", (store) => {
    store.delete(id);
  });
}

/** Drop the whole roll. */
export async function clearShots(): Promise<void> {
  roll = [];
  announce();
  await withStore("readwrite", (store) => {
    store.clear();
  });
}

/** Reset the module — tests only; a running app has exactly one roll. */
export function resetShotStore(): void {
  roll = [];
  loaded = false;
  counter = 0;
  listeners.clear();
}
