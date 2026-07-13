// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NEW GAME — the hero-creation form. Reached from the title menu by PLAY → NEW
// GAME (or straight away when the roster is empty — there is nothing to load).
// The player names the hero (drawn in the game's pixel font, not a browser
// textbox font) and chooses HARDCORE, where the permadeath choice belongs.
// CREATE mints the hero and hands it up via `onCreate`; CANCEL backs out via
// `onCancel` (to the roster if there are heroes to fall back on, else the
// title).

import { useEffect, useState, type CSSProperties } from "react";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";

import {
  spriteCursor,
  loadGameAssets,
  peekGameAssets,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { playUiSound } from "./sfx/index.ts";

const MAX_NAME = 14;

/**
 * The hero-name field, drawn in the game's pixel font rather than a browser
 * textbox font. A real `<input>` sits transparent on top (it owns focus, the
 * caret, IME and the mobile keyboard); the visible glyphs are a PixelText of
 * the current value laid over it, with a blinking block caret at the end while
 * focused — the retro name-entry look. An empty, unfocused field shows a dim
 * placeholder.
 */
function PixelNameInput({
  font,
  value,
  onChange,
  onSubmit,
}: {
  font: PixelFont;
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div className={`pixel-input${focused ? " focused" : ""}`}>
      <div className="pixel-input-display" aria-hidden="true">
        {value ? (
          <PixelText font={font} text={value} scale={3} color="#ffd75e" />
        ) : (
          !focused && (
            <PixelText font={font} text="HERO" scale={3} color="#4a515c" />
          )
        )}
        {focused && <span className="pixel-caret" />}
      </div>
      <input
        className="pixel-input-field"
        aria-label="character-name"
        value={value}
        maxLength={MAX_NAME}
        autoFocus
        spellCheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) =>
          onChange(e.target.value.toUpperCase().slice(0, MAX_NAME))
        }
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit();
        }}
        placeholder="HERO"
      />
    </div>
  );
}

export function NewGame({
  onCreate,
  onCancel,
}: {
  /** Mint the hero with this name and hardcore choice, then play on. */
  onCreate: (name: string, hardcore: boolean) => void;
  /** Back out of creation without minting anyone. */
  onCancel: () => void;
}) {
  const [assets, setAssets] = useState<GameAssets | null>(peekGameAssets);
  const [name, setName] = useState("");
  const [hardcore, setHardcore] = useState(false);
  // Track the viewport width so the HARDCORE blurb can be wrapped to the form's
  // width — the long "ONE LIFE…" line runs off a narrow phone otherwise.
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);

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

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  if (!assets) return <div className="game-loading">Loading…</div>;
  const font = assets.font;
  // The blurb wrap budget in rem, tracking the form's rendered width (it is
  // `min(90vw, 28rem)` minus the form + toggle padding). Clamped so it never
  // collapses on a very narrow screen. Matches the maxWidth PixelText wraps to.
  const blurbMaxWidth = Math.max(
    10,
    Math.min(28, (viewportWidth * 0.9) / 16) - 5,
  );
  const menuCursor = spriteCursor(assets.sprites, "glove", {
    hotX: 3.5,
    hotY: 0.5,
    fallback: "default",
  });

  const create = () => {
    playUiSound(synth, "start");
    onCreate(name, hardcore);
  };

  return (
    <div
      className="title-screen character-screen"
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <div className="title-stars" aria-hidden="true" />

      <div className="title-content">
        <header className="character-heading">
          <PixelText font={font} text="NEW HERO" scale={3} color="#ffd75e" />
        </header>

        <div className="character-form" aria-label="create character">
          <label className="character-field">
            <PixelText font={font} text="NAME" scale={2} color="#9aa3ad" />
            <PixelNameInput
              font={font}
              value={name}
              onChange={setName}
              onSubmit={create}
            />
          </label>

          <button
            type="button"
            className={`menu-item character-toggle${hardcore ? " on" : ""}`}
            aria-label="character-hardcore"
            onClick={() => {
              playUiSound(synth, "confirm");
              setHardcore((h) => !h);
            }}
          >
            <span className="menu-item-text">
              <span className="character-toggle-head">
                <PixelText
                  font={font}
                  text="HARDCORE"
                  scale={3}
                  color={hardcore ? "#ff6d6d" : "#9aa3ad"}
                />
                <span
                  className={`character-toggle-state${hardcore ? " on" : ""}`}
                >
                  <PixelText
                    font={font}
                    text={hardcore ? "ON" : "OFF"}
                    scale={2}
                    color={hardcore ? "#ff6d6d" : "#7f8894"}
                  />
                </span>
              </span>
              <span className="menu-item-blurb">
                <PixelText
                  font={font}
                  text={
                    hardcore
                      ? "ONE LIFE - DEATH RETIRES THIS HERO FOREVER"
                      : "SOFTCORE - DEATH KEEPS YOUR PROGRESS"
                  }
                  scale={2}
                  color="#9aa3ad"
                  maxWidth={blurbMaxWidth}
                />
              </span>
            </span>
          </button>

          <div className="character-actions">
            <button
              type="button"
              className="pixel-button character-confirm"
              aria-label="character-create"
              onClick={create}
            >
              <PixelText font={font} text="CREATE" scale={3} color="#0b0d10" />
            </button>
            <button
              type="button"
              className="pixel-button secondary character-cancel"
              aria-label="character-cancel"
              onClick={() => {
                playUiSound(synth, "back");
                onCancel();
              }}
            >
              <PixelText font={font} text="CANCEL" scale={3} color="#9aa3ad" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
