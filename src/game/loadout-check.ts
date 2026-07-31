// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// VALIDATING A JOINER'S HERO — the second of the multiplayer plan's two §5.3
// debts, and the one place a stranger's claim about their own character is
// weighed before the simulation is handed it.
//
// A joining client sends a `Loadout` on its `join` frame and the session passed
// it straight into `seatHero`. That is a claim from a stranger reaching the
// authoritative state unread: a hero at level 4,000 with a thousand points in
// every stat and a weapon whose def id nothing in the catalogs has ever heard
// of. The first two are a boss's worth of damage in somebody else's game; the
// third is a crash on the HOST's machine from one packet, because half the
// engine resolves a `defId` by looking it up and expecting an answer.
//
// **THE HONESTY THIS OWES, STATED FIRST BECAUSE IT IS THE POINT.** This is a
// SPEED BUMP, NOT A WALL. It is the same class of check as the HMAC on a
// character export: it stops a casual edit and a malformed packet, and it
// cannot stop a determined cheat, because everything it checks is something a
// legitimate hero could genuinely have. A modified client can hand over a
// level-99 hero in perfect artifact gear with every point legally spent, and
// nothing here — or anywhere short of the server owning the roster — can tell
// that from a player who earned it. Do not let a future comment imply otherwise;
// the doc says the same thing out loud.
//
// **IT SANITIZES RATHER THAN REFUSES, AND THAT IS A DECISION.** A refusal at
// the door reads to the player as "cannot join, no reason given", and the case
// it fires on most often is not an attacker at all — it is a save from an older
// build carrying a retired item id, which is exactly the player the mode is
// for. So the pieces that cannot exist are DROPPED, the numbers that are out of
// range are CLAMPED, and what was wrong comes back as a list the host's own log
// names. A hero who arrives having quietly lost a sword knows something went
// wrong; a player who cannot get in does not.

import { LEVELING } from "./config/index.ts";
import { DIFFICULTY_DEFS } from "./defs/difficulties.ts";
import { STAT_NAMES, WEAPON_DEFS } from "./defs/equipment.ts";
import { GEAR_DEFS } from "./defs/gear.ts";
import { baseStatBonus, statCap } from "./leveling.ts";
import { chosenStatPointsThrough } from "./stat-points.ts";
import type { Equipment, Loadout, StatName } from "./types/index.ts";

/**
 * What a validation pass did.
 *
 * `problems` is for the HOST's log and nothing else: it names what was wrong
 * with a stranger's claim, which is a diagnostic rather than a message to the
 * stranger. Telling a joiner precisely which of their fields failed is telling
 * an attacker precisely which of their fields to fix.
 */
export type LoadoutCheck = {
  /** The loadout as the simulation may safely have it. */
  loadout: Loadout;
  /** Human-readable notes on everything that was corrected. Empty is clean. */
  problems: string[];
};

/**
 * How far past what the level allows a stat total may sit before it is cut back.
 *
 * Not zero, and the reason is a real hero rather than a lenient one: a build
 * carries points from the automatic per-level gains, from an adopted veteran's
 * derived allocation and from a respec in progress, and the exact arithmetic
 * that produced a legitimate `spentStats` has moved between releases. A tight
 * bound would refuse honest saves; this one still catches the claim that
 * matters, which is not "three points over" but "two hundred".
 */
const STAT_SLACK = 1.25;

/**
 * Weigh a joiner's claimed hero and hand back one the simulation may have.
 *
 * Null in, null out — a brand-new character joining a friend's game brings no
 * loadout at all and gets the authored fresh start, which needs no checking.
 */
export function validateLoadout(claim: unknown): LoadoutCheck | null {
  if (!claim || typeof claim !== "object") return null;
  const problems: string[] = [];
  const raw = claim as Loadout;
  const level = clampLevel(raw.level, problems);
  const loadout: Loadout = {
    ...raw,
    level,
    xp: finite(raw.xp, 0),
    stats: checkStats(raw.stats, level, "stats", problems),
    spentStats: raw.spentStats
      ? checkStats(raw.spentStats, level, "spentStats", problems)
      : undefined,
    pendingStatPoints: clamp(
      finite(raw.pendingStatPoints, 0),
      0,
      chosenStatPointsThrough(LEVELING.maxLevel),
    ),
    equipment: checkEquipment(raw.equipment, problems),
    inventory: Array.isArray(raw.inventory)
      ? raw.inventory.map((piece) => keepPiece(piece, problems))
      : [],
    vault: Array.isArray(raw.vault)
      ? raw.vault
          .map((piece) => keepPiece(piece, problems))
          .filter((piece): piece is Equipment => piece !== null)
      : undefined,
    coins:
      raw.coins === undefined ? undefined : Math.max(0, finite(raw.coins, 0)),
  };
  return { loadout, problems };
}

/** The hero's level, held inside the ladder the game actually has. */
function clampLevel(raw: unknown, problems: string[]): number {
  const level = Math.floor(finite(raw, 1));
  const held = clamp(level, 1, LEVELING.maxLevel);
  if (held !== level) problems.push(`level ${level} → ${held}`);
  return held;
}

