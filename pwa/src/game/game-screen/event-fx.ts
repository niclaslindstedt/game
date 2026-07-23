// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Engine events → on-screen feedback. Every visual/audio-adjacent reaction to
// a tick's events lives here: transient canvas effects (slashes, muzzle
// flashes, gore, corpses, damage numbers, combat text), the lower-corner
// pickup feed lines, the framed gear pickup card, the spell-status echo, and
// the XP-strip kill heat. Progress banking (characters, scores) is NOT here —
// see run-progress.ts; the AUTO PILOT's reactions live in autopilot-director.ts.

import {
  companionDef,
  enemyDef,
  PLAYER,
  spellDef,
  storyItemDef,
  type GameEvent,
  type GameState,
} from "@game/core";
import { distance, normalize } from "@game/lib/vec.ts";

import { clusterByTouch } from "@ui/lib/cluster.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { MELEE_SWING_MS } from "../render.ts";
import { getSettings } from "../settings.ts";
import { spellCastEffects } from "../spell-fx.ts";
import { spellColor } from "../spell-visuals.ts";
import { pickupCardVisible, TIER_COLORS } from "../tiers.ts";
import { goreStyleFor, shotStyleFor } from "../weapon-fx.ts";
import type { PickupCardQueueHandle } from "./pickup-ui.ts";
import type { LoopShared } from "./loop-shared.ts";

// How long the inventory button keeps pulsing after the bag turns away loot,
// nudging the player to open it and make room (ms). A few pulse cycles — long
// enough to notice without nagging.
const BAG_FULL_HINT_MS = 4000;

// Merged pack-kill XP floats. When one attack drops this many foes at once and
// their bodies sit in one knot, their XP drips fuse into a single oversized
// "+N XP" pop that jolts like a crit — one big satisfying number instead of a
// smear of overlapping drips. The pack size sets the glyph scale: count/10 (20
// mobs → 2×, 30 → 3×), floored so even a small merge reads as bigger and capped
// so a monster pull can't swallow the screen. `SLACK` is generous — mobs a
// body-width apart still count as one knot, so a wide blast over a loosely
// packed horde (bodies rarely literally overlapping) still merges instead of
// dripping a dozen separate numbers.
const XP_MERGE_MIN_KILLS = 3;
const XP_MERGE_SLACK_PX = 16;
const XP_MERGE_MIN_SCALE = 1.4;
const XP_MERGE_MAX_SCALE = 4;

// XP-bar kill heat. Every kill that grants XP lights the top XP strip a
// brighter blue as it grows; a kill-chain keeps it lit, and once no XP has
// landed for this long the fill eases back to its resting color (the CSS
// transition on `.hud-xp-fill.is-hot`). One second so back-to-back kills read
// as a sustained streak, not a flicker.
export const XP_BAR_HOT_MS = 1000;

// A `swing`/`shot` event is the hero's (not a companion's) when it was thrown
// from his own position — both fire in the same step, so the hero hasn't moved
// off the spot the event recorded. A generous world-px slop absorbs any drift.
const HERO_ATTACK_SLOP_PX = 12;
export function isHeroAttack(
  pos: { x: number; y: number },
  player: { x: number; y: number },
): boolean {
  return distance(pos, player) <= HERO_ATTACK_SLOP_PX;
}

// OVERKILL LAUNCH — how a killing blow's overkill turns into a corpse throw.
// The launch distance is measured in the mob's own HEALTHBARS of OVERKILL
// (`(damage − maxHp) / maxHp`): a blow that only finished a wounded mob throws
// nothing; one that could have killed it several times over sends it sailing.
// A phone's world viewport is ~422×195 units (half-width ~211), and the camera
// chases the advancing hero — so the launch has to clear the half-width AND the
// camera's drift for a body to actually reach the screen edge. `LAUNCH_MAX_PX`
// overshoots both, so a hard overkill visibly rockets a minion off the rim.
const LAUNCH_PX_PER_HEALTH = 80;
const LAUNCH_MAX_PX = 380;
// Heavier bodies barely budge: overkill on an elite/boss is rare (their bars
// are huge), and flinging a giant across the map would read as a bug, so their
// launch is scaled right down — the feature is for the flying HORDE.
const LAUNCH_MASS: Record<string, number> = { elite: 0.32, boss: 0.14 };
// One end-over-end spin per FULL extra starting-HP bar of overkill (see
// `corpseLaunch`): 2× starting HP tumbles once, 3× twice, 4× thrice. Capped
// so a monstrous one-shot stays a countable tumble rather than a spun blur.
const LAUNCH_MAX_SPINS = 4;

