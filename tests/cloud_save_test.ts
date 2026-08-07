// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// CLOUD SAVE's merge rules, and the money safety that hangs off them: a paid
// coin pack bought on one device is banked on the other and NEVER credited
// twice; a hero played on one device wins over a stale copy on the other, hero
// by hero; a deleted hero stays deleted instead of walking back in from the
// cloud; and the whole merge is commutative and idempotent, so it can run on
// both devices, in either order, as many times as it likes.
// See pwa/src/game/cloud-save.ts and pwa/src/game/store.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Loadout } from "@game/core";
import { canonicalJson } from "../pwa/src/lib/canonical-json.ts";
import { resetDeviceIdCache } from "../pwa/src/lib/device-id.ts";
import {
  createCharacter,
  deleteCharacter,
  loadCharacters,
  recordVictory,
  type Character,
} from "../pwa/src/game/characters.ts";
import {
  CLOUD_FORMAT,
  CLOUD_VERSION,
  applySave,
  isFutureSave,
  localSnapshot,
  mergeSaves,
  parseCloudSave,
  syncNow,
  type CloudSave,
} from "../pwa/src/game/cloud-save.ts";
import {
  bankBalance,
  bankBalanceOf,
  coinLedger,
  creditPurchase,
  mergeCoinLedgers,
  sendCoins,
  setCoinLedger,
  type CoinLedger,
} from "../pwa/src/game/store.ts";

/** The localStorage namespace every key sits under (game.config.json). */
const PREFIX = "adas-trail";

// One device's localStorage. Swapping the map (and clearing the memoized
// device id) is how these tests "pick up the other phone".
let stored = new Map<string, string>();

type FakeCloud = { data: string | null; reads: number; writes: number };
let cloud: FakeCloud;

/** Stub the browser globals the sync engine touches, standing in for one
 * device — calling it again is how these tests pick up the other phone.
 * `native` also installs a fake native shell whose cloud is `cloud`. */
function asDevice(map: Map<string, string>, native: boolean): void {
  stored = map;
  resetDeviceIdCache();
  const win: Record<string, unknown> = {
    localStorage: {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    },
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  };
  if (native) {
    win.__GIS_NATIVE__ = true;
    // The native half (native/src/cloud-save.ts), in miniature: it answers the
    // four messages and keeps the blob in `cloud`.
    win.ReactNativeWebView = {
      postMessage: (raw: string) => {
        const message = JSON.parse(raw) as Record<string, unknown>;
        if (message.__gisCloud !== true) return;
        const emit = (event: Record<string, unknown>) =>
          (
            globalThis.window as unknown as Record<string, unknown> & {
              __gisCloudEvent?: (event: unknown) => void;
            }
          ).__gisCloudEvent?.(event);
        const requestId = message.requestId as number;
        queueMicrotask(() => {
          if (message.action === "status") {
            emit({
              event: "status",
              requestId,
              ok: true,
              available: true,
              provider: "icloud",
              player: { id: "gc-1", name: "NIC" },
            });
          } else if (message.action === "load") {
            cloud.reads += 1;
            emit({ event: "load", requestId, ok: true, data: cloud.data });
          } else if (message.action === "save") {
            cloud.writes += 1;
            cloud.data = message.data as string;
            emit({ event: "save", requestId, ok: true });
          }
        });
      },
    };
  }
  vi.stubGlobal("window", win);
}

