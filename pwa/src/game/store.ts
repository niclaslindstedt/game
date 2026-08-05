// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE — the game's one real-money surface: coin packs that fund
// the AUTO PILOT (src/game/autopilot.ts drains the purse per simulated
// second; more coins = longer unattended flying). Native app builds only —
// purchases run through the platform store via the WebView bridge
// (../app/store-bridge.ts); in a browser/PWA the store simply doesn't exist.
//
// Money-safety rules, in order:
//   1. A paid pack is NEVER lost. The native side holds every paid
//      transaction unfinished until the credit is persisted here (the bridge
//      "finish" ack), and redelivers it on the next launch if the app died
//      mid-flow.
//   2. A pack is never credited TWICE. Redelivery makes duplicates normal,
//      so every credited transaction's key lands in a persisted ledger and a
//      re-seen key is acked without a second credit.
//   3. The player distributes. A purchase lands in the device-wide COIN BANK
//      (the "undistributed" pool); the STORE's DISTRIBUTE flow then moves
//      any amount to any hero, whenever — the remainder just stays banked.
//      Nothing is ever assigned, nudged, or expired on the player's behalf.
//      A buy made from INSIDE a run (`buyCoinPackForHero`, the AUTO PILOT
//      picker's STORE button) still banks first and then sends — the player
//      named the recipient by buying while flying that hero.
//   4. A paid pack survives the DEVICE. The bank is not a stored number but a
//      set of per-device COUNTERS (see `CoinLedger`) that merge without a
//      conflict, so CLOUD SAVE (cloud-save.ts) can carry real money onto the
//      player's other phone without a merge ever being able to lose it.
//
// FREE MODE — until a real payment product exists, most builds don't charge:
// the native shell only requires payment when built with
// EXPO_PUBLIC_STORE_PAYMENTS=required (the production EAS profile — see
// native/src/store-purchases.ts and native/eas.json), so dev/preview/TestFlight
// builds grant packs for free and price-tag them "FREE". On top of that the
// DEVELOPER menu's FORCE STORE switch (`storeForce` in settings.ts, applied
// here via `setStoreForced`) surfaces the store in ANY build — browser and
// PWA included — where purchases skip the bridge entirely and are granted
// free. Same bank, same ledger, no money involved.

import { getDeviceId } from "@ui/lib/device-id.ts";

import { storeAllowed } from "../app/device-policy.ts";
import { storageKey } from "../identity.ts";
import {
  fetchStoreQuotes,
  initStoreBridge,
  purchaseSku,
  storeBridgeAvailable,
  type PurchaseFailure,
  type PurchaseResult,
} from "../app/store-bridge.ts";
import { creditCoins } from "./characters.ts";

/** One purchasable coin pack. `sku` is the store product id — it must exist
 * with these prices in App Store Connect / Play Console (see native/README.md).
 * `price` is the shipped USD tag, shown until the platform store answers
 * with a localized quote. */
export type CoinPack = {
  sku: string;
  coins: number;
  /** The label's quantity word — "1 MILLION" reads better than "1000000". */
  amount: string;
  price: string;
};

/** The whole catalog — coins only, priced steeply sublinear so the big packs
 * are the sensible ones. */
export const COIN_PACKS: readonly CoinPack[] = [
  { sku: "coins_1m", coins: 1_000_000, amount: "1 MILLION", price: "$1" },
  { sku: "coins_10m", coins: 10_000_000, amount: "10 MILLION", price: "$2" },
  {
    sku: "coins_100m",
    coins: 100_000_000,
    amount: "100 MILLION",
    price: "$10",
  },
  { sku: "coins_1b", coins: 1_000_000_000, amount: "1 BILLION", price: "$20" },
  {
    sku: "coins_10b",
    coins: 10_000_000_000,
    amount: "10 BILLION",
    price: "$100",
  },
];

/** The coin ledger: the bank's whole state, and the only thing CLOUD SAVE
 * carries for money (rule 4). */
const COINS_KEY = storageKey("store-coins");

/** The pre-cloud keys, read once to migrate a device that banked coins before
 * the counters existed (see `readLedger`). */
const LEGACY_LEDGER_KEY = storageKey("store-ledger");
const LEGACY_BANK_KEY = storageKey("store-bank");

/** How many credited transaction keys to remember — the double-credit guard
 * (rule 2). Bounded so a lifetime of purchases can't grow it unbounded; the
 * oldest fall off, and the store only ever redelivers a RECENT unfinished
 * transaction. */