/**
 * Size an overkill corpse throw from the killing blow measured against the
 * mob's STARTING health (`damage / maxHp`): the unit heading pointing AWAY
 * from the hero, how far the body sails, and how many whole times it tumbles.
 * Returns null when the blow only finished the mob (≤ its full bar) — then it
 * just topples in place instead of being knocked back.
 */
export function corpseLaunch(
  damage: number,
  maxHp: number,
  from: { x: number; y: number },
  to: { x: number; y: number },
  role: string,
): { dx: number; dy: number; dist: number; spins: number } | null {
  // Overkill in whole starting-HP bars: how many times over its FULL health
  // the blow hit for. ≤ 0 means it merely finished the mob — no knockback.
  const overkill = damage / Math.max(1, maxHp) - 1;
  if (overkill <= 0) return null;
  const mass = LAUNCH_MASS[role] ?? 1;
  // How far it sails grows with the overkill; the DEVELOPER → KNOCKBACK slider
  // scales the whole throw live (1× shipped, 0× disables it, higher rockets
  // bodies off the screen), and heavy elites/bosses barely budge (LAUNCH_MASS).
  const dist =
    Math.min(LAUNCH_MAX_PX, overkill * LAUNCH_PX_PER_HEALTH) *
    mass *
    getSettings().knockback;
  if (dist <= 2) return null;
  // Whole spins tied STRAIGHT to the overkill — one per full extra bar, so the
  // tumble reads the hit's strength, not the (clamped, mass- and slider-scaled)
  // distance: 2× → 1 spin, 3× → 2, 4× → 3. This is what makes the throw feel
  // deliberate instead of random. Sub-bar overkill flies but doesn't complete
  // a rotation; a huge one-shot is capped so its tumble stays countable.
  const spins = Math.min(LAUNCH_MAX_SPINS, Math.floor(overkill));
  // Away from the hero — the corpse flies off in the direction it was struck.
  // If the body sits right on top of him (no clear heading), throw it upward.
  const n = normalize(to.x - from.x, to.y - from.y);
  const dx = n.len > 0.01 ? n.x : 0;
  const dy = n.len > 0.01 ? n.y : -1;
  return { dx, dy, dist, spins };
}

/**
 * XP-strip kill heat bookkeeping, run right after step(): any kill that
 * granted XP lights the freshly-earned slice. A kill while the streak is COLD
 * anchors the bright slice at the pre-kill fill (so only the new XP glows);
 * chained kills extend the same slice. render() holds it through the chain
 * and fades it once XP_BAR_HOT_MS passes without another kill.
 */
export function trackXpHeat(
  shared: LoopShared,
  state: GameState,
  xpBeforeStep: number,
): void {
  if (state.events.some((e) => e.type === "enemyKilled" && e.xp > 0)) {
    const wasHot =
      shared.lastXpGainMs !== undefined &&
      state.stats.timeMs - shared.lastXpGainMs <= XP_BAR_HOT_MS;
    if (!wasHot) shared.xpHeatBaseXp = xpBeforeStep;
    shared.lastXpGainMs = state.stats.timeMs;
  }
}

/**
 * Big kills merge their XP: when one step drops a knot of foes packed
 * body-to-body, fuse their per-kill "+N XP" drips into a single oversized pop
 * that jolts like a crit — the bigger the pack, the bigger and shakier the
 * number (see render.ts's text float). The events in a step already share the
 * same instant (one swing, one AoE), so proximity alone tells the pack apart
 * from unrelated stray kills. Returns the drips that were folded in so the
 * per-kill float skips them. Honors the same `xpFloat` DISPLAY preference.
 */
