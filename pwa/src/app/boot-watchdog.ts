// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BOOT SCREEN MUST NOT LIE.
//
// `index.html` ships a prerendered `.prelaunch` console — the title, the pitch,
// the library links — ending in a blinking "BOOTING…". It is the SEO document,
// the no-JS fallback, and the frame the app mounts over. What it is NOT is a
// progress indicator: nothing about it is wired to the bundle, so when the
// module script fails to arrive the caret goes on blinking over a page that is
// never going to become a game. The player is left reading a description of the
// game they were trying to play, with no way out but force-quitting the app.
//
// This module is that page's watchdog. It runs from an INLINE classic script
// (injected by `pwa/pwa-plugin.ts`, which pastes `watchBoot.toString()` into the
// shell) precisely because the thing it has to survive is the module graph
// failing to load — a watchdog that ships inside the bundle it is watching
// cannot report the bundle not arriving.
//
// Two rules follow from being inlined that way:
//
//   - **NO CLOSURES OVER MODULE SCOPE.** `toString()` ships the function body
//     and nothing else; every value it needs arrives as an argument. Keep the
//     helpers INSIDE `watchBoot`, and keep the imports of this module to types.
//   - **NO DEPENDENCE ON THE APP.** It talks to the DOM, the service worker and
//     Cache Storage directly. The one thing the app tells it is that the app is
//     alive, and it says that by raising `BOOT_FLAG` on `window`.
//
// And a third that is about the reader rather than the runtime: WHAT IS INSIDE
// THE FUNCTION IS SHIPPED, comments included, inline in the HTML of every first
// visit — the same bytes `prelaunch.css` is careful about. So the reasoning
// lives out here, where it costs nothing, and the body keeps only the one-line
// notes that would be cryptic without.
//
// THE RECOVERY IS THE ONE THE PLAYER ALREADY PERFORMS BY HAND. A service worker
// parks in `waiting` until every client holding the old one is gone, which is
// why force-quitting the app fixes this and an ordinary reload does not: it is
// closing the last client that finally lets the new worker take over. So the
// watchdog asks for that swap directly, and reloads when it lands. Exactly one
// automatic attempt per tab, remembered in sessionStorage — an automatic reload
// that can fire twice is a reload loop — and if the boot after it stalls too,
// the console stops pretending and offers the two buttons a stuck player needs:
// TRY AGAIN, and REINSTALL for throwing this slot's offline copy away.

/** The `window` flag the app raises once it has rendered — see `main.tsx`. */
export const BOOT_FLAG = "__gisAppMounted";

/** Tell the watchdog the app is alive. Called once, after the first render. */
export function markAppMounted(): void {
  (window as unknown as Record<string, unknown>)[BOOT_FLAG] = true;
}

export type BootWatchOptions = {
  /** The `window` flag `markAppMounted` raises. */
  flag: string;
  /** How long a boot may take before it counts as stalled. */
  timeoutMs: number;
  /** How long to wait for the service-worker swap before giving up on it. */
  swapMs: number;
  /** sessionStorage key holding "we already tried to heal this tab". */
  healKey: string;
  /** This deploy slot's base path — the scope of the worker we may unregister. */
  base: string;
  /** This slot's Cache Storage prefix — the caches REPAIR may delete. */
  cachePrefix: string;
};

/**
 * Watch the shell for a boot that never completes, and recover from it.
 *
 * Failure is detected two ways because they have very different latencies. A
 * script or stylesheet that 404s or fails to fetch fires an `error` event at
 * the element, which bubbles to `window` in the CAPTURE phase — that is the
 * common case (a stale shell pointing at a build's assets that are no longer
 * there) and it is known within a round trip. A fetch that simply hangs fires
 * nothing at all, so the timeout is the backstop. It is deliberately generous:
 * the critical path is budgeted for ~5 s on a slow 3G phone, and a false
 * "could not load" on a connection that was merely slow is worse than a few
 * more seconds of a caret.
 */