const SEEN_CAP = 400;

/** This device's id inside the ledger's counter set. */
const DEVICE_KEY = storageKey("device-id");

/**
 * ONE device's lifetime coin totals. Both are MONOTONIC — they only ever grow —
 * which is what makes the bank mergeable: two copies of the same device's row
 * merge to the larger of each counter, and a device only ever writes its OWN
 * row. (A grow-only counter set: the standard CRDT for a shared balance.)
 */
export type CoinRow = {
  /** Coins ever credited on this device — purchases (and free grants). */
  credited: number;
  /** Coins ever handed to a hero from this device's DISTRIBUTE flow. */
  sent: number;
};

/**
 * The whole bank: one row per device that ever touched it, plus `seen` — the
 * credited transaction keys mapped to WHEN they were credited (rule 2's dedupe
 * set, unioned across devices so a purchase redelivered after a cloud restore
 * is still caught).
 *
 * The undistributed balance is DERIVED — `Σ credited − Σ sent` over every row —
 * so no merge ever has to pick a winner for a number that represents money.
 *
 * `seen` is a MAP rather than a list because a merge has to be deterministic:
 * two devices unioning the same keys in their own arrival order would produce
 * two orderings of the same set, read each other's copy as a change, and write
 * it back at each other forever. Keyed by the transaction, aged by its value,
 * there is no order to disagree about — and the cap can still drop the oldest.
 */
export type CoinLedger = {
  counters: Record<string, CoinRow>;
  seen: Record<string, number>;
};

/** The DISTRIBUTE slider's tick — amounts move in whole millions. */
export const SEND_TICK = 1_000_000;

/** localStorage.getItem, defended (private mode / no storage). */
function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = readRaw(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable — the in-memory flow still completes; the native
    // side's redelivery covers a lost ledger with at worst a re-credit ack.
  }
}

/** A finite, non-negative whole number, or 0. */
function whole(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

/** This device's row key in the ledger. */
function deviceId(): string {
  return getDeviceId(DEVICE_KEY);
}

/** Defend a stored/received ledger into the shape the rest of this file
 * assumes — a hand-edited file or a payload from a newer build can carry
 * anything. */
export function normalizeLedger(value: unknown): CoinLedger {
  const raw = (value ?? {}) as Partial<CoinLedger>;
  const counters: Record<string, CoinRow> = {};
  for (const [id, row] of Object.entries(raw.counters ?? {})) {
    if (!id || !row || typeof row !== "object") continue;
    counters[id] = {
      credited: whole((row as CoinRow).credited),
      sent: whole((row as CoinRow).sent),
    };
  }
  const seen: Record<string, number> = {};
  for (const [key, at] of Object.entries(raw.seen ?? {})) {
    if (key) seen[key] = whole(at);
  }
  return { counters, seen: trimSeen(seen) };
}

/** Keep the newest `SEEN_CAP` transaction keys. Deterministic (age, then key),
 * so every device caps an identical set identically. */
function trimSeen(seen: Record<string, number>): Record<string, number> {
  const entries = Object.entries(seen);
  if (entries.length <= SEEN_CAP) return seen;
  return Object.fromEntries(
    entries
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, SEEN_CAP),
  );
}

/**
 * The ledger as stored. A device that banked coins BEFORE the counters existed
 * is migrated on first read: its old balance becomes its own row's `credited`
 * (the old number was already `credited − sent`, so starting `sent` at zero
 * keeps the balance identical), and its old key list carries over — aged to 0,
 * the oldest there is — so a redelivered purchase from before the migration
 * still dedupes.
 */
function readLedger(): CoinLedger {
  if (readRaw(COINS_KEY) !== null) {
    return normalizeLedger(readJson<unknown>(COINS_KEY, {}));
  }
  const legacyBank = whole(readJson<unknown>(LEGACY_BANK_KEY, 0));
  const legacyKeys = readJson<string[]>(LEGACY_LEDGER_KEY, []);
  const seen: Record<string, number> = {};
  if (Array.isArray(legacyKeys)) {
    for (const key of legacyKeys.slice(-SEEN_CAP)) {
      if (typeof key === "string") seen[key] = 0;
    }
  }
  const migrated: CoinLedger = {
    counters:
      legacyBank > 0 ? { [deviceId()]: { credited: legacyBank, sent: 0 } } : {},
    seen,
  };
  if (legacyBank > 0 || Object.keys(seen).length > 0) writeLedger(migrated);
  return migrated;
}

