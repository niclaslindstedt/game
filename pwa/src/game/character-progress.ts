// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A character's PROGRESSION — pure queries over a stored hero (characters.ts),
// with no persistence of their own: what has this hero cleared, which
// difficulty rungs and missions are open to them, and where does LOAD drop them
// back in. Split out of characters.ts, which owns the roster, its storage, and
// the mutations that advance a hero; this file only reads.
//
// The rules themselves live in the engine's catalogs (`LEVEL_ORDER`,
// `DIFFICULTY_ORDER`, `DIFFICULTY_UNLOCK_PREREQS`, `STARTING_DIFFICULTIES`) —
// these functions are how a hero's bookmarks are read against them.

import {
  DIFFICULTY_ORDER,
  DIFFICULTY_UNLOCK_PREREQS,
  LEVEL_ORDER,
  STARTING_DIFFICULTIES,
  type Difficulty,
} from "@game/menu";

import type { Character } from "./characters.ts";

/** A hero's clear/merchant bookmark for one mission on one difficulty. Shared
 * with characters.ts, which stamps the same key when it records one. */
export function clearKey(levelId: string, difficulty: Difficulty): string {
  return `${difficulty}:${levelId}`;
}

// ---- Progression queries (pure over a character) ------------------------------

// The two `storySeen` marker shapes (see the field's docs): an OPENING is
// pinned to a level, a THOUGHT to a difficulty alone (ids are globally unique).
// Written by characters.ts (`markStorySeen`), read here.
export function openingKey(levelId: string, difficulty: Difficulty): string {
  return `${difficulty}:${levelId}`;
}
export function thoughtSeenKey(
  thoughtId: string,
  difficulty: Difficulty,
): string {
  return `${difficulty}#${thoughtId}`;
}

/** Has this character cleared `levelId` at `difficulty`? */
export function hasClearedLevel(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.clears.includes(clearKey(levelId, difficulty));
}

/**
 * The level ids this character has cleared on `difficulty`, fed to the engine
 * (`createGame`'s `clearedLevels`) so campaign-gated drops know the run's
 * progress — chiefly the bunker key, latent until "boot_hill" is cleared.
 */
export function clearedLevelsFor(
  character: Character,
  difficulty: Difficulty,
): string[] {
  const prefix = `${difficulty}:`;
  return character.clears
    .filter((c) => c.startsWith(prefix))
    .map((c) => c.slice(prefix.length));
}

/**
 * Has this character already witnessed `levelId`'s opening (prelude cutscene +
 * intro monologue) on `difficulty`? True means a replay should skip straight
 * into play (see `skipStoryOpening`).
 */
export function hasSeenOpening(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.storySeen.includes(openingKey(levelId, difficulty));
}

/**
 * The pinned inner-monologue (thought) ids this character has already read on
 * `difficulty`. Fed back into the engine on a rebuild (`markThoughtsSeen`) so
 * a replay skips every beat it has already shown while a not-yet-reached one
 * still plays its one time.
 */
export function seenThoughts(
  character: Character,
  difficulty: Difficulty,
): string[] {
  const prefix = `${difficulty}#`;
  return character.storySeen
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));
}

/** Has this hero met the wandering merchant on `levelId` at `difficulty`? The
 * app feeds the answer to `createGame` (`merchantDiscovered`) so the trader is
 * set up at the door on re-entry. */
export function hasMetMerchant(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  return character.merchantsMet.includes(clearKey(levelId, difficulty));
}

/** Has this character beaten the whole campaign at `difficulty`? */
export function isDifficultyBeaten(
  character: Character,
  difficulty: Difficulty,
): boolean {
  return character.beaten.includes(difficulty);
}

/**
 * Is `difficulty`'s TIER beaten — the gate that opens the free-replay level
 * picker (rather than marching the hero through the campaign from level one)?
 *
 * The three starting lanes (easy/medium/hard) are PARALLEL entry points sharing
 * ONE tier (`STARTING_DIFFICULTIES`): they run the same missions over the same
 * hero-level band, so beating ANY one of them clears that shared tier. Once it's
 * clear, picking a SIBLING starting lane (to grind the last levels up to the
 * nightmare gate) opens the mission picker too — you don't replay the whole
 * campaign from the first level just because that specific lane's own bookmark
 * is empty. The gated rungs (nightmare/jesus) stand alone — each is its own tier,
 * beaten only by its own clear.
 */
export function isDifficultyTierBeaten(
  character: Character,
  difficulty: Difficulty,
): boolean {
  if (STARTING_DIFFICULTIES.includes(difficulty)) {
    return STARTING_DIFFICULTIES.some((d) => isDifficultyBeaten(character, d));
  }
  return isDifficultyBeaten(character, difficulty);
}

/**
 * Is `difficulty` playable by this character? Reads the unlock graph
 * (`DIFFICULTY_UNLOCK_PREREQS`): the three parallel starting lanes
 * (easy/medium/hard) have no prerequisites and are always open; a gated rung
 * unlocks once ANY difficulty in its prerequisite list is beaten — NIGHTMARE on
 * any starting lane beaten, JESUS on NIGHTMARE beaten. Locked rungs are shown
 * greyed out on the select screen.
 */
