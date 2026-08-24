// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD the app opens on: the publisher's name and PRESENTS, drawn
// in the title menu's own pixel font over the same sky the menu stands on, so
// the card lifting reads as the menu arriving rather than as a screen change.
//
// It is a COVER, not a stage. The whole app mounts underneath it and does its
// entire arrival behind it — its own chunk, the sprite atlas, the planet
// shader, the nine surface bakes (see `splash.ts` `warmBoot`) — which is what
// the card is buying. Presses are swallowed for exactly that reason: the menu
// is live under there, and a press meant for the card must never reach the row
// the cursor happens to be sitting on.
//
// A player who presses before all that has landed gets the card anyway: it is
// the AUTO-dismiss that waits for the load, never a press. What is underneath
// then is a Loading screen, which is the honest answer — see `splashPhase`.
//
// The timing rules it obeys live in `splash.ts` and are tested there.

import { useCallback, useEffect, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { loadAppShell } from "../app-shell.ts";
import { IDENTITY } from "../identity.ts";

// The FONT LEAF, not `assets.ts`: the card needs the menu font and must not
// drag the sprite atlas into the entry chunk to get it (see ui-font.ts).
import { musicSynth, synth } from "./audio.ts";
import { loadUiFont, peekUiFont } from "./ui-font.ts";
import {
  SPLASH_AUTO_MS,
  SPLASH_MIN_MS,
  splashPhase,
  warmBoot,
  type SplashPhase,
} from "./splash.ts";
import { fitScale } from "./title-screen/heading-fit.ts";
import { useViewportMetrics } from "./title-screen/use-title-layout.ts";

/** How long the card takes to fade out of the way. Must match the
 * `.splash-screen.leaving` transition in styles.css. */
const FADE_MS = 320;

/** The name's biggest and smallest pixel scale. The ceiling is one step under
 * the main menu's compact logo: the house is not the loudest thing the player
 * is about to see. */
const NAME_MAX_SCALE = 6;
const NAME_MIN_SCALE = 2;

/** PRESENTS, in the tagline's size and tone. */
const PRESENTS_SCALE = 2;

/** Keys that are not "a key" to a player holding one down to reach another. */
const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "OS"]);

