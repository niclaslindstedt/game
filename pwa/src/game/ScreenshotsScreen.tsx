// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SCREENSHOT GALLERY — the pictures the player took, browsed inside the
// game. Reached from the title menu's EXTRAS → SCREENSHOTS row, and mid-run by
// pressing the flash the SCREENSHOT bind raises (the run freezes behind it,
// exactly as it does for the trophy shelf).
//
// A VIEWER, NOT A GRID. The player took a handful of pictures and wants to look
// at them, so the picture is the screen: one shot fills the panel, and the roll
// is a filmstrip under it. Flipping is the primary verb — arrow keys, the two
// arrows either side, or a thumbnail — because "show me the next one" is what
// somebody opening a screenshot gallery is doing, and a grid would make them
// press twice for it.
//
// SENDING ONE ON is the other half, and what it means is the platform's answer
// rather than ours (@ui/lib/share-image.ts, ../app/screenshot-bridge.ts). Every
// button here is offered only where it will actually do something:
//
//   SHARE  the platform's own sheet — Messages, Mail, whatever chat app the
//          player uses, the camera roll. A phone always has one; a store shell
//          raises its own; desktop Safari and Windows Chrome have one too,
//          which is why this is never gated on "is this touch".
//   COPY   the clipboard, as a PNG. The desktop answer where there is no sheet:
//          a paste target is always one window away.
//   SAVE   a file. The floor — every build can do this one.
//
// It wears the arsenal's shelf skin, like every other full-screen browser in
// the game, so the four of them read as one family.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";
import {
  canCopyImage,
  canShareImage,
  copyImage,
  pngFile,
  saveImage,
  shareImage,
} from "@ui/lib/share-image.ts";
import {
  deleteShot,
  loadShots,
  shot,
  subscribeShots,
  type ShotMeta,
} from "@ui/lib/shot-store.ts";

import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/ui.ts";
import { armScreenshots, MAX_SHOTS, shotFileName } from "./screenshots.ts";
import {
  fetchShotsStatus,
  shareShotViaShell,
  shotsBridgeAvailable,
  type ShotsStatus,
} from "../app/screenshot-bridge.ts";

const BODY = "#9aa3ad";
const DIM = "#7a8088";
const ACCENT = "#7fd4ff";

/** How long a result line ("COPIED", "SAVED") stays under the buttons. */
const NOTICE_MS = 2400;