export function isDifficultyUnlocked(
  character: Character,
  difficulty: Difficulty,
): boolean {
  const prereqs = DIFFICULTY_UNLOCK_PREREQS[difficulty] ?? [];
  if (prereqs.length === 0) return true;
  return prereqs.some((d) => isDifficultyBeaten(character, d));
}

/**
 * The rung this hero should aim for next — the roster card's "NEXT: …"
 * standing — following the OR-gated unlock graph, NOT a flat five-rung count.
 * The starting lanes (easy/medium/hard) are PARALLEL entry points sharing one
 * tier: beating ANY one clears that tier and opens NIGHTMARE, which in turn
 * opens JESUS. So the target jumps tier-to-tier, not lane-to-lane — beating
 * (say) HARD points at NIGHTMARE, never back down at the medium lane it skipped.
 *
 * Null once every reachable rung is beaten (the top of the ladder is cleared) —
 * the caller reads that as "ALL CLEARED".
 */
export function nextDifficultyFor(character: Character): Difficulty | null {
  // Hardest first: the first UNLOCKED-but-unbeaten GATED rung is the target
  // (NIGHTMARE once a starting lane falls, JESUS once NIGHTMARE falls). Skips
  // the parallel starting lanes — those are a single tier handled below.
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const d = DIFFICULTY_ORDER[i] as Difficulty;
    if (STARTING_DIFFICULTIES.includes(d)) continue;
    if (
      isDifficultyUnlocked(character, d) &&
      !isDifficultyBeaten(character, d)
    ) {
      return d;
    }
  }
  // No gated rung is an open target. If a starting lane has been beaten the
  // whole gated chain above it must be cleared too — the ladder is done.
  if (STARTING_DIFFICULTIES.some((d) => isDifficultyBeaten(character, d))) {
    return null;
  }
  // Still on the starting tier: aim at the gentlest lane not yet beaten.
  return (
    STARTING_DIFFICULTIES.find((d) => !isDifficultyBeaten(character, d)) ??
    (STARTING_DIFFICULTIES[0] as Difficulty)
  );
}

/**
 * Is `levelId` reachable at `difficulty` for this character? Once the
 * difficulty's TIER is beaten the picker is open — any level goes (beating one
 * starting lane opens the picker on all three; see `isDifficultyTierBeaten`).
 * Before that it is the linear campaign: the opener is always open, and each
 * later level unlocks when the one before it on `LEVEL_ORDER` has been cleared
 * here.
 */
export function isLevelUnlocked(
  character: Character,
  levelId: string,
  difficulty: Difficulty,
): boolean {
  if (isDifficultyTierBeaten(character, difficulty)) return true;
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index <= 0) return true;
  const previous = LEVEL_ORDER[index - 1] as string;
  return hasClearedLevel(character, previous, difficulty);
}

/**
 * The level to drop this character into at `difficulty` when the picker is
 * still locked: the first level along `LEVEL_ORDER` they have not cleared here
 * (falling back to the opener once all are done — replays start at the top).
 */
export function firstUnclearedLevel(
  character: Character,
  difficulty: Difficulty,
): string {
  const opener = LEVEL_ORDER[0] as string;
  return (
    LEVEL_ORDER.find((id) => !hasClearedLevel(character, id, difficulty)) ??
    opener
  );
}

/**
 * Where LOADING this hero drops in: the campaign still IN PROGRESS — the
 * furthest (hardest) difficulty they have begun but not yet beaten — at the
 * beginning of its first uncleared level. A loaded hero is already tied to a
 * difficulty and a current level, so LOAD resumes there straight away with no
 * difficulty picker.
 *
 * Null when no campaign is under way: a brand-new hero who has not started one,
 * or a hero who has beaten every difficulty they have touched. The caller then
 * opens the difficulty ladder instead — the one place a hero picks a starting
 * lane or steps up to a newly-unlocked harder rung.
 */
export function resumeTargetFor(
  character: Character,
): { difficulty: Difficulty; levelId: string } | null {
  // Walk from the hardest rung down so a hero partway up a higher difficulty
  // resumes there rather than on an easier lane they also dipped into.
  for (let i = DIFFICULTY_ORDER.length - 1; i >= 0; i--) {
    const difficulty = DIFFICULTY_ORDER[i] as Difficulty;
    if (isDifficultyBeaten(character, difficulty)) continue;
    if (clearedLevelsFor(character, difficulty).length === 0) continue;
    return { difficulty, levelId: firstUnclearedLevel(character, difficulty) };
  }
  return null;
}

/** The next level along `LEVEL_ORDER`, or null if this is the last (or an
 * unknown id) — the campaign's "advance" step behind the NEXT LEVEL button. */
export function nextLevelId(levelId: string): string | null {
  const index = LEVEL_ORDER.indexOf(levelId);
  if (index < 0 || index + 1 >= LEVEL_ORDER.length) return null;
  return LEVEL_ORDER[index + 1] as string;
}
