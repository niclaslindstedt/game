// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// "BOOTING…" IS NOT A PROGRESS BAR.
//
// The prerendered `.prelaunch` console in `pwa/index.html` is the SEO document,
// the no-JS fallback, and the frame the app mounts over — and it ends in a
// blinking BOOTING… that is wired to nothing at all. When the module script
// fails to arrive (a stale shell pointing at a bundle that is no longer there,
// a dropped connection, a deploy still propagating), the caret goes on blinking
// over a page that will never become a game, and the player reads a description
// of the game they were trying to play until they force-quit the app.
//
// `watchBoot` (pwa/src/app/boot-watchdog.ts) is what makes that screen honest.
// It is inlined into the shell as a classic script by `pwa-plugin.ts`, which is
// exactly why it is worth testing here: nothing else in the suite ever loads
// it, and the situation it runs in — the bundle missing — is the one situation
// a test that imports the bundle cannot stage.
//
// The recovery it performs is the one the player performs by hand: swap to the
// waiting worker, which is what force-quitting achieves by closing the last
// client holding the old one. Once per tab, because an automatic reload that
// can fire twice is a reload loop.

import { describe, expect, it } from "vitest";

import {
  BOOT_FLAG,
  watchBoot,
  type BootWatchOptions,
} from "../pwa/src/app/boot-watchdog.ts";

const OPTIONS: BootWatchOptions = {
  flag: BOOT_FLAG,
  timeoutMs: 20000,
  swapMs: 5000,
  healKey: "game-boot-heal",
  base: "/",
  cachePrefix: "game-precache",
};

type FakeElement = {
  tagName: string;
  type: string;
  className: string;
  textContent: string;
  attrs: Map<string, string>;
  kids: FakeElement[];
  clicks: Array<() => void>;
  appendChild: (child: FakeElement) => void;
  addEventListener: (type: string, fn: () => void) => void;
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

function element(tagName: string): FakeElement {
  const el: FakeElement = {
    tagName: tagName.toUpperCase(),
    type: "",
    className: "",
    textContent: "",
    attrs: new Map(),
    kids: [],
    clicks: [],
    appendChild: (child) => void el.kids.push(child),
    addEventListener: (type, fn) => {
      if (type === "click") el.clicks.push(fn);
    },
    setAttribute: (name, value) => void el.attrs.set(name, value),
    removeAttribute: (name) => void el.attrs.delete(name),
  };
  return el;
}

/** Every button the watchdog put on the console, flattened. */
function buttons(status: FakeElement): FakeElement[] {
  return status.kids.flatMap((kid) =>
    kid.tagName === "BUTTON"
      ? [kid]
      : kid.kids.filter((k) => k.tagName === "BUTTON"),
  );
}

type Registration = {
  scope: string;
  waiting: { posted: unknown[] } | null;
  updates: number;
  unregistered: boolean;
};

function registration(scope: string, waiting: boolean): Registration {
  return {
    scope,
    waiting: waiting ? { posted: [] } : null,
    updates: 0,
    unregistered: false,
  };
}

function fakeWindow(options: {
  registrations?: Registration[];
  caches?: string[];
  healed?: boolean;
  /** Stage a browser with no service-worker support at all. */
  noServiceWorker?: boolean;
}) {
  const status = element("p");
  status.className = "prelaunch-status";
  status.attrs.set("aria-hidden", "true");

  const timers: Array<{ fn: () => void; ms: number }> = [];
  const store = new Map<string, string>();
  if (options.healed) store.set(OPTIONS.healKey, "1");
  const cacheNames = new Set(options.caches ?? []);
  const regs = options.registrations ?? [];
  const errorListeners: Array<(event: unknown) => void> = [];
  const controllerListeners: Array<() => void> = [];
  const reloads: number[] = [];

  const win = {
    document: {
      querySelector: (selector: string) =>
        selector === ".prelaunch-status" ? status : null,
      createElement: (tag: string) => element(tag),
    },
    location: { reload: () => void reloads.push(1) },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
    navigator: {
      serviceWorker: options.noServiceWorker
        ? undefined
        : {
            getRegistration: (scope: string) =>
              Promise.resolve(
                regs.find((r) => new URL(r.scope).pathname === scope) ??
                  undefined,
              ),
            getRegistrations: () => Promise.resolve(regs),
            addEventListener: (type: string, fn: () => void) => {
              if (type === "controllerchange") controllerListeners.push(fn);
            },
          },
    },
    caches: {
      keys: () => Promise.resolve([...cacheNames]),
      delete: (name: string) => Promise.resolve(cacheNames.delete(name)),
    },
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (type === "error") errorListeners.push(fn);
    },
    setTimeout: (fn: () => void, ms: number) => {
      timers.push({ fn, ms });
      return timers.length;
    },
  };

  // `registration.update()` is a method on the object the fake hands back.
  for (const reg of regs) {
    Object.assign(reg, {
      update: () => {
        reg.updates += 1;
        return Promise.resolve();
      },
      unregister: () => {
        reg.unregistered = true;
        return Promise.resolve(true);
      },
    });
    if (reg.waiting) {
      const waiting = reg.waiting;
      Object.assign(waiting, {
        postMessage: (message: unknown) => void waiting.posted.push(message),
      });
    }
  }

  return {
    win: win as unknown as Window,
    status,
    store,
    cacheNames,
    regs,
    reloads,
    /** Stage a `<script>` that failed to load, the way the browser reports it. */
    failScript: () => {
      for (const listener of errorListeners) {
        listener({ target: { tagName: "SCRIPT" } });
      }
    },
    /** Run the watchdog's own timers — the hung-fetch backstop. */
    tick: () => {
      const due = timers.splice(0, timers.length);
      for (const timer of due) timer.fn();
    },
    controllerChange: () => {
      for (const listener of controllerListeners.splice(0)) listener();
    },
  };
}