export function mergePackKillXp(
  shared: LoopShared,
  state: GameState,
): Set<GameEvent> {
  const mergedKills = new Set<GameEvent>();
  if (getSettings().xpFloat === "on") {
    const kills = state.events.filter(
      (e): e is Extract<GameEvent, { type: "enemyKilled" }> =>
        e.type === "enemyKilled" && e.xp > 0,
    );
    if (kills.length >= XP_MERGE_MIN_KILLS) {
      const bodies = kills.map((e) => ({
        x: e.pos.x,
        y: e.pos.y,
        radius: enemyDef(e.defId).radius,
      }));
      for (const group of clusterByTouch(bodies, XP_MERGE_SLACK_PX)) {
        if (group.length < XP_MERGE_MIN_KILLS) continue;
        let xpSum = 0;
        let cx = 0;
        let headY = Infinity; // float above the pack's highest head
        for (const idx of group) {
          const e = kills[idx]!;
          mergedKills.add(e);
          xpSum += e.xp;
          cx += e.pos.x;
          headY = Math.min(headY, e.pos.y - enemyDef(e.defId).radius);
        }
        cx /= group.length;
        const scale = Math.max(
          XP_MERGE_MIN_SCALE,
          Math.min(XP_MERGE_MAX_SCALE, group.length / 10),
        );
        shared.effects.push({
          kind: "text",
          pos: { x: cx, y: headY - 12 },
          untilMs: state.stats.timeMs + 1400,
          durationMs: 1400,
          text: `+${formatCompact(xpSum)} XP`,
          color: "#6cc4ff",
          rise: 34,
          scale,
          shake: true,
        });
      }
    }
  }
  return mergedKills;
}

/**
 * A signature melee weapon throws THEMED gore on the hero's own blows —
 * Muramasa sprays crimson, Excalibur golden light. Detect the hero's swing
 * this tick (matched to his position, ignoring companions) and, if his weapon
 * carries a gore signature, return it so this tick's enemy hits spray it.
 */
export function heroGoreThisTick(state: GameState) {
  return state.events.some(
    (e) => e.type === "swing" && isHeroAttack(e.pos, state.player.pos),
  )
    ? goreStyleFor(state.player.equipment.weapon.uniqueId)
    : null;
}

export type EventFxCtx = {
  state: GameState;
  shared: LoopShared;
  /** Kills whose XP drip was folded into a merged pack pop (mergePackKillXp). */
  mergedKills: Set<GameEvent>;
  /** The hero's signature gore this tick, if his weapon carries one. */
  heroGore: ReturnType<typeof goreStyleFor>;
  /** Append a lower-corner pickup feed line. */
  pushPickup: (text: string, color?: string, prefix?: string) => void;
  /** Flash the HUD spell-status echo (cast name / fizzle reason). */
  flashSpellStatus: (
    text: string,
    tone: "cast" | "fizzle",
    accent: string,
  ) => void;
  /** Enqueue the framed gear pickup card. */
  showPickupCard: PickupCardQueueHandle["show"];
};

/**
 * Translate ONE engine event into its visual/feedback reactions. Called for
 * every event each tick, in event order, so interleaved feed lines keep the
 * engine's own sequence.
 */
