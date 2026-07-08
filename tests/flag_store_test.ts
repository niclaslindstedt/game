// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The persisted flag set (@ui/lib/flag-store) behind "the prelude plays
// once": flags survive a reload (a fresh store over the same backend),
// corrupt or foreign JSON degrades to empty, and a missing Storage keeps
// flags in memory instead of throwing.

import { describe, expect, it } from "vitest";

import { createFlagStore } from "@ui/lib/flag-store.ts";

/** A minimal in-memory Storage double (plain Node has no localStorage). */
function memoryStorage(seed: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  };
}

describe("flag store", () => {
  it("remembers added flags and stays idempotent", () => {
    const store = createFlagStore("test:flags", memoryStorage());
    expect(store.has("prelude")).toBe(false);
    store.add("prelude");
    store.add("prelude");
    expect(store.has("prelude")).toBe(true);
    expect(store.has("other")).toBe(false);
  });

  it("persists across store instances on the same backend (a reload)", () => {
    const backend = memoryStorage();
    createFlagStore("test:flags", backend).add("prelude");
    const reloaded = createFlagStore("test:flags", backend);
    expect(reloaded.has("prelude")).toBe(true);
  });

  it("keeps stores with different keys separate", () => {
    const backend = memoryStorage();
    createFlagStore("test:a", backend).add("prelude");
    expect(createFlagStore("test:b", backend).has("prelude")).toBe(false);
  });

  it("degrades corrupt or foreign JSON to an empty set", () => {
    for (const raw of ["not json{", '{"an":"object"}', "[1,2,3]", '"str"']) {
      const store = createFlagStore(
        "test:flags",
        memoryStorage({ "test:flags": raw }),
      );
      expect(store.has("prelude")).toBe(false);
      // …and writing over the bad value works.
      store.add("prelude");
      expect(store.has("prelude")).toBe(true);
    }
    // Non-string entries are dropped, string entries survive.
    const mixed = createFlagStore(
      "test:flags",
      memoryStorage({ "test:flags": '["prelude", 7, null]' }),
    );
    expect(mixed.has("prelude")).toBe(true);
    expect(mixed.has("7")).toBe(false);
  });

  it("remove() drops one flag, persistently and idempotently", () => {
    const backend = memoryStorage();
    const store = createFlagStore("test:flags", backend);
    store.add("token-a");
    store.add("token-b");
    store.remove("token-a");
    store.remove("token-a"); // spending twice is a no-op
    expect(store.has("token-a")).toBe(false);
    expect(store.has("token-b")).toBe(true);
    const reloaded = createFlagStore("test:flags", backend);
    expect(reloaded.has("token-a")).toBe(false);
    expect(reloaded.has("token-b")).toBe(true);
  });

  it("clear() forgets everything, persistently", () => {
    const backend = memoryStorage();
    const store = createFlagStore("test:flags", backend);
    store.add("prelude");
    store.clear();
    expect(store.has("prelude")).toBe(false);
    expect(createFlagStore("test:flags", backend).has("prelude")).toBe(false);
  });

  it("works without any Storage at all (in-memory for the session)", () => {
    // Plain Node: no window, no localStorage — nothing to persist into.
    const store = createFlagStore("test:flags");
    expect(store.has("prelude")).toBe(false);
    store.add("prelude");
    expect(store.has("prelude")).toBe(true);
  });

  it("survives a backend that throws on write (private mode)", () => {
    const backend = memoryStorage();
    backend.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    const store = createFlagStore("test:flags", backend);
    store.add("prelude");
    expect(store.has("prelude")).toBe(true); // in-memory despite the throw
  });
});
