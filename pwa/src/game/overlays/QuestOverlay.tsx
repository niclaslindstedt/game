// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE QUEST BOX — the conversation with somebody who has an errand, shown while
// `phase === "quest"`. The run is frozen behind it, exactly as it is behind the
// shop and the bag.
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

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  QUESTS,
  conversationPages,
  giverTopics,
  objectiveNeed,
  questDef,
  questGiverDef,
  questItemDef,
  questXpReward,
  type GameState,
  type QuestObjective,
  type QuestTopic,
} from "@game/core";

import { PixelText } from "@ui/lib/PixelText.tsx";
import type { PixelFont } from "@ui/lib/pixel-font.ts";
import { useTypewriter } from "@ui/lib/typewriter.ts";

import { type GameAssets } from "../assets.ts";
import { portraitSrc, SpritePortrait } from "../SpritePortrait.tsx";

/**
 * A list row's mark and colour, by what picking it opens. The `!` / `?` are the
 * SAME marks that float over a giver's head on the field, and the colour is
 * what carries the meaning — gold to take, green to hand in, grey for running.
 *
 * THEY ARE DRAWN IN THE PIXEL FONT, NOT AS THE HEAD SPRITE, and that is the
 * fix for a real alignment bug rather than a shortcut. The head mark is an 8×12
 * sprite sized to be read across a room: dropped into a text row it is a glyph
 * of a different size, on a different baseline, in a box whose ink is not even
 * centred (one blank row at the top, none at the bottom). Every attempt to line
 * that box up with a text canvas is a magic number that goes wrong again the
 * moment either changes — and the game HAS two UI scale tiers, so it would.
 * The font's own `!` and `?` share the label's baseline by construction, at
 * every scale, for free.
 */
const TOPIC_MARK: Record<QuestTopic["kind"], { glyph: string; color: string }> =
  {
    complete: { glyph: "?", color: "#7fe3a0" },
    offer: { glyph: "!", color: "#ffd75e" },
    incomplete: { glyph: "?", color: "#9aa3ad" },
  };

/** Text scale the box's body prints at — the dialogue box's, so a quest line
 * and a dialogue line are the same size on the same screen. */
const TEXT_SCALE = 2;

/** Loose safety cap for one row's `PixelText`, in rem (see DialogueOverlay). */
const QUEST_TEXT_REM = 26;

