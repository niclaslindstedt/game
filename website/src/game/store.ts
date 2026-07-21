// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE — the game's one real-money surface: coin packs that fund
// the AUTO PILOT (src/game/autopilot.ts drains the purse per simulated
// second; more coins = longer unattended flying). Native app builds only —
// purchases run through the platform store via the WebView bridge
// (../app/storeBridge.ts); in a browser/PWA the store simply doesn't exist.
//
// Money-safety rules, in order:
//   1. A paid pack is NEVER lost. The native side holds every paid
//      transaction unfinished until the credit is persisted here (the bridge
//      "finish" ack), and redelivers it on the next launch if the app died
//      mid-flow.
//   2. A pack is never credited TWICE. Redelivery makes duplicates normal,
//      so every credited transaction's key lands in a persisted ledger and a
//      re-seen key is acked without a second credit.
//   3. The buyer picks the hero. The chosen character id is persisted BEFORE
//      the pay sheet opens, so a purchase that completes on a later launch
//      still lands on the hero it was bought for (falling back to the active
//      hero, then any living one, only when that record is gone).

import { storageKey } from "../identity.ts";
import {
  fetchStoreQuotes,
  initStoreBridge,
  purchaseSku,
  storeBridgeAvailable,
  type PurchaseResult,
} from "../app/storeBridge.ts";
import {
  creditCoins,
  getActiveCharacterId,
  loadCharacters,
} from "./characters.ts";

/** One purchasable coin pack. `sku` is the store product id — it must exist
 * with these prices in App Store Connect / Play Console (see app/README.md).
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

/** Credited transaction keys, newest last — the double-credit guard (rule 2).
 * Bounded so a lifetime of purchases can't grow it unbounded. */
const LEDGER_KEY = storageKey("store-ledger");
const LEDGER_CAP = 200;

/** sku → chosen character id, written before the pay sheet opens (rule 3). */
const ASSIGN_KEY = storageKey("store-assignments");

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
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

/** True where the STORE menu should exist at all: the native shell. */
export function coinStoreAvailable(): boolean {
  return storeBridgeAvailable();
}

/** Localized price tags keyed by sku, or null (UI falls back to `price`). */
export async function fetchCoinPrices(): Promise<Record<
  string,
  string
> | null> {
  const quotes = await fetchStoreQuotes(COIN_PACKS.map((p) => p.sku));
  if (!quotes) return null;
  const bySku: Record<string, string> = {};
  for (const quote of quotes) bySku[quote.sku] = quote.price;
  return bySku;
}

/** Which hero a completed purchase of `sku` lands on: the recorded choice,
 * else the active hero, else any living one (a redelivered purchase must
 * find SOME purse — rule 1 beats precision once the record is gone). */
function creditTarget(sku: string): string | null {
  const roster = loadCharacters();
  const assigned = readJson<Record<string, string>>(ASSIGN_KEY, {})[sku];
  if (assigned && roster.some((c) => c.id === assigned)) return assigned;
  const active = getActiveCharacterId();
  if (active && roster.some((c) => c.id === active)) return active;
  return roster.find((c) => !c.dead)?.id ?? roster[0]?.id ?? null;
}

/** The bridge's credit hook: bank a paid transaction's coins exactly once.
 * Returns true only once the credit is persisted (or already was), which
 * releases the native side to consume the transaction. */
function creditPurchase(sku: string, purchaseKey: string): boolean {
  const pack = COIN_PACKS.find((p) => p.sku === sku);
  // Not a sku this build knows — leave it unfinished rather than consume
  // something we can't honor (a newer build will know it).
  if (!pack) return false;
  const ledger = readJson<string[]>(LEDGER_KEY, []);
  if (ledger.includes(purchaseKey)) return true; // redelivered — already paid out
  const target = creditTarget(sku);
  if (!target || !creditCoins(target, pack.coins)) return false; // no hero yet — retry later
  writeJson(LEDGER_KEY, [...ledger, purchaseKey].slice(-LEDGER_CAP));
  const assignments = readJson<Record<string, string>>(ASSIGN_KEY, {});
  if (assignments[sku]) {
    delete assignments[sku];
    writeJson(ASSIGN_KEY, assignments);
  }
  return true;
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
 * Buy `pack` for the chosen hero: record the assignment (so even an
 * interrupted purchase lands on them — rule 3), then run the platform pay
 * sheet. Resolves ok only after the coins are persisted onto the hero.
 */
export function buyCoinPack(
  pack: CoinPack,
  characterId: string,
): Promise<PurchaseResult> {
  const assignments = readJson<Record<string, string>>(ASSIGN_KEY, {});
  assignments[pack.sku] = characterId;
  writeJson(ASSIGN_KEY, assignments);
  return purchaseSku(pack.sku);
}
