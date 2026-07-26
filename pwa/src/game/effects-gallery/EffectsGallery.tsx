// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer EFFECTS GALLERY (`?effects`): every visual effect the game ships,
// each staged as a REAL fullscreen game situation — the nuke over a horde, the
// ding at the level cap, a bolt cracking down on a posed crowd, every signature
// blade, every talent — playing on a loop.
//
// Browse with the side buttons (or ←/→), or swipe the field on a touch device;
// each button carries the ICON of the exhibit it leads to. ↑/↓ jump a whole
// SHELF at a time (IMPACT → MELEE → SHOTS → POWERS → TALENTS → WORLD), which is
// what makes a catalog this size walkable. The search box narrows it ("nuke",
// "unique slash", "frost"). Nothing sits over the field: the show loops on its
// own, and a tap on it (or Enter) runs it again on the spot. H hides the
// gallery's own chrome, so an effect can be judged — or screenshotted — with
// nothing over it. ESC backs out. Reached from the hidden DEVELOPER menu, or
// straight in through its URL.
//
// The staging is the engine's own scenario system (`src/game/scenario.ts`) and
// the drawing is the game's own FX pipeline — this screen only frames them, so
// nothing here can drift from what ships.

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useMediaQuery } from "@ui/lib/use-media-query.ts";

import {
  loadGameAssets,
  peekGameAssets,
  spriteCursor,
  spriteDataUrl,
  type GameAssets,
  type Sprites,
} from "../assets.ts";
import { synth } from "../audio.ts";
import { LoadingScreen } from "../LoadingScreen.tsx";
import { playUiSound } from "../sfx/index.ts";
import { effectsCatalog, searchExhibits } from "./effects-catalog.ts";
import type { Exhibit } from "./exhibit-kit.ts";
import {
  EXHIBIT_SPEEDS,
  runExhibit,
  speedLabel,
  type ExhibitRun,
} from "./run-exhibit.ts";

/** How far a drag must travel (CSS px) before it counts as a swipe rather than
 * a tap. A thumb's flick on a phone clears this easily; a tap never does. */
const SWIPE_PX = 44;
/** Above this much vertical travel the gesture is a scroll, not a page turn. */
const SWIPE_SLOP_PX = 60;
const MAX_QUERY = 22;

/** An exhibit's own sprite, at the gallery's icon size. */
function ExhibitIcon({
  sprites,
  name,
  alt = "",
}: {
  sprites: Sprites;
  name: string;
  alt?: string;
}) {
  const src = spriteDataUrl(sprites, name);
  if (!src) return null;
  return (
    <img
      src={src}
      alt={alt}
      className="pixel-img gallery-icon"
      draggable={false}
    />
  );
}

/** The search box: the game's pixel glyphs with a real (transparent) input on
 * top owning focus, the caret and the mobile keyboard — the same construction
 * the hero-name field uses (NewGame.tsx). */
function GallerySearch({
  font,
  value,
  onChange,
}: {
  font: PixelFont;
  value: string;
  onChange: (next: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`pixel-input gallery-search${focused ? " focused" : ""}`}>
      <div className="pixel-input-display" aria-hidden="true">
        {value ? (
          <PixelText font={font} text={value} scale={2} color="#7ef0c8" />
        ) : (
          !focused && (
            <PixelText font={font} text="SEARCH" scale={2} color="#4a515c" />
          )
        )}
        {focused && <span className="pixel-caret" />}
      </div>
      <input
        className="pixel-input-field"
        aria-label="gallery-search"
        value={value}
        maxLength={MAX_QUERY}
        spellCheck={false}
        autoComplete="off"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="SEARCH"
      />
    </div>
  );
}

