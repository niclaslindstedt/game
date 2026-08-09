// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// NEW GAME — the hero-creation form. Reached from the title menu by PLAY → NEW
// GAME (or straight away when the roster is empty — there is nothing to load).
// The player names the hero (drawn in the game's pixel font, not a browser
// textbox font) and chooses HARDCORE, where the permadeath choice belongs.
// CREATE mints the hero and hands it up via `onCreate`; CANCEL backs out via
// `onCancel` (to the roster if there are heroes to fall back on, else the
// title).

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import { useAutoFocus } from "@ui/lib/auto-focus.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import {
  useCenterWhileFocused,
  useVisualViewportBox,
} from "@ui/lib/visual-viewport.ts";

import {
  spriteCursor,
  loadGameAssets,
  peekGameAssets,
  type GameAssets,
} from "./assets.ts";
import { synth } from "./audio.ts";
import { characterNameTaken, loadCharacters } from "./characters.ts";
import {
  clampHeroName,
  DEFAULT_HERO_NAME,
  heroName,
  heroNameDisplay,
  MAX_HERO_NAME,
} from "./hero-name.ts";
import { LoadingScreen } from "./LoadingScreen.tsx";
import { playUiSound } from "./sfx/ui.ts";

/**
 * The hero-name field, drawn in the game's pixel font rather than a browser
 * textbox font. A real `<input>` sits transparent on top (it owns focus, the
 * caret, IME and the mobile keyboard); the visible glyphs are a PixelText of
 * the current value laid over it, with a blinking block caret at the end while
 * focused — the retro name-entry look. An empty, unfocused field shows a dim
 * placeholder.
 *
 * The input holds the text VERBATIM — the uppercase look is the display's job
 * (`heroNameDisplay`) and the uppercase name is minted on submit. Rewriting the
 * value on every keystroke would break iOS autocomplete: see hero-name.ts.
 *
 * Every edit that lands ticks the letter-print blip — the same `ui_blip` the
 * dialogue crawl prints its characters with — so naming a hero sounds like the
 * game typing his name out. A rubbed-out character ticks too: the sound marks a
 * KEYSTROKE THAT CHANGED THE FIELD, not a glyph appearing, which is why
 * backspace is voiced and a keypress against the full name budget is not.
 */