/**
 * One stat block, held to what a hero of this level could have.
 *
 * TWO CEILINGS, AND BOTH ARE NEEDED. No single stat may pass the game's own
 * level-scaled roof — `statCap(level)`, which is precisely "what you would
 * reach pouring every chosen point into this one stat", plus whatever the
 * automatic per-level gains have paid on top of it — and the block as a whole
 * may not sum past the points a hero of that level has ever been handed, with
 * slack (see `STAT_SLACK`). A per-stat cap alone lets a level-2 hero sit five
 * stats at the roof; a total alone lets one stat hold all of it.
 */
function checkStats(
  raw: unknown,
  level: number,
  what: string,
  problems: string[],
): Record<StatName, number> {
  const held = {} as Record<StatName, number>;
  const source = (raw ?? {}) as Partial<Record<StatName, number>>;
  let auto = 0;
  for (const stat of STAT_NAMES) {
    const gained = baseStatBonus(level, stat);
    auto += gained;
    held[stat] = clamp(
      Math.floor(finite(source[stat], 0)),
      0,
      statCap(level) + gained,
    );
  }
  // The head start a gentle rung opens with is a few points on top of the
  // ladder, so the budget carries it rather than calling the block a forgery.
  const headStart = Math.max(
    ...Object.values(DIFFICULTY_DEFS).map((diff) =>
      Object.values(diff.startingStats).reduce<number>(
        (sum, points) => sum + (points ?? 0),
        0,
      ),
    ),
  );
  const budget = Math.ceil(
    (chosenStatPointsThrough(level) + headStart + auto) * STAT_SLACK,
  );
  let total = 0;
  for (const stat of STAT_NAMES) total += held[stat];
  if (total <= budget) return held;
  problems.push(`${what} sum ${total} > ${budget} at level ${level}`);
  // Cut back PROPORTIONALLY rather than to zero: the claim is unbelievable, but
  // the shape of the build is still the player's, and a hero who arrives with
  // every stat blanked is a hero nobody wants to play.
  const scale = budget / total;
  for (const stat of STAT_NAMES) held[stat] = Math.floor(held[stat] * scale);
  return held;
}

/** Every worn slot, with anything the catalogs cannot answer for removed. */
function checkEquipment(
  raw: Loadout["equipment"] | undefined,
  problems: string[],
): Loadout["equipment"] {
  const worn = (raw ?? {}) as Partial<Loadout["equipment"]>;
  const slot = (piece: Equipment | null | undefined) =>
    keepPiece(piece, problems);
  return {
    // The weapon slot is never empty in the engine's own terms, but a claim
    // may well arrive with a bogus one — `applyLoadout` handles a missing
    // weapon by leaving the built-in sidearm in place, which is exactly the
    // right outcome for a piece nothing has heard of.
    weapon: slot(worn.weapon) as Equipment,
    head: slot(worn.head),
    chest: slot(worn.chest),
    legs: slot(worn.legs),
    feet: slot(worn.feet),
    amulet: slot(worn.amulet),
    ring1: slot(worn.ring1),
    ring2: slot(worn.ring2),
    offhand: slot(worn.offhand),
    // The two LEGACY slots ride along untouched in shape but are still weighed:
    // `applyLoadout` reads both, so a bogus piece in one reaches the run
    // exactly as a bogus piece in a live slot would.
    charm: worn.charm === undefined ? undefined : slot(worn.charm),
    bag: worn.bag === undefined ? undefined : slot(worn.bag),
  };
}

/**
 * One item, or null if the catalogs cannot mint it.
 *
 * The def id is the load-bearing check and the only one that can crash a host:
 * `weaponDef`/`gearDef` throw on an id they do not hold, and they are called
 * from the damage pass, the renderer's paper doll and the merchant's counter.
 * Everything else here is a number held inside its own range — an `ilvl` past
 * the ladder inflates every affix that scales with it, and a negative
 * durability is a piece that can never break.
 */
function keepPiece(raw: unknown, problems: string[]): Equipment | null {
  if (!raw || typeof raw !== "object") return null;
  const piece = raw as Equipment;
  const defId = piece.defId;
  if (typeof defId !== "string" || !mintable(defId)) {
    problems.push(`unknown item "${String(defId)}"`);
    return null;
  }
  return {
    ...piece,
    ilvl: clamp(Math.floor(finite(piece.ilvl, 1)), 1, LEVELING.maxLevel),
    affixes: Array.isArray(piece.affixes) ? piece.affixes : [],
    durability:
      piece.durability === undefined
        ? undefined
        : Math.max(0, Math.floor(finite(piece.durability, 0))),
  };
}

/** True when the game's own catalogs hold this base — the shipped ones and
 * whatever a MOD registered, since `registerDefs` swaps these very records and
 * both ends of a session have already agreed on their mod list. */
function mintable(defId: string): boolean {
  return defId in WEAPON_DEFS || defId in GEAR_DEFS;
}

function finite(raw: unknown, fallback: number): number {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : fallback;
}

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}