export function EffectsGallery({
  initialId,
  initialSpeed,
  onClose,
}: {
  /** Open straight on this exhibit id (the `?effects=<id>` deep link). An
   * unknown id falls back to the head of the catalog. */
  initialId?: string;
  /** Open at this playback speed (the `?speed=` deep-link param) — what the
   * contact-sheet script sets so a whole catalog can be shot in slow motion. */
  initialSpeed?: number;
  /** Leave the gallery (the BACK button and ESC). */
  onClose: () => void;
}) {
  // The gallery loads its own assets, so it works both as a menu destination and
  // as a standalone `?effects` workbench. Coming from the title
  // screen they are already in hand (peek), so there is no loading flash.
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nukeFxRef = useRef<HTMLDivElement>(null);
  const levelUpFxRef = useRef<HTMLDivElement>(null);
  // The live staged run, so the field's tap (and PLAY) can run the show again
  // without rebuilding the diorama.
  const runRef = useRef<ExhibitRun | null>(null);
  const [query, setQuery] = useState("");
  // H: strip the gallery's own chrome, leaving the effect alone in the frame —
  // what the contact-sheet script presses before it shoots.
  const [chromeOff, setChromeOff] = useState(false);
  // SLOW MOTION (S, or the SPEED chip): the FX iteration loop's magnifying
  // glass. A burst that is over in a fifth of a second cannot be judged at full
  // speed — at an eighth it plays as beats you can actually name.
  const [speed, setSpeed] = useState<number>(() => {
    const wanted = initialSpeed ?? 1;
    return EXHIBIT_SPEEDS.find((s) => Math.abs(s - wanted) < 1e-6) ?? 1;
  });

  const catalog = useMemo(() => effectsCatalog(), []);
  // The exhibit under inspection, by id — searching narrows the catalog around
  // it rather than jumping the selection somewhere else.
  const [selectedId, setSelectedId] = useState(
    () =>
      (initialId && catalog.some((e) => e.id === initialId)
        ? initialId
        : catalog[0]?.id) ?? "",
  );

  // A mouse CLICKS the side buttons; a touch device swipes the field. The same
  // probe the menus use for their cursor/icon swap, so plugging a mouse into a
  // tablet re-words the hint live.
  const finePointer = useMediaQuery("(any-pointer: fine)");
  // The caption wraps to the SCREEN, not to a fixed budget: a blurb sized for
  // the landscape reference runs clean off both edges of a portrait phone (the
  // pixel font wraps in rem, so the budget has to track the viewport — the same
  // reasoning as the title menu's `blurbMaxWidth`).
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  // 92% of the width, in rem — clamped so it neither collapses on a narrow
  // phone nor sprawls into an unreadable single line on a desktop.
  const blurbWidth = Math.max(14, Math.min(44, (viewportWidth * 0.92) / 16));
  // A narrow screen drops the name a size, so a long one (LEVEL UP - EARLY
  // DING) still fits on its own line instead of wrapping under its icon.
  const titleScale = viewportWidth < 520 ? 2 : 3;

  const matches = useMemo(
    () => searchExhibits(catalog, query),
    [catalog, query],
  );
  // Where the selection sits in the CURRENT match list. A search that filters
  // the selected exhibit away lands on the first match instead.
  const at = Math.max(
    0,
    matches.findIndex((e) => e.id === selectedId),
  );
  const exhibit: Exhibit | undefined = matches[at];
  // The exhibits the browse buttons lead to — each button wears that exhibit's
  // own icon, so browsing reads as walking a shelf of things.
  const wrap = (delta: number) =>
    matches.length > 0
      ? matches[(at + delta + matches.length) % matches.length]
      : undefined;
  const prev = wrap(-1);
  const next = wrap(1);

  useEffect(() => {
    if (assets) return;
    let live = true;
    void loadGameAssets().then((loaded) => {
      if (live) setAssets(loaded);
    });
    return () => {
      live = false;
    };
  }, [assets]);

  // Walk the match ring. Wraps, so browsing never dead-ends on the last entry.
  const stepTo = (delta: number) => {
    const target = wrap(delta);
    if (!target || target.id === selectedId) return;
    playUiSound(synth, "move");
    setSelectedId(target.id);
  };

  // Jump a whole SHELF: the head of the next (or previous) group in the match
  // list. With a hundred exhibits, walking one at a time from IMPACT to WORLD is
  // no way to get anywhere — this is the catalog's chapter jump.
  const jumpShelf = (delta: number) => {
    if (matches.length === 0 || !exhibit) return;
    const shelves = [...new Set(matches.map((e) => e.group))];
    const here = shelves.indexOf(exhibit.group);
    const next = shelves[(here + delta + shelves.length) % shelves.length];
    // Stepping back from mid-shelf lands on the head of THIS shelf first, the
    // way a chapter-back button does.
    const head = matches.find((e) => e.group === next);
    const shelfHead = matches.find((e) => e.group === exhibit.group);
    const target =
      delta < 0 && shelfHead && shelfHead.id !== exhibit.id ? shelfHead : head;
    if (!target || target.id === selectedId) return;
    playUiSound(synth, "confirm");
    setSelectedId(target.id);
  };

  const replay = () => {
    playUiSound(synth, "confirm");
    runRef.current?.replay();
  };

  // Step down the speed ladder and wrap back to full — one control, so it works
  // the same under a thumb on the chip and under S on a keyboard.
  const cycleSpeed = () => {
    playUiSound(synth, "move");
    setSpeed((current) => {
      const i = EXHIBIT_SPEEDS.indexOf(
        current as (typeof EXHIBIT_SPEEDS)[number],
      );
      return EXHIBIT_SPEEDS[(i + 1) % EXHIBIT_SPEEDS.length] ?? 1;
    });
  };

  const close = () => {
    playUiSound(synth, "back");
    onClose();
  };

  // Build (and rebuild) the staged run for the selected exhibit. One exhibit =
  // one engine state; browsing tears the old diorama down and stands up the new.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !exhibit || !assets) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const run = runExhibit({
      exhibit,
      canvas,
      ctx,
      assets,
      nukeFxRef,
      levelUpFxRef,
      speed,
    });
    runRef.current = run;
    return () => {
      runRef.current = null;
      run.stop();
    };
    // `speed` is deliberately NOT a dependency: changing it pushes into the
    // live run (below) instead of tearing the diorama down and re-staging it,
    // so slowing an effect down mid-show keeps the show.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exhibit, assets]);

  useEffect(() => {
    runRef.current?.setSpeed(speed);
  }, [speed]);

  // Doom-menu keys: ←/→ walk the catalog, Enter replays, ESC backs out. While
  // the search box has focus the arrows belong to its caret, so only ESC (which
  // blurs it) and Enter (replay) are taken there.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const typing =
        event.target instanceof HTMLElement && event.target.tagName === "INPUT";
      if (event.key === "Escape") {
        event.preventDefault();
        if (typing) {
          (event.target as HTMLInputElement).blur();
          return;
        }
        close();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        replay();
        return;
      }
      if (typing) return;
      if (event.key === "s" || event.key === "S") {
        event.preventDefault();
        cycleSpeed();
        return;
      }
      if (event.key === "h" || event.key === "H") {
        event.preventDefault();
        setChromeOff((off) => !off);
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        stepTo(1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepTo(-1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        jumpShelf(1);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        jumpShelf(-1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // `stepTo`/`replay`/`close` close over this render's match list — rebinding
    // per render is what keeps the keys steering the CURRENT search.
  });

  // The field's gesture (touch): a horizontal flick turns the page, like a photo
  // roll; anything shorter is a tap that replays the show.
  const dragRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const onPointerDown = (event: ReactPointerEvent) => {
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      id: event.pointerId,
    };
  };
  const onPointerUp = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dy) > SWIPE_SLOP_PX) return;
    if (dx <= -SWIPE_PX) stepTo(1);
    else if (dx >= SWIPE_PX) stepTo(-1);
    else replay();
  };

  if (!assets) return <LoadingScreen />;
  const font = assets.font;
  const sprites = assets.sprites;
  const cursor =
    spriteCursor(sprites, "glove", {
      hotX: 3.5,
      hotY: 0.5,
      fallback: "default",
    }) ?? "default";

  return (
    <div
      className={`effects-gallery${chromeOff ? " chrome-off" : ""}`}
      style={{ "--menu-cursor": cursor } as CSSProperties}
    >
      {/* The staged game itself — the whole screen, under all the chrome. */}
      <canvas
        ref={canvasRef}
        className="game-canvas"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          dragRef.current = null;
        }}
      />

      {/* The two full-screen CSS bursts the run fires into (the nuke's flash /
          fire / smoke and the ding's light explosion), exactly as the playing
          screen mounts them. */}
      <div ref={nukeFxRef} className="nuke-fx-layer" aria-hidden="true" />
      <div ref={levelUpFxRef} className="levelup-fx-layer" aria-hidden="true" />

      <header className="gallery-bar">
        <button
          type="button"
          className="pixel-button secondary gallery-back"
          aria-label="gallery-back"
          onClick={close}
        >
          <PixelText font={font} text="BACK" scale={2} color="#9aa3ad" />
        </button>
        <GallerySearch font={font} value={query} onChange={setQuery} />
        {/* SPEED: tap to step 1X → 1/2X → 1/4X → 1/8X and back. Lit whenever
            the diorama is running slow, so a screenshot can never quietly be a
            slow-motion one. */}
        <button
          type="button"
          className={`pixel-button secondary gallery-speed${
            speed < 1 ? " is-slow" : ""
          }`}
          aria-label="gallery-speed"
          onClick={cycleSpeed}
        >
          <PixelText
            font={font}
            text={speedLabel(speed)}
            scale={2}
            color={speed < 1 ? "#7ef0c8" : "#9aa3ad"}
          />
        </button>
        <span className="gallery-count">
          {exhibit && (
            <span className="gallery-group">
              <PixelText
                font={font}
                text={exhibit.group}
                scale={1}
                color="#0b0d10"
              />
            </span>
          )}
          <PixelText
            font={font}
            text={
              matches.length === 0 ? "0 HITS" : `${at + 1}/${matches.length}`
            }
            scale={2}
            color="#cdd3dc"
          />
        </span>
      </header>

      {/* The browse buttons — how a pointer walks the shelf (a thumb swipes the
          field instead). Each carries the icon of the exhibit it leads to, so
          what is next is visible before pressing it. */}
      <button
        type="button"
        className="pixel-button secondary gallery-arrow prev"
        aria-label="gallery-prev"
        onClick={() => stepTo(-1)}
      >
        <span className="gallery-arrow-glyph" aria-hidden="true" />
        {prev && <ExhibitIcon sprites={sprites} name={prev.icon} />}
      </button>
      <button
        type="button"
        className="pixel-button secondary gallery-arrow next"
        aria-label="gallery-next"
        onClick={() => stepTo(1)}
      >
        {next && <ExhibitIcon sprites={sprites} name={next.icon} />}
        <span className="gallery-arrow-glyph" aria-hidden="true" />
      </button>

      <footer className="gallery-caption" aria-live="polite">
        {exhibit ? (
          <>
            <span className="gallery-title">
              <ExhibitIcon
                sprites={sprites}
                name={exhibit.icon}
                alt={exhibit.label}
              />
              <PixelText
                font={font}
                text={exhibit.label}
                scale={titleScale}
                color="#ffd75e"
              />
            </span>
            <PixelText
              font={font}
              text={exhibit.blurb}
              scale={2}
              color="#9aa3ad"
              maxWidth={blurbWidth}
            />
            <PixelText
              font={font}
              text={
                finePointer
                  ? "ARROWS BROWSE - UP/DOWN JUMPS SHELF - ENTER REPLAYS - H HIDES THIS"
                  : "SWIPE TO BROWSE - TAP TO REPLAY"
              }
              scale={1}
              color="#6b7480"
            />
          </>
        ) : (
          <PixelText
            font={font}
            text={`NO EFFECT MATCHES "${query}"`}
            scale={2}
            color="#ff6d6d"
            maxWidth={blurbWidth}
          />
        )}
      </footer>
    </div>
  );
}
