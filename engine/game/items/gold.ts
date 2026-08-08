// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GOLD — what a body was carrying, shed on the floor when it falls.
//
// The coin economy's second faucet (config `GOLD`): selling loot recycles what
// the run already handed you, gold is new money, and it is what the AUTO PILOT
// meter is paid with. One funnel — `dropGold` — called from `killEnemy`, and
// three rules it exists to keep honest:
//
//   1. NOT EVERY CORPSE PAYS. One body in five, so a fight's floor stays blood
//      rather than becoming a coin fountain. The rate is made up for in the
//      SIZE of a pile, never in how many of them there are.
//   2. ONLY SOMETHING WITH POCKETS. `carriesGold` asks the question the roster
//      already answers — does it WALK, and is it a person-shape rather than an
//      animal — and a def overrides either way with `wealth`.
//   3. THE DRAWS COME OFF `state.goldRng`, NEVER `state.rng()`. Gold is a
//      payout rather than presentation, so an id-hash would be the wrong tool
//      (two runs of one seed must differ where the seed differs); but a draw on
//      the loot stream would mean that moving `GOLD.dropMult` reshuffles every
//      equipment drop in the run — and the calibration this whole block exists
//      for is precisely "gold off the floor vs. loot hauled to the counter".
//      Moving one side must not move the other, or the measurement is circular.
//      Same discipline `fxRng` keeps for damage variance.

import { clamp, type Vec2 } from "@game/lib/vec.ts";

import { GOLD } from "../config/index.ts";
import type { EnemyDef } from "../defs/enemies/types.ts";
import type { GameState, Item } from "../types/index.ts";

import { dropItem } from "./toss.ts";

/**
 * WHETHER A BODY OF THIS KIND WAS CARRYING MONEY — the HUMANOID question, and
 * it is answered from what the roster already says rather than from a new field
 * every def would have to remember to set.
 *
 * A thing that WALKS ON LEGS and is not a beast is a humanoid: it has pockets,
 * it had wages, and it was carrying some of them. That is 49 people and 18
 * two-legged machines on the shipped roster — the cowbot with a till in its
 * chest, the tin outlaw, the fembot — because a walking machine in a park built
 * to take money is as much a purse as the man who wrote its firmware, and the
 * satire is poorer if the robots are exempt from the economy they exist to run.
 *
 * The three things it excludes are the three that have nowhere to put a coin:
 * `wheels` (a rover, a turret — a chassis, not a person), `float` (a haunting
 * and a rift-thing both drift, and neither has a pocket), and `beast` anatomy
 * (a longhorn was never paid). So the moon's dead and the rift's geometry pay
 * nothing at all, which is texture rather than a hole — both maps have named
 * elites and bosses that carry `wealth` of their own.
 *
 * `wealth` overrides in both directions (see `EnemyDef.wealth`): 0 closes the
 * pockets of a body that would have paid, and anything above 0 opens the
 * pockets of one that would not have — which is how THE VAULT WARDEN, bolted to
 * a treasury door on treads, still pays like the treasury.
 */
export function carriesGold(def: EnemyDef): boolean {
  if (def.wealth !== undefined) return def.wealth > 0;
  // A STRUCTURE is a thing a boss planted, an APPARITION is not there at all,
  // and neither of them ever had a wallet — both take the `elite` role for
  // mechanical reasons that have nothing to do with being a character.
  if (def.structure || def.apparition) return false;
  return (
    (def.locomotion ?? "legs") === "legs" &&
    (def.anatomy ?? "humanoid") !== "beast"
  );
}

/** The chance a kill of this role sheds a purse at all (config `GOLD`). */
function goldChance(def: EnemyDef): number {
  return def.role === "boss"
    ? GOLD.bossChance
    : def.role === "elite"
      ? GOLD.eliteChance
      : GOLD.minionChance;
}

