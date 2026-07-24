// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// GRANTED SPELLS & PROCS — the forever powers items carry (the `spell` and
// `proc` affix kinds; config `SPELL` owns the numbers). A granted spell is
// the permanent twin of a conjured powerup: alive while the piece is worn,
// re-derived from the loadout every tick (`syncItemSpells`), rank-scaled
// (worn sources of the same spell ADD their ranks), damage-deepened by the
// same `abilityPowerScale` the pickups ride, and — the part the pickups
// don't get — its tick/strike INTERVALS shorten with INTELLIGENCE
// (`SPELL.intervalPerInt`). The per-tick behavior itself lives in step/
// (`stepItemSpells`/`stepProcs`) so all combat flows through one hitEnemy
// path; this module owns the derivation and the numbers.

import type { Vec2 } from "@game/lib/vec.ts";
import { ABILITY, SPELL } from "./config/index.ts";
import {
  activeEquippedAffixes,
  effectiveStat,
  heroLoadoutMemo,
} from "./items/index.ts";
import { talentSpellRanks } from "./talent-effects.ts";
import type {
  GameState,
  ItemSpell,
  Player,
  ProcSpell,
  ProcTrigger,
  SpellKind,
} from "./types/index.ts";

/**
 * INT's interval multiplier on granted spells: each point of effective
 * INTELLIGENCE trims the authored cooldown/interval by `SPELL.intervalPerInt`,
 * floored at `SPELL.intervalFloor` — the "improvable by INT" cadence lever.
 */
export function spellIntervalScale(state: GameState): number {
  return Math.max(
    SPELL.intervalFloor,
    1 - effectiveStat(state, "intelligence") * SPELL.intervalPerInt,
  );
}

/** Summed rank per granted spell across the applying (unbroken) loadout PLUS
 * the hero's trained CONJURATION talents — the two rank sources stack, so a
 * magic-tree hero's Orbiting Flames / Storm Call drive the same forever spells
 * a legendary grants (and a hero wearing both gets the sum). */
export function grantedSpellRanks(
  state: GameState,
): Partial<Record<SpellKind, number>> {
  const ranks: Partial<Record<SpellKind, number>> = {};
  for (const affix of activeEquippedAffixes(state)) {
    if (affix.kind !== "spell") continue;
    ranks[affix.spell] = (ranks[affix.spell] ?? 0) + affix.rank;
  }
  const fromTalents = talentSpellRanks(state);
  for (const spell of Object.keys(fromTalents) as SpellKind[]) {
    ranks[spell] = (ranks[spell] ?? 0) + (fromTalents[spell] as number);
  }
  return ranks;
}

/**
 * Reconcile `player.itemSpells` with what the loadout grants right now:
 * spells keep their sweep/cooldown scratch state while their summed rank is
 * unchanged, re-seed when it moves (an upgrade re-rings the orbs), and fall
 * away with the piece that granted them. Cheap enough to run every tick —
 * equipment is seven slots deep.
 */
export function syncItemSpells(state: GameState): void {
  const ranks = grantedSpellRanks(state);
  const player = state.player;
  const kept: ItemSpell[] = [];
  for (const spell of Object.keys(ranks) as SpellKind[]) {
    const rank = ranks[spell] as number;
    const live = player.itemSpells.find((s) => s.spell === spell);
    if (live && live.rank === rank) kept.push(live);
    else kept.push({ spell, rank, angle: 0, cooldownMs: 0 });
  }
  if (
    kept.length !== player.itemSpells.length ||
    kept.some((s, i) => player.itemSpells[i] !== s)
  ) {
    player.itemSpells = kept;
  }
}

/** The live numbers of a granted ORBIT ring at `rank` for this player:
 * rank grows the ring and the bite, INT quickens the tick. */
