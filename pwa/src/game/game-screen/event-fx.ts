// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Engine events → on-screen feedback. Every visual/audio-adjacent reaction to
// a tick's events lives here: transient canvas effects (slashes, muzzle
// flashes, gore, corpses, damage numbers, combat text), the lower-corner
// pickup feed lines, the framed gear pickup card, and the XP-strip kill heat.
// Progress banking (characters, scores) is NOT here — see run-progress.ts; the
// AUTO PILOT's reactions live in autopilot-director.ts.

import { localHero } from "../local-seat.ts";
import {
  CACHE,
  companionDef,
  enemyDef,
  PLAYER,
  questDef,
  storyItemDef,
  XP_TUNING,
  type GameEvent,
  type GameState,
} from "@game/core";
import { distance } from "@game/lib/vec.ts";

import { clusterByTouch } from "@ui/lib/cluster.ts";
import { formatCompact } from "@ui/lib/format-number.ts";

import { type Sprites } from "../assets.ts";
import { levelUpIntensity } from "../levelup-intensity.ts";
import { powerupStyle } from "../powerup-fx.ts";
import { objectiveLine } from "../quest-text.ts";
import { spillBlood } from "../render/blood-ground.ts";
import { BLOOD_SPRAY_MS } from "../render/blood.ts";
import { groundColorAt } from "../render/caches.ts";
import { LANDING_DUST_MS, TAKEOFF_DUST_MS } from "../render/dust.ts";
import { GARAGE_DOOR_MS } from "../render/effects.ts";
import { FLAME_MS } from "../render/flame.ts";
import { LOOT_SHINE_MS } from "../render/loot-aura.ts";
import {
  clearCameraShake,
  effectsClockMs,
  kickCameraShake,
  heldTwoHanded as isTwoHandedDef,
  meleeSwingMs,
} from "../render.ts";
import { getSettings } from "../settings.ts";
import {
  pickupCardVisible,
  TIER_COLORS,
  TIER_RANK,
  TIER_RGB,
} from "../tiers.ts";
import { goreStyleFor, shotStyleFor } from "../weapon-fx.ts";
import { bloodBlow, bloodSpills } from "./blood-hit.ts";
import { bossRitePresentation } from "./boss-rite.ts";
import { pushDamage, pushFloat } from "./float-lane.ts";
import { collectGoldPickup } from "./gold-float.ts";
import { charredRemains, goreFamily } from "./gore.ts";
import { CLEAVE_MS, GORE_BURST_MS, landingSpots } from "./gore-burst.ts";
import { splashOnly } from "./gore-gate.ts";
import { soakHero } from "./hero-soak.ts";
import { killPresentation } from "./kill-presentation.ts";
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
/** How hard a landed GIB wets the floor under it, and how wide a patch — a
 * piece of a body is a good deal more than a droplet, so it soaks harder than a
 * spatter (0.13) and rather less than a whole death pool (0.32+). The first
 * piece of a burst counts double: it is the heaviest one thrown (the signature
 * ladder puts the biggest slab first), and something has to be the middle of the
 * mess. */
const GIB_SPILL_AMOUNT = 0.22;
const GIB_SPILL_RADIUS = 9;

/** How much wider a BOSS's wreckage wets the floor than an ordinary body's.
 * An ordinary kill scales its spill by the victim's own build (`blow.body`),
 * which a rite has no equivalent of — the rite's force is scripted, not
 * measured. This is the stand-in, and it is deliberately modest: the landmark
 * should read as the end of a big fight, not as a floor nobody can see. */
const BOSS_SPILL_SCALE = 1.6;

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
        pushFloat(shared.effects, state.stats.timeMs, {
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
    (e) => e.type === "swing" && isHeroAttack(e.pos, localHero(state).pos),
  )
    ? goreStyleFor(localHero(state).equipment.weapon.uniqueId)
    : null;
}

