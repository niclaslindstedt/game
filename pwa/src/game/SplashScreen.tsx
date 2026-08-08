// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STUDIO CARD the app opens on: the publisher's name and PRESENTS, drawn
// in the title menu's own pixel font over the same sky the menu stands on, so
// the card lifting reads as the menu arriving rather than as a screen change.
//
// It is a COVER, not a stage. The title menu mounts underneath it on the very
// first render and does its whole arrival behind it — the sprite atlas, the
// planet shader's chunk, the nine surface bakes (see `splash.ts` `warmBoot`) —
// which is what the card is buying. Presses are swallowed for exactly that
// reason: the menu is live under there, and a press meant for the card must
// never reach the row the cursor happens to be sitting on.
//
// The timing rules it obeys live in `splash.ts` and are tested there.

import { useCallback, useEffect, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { IDENTITY } from "../identity.ts";

import { loadUiFont, peekUiFont } from "./assets.ts";
import { musicSynth, synth } from "./audio.ts";
import {
  SPLASH_AUTO_MS,
  SPLASH_MIN_MS,
  warmBoot,
  type SplashPhase,
} from "./splash.ts";
import { fitScale } from "./title-screen/MenuHeading.tsx";
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

  // Everything the menu behind us would otherwise arrive slowly with.
  useEffect(() => {
    let live = true;
    void warmBoot().then(() => {
      if (live) setWarm(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // THE CLOCKS ONLY START ONCE THE GAME IS WARM, which is what makes a slow
  // device hold the card past its auto-dismiss instead of handing over a menu
  // that is still assembling itself. Both are measured from the card's own
  // birth, not from the load finishing, so a launch that was ready in 200 ms
  // still lifts at three seconds rather than at 3.2.
  useEffect(() => {
    if (!warm) return;
    const shown = performance.now() - startedAt.current;
    const timers = [
      window.setTimeout(
        () => setPhase((p) => (p === "holding" ? "skippable" : p)),
        Math.max(0, SPLASH_MIN_MS - shown),
      ),
      window.setTimeout(
        () => setPhase("done"),
        Math.max(0, SPLASH_AUTO_MS - shown),
      ),
    ];
    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [warm]);

  // Cleared: fade, then let the parent unmount us.
  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => doneRef.current(), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  const dismiss = useCallback(() => {
    if (phase !== "skippable") return;
    // The press that cleared the card IS the player arriving, so it does the
    // title theme's audio unlock itself — see the key listener below for why
    // the theme's own listener cannot be relied on to see it.
    synth.unlock();
    musicSynth.unlock();
    setPhase("done");
  }, [phase]);

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
    ? fitScale(font, name, 0, width, uiScale, NAME_MAX_SCALE, NAME_MIN_SCALE)
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