export function ScreenshotsScreen({
  font,
  closeKey,
  keyName,
  /** Open on this picture rather than the newest — what pressing the flash
   * mid-run passes, so the shot you just took is the one you are looking at. */
  startId,
  onClose,
}: {
  font: PixelFont;
  /** The physical code of the SCREENSHOT bind, so the key that took the
   * picture also closes the gallery it opened. Omit for ESC only. */
  closeKey?: string;
  /** That bind's PRINTABLE name ("F12"), for the empty state — which is the
   * one place in the game the feature is explained, so it has to name the key
   * the player actually holds rather than send them to a settings page.
   * Passed in already formatted: both callers hold the settings, and reaching
   * for the startup path's settings module from inside this LAZY chunk was
   * measured to re-cut the bundle (see AchievementsScreen). */
  keyName?: string;
  startId?: string;
  onClose: () => void;
}) {
  const [shots, setShots] = useState<readonly ShotMeta[]>([]);
  const [index, setIndex] = useState(0);
  // Whether the roll's first arrival has already moved the cursor to `startId`.
  // A ref rather than state: it changes exactly once, inside the subscription,
  // and nothing renders on it.
  const homedRef = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<ShotsStatus | null>(null);
  // Two-step delete: at this size a stray press must not destroy a picture the
  // player cannot get back.
  const [confirmDelete, setConfirmDelete] = useState(false);

  // The roll, live: a capture taken while the gallery is up (the run keeps
  // playing behind the in-run copy only until it freezes, but a delete from
  // another mount is real) re-renders the strip.
  useEffect(() => {
    // Name the store before reading it — an unnamed one is a different
    // database, and this mount may be the session's first touch of the roll
    // (the title menu's row, with no run ever started).
    armScreenshots();
    void loadShots();
    return subscribeShots((next) => {
      // Land on the picture the caller named, once, the first time the roll
      // actually has anything in it (the read is asynchronous, so the first
      // delivery is routinely empty).
      if (!homedRef.current && next.length > 0) {
        homedRef.current = true;
        const at =
          startId === undefined
            ? -1
            : next.findIndex((entry) => entry.id === startId);
        if (at >= 0) setIndex(at);
      }
      setShots(next);
    });
    // `startId` is the OPENING picture and is read once, by design: a caller
    // that changed it mid-browse would yank the picture out from under the
    // player's own flipping.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the shell will do with a picture — only ever "yes" inside a store
  // build. Asked once: the answer is a property of the build, not of the shot.
  useEffect(() => {
    if (!shotsBridgeAvailable()) return;
    let live = true;
    void fetchShotsStatus().then((next) => {
      if (live) setStatus(next);
    });
    return () => {
      live = false;
    };
  }, []);

  // A delete can shorten the roll under the cursor.
  const current = shots[Math.min(index, Math.max(0, shots.length - 1))] ?? null;

  const say = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(
      () => setNotice((held) => (held === text ? null : held)),
      NOTICE_MS,
    );
  }, []);

  const step = useCallback(
    (delta: number) => {
      if (shots.length < 2) return;
      playUiSound(synth, "move");
      setConfirmDelete(false);
      setIndex((at) => (at + delta + shots.length) % shots.length);
    },
    [shots.length],
  );

  // The pixels for the picture on screen. Minted once per picture and revoked
  // when it changes — an object URL made in the render body would leak one per
  // frame, and a browse of fifty shots would hold fifty live blobs.
  const url = useMemo(() => {
    const entry = current ? shot(current.id) : null;
    return entry ? URL.createObjectURL(entry.blob) : null;
  }, [current]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);

  const file = useMemo(() => {
    const entry = current ? shot(current.id) : null;
    if (!entry) return null;
    return pngFile(entry.blob, shotFileName(entry.label, entry.takenAt));
  }, [current]);

  // The share sheet: the shell's own where there is one (a WebView on Android
  // has no Web Share API at all), the browser's otherwise.
  const shellShare = status?.canShare === true;
  const canShare = shellShare || (file !== null && canShareImage(file));
  const canCopy = canCopyImage();

  const doShare = useCallback(async () => {
    if (!file) return;
    playUiSound(synth, "confirm");
    // The gesture is spent by the first await, so the shell path (which has to
    // base64 the picture) is only taken where the browser has no sheet at all.
    const ok = shellShare
      ? await shareShotViaShell(file.name, file)
      : await shareImage(file, { title: "SCREENSHOT", text: current?.label });
    if (!ok) say("SHARE CANCELLED");
  }, [current?.label, file, say, shellShare]);

  const doCopy = useCallback(async () => {
    if (!file) return;
    playUiSound(synth, "confirm");
    say((await copyImage(file)) ? "COPIED" : "COPY REFUSED");
  }, [file, say]);

  const doSave = useCallback(() => {
    if (!file) return;
    playUiSound(synth, "confirm");
    say(saveImage(file, file.name) ? "SAVED" : "SAVE REFUSED");
  }, [file, say]);

  const doDelete = useCallback(() => {
    if (!current) return;
    if (!confirmDelete) {
      playUiSound(synth, "move");
      setConfirmDelete(true);
      return;
    }
    playUiSound(synth, "back");
    setConfirmDelete(false);
    void deleteShot(current.id);
  }, [confirmDelete, current]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" || event.key === "ArrowDown") {
        event.preventDefault();
        step(1);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
        event.preventDefault();
        step(-1);
      } else if (
        event.key === "Escape" ||
        (closeKey !== undefined && event.code === closeKey)
      ) {
        event.preventDefault();
        playUiSound(synth, "back");
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeKey, onClose, step]);

  // Wide viewports have room for the whole caption on one line beside the
  // count; a phone stacks it. Same breakpoint the other browsers use.
  const wide = useMediaQuery("(min-aspect-ratio: 4/3)");

  return (
    <div className="arsenal-overlay shots-overlay">
      <div className="arsenal-panel shots-panel">
        <PixelText font={font} text="SCREENSHOTS" scale={3} color={ACCENT} />

        {shots.length === 0 ? (
          <div className="shots-empty">
            <PixelText
              font={font}
              text="NOTHING HERE YET"
              scale={2}
              color={BODY}
            />
            <PixelText
              font={font}
              text={
                keyName
                  ? `PRESS ${keyName} DURING A RUN TO TAKE ONE`
                  : "THE SCREENSHOT KEY TAKES ONE - SETTINGS - CONTROLS"
              }
              scale={2}
              color={DIM}
              maxWidth={22}
            />
          </div>
        ) : (
          <>
            <div className="shots-stage">
              <button
                type="button"
                className="pixel-button shots-step"
                aria-label="previous-screenshot"
                disabled={shots.length < 2}
                onClick={() => step(-1)}
              >
                <PixelText font={font} text="◀" scale={3} color="#0b0d10" />
              </button>
              <div className="shots-frame">
                {url && <img src={url} alt="" className="shots-img" />}
              </div>
              <button
                type="button"
                className="pixel-button shots-step"
                aria-label="next-screenshot"
                disabled={shots.length < 2}
                onClick={() => step(1)}
              >
                <PixelText font={font} text="▶" scale={3} color="#0b0d10" />
              </button>
            </div>

            <div className={`shots-caption${wide ? " is-wide" : ""}`}>
              <PixelText
                font={font}
                text={current?.label.toUpperCase() ?? ""}
                scale={2}
                color={BODY}
                maxWidth={wide ? 22 : 14}
              />
              <PixelText
                font={font}
                text={`${index + 1}/${shots.length} - ${stamp(current)}`}
                scale={1}
                color={DIM}
              />
            </div>

            {/* The filmstrip: the whole roll, newest first, the shown picture
                framed. Scrolls on its own so a full roll never grows the
                panel past the viewport. */}
            <div className="shots-strip" role="list">
              {shots.map((entry, at) => (
                <button
                  key={entry.id}
                  type="button"
                  role="listitem"
                  className={`shots-thumb${at === index ? " selected" : ""}`}
                  aria-label={`screenshot ${at + 1}`}
                  onClick={() => {
                    playUiSound(synth, "move");
                    setConfirmDelete(false);
                    setIndex(at);
                  }}
                >
                  <Thumb id={entry.id} />
                </button>
              ))}
            </div>
          </>
        )}

        <div className="achievements-actions shots-actions">
          {shots.length > 0 && canShare && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="share-screenshot"
              onClick={() => void doShare()}
            >
              <PixelText font={font} text="SHARE" scale={2} color={ACCENT} />
            </button>
          )}
          {shots.length > 0 && canCopy && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="copy-screenshot"
              onClick={() => void doCopy()}
            >
              <PixelText font={font} text="COPY" scale={2} color={ACCENT} />
            </button>
          )}
          {shots.length > 0 && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="save-screenshot"
              onClick={doSave}
            >
              <PixelText font={font} text="SAVE" scale={2} color={ACCENT} />
            </button>
          )}
          {shots.length > 0 && (
            <button
              type="button"
              className="pixel-button secondary"
              aria-label="delete-screenshot"
              onClick={doDelete}
            >
              <PixelText
                font={font}
                text={confirmDelete ? "SURE?" : "DELETE"}
                scale={2}
                color={confirmDelete ? "#ff8b6b" : DIM}
              />
            </button>
          )}
          <button
            type="button"
            className="pixel-button achievements-close"
            aria-label="screenshots-back"
            onClick={() => {
              playUiSound(synth, "back");
              onClose();
            }}
          >
            <PixelText font={font} text="BACK" scale={2} color="#0b0d10" />
          </button>
        </div>

        {/* One status line, and it says whichever is worth saying: the result
            of the last button, or — in a store shell — where a copy of every
            picture is already being filed. */}
        <div className="shots-notice">
          <PixelText
            font={font}
            text={notice ?? shelfLine(status, shots.length)}
            scale={1}
            color={notice ? ACCENT : DIM}
            maxWidth={26}
          />
        </div>
      </div>
    </div>
  );
}