export function applyEventFx(event: GameEvent, ctx: EventFxCtx): void {
  const { state, shared, mergedKills, heroGore } = ctx;
  const effects = shared.effects;
  if (event.type === "lightning") {
    effects.push({
      kind: "lightning",
      pos: event.pos,
      untilMs: state.stats.timeMs + 130,
    });
  }
  // A melee swing sweeps a slash toward the target, sized to the
  // weapon's (STRENGTH-widened) reach and its cone: a wide arc for a
  // blade, a narrow thrust for a spear.
  if (event.type === "swing") {
    effects.push({
      kind: "swing",
      // These blows leave the hero's hands, so lift the arc by his
      // current jump height (player.z) — otherwise a swing thrown
      // mid-air draws down at his grounded feet, not up where he is.
      pos: { x: event.pos.x, y: event.pos.y - state.player.z },
      angle: Math.atan2(event.dir.y, event.dir.x),
      radius: event.range,
      arc: event.arc,
      // The cone runs on the SAME clock as the held-weapon swing
      // (MELEE_SWING_MS), so the slash tracks the blade frame for frame.
      untilMs: state.stats.timeMs + MELEE_SWING_MS,
      durationMs: MELEE_SWING_MS,
    });
    // Swing the hero's own blade to match — companions swing from
    // their own spots, so only a blow thrown from the hero's position
    // arms the animation. Hand the weapon's cone (`event.arc`) to the
    // pose so the blade's sweep matches this weapon's reach and arc.
    if (isHeroAttack(event.pos, state.player.pos)) {
      shared.heroAction = {
        kind: "swing",
        weaponClass: "melee",
        startMs: state.stats.timeMs,
        durationMs: MELEE_SWING_MS,
        arc: event.arc,
      };
    }
  }
  // A shot flashes at the muzzle — a hot burst for guns, a cool cast
  // bloom for wands — oriented along the aim.
  if (event.type === "shot") {
    const heroShot = isHeroAttack(event.pos, state.player.pos);
    effects.push({
      kind: "muzzle",
      // Lift to the hero's airborne height so the muzzle flash fires
      // from the weapon in his hands, not from the ground below him.
      pos: { x: event.pos.x, y: event.pos.y - state.player.z },
      angle: Math.atan2(event.dir.y, event.dir.x),
      weaponClass: event.weaponClass,
      untilMs: state.stats.timeMs + 110,
      durationMs: 110,
      // The hero's own shot flashes his weapon's signature; companion/
      // enemy shots keep the plain class look.
      fx:
        heroShot && event.weaponClass !== "melee"
          ? shotStyleFor(
              state.player.equipment.weapon.uniqueId,
              event.weaponClass,
            )
          : undefined,
      // Pin the hero's flash to the barrel's side (his facing) so a shot
      // at a foe BEHIND him still flashes at the weapon, not off his back.
      faceLeft: heroShot ? state.player.faceLeft : undefined,
    });
    // Kick/cast the hero's own weapon to match the muzzle flash — a gun
    // recoils, a wand thrusts — but not a companion's shot.
    if (heroShot) {
      shared.heroAction = {
        kind: "shot",
        weaponClass: event.weaponClass,
        startMs: state.stats.timeMs,
        durationMs: event.weaponClass === "magic" ? 220 : 150,
      };
    }
  }
  // Every landed hit sprays the victim's gore (ghosts: ectoplasm)
  // and pops a static damage number on the head — crits are bigger,
  // gold, and shake in place. Only XP floats up.
  if (event.type === "enemyHit" || event.type === "enemyKilled") {
    const def = enemyDef(event.defId);
    // A screen-nuke kill burns the body up instead of splattering it: the fire
    // replaces the gore splash and the plain corpse with a smoking charred
    // skeleton (the `incinerate` effect below). The damage number + XP float
    // still play, so the blast reads as the kills it is.
    const incinerated = event.type === "enemyKilled" && event.incinerated;
    if (!incinerated) {
      effects.push({
        kind: "splash",
        pos: {
          x: event.pos.x + Math.round((Math.random() - 0.5) * 6),
          y: event.pos.y + Math.round((Math.random() - 0.5) * 6),
        },
        untilMs: state.stats.timeMs + 240,
        durationMs: 240,
        sprite: def.gore ?? "blood",
      });
    }
    // A signature weapon's themed gore, sprayed over the plain splash
    // on the hero's own melee blows (see `heroGore` above).
    if (heroGore && !incinerated) {
      effects.push({
        kind: "burst",
        pos: { x: event.pos.x, y: event.pos.y },
        untilMs: state.stats.timeMs + 320,
        durationMs: 320,
        gore: heroGore,
        seed: Math.floor(Math.random() * 997),
      });
    }
    // A slain mob keels over where it fell — the engine removed the
    // live enemy this tick, so the corpse takes over its spot. Minions
    // are a 2s send-off (fall → lie → blink out); epic bodies (elites
    // and bosses) are few, so they keel over and simply stay down for
    // the rest of the level. Rolls a topple side so the horde doesn't
    // all fall the same way.
    if (event.type === "enemyKilled" && incinerated) {
      // Burned up by the bomb: flames engulf the body and a smoking charred
      // skeleton is left where it fell, smouldering a beat before it fades.
      effects.push({
        kind: "incinerate",
        pos: { x: event.pos.x, y: event.pos.y },
        untilMs: state.stats.timeMs + 1600,
        durationMs: 1600,
        sprite: def.sprite,
        seed: Math.floor(Math.random() * 997),
      });
    } else if (event.type === "enemyKilled") {
      const epic = def.role !== "minion";
      // An overpowered kill punts the body flying away from the hero —
      // further the harder it was overkilled (a legendary one-shot
      // clears the screen). render.ts animates the arc + tumble.
      const launch =
        corpseLaunch(
          event.damage,
          event.maxHp,
          state.player.pos,
          event.pos,
          def.role,
        ) ?? undefined;
      // Epics linger the whole level; a day of run-clock outlives any
      // level, and `persist` keeps them from blinking out. A launched
      // minion gets a longer send-off so it stays visible where it
      // lands instead of blinking mid-flight.
      const lifeMs = epic ? 86_400_000 : launch ? 3200 : 2000;
      effects.push({
        kind: "corpse",
        pos: { x: event.pos.x, y: event.pos.y },
        untilMs: state.stats.timeMs + lifeMs,
        durationMs: lifeMs,
        sprite: def.sprite,
        angle: (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2),
        persist: epic || undefined,
        launch,
      });
    }
    const duration = event.crit ? 900 : 650;
    effects.push({
      kind: "damage",
      pos: {
        x: event.pos.x + Math.round((Math.random() - 0.5) * 12),
        y: event.pos.y - def.radius - 2 - Math.round(Math.random() * 4),
      },
      untilMs: state.stats.timeMs + duration,
      durationMs: duration,
      value: event.damage,
      crit: event.crit,
      critPower: event.critPower,
    });
    // The kill's XP reward flows up off the corpse as blue combat text
    // (WoW's floating "+N"), starting above the damage number and
    // climbing higher/longer so the two don't overlap. The DISPLAY
    // preference `xpFloat` can silence these popups.
    if (
      event.type === "enemyKilled" &&
      event.xp > 0 &&
      !mergedKills.has(event) &&
      getSettings().xpFloat === "on"
    ) {
      // Trail the popup half a second behind the kill's damage number so
      // the two read in sequence — the hit lands, then the XP flows up.
      const xpDelayMs = 500;
      effects.push({
        kind: "text",
        pos: {
          x: event.pos.x,
          y: event.pos.y - def.radius - 12,
        },
        startMs: state.stats.timeMs + xpDelayMs,
        untilMs: state.stats.timeMs + xpDelayMs + 1100,
        durationMs: 1100,
        text: `+${formatCompact(event.xp)} XP`,
        color: "#6cc4ff",
        rise: 30,
      });
    }
  }
  // A mob BOWLED over by an employee stampede is flung aside and knocked
  // out for a few seconds — NOT killed. The engine keeps it alive and
  // coasts the fling itself (its live sprite tumbles), so the app only
  // kicks up a scuff of dust at the impact — no corpse, no gore, no
  // damage number, no XP (the herd can't be farmed).
  if (event.type === "stampedeTrample") {
    effects.push({
      kind: "burst",
      pos: { x: event.pos.x, y: event.pos.y },
      untilMs: state.stats.timeMs + 260,
      durationMs: 260,
      // Kicked-up floor dust — a tan puff, not blood.
      gore: {
        color: "#d8cfb8",
        count: 7,
        spread: 12,
        particle: "mote",
      },
      seed: Math.floor(Math.random() * 997),
    });
  }
  if (event.type === "nuke") {
    effects.push({
      kind: "nuke",
      pos: event.pos,
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      // Scatters the embers; the screen-space flash/fire/smoke is the DOM
      // overlay (createNukeFx), fired from GameScreen's event pass.
      seed: Math.floor(Math.random() * 997),
    });
  }
  // A crate took a blow but held: a small splinter chip flies off it so
  // the hit reads before the box gives way.
  if (event.type === "crateHit") {
    effects.push({
      kind: "burst",
      pos: { x: event.pos.x, y: event.pos.y },
      untilMs: state.stats.timeMs + 220,
      durationMs: 220,
      // Wood splinters — a small tan chip spray, not blood.
      gore: { color: "#caa24d", count: 6, spread: 9, particle: "mote" },
      seed: Math.floor(Math.random() * 997),
    });
  }
  // A crate smashed open: keel the box over and burst it into splinters
  // (the crateBreak effect), leaving just the loot the engine spilled.
  if (event.type === "crateBroken") {
    effects.push({
      kind: "crateBreak",
      pos: { x: event.pos.x, y: event.pos.y },
      untilMs: state.stats.timeMs + 700,
      durationMs: 700,
      sprite: event.sprite,
      angle: (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2),
      seed: Math.floor(Math.random() * 997),
    });
  }
  // A METEOR DETONATION: the flash + shockwave + settling dust cloud,
  // sized to the engine's blast radius. The crater the engine spawned
  // is left under the fading dust.
  if (event.type === "asteroidImpact") {
    effects.push({
      kind: "asteroidImpact",
      pos: event.pos,
      untilMs: state.stats.timeMs + 620,
      durationMs: 620,
      radius: event.radius,
    });
  }
  // A NOVA burst: the expanding ring sized to the engine's damage
  // radius — icy blue for a companion's FROST nova, violet otherwise.
  if (event.type === "nova") {
    effects.push({
      kind: "nova",
      pos: event.pos,
      untilMs: state.stats.timeMs + 320,
      durationMs: 320,
      radius: event.radius,
      frost: event.frost,
    });
  }
  // A spell was CAST: echo its name high on the HUD (element-tinted),
  // and paint the marvellous element-themed cast FX over the shared
  // bolt/nova cues (see spellCastEffects). The base bolt/nova visuals
  // still fire from the underlying hits; this adds the flourish.
  if (event.type === "spellCast") {
    const sdef = spellDef(event.spellId);
    ctx.flashSpellStatus(sdef.name, "cast", spellColor(sdef.element));
    for (const fx of spellCastEffects(sdef, event.pos, state.stats.timeMs)) {
      effects.push(fx);
    }
  }
  // A refused cast: flash why (not enough mana, cooldown, locked, or
  // nothing to do) and pip a soft denial.
  if (event.type === "spellFizzled") {
    const reason =
      event.reason === "mana"
        ? "NO MANA"
        : event.reason === "cooldown"
          ? "RECHARGING"
          : event.reason === "locked"
            ? "LOCKED"
            : "NO TARGET";
    ctx.flashSpellStatus(reason, "fizzle", "#c98a8a");
  }
  // A defensive HEAL: float the amount off the hero in arcane green.
  if (event.type === "spellHealed") {
    effects.push({
      kind: "text",
      pos: {
        x: state.player.pos.x,
        y: state.player.pos.y - PLAYER.radius,
      },
      untilMs: state.stats.timeMs + 800,
      durationMs: 800,
      text: `+${event.heal}`,
      color: "#8ef0a8",
    });
  }
  // A raised WARD: a ring pulses out from the hero.
  if (event.type === "playerShielded") {
    effects.push({
      kind: "nova",
      pos: { ...state.player.pos },
      untilMs: state.stats.timeMs + 360,
      durationMs: 360,
      radius: PLAYER.radius * 3,
    });
  }
  // A sidestep: float a "DODGE" tag off the hero so the whiff reads.
  if (event.type === "playerDodge") {
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: "DODGE",
      color: "#7ecbff",
    });
  }
  // A blow that never landed: the foe sidestepped it ("DODGE") or the
  // hero's own aim whiffed ("MISS"). Float the tag off the target.
  if (event.type === "enemyDodge" || event.type === "enemyMiss") {
    const def = enemyDef(event.defId);
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - def.radius - 2 },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: event.type === "enemyDodge" ? "DODGE" : "MISS",
      color: event.type === "enemyDodge" ? "#cfd6df" : "#9aa3ad",
    });
  }
  // A blow bounced off a guarded unique: float "SHIELDED" so the
  // immunity reads as a rule (kill the controllers first), not a bug.
  if (event.type === "enemyShielded") {
    const def = enemyDef(event.defId);
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - def.radius - 2 },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: "SHIELDED",
      color: "#8fd7ff",
    });
  }
  // An enemy's shot flashes at its muzzle like the hero's own.
  if (event.type === "enemyShot") {
    effects.push({
      kind: "muzzle",
      pos: { x: event.pos.x, y: event.pos.y },
      angle: Math.atan2(event.dir.y, event.dir.x),
      weaponClass: "ranged",
      untilMs: state.stats.timeMs + 110,
      durationMs: 110,
    });
  }
  // A companion's kill-quote banter: hovering text over the killer,
  // gold and longer-lived than a combat tag — a one-liner, not a
  // dialogue scene, so the run never pauses for it.
  if (event.type === "companionQuote") {
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - 16 },
      untilMs: state.stats.timeMs + 2200,
      durationMs: 2200,
      text: event.text,
      color: "#ffd75e",
    });
  }
  // The DING: a "LEVEL UP!" tag rises off the hero while the golden
  // burn plays (the stat chooser waits out the celebration), and the
  // automatic base gains tick into the lower-right feed in gold so
  // the level is FELT in the body, not just in the chooser.
  if (event.type === "levelUp") {
    effects.push({
      kind: "text",
      pos: {
        x: state.player.pos.x,
        y: state.player.pos.y - PLAYER.radius - 8,
      },
      untilMs: state.stats.timeMs + 1100,
      durationMs: 1100,
      text: "LEVEL UP!",
      color: "#ffd75e",
      rise: 26,
    });
    ctx.pushPickup(`LEVEL ${event.level}!`, "#ffd75e", "");
    for (const gain of event.gains) {
      ctx.pushPickup(
        `+${gain.amount} ${gain.stat.toUpperCase()}`,
        "#ffd75e",
        "",
      );
    }
  }
  // A spared figure joined the party: toast the recruitment (its
  // joining scene follows through the dialogue overlay).
  if (event.type === "companionJoined") {
    ctx.pushPickup(`${companionDef(event.defId).name} JOINED`, "#7ef0c8");
  }
  // A companion beaten down / back on its feet: float the state
  // change off its head so the party's ebb reads at a glance.
  if (event.type === "companionDowned" || event.type === "companionRevived") {
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - 14 },
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      text: event.type === "companionDowned" ? "DOWN!" : "BACK UP",
      color: event.type === "companionDowned" ? "#d83a3a" : "#7ef0c8",
    });
  }
  // A companion earned a level from its own kills: float a "LVL n" tag
  // off its head (green, the party colour) and toast the name — its
  // signature power grows a rank at a time, so the level is worth
  // noticing.
  if (event.type === "companionLeveledUp") {
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - 16 },
      untilMs: state.stats.timeMs + 1200,
      durationMs: 1200,
      text: `LVL ${event.level}`,
      color: "#7ef0c8",
      rise: 22,
    });
    ctx.pushPickup(
      `${companionDef(event.defId).name} → LVL ${event.level}`,
      "#7ef0c8",
    );
  }
  // The bag is full and turned away a piece of loot: float a "BAG
  // FULL" thought over the hero's hair and light the inventory button's
  // pulse so the player knows to open it and make room.
  if (event.type === "pickupBlocked") {
    effects.push({
      kind: "text",
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius - 6 },
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      text: "BAG FULL",
      color: "#ffcf6b",
    });
    shared.bagFullHintUntilMs = state.stats.timeMs + BAG_FULL_HINT_MS;
  }
  // Bag gear (weapons + equipment) pops the framed pickup card, tinted
  // to its rarity and carrying its icon — the "new and shiny" highlight.
  // The DISPLAY → ITEM CARDS filter can raise the bar: a find below the
  // chosen rarity skips the card and drops to the quieter lower-corner feed
  // instead, so a loot flood doesn't bury the thumb zone. Loose pickups
  // (medkits, arrows, repair kits, powerups) always ride the feed; only
  // special tiers tint their name there.
  if (event.type === "itemCollected" && event.name) {
    const tier = event.tier ?? "regular";
    if (
      event.kind === "equipment" &&
      pickupCardVisible(tier, getSettings().pickupCardsTier)
    ) {
      ctx.showPickupCard({
        name: event.name,
        tier,
        quality: event.quality,
        defId: event.defId,
        itemId: event.itemId,
        equipped: event.equipped === true,
        upgrade: event.upgrade === true,
      });
    } else {
      ctx.pushPickup(
        event.name,
        tier !== "regular" ? TIER_COLORS[tier] : undefined,
      );
    }
  }
  // A golden XP arrow flows its award up off the hero's head as blue
  // "+N XP" combat text — the same popup a slain foe drips, but at
  // double size and with a crit-style jolt first: an arrow is a whole
  // slice of the level bar, basically a crit's worth of XP, so it
  // shakes in place before it floats. Honors the same `xpFloat` DISPLAY
  // preference that silences kill-XP popups.
  if (
    event.type === "itemCollected" &&
    event.kind === "xp" &&
    event.xp != null &&
    event.xp > 0 &&
    getSettings().xpFloat === "on"
  ) {
    effects.push({
      kind: "text",
      pos: {
        x: state.player.pos.x,
        y: state.player.pos.y - PLAYER.radius - 12,
      },
      untilMs: state.stats.timeMs + 1100,
      durationMs: 1100,
      text: `+${formatCompact(event.xp)} XP`,
      color: "#6cc4ff",
      rise: 30,
      scale: 2,
      shake: true,
    });
  }
  if (event.type === "storyItemCollected") {
    ctx.pushPickup(storyItemDef(event.defId).name, "#ffd75e");
  }
  // The merchant met: toast it — his greeting scene (if the level
  // has one) takes the stage through the ordinary dialogue overlay.
  // (The per-character "met him here" mark is banked in run-progress.ts.)
  if (event.type === "merchantDiscovered") {
    ctx.pushPickup("MERCHANT DISCOVERED", "#ffd75e");
  }
  // Paid the trader to mend the whole kit — toast the spend.
  if (event.type === "gearRepaired") {
    ctx.pushPickup(`REPAIRED - ${event.paid} COIN`, "#ffd75e");
  }
  // Spent a repair kit from the dock — the whole kit is mended.
  if (event.type === "repairKitUsed") {
    ctx.pushPickup("WEAPONS REPAIRED", "#d98c40");
  }
  // A placed pack wiped out: toast the patch of ground as cleared —
  // the movement reward. The ambush and clear chimes ride the sfx bus.
  if (event.type === "packCleared") {
    ctx.pushPickup("AREA CLEARED", "#7cff9b");
  }
}

/** Drop effects whose lifetime has lapsed (run at the end of each sim tick). */
export function expireEffects(shared: LoopShared, state: GameState): void {
  if (shared.effects.length > 0) {
    shared.effects = shared.effects.filter(
      (e) => e.untilMs > state.stats.timeMs,
    );
  }
}
