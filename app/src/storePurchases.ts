// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The COIN STORE's purchase bridge — the NATIVE half of the in-app purchase
// seam. The game's web side (website/src/app/storeBridge.ts — the protocol is
// documented there; keep the two in step) asks over the WebView message
// channel for price quotes and purchases; this module answers through
// expo-iap (StoreKit / Play Billing).
//
// Delivery discipline: every PAID transaction is held UNFINISHED until the
// web side confirms the coins are persisted (the "finish" ack) — only then is
// it consumed. If the app dies mid-flow, the store redelivers the unfinished
// transaction on the next connection init, the web side's "init" hello
// re-emits anything still held here, and its credit ledger makes duplicate
// deliveries harmless. A paid pack can arrive late, but never vanish.
//
// expo-iap's native module doesn't exist everywhere the shell can run (Expo
// Go, a simulator build without the pod), so it is required lazily and every
// path degrades to an "unavailable" answer instead of crashing the app.

import type { Product, Purchase } from "expo-iap";

type Iap = typeof import("expo-iap");

/** A message from the web side (already parsed; `__gisStore` checked). */
export type StoreRequest = {
  action?: "init" | "products" | "purchase" | "finish";
  requestId?: number;
  skus?: string[];
  sku?: string;
  purchaseKey?: string;
};

/** An event to inject back into the page (see the web bridge's protocol). */
export type StoreEvent =
  | {
      event: "products";
      requestId: number;
      ok: boolean;
      products?: { sku: string; price: string }[];
    }
  | { event: "purchase"; purchaseKey: string; sku: string }
  | {
      event: "purchaseFailed";
      requestId?: number;
      sku?: string;
      reason: "cancelled" | "unavailable" | "error";
    };

export type StoreBridge = { handle: (request: StoreRequest) => void };

/**
 * Build the native store bridge. `emit` injects one event into the WebView
 * (App.tsx wraps `injectJavaScript`); `handle` takes each parsed store
 * message from `onMessage`.
 */
export function createStoreBridge(
  emit: (event: StoreEvent) => void,
): StoreBridge {
  // undefined = not probed yet; null = native module unavailable.
  let iap: Iap | null | undefined;
  // Paid transactions awaiting the web side's credit ack, by purchase id.
  const unfinished = new Map<string, Purchase>();
  // The purchase attempt whose pay sheet is open, so its error can be routed
  // back to the requesting promise on the web side.
  let inflight: { requestId: number; sku: string } | null = null;
  let starting: Promise<boolean> | null = null;

  const modules = (): Iap | null => {
    if (iap === undefined) {
      try {
        // Lazy so a build without the native module still boots (see header).
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        iap = require("expo-iap") as Iap;
      } catch {
        iap = null;
      }
    }
    return iap;
  };

  const onPurchase = (purchase: Purchase): void => {
    // Pending states resolve into a later "purchased" delivery; only a paid
    // transaction is worth announcing.
    if (purchase.purchaseState !== "purchased") return;
    unfinished.set(purchase.id, purchase);
    if (inflight?.sku === purchase.productId) inflight = null;
    emit({
      event: "purchase",
      purchaseKey: purchase.id,
      sku: purchase.productId,
    });
  };

  // Structural type: expo-iap exposes two PurchaseError shapes (the graphql
  // type and the listener's error class); the fields used here are on both.
  const onError = (error: {
    code?: unknown;
    productId?: string | null;
  }): void => {
    const requestId = inflight?.requestId;
    inflight = null;
    emit({
      event: "purchaseFailed",
      ...(requestId !== undefined ? { requestId } : {}),
      ...(error.productId ? { sku: error.productId } : {}),
      reason: String(error.code) === "user-cancelled" ? "cancelled" : "error",
    });
  };

  // Connect once: listeners first, so the transactions the store replays on
  // connection init (paid on a previous launch, never finished) are caught.
  const start = (): Promise<boolean> => {
    if (!starting) {
      starting = (async () => {
        const m = modules();
        if (!m) return false;
        m.purchaseUpdatedListener(onPurchase);
        m.purchaseErrorListener(onError);
        try {
          return await m.initConnection();
        } catch {
          return false;
        }
      })();
    }
    return starting;
  };

  // Web handler is up (page load): make sure the store is connected, then
  // re-emit everything still awaiting a credit ack — the page may have died
  // between our first emit and its persist.
  const init = async (): Promise<void> => {
    await start();
    for (const [key, purchase] of unfinished) {
      emit({ event: "purchase", purchaseKey: key, sku: purchase.productId });
    }
  };

  const products = async (requestId: number, skus: string[]): Promise<void> => {
    const m = modules();
    if (!m || skus.length === 0 || !(await start())) {
      emit({ event: "products", requestId, ok: false });
      return;
    }
    try {
      const list = await m.fetchProducts({ skus, type: "in-app" });
      emit({
        event: "products",
        requestId,
        ok: true,
        products: ((list ?? []) as Product[]).map((p) => ({
          sku: p.id,
          price: p.displayPrice,
        })),
      });
    } catch {
      emit({ event: "products", requestId, ok: false });
    }
  };

  const purchase = async (requestId: number, sku: string): Promise<void> => {
    const m = modules();
    if (!m || !sku || !(await start())) {
      emit({ event: "purchaseFailed", requestId, sku, reason: "unavailable" });
      return;
    }
    inflight = { requestId, sku };
    try {
      await m.requestPurchase({
        request: { apple: { sku }, google: { skus: [sku] } },
        type: "in-app",
      });
      // Success/failure lands through the listeners above.
    } catch {
      // Only report if the error listener hasn't already (it clears inflight).
      if (inflight?.requestId === requestId) {
        inflight = null;
        emit({ event: "purchaseFailed", requestId, sku, reason: "error" });
      }
    }
  };

  // The web side persisted the credit — consume the transaction. On failure
  // it stays queued and is retried on the next launch's redelivery.
  const finish = async (purchaseKey: string): Promise<void> => {
    const m = modules();
    const purchase_ = unfinished.get(purchaseKey);
    if (!m || !purchase_) return;
    try {
      await m.finishTransaction({ purchase: purchase_, isConsumable: true });
      unfinished.delete(purchaseKey);
    } catch {
      // Keep it; a re-ack after the next redelivery tries again.
    }
  };

  const handle = (request: StoreRequest): void => {
    switch (request.action) {
      case "init":
        void init();
        break;
      case "products":
        void products(request.requestId ?? 0, request.skus ?? []);
        break;
      case "purchase":
        void purchase(request.requestId ?? 0, request.sku ?? "");
        break;
      case "finish":
        if (request.purchaseKey) void finish(request.purchaseKey);
        break;
    }
  };

  return { handle };
}