/** A filmstrip thumbnail. Its own component so each object URL is minted and
 * revoked with the tile that shows it, however the strip is reshuffled. */
function Thumb({ id }: { id: string }) {
  const url = useMemo(() => {
    const entry = shot(id);
    return entry ? URL.createObjectURL(entry.blob) : null;
  }, [id]);
  useEffect(() => (url ? () => URL.revokeObjectURL(url) : undefined), [url]);
  return url ? <img src={url} alt="" className="shots-thumb-img" /> : null;
}

/** The picture's own date, in the reader's locale. */
function stamp(meta: ShotMeta | null): string {
  if (!meta) return "";
  const at = new Date(meta.takenAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

/** The resting status line: what the shell is doing with the pictures, or how
 * full the roll is. */
function shelfLine(status: ShotsStatus | null, count: number): string {
  if (status?.steamOverlay) {
    return "STEAM FILES ITS OWN COPY IN YOUR SCREENSHOT LIBRARY";
  }
  if (status?.available && status.folder) {
    return `ALSO SAVED TO ${status.folder.toUpperCase()}`;
  }
  // An empty roll has nothing to say about how full it is, and the empty state
  // above has already said the only thing worth saying.
  if (count === 0) return "";
  return `${count}/${MAX_SHOTS} KEPT - THE OLDEST FALLS OFF`;
}