function writeLedger(ledger: CoinLedger): void {
  writeJson(COINS_KEY, ledger);
}

/** The ledger, for CLOUD SAVE to carry (cloud-save.ts). */
export function coinLedger(): CoinLedger {
  return readLedger();
}

/** Install a merged ledger (cloud-save.ts, after a pull). */
export function setCoinLedger(ledger: CoinLedger): void {
  writeLedger(normalizeLedger(ledger));
}

/**
 * Merge two ledgers. Every device's row is grow-only, so the merge is the
 * per-device MAXIMUM of each counter — no ordering, no clock, no winner to
 * pick, and running it twice changes nothing. A purchase made on either phone
 * is therefore in the bank on both, and a distribution made on either is
 * debited on both. Transaction keys are unioned, each keeping the EARLIEST
 * time either device saw it (newest kept when capped).
 */
export function mergeCoinLedgers(a: CoinLedger, b: CoinLedger): CoinLedger {
  const left = normalizeLedger(a);
  const right = normalizeLedger(b);
  const counters: Record<string, CoinRow> = {};
  for (const id of new Set([
    ...Object.keys(left.counters),
    ...Object.keys(right.counters),
  ])) {
    const l = left.counters[id] ?? { credited: 0, sent: 0 };
    const r = right.counters[id] ?? { credited: 0, sent: 0 };
    counters[id] = {
      credited: Math.max(l.credited, r.credited),
      sent: Math.max(l.sent, r.sent),
    };
  }
  const seen: Record<string, number> = { ...left.seen };
  for (const [key, at] of Object.entries(right.seen)) {
    const held = seen[key];
    seen[key] = held === undefined ? at : Math.min(held, at);
  }
  return { counters, seen: trimSeen(seen) };
}

// The DEVELOPER → CHEATS → FORCE STORE switch, applied by settings.ts on load and on
// every update (the same pattern as the audio/haptics/auto-stat flags).
let storeForced = false;

/** Apply the FORCE STORE developer flag: surface the store in this build
 * even without the native shell, with purchases granted free. */
export function setStoreForced(on: boolean): void {
  storeForced = on;
}

/** True where the STORE menu should exist at all: the native shell, or any
 * build with the FORCE STORE developer flag on — and only while the DEVICE
 * allows a store at all.
 *
 * The device switch (SETTINGS → <app> → COIN STORE on iOS, see
 * app/device-policy.ts) is a VETO, checked last and outranking even the
 * developer's FORCE STORE: it exists so a parent can hand over a phone that
 * cannot spend money, and a flag inside the game is not entitled to overrule
 * that. Coins already banked stay spendable — the switch removes the way IN to
 * the store, never anything the player already owns. */
export function coinStoreAvailable(): boolean {
  if (!storeAllowed()) return false;
  return storeBridgeAvailable() || storeForced;
}

/** A unique transaction key for a free (unpaid) grant, so the ledger treats
 * it like any other purchase. */
