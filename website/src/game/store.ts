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
//   3. The player distributes. A purchase lands in the device-wide COIN BANK
//      (the "undistributed" pool); the STORE's DISTRIBUTE flow then moves
//      any amount to any hero, whenever — the remainder just stays banked.
//      Nothing is ever assigned, nudged, or expired on the player's behalf.

import { storageKey } from "../identity.ts";
import {
  fetchStoreQuotes,
  initStoreBridge,
  purchaseSku,
  storeBridgeAvailable,
  type PurchaseResult,
} from "../app/storeBridge.ts";
import { creditCoins } from "./characters.ts";

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

/** The undistributed pool: purchased coins waiting to be handed out (rule 3).
 * Device-wide, like the roster it feeds. */
const BANK_KEY = storageKey("store-bank");

/** The DISTRIBUTE slider's tick — amounts move in whole millions. */
export const SEND_TICK = 1_000_000;

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

/** The undistributed pool's current balance. */
export function bankBalance(): number {
  const raw = readJson<unknown>(BANK_KEY, 0);
  return typeof raw === "number" && Number.isFinite(raw) && raw > 0
    ? Math.floor(raw)
    : 0;
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
  const ledger = readJson<string[]>(LEDGER_KEY, []);
  if (ledger.includes(purchaseKey)) return true; // redelivered — already paid out
  writeJson(BANK_KEY, bankBalance() + pack.coins);
  writeJson(LEDGER_KEY, [...ledger, purchaseKey].slice(-LEDGER_CAP));
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
  const bank = bankBalance();
  const sending = Math.min(Math.max(0, Math.floor(amount)), bank);
  if (sending <= 0) return 0;
  if (!creditCoins(characterId, sending)) return 0; // hero gone — bank untouched
  writeJson(BANK_KEY, bank - sending);
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
 * persisted.
 */
export function buyCoinPack(pack: CoinPack): Promise<PurchaseResult> {
  return purchaseSku(pack.sku);
}
