// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A persisted set of string flags ("this scene was watched", "this hint was
// dismissed"): localStorage-backed, tolerant of private mode and corrupt
// JSON, and injectable with any Storage for tests. Generic — any game can
// remember one-shot events with it.

export type FlagStore = {
  has(flag: string): boolean;
  /** Idempotent; persists immediately. */
  add(flag: string): void;
  /** Drop one flag (a spendable token, a re-armable hint). Idempotent. */
  remove(flag: string): void;
  /** Forget everything (a future "reset progress" button). */
  clear(): void;
};

/**
 * Create a flag store persisted under `key`. Pass a Storage for tests; the
 * default resolves lazily so importing this module never throws where
 * localStorage is unavailable (SSR, some private modes) — flags then simply
 * live in memory for the session.
 */
export function createFlagStore(key: string, storage?: Storage): FlagStore {
  const backend = (): Storage | null => {
    if (storage) return storage;
    try {
      return typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      return null;
    }
  };

  const load = (): Set<string> => {
    try {
      const raw = backend()?.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return new Set(
        Array.isArray(parsed)
          ? parsed.filter((f) => typeof f === "string")
          : [],
      );
    } catch {
      return new Set();
    }
  };

  const flags = load();
  const persist = () => {
    try {
      backend()?.setItem(key, JSON.stringify([...flags]));
    } catch {
      // Storage unavailable — flags stay in-memory for this session.
    }
  };

  return {
    has: (flag) => flags.has(flag),
    add(flag) {
      if (flags.has(flag)) return;
      flags.add(flag);
      persist();
    },
    remove(flag) {
      if (!flags.delete(flag)) return;
      persist();
    },
    clear() {
      flags.clear();
      persist();
    },
  };
}