function freeKey(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `free-${crypto.randomUUID()}`;
    }
  } catch {
    // fall through to the manual key
  }
  return `free-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

/** Localized price tags keyed by sku, or null (UI falls back to `price`).
 * A FORCED store without the native shell has no store to quote — every
 * pack is granted free, and the tags say so. */
export async function fetchCoinPrices(): Promise<Record<
  string,
  string
> | null> {
  if (!storeBridgeAvailable()) {
    if (!storeForced) return null;
    return Object.fromEntries(COIN_PACKS.map((p) => [p.sku, "FREE"]));
  }
  const quotes = await fetchStoreQuotes(COIN_PACKS.map((p) => p.sku));
  if (!quotes) return null;
  const bySku: Record<string, string> = {};
  for (const quote of quotes) bySku[quote.sku] = quote.price;
  return bySku;
}

/** The undistributed pool's balance, derived from the ledger: everything ever
 * credited on any of the player's devices, less everything ever distributed
 * from them. Floored at zero — two devices distributing the same coins while
 * offline can only ever over-give, never leave a negative bank (rule 1: the
 * failure mode favors the player). */
export function bankBalanceOf(ledger: CoinLedger): number {
  let credited = 0;
  let sent = 0;
  for (const row of Object.values(ledger.counters)) {
    credited += row.credited;
    sent += row.sent;
  }
  return Math.max(0, credited - sent);
}

/** The undistributed pool's current balance. */
export function bankBalance(): number {
  return bankBalanceOf(readLedger());
}

/** The bridge's credit hook: bank a paid transaction's coins exactly once
 * (into the undistributed pool — the player hands them out from there).
 * Returns true only once the credit is persisted (or already was), which
 * releases the native side to consume the transaction. Exported for the
 * tests — the app reaches it only through `initCoinStore`. */
export function creditPurchase(sku: string, purchaseKey: string): boolean {
  const pack = COIN_PACKS.find((p) => p.sku === sku);
  // Not a sku this build knows — leave it unfinished rather than consume
  // something we can't honor (a newer build will know it).
  if (!pack) return false;
  const ledger = readLedger();
  // Redelivered (or already carried in from another device) — ack, don't pay.
  if (purchaseKey in ledger.seen) return true;
  const id = deviceId();
  const row = ledger.counters[id] ?? { credited: 0, sent: 0 };
  writeLedger({
    counters: {
      ...ledger.counters,
      [id]: { ...row, credited: row.credited + pack.coins },
    },
    seen: trimSeen({ ...ledger.seen, [purchaseKey]: Date.now() }),
  });
  return true;
}

/**
 * DISTRIBUTE: move `amount` coins from the undistributed pool onto one
 * chosen hero (clamped to what the bank holds). The hero is credited FIRST,
 * then the bank is debited — if anything goes wrong in between, the failure
 * mode favors the player, never a lost credit. Returns the amount actually
 * sent (0 when nothing could move).
 */
export function sendCoins(characterId: string, amount: number): number {
  const ledger = readLedger();
  const sending = Math.min(
    Math.max(0, Math.floor(amount)),
    bankBalanceOf(ledger),
  );
  if (sending <= 0) return 0;
  if (!creditCoins(characterId, sending)) return 0; // hero gone — bank untouched
  const id = deviceId();
  const row = ledger.counters[id] ?? { credited: 0, sent: 0 };
  writeLedger({
    ...ledger,
    counters: {
      ...ledger.counters,
      [id]: { ...row, sent: row.sent + sending },
    },
  });
  return sending;
}

/**
 * Boot the store: install the credit hook and let the native side replay any
 * paid-but-uncredited purchase from a previous launch. Call once at app
 * start when running natively (App.tsx); harmless elsewhere.
 */
export function initCoinStore(): void {
  initStoreBridge(creditPurchase);
}

/**
 * Buy `pack`: run the platform pay sheet; the coins land in the
 * undistributed pool (rule 3). Resolves ok only after the credit is
 * persisted. In a FORCED store without the native shell there is no pay
 * sheet — the pack is granted free through the same credit path (ledger
 * included), so the rest of the flow can't tell the difference.
 */
export function buyCoinPack(pack: CoinPack): Promise<PurchaseResult> {
  return buyPack(pack);
}

/** The outcome of an in-run buy: the coins that actually reached the hero, or
 * the failure the pay sheet reported. */
export type RunPurchaseResult =
  { ok: true; coins: number } | { ok: false; reason: PurchaseFailure };

/**
 * IN-RUN buy (the AUTO PILOT picker's STORE button): purchase `pack` and hand
 * its coins straight to the hero currently being played. This does NOT break
 * rule 3 — the player IS distributing, they just did it by buying from inside
 * one hero's run, which names the recipient as plainly as the DISTRIBUTE
 * screen does. The coins still land in the bank first through the audited
 * credit path, so a failure between the two leaves the pack banked (rule 1)
 * for the DISTRIBUTE flow to hand out later, never lost.
 *
 * Returns what actually reached the hero (0 when the hero has vanished — the
 * pack stays undistributed).
 */
export async function buyCoinPackForHero(
  pack: CoinPack,
  characterId: string,
): Promise<RunPurchaseResult> {
  const result = await buyPack(pack);
  if (!result.ok) return result;
  return { ok: true, coins: sendCoins(characterId, pack.coins) };
}

/** The shared pay-sheet run behind both buy entry points. */
function buyPack(pack: CoinPack): Promise<PurchaseResult> {
  if (!storeBridgeAvailable()) {
    if (!storeForced)
      return Promise.resolve({ ok: false, reason: "unavailable" });
    return Promise.resolve(
      creditPurchase(pack.sku, freeKey())
        ? { ok: true }
        : { ok: false, reason: "error" },
    );
  }
  return purchaseSku(pack.sku);
}
