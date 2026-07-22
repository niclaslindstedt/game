// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's purchase bridge — the WEB half of the native in-app
// purchase seam. Real-money purchases can only run inside the native shell
// (native/), where StoreKit / Play Billing live; this module speaks to it over
// the WebView's message channel:
//
//   web → native  `window.ReactNativeWebView.postMessage(JSON { __gisStore })`
//   native → web  `webview.injectJavaScript("window.__gisStoreEvent(...)")`
//
// The protocol (mirrored by native/src/storePurchases.ts — keep the two in step):
//   → { action: "init" }                      announce the web handler is up;
//                                             native re-emits any purchase it
//                                             still holds unfinished
//   → { action: "products", requestId, skus } ask for localized price tags
//   → { action: "purchase", requestId, sku }  open the platform pay sheet
//   → { action: "finish", purchaseKey }       credit landed — finish (consume)
//                                             the transaction
//   ← { event: "products", requestId, ok, products?: [{ sku, price }] }
//   ← { event: "purchase", purchaseKey, sku } a PAID transaction to credit
//   ← { event: "purchaseFailed", requestId?, sku?, reason }
//
// Delivery discipline: the native side holds every paid transaction
// UNFINISHED until this side confirms the coins landed (the "finish" ack), so
// an app killed mid-flow redelivers the purchase on the next launch — a paid
// pack can be credited late, but never lost. The credit callback is therefore
// idempotent on `purchaseKey` (the caller keeps a ledger) and re-runs safely.

import { isNativeApp } from "./native.ts";

declare global {
  interface Window {
    /** The WebView's message channel into the native shell (native/App.tsx). */
    ReactNativeWebView?: { postMessage(message: string): void };
    /** The native shell's callback into this page (installed by
     * `initStoreBridge`; called via `injectJavaScript`). */
    __gisStoreEvent?: (event: unknown) => void;
  }
}

/** A localized price tag for one product, straight from the platform store. */
export type StoreQuote = { sku: string; price: string };

/** Why a purchase attempt yielded no coins. */
export type PurchaseFailure = "cancelled" | "unavailable" | "error";

export type PurchaseResult =
  { ok: true } | { ok: false; reason: PurchaseFailure };

/**
 * Credit hook: a paid transaction arrived (fresh, or redelivered from a past
 * launch). Return true once the coins are safely persisted — the bridge then
 * tells the native side to finish (consume) the transaction. Returning false
 * leaves it unfinished, to be redelivered later.
 */
export type PurchaseCreditHandler = (
  sku: string,
  purchaseKey: string,
) => boolean;

/** How long a price lookup may take before it reports unavailable. */
const QUOTE_TIMEOUT_MS = 10_000;
/** How long a pay sheet may sit open before the attempt is abandoned. The
 * transaction itself can still complete after this — the unsolicited-delivery
 * path (`PurchaseCreditHandler` + the caller's ledger) then credits it. */
const PURCHASE_TIMEOUT_MS = 5 * 60_000;

let creditHandler: PurchaseCreditHandler | null = null;
let nextRequestId = 1;
const quoteWaiters = new Map<number, (quotes: StoreQuote[] | null) => void>();
let purchaseWaiter: {
  requestId: number;
  sku: string;
  resolve: (result: PurchaseResult) => void;
  timer: number;
} | null = null;

/** True where a purchase could actually run: the native shell with its
 * message channel up. Gates the STORE menu row. */
export function storeBridgeAvailable(): boolean {
  return (
    isNativeApp() &&
    typeof window !== "undefined" &&
    !!window.ReactNativeWebView
  );
}

function post(message: Record<string, unknown>): void {
  try {
    window.ReactNativeWebView?.postMessage(
      JSON.stringify({ __gisStore: true, ...message }),
    );
  } catch {
    // Channel gone (page tearing down) — waiters resolve via their timeouts.
  }
}

/**
 * Install the credit handler and announce the page to the native side, which
 * replies by re-emitting any paid-but-unfinished purchase from a previous
 * launch. Call once at boot (App.tsx) whenever the shell is native; a no-op
 * in the browser/PWA.
 */
export function initStoreBridge(onPurchase: PurchaseCreditHandler): void {
  creditHandler = onPurchase;
  if (!storeBridgeAvailable()) return;
  window.__gisStoreEvent = handleEvent;
  post({ action: "init" });
}

/** Localized price tags for `skus`, or null when the store can't answer
 * (offline, store unreachable, not native). The UI then shows the shipped
 * USD fallbacks. */
export function fetchStoreQuotes(skus: string[]): Promise<StoreQuote[] | null> {
  if (!storeBridgeAvailable()) return Promise.resolve(null);
  return new Promise((resolve) => {
    const requestId = nextRequestId++;
    const timer = window.setTimeout(() => {
      quoteWaiters.delete(requestId);
      resolve(null);
    }, QUOTE_TIMEOUT_MS);
    quoteWaiters.set(requestId, (quotes) => {
      window.clearTimeout(timer);
      resolve(quotes);
    });
    post({ action: "products", requestId, skus });
  });
}

/**
 * Run one purchase through the platform pay sheet. Resolves ok AFTER the
 * credit handler has banked the coins (success events route through it before
 * settling this promise). One at a time — a second call while one is open
 * fails fast as "error".
 */
export function purchaseSku(sku: string): Promise<PurchaseResult> {
  if (!storeBridgeAvailable()) {
    return Promise.resolve({ ok: false, reason: "unavailable" });
  }
  if (purchaseWaiter) return Promise.resolve({ ok: false, reason: "error" });
  return new Promise((resolve) => {
    const requestId = nextRequestId++;
    const timer = window.setTimeout(() => {
      if (purchaseWaiter?.requestId === requestId) purchaseWaiter = null;
      resolve({ ok: false, reason: "error" });
    }, PURCHASE_TIMEOUT_MS);
    purchaseWaiter = { requestId, sku, resolve, timer };
    post({ action: "purchase", requestId, sku });
  });
}

function settlePurchase(result: PurchaseResult): void {
  const waiter = purchaseWaiter;
  if (!waiter) return;
  purchaseWaiter = null;
  window.clearTimeout(waiter.timer);
  waiter.resolve(result);
}

function handleEvent(raw: unknown): void {
  if (!raw || typeof raw !== "object") return;
  const event = raw as {
    event?: string;
    requestId?: number;
    ok?: boolean;
    products?: StoreQuote[];
    purchaseKey?: string;
    sku?: string;
    reason?: PurchaseFailure;
  };
  if (event.event === "products" && typeof event.requestId === "number") {
    const waiter = quoteWaiters.get(event.requestId);
    quoteWaiters.delete(event.requestId);
    waiter?.(event.ok && Array.isArray(event.products) ? event.products : null);
    return;
  }
  if (
    event.event === "purchase" &&
    typeof event.purchaseKey === "string" &&
    typeof event.sku === "string"
  ) {
    // Credit FIRST, ack second — the coins must be persisted before the
    // native side is allowed to consume the transaction.
    const credited = creditHandler?.(event.sku, event.purchaseKey) === true;
    if (credited) post({ action: "finish", purchaseKey: event.purchaseKey });
    if (purchaseWaiter?.sku === event.sku && credited) {
      settlePurchase({ ok: true });
    }
    return;
  }
  if (event.event === "purchaseFailed") {
    const targeted =
      typeof event.requestId === "number"
        ? purchaseWaiter?.requestId === event.requestId
        : true; // an untargeted failure can only belong to the open attempt
    if (targeted) {
      settlePurchase({ ok: false, reason: event.reason ?? "error" });
    }
  }
}