function PixelNameInput({
  font,
  value,
  invalid,
  canSubmit,
  inputRef,
  onChange,
  onSubmit,
}: {
  font: PixelFont;
  value: string;
  /** The typed name is one the roster already has — light the frame red, the
   * same way the menu's prompt marks an address that does not parse. */
  invalid: boolean;
  /** Whether ENTER may mint the hero this keystroke. */
  canSubmit: boolean;
  /** Held by the form above, which puts the caret back in here when it turns a
   * press down — a refused CREATE has already taken focus off the field, and on
   * a phone that takes the keyboard with it. */
  inputRef: RefObject<HTMLInputElement>;
  onChange: (next: string) => void;
  onSubmit: () => void;
}) {
  const [focused, setFocused] = useState(false);
  // While the field is focused, keep it centred in the band the on-screen
  // keyboard leaves visible — otherwise the scrollable form stays top-anchored
  // and the input ends up cut off right at the keyboard's edge (iOS).
  const boxRef = useRef<HTMLDivElement>(null);
  // The form is here to be typed into, so the field takes focus itself — and
  // imperatively, because NEW GAME is reached by pressing a menu row and a
  // clicked row keeps focus long enough for the `autoFocus` prop to be dropped
  // (@ui/lib/auto-focus.ts). That call is also where the KEYBOARD the press
  // armed is handed over, which is the half a desktop never sees.
  useAutoFocus(inputRef);
  useCenterWhileFocused(boxRef, focused);
  return (
    <div
      ref={boxRef}
      className={`pixel-input${focused ? " focused" : ""}${
        invalid ? " invalid" : ""
      }`}
    >
      <div className="pixel-input-display" aria-hidden="true">
        {value ? (
          <PixelText
            font={font}
            text={heroNameDisplay(value)}
            scale={3}
            color={invalid ? "#ff6d6d" : "#ffd75e"}
          />
        ) : (
          !focused && (
            <PixelText
              font={font}
              text={DEFAULT_HERO_NAME}
              scale={3}
              color="#4a515c"
            />
          )
        )}
        {focused && <span className="pixel-caret" />}
      </div>
      <input
        ref={inputRef}
        className="pixel-input-field"
        aria-label="character-name"
        value={value}
        maxLength={MAX_HERO_NAME}
        // Only the spelling underline is off (the glyphs below are the visible
        // text); iOS autocorrect/predictive text stays ON so a tapped
        // suggestion fills the field.
        spellcheck={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const next = clampHeroName(e.currentTarget.value);
          // `clampHeroName` hands a fitting edit straight back, so a keypress
          // against the full budget compares equal here and stays silent.
          if (next !== value) playUiSound(synth, "blip");
          onChange(next);
        }}
        onKeyDown={(e) => {
          // The Enter that names the hero is SPENT HERE. Submitting mints the
          // hero and hands the screen to the title's difficulty ladder, whose
          // own window listener goes on while this very keystroke is still
          // climbing towards `window` — where it would confirm the row under
          // the cursor and start the run before the ladder was ever drawn.
          // (`onFreshKeyDown` catches it there too; a field that eats its own
          // submit key is the exact half — see @ui/lib/key-handoff.ts.)
          if (e.key === "Enter" && canSubmit) {
            e.preventDefault();
            e.stopPropagation();
            onSubmit();
          }
        }}
        placeholder={DEFAULT_HERO_NAME}
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
  // WHO IS ALREADY ON THE ROSTER, read ONCE. Nothing can join it while this
  // form is up — it is the only door that mints a hero and it is modal — so
  // re-reading storage on every keystroke would be a `localStorage` parse per
  // letter typed for an answer that cannot have changed.
  const roster = useMemo(() => loadCharacters(), []);
  // Pin the screen to the visual viewport so the form stays centred in the
  // space above the on-screen keyboard (iOS keeps the layout viewport full-
  // height when the keyboard opens, otherwise hiding the centred form).
  const screenRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useVisualViewportBox(screenRef);
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

  if (!assets) return <LoadingScreen />;
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

  // WHO THIS PRESS WOULD ACTUALLY FILE — the field's text once the mint has had
  // it, INCLUDING the fallback an empty field is minted under (the grey HERO the
  // placeholder promises, `createCharacter`). Measuring the raw field instead
  // would let the blank form be pressed twice and put two heroes called HERO on
  // the roster, which is the exact collision this is here to stop.
  const minted = heroName(name) || DEFAULT_HERO_NAME;
  // TWO HEROES BY ONE NAME IS A ROSTER THE PLAYER CANNOT READ, so the form
  // refuses it here rather than leaving LOAD GAME, the score board and RETIRE
  // to disambiguate two identical rows (`characterNameTaken`).
  const taken = characterNameTaken(minted, undefined, roster);
  const canCreate = !taken;

  const create = () => {
    if (!canCreate) {
      // A refusal has to SOUND like one. Silence on a pressed button reads as
      // the press having missed.
      playUiSound(synth, "back");
      // …and it hands the field back, because the press that was refused has
      // just taken focus off it — and on a phone the keyboard went with it. A
      // player told to pick another name should be able to type one.
      nameRef.current?.focus();
      return;
    }
    playUiSound(synth, "start");
    // The field holds the raw typed text; the hero is minted uppercase, with
    // the trailing space an autocomplete tap leaves behind trimmed off.
    onCreate(minted, hardcore);
  };

  return (
    <div
      ref={screenRef}
      className="title-screen character-screen"
      style={{ "--menu-cursor": menuCursor } as CSSProperties}
    >
      <div className="title-stars" aria-hidden="true" />

      <div className="title-content">
        <header className="character-heading">
          <PixelText font={font} text="NEW GAME" scale={3} color="#ffd75e" />
        </header>

        <div className="character-form" aria-label="create character">
          <label className="character-field">
            <PixelText font={font} text="HERO NAME" scale={2} color="#9aa3ad" />
            <PixelNameInput
              font={font}
              value={name}
              invalid={taken}
              canSubmit={canCreate}
              inputRef={nameRef}
              onChange={setName}
              onSubmit={create}
            />
            {/* THE REFUSAL, IN THE ROW IT IS ABOUT. Said while the player is
                still looking at what they typed — the rule `PixelPrompt` keeps
                for an address that does not parse, and for the same reason: a
                CREATE button that simply will not press teaches nothing. The
                slot only exists while there is something to say, so an ordinary
                name is not made to sit above an empty line. */}
            {taken && (
              <span className="character-field-error" role="status">
                <PixelText
                  font={font}
                  // IT NAMES THE HERO IT MEANS, which matters most in the one
                  // case a bare "that name is taken" cannot explain: an EMPTY
                  // field on a roster that already has a HERO on it. The field
                  // is blank, the placeholder is hidden behind the caret, and
                  // the only thing that makes the red frame make sense is the
                  // line saying which name the press would have filed.
                  text={`${minted} IS ALREADY ON THE ROSTER`}
                  scale={2}
                  color="#ff6d6d"
                  maxWidth={blurbMaxWidth}
                />
              </span>
            )}
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
            {/* DIMMED BUT STILL PRESSABLE while the name will not do. A truly
                `disabled` button eats the press, and a button that does nothing
                at all when tapped reads as the tap having missed — which on a
                phone is the likelier reading. It takes the press, refuses out
                loud (`create`), and the line above the toggle says why. */}
            <button
              type="button"
              className={`pixel-button character-confirm${
                canCreate ? "" : " refused"
              }`}
              aria-label="character-create"
              aria-disabled={!canCreate}
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