export function QuestOverlay({
  state,
  assets,
  font,
  onAdvance,
  onAccept,
  onDecline,
  onTurnIn,
  onPick,
  onBlip,
  onClose,
}: {
  state: GameState;
  assets: GameAssets;
  font: PixelFont;
  /** Turn to the next page of the speech. */
  onAdvance: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onTurnIn: () => void;
  /** Pick one row off the giver's list. */
  onPick: (questId: string) => void;
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
  // finish printing.
  const pages = useMemo(
    () =>
      offer && offer.questId
        ? conversationPages(offer.questId, offer.kind)
        : [],
    [offer],
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
  const speech = useMemo(
    () => (offer && !listing ? (pages[page] ?? []) : []),
    [offer, listing, pages, page],
  );
  const {
    rows: spokenRows,
    done: crawlDone,
    skip: skipCrawl,
  } = useTypewriter(speech, (visibleIndex) => {
    // Every other character — a dense-enough chatter without a machine-gun at
    // the crawl rate. The same cadence the dialogue box uses.
    if (visibleIndex % 2 === 0) onBlip?.();
  });

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
    () => (quest ? rewardLines(state, quest.reward) : []),
    [state, quest],
  );

  if (!offer || !giver) return null;
  if (!listing && !quest) return null;

  const portrait = portraitSrc(assets.sprites, giver.sprite);

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
                  scale={1}
                  color="#c9a95c"
                  maxWidth={QUEST_TEXT_REM}
                />
              </div>
              <div className="quest-lines">
                {(giver.greeting ?? ["WHAT CAN I DO FOR YOU?"]).map(
                  (line, i) => (
                    <PixelText
                      key={i}
                      font={font}
                      text={line}
                      scale={TEXT_SCALE}
                      maxWidth={QUEST_TEXT_REM}
                    />
                  ),
                )}
              </div>
            </div>
          </div>

          <div className="quest-topics">
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
                  <PixelText
                    font={font}
                    text={questDef(topic.questId).name}
                    scale={TEXT_SCALE}
                    color={mark.color}
                    maxWidth={QUEST_TEXT_REM}
                  />
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

  const lines = pages[page] ?? [];
  const progress = state.quests[quest!.id];
  // The primary action's label IS the state of the conversation, so the button
  // never has to be read alongside a title to know what it does.
  const primary =
    offer.kind === "offer"
      ? "ACCEPT"
      : offer.kind === "complete"
        ? "TURN IN"
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
                text={giver.name}
                scale={1}
                color="#c9a95c"
                maxWidth={QUEST_TEXT_REM}
              />
            </div>
            {/* A tap on the speech finishes the crawl — the dialogue box's own
                gesture. It is scoped to the speech rather than the whole box on
                purpose: the backdrop and the contract must never be a hidden
                button, because one of this box's answers is DECLINE. */}
            <div
              className="quest-lines"
              onPointerDown={() => {
                if (!crawlDone) skipCrawl();
              }}
              role="presentation"
            >
              {/* Reserve every row of the page up front (PixelText is
                  fixed-height even when empty), so the box does not grow a line
                  at a time as the speech types itself in. */}
              {lines.map((line, i) => (
                <PixelText
                  key={i}
                  font={font}
                  text={spokenRows[i] ?? ""}
                  scale={TEXT_SCALE}
                  maxWidth={QUEST_TEXT_REM}
                />
              ))}
            </div>
          </div>
        </div>

        {/* THE OBJECTIVES, always listed — on the offer they are the contract,
            on the nag they are the live tally, and on the handover they are the
            receipt. One block, three readings, so the player never has to open
            the tracker to answer "what did this want again". */}
        <div className="quest-objectives">
          {quest!.objectives.map((objective, i) => (
            <div className="quest-objective" key={i}>
              <PixelText
                font={font}
                text={objectiveLine(
                  quest!.id,
                  objective,
                  progress?.counts[i] ?? 0,
                )}
                scale={1}
                color={
                  (progress?.counts[i] ?? 0) >= objectiveNeed(objective)
                    ? "#7fe3a0"
                    : "#cfd6e0"
                }
                maxWidth={QUEST_TEXT_REM}
              />
            </div>
          ))}
        </div>

        {rewardRows.length > 0 && offer.kind !== "incomplete" && (
          <div className="quest-rewards">
            <PixelText font={font} text="REWARD" scale={1} color="#c9a95c" />
            <div className="quest-reward-rows">
              {rewardRows.map((row, i) => (
                <PixelText
                  key={i}
                  font={font}
                  text={row}
                  scale={1}
                  color="#f6e3b0"
                  maxWidth={QUEST_TEXT_REM}
                />
              ))}
            </div>
          </div>
        )}

        <div className="quest-actions">
          {!lastPage ? (
            <button
              type="button"
              className="pixel-button quest-button"
              onClick={advance}
            >
              <PixelText font={font} text="NEXT" scale={2} color="#1a1c2c" />
            </button>
          ) : (
            <>
              {offer.kind === "offer" && (
                <button
                  type="button"
                  className="pixel-button secondary quest-button"
                  onClick={onDecline}
                >
                  <PixelText
                    font={font}
                    text="DECLINE"
                    scale={2}
                    color="#f6e3b0"
                  />
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
                <PixelText
                  font={font}
                  text={primary}
                  scale={2}
                  color="#1a1c2c"
                />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * One objective as a line of text — the WoW shape, `THING: 3/8`, with the
 * count dropped on the singular ones (there is no 0/1 way to slay a boss).
 * The names come from the catalogs so a mod's monster reads correctly here
 * without the app knowing anything about it.
 */
export function objectiveLine(
  questId: string,
  objective: QuestObjective,
  count: number,
): string {
  if (objective.kind === "kill") {
    return `${label(objective.enemy)}: ${count}/${objective.count}`;
  }
  if (objective.kind === "killNamed") {
    return count > 0
      ? `${label(objective.enemy)}: SLAIN`
      : label(objective.enemy);
  }
  if (objective.kind === "collect") {
    const item = questItemDef(questId, objective.item);
    return `${item?.name ?? label(objective.item)}: ${count}/${objective.count}`;
  }
  return count > 0 ? "DELIVERED" : `ESCORT: ${label(objective.escort)}`;
}

/** An id turned into something a person can read: `night_manager` → NIGHT
 * MANAGER. Deliberately mechanical — an enemy's display name lives on its def,
 * but reaching the enemy catalog from the app's quest UI would drag the whole
 * roster onto a screen that only needs a caption. */
function label(id: string): string {
  return id.replace(/_/g, " ").toUpperCase();
}

/** The reward, in the same words the handover will use. */
function rewardLines(
  state: GameState,
  reward: ReturnType<typeof questDef>["reward"],
): string[] {
  if (!reward) return [];
  const rows: string[] = [];
  const xp = questXpReward(state, reward);
  if (xp > 0) rows.push(`${xp} XP`);
  if (reward.coins) rows.push(`${reward.coins} COINS`);
  if (reward.loot) {
    rows.push(
      reward.loot.count === 1 ? "AN ITEM" : `${reward.loot.count} ITEMS`,
    );
  }
  for (const id of reward.uniques ?? []) rows.push(label(id));
  for (const id of reward.abilities ?? []) rows.push(`${label(id)} POWER`);
  return rows;
}

// Re-exported so the tracker can size its own rows against the same reach the
// engine talks to a giver at, without a second import of the config barrel.
export { QUESTS };
