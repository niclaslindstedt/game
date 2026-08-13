// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE QUEST BOX — the conversation with somebody who has an errand, shown while
// the local hero's `quest` screen is up. The hero is parked behind it, exactly
// as behind the shop and the bag.
//
// IT IS THE ONE SURFACE IN THE GAME THAT IS GOLD, and that is deliberate rather
// than decorative. Every other window wears the shared FF6 skin (`--panel-*`);
// this one takes the same skin and lays a parchment wash and a gold rail over
// it, because a quest offer is the only modal the player is asked to make a
// DECISION in. WoW's yellow quest frame is the reference and the reason: after
// two of these, gold means "somebody is asking you for something", and the
// player knows what the box wants before they have read a word of it.
//
// Three conversations share it, and the difference is the FOOTER, never the
// frame — the box is the person, and a person does not change shape between
// asking and thanking:
//   offer      the ask, with ACCEPT / DECLINE and the reward on show
//   incomplete the nag, with a live objective tally and one CLOSE
//   complete   the handover, with the reward again and one TURN IN
//
// The reward is quoted from the ENGINE's own reward math (`questXpReward`), not
// re-derived here: an offer that promises a different number than the handover
// pays is a reward the player stops trusting.

import { localHero } from "../local-seat.ts";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  conversationPages,
  giverTopics,
  objectiveNeed,
  questDef,
  questGiverDef,
  questPageIsHero,
  questPageLines,
  questRewardChoices,
  questXpReward,
  playerAppearance,
  withHeroNameLines,
  type Equipment,
  type GameState,
  type QuestTopic,
} from "@game/core";

import { formatCompact } from "@ui/lib/format-number.ts";
import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { wrapPage } from "@ui/lib/text-pager.ts";
import { columnCapRem, useTextColumn } from "@ui/lib/use-text-column.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";
import { useDismissOnOutsidePress } from "@ui/lib/use-outside-press.ts";

import { spriteDataUrl, type GameAssets } from "../assets.ts";
import { heroSoak } from "../game-screen/hero-soak.ts";
import { dollDataUrl } from "../paper-doll.ts";
import { playerDollLayers } from "../paper-doll-live.ts";
import { ItemIcon } from "../ItemCard.tsx";
import { ItemTooltip } from "../ItemTooltip.tsx";
import { tierGlowClass } from "../tiers.ts";
import { label, objectiveLine } from "../quest-text.ts";
import { SpritePortrait, useSpeakingBust } from "../SpritePortrait.tsx";

/**
 * A list row's mark, its colour, and WHAT PICKING IT DOES — said in words under
 * the errand's name, because the mark alone does not say it.
 *
 * The `!` / `?` are the SAME marks that float over a giver's head on the field,
 * and the colour carries the same meaning there — gold to take, green to hand
 * in, grey for running. That vocabulary is WoW's and it is worth keeping, but it
 * is a vocabulary the player has to be TAUGHT, and the slate is the only surface
 * with room to teach it: a row reading `? THE RECEIPT` says nothing about
 * whether pressing it takes a job, hands one in, or repeats a nag, so the one
 * screen where somebody decides to take on an errand was the one screen that
 * never used the word. The note is the caption; the glyph is the shorthand it
 * teaches.
 *
 * THE GLYPHS ARE DRAWN IN THE PIXEL FONT, NOT AS THE HEAD SPRITE, and that is
 * the fix for a real alignment bug rather than a shortcut. The head mark is an
 * 8×12 sprite sized to be read across a room: dropped into a text row it is a
 * glyph of a different size, on a different baseline, in a box whose ink is not
 * even centred (one blank row at the top, none at the bottom). Every attempt to
 * line that box up with a text canvas is a magic number that goes wrong again
 * the moment either changes — and the game HAS two UI scale tiers, so it would.
 * The font's own `!` and `?` share the label's baseline by construction, at
 * every scale, for free.
 */
const TOPIC_MARK: Record<
  QuestTopic["kind"],
  { glyph: string; color: string; note: string }
> = {
  complete: { glyph: "?", color: "#7fe3a0", note: "FINISHED - HAND IT IN" },
  offer: { glyph: "!", color: "#ffd75e", note: "NEW QUEST - HEAR IT OUT" },
  incomplete: { glyph: "?", color: "#9aa3ad", note: "IN PROGRESS - CHECK IT" },
};