beforeEach(() => {
  cloud = { data: null, reads: 0, writes: 0 };
  asDevice(new Map(), false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetDeviceIdCache();
});

function sampleLoadout(coins: number, level = 3): Loadout {
  return {
    level,
    xp: 100,
    stats: { power: 1, agility: 1, vitality: 1, focus: 1 },
    equipment: {
      weapon: {
        id: 0,
        defId: "fists",
        slot: "weapon",
        tier: "regular",
        ilvl: 1,
        affixes: [],
      },
      head: null,
      chest: null,
      legs: null,
      feet: null,
      charm: null,
      bag: null,
    },
    inventory: [],
    heldAbilities: [],
    coins,
    companions: [],
  } as unknown as Loadout;
}

function hero(
  id: string,
  updatedAt: number,
  over: Partial<Character> = {},
): Character {
  return {
    id,
    name: id.toUpperCase(),
    hardcore: false,
    createdAt: 1,
    dead: false,
    loadout: null,
    clears: [],
    beaten: [],
    storySeen: [],
    merchantsMet: [],
    updatedAt,
    ...over,
  };
}

function save(over: Partial<CloudSave> = {}): CloudSave {
  return {
    format: CLOUD_FORMAT,
    version: CLOUD_VERSION,
    writtenAt: 100,
    writtenBy: "device-a",
    characters: [],
    tombstones: {},
    coins: { counters: {}, seen: {} },
    scores: {},
    driveScores: [],
    ...over,
  };
}

describe("coin ledger merge (real money)", () => {
  it("banks purchases made on either device, and debits either device's sends", () => {
    const phone: CoinLedger = {
      counters: { phone: { credited: 10_000_000, sent: 4_000_000 } },
      seen: { "txn-phone": 1 },
    };
    const pad: CoinLedger = {
      counters: { pad: { credited: 1_000_000, sent: 0 } },
      seen: { "txn-pad": 1 },
    };
    const merged = mergeCoinLedgers(phone, pad);
    // 10M + 1M bought, 4M already handed to a hero.
    expect(bankBalanceOf(merged)).toBe(7_000_000);
    expect(Object.keys(merged.seen).sort()).toEqual(["txn-pad", "txn-phone"]);
  });

  it("is commutative and idempotent — merging twice, either way, is the same", () => {
    const a: CoinLedger = {
      counters: { a: { credited: 7, sent: 2 }, b: { credited: 1, sent: 0 } },
      seen: { k1: 1 },
    };
    const b: CoinLedger = {
      counters: { b: { credited: 5, sent: 1 } },
      seen: { k2: 1 },
    };
    const ab = mergeCoinLedgers(a, b);
    const ba = mergeCoinLedgers(b, a);
    expect(bankBalanceOf(ab)).toBe(bankBalanceOf(ba));
    expect(bankBalanceOf(mergeCoinLedgers(ab, ab))).toBe(bankBalanceOf(ab));
    expect(bankBalanceOf(ab)).toBe(7 + 5 - 2 - 1);
  });

  it("takes the higher of two copies of the SAME device's row", () => {
    // The cloud holds an older snapshot of this very device (it synced before
    // the last two purchases): the newer, larger counter must win.
    const stale: CoinLedger = {
      counters: { me: { credited: 1, sent: 0 } },
      seen: {},
    };
    const fresh: CoinLedger = {
      counters: { me: { credited: 9, sent: 3 } },
      seen: {},
    };
    expect(bankBalanceOf(mergeCoinLedgers(stale, fresh))).toBe(6);
  });

  it("never lets a merge take the bank negative", () => {
    // Both devices distributed the same coins while offline. Over-giving
    // favors the player; a negative bank would not.
    const a: CoinLedger = {
      counters: { a: { credited: 10, sent: 10 } },
      seen: {},
    };
    const b: CoinLedger = {
      counters: { b: { credited: 0, sent: 10 } },
      seen: {},
    };
    expect(bankBalanceOf(mergeCoinLedgers(a, b))).toBe(0);
  });

  it("credits a pack bought on the other device exactly once", () => {
    // This device buys one pack...
    expect(creditPurchase("coins_1m", "txn-here")).toBe(true);
    expect(bankBalance()).toBe(1_000_000);

    // ...and the cloud brings back a pack bought on the OTHER device.
    setCoinLedger(
      mergeCoinLedgers(coinLedger(), {
        counters: { other: { credited: 10_000_000, sent: 0 } },
        seen: { "txn-there": 1 },
      }),
    );
    expect(bankBalance()).toBe(11_000_000);

    // The store redelivers that same transaction here (an app restored from a
    // backup replays unfinished purchases): it is acked, never re-credited.
    expect(creditPurchase("coins_10m", "txn-there")).toBe(true);
    expect(bankBalance()).toBe(11_000_000);
  });

  it("carries a pre-cloud bank across the migration untouched", () => {
    // A device that banked coins before the counters existed.
    stored.set(`${PREFIX}:store-bank`, "5000000");
    stored.set(`${PREFIX}:store-ledger`, JSON.stringify(["old-txn"]));

    expect(bankBalance()).toBe(5_000_000);
    // The old transaction key still dedupes after the migration.
    expect(creditPurchase("coins_1m", "old-txn")).toBe(true);
    expect(bankBalance()).toBe(5_000_000);
    // And the migrated balance survives a merge with an empty cloud.
    setCoinLedger(mergeCoinLedgers(coinLedger(), { counters: {}, seen: {} }));
    expect(bankBalance()).toBe(5_000_000);
  });
});

describe("roster merge", () => {
  it("keeps heroes only one device knows about", () => {
    const merged = mergeSaves(
      save({ characters: [hero("a", 10)] }),
      save({ characters: [hero("b", 20)] }),
    );
    expect(merged.characters.map((c) => c.id).sort()).toEqual(["a", "b"]);
  });

  it("keeps the more recently played copy of the same hero", () => {
    const stale = hero("a", 10, { clears: ["easy:landing"] });
    const fresh = hero("a", 20, {
      clears: ["easy:landing", "easy:boot_hill"],
      loadout: sampleLoadout(500, 12),
    });
    for (const [x, y] of [
      [stale, fresh],
      [fresh, stale],
    ] as const) {
      const merged = mergeSaves(
        save({ characters: [x] }),
        save({ characters: [y] }),
      );
      expect(merged.characters).toHaveLength(1);
      expect(merged.characters[0]?.clears).toHaveLength(2);
      expect(merged.characters[0]?.loadout?.level).toBe(12);
    }
  });

  it("breaks a stamp tie on progress rather than on order", () => {
    const thin = hero("a", 10);
    const thick = hero("a", 10, { clears: ["easy:landing"] });
    expect(
      mergeSaves(save({ characters: [thin] }), save({ characters: [thick] }))
        .characters[0]?.clears,
    ).toHaveLength(1);
    expect(
      mergeSaves(save({ characters: [thick] }), save({ characters: [thin] }))
        .characters[0]?.clears,
    ).toHaveLength(1);
  });

  it("keeps a deleted hero deleted", () => {
    const merged = mergeSaves(
      save({ tombstones: { a: 50 } }),
      save({ characters: [hero("a", 10)] }),
    );
    expect(merged.characters).toEqual([]);
    expect(merged.tombstones).toEqual({ a: 50 });
  });

  it("lets a hero played AFTER the deletion survive it", () => {
    // Deleted on the iPad at t=50, then played on the phone at t=80: the
    // player clearly still wants them.
    const merged = mergeSaves(
      save({ tombstones: { a: 50 } }),
      save({ characters: [hero("a", 80)] }),
    );
    expect(merged.characters.map((c) => c.id)).toEqual(["a"]);
  });

  it("is idempotent — re-merging its own output changes nothing", () => {
    const a = save({
      characters: [hero("a", 10), hero("b", 30)],
      tombstones: { c: 5 },
      coins: { counters: { a: { credited: 5, sent: 1 } }, seen: { k: 1 } },
    });
    const b = save({
      characters: [hero("a", 20)],
      coins: { counters: { b: { credited: 2, sent: 0 } }, seen: { j: 1 } },
    });
    const once = mergeSaves(a, b);
    const twice = mergeSaves(once, b);
    expect(content(twice)).toEqual(content(once));
  });
});

describe("payload parsing", () => {
  it("reads back what it wrote", () => {
    const written = save({ characters: [hero("a", 10)] });
    const read = parseCloudSave(JSON.stringify(written));
    expect(read?.characters.map((c) => c.id)).toEqual(["a"]);
  });

  it("ignores an empty cloud, junk, and a foreign format", () => {
    expect(parseCloudSave(null)).toBeNull();
    expect(parseCloudSave("")).toBeNull();
    expect(parseCloudSave("{not json")).toBeNull();
    expect(
      parseCloudSave(JSON.stringify({ format: "someone-else" })),
    ).toBeNull();
  });

  it("refuses to touch a save written by a NEWER build", () => {
    const future = JSON.stringify(
      save({ version: CLOUD_VERSION + 1, characters: [hero("a", 10)] }),
    );
    expect(isFutureSave(future)).toBe(true);
    expect(parseCloudSave(future)).toBeNull();
  });
});

describe("updatedAt stamping", () => {
  it("stamps only the hero a save actually changed", () => {
    const ada = createCharacter("ADA", false);
    const bob = createCharacter("BOB", false);
    const before = loadCharacters();
    const bobStamp = before.find((c) => c.id === bob.id)?.updatedAt ?? 0;
    expect(bobStamp).toBeGreaterThan(0);

    // Banking ADA's victory rewrites the WHOLE roster to storage; BOB must not
    // look freshly edited afterwards, or this device would win a merge with
    // data it never touched.
    recordVictory(
      before.find((c) => c.id === ada.id)!,
      "landing",
      "easy",
      sampleLoadout(10),
    );

    const after = loadCharacters();
    expect(after.find((c) => c.id === bob.id)?.updatedAt).toBe(bobStamp);
    expect(
      after.find((c) => c.id === ada.id)?.updatedAt,
    ).toBeGreaterThanOrEqual(bobStamp);
  });

  it("tombstones a deleted hero", () => {
    const ada = createCharacter("ADA", false);
    deleteCharacter(ada.id);
    expect(localSnapshot().tombstones[ada.id]).toBeGreaterThan(0);
  });
});

describe("a full sync between two devices", () => {
  it("carries heroes and paid coins from one device to the other", async () => {
    // --- The phone: a hero and a purchased pack, then a sync.
    const phone = new Map<string, string>();
    asDevice(phone, true);
    const ada = createCharacter("ADA", false);
    recordVictory(
      loadCharacters().find((c) => c.id === ada.id)!,
      "landing",
      "easy",
      sampleLoadout(0),
    );
    creditPurchase("coins_100m", "txn-phone");
    expect(await syncNow()).toMatchObject({ ok: true, pushed: true });
    expect(cloud.data).not.toBeNull();

    // --- The iPad: nothing of its own. One sync and it has both.
    const pad = new Map<string, string>();
    asDevice(pad, true);
    expect(loadCharacters()).toEqual([]);
    expect(await syncNow()).toMatchObject({ ok: true, pulled: true });
    expect(loadCharacters().map((c) => c.name)).toEqual(["ADA"]);
    expect(bankBalance()).toBe(100_000_000);

    // The iPad buys another pack and hands some coins to the hero.
    creditPurchase("coins_1b", "txn-pad");
    expect(sendCoins(loadCharacters()[0]!.id, 500_000_000)).toBe(500_000_000);
    await syncNow();

    // --- Back on the phone: both purchases are banked, the distribution is
    // debited exactly once, and the hero carries the coins the iPad gave them.
    asDevice(phone, true);
    await syncNow();
    expect(bankBalance()).toBe(600_000_000);
    expect(loadCharacters()[0]?.loadout?.coins).toBe(500_000_000);
  });

  it("settles instead of ping-ponging the same save between devices", async () => {
    // Each device has its own hero and its own purchase, so both sides carry
    // something the other lacks — the case where a merge that wasn't order- and
    // key-stable would have each device rewriting the other's save forever.
    const phone = new Map<string, string>();
    asDevice(phone, true);
    createCharacter("ADA", false);
    creditPurchase("coins_1m", "txn-phone");
    await syncNow();

    const pad = new Map<string, string>();
    asDevice(pad, true);
    createCharacter("BOB", false);
    creditPurchase("coins_10m", "txn-pad");
    await syncNow();

    // Round-trip until both devices agree, then confirm nobody writes again.
    asDevice(phone, true);
    await syncNow();
    asDevice(pad, true);
    await syncNow();

    const settled = cloud.writes;
    for (const device of [phone, pad, phone, pad]) {
      asDevice(device, true);
      expect(await syncNow()).toMatchObject({ ok: true, pushed: false });
    }
    expect(cloud.writes).toBe(settled);
    // ...and both hold the same two heroes and the same bank.
    for (const device of [phone, pad]) {
      asDevice(device, true);
      expect(
        loadCharacters()
          .map((c) => c.name)
          .sort(),
      ).toEqual(["ADA", "BOB"]);
      expect(bankBalance()).toBe(11_000_000);
    }
  });

  it("writes nothing when neither side has changed", async () => {
    asDevice(new Map(), true);
    createCharacter("ADA", false);
    await syncNow();
    const writes = cloud.writes;
    expect(await syncNow()).toMatchObject({ ok: true, pushed: false });
    expect(cloud.writes).toBe(writes);
  });

  it("does nothing at all outside the native shell", async () => {
    asDevice(new Map(), false); // a browser: no bridge
    expect(await syncNow()).toEqual({ ok: false, reason: "unavailable" });
    expect(cloud.data).toBeNull();
  });
});

describe("applying a merged save", () => {
  it("installs the merged roster without restamping it", () => {
    const merged = save({ characters: [hero("a", 4242)] });
    applySave(merged);
    expect(loadCharacters()[0]?.updatedAt).toBe(4242);
  });
});

/** A payload's comparable content (provenance neutralized). */
function content(payload: CloudSave): string {
  return canonicalJson({ ...payload, writtenAt: 0, writtenBy: "" });
}