/**
 * What this body's purse is WORTH before variance — the whole ladder in one
 * expression, exported because the balance tests and the simulator's GOLD
 * verdict both want the expectation rather than a sampled roll.
 *
 * `base + perMlvl × mlvl` prices the pile off the ground the fight is on, and
 * everything after it is a multiplier: the body's RANK, how rich it was, and
 * the one global knob.
 */
export function goldValue(def: EnemyDef, mlvl: number): number {
  const rarity = def.rarity ? GOLD.rarityMult[def.rarity] : 1;
  const hellborn = def.hellborn ? GOLD.hellbornMult : 1;
  return (
    (GOLD.base + GOLD.perMlvl * Math.max(1, mlvl)) *
    GOLD.roleMult[def.role] *
    (def.wealth ?? 1) *
    // A special monster and a hellborn one take the LARGER of the two purses
    // rather than stacking them, exactly as their drop rolls do.
    Math.max(rarity, hellborn) *
    GOLD.dropMult
  );
}

/**
 * The EXPECTED gold one kill of this def at this level pays, chance included —
 * the figure a balance pass reasons about, since four kills in five pay nothing
 * and the fifth pays five times as much as "a kill is worth".
 */
export function expectedGold(def: EnemyDef, mlvl: number): number {
  if (!carriesGold(def)) return 0;
  return goldValue(def, mlvl) * goldChance(def);
}

/**
 * Shake this body's purse onto the floor, if it had one.
 *
 * A minion's payout lands as one pile; an elite's splits in two and a boss's
 * into six, scattered around the wreck — the same total either way, because the
 * split is spectacle. A boss's takings arriving as one tidy heap read like a
 * medkit; arriving as a fountain they read like the vault came open, and that
 * is the whole of what the D2 gold drop was ever selling.
 */
export function dropGold(
  state: GameState,
  def: EnemyDef,
  at: Vec2,
  mlvl: number,
): void {
  if (!carriesGold(def)) return;
  if (state.goldRng() >= goldChance(def)) return;

  const spread = 1 + (state.goldRng() * 2 - 1) * GOLD.variance;
  const total = Math.max(1, Math.round(goldValue(def, mlvl) * spread));
  const piles = Math.max(1, GOLD.piles[def.role]);
  // Split as evenly as the coins allow, with the remainder on the first pile —
  // a boss whose six piles were rolled independently could shed one worth ten
  // times another, which reads as a bug rather than as a fountain.
  const each = Math.floor(total / piles);
  for (let i = 0; i < piles; i++) {
    const amount = each + (i === 0 ? total - each * piles : 0);
    if (amount <= 0) continue;
    const angle = (i / piles) * Math.PI * 2 + state.goldRng() * 0.9;
    const reach =
      piles === 1 ? 0 : GOLD.scatterPx * (0.4 + state.goldRng() * 0.6);
    const pos = {
      x: clamp(at.x + Math.cos(angle) * reach, 16, state.level.width - 16),
      y: clamp(at.y + Math.sin(angle) * reach, 16, state.level.height - 16),
    };
    const item: Item = { id: state.nextId++, kind: "gold", pos, amount };
    dropItem(state, item, at);
  }
}

/** A stable 0..1 fraction off an integer id — the same idiom `toss.ts` scatters
 * with, and used here for exactly the same reason: which of a rung's several
 * pile sprites a heap wears is PRESENTATION, and must not cost a draw. */
function hash01(id: number, salt: number): number {
  const x = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Which pile sprite a heap of `amount` coins wears (config `GOLD.pileTiers`):
 * the rung is what is in it, and WHICH of that rung's several stamps is the
 * item's own id — so a floor strewn with piles reads as a floor strewn with
 * money rather than with one repeated sprite.
 */
export function goldSprite(amount: number, id: number): string {
  const tier =
    GOLD.pileTiers.find((t) => amount >= t.min) ??
    GOLD.pileTiers[GOLD.pileTiers.length - 1]!;
  const pick = Math.floor(hash01(id, 3) * tier.sprites.length);
  return tier.sprites[Math.min(pick, tier.sprites.length - 1)]!;
}