/** The note's own colour — one dim grey for all three rows. It is a caption
 * rather than a second label, and colouring it with the mark would give the row
 * two things competing to be read first. */
const TOPIC_NOTE_COLOR = "#8d97a3";

/** Text scale the box's body prints at — the dialogue box's, so a quest line
 * and a dialogue line are the same size on the same screen. */
const TEXT_SCALE = 2;

/** Fallback cap for one row's `PixelText`, in rem, used ONLY until a column has
 * been measured (see `columnCapRem`, which is what every row here actually
 * passes). It is deliberately loose: it exists to stop the very first frame
 * running off the screen, not to size anything. */
const QUEST_TEXT_REM = 26;

/** What a pick-list ROW eats before its label starts, in rem: `.quest-topic`'s
 * padding (0.7 × 2) and border (2px each side), its gap (0.6), and the mark
 * slot (0.85). A label is measured against the LIST's width, so this comes off
 * the top or a long errand name runs past the row it is in. Read it off
 * `.quest-topic` in styles.css if either changes. */
const ROW_INSET_REM = 0.7 * 2 + 0.25 + 0.6 + 0.85;

/** A stable empty page, handed to the greeting's typewriter when there is
 * nothing to crawl (the offer branch, or a hello already printed). */
const NO_LINES: readonly string[] = [];

/** What a giver with no authored hello says while their slate is on screen. */
const DEFAULT_GREETING = ["WHAT CAN I DO FOR YOU?"];