export function watchBoot(win: Window, opts: BootWatchOptions): void {
  const doc = win.document;
  let handled = false;

  const mounted = (): boolean =>
    Boolean((win as unknown as Record<string, unknown>)[opts.flag]);

  // Guarded: sessionStorage throws outright in some privacy modes.
  const healed = (): boolean => {
    try {
      return win.sessionStorage.getItem(opts.healKey) !== null;
    } catch {
      return false;
    }
  };
  const rememberHeal = (on: boolean): void => {
    try {
      if (on) win.sessionStorage.setItem(opts.healKey, "1");
      else win.sessionStorage.removeItem(opts.healKey);
    } catch {
      // Nothing to remember it with.
    }
  };

  function stalled(): void {
    if (handled || mounted()) return;
    handled = true;
    void heal();
  }

  async function heal(): Promise<void> {
    // Second stall in this tab — the one automatic attempt is spent.
    if (healed()) {
      panic();
      return;
    }
    rememberHeal(true);

    const container = win.navigator.serviceWorker as
      ServiceWorkerContainer | undefined;
    if (container) {
      try {
        const registration = await container.getRegistration(opts.base);
        if (registration) {
          try {
            await registration.update();
          } catch {
            // Offline, most likely — the worker we want may already be waiting.
          }
          const waiting = registration.waiting;
          if (waiting) {
            // The hand-swap force-quitting would have caused.
            container.addEventListener(
              "controllerchange",
              () => win.location.reload(),
              { once: true },
            );
            waiting.postMessage({ type: "SKIP_WAITING" });
            // If it never takes control, reload anyway.
            win.setTimeout(() => win.location.reload(), opts.swapMs);
            return;
          }
        }
      } catch {
        // Nothing to swap to — fall through.
      }
    }
    win.location.reload();
  }

  function button(label: string, onClick: () => void): HTMLButtonElement {
    const el = doc.createElement("button");
    el.type = "button";
    el.className = "prelaunch-action";
    el.textContent = label;
    el.addEventListener("click", onClick);
    return el;
  }

  function panic(): void {
    const status = doc.querySelector(".prelaunch-status");
    if (!status) return;
    // It was decoration; it is now the only true thing on the screen.
    status.removeAttribute("aria-hidden");
    status.setAttribute("role", "alert");
    status.className = "prelaunch-status prelaunch-stalled";
    status.textContent = "";

    const line = doc.createElement("p");
    line.className = "prelaunch-stalled-line";
    line.textContent = "The game's code did not load.";
    status.appendChild(line);

    const actions = doc.createElement("p");
    actions.className = "prelaunch-actions";
    actions.appendChild(
      button("Try again", () => {
        rememberHeal(false);
        win.location.reload();
      }),
    );
    actions.appendChild(button("Reinstall", () => void repair()));
    status.appendChild(actions);
  }

  // REINSTALL. Scoped to THIS slot: `/`, `/preview/` and `/branch/` share one
  // origin, so an unscoped sweep would take a sibling's worker and precache
  // with it. The roster lives in localStorage and is never touched — this
  // costs the download, not the save.
  async function repair(): Promise<void> {
    try {
      const container = win.navigator.serviceWorker as
        ServiceWorkerContainer | undefined;
      if (container) {
        for (const registration of await container.getRegistrations()) {
          if (new URL(registration.scope).pathname === opts.base) {
            await registration.unregister();
          }
        }
      }
      if (win.caches) {
        for (const name of await win.caches.keys()) {
          if (name.startsWith(opts.cachePrefix)) await win.caches.delete(name);
        }
      }
    } catch {
      // A reload with a stale worker still beats leaving the button dead.
    }
    rememberHeal(false);
    win.location.reload();
  }

  // Capture phase: resource `error` events do not bubble, they only propagate
  // to `window` on the way DOWN.
  win.addEventListener(
    "error",
    (event: Event) => {
      const target = event.target as { tagName?: string } | null;
      const tag = target?.tagName;
      if (tag === "SCRIPT" || tag === "LINK") stalled();
    },
    true,
  );

  win.setTimeout(stalled, opts.timeoutMs);
}
