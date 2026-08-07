// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The in-world dialogue box, shown while `phase === "dialogue"`: an elite
// rushing into frame, a boss at the stare-down, or a picked-up story item
// revealing its lore. Unlike the full-screen pause overlays this one barely
// dims the world — the speaker keeps bobbing behind it (the render loop
// still draws frames on the frozen state), which is the whole point of the
// idle animation. The line prints letter by letter with a 16-bit blip and
// dramatic pauses; the first tap finishes the crawl, the next scrolls to the
// rest of a long speech (or turns the page), and the engine resumes play
// after the last one.
//
// Wrapping + scrolling: an authored line is a PARAGRAPH, not a row — the box
// it lands in is a different width on every device, so the line is flowed into
// the box's *measured* text column and the folded result windowed into screens
// of at most `MAX_VISIBLE_LINES` rows. A tap reveals the next screen, so a long
// speech scrolls in place instead of overflowing a portrait phone or printing a
// ragged half-width column on a desktop. This is purely presentational: the
// engine still owns page turns (`advanceDialogue`), which only fire once the
// last screen of the last page has been read.

import { useRef, type MutableRefObject } from "react";

import { dialogueContent, playerAppearance, type GameState } from "@game/core";

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { heroSoak } from "../game-screen/hero-soak.ts";
import { localScreen } from "../local-seat.ts";
import { dollDataUrl } from "../paper-doll.ts";
import { playerDollLayers } from "../paper-doll-live.ts";
import { portraitSrc, useSpeakingBust } from "../SpritePortrait.tsx";
import {
  DialogueBox,
  IDLE_REVEAL,
  type DialogueReveal,
} from "./DialogueBox.tsx";

export type { DialogueReveal } from "./DialogueBox.tsx";

const EMPTY_PAGE: string[] = [];

export function DialogueOverlay({
  state,
  assets,
  font,
  onAdvance,
  onBlip,
  onMute,
  revealRef,
  heroName,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** The name the player gave this hero — printed over his own pages and put
   * into any authored line that names him (`{HERO}`). */
  heroName?: string;
  /** Turn the page (the engine ends the scene on the last). */
  onAdvance: () => void;
  /** Play the letter-print blip — fired as characters land. */
  onBlip?: () => void;
  /** Silence dialogue for the rest of the level and dismiss this scene. */
  onMute?: () => void;
  /** Mirror of the live reveal state for out-of-overlay advance handlers. */
  revealRef?: MutableRefObject<DialogueReveal>;
}) {
  const dialogue = state.dialogue;
  const content = dialogue ? dialogueContent(dialogue, heroName) : null;
  const page = content?.pages[dialogue!.page] ?? EMPTY_PAGE;

  // The flow, the paging, the crawl and the tap's staging all live in the box
  // itself (`DialogueBox`) — the same box the drive's monologues and every
  // other speech in the game are printed in. What is left here is what is
  // genuinely THIS surface's: which page of which scene, who is delivering it,
  // what their face is, and the barely-dimmed backdrop the speaker keeps
  // bobbing in behind it.
  //
  // The reveal ref is the seam. The box publishes its staged state into it; the
  // overlay's own tap target reads it to decide whether this tap finishes the
  // crawl, scrolls the speech, or turns the page — and the app's keyboard
  // handler reads the very same ref, which is why the two can never disagree.
  const localReveal = useRef<DialogueReveal>(IDLE_REVEAL);
  const reveal = revealRef ?? localReveal;

  // A story-item find gets a banner so the box unmistakably reads as "you
  // picked this up — here's what it is", not another mob talking at you.
  const isStoryItem = dialogue?.source.kind === "story";
  // WHO IS DELIVERING THIS PAGE. The engine resolves it per page (see
  // `DialogueVoice`), so the box draws a two-way exchange without knowing which
  // KIND of scene it is in: a mob's arrival the hero answers back in, and one
  // of his own monologues somebody answers back TO, arrive here identically.
  const voice = (dialogue && content?.voices[dialogue.page]) ?? null;
  const heroSpeaks = voice?.hero ?? false;
  // A speaker is cropped to head and shoulders like every other portrait in the
  // game; a STORY ITEM is not a speaker — it is the thing you just picked up,
  // drawn whole, because an icon has no face to find.
  const speakerArt = voice?.portrait ?? content?.portrait ?? "";
  // The speaking bust: the same face, MOVING, for a character whose art carries
  // a `talk:` clip (`render/clips.ts`) — the still bust for everyone else,
  // which is every speaker the game ships. A story item is not talking and the
  // hero's face is a composed paper doll rather than a sprite, so neither takes
  // it.
  //
  // Resolved HERE, above the early return below, because it is a hook: this
  // overlay renders once more as its scene closes, and a hook cannot be skipped
  // on that pass.
  const speakingBust = useSpeakingBust(
    assets.sprites,
    speakerArt,
    !heroSpeaks && !isStoryItem,
  );

  if (!dialogue || !content) return null;

  // The hero's inner monologue — and his replies in a two-way scene — show
  // HIM: the dressed paper-doll (worn armor + held weapon over the body), the
  // same avatar the HUD and inventory portray, so his lines are delivered by
  // the character the player actually recognizes, gear and all. Resolved live
  // from the loadout: plain clothes and empty hands until he loots them, so
  // his GOODCO-HQ appearances never flash gear he hasn't found. (The level's
  // opening monologue dresses him from the same doll — IntroOverlay.tsx.)
  // Enemy speakers bob live on the canvas behind the box; story items show
  // their icon so the find stays on screen.
  const portrait = heroSpeaks
    ? (dollDataUrl(
        assets.sprites,
        playerDollLayers(state, "0"),
        heroSoak(state),
        { bust: true },
      ) ??
      spriteDataUrl(assets.sprites, `${playerAppearance(state)}_0`) ??
      null)
    : // A story item names an exact icon; a character names a walk-cycle
      // family. Both resolvers try the exact name first, so one call covers
      // either (see SpritePortrait.tsx).
      isStoryItem
      ? portraitSrc(assets.sprites, speakerArt)
      : speakingBust;

  return (
    <div
      className="game-overlay dialogue-overlay"
      onPointerDown={() =>
        reveal.current.done ? onAdvance() : reveal.current.skip()
      }
      role="presentation"
    >
      {/* MUTE: silence every in-world scene for the rest of the level — the
          chat bubble struck through. Its taps stop at the button so they never
          fall through to the overlay's advance. Cutscenes keep their own SKIP;
          this is only for the repeatable field chatter. */}
      {onMute && (
        <button
          type="button"
          className="dialogue-mute"
          aria-label="mute-dialogue"
          onClick={(event) => {
            event.stopPropagation();
            onMute();
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <img
            src={spriteDataUrl(assets.sprites, "icon_dialogue_off") ?? ""}
            alt=""
            className="pixel-img dialogue-mute-icon"
          />
        </button>
      )}
      <DialogueBox
        font={font}
        lines={page}
        speaker={voice?.speaker ?? content.speaker}
        portrait={portrait}
        banner={isStoryItem ? "STORY ITEM ACQUIRED" : undefined}
        pageKey={`${dialogue.source.kind}:${dialogue.page}`}
        revealRef={reveal}
        onBlip={onBlip}
        // A screen the player raised OVER the scene (the pause menu, or the bag
        // at an arrival stare-down) holds the crawl: the box is behind a modal
        // there, so letters printing on would be a speech delivered to a covered
        // stage, blips included. It picks up on the character it stopped at.
        paused={localScreen(state) !== undefined}
      />
    </div>
  );
}
