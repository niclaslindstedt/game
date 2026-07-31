// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// ESCORTS — the errand that makes the hero responsible for somebody who cannot
// fight. One body on the field per running `escort` objective.
//
// THE ESCORT DOES NOT JOIN THE COMBAT SYSTEM, and that is the design rather
// than a shortcut. A companion is an actor: it picks targets, swings, takes
// aggro, and every pass in the enemy loop has to know about it. An escort is a
// TIMER WITH A BODY — it walks toward the hero, it stops when left, and the
// horde bites it when the horde is close. So it costs one pass of its own and
// changes nothing in `step/enemies.ts`, while still creating the exact tension
// the errand exists for: the fight wants the hero to kite, and the follower
// wants him not to.
//
// The horde reaches it BECAUSE it follows the hero, not because anything
// retargets. That is enough — mobs converge on the hero, the escort walks into
// that convergence, and a player who fights on the spot instead of pulling
// away gets somebody hurt. Retargeting the horde onto the escort was tried on
// paper and rejected: it turns every escort into a fixed-rate damage race the
// player cannot influence, which is the thing escort quests are hated for.

import { distance, moveToward, type Vec2 } from "@game/lib/vec.ts";

import { QUESTS } from "../config/index.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { questDef, questEscortDef } from "../defs/quests.ts";
import { resolveObstacles } from "../obstacles.ts";
import type { EscortState, GameState } from "../types/index.ts";
import { inert } from "../disposition.ts";

/**
 * Put an escort on the field for a freshly accepted objective. Placed at its
 * authored spot, or at the giver's feet when it names none — the person you
 * are walking somewhere is usually standing next to the person who asked.
 */
export function spawnEscort(
  state: GameState,
  questId: string,
  escortId: string,
  to: Vec2,
  fallbackAt: Vec2,
): EscortState | null {
  const def = questEscortDef(questId, escortId);
  if (!def) return null;
  const maxHp = def.hp ?? QUESTS.escortHp;
  const escort: EscortState = {
    id: state.nextId++,
    questId,
    defId: escortId,
    pos: def.at ? { ...def.at } : { ...fallbackAt },
    hp: maxHp,
    maxHp,
    to: { ...to },
    faceLeft: false,
    moving: false,
    hitCooldownMs: 0,
    arrived: false,
    waiting: false,
  };
  state.escorts.push(escort);
  return escort;
}

/** Drop every escort belonging to `questId` (the quest ended, either way). */
export function clearEscorts(state: GameState, questId: string): void {
  state.escorts = state.escorts.filter((e) => e.questId !== questId);
}

/**
 * Walk the escorts, let the horde bite them, and report what happened.
 *
 * Returns the ids of escorts that ARRIVED and those that FELL this tick rather
 * than resolving the quests itself: the quest log is the caller's business
 * (see `stepQuests`), and an escort that both arrives and dies on the same
 * tick has to be resolved in one place, not two.
 */
export function stepEscorts(
  state: GameState,
  dt: number,
  dtMs: number,
): { arrived: EscortState[]; died: EscortState[] } {
  const arrived: EscortState[] = [];
  const died: EscortState[] = [];
  if (state.escorts.length === 0) return { arrived, died };

  for (const escort of state.escorts) {
    escort.moving = false;
    if (escort.hitCooldownMs > 0) {
      escort.hitCooldownMs = Math.max(0, escort.hitCooldownMs - dtMs);
    }
    if (escort.arrived) continue;

    // The walk. It heads for the HERO, not for the destination: the errand is
    // "bring them along", so the hero's route is the route, and a follower
    // that pathed to the goal on its own would simply solve the quest by
    // itself while he fought somewhere else.
    const toHero = distance(escort.pos, state.players[0].pos);
    escort.waiting = toHero > QUESTS.escortLeashDistance;
    if (!escort.waiting && toHero > QUESTS.escortFollowDistance) {
      const before = escort.pos;
      escort.pos = moveToward(
        escort.pos,
        state.players[0].pos,
        QUESTS.escortSpeed * dt,
      );
      const dx = escort.pos.x - before.x;
      if (Math.abs(dx) > 0.01) escort.faceLeft = dx < 0;
      escort.moving = true;
      resolveObstacles(state, escort.pos, QUESTS.escortRadius);
    }

    // Arrival is judged on the ESCORT's own position, never the hero's: the
    // errand is delivered when the person is there, and a hero who runs ahead
    // to the door has delivered nobody.
    if (distance(escort.pos, escort.to) <= QUESTS.escortArriveRadius) {
      escort.arrived = true;
      escort.moving = false;
      arrived.push(escort);
      state.events.push({
        type: "escortArrived",
        pos: { ...escort.pos },
        questId: escort.questId,
      });
      continue;
    }

    // The bite. One blow per cadence however many mobs are in reach — the
    // same rule the burning floor bills by, and for the same reason: an
    // escort standing in a crowd must be a warning, not an instant loss.
    if (escort.hitCooldownMs > 0) continue;
    let worst = 0;
    for (const enemy of state.enemies) {
      if (distance(enemy.pos, escort.pos) > QUESTS.escortContactRadius)
        continue;
      const def = enemyDef(enemy.defId);
      if (inert(def, enemy)) continue;
      worst = Math.max(worst, def.contactDamage * (enemy.contactMult ?? 1));
    }
    if (worst <= 0) continue;
    const damage = Math.max(1, Math.round(worst * QUESTS.escortDamageMult));
    escort.hp -= damage;
    escort.hitCooldownMs = QUESTS.escortHitEveryMs;
    if (escort.hp > 0) {
      state.events.push({
        type: "escortHurt",
        pos: { ...escort.pos },
        questId: escort.questId,
        hp: escort.hp,
        maxHp: escort.maxHp,
      });
    } else {
      escort.hp = 0;
      died.push(escort);
      state.events.push({
        type: "escortDied",
        pos: { ...escort.pos },
        questId: escort.questId,
      });
    }
  }
  return { arrived, died };
}

/** What the app calls this escort — resolved through the quest that owns it. */
export function escortName(escort: EscortState): string {
  return questEscortDef(escort.questId, escort.defId)?.name ?? "THE ESCORT";
}

/** The sprite family the renderer draws them with. */
export function escortSprite(escort: EscortState): string {
  return questEscortDef(escort.questId, escort.defId)?.sprite ?? "merchant";
}

/** The line spoken when they set off, if their def ships one. */
export function escortSetOffLine(escort: EscortState): string | null {
  return questEscortDef(escort.questId, escort.defId)?.setOff ?? null;
}

/** The line spoken on arrival, if their def ships one. */
export function escortArrivedLine(escort: EscortState): string | null {
  return questEscortDef(escort.questId, escort.defId)?.arrived ?? null;
}

/**
 * The destination an escort objective walks to, read off the def. Exported so
 * the app can draw the marker and the engine can place the body without either
 * re-deriving the objective's index.
 */
export function escortDestination(
  questId: string,
  escortId: string,
): Vec2 | null {
  const objective = questDef(questId).objectives.find(
    (o) => o.kind === "escort" && o.escort === escortId,
  );
  return objective && objective.kind === "escort" ? { ...objective.to } : null;
}
