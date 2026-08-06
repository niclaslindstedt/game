// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT KEY, from the press to the receipt: take the picture, raise
// the flash over the field, and let it go again on its own.
//
// The capture is ASYNCHRONOUS (the browser encodes the PNG off-thread), so a
// press is a request rather than an event — which is exactly why the run is
// never frozen for one. The field keeps playing, the picture lands a frame or
// three later, and the flash appears when it does. A player mid-fight notices
// nothing but the white blink.
//
// TWO PRESSES IN A ROW ARE ORDINARY (a player takes three of the same moment
// and picks one later), so nothing here queues: the newest picture replaces
// whatever was up, its miniature keys the mount so the animation replays, and
// the object URL the old one was showing is revoked on the way past — a roll's
// worth of leaked blob URLs is a real leak, and the picture itself is still
// safe in the store.

import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject, RefObject } from "react";

import { synth } from "../audio.ts";
import { playUiSound } from "../sfx/ui.ts";
import { captureScreen } from "../screenshots.ts";
import { SHOT_FLASH_TTL_MS, type ShotFlashData } from "./ScreenshotFlash.tsx";

export type ScreenshotFlash = {
  /** The picture currently celebrating, or null. GameScreen mounts on it. */
  flash: ShotFlashData | null;
  /** The live flash element, so the canvas can route a tap over the (inert)
   * miniature into opening the gallery — the achievement toast's arrangement
   * exactly (controls.ts). */
  shotFlashElRef: MutableRefObject<HTMLDivElement | null>;
  /** Take one, captioned with where it was taken. */
  takeScreenshot: (label: string) => void;
};

export function useScreenshotFlash(
  /** The screen root — everything in the picture, world canvas and HUD alike. */
  rootRef: RefObject<HTMLDivElement | null>,
): ScreenshotFlash {
  const [flash, setFlash] = useState<ShotFlashData | null>(null);
  const shotFlashElRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef(0);
  // The URL the flash on screen is showing, so it can be revoked when the next
  // picture (or the unmount) takes its place.
  const urlRef = useRef<string | null>(null);
  // Guards a torn-down page: a capture in flight outlives the component that
  // asked for it, and setting state on the way back would be a leak of its own.
  const liveRef = useRef(true);

  const drop = useCallback(() => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = null;
    window.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
      drop();
    };
  }, [drop]);

  const takeScreenshot = useCallback(
    (label: string) => {
      const root = rootRef.current;
      if (!root) return;
      // The shutter fires on the PRESS, not on the encode: a camera noise that
      // arrived a beat after the button would read as lag rather than as a
      // camera.
      playUiSound(synth, "shutter");
      void captureScreen(root, label).then((capture) => {
        if (!capture) return;
        if (!liveRef.current) {
          URL.revokeObjectURL(capture.url);
          return;
        }
        drop();
        urlRef.current = capture.url;
        setFlash({
          id: capture.meta.id,
          url: capture.url,
          label: capture.meta.label,
        });
        timerRef.current = window.setTimeout(() => {
          setFlash(null);
        }, SHOT_FLASH_TTL_MS);
      });
    },
    [drop, rootRef],
  );

  return { flash, shotFlashElRef, takeScreenshot };
}