export function QuestOverlay({
  state,
  assets,
  font,
  onAdvance,
  onAccept,
  onDecline,
  onTurnIn,
  onPick,
  onChooseReward,
  onBlip,
  onClose,
  heroName,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** The name the player gave this hero — what an authored `{HERO}` in an
   * errand's ask, hello or handover resolves to. */
  heroName?: string;
  /** Turn to the next page of the speech. */
  onAdvance: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onTurnIn: () => void;
  /** Pick one row off the giver's list. */
  onPick: (questId: string) => void;
  /** Take THAT piece of gear (an index into the errand's offered pieces). */
  onChooseReward: (index: number) => void;
  /** Play the letter-print blip — fired as characters land, exactly as the
   * in-world dialogue box fires it. */
  onBlip?: () => void;
  /** Leave the conversation without taking or handing in anything. */
  onClose: () => void;
}) {
  const offer = state.questOffer;
  const listing = offer?.kind === "list";
  const quest = offer?.questId ? questDef(offer.questId) : null;
  const giver = offer ? questGiverDef(offer.giverId) : null;
  // Memoised because the crawl reads it: a fresh array identity every render
  // would restart the typewriter on every frame, and the speech would never
  // finish printing. `state` is in the deps for the linter's sake and costs
  // nothing — the run object's identity is stable for the whole run, and the
  // only thing the pages read off it is the difficulty (the `{CACHE}` line),
  // which cannot change inside one.
  const pages = useMemo(
    () =>
      offer && offer.questId
        ? conversationPages(state, offer.questId, offer.kind)
        : [],
    [offer, state],
  );
  const lastPage = offer ? offer.page >= pages.length - 1 : false;
  // The rows are derived from the run every render (`giverTopics`), never
  // stored: a list that cached itself would still be offering a quest the
  // player accepted a keystroke ago.
  const topics: QuestTopic[] = useMemo(
    () => (listing && offer ? giverTopics(state, offer.giverId) : []),
    [listing, offer, state],
  );
  // Which row the keyboard/gamepad is on. The index is stored WITH the list it
  // belongs to rather than reset by an effect: the rows are derived from the
  // run, so accepting an errand re-renders a shorter list on the very next
  // frame, and a cursor reset that arrives an effect later is one frame of
  // pointing at a row that is no longer there. Keying it makes "coming back to
  // a different list lands on the top row" fall out during render instead.
  const rowCount = topics.length;
  const listKey = listing && offer ? `${offer.giverId}:${rowCount}` : "";
  const [cursorState, setCursorState] = useState({ key: "", index: 0 });
  // The reward piece whose card is open, and the slot it is anchored to. The
  // bag's own tooltip draws it, so a quest reward is read on exactly the screen
  // the player reads every other piece of gear on.
  //
  // A card is raised one of TWO ways and they dismiss differently. A HOVER
  // raises a loose one that follows the mouse off the slot; a PRESS PINS it,
  // and a pinned card stays up until something puts it away — the same press
  // again (a toggle), or a press anywhere that is not the card. That split is
  // what a touch screen needs: it has no hover to end, so before this the card
  // a tap raised had nothing at all that lowered it — the enter/leave pair a
  // tap synthesises around its own press fired in the wrong order (leave, then
  // the click that re-raised it), which is why dismissing it looked possible
  // but never reproduced.
  const [inspect, setInspect] = useState<{
    item: Equipment;
    anchor: DOMRect;
    pinned: boolean;
  } | null>(null);
  // The exemption is `data-card` — the same marker the bag, the counter and the
  // trade table stamp on the cells that RAISE a card — so every screen in the
  // game answers "did this press miss the card?" by one rule. A reward slot
  // always holds a piece, so here the two spellings pick out the same slots.
  useDismissOnOutsidePress(inspect !== null, ".item-tooltip, [data-card]", () =>
    setInspect(null),
  );
  const cursor =
    cursorState.key === listKey
      ? Math.min(cursorState.index, Math.max(0, rowCount - 1))
      : 0;
  const setCursor = useCallback(
    (next: number | ((current: number) => number)) => {
      setCursorState((prev) => {
        const at = prev.key === listKey ? prev.index : 0;
        return {
          key: listKey,
          index: typeof next === "function" ? next(at) : next,
        };
      });
    },
    [listKey],
  );

  // THE SPEECH CRAWLS, exactly as every other spoken line in the game does
  // (the dialogue box, the level intro, the cutscene captions all run this
  // hook). A quest giver is a person talking; printing their ask instantly
  // while an elite's threat types itself out would make the one surface the
  // player is asked to make a decision on the one surface that reads as UI
  // rather than as somebody speaking. The punctuation's own dramatic pauses
  // come along for free.
  //
  // The CONTRACT below it — the objectives, the reward, the buttons — does NOT
  // crawl: it is a table, not a voice, and a reward figure that types itself
  // in is a reward the player has to wait to read.
  // NOTE the `page` dependency. `offer` is the ENGINE's own mutable object and
  // a page turn advances `offer.page` IN PLACE — the identity never changes —
  // so a memo keyed on `offer` alone would hand the crawl the first page for
  // ever. Every read of a mutated engine field has to be in the deps by value.
  const page = offer?.page ?? 0;
  // WHOSE PAGE THIS IS. An errand is one thing said and one thing answered
  // (`QuestPage`), so the box has two speakers rather than one — and the answer
  // is delivered by the hero's own dressed paper doll, exactly as his lines are
  // everywhere else in the game. Anything that reads "the speaker" below asks
  // this first.
  const current = offer && !listing ? pages[page] : undefined;
  const heroSpeaks = current !== undefined && questPageIsHero(current);
  const speech = useMemo(
    () =>
      current ? withHeroNameLines([...questPageLines(current)], heroName) : [],
    [current, heroName],
  );
  // An authored line is a PARAGRAPH: flow it into the speech column's own
  // measured width (the box is narrower than the dialogue box's — a portrait
  // and a contract share it) rather than printing the source's breaks.
  const { ref: linesRef, fontPx: colFontPx } = useTextColumn(TEXT_SCALE);
  // The pick list is a different render branch with a box of its own, so its
  // hello is measured separately — only one of the two is ever mounted.
  const { ref: greetRef, fontPx: greetColFontPx } = useTextColumn(TEXT_SCALE);
  // THE CONTRACT IS FLOWED TOO, and it has to be: an objective is an authored
  // SENTENCE (a `visit` says where to stand in words), and the block runs the
  // box's full width with no portrait beside it — so it is a different column
  // from the speech and needs its own measurement rather than the speech's.
  const { ref: objRef, fontPx: objColFontPx } = useTextColumn(TEXT_SCALE);
  const { ref: rewardRef, fontPx: rewardColFontPx } = useTextColumn(TEXT_SCALE);
  const { ref: topicRef, fontPx: topicColFontPx } = useTextColumn(TEXT_SCALE);
  // What one pick-list row has left for its text, after the row's own furniture
  // (`ROW_INSET_REM`). Both of a row's lines are measured against it, so the
  // name and the note wrap on the same column.
  const rowLabelCap = Math.max(
    4,
    columnCapRem(topicColFontPx, TEXT_SCALE, QUEST_TEXT_REM) - ROW_INSET_REM,
  );
  const spokenLines = useMemo(
    () =>
      wrapPage(
        speech,
        colFontPx == null ? null : (line) => font.wrap(line, colFontPx),
      ),
    [speech, colFontPx, font],
  );
  const {
    rows: spokenRows,
    done: crawlDone,
    skip: skipCrawl,
  } = useTypewriter(spokenLines, (visibleIndex) => {
    // Every other character — a dense-enough chatter without a machine-gun at
    // the crawl rate. The same cadence the dialogue box uses.
    if (visibleIndex % 2 === 0) onBlip?.();
  });

  // THE HELLO CRAWLS TOO. The pick list is the FIRST thing a giver says to the
  // player, and printing it instantly while the ask two taps later types itself
  // out made the same person read as a vending machine on one screen and as
  // somebody talking on the next. Same hook, same cadence, same blip — the
  // ROWS below it stay a menu and never crawl.
  const greetLines = useMemo(
    () =>
      wrapPage(
        listing && giver
          ? withHeroNameLines(giver.greeting ?? DEFAULT_GREETING, heroName)
          : [],
        greetColFontPx == null
          ? null
          : (line) => font.wrap(line, greetColFontPx),
      ),
    [listing, giver, greetColFontPx, font, heroName],
  );
  // A PERSON GREETS YOU ONCE PER WALK-UP. Taking an errand steps back to the
  // slate (`leaveTopic`), and a hello that retyped every time the player backed
  // out of a topic would turn one line of characterisation into a toll paid
  // three times. The flag is local state, so it dies with the conversation —
  // the next walk-up is a fresh hello.
  const [greeted, setGreeted] = useState<string | null>(null);
  const greetKey = listing && offer ? offer.giverId : null;
  const alreadyGreeted = greetKey !== null && greeted === greetKey;
  const {
    rows: greetRows,
    done: greetDone,
    skip: skipGreet,
  } = useTypewriter(alreadyGreeted ? NO_LINES : greetLines, (visibleIndex) => {
    if (visibleIndex % 2 === 0) onBlip?.();
  });
  // Banked DURING RENDER (React's supported "adjust state on a prop change"
  // pattern, the same one the cursor above and the typewriter itself use)
  // rather than in an effect: the frame the crawl finishes on is already
  // showing the whole hello, so the re-render this schedules swaps a completed
  // crawl for the same completed text with nothing to see in between.
  if (greetKey !== null && greetDone && greeted !== greetKey) {
    setGreeted(greetKey);
  }
  // Once it has been said, it is simply printed.
  const greetShown = alreadyGreeted ? greetLines : greetRows;

  // NEXT is a two-step, like a tap on the dialogue box: the first press
  // finishes the crawl, the second turns the page. ACCEPT / DECLINE / TURN IN
  // are NOT gated on it — those are decisions, and making a player wait out an
  // animation before they may answer is the thing skip buttons exist for.
  const advance = useCallback(() => {
    if (!crawlDone) skipCrawl();
    else onAdvance();
  }, [crawlDone, skipCrawl, onAdvance]);

  // The keyboard/gamepad path: the arrow keys and Enter already reach every
  // menu in the game through synthetic key events (@ui/lib/gamepad-keys), so
  // the box only has to listen for them — Enter takes the primary action,
  // Escape leaves. Mounted globally on `window` for the same reason every other
  // surface is: it is what makes a pad work here without knowing a pad exists.
  useEffect(() => {
    if (!offer) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (offer.kind === "offer") onDecline();
        else onClose();
        return;
      }
      // The list is a menu, so it steers like every other menu in the game —
      // which is also what makes a gamepad work here (@ui/lib/gamepad-keys
      // dispatches these very events; no surface in the game knows a pad
      // exists).
      if (offer.kind === "list") {
        if (event.key === "ArrowDown" || event.key === "ArrowRight") {
          event.preventDefault();
          setCursor((c) => (rowCount === 0 ? 0 : (c + 1) % rowCount));
          return;
        }
        if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
          event.preventDefault();
          setCursor((c) =>
            rowCount === 0 ? 0 : (c - 1 + rowCount) % rowCount,
          );
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          const row = topics[cursor];
          if (row) onPick(row.questId);
        }
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      if (!lastPage || !crawlDone) {
        advance();
        return;
      }
      if (offer.kind === "offer") onAccept();
      else if (offer.kind === "complete") onTurnIn();
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    offer,
    lastPage,
    topics,
    cursor,
    rowCount,
    setCursor,
    advance,
    crawlDone,
    onAdvance,
    onAccept,
    onDecline,
    onPick,
    onTurnIn,
    onClose,
  ]);

  const rewardRows = useMemo(
    () => (quest ? rewardLines(state, assets, quest.reward) : []),
    [state, assets, quest],
  );
  // READ, never minted: the engine decided these when the conversation opened
  // (see quests/reward-choices.ts), so a re-render cannot re-roll the reward.
  const choices: Equipment[] = useMemo(
    () =>
      quest && !listing
        ? questRewardChoices(state, localHero(state), quest.id)
        : [],
    [state, quest, listing],
  );
  // THE GIVER'S FACE, MOVING WHILE THEY MAKE THEIR ASK — when a mod's art
  // carries a `talk:` clip for them (`render/clips.ts`); the still bust
  // otherwise, which is every giver the game ships. Resolved HERE, above the
  // early returns below, because it is a hook: `giver` is undefined on the
  // render where the offer has just closed, and a hook cannot be skipped for
  // it.
  const giverBust = useSpeakingBust(
    assets.sprites,
    giver?.sprite ?? "",
    giver !== undefined && !heroSpeaks,
  );
  // …and the hero's own face for his answer: the dressed doll the HUD, the bag
  // and every dialogue box already portray him with, resolved live off the
  // loadout so he is never wearing gear he has not found.
  const portrait = heroSpeaks
    ? (dollDataUrl(
        assets.sprites,
        playerDollLayers(state, "0"),
        heroSoak(state),
        { bust: true },
      ) ??
      spriteDataUrl(assets.sprites, `${playerAppearance(state)}_0`) ??
      null)
    : giverBust;
  const speakerName = heroSpeaks ? (heroName ?? "ME") : (giver?.name ?? "");
  const rewardPick = quest
    ? Math.min(
        Math.max(
          0,
          state.quests[quest.id]?.rewardPick ?? offer?.rewardPick ?? 0,
        ),
        Math.max(0, choices.length - 1),
      )
    : 0;

  if (!offer || !giver) return null;
  if (!listing && !quest) return null;

  // THE PICK LIST — this person's whole slate at once. Shown only when they
  // have more than one thing to say (the engine skips it otherwise), because a
  // menu of one is a menu nobody wants.
  if (listing) {
    return (
      <div className="game-overlay quest-overlay" role="presentation">
        <div className="quest-box">
          <div className="quest-banner">
            <PixelText font={font} text="QUEST" scale={2} color="#ffd75e" />
          </div>
          <div className="quest-vn">
            <SpritePortrait src={portrait} frameClass="quest-portrait-frame" />
            <div className="quest-content">
              <div className="quest-speaker">
                <PixelText
                  font={font}
                  text={giver.name}
                  scale={TEXT_SCALE}
                  color="#c9a95c"
                  maxWidth={columnCapRem(
                    greetColFontPx,
                    TEXT_SCALE,
                    QUEST_TEXT_REM,
                  )}
                />
              </div>
              {/* A tap on the hello finishes it, exactly as a tap on an ask
                  does — and, exactly as there, it is scoped to the TEXT rather
                  than the box, because the rows below it are answers. */}
              <div
                className="quest-lines"
                ref={greetRef}
                onPointerDown={() => {
                  if (!greetDone) skipGreet();
                }}
                role="presentation"
              >
                {/* Reserve every row up front (PixelText is fixed-height even
                    when empty) so the list does not walk down the screen as the
                    hello types itself in. */}
                {greetLines.map((_, i) => (
                  <PixelText
                    key={i}
                    font={font}
                    text={greetShown[i] ?? ""}
                    scale={TEXT_SCALE}
                    maxWidth={columnCapRem(
                      greetColFontPx,
                      TEXT_SCALE,
                      QUEST_TEXT_REM,
                    )}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="quest-topics" ref={topicRef}>
            {topics.map((topic, i) => {
              const mark = TOPIC_MARK[topic.kind];
              return (
                <button
                  type="button"
                  key={topic.questId}
                  className={`quest-topic${i === cursor ? " selected" : ""}`}
                  aria-label={`quest-topic-${topic.questId}`}
                  onPointerEnter={() => setCursor(i)}
                  onClick={() => onPick(topic.questId)}
                >
                  {/* A fixed-width slot, because `!` is one pixel wide and `?`
                      is three: without it the labels of a mixed list would not
                      start on the same column. */}
                  <span className="quest-topic-mark">
                    <PixelText
                      font={font}
                      text={mark.glyph}
                      scale={TEXT_SCALE}
                      color={mark.color}
                    />
                  </span>
                  {/* The errand's name, and under it what pressing the row
                      actually does — see TOPIC_MARK. */}
                  <span className="quest-topic-text">
                    <PixelText
                      font={font}
                      text={questDef(topic.questId).name}
                      scale={TEXT_SCALE}
                      color={mark.color}
                      maxWidth={rowLabelCap}
                    />
                    <PixelText
                      font={font}
                      text={mark.note}
                      scale={TEXT_SCALE}
                      color={TOPIC_NOTE_COLOR}
                      maxWidth={rowLabelCap}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          <div className="quest-actions">
            <button
              type="button"
              className="pixel-button secondary quest-button"
              onClick={onClose}
            >
              <PixelText font={font} text="GOODBYE" scale={2} color="#f6e3b0" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  const progress = state.quests[quest!.id];
  // The rows are PICKABLE only at the handover, and only when there is more
  // than one of them (a lone neutral piece is shown, not chosen).
  const picking = offer.kind === "complete" && choices.length > 1;
  // The primary action's label IS the state of the conversation, so the button
  // never has to be read alongside a title to know what it does.
  const primary =
    offer.kind === "offer"
      ? "ACCEPT"
      : offer.kind === "complete"
        ? "COMPLETE"
        : "CLOSE";

  return (
    <div className="game-overlay quest-overlay" role="presentation">
      <div className="quest-box">
        <div className="quest-banner">
          <PixelText
            font={font}
            text={offer.kind === "complete" ? "QUEST COMPLETE" : "QUEST"}
            scale={2}
            color="#ffd75e"
          />
        </div>
        <div className="quest-title">
          <PixelText
            font={font}
            text={quest!.name}
            scale={2}
            color="#f6e3b0"
            maxWidth={QUEST_TEXT_REM}
          />
        </div>
        <div className="quest-vn">
          <SpritePortrait src={portrait} frameClass="quest-portrait-frame" />
          <div className="quest-content">
            <div className="quest-speaker">
              <PixelText
                font={font}
                text={speakerName}
                scale={TEXT_SCALE}
                // His own answer is headed in his own colour, so the two voices
                // in the box are told apart before either is read.
                color={heroSpeaks ? "#f6e3b0" : "#c9a95c"}
                maxWidth={columnCapRem(colFontPx, TEXT_SCALE, QUEST_TEXT_REM)}
              />
            </div>
            {/* A tap on the speech finishes the crawl and then TURNS THE PAGE
                — the dialogue box's own gesture, and now the only way through a
                multi-page ask, since the footer is the decision rather than a
                NEXT. It is scoped to the speech rather than the whole box on
                purpose: the backdrop and the contract must never be a hidden
                button, because one of this box's answers is DECLINE. */}
            <div
              className="quest-lines"
              ref={linesRef}
              onPointerDown={() => {
                if (!lastPage || !crawlDone) advance();
              }}
              role="presentation"
            >
              {/* Reserve every row of the page up front (PixelText is
                  fixed-height even when empty), so the box does not grow a line
                  at a time as the speech types itself in. */}
              {spokenLines.map((_, i) => (
                <PixelText
                  key={i}
                  font={font}
                  text={spokenRows[i] ?? ""}
                  scale={TEXT_SCALE}
                  maxWidth={columnCapRem(colFontPx, TEXT_SCALE, QUEST_TEXT_REM)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* THE OBJECTIVES, always listed — on the offer they are the contract,
            on the nag they are the live tally, and on the handover they are the
            receipt. One block, three readings, so the player never has to open
            the tracker to answer "what did this want again". */}
        <div className="quest-objectives" ref={objRef}>
          {quest!.objectives.map((objective, i) => {
            const done = (progress?.counts[i] ?? 0) >= objectiveNeed(objective);
            // An objective is a SENTENCE, so it is flowed like the speech
            // rather than trusted to fit — `visit` words its target as prose.
            const rows = wrapPage(
              [objectiveLine(quest!.id, objective, progress?.counts[i] ?? 0)],
              objColFontPx == null
                ? null
                : (line) => font.wrap(line, objColFontPx),
            );
            return (
              <div className="quest-objective" key={i}>
                {rows.map((row, r) => (
                  <PixelText
                    key={r}
                    font={font}
                    text={row}
                    scale={TEXT_SCALE}
                    color={done ? "#7fe3a0" : "#cfd6e0"}
                    maxWidth={columnCapRem(
                      objColFontPx,
                      TEXT_SCALE,
                      QUEST_TEXT_REM,
                    )}
                  />
                ))}
              </div>
            );
          })}
        </div>

        {(rewardRows.length > 0 || choices.length > 0) &&
          offer.kind !== "incomplete" && (
            <div className="quest-rewards" ref={rewardRef}>
              <div className="quest-reward-title">
                <PixelText
                  font={font}
                  text="REWARD"
                  scale={TEXT_SCALE}
                  color="#c9a95c"
                />
              </div>
              {/* ONE FACT PER LINE. They used to sit in a wrapping row — a
                  strip reading "624 XP 60 COINS AN ITEM" that the eye has to
                  parse into three things before it can price any of them. */}
              {rewardRows.map((row) => (
                <div className="quest-reward-line" key={row.label}>
                  {row.icon && (
                    <img
                      src={row.icon}
                      alt=""
                      className="pixel-img quest-reward-icon"
                    />
                  )}
                  <PixelText
                    font={font}
                    text={row.label}
                    scale={TEXT_SCALE}
                    color={row.color}
                    maxWidth={columnCapRem(
                      rewardColFontPx,
                      TEXT_SCALE,
                      QUEST_TEXT_REM,
                    )}
                  />
                </div>
              ))}

              {/* THE GEAR, SHOWN RATHER THAN PROMISED. Each row is the real
                  minted piece — its own icon, its name in its tier's colour,
                  its rolled affixes — so the player can price the job before
                  taking it. With more than one row it is a CHOICE, one per
                  build lane, and the pick rides the errand. */}
              {choices.length > 0 && (
                <>
                  <div className="quest-reward-title spaced">
                    <PixelText
                      font={font}
                      // THE PICK HAPPENS AT THE HANDOVER, not at the ask. At the
                      // ask these are a PROSPECTUS — what the job pays — and
                      // choosing then would make the player commit to a piece
                      // before doing the work, at the one moment they know least
                      // about the build they will have when they come back.
                      text={
                        picking
                          ? "CHOOSE ONE"
                          : choices.length > 1
                            ? "ITEM REWARDS"
                            : "ITEM REWARD"
                      }
                      scale={TEXT_SCALE}
                      color="#c9a95c"
                    />
                  </div>
                  {/* SLOTS, LIKE THE BAG'S — the icon and nothing else. Names
                      and affix lines were three stacked paragraphs of text in a
                      box that already carries a speech and a contract, and they
                      said far less than the art does at a glance. A press (or a
                      hover) opens the piece's own card, which is the screen the
                      player already reads gear on. */}
                  <div className="quest-reward-slots">
                    {choices.map((item, i) => (
                      <button
                        type="button"
                        key={item.id}
                        className={`inv-cell quest-reward-slot${
                          picking && i === rewardPick ? " selected" : ""
                        }${tierGlowClass(item.tier)}`}
                        aria-label={`quest-reward-${item.id}`}
                        data-card=""
                        // HOVER raises a loose card, and only a loose one: a
                        // touch tap synthesises an enter/leave pair around its
                        // own press, so letting those through is what made the
                        // card blink. A pinned card ignores both.
                        onPointerEnter={(e) => {
                          if (e.pointerType === "touch") return;
                          const anchor =
                            e.currentTarget.getBoundingClientRect();
                          setInspect((prev) =>
                            prev?.pinned
                              ? prev
                              : { item, anchor, pinned: false },
                          );
                        }}
                        onPointerLeave={(e) => {
                          if (e.pointerType === "touch") return;
                          setInspect((prev) => (prev?.pinned ? prev : null));
                        }}
                        // A PRESS TOGGLES: it pins the piece's card (the only
                        // way in on a touch screen, which has no hover), and a
                        // second press on the same piece puts it away again.
                        onPointerDown={(e) => {
                          const anchor =
                            e.currentTarget.getBoundingClientRect();
                          setInspect((prev) =>
                            prev?.item.id === item.id
                              ? null
                              : { item, anchor, pinned: true },
                          );
                        }}
                        // At the handover the press also TAKES the piece.
                        onClick={() => {
                          if (picking) onChooseReward(i);
                        }}
                      >
                        <ItemIcon sprites={assets.sprites} item={item} />
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

        {/* THE FOOTER IS THE DECISION, ALWAYS — never a NEXT. It used to page
            the speech first and only reveal ACCEPT on the last page, so the
            button a player was looking at while reading an ask said NEXT: it
            named the mechanism instead of the choice, and on a two-page offer
            it hid the fact that there was anything to decide. The remaining
            pages are turned by TAPPING THE SPEECH, which is the same gesture
            the in-world dialogue box has always used. */}
        <div className="quest-actions">
          {offer.kind === "offer" && (
            <button
              type="button"
              className="pixel-button secondary quest-button"
              onClick={onDecline}
            >
              <PixelText font={font} text="DECLINE" scale={2} color="#f6e3b0" />
            </button>
          )}
          <button
            type="button"
            className="pixel-button quest-button"
            onClick={
              offer.kind === "offer"
                ? onAccept
                : offer.kind === "complete"
                  ? onTurnIn
                  : onClose
            }
          >
            <PixelText font={font} text={primary} scale={2} color="#1a1c2c" />
          </button>
        </div>

        {/* The bag's own card, portaled above the modal band and anchored to the
            slot it describes. */}
        {inspect && (
          <ItemTooltip
            font={font}
            relicFonts={assets.relicFonts}
            sprites={assets.sprites}
            state={state}
            item={inspect.item}
            anchor={inspect.anchor}
          />
        )}
      </div>
    </div>
  );
}

/** XP's own blue — the colour every XP figure in the game is written in (the
 * floating `+45 XP` off a kill, the bar), so the biggest number in the reward
 * block is recognisable before it is read. */
const XP_BLUE = "#7fc8ff";

/** One non-gear line of the reward: what it says, what colour it says it in,
 * and the sprite that leads it (coins get the purse's own coin art — a number
 * beside the thing it counts needs no unit read). */
type RewardLine = { label: string; color: string; icon?: string };

/** The reward, in the same words the handover will use — one line per fact.
 * The GEAR is deliberately absent: it is no longer a promise of "AN ITEM" but
 * the actual pieces, drawn below by `RewardChoiceRow`. */
function rewardLines(
  state: GameState,
  assets: GameAssets,
  reward: ReturnType<typeof questDef>["reward"],
): RewardLine[] {
  if (!reward) return [];
  const rows: RewardLine[] = [];
  const xp = questXpReward(state, localHero(state), reward);
  if (xp > 0) {
    rows.push({ label: `${formatCompact(xp)} XP`, color: XP_BLUE });
  }
  if (reward.coins) {
    rows.push({
      label: `${reward.coins}`,
      color: "#ffd75e",
      icon: spriteDataUrl(assets.sprites, "icon_coin") ?? undefined,
    });
  }
  for (const id of reward.uniques ?? []) {
    rows.push({ label: label(id), color: "#f6e3b0" });
  }
  for (const id of reward.abilities ?? []) {
    rows.push({ label: `${label(id)} POWER`, color: "#c8a0ff" });
  }
  if (reward.cleanSlates) {
    rows.push({
      label:
        reward.cleanSlates === 1
          ? "A CLEAN SLATE"
          : `${reward.cleanSlates} CLEAN SLATES`,
      color: "#7fe3a0",
    });
  }
  return rows;
}