export function orbitSpellParams(
  state: GameState,
  rank: number,
): {
  count: number;
  damage: number;
  radius: number;
  angularSpeed: number;
  hitCooldownMs: number;
  orbRadius: number;
  sprite: string;
} {
  const o = SPELL.orbit;
  const steps = Math.max(0, rank - 1);
  return {
    count: o.count + o.countPerRank * steps,
    damage: o.damage + o.damagePerRank * steps,
    radius: o.radius,
    angularSpeed: o.angularSpeed,
    hitCooldownMs: o.hitCooldownMs * spellIntervalScale(state),
    orbRadius: o.orbRadius,
    sprite: o.sprite,
  };
}

/** The live numbers of a granted STORM at `rank`: rank raises the bolt and
 * quickens the strikes; INT quickens them further. */
export function stormSpellParams(
  state: GameState,
  rank: number,
): { intervalMs: number; damage: number; range: number } {
  const s = SPELL.storm;
  const steps = Math.max(0, rank - 1);
  return {
    intervalMs:
      s.intervalMs *
      Math.pow(s.intervalPerRankMult, steps) *
      spellIntervalScale(state),
    damage: s.damage + s.damagePerRank * steps,
    range: s.range,
  };
}

/** The live numbers of a granted STASIS field at `rank`: rank widens and
 * deepens (floored), INT widens further — the same lever the pickup has. */
export function stasisSpellParams(
  state: GameState,
  rank: number,
): { radius: number; slowFactor: number } {
  const s = SPELL.stasis;
  const steps = Math.max(0, rank - 1);
  return {
    radius:
      s.radius +
      s.radiusPerRank * steps +
      effectiveStat(state, "intelligence") * ABILITY.stasisRadiusPerInt,
    slowFactor: Math.max(
      s.slowFactorMin,
      s.slowFactor + s.slowFactorPerRank * steps,
    ),
  };
}

/** A BOLT proc's damage at `rank` (level-1 value — `abilityPowerScale`
 * deepens it at the hit site, like every conjured blow). */
export function boltProcDamage(rank: number): number {
  return SPELL.bolt.damage + SPELL.bolt.damagePerRank * Math.max(0, rank - 1);
}

/** A NOVA proc's ring at `rank` (damage is the level-1 value). */
export function novaProcParams(rank: number): {
  radius: number;
  damage: number;
} {
  const steps = Math.max(0, rank - 1);
  return {
    radius: SPELL.nova.radius + SPELL.nova.radiusPerRank * steps,
    damage: SPELL.nova.damage + SPELL.nova.damagePerRank * steps,
  };
}

/** World positions of a granted orbit spell's orbs, mirroring the pickup's
 * `orbPositions` — shared by the damage tick and the renderer. */
export function itemSpellOrbPositions(
  state: GameState,
  player: Player,
  spell: ItemSpell,
): Vec2[] {
  if (spell.spell !== "orbit") return [];
  const params = orbitSpellParams(state, spell.rank);
  const positions: Vec2[] = [];
  for (let i = 0; i < params.count; i++) {
    const angle = spell.angle + (i * Math.PI * 2) / params.count;
    positions.push({
      x: player.pos.x + Math.cos(angle) * params.radius,
      y: player.pos.y + Math.sin(angle) * params.radius,
    });
  }
  return positions;
}

/** Every PROC on the applying loadout that fires on `trigger` — the list
 * `hitEnemy` rolls when the hero's own weapon blow lands/kills. */
export function equippedProcs(
  state: GameState,
  trigger: ProcTrigger,
): { spell: ProcSpell; chance: number; rank: number }[] {
  // Read on every landed weapon blow — memoized on the loadout so a horde
  // fight doesn't rebuild the same list hundreds of times a second.
  const memo = heroLoadoutMemo(state);
  const cached = memo.procs[trigger];
  if (cached) return cached;
  const procs: { spell: ProcSpell; chance: number; rank: number }[] = [];
  for (const affix of activeEquippedAffixes(state)) {
    if (affix.kind === "proc" && affix.trigger === trigger) {
      procs.push({
        spell: affix.spell,
        chance: affix.chance,
        rank: affix.rank,
      });
    }
  }
  memo.procs[trigger] = procs;
  return procs;
}