export function SplashScreen({ onDone }: { onDone: () => void }) {
  const [font, setFont] = useState<PixelFont | null>(() => peekUiFont());
  const [warm, setWarm] = useState(false);
  const [phase, setPhase] = useState<SplashPhase>("holding");
  const { width, uiScale } = useViewportMetrics();

  // The card's own age, stamped on mount. A ref rather than state: nothing
  // re-renders on it, and it has to survive the re-renders the font and the
  // warm-up cause. Declared FIRST among the effects, so every effect below it
  // reads a stamped birth rather than a zero.
  const startedAt = useRef(0);
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);

  // `onDone` is a fresh closure every parent render; hold it in a ref so the
  // fade-out timer below is armed once instead of restarted on each one.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  // The menu font, on its own: a tiny PNG that lands well ahead of the atlas,
  // exactly as the LoadingScreen it stands in for fetches it. Until it does,
  // the card is its sky and nothing else — a blink, and far better than
  // flashing the house's name in a system font it never wears again.
  useEffect(() => {
    if (font) return;
    let live = true;
    void loadUiFont().then((loaded) => {
      if (live) setFont(loaded);
    });
    return () => {
      live = false;
    };
  }, [font]);

  // Everything the menu behind us would otherwise arrive slowly with — in two
  // halves, started together and awaited together.
  //
  // The CONTENT half is `warmBoot` (the atlas, the fonts, the sky). The other
  // is THE APP SHELL ITSELF: `App.tsx` is no longer in the entry chunk, this
  // card is (see `Boot.tsx`), so the chunk carrying the menu is fetched here
  // and the card holds until it has landed and mounted. Its failure is NOT
  // swallowed into `warm` — there would be no menu to hold anybody out of, and
  // what the player needs is Boot's RELOAD panel; all this has to do is not
  // hang the card, and lifting onto that panel is the correct ending.
  useEffect(() => {
    let live = true;
    void Promise.all([warmBoot(), loadAppShell().catch(() => {})]).then(() => {
      if (live) setWarm(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // THE MINIMUM ANSWERS TO NOTHING BUT THE CLOCK. At SPLASH_MIN_MS the card
  // takes a press, warm or not: a player who has told us they are done reading
  // gets the card out of the way, and whatever is not loaded yet says so with
  // a Loading screen (see `Boot.tsx`) rather than by ignoring them.
  useEffect(() => {
    const shown = performance.now() - startedAt.current;
    const timer = window.setTimeout(
      () => setPhase((p) => (p === "holding" ? "skippable" : p)),
      Math.max(0, SPLASH_MIN_MS - shown),
    );
    return () => window.clearTimeout(timer);
  }, []);

  // THE AUTO-DISMISS WAITS FOR THE LOAD, which is what makes a slow device
  // hold the card past three seconds instead of handing a player who touched
  // nothing a menu that is still assembling itself. Measured from the card's
  // own birth rather than from the load finishing, so a launch that was ready
  // in 200 ms still lifts at three seconds rather than at 3.2.
  useEffect(() => {
    if (!warm) return;
    const shown = performance.now() - startedAt.current;
    const timer = window.setTimeout(
      () => setPhase("done"),
      Math.max(0, SPLASH_AUTO_MS - shown),
    );
    return () => window.clearTimeout(timer);
  }, [warm]);

  // Cleared: fade, then let the parent unmount us.
  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => doneRef.current(), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // MAY THIS PRESS CLEAR THE CARD — asked of the CLOCK, never of `phase`.
  //
  // The two are the same answer only on an idle main thread, and the card's
  // whole reason to exist is the launch where the main thread is anything but:
  // the atlas is decoding and nine worlds are baking. Both the timer that
  // promotes `holding` → `skippable` and the press itself are macrotasks
  // queued behind that work, so they arrive together when it lets go — and a
  // `dismiss` that closed over `phase` read the render BEFORE the timer's state
  // update landed, decided the card was still holding, and dropped the press
  // on the floor. The player then pressed a card that had gone unresponsive on
  // exactly the device it was added for. `startedAt` is a ref and
  // `performance.now()` owes nothing to the renderer, so this cannot go stale.
  const dismiss = useCallback(() => {
    const elapsed = performance.now() - startedAt.current;
    if (splashPhase(elapsed, warm) === "holding") return;
    // The press that cleared the card IS the player arriving, so it does the
    // title theme's audio unlock itself — see the key listener below for why
    // the theme's own listener cannot be relied on to see it.
    synth.unlock();
    musicSynth.unlock();
    setPhase("done");
  }, [warm]);

  // EVERY KEY IS EATEN WHILE THE CARD IS UP, and on `window` in the CAPTURE
  // phase because that is the only place upstream of every listener the live
  // menu underneath has installed — including the synthetic keys the gamepad
  // bridge dispatches straight at `window`, which nothing lower in the tree
  // ever sees. Without it, the Enter that clears the card also confirms the
  // menu row behind it and the player never sees the menu at all.
  //
  // It keeps eating them through the fade-out too, so a second impatient press
  // cannot land on the menu coming up underneath. What it also eats is the one
  // listener that WANTED the first key — the title theme's "the player has
  // arrived" unlock (`armTitleMusic`, on `document` in capture) — which is why
  // `dismiss` above performs that unlock itself.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopPropagation();
      if (MODIFIER_KEYS.has(event.key)) return;
      // A browser shortcut on its way past (reload, devtools, tab switch) is
      // not a press on the card.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      dismiss();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [dismiss]);

  const name = IDENTITY.publisher.toUpperCase();
  const nameScale = font
    ? fitScale(
        font.measure(name),
        0,
        width,
        uiScale,
        NAME_MAX_SCALE,
        NAME_MIN_SCALE,
      )
    : NAME_MIN_SCALE;

  return (
    <div
      className={`splash-screen${phase === "done" ? " leaving" : ""}`}
      // A pointer press lands here rather than on the menu: the card covers the
      // screen, so nothing has to be swallowed for it — and leaving it
      // un-swallowed is what lets the theme's own `pointerdown` unlock fire on
      // the way past.
      onPointerDown={dismiss}
    >
      {font && (
        <div className="splash-card">
          <PixelText
            font={font}
            text={name}
            scale={nameScale}
            color="#7ef0c8"
          />
          <PixelText
            font={font}
            text="PRESENTS"
            scale={PRESENTS_SCALE}
            color="#9aa3ad"
          />
        </div>
      )}
    </div>
  );
}