/** Let the watchdog's promise chain run to completion. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe("the boot watchdog", () => {
  it("does nothing at all once the app has mounted", async () => {
    const dom = fakeWindow({});
    watchBoot(dom.win, OPTIONS);
    (dom.win as unknown as Record<string, unknown>)[BOOT_FLAG] = true;

    dom.tick();
    await settle();

    expect(dom.reloads).toEqual([]);
    expect(dom.status.className).toBe("prelaunch-status");
    expect(dom.store.size).toBe(0);
  });

  it("swaps to the waiting worker — force-quitting, done for the player", async () => {
    // THE REPORTED BUG, and its fix from the page's side. The upgrade is sitting
    // in `waiting` because a client still holds the old worker; the old worker
    // is serving a shell whose bundle it does not have. Closing the app is what
    // normally releases it, so ask for the skip instead.
    const reg = registration("https://example.test/", true);
    const dom = fakeWindow({ registrations: [reg] });
    watchBoot(dom.win, OPTIONS);

    dom.failScript();
    await settle();

    expect(reg.updates).toBe(1);
    expect(reg.waiting?.posted).toEqual([{ type: "SKIP_WAITING" }]);
    expect(dom.reloads).toEqual([]);

    dom.controllerChange();
    expect(dom.reloads).toEqual([1]);
  });

  it("reloads once when there is no waiting worker to swap to", async () => {
    const dom = fakeWindow({
      registrations: [registration("https://example.test/", false)],
    });
    watchBoot(dom.win, OPTIONS);

    dom.failScript();
    await settle();

    expect(dom.reloads).toEqual([1]);
    expect(dom.store.get(OPTIONS.healKey)).toBe("1");
  });

  it("treats a hung fetch as a stall too, but only on the timeout", async () => {
    // A fetch that never answers fires no error event at all; the timeout is
    // the only thing that catches it, and it is the whole reason there is one.
    const dom = fakeWindow({
      registrations: [registration("https://example.test/", false)],
    });
    watchBoot(dom.win, OPTIONS);

    await settle();
    expect(dom.reloads).toEqual([]);

    dom.tick();
    await settle();
    expect(dom.reloads).toEqual([1]);
  });

  it("stalls only once — a second failure never re-reloads", async () => {
    const dom = fakeWindow({
      registrations: [registration("https://example.test/", false)],
    });
    watchBoot(dom.win, OPTIONS);

    dom.failScript();
    dom.failScript();
    dom.tick();
    await settle();

    expect(dom.reloads).toEqual([1]);
  });

  it("says so plainly when the reload did not help", async () => {
    // Second stall in the same tab: the automatic attempt was spent on the load
    // before this one, so stop reloading and hand the player the controls.
    const dom = fakeWindow({ healed: true });
    watchBoot(dom.win, OPTIONS);

    dom.failScript();
    await settle();

    expect(dom.reloads).toEqual([]);
    expect(dom.status.className).toContain("prelaunch-stalled");
    // It was decoration; it is now the only true thing on the screen.
    expect(dom.status.attrs.has("aria-hidden")).toBe(false);
    expect(dom.status.attrs.get("role")).toBe("alert");
    expect(dom.status.kids[0]?.textContent).toContain("did not load");
    expect(buttons(dom.status).map((b) => b.textContent)).toEqual([
      "Try again",
      "Reinstall",
    ]);
  });

  it("lets TRY AGAIN spend a fresh automatic attempt", async () => {
    const dom = fakeWindow({ healed: true });
    watchBoot(dom.win, OPTIONS);
    dom.failScript();
    await settle();

    buttons(dom.status)[0]?.clicks[0]?.();

    expect(dom.reloads).toEqual([1]);
    // Cleared, so the reloaded page may try the worker swap again rather than
    // landing straight back on this panel.
    expect(dom.store.has(OPTIONS.healKey)).toBe(false);
  });

  it("lets REINSTALL throw away THIS slot's copy and nobody else's", async () => {
    // The three deploy slots share one origin and one Cache Storage. A repair
    // that swept all of it would unregister the sibling slots' workers and
    // delete their offline copies along with ours.
    const mine = registration("https://example.test/", false);
    const sibling = registration("https://example.test/preview/", false);
    const dom = fakeWindow({
      healed: true,
      registrations: [mine, sibling],
      caches: ["game-precache-aaa", "game-preview-precache-bbb", "unrelated"],
    });
    watchBoot(dom.win, OPTIONS);
    dom.failScript();
    await settle();

    buttons(dom.status)[1]?.clicks[0]?.();
    await settle();

    expect(mine.unregistered).toBe(true);
    expect(sibling.unregistered).toBe(false);
    expect([...dom.cacheNames]).toEqual([
      "game-preview-precache-bbb",
      "unrelated",
    ]);
    expect(dom.reloads).toEqual([1]);
  });

  it("still recovers with no service worker at all", async () => {
    // A browser with workers turned off, or a first visit that failed before
    // one was ever registered. There is nothing to swap to, so a plain reload
    // is the whole recovery — and it must not throw on the way there.
    const dom = fakeWindow({ noServiceWorker: true });
    watchBoot(dom.win, OPTIONS);

    dom.failScript();
    await settle();

    expect(dom.reloads).toEqual([1]);
  });
});