export type EventFxCtx = {
  state: GameState;
  shared: LoopShared;
  /** The atlas — an effect that has to know what the FLOOR looks like (the dust
   * a jump kicks up takes its colour from the ground the boot actually met)
   * resolves it here, once, at the moment it spawns. */
  sprites: Sprites;
  /** Kills whose XP drip was folded into a merged pack pop (mergePackKillXp). */
  mergedKills: Set<GameEvent>;
  /** The hero's signature gore this tick, if his weapon carries one. */
  heroGore: ReturnType<typeof goreStyleFor>;
  /** Append a lower-corner pickup feed line. The default lead-in is "PICKED
   * UP", so anything that is NOT a thing the hero scooped up passes `""`. */
  pushPickup: (text: string, color?: string, prefix?: string) => void;
  /** Flash a one-shot caption over the middle of the field (the same slot the
   * named-zone labels use — see AreaCaption.tsx). */
  showAreaCaption: (label: string, color?: string) => void;
  /** Flash one errand's tally over the middle of the field, under the area
   * caption's slot (QuestFlash.tsx) — the "3/10 SCRAP DRONES" beat. */
  showQuestFlash: (text: string, done: boolean) => void;
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
  // THE JUMP, at both ends. The shove-off and the touchdown each kick a puff of
  // the floor he was standing on — in that floor's own colour (sampled from the
  // baked ground layer, so a venue's dust is never authored anywhere), sized by
  // how hard he hit it and smeared along the way he was going. The same two
  // events pose the hero: he stretches off the ground and squashes into the
  // landing (render/player.ts reads `shared.heroImpact`).
  if (event.type === "jump" || event.type === "land") {
    const landing = event.type === "land";
    const impact = landing ? event.impact : 1;
    effects.push({
      kind: landing ? "dustLand" : "dustTakeoff",
      pos: { ...event.pos },
      untilMs:
        state.stats.timeMs + (landing ? LANDING_DUST_MS : TAKEOFF_DUST_MS),
      durationMs: landing ? LANDING_DUST_MS : TAKEOFF_DUST_MS,
      color: groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y),
      intensity: impact,
      speed: event.speed,
      // He faces where he MOVES, so his own facing is the heading the cloud
      // smears along — the direction he actually carried into the jump.
      angle: Math.atan2(localHero(state).facing.y, localHero(state).facing.x),
      seed: state.stats.timeMs,
    });
    shared.heroImpact = {
      kind: landing ? "landing" : "takeoff",
      startMs: state.stats.timeMs,
      power: impact,
    };
  }
  // THE FALL: the hero dropped and the death scene opens. The camera goes DEAD
  // STILL — no jolt of its own, and any jolt still ringing from the fight (the
  // nuke or bolt that may well have killed him) is killed outright. The sim
  // clock freezes the instant the run leaves `playing`, so a live shake would
  // park at a fixed amplitude and rattle the whole eight-second tableau; and
  // even a clean one-shot kick shakes the frame over exactly the moment that
  // should read — the hero going down. The scene's drama is carried by the slow
  // push-in onto the body instead (render/death.ts `deathZoom`). The gout of
  // blood is drawn by the death pose (render/player.ts `drawDeathBlood`), timed
  // off the scene clock — the sim clock (which these `burst` effects run on) is
  // frozen while `dying`, so the spray must ride `deathScene.ms` to actually flow.
  if (event.type === "playerDeath") {
    clearCameraShake(shared.cameraShake);
  }
  // A HELLGATE TEARS OPEN (config HELLGATES): the hero's rampage grew ugly
  // enough that one of the map's rampage-only spawn points ripped, and the
  // historic horrors on the other side start coming through. The tear plays at
  // the gate's anchor — bigger and longer the deeper the rampage that opened it
  // — and the ground SHAKES, because reality just gave way.
  if (event.type === "hellgateOpened") {
    const durationMs = 1100 + Math.min(12, event.stage) * 40;
    effects.push({
      kind: "hellgate",
      pos: event.pos,
      untilMs: state.stats.timeMs + durationMs,
      durationMs,
      stage: event.stage,
      seed: Math.floor(Math.random() * 997),
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 3.2, 520);
  }
  if (event.type === "lightning") {
    // The bolt flickers fast, but its ground flash + fire sparks play out over
    // a longer tail (see the "lightning" draw), so the effect lives past the
    // strobe.
    effects.push({
      kind: "lightning",
      pos: event.pos,
      untilMs: state.stats.timeMs + 340,
      durationMs: 340,
      seed: Math.floor(Math.random() * 997),
    });
    // A quick, sharp jolt where the bolt earths itself — the strike is FELT.
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 2.2, 200);
  }
  // A melee swing sweeps a slash toward the target, sized to the
  // weapon's (STRENGTH-widened) reach and its cone: a wide arc for a
  // blade, a narrow thrust for a spear.
  if (event.type === "swing") {
    // Whether the blow came off a TWO-HANDER — it is swung around the body off a
    // two-handed grip rather than off one shoulder, and the drawn motion runs
    // longer than a one-hander's (`meleeSwingMs`). The cone the engine hit with
    // is unchanged: this is entirely how it LOOKS.
    const heavy = isTwoHandedDef(localHero(state).equipment.weapon.defId);
    const swingMs = meleeSwingMs(heavy, event.motion);
    // A SHAKEN weapon (`WeaponMotion`) covers no ground on its way anywhere: it
    // is held against a body and juddering. The wedge is the picture of a blade
    // travelling through a sector, so drawing one for a tool that never
    // travelled would be inventing a swing the weapon does not have — the whole
    // read is meant to be the shiver and what comes off the body. Skipped here
    // rather than dimmed at the draw, so nothing is queued at all.
    // A PUNCH gets a mark at the end of the reach instead of a wedge across it,
    // for the same reason the shaken tool gets none: the wedge is the picture of
    // a blade travelling through a sector, and a fist travels along one line to
    // one place. Its own effect draws that (`punch` in render/effects.ts), on
    // the same clock the body's drive runs on.
    if (event.motion === "punch") {
      effects.push({
        kind: "punch",
        pos: { x: event.pos.x, y: event.pos.y - localHero(state).z },
        angle: Math.atan2(event.dir.y, event.dir.x),
        radius: event.range,
        untilMs: state.stats.timeMs + swingMs,
        durationMs: swingMs,
      });
    } else if (event.motion !== "shake") {
      effects.push({
        kind: "swing",
        // These blows leave the hero's hands, so lift the arc by his
        // current jump height (player.z) — otherwise a swing thrown
        // mid-air draws down at his grounded feet, not up where he is.
        pos: { x: event.pos.x, y: event.pos.y - localHero(state).z },
        angle: Math.atan2(event.dir.y, event.dir.x),
        radius: event.range,
        arc: event.arc,
        // The cone runs on the SAME clock as the held-weapon swing
        // (`meleeSwingMs`), so the slash tracks the blade frame for frame — and
        // stretches with it when the weapon takes both hands.
        untilMs: state.stats.timeMs + swingMs,
        durationMs: swingMs,
      });
    }
    // A weapon that is FIRE (`WeaponDef.burn`) pours a GOUT down the exact cone
    // the blow struck (render/flame.ts). It is the shaken weapon's replacement
    // for the wedge skipped above, not an addition to it: `shake` says there is
    // no swing to draw, and a flamethrower that drew nothing at all was a weapon
    // whose whole identity is what comes out of the front of it firing in
    // silence. The gout runs on its OWN short clock rather than the swing's, so
    // a fast trigger overlaps its own stream into one continuous jet instead of
    // stuttering between pulls.
    if (event.burn) {
      effects.push({
        kind: "flame",
        pos: { x: event.pos.x, y: event.pos.y - localHero(state).z },
        angle: Math.atan2(event.dir.y, event.dir.x),
        radius: event.range,
        arc: event.arc,
        untilMs: state.stats.timeMs + FLAME_MS,
        durationMs: FLAME_MS,
        seed: Math.floor(Math.random() * 997),
      });
    }
    // Work the hero's own weapon to match — companions swing from
    // their own spots, so only a blow thrown from the hero's position
    // arms the animation. Hand the weapon's cone (`event.arc`) to the
    // pose so the blade's sweep matches this weapon's reach and arc, and its
    // MOTION so a tool that is not swung judders instead.
    if (isHeroAttack(event.pos, localHero(state).pos)) {
      shared.heroAction = {
        kind: "swing",
        weaponClass: "melee",
        startMs: state.stats.timeMs,
        durationMs: swingMs,
        arc: event.arc,
        twoHanded: heavy,
        motion: event.motion,
      };
    }
  }
  // A shot flashes at the muzzle — a hot burst for guns, a cool cast
  // bloom for wands — oriented along the aim.
  if (event.type === "shot") {
    const heroShot = isHeroAttack(event.pos, localHero(state).pos);
    effects.push({
      kind: "muzzle",
      // Lift to the hero's airborne height so the muzzle flash fires
      // from the weapon in his hands, not from the ground below him.
      pos: { x: event.pos.x, y: event.pos.y - localHero(state).z },
      angle: Math.atan2(event.dir.y, event.dir.x),
      weaponClass: event.weaponClass,
      untilMs: state.stats.timeMs + 110,
      durationMs: 110,
      // The hero's own shot flashes his weapon's signature; companion/
      // enemy shots keep the plain class look.
      fx:
        heroShot && event.weaponClass !== "melee"
          ? shotStyleFor(
              localHero(state).equipment.weapon.uniqueId,
              event.weaponClass,
            )
          : undefined,
      // Pin the hero's flash to the barrel's side (his facing) so a shot
      // at a foe BEHIND him still flashes at the weapon, not off his back.
      faceLeft: heroShot ? localHero(state).faceLeft : undefined,
    });
    // Kick/cast the hero's own weapon to match the muzzle flash — a gun
    // recoils, a wand thrusts — but not a companion's shot.
    if (heroShot) {
      shared.heroAction = {
        kind: "shot",
        weaponClass: event.weaponClass,
        startMs: state.stats.timeMs,
        durationMs: event.weaponClass === "magic" ? 220 : 150,
        // A braced long gun and a two-handed staff answer differently to the
        // same impulse (see `weaponPose`).
        twoHanded: isTwoHandedDef(localHero(state).equipment.weapon.defId),
      };
    }
  }
  // Every landed hit sprays the victim's gore — blood for the warm-blooded,
  // ectoplasm for ghosts, sparks for machines — and pops a static damage number
  // on the head; crits are bigger, gold, and shake in place. Only XP floats up.
  if (event.type === "enemyHit" || event.type === "enemyKilled") {
    const def = enemyDef(event.defId);
    const kill = event.type === "enemyKilled";
    // WARM-BLOODED things BLEED, and the blood is priced on the blow (see
    // blood-hit.ts): a nick freckles the floor, a blow that opens the mob up
    // throws a proper spray. Ghosts and machines keep the plain two-frame
    // ecto/sparks splash and never bleed at all.
    //
    // Priced FIRST, before the death is presented, because the presentation is
    // priced on it: how far a burst body's pieces carry and how many of them
    // there are is the very same `force` the spray, the pool and the corpse
    // launch all read, so the gore can never disagree with the blood about how
    // bad the hit was.
    // EVERY KIND OF BODY SPILLS SOMETHING, and it is the same arithmetic for all
    // four — a ghost's goo and a machine's oil are priced on the blow exactly as
    // blood is. What differs is the COLOUR it comes out in, what hangs in the air
    // after, and whether the floor keeps it: all three off the family catalog
    // (game-screen/gore.ts), none of them a fork here.
    const family = goreFamily(def.gore);
    const blow = bloodBlow(
      event.damage,
      event.maxHp,
      def.role,
      kill,
      family.id,
    );
    // One seed for the whole kill: the spray, the stains and the pieces are all
    // scattered off it, which is what puts a gib on its own spatter.
    const seed = Math.floor(Math.random() * 997);
    // Blood comes off the side the blow landed on — away from the hero — and so
    // does everything the body comes apart into.
    const heading = Math.atan2(
      event.pos.y - localHero(state).pos.y,
      event.pos.x - localHero(state).pos.x,
    );
    // How this death presents — burned up, cut in two, burst into pieces, or
    // thrown and toppled (see kill-presentation.ts, which owns the rule and the
    // MATURE CONTENT gate on it). A screen-nuke kill burns the body up instead
    // of splattering it: the fire replaces the gore splash and the plain corpse
    // with a smoking charred skeleton (the `incinerate` effect below). The
    // damage number + XP float still play, so the blast reads as the kills it is.
    //
    // Resolved HERE rather than down in the corpse branch because the blood has
    // to know about the throw too: a pool left at the spot a punted corpse took
    // off from reads as the body having been deleted rather than thrown.
    const death =
      kill && event.type === "enemyKilled"
        ? killPresentation({
            incinerated: event.incinerated,
            edged: event.edged,
            damage: event.damage,
            maxHp: event.maxHp,
            hpBefore: event.hpBefore,
            heroPos: localHero(state).pos,
            pos: event.pos,
            role: def.role,
            family: family.id,
            anatomy: def.anatomy ?? "humanoid",
            force: blow?.force,
            body: blow?.body,
            seed,
          })
        : null;
    const incinerated = death?.incinerate ?? false;
    const burst = death?.gore ?? null;
    const launch = death?.launch ?? undefined;
    if (!incinerated) {
      // What the spray lands on STAYS — soaked into the floor's own saturation
      // grid here (`spillBlood`), one byte per tile, never kept as an object and
      // never forgotten.
      if (blow) {
        effects.push({
          kind: "blood",
          pos: { ...event.pos },
          untilMs: state.stats.timeMs + BLOOD_SPRAY_MS,
          durationMs: BLOOD_SPRAY_MS,
          blood: blow,
          family: family.id,
          angle: heading,
          seed,
        });
        // A body that came apart leaves no pool where it stood and takes no
        // punt with it — every piece of it is somewhere else, so the pool is
        // dropped and the floor is wetted under each landing spot instead
        // (below). A CLEAVE keeps the pool: its two halves ride the punt
        // together and end up in one place.
        // …and STAYS, but only if this family's mess is the kind that stays.
        // Blood, oil and a ghost's goo are matter and they lie there; a
        // rift-thing is light and goes out, so it marks nothing — checked HERE,
        // where the mark is decided, rather than at the draw, exactly as the
        // gore gate itself is.
        if (family.stains) {
          spillBlood(
            state,
            bloodSpills(
              burst?.kind === "gib" ? { ...blow, pool: null } : blow,
              event.pos,
              seed,
              heading,
              launch,
            ),
            family.id,
          );
        }
        // WHERE THE PIECES CAME DOWN. Read off the very same burst the renderer
        // flies them along (`landingSpots`), so a head always lands ON its own
        // puddle rather than beside it — the same agreement the spray's drops
        // and their stains already have.
        if (burst && family.stains) {
          spillBlood(
            state,
            landingSpots(burst).map((spot, i) => ({
              x: event.pos.x + spot.x,
              y: event.pos.y + spot.y,
              radius: GIB_SPILL_RADIUS * blow.body,
              amount: GIB_SPILL_AMOUNT * (i === 0 ? 2 : 1),
            })),
            family.id,
          );
        }
        // …and what missed the floor lands on the MAN. Priced off the very same
        // blow, so the hero, the spray and the ground can never disagree about
        // how bad the hit was (game-screen/hero-soak.ts). BLOOD alone: the coat
        // is blood art in blood's colours, and a hero streaked in four different
        // hues reads as a man who fell in some paint.
        if (family.id === "blood") soakHero(state, blow, event.pos);
      } else if (splashOnly(family.id)) {
        // The plain two-frame splash, for the two cases that are NOT the gore
        // system: a player who turned this KIND OF BODY off on the GORE page,
        // and a device whose MATURE CONTENT switch is off — both of whom still
        // need a landed blow to register as one. A blow that fell through
        // because the DEVELOPER amount is at zero lands dry on purpose: that
        // switch exists to get a clean field for a screenshot.
        effects.push({
          kind: "splash",
          pos: {
            x: event.pos.x + Math.round((Math.random() - 0.5) * 6),
            y: event.pos.y + Math.round((Math.random() - 0.5) * 6),
          },
          untilMs: state.stats.timeMs + 240,
          durationMs: 240,
          sprite: family.splash,
        });
      }
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
      // Burned up by the bomb: flames engulf the body and what is left of it
      // smoulders a beat before it fades. WHAT is left is this kind of body's
      // own — scorched bone, a slagged chassis, a guttering veil, a cold husk —
      // resolved HERE, where the victim's def is still to hand, because by the
      // time the bones show the mob is gone (game-screen/charred-remains.ts).
      // On the KILL'S OWN SEED like everything else it left behind, so a nuked
      // screenful burns down to a field of different marks rather than to one
      // decal stamped forty times.
      effects.push({
        kind: "incinerate",
        pos: { x: event.pos.x, y: event.pos.y },
        untilMs: state.stats.timeMs + 1600,
        durationMs: 1600,
        sprite: def.sprite,
        remains: charredRemains(family.id, def.anatomy ?? "humanoid", seed),
        seed,
      });
    } else if (event.type === "enemyKilled" && burst) {
      // THE BODY CAME APART — cut in two by an edge, or burst by a blunt blow.
      // There is no corpse effect at all: this one draws whatever is left of it
      // (render/gibs.ts). An epic's remains stay on the field for the level
      // exactly as an epic corpse does.
      const epic = def.role !== "minion";
      // How long the mess stays is the player's own DEVELOPER → VISUALS knob
      // (GORE LINGER, ten seconds shipped) on top of the flight itself — a
      // cleared room should still be a cleared room when he walks back through
      // it. An epic's remains stay for the level, exactly as an epic corpse
      // does.
      const lifeMs = epic
        ? 86_400_000
        : (burst.kind === "cleave" ? CLEAVE_MS : GORE_BURST_MS) +
          getSettings().goreLinger * 1000;
      effects.push({
        kind: burst.kind,
        pos: { x: event.pos.x, y: event.pos.y },
        untilMs: state.stats.timeMs + lifeMs,
        durationMs: lifeMs,
        sprite: def.sprite,
        gib: burst,
        persist: epic || undefined,
        launch,
      });
    } else if (event.type === "enemyKilled") {
      const epic = def.role !== "minion";
      // The throw itself was sized above (the blood needed it); render.ts
      // animates the arc + tumble from here.
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
    // Scattered a little along the body so a burst of hits on one mob does not
    // draw one column of numbers; the LANE (float-lane.ts) then lifts whatever
    // still lands on a live number, so the ladder climbs instead of overprinting.
    pushDamage(effects, state.stats.timeMs, {
      pos: {
        x: event.pos.x + Math.round((Math.random() - 0.5) * 12),
        y: event.pos.y - def.radius - 2,
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
      pushFloat(effects, state.stats.timeMs, {
        pos: { x: event.pos.x, y: event.pos.y - def.radius - 12 },
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
    // The screen-clearer rocks the view — still a tier above the bolt's flick,
    // so wiping the field lands like a bomb going off, but a THUMP rather than
    // the old 8px/550ms hammering. At the phone's 2× view scale that threw the
    // whole frame ±16 CSS px for over half a second, which on a handset reads
    // as the device dropping frames rather than as an explosion: the field
    // becomes unreadable and the hero un-steerable right when the nuke's own
    // full-screen DOM flash (createNukeFx) is already carrying the spectacle.
    // Under half the throw, and short enough to be over before the fireball is.
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 3.5, 380);
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
  // THE GARAGE DOOR rolling up: the engine dropped its obstacle chain the
  // tick it opened, so the app redraws the slat chain sliding up out of the
  // doorway, one block at a time from the bottom (the `garageDoor` effect).
  // The door's own segment travels on `state.doors` — matched by center, since
  // the event only carries a pos — and its chain's length IS the slat count,
  // so the animation redraws exactly the blocks that stood there.
  if (event.type === "garageDoorOpened") {
    const door = state.doors.find(
      (d) =>
        d.approach &&
        Math.hypot(d.center.x - event.pos.x, d.center.y - event.pos.y) < 8,
    );
    if (door?.from && door.to) {
      effects.push({
        kind: "garageDoor",
        pos: { x: door.from.x, y: door.from.y },
        to: { x: door.to.x, y: door.to.y },
        radius: Math.hypot(door.to.x - door.from.x, door.to.y - door.from.y),
        slats: door.obstacleIds.length,
        sprite: door.sprite ?? "garage_door",
        untilMs: state.stats.timeMs + GARAGE_DOOR_MS,
        durationMs: GARAGE_DOOR_MS,
      });
    }
  }
  // A bare axle grinding the road (a wheel torn off the car): a shower of
  // hot metal sparks off the dragging corner — the car's last stand. The
  // throw trails the travel, so the sparks fly out BEHIND the wreck.
  if (event.type === "carGrind") {
    const car = state.vehicles.find((v) => v.kind === "car");
    effects.push({
      kind: "sparks",
      pos: { x: event.pos.x, y: event.pos.y },
      untilMs: state.stats.timeMs + 340,
      durationMs: 340,
      intensity: event.intensity,
      angle: car?.faceLeft ? 0 : Math.PI,
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
  // An ARCANE SINGULARITY collapse: rings rush INWARD to a dark core, sized to
  // the vortex's reach — the visual counterpart of a nova (which bursts out).
  if (event.type === "singularity") {
    effects.push({
      kind: "singularity",
      pos: event.pos,
      untilMs: state.stats.timeMs + 420,
      durationMs: 420,
      radius: event.radius,
    });
  }
  // A sidestep: float a "DODGE" tag off the hero so the whiff reads.
  // ── THE POWERUPS' one-shot bursts (render/powerup-bursts.ts). Each is the
  // WORLD-anchored half of the moment; the screen-space wash that rides on top
  // is fired from GameScreen's event pass (game-screen/powerup-aura.ts), the
  // same split the nuke uses.
  if (event.type === "meteorFall") {
    effects.push({
      kind: "meteorFall",
      pos: { ...event.pos },
      style: powerupStyle(event.defId),
      untilMs: state.stats.timeMs + 780,
      durationMs: 780,
      radius: event.radius,
      // Scatters the splinters — a barrage never throws the same debris twice.
      seed: Math.floor(Math.random() * 997),
    });
    // Rock landing weight, well under the nuke's thump: a MOONFALL drops these
    // every half second, so the jolt has to be felt without shaking the fight
    // into an unreadable smear.
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.6, 160);
  }
  if (event.type === "voidWave") {
    effects.push({
      kind: "voidWave",
      pos: { ...event.pos },
      style: powerupStyle(event.defId),
      untilMs: state.stats.timeMs + 620,
      durationMs: 620,
      radius: event.radius,
      seed: Math.floor(Math.random() * 997),
    });
  }
  if (event.type === "barrierBroke") {
    effects.push({
      kind: "barrierBreak",
      pos: { ...event.pos },
      style: powerupStyle(event.defId),
      untilMs: state.stats.timeMs + 620,
      durationMs: 620,
      seed: Math.floor(Math.random() * 997),
    });
  }
  if (event.type === "wardHeld") {
    effects.push({
      kind: "wardHold",
      pos: { ...event.pos },
      style: powerupStyle(event.defId),
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
    });
    // The blow that should have ended the run: it lands like one.
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 3, 300);
  }
  // A blow passing clean THROUGH the spectral hero — the shroud's own "DODGE".
  if (event.type === "playerPhased") {
    pushFloat(effects, state.stats.timeMs, {
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: "PHASED",
      color: "#cef2fa",
    });
  }
  if (event.type === "playerDodge") {
    pushFloat(effects, state.stats.timeMs, {
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: "DODGE",
      color: "#7ecbff",
    });
  }
  // A PARRY (melee talent): a tight steel-blue ring flashes at the hero and a
  // "PARRY" tag floats up — the blow turned fully aside.
  if (event.type === "parry") {
    effects.push({
      kind: "nova",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + 240,
      durationMs: 240,
      radius: PLAYER.radius * 1.6,
    });
    pushFloat(effects, state.stats.timeMs, {
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
      untilMs: state.stats.timeMs + 650,
      durationMs: 650,
      text: "PARRY",
      color: "#cfe0f2",
    });
  }
  // A SEISMIC LANDING (melee talent): a ground shockwave rings out from the
  // touchdown, sized to the slam's reach (reuses the expanding nova ring).
  if (event.type === "seismicLanding") {
    effects.push({
      kind: "nova",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + 360,
      durationMs: 360,
      radius: event.radius,
    });
  }
  // A blow that never landed: the foe sidestepped it ("DODGE") or the
  // hero's own aim whiffed ("MISS"). Float the tag off the target.
  if (event.type === "enemyDodge" || event.type === "enemyMiss") {
    const def = enemyDef(event.defId);
    pushFloat(effects, state.stats.timeMs, {
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
    pushFloat(effects, state.stats.timeMs, {
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
    pushFloat(effects, state.stats.timeMs, {
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
    // The blinding LIGHT EXPLOSION, world-anchored: a flash core, radiant
    // starburst spokes, shockwave rings (the same wave that HURLS the horde
    // back, engine side), and a spray of golden sparkle-stars. The full-screen
    // flash/bloom/god-rays ride the CSS overlay on top (createLevelUpFx), fired
    // from GameScreen's event pass; the sustained golden pillar is the hero
    // burn (render/player.ts). Seeded so the sparkle scatter is deterministic.
    // The whole show is sized to the level reached (levelup-intensity.ts): the
    // first dings play a modest glow, the last one before the cap detonates at
    // full strength. The camera is left ALONE — the light carries the ding on
    // its own, and a jolt on every level-up only rattles the frame you want to
    // watch.
    effects.push({
      kind: "levelup",
      pos: {
        x: localHero(state).pos.x,
        y: localHero(state).pos.y - localHero(state).z,
      },
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      seed: Math.floor(Math.random() * 997),
      intensity: levelUpIntensity(event.level),
    });
    pushFloat(effects, state.stats.timeMs, {
      pos: {
        x: localHero(state).pos.x,
        y: localHero(state).pos.y - PLAYER.radius - 8,
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
    ctx.pushPickup(`${companionDef(event.defId).name} JOINED`, "#7ef0c8", "");
  }
  // A companion beaten down / back on its feet: float the state
  // change off its head so the party's ebb reads at a glance.
  if (event.type === "companionDowned" || event.type === "companionRevived") {
    pushFloat(effects, state.stats.timeMs, {
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
    pushFloat(effects, state.stats.timeMs, {
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
      "",
    );
  }
  // The bag is full and turned away a piece of loot: float a "BAG
  // FULL" thought over the hero's hair and light the inventory button's
  // pulse so the player knows to open it and make room.
  if (event.type === "pickupBlocked") {
    pushFloat(effects, state.stats.timeMs, {
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius - 6 },
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      text: "BAG FULL",
      color: "#ffcf6b",
    });
    shared.bagFullHintUntilMs = state.stats.timeMs + BAG_FULL_HINT_MS;
  }
  // A TOSSED DROP TOUCHES DOWN. The floor answers exactly as it does when the
  // hero's own boots hit it: a small puff of the ground's OWN colour, sampled
  // from the baked layer, so loot raises regolith on the moon and rust on Mars
  // with nothing authored per venue. A fraction of a jump's cloud — a ring
  // hitting the dirt is not a man landing on it — and no smear, because a drop
  // arrives from straight above rather than at a run.
  if (event.type === "itemLanded") {
    effects.push({
      kind: "dustLand",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LANDING_DUST_MS,
      durationMs: LANDING_DUST_MS,
      color: groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y),
      intensity: 0.28,
      speed: 0,
      angle: 0,
      seed: state.stats.timeMs,
    });
    // …and a purse coming apart on the floor throws its own small warm flash
    // on top of the dust. Gold has no rarity to bloom (`lootShine` is the
    // equipment ladder's), but it is the one drop the player is always glad to
    // see, and the flash is what makes a pile ANNOUNCE itself in a fight
    // instead of quietly appearing among the bodies.
    if (event.kind === "coin") {
      effects.push({
        kind: "lootShine",
        pos: { ...event.pos },
        untilMs: state.stats.timeMs + LOOT_SHINE_MS,
        durationMs: LOOT_SHINE_MS,
        color: "255, 215, 94",
        intensity: 1,
        seed: state.stats.timeMs,
      });
    }
  }
  // A MAGIC-OR-BETTER FIND SETTLES. The rarity's own colour blooms out of it
  // once — the "look over here" that the standing aura then keeps alive. It is
  // a `splash`, the same one-shot bloom a spell lands on, tinted to the tier:
  // the moment is the CHIME's twin, and both exist because a good drop in a
  // ten-item spill has to be findable without reading ten item names.
  // THE CACHE IS GIVEN — Ruth's chest comes into being against the garage's
  // north wall. The LIGHT is here — the pool on the floor, the motes rushing
  // in, the snap when it turns real; the chest's own body knitting itself out
  // of that light is drawn from the run's `cacheArriveMs` (render/cache.ts),
  // because it belongs to the fixture and has to keep playing if the effect
  // list is culled.
  //
  // It arrives in the UNIQUE gold the loot ladder already uses for a named
  // relic — the chest is the rarest thing the game ever hands over, and saying
  // so in the vocabulary the player has spent the whole campaign learning
  // beats inventing a second one for a single moment.
  if (event.type === "cacheGiven") {
    effects.push({
      kind: "conjure",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + CACHE.arriveMs,
      durationMs: CACHE.arriveMs,
      color: TIER_RGB.unique,
      seed: state.stats.timeMs,
    });
  }
  if (event.type === "lootShine") {
    effects.push({
      kind: "lootShine",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LOOT_SHINE_MS,
      durationMs: LOOT_SHINE_MS,
      color: TIER_RGB[event.tier],
      // The RANK drives every part of the bloom — its reach, its ring, and
      // whether it throws sparks at all — so an artifact's arrival is visibly
      // bigger than a magic's rather than merely a different colour.
      intensity: TIER_RANK[event.tier],
      seed: state.stats.timeMs,
    });
  }
  // Bag gear (weapons + equipment) pops the framed pickup card, tinted
  // to its rarity and carrying its icon — the "new and shiny" highlight.
  // The DISPLAY → ITEM CARDS filter can raise the bar: a find below the
  // chosen rarity skips the card and drops to the quieter lower-corner feed
  // instead, so a loot flood doesn't bury the thumb zone. Loose pickups
  // (medkits, arrows, repair kits, powerups) always ride the feed; only
  // special tiers tint their name there.
  // GOLD is excluded here: its line is written by the GROUPED flush below,
  // because a boss's six piles are one handful of money and deserve one line.
  if (event.type === "itemCollected" && event.name && event.kind !== "gold") {
    const tier = event.tier ?? "regular";
    // An UNIDENTIFIED find never pops the card, whatever the rarity filter
    // says: the reveal spectacle is saved for the identify (IdentifyReveal),
    // so the pickup itself is just a quiet tier-tinted feed line.
    if (
      event.kind === "equipment" &&
      event.unidentified !== true &&
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
  // AN XP SCROLL announces what it LIT rather than what it paid — it pays
  // nothing. The multiplier flows up off the hero's head as blue combat text,
  // the same popup a slain foe drips but at double size and with a crit-style
  // jolt first, and then the VEIL takes over as the standing reminder that the
  // window is burning (render/xp-veil.ts). Honors the same `xpFloat` DISPLAY
  // preference that silences kill-XP popups: a player who turned the XP numbers
  // off has said he doesn't want them, and this is one of them.
  if (
    event.type === "itemCollected" &&
    event.kind === "xp" &&
    XP_TUNING.scrollXpMult > 1 &&
    getSettings().xpFloat === "on"
  ) {
    pushFloat(effects, state.stats.timeMs, {
      pos: {
        x: localHero(state).pos.x,
        y: localHero(state).pos.y - PLAYER.radius - 12,
      },
      untilMs: state.stats.timeMs + 1100,
      durationMs: 1100,
      text: `${XP_TUNING.scrollXpMult}\u00d7 XP`,
      color: "#6cc4ff",
      rise: 30,
      scale: 2,
      shake: true,
    });
  }
  // GOLD BANKED: the pile joins the open GROUP rather than floating on its own,
  // so piles taken within a breath of each other — a boss sheds six at once —
  // add up into one number instead of stacking six identical ones on the same
  // spot. The group floats its total (and writes its one feed line) from
  // `flushGoldPickups`, the moment the money stops arriving.
  if (
    event.type === "itemCollected" &&
    event.kind === "gold" &&
    event.coins != null
  ) {
    collectGoldPickup(ctx.shared, state, event.coins, ctx.pushPickup);
  }
  if (event.type === "storyItemCollected") {
    ctx.pushPickup(storyItemDef(event.defId).name, "#ffd75e");
  }
  // The merchant met: toast it — his greeting scene (if the level
  // has one) takes the stage through the ordinary dialogue overlay.
  // (The per-character "met him here" mark is banked in run-progress.ts.)
  if (event.type === "merchantDiscovered") {
    ctx.pushPickup("MERCHANT DISCOVERED", "#ffd75e", "");
  }
  // …AND THE TRADER WENT UNDER THE CAR. The hub's dealer works the road the
  // drive-out runs down, so the departing car can catch him — and a man hit at
  // speed owes the same spray and the same soaked tarmac a mob does, priced
  // through the SAME blood arithmetic (a full bar in one blow, which is what
  // being run over is) so the gore page's amount and the MATURE CONTENT gate
  // govern it exactly as they govern every other death in the game.
  //
  // No toast, no line, no corpse: the picture on the road is the whole
  // statement, and the next visit quietly mints somebody else.
  if (event.type === "merchantKilled") {
    const family = goreFamily("blood");
    const blow = bloodBlow(1, 1, "minion", true, family.id);
    const seed = Math.floor(Math.random() * 997);
    // Thrown AWAY from the hero, who is the man behind the wheel.
    const heading = Math.atan2(
      event.pos.y - localHero(state).pos.y,
      event.pos.x - localHero(state).pos.x,
    );
    if (blow) {
      effects.push({
        kind: "blood",
        pos: { ...event.pos },
        untilMs: state.stats.timeMs + BLOOD_SPRAY_MS,
        durationMs: BLOOD_SPRAY_MS,
        blood: blow,
        family: family.id,
        angle: heading,
        seed,
      });
      if (family.stains) {
        spillBlood(
          state,
          bloodSpills(blow, event.pos, seed, heading),
          family.id,
        );
      }
    } else if (splashOnly(family.id)) {
      effects.push({
        kind: "splash",
        pos: { ...event.pos },
        untilMs: state.stats.timeMs + 240,
        durationMs: 240,
        sprite: family.splash,
      });
    }
  }
  // Paid the trader to mend the whole kit — toast the spend.
  if (event.type === "gearRepaired") {
    ctx.pushPickup(`REPAIRED - ${event.paid} COIN`, "#ffd75e", "");
  }
  // Spent a repair kit from the dock — the whole kit is mended.
  if (event.type === "repairKitUsed") {
    ctx.pushPickup("WEAPONS REPAIRED", "#d98c40", "");
  }
  // A placed pack wiped out: call the patch of ground clear — the movement
  // reward. It is a statement about the FIELD, not a line of loot, so it takes
  // the field's own caption slot over the middle of the screen (where the room
  // labels flash) rather than the lower-corner pickup feed, which would have
  // read it out as "PICKED UP AREA CLEARED". The ambush and clear chimes ride
  // the sfx bus.
  if (event.type === "packCleared") {
    ctx.showAreaCaption("AREA CLEARED", "#7cff9b");
  }

  // AN ERRAND MOVED. The tracker in the corner already carries the new tally,
  // but the corner is not where the player is looking — they are looking at the
  // thing they just killed — so the count is also flashed over the middle of
  // the field. It rides `questProgress`, which the ENGINE emits from its one
  // `bump`, so every kind of progress is covered by construction: a kill off a
  // list, a named elite going down, a fetch piece walked over, an escort
  // delivered. The wording is `objectiveLine` — the same function the tracker,
  // the log and the offer box print — so the flash can never disagree with the
  // strip it is announcing.
  if (event.type === "questProgress") {
    const objective = questDef(event.questId).objectives[event.index];
    if (objective) {
      ctx.showQuestFlash(
        objectiveLine(event.questId, objective, event.count),
        event.count >= event.need,
      );
    }
  }

  // ─── SET PIECES: the moves that make a named fight a fight ────────────────
  // The first three of these were emitted by the engine and consumed by NOBODY
  // — a boss's slam landed for well over its contact damage with no visual at
  // all beyond the generic hurt flash, and the enrage turn and the summon were
  // just as silent. They are answered here.

  // THE SLAM LANDS. The ground is the victim, so the ground is what reacts: a
  // shockwave ring at the radius the blow actually covered, dust thrown off the
  // whole footprint, and a jolt sized to it — a big slam should be FELT before
  // the health bar is read.
  if (event.type === "enemySlam") {
    // The shockwave is DUST, thrown as a ring of the same authored puffs a
    // landing kicks up — one at ground zero and eight around the rim, each
    // smeared outward along its own bearing, so the wave visibly travels out to
    // the radius the blow actually covered. Emphatically NOT an expanding
    // stroked ring: that is the debug-overlay look this whole pass exists to
    // get rid of, and a boss's two-handed smash deserves the floor coming up.
    const ground = groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y);
    effects.push({
      kind: "dustLand",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LANDING_DUST_MS,
      durationMs: LANDING_DUST_MS,
      color: ground,
      intensity: 2.4,
      speed: 0,
      angle: 0,
      seed: state.stats.timeMs,
    });
    const RIM = 8;
    for (let i = 0; i < RIM; i++) {
      const angle = (i / RIM) * Math.PI * 2;
      effects.push({
        kind: "dustLand",
        pos: {
          x: event.pos.x + Math.cos(angle) * event.radius * 0.72,
          y: event.pos.y + Math.sin(angle) * event.radius * 0.72,
        },
        untilMs: state.stats.timeMs + LANDING_DUST_MS,
        durationMs: LANDING_DUST_MS,
        color: ground,
        intensity: 1.5,
        // Each rim puff is smeared OUTWARD, which is what turns nine separate
        // clouds into one wave leaving the middle.
        speed: 120,
        angle,
        seed: state.stats.timeMs + i * 97,
      });
    }
    kickCameraShake(
      shared.cameraShake,
      state.stats.timeMs,
      Math.min(4.5, 1.6 + event.radius / 28),
      340,
    );
  }

  // THE ELITE TIER (src/game/defs/enemies/abilities.ts). ONE handler for all
  // ten primitives, because they arrive as ONE event discriminated by `kind` —
  // the world-anchored picture is `render/elite-fx.ts`'s, and this only decides
  // how long each burst lives and which of them is worth a shake or a word.
  //
  // The long-lived halves are deliberately NOT pushed as effects: the ring, the
  // shell and the tether are drawn from the caster's own live state, because an
  // effect holds a POSITION and all three are attached to a body that moves.
  if (event.type === "eliteCast") {
    // A `tick` is a repeat beat inside a running move (a fissure opening, a
    // tether pulling). Those get a burst; an `end` is bookkeeping the drawn
    // layers already show, and only the WARD's break earns anything, below.
    const spent = event.phase === "end";
    if (!spent) {
      const life = event.kind === "blink_strike" ? 320 : 420;
      effects.push({
        kind: "elite",
        eliteKind: event.kind,
        look: event.look,
        pos: { ...event.pos },
        to: event.to ? { ...event.to } : undefined,
        radius: event.radius,
        untilMs: state.stats.timeMs + life,
        durationMs: life,
      });
    }
    // A PULSE is the one elite move whose whole point is the shove, so it is
    // the one that shakes — a knockback the player feels in the frame as well
    // as in their position. Sized off the ring, exactly as the slam's is.
    if (event.kind === "shock_pulse" && !spent) {
      kickCameraShake(
        shared.cameraShake,
        state.stats.timeMs,
        Math.min(3.5, 1.2 + (event.radius ?? 48) / 34),
        260,
      );
    }
    // A SHELL BREAKING is the feedback the whole move rests on: the player has
    // to learn that hitting it harder was working, and a shell that went
    // quietly teaches the opposite. So the break borrows the PULSE's expanding
    // ring — the shell coming off the body outward — in the shell's own
    // colours. Its screen-space half is fired from GameScreen's event loop,
    // where every CSS burst in the game is fired from.
    if (event.kind === "ward_shield" && spent) {
      effects.push({
        kind: "elite",
        eliteKind: "shock_pulse",
        look: event.look,
        pos: { ...event.pos },
        radius: 34,
        untilMs: state.stats.timeMs + 380,
        durationMs: 380,
      });
    }
  }

  // THE TURN. An enrage is permanent and the player should know the fight just
  // changed — one hot ring off the body and a word, once, rather than a tell
  // that keeps shouting (the standing red aura in render/enemies.ts carries it
  // from here on).
  if (event.type === "enemyEnraged") {
    pushFloat(effects, state.stats.timeMs, {
      pos: { x: event.pos.x, y: event.pos.y - 22 },
      untilMs: state.stats.timeMs + 900,
      durationMs: 900,
      text: "ENRAGED",
      color: "#ff5a3c",
      scale: 1.4,
      shake: true,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 2, 240);
  }

  // THE CALL. Adds come out of the ground, so the ground coughs where each one
  // is about to stand — one burst on the summoner, sized by how many answered.
  if (event.type === "enemySummoned") {
    const ground = groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y);
    for (let i = 0; i < event.count; i++) {
      const angle = (i / Math.max(1, event.count)) * Math.PI * 2;
      effects.push({
        kind: "dustTakeoff",
        pos: {
          x: event.pos.x + Math.cos(angle) * 26,
          y: event.pos.y + Math.sin(angle) * 26,
        },
        untilMs: state.stats.timeMs + TAKEOFF_DUST_MS,
        durationMs: TAKEOFF_DUST_MS,
        color: ground,
        intensity: 1.2,
        speed: 0,
        angle,
        seed: state.stats.timeMs + i * 53,
      });
    }
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.2, 180);
  }

  // ── THE DEATH RITE ───────────────────────────────────────────────────────
  // The scripted send-off over a felled boss (src/game/boss-death.ts). The
  // engine owns the choreography — the boss on its knees, the horde held off,
  // the hero's leap, the timing — and the three events below are the picture:
  // the beat opening, the blow landing, and the wreck settling.

  // THE RITE OPENS: the boss drops to a knee. A low jolt rather than a bang —
  // the bang is the blow, and spending it here would flatten the beat that
  // exists to make the blow land.
  if (event.type === "bossRiteBegan") {
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.8, 300);
  }

  // THE BLOW LANDS — the one frame the whole rite is about.
  if (event.type === "bossRiteStruck") {
    const def = enemyDef(event.defId);
    const family = goreFamily(def.gore);
    // THE GATE, asked in one place (boss-rite.ts): the device's MATURE CONTENT
    // switch, the family's own GORE row, the KIND's row, and the BLOOD amount. A
    // refusal comes back as a whole body, and — because the answer is read HERE
    // rather than at the draw — nothing below records anything either.
    const left = bossRitePresentation({
      remains: event.remains,
      heading: event.heading,
      force: event.force,
      family: family.id,
      anatomy: def.anatomy ?? "humanoid",
      seed: event.seed,
    });
    // A boss's remains are the level's LANDMARK: they stay for the rest of the
    // run, exactly as its corpse used to. A day of run clock outlives any level
    // and `persist` keeps them from blinking out.
    const lifeMs = 86_400_000;
    if (left.gore) {
      effects.push({
        kind: left.gore.kind,
        pos: { ...event.pos },
        untilMs: state.stats.timeMs + lifeMs,
        durationMs: lifeMs,
        sprite: def.sprite,
        gib: left.gore,
        persist: true,
      });
      // What the wreckage lands on STAYS — soaked into the floor's own
      // saturation grid, one byte per tile, in the boss's own family's colour.
      // Inside the gate, so a censored rite wets nothing at all. `stains` is
      // asked because a rift-thing is LIGHT and marks no floor, exactly as it
      // does not on an ordinary kill.
      if (family.stains) {
        spillBlood(
          state,
          landingSpots(left.gore).map((spot, i) => ({
            x: event.pos.x + spot.x,
            y: event.pos.y + spot.y,
            radius: GIB_SPILL_RADIUS * BOSS_SPILL_SCALE,
            amount: GIB_SPILL_AMOUNT * (i === 0 ? 2 : 1),
          })),
          family.id,
        );
      }
    } else {
      effects.push({
        kind: "corpse",
        pos: { ...event.pos },
        untilMs: state.stats.timeMs + lifeMs,
        durationMs: lifeMs,
        sprite: def.sprite,
        angle: (event.seed % 2 === 0 ? -1 : 1) * (Math.PI / 2),
        persist: true,
      });
    }
    // The hardest jolt the game lands, and it is the right place for it: this
    // is the one blow in the fight that was never in doubt.
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 4.5, 460);
  }

  // THE BEAM OPENS. The sweep itself is drawn from live state (render/boss-fx.ts
  // reads `enemy.mech.beam`, so it tracks the boss frame for frame); what the
  // event adds is the MOMENT — a flare at the eyes and a jolt, so the opening
  // reads as a discrete event rather than as a stripe that faded in.
  if (event.type === "bossBeam") {
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 2.4, 260);
  }

  // THE FLAG GOES IN. A hard downward jolt at the moment it is driven home —
  // the flag itself is an ordinary body from here on, drawn by drawEnemies with
  // its own health bar, which is the point: it is a thing to be broken.
  if (event.type === "bossFlagPlanted") {
    effects.push({
      kind: "dustLand",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LANDING_DUST_MS,
      durationMs: LANDING_DUST_MS,
      color: groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y),
      intensity: 1.5,
      speed: 0,
      angle: 0,
      seed: state.stats.timeMs,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 2.6, 300);
  }

  // THE BARK — a boss naming its move the first time it uses one. Deliberately
  // NOT the dialogue system: that freezes the run, which is exactly wrong for a
  // line whose whole job is to be heard WHILE the move is being dodged. Stacked
  // upward so the lines read in order, each staggered in behind the last.
  if (event.type === "bossBark") {
    const lines = event.lines;
    // The lines are laid out by the SAME allocator that keeps the fight's
    // numbers off each other (float-lane.ts): the last line is pushed first and
    // takes the first free row over the speaker, and each earlier line lands on
    // the row above it — so the paragraph reads top-down, and it clears the
    // damage numbers, the XP and another boss's bark for free. (Two janitors
    // shouting over each other used to print one illegible block.)
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line) continue;
      pushFloat(effects, state.stats.timeMs, {
        pos: { x: event.pos.x, y: event.pos.y - 30 },
        untilMs: state.stats.timeMs + 1500 + i * 120,
        durationMs: 1500 + i * 120,
        text: line,
        color: "#cfe9ff",
      });
    }
  }

  // A RICOCHET. The coin came off the wall instead of dying on it, and the
  // player has to SEE that happen or the shot that hits them from behind is
  // just a bug. One bright spark at the point of contact, every time.
  if (event.type === "projectileBounced") {
    effects.push({
      kind: "burst",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + 180,
      durationMs: 180,
      color: event.hostile ? "#ffd75e" : "#cfe9ff",
    });
  }

  // THE VOLLEY LEAVES. The coins themselves are ordinary projectiles the
  // renderer already draws; what the event adds is the THROW — a kick at the
  // muzzle and a jolt, so a fan of seven reads as one move rather than as seven
  // things that happened to start together.
  if (event.type === "bossVolley") {
    effects.push({
      kind: "muzzle",
      pos: { ...event.pos },
      angle: event.angle,
      weaponClass: "ranged",
      untilMs: state.stats.timeMs + 160,
      durationMs: 160,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.4, 180);
  }

  // BAIT LANDS. A coin arcs out and clinks down — the pile is drawn from state
  // once it is there, so this is purely the moment of the throw, which is the
  // one chance the player gets to see WHERE it came from.
  if (event.type === "baitDropped") {
    effects.push({
      kind: "burst",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + 220,
      durationMs: 220,
      color: "#ffd75e",
    });
  }

  // BAIT GOES OFF. Gold light and a hard kick — it should feel like being had,
  // not like a stray hit, so it is louder than its damage strictly deserves.
  if (event.type === "baitDetonated") {
    effects.push({
      kind: "nova",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + 260,
      durationMs: 260,
      radius: event.radius,
    });
    effects.push({
      kind: "dustLand",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LANDING_DUST_MS,
      durationMs: LANDING_DUST_MS,
      color: groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y),
      intensity: 1.8,
      speed: 0,
      angle: 0,
      seed: state.stats.timeMs,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 3, 300);
  }

  // THE CALL GOES OUT. The pods are already falling and telegraph themselves
  // with the meteor shadow; this is the ORDER being given, so it reads as
  // something the boss DID rather than as weather that started.
  if (event.type === "bossAirstrike") {
    ctx.showAreaCaption("INCOMING", "#ff9a4a");
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.6, 220);
  }

  // A POD POPS OPEN. The crater is also a spawn — dust coughs off the seam as
  // whatever was shipped climbs out of it.
  if (event.type === "podOpened") {
    const ground = groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y);
    for (let i = 0; i < event.count; i++) {
      const angle = (i / Math.max(1, event.count)) * Math.PI * 2;
      effects.push({
        kind: "dustTakeoff",
        pos: {
          x: event.pos.x + Math.cos(angle) * 22,
          y: event.pos.y + Math.sin(angle) * 22,
        },
        untilMs: state.stats.timeMs + TAKEOFF_DUST_MS,
        durationMs: TAKEOFF_DUST_MS,
        color: ground,
        intensity: 1.3,
        speed: 0,
        angle,
        seed: state.stats.timeMs + i * 71,
      });
    }
  }

  // THE HORDE IS CALLED. The herd's own approach dust is already drawing the
  // lane it will come down; the caption names WHO is coming, because a wall of
  // runners the player has never seen before deserves one word of warning.
  if (event.type === "bossHorde") {
    ctx.showAreaCaption("THEY'RE COMING", "#ffb02e");
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.8, 260);
  }

  // A REPAIR NODE GOES UP. The tether itself is drawn from live state
  // (render/boss-fx.ts, for as long as the node stands); the event is the
  // MOMENT, and it deliberately shouts — a player who misses this is about to
  // spend the fight wondering why the bar keeps climbing.
  if (event.type === "bossRecompile") {
    ctx.showAreaCaption("RESTORING", "#7cff9b");
    effects.push({
      kind: "nova",
      pos: { ...event.nodePos },
      untilMs: state.stats.timeMs + 380,
      durationMs: 380,
      radius: 26,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.4, 200);
  }

  // The healing itself is a per-tick trickle, so it gets no effect of its own —
  // the tether is already on screen saying it, and a burst per tick would be a
  // strobe. Consumed here only so the event is not silently unhandled.
  if (event.type === "bossHealed") {
    shared.lastBossHealMs = state.stats.timeMs;
  }

  // THE SHUTTERS COME DOWN. They are ordinary obstacles from here on, so
  // drawObstacles draws them; what the event owes is the SLAM — dust off every
  // segment would be a wall of noise, so it is one hard jolt and a caption.
  if (event.type === "bossLockdown") {
    ctx.showAreaCaption("LOCKDOWN", "#ff9a4a");
    effects.push({
      kind: "dustLand",
      pos: { ...event.pos },
      untilMs: state.stats.timeMs + LANDING_DUST_MS,
      durationMs: LANDING_DUST_MS,
      color: groundColorAt(state, ctx.sprites, event.pos.x, event.pos.y),
      intensity: 2,
      speed: 0,
      angle: 0,
      seed: state.stats.timeMs,
    });
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 4, 420);
  }

  if (event.type === "bossLockdownLifted") {
    kickCameraShake(shared.cameraShake, state.stats.timeMs, 1.6, 240);
  }

  // BURNING FLOOR BITES. The patches themselves are drawn from state on the
  // ground plane; this is the hero's own reaction to standing in one — fire
  // licking up off HIM, so the damage is attributed to where he is standing
  // rather than reading as another mob having hit him.
  if (event.type === "scorchBurn") {
    // A lick of the same cold fire climbing the hero himself, drawn as the
    // authored flame rather than as a ring around him: the floor is already
    // burning under his feet, and one more circle would say nothing the fire
    // is not already saying.
    effects.push({
      kind: "burst",
      pos: { x: event.pos.x, y: event.pos.y - PLAYER.radius },
      untilMs: state.stats.timeMs + 260,
      durationMs: 260,
      color: "#7ef0d8",
    });
  }
}

/** Drop effects whose lifetime has lapsed (run at the end of each sim tick).
 * Measured on the effect layer's own clock, which keeps running on the death
 * scene's timer after the sim clock stops — so the numbers the killing blow
 * threw expire and drain instead of being held for the whole tableau. */
export function expireEffects(shared: LoopShared, state: GameState): void {
  if (shared.effects.length > 0) {
    const nowMs = effectsClockMs(state);
    shared.effects = shared.effects.filter((e) => e.untilMs > nowMs);
  }
}
