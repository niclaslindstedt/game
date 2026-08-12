// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot's REFLEX DODGES: reading the field's telegraphed set-piece
// dangers — a boss's slam/charge windup, a rolling hay ball, a sand storm's
// drift, an employee stampede, a falling meteor's impact mark — and stepping
// (or hopping) clear before they land, and a lit MARTYR's blast radius. Each
// returns a GameInput override, or
// null when nothing threatens; `decideAct` (index.ts) runs them ahead of every
// strategy branch so a reflex always preempts the plan. Pure reads of the
// GameState — no bot memory, so determinism holds.

import {
  clamp01,
  direction,
  distance,
  normalize,
  type Vec2,
} from "@game/lib/vec.ts";
import { steer, wellDangerRadius } from "./nav.ts";
import type { BotTuning } from "./tuning.ts";
import { PLAYER, STAMPEDES } from "../config/index.ts";
import { insideObstacle } from "../obstacles.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import { martyrLit } from "../martyrs.ts";
import { activeMechanics } from "../mechanics/index.ts";
import type { Asteroid, GameInput, GameState, Player } from "../types/index.ts";

/**
 * A dodge input when a set-piece's TELEGRAPHED move (mechanics.ts) is about to
 * land on the hero — else null. Every dangerous move roots the mob for a
 * readable windup, so a competent player (and the bot) reads it and gets clear:
 *   • SLAM — an AoE around the mob: step straight out of its `radius` ring.
 *   • CHARGE — a dash down a locked bearing at the hero: sidestep PERPENDICULAR
 *     off the dash line (handled during the windup AND while the dash is in
 *     flight). Standing planted on a rushing boss and eating the hit is what
 *     kept the finisher from ever landing. Highest priority in `botAct`.
 *
 * The escape is on FOOT — stepping off the line / out of the ring is the whole
 * dodge, and the windup gives time to walk clear. A hop here was a needless
 * stamina drain (jumps are reserved for breaking a genuine SURROUND, see
 * `survive`), and it left the hero winded for the next real pinch.
 */
export function dodgeTelegraph(
  state: GameState,
  hero: Player,
): GameInput | null {
  const player = hero;
  for (const e of state.enemies) {
    const mech = e.mech;
    if (!mech) continue;
    const def = enemyDef(e.defId);
    const beamOut = dodgeBeam(state, hero, e);
    if (beamOut) return beamOut;
    const slamR = def.mechanics?.slam?.radius;
    if (mech.telegraph?.kind === "slam" && slamR !== undefined) {
      const n = normalize(player.pos.x - e.pos.x, player.pos.y - e.pos.y);
      if (n.len < slamR + 28) {
        return steer(state, hero, {
          x: player.pos.x + n.x * 140,
          y: player.pos.y + n.y * 140,
        });
      }
    }
    // A charge's locked bearing — from the windup telegraph, or the live dash.
    const dir =
      mech.telegraph?.kind === "charge"
        ? mech.telegraph.dir
        : mech.dashMs && mech.dashMs > 0
          ? mech.dashDir
          : undefined;
    if (dir) {
      const tx = player.pos.x - e.pos.x;
      const ty = player.pos.y - e.pos.y;
      const along = tx * dir.x + ty * dir.y; // hero's projection onto the dash
      if (along > -20) {
        const perpX = tx - dir.x * along;
        const perpY = ty - dir.y * along;
        if (Math.hypot(perpX, perpY) < 46) {
          // On the dash line — step to whichever side he's already leaning.
          let px = -dir.y;
          let py = dir.x;
          if (perpX * px + perpY * py < 0) {
            px = -px;
            py = -py;
          }
          return steer(state, hero, {
            x: player.pos.x + px * 150,
            y: player.pos.y + py * 150,
          });
        }
      }
    }
  }
  return null;
}

/** How far around the boss (radians) the bot aims to sit clear of a beam. */
const BEAM_CLEAR_RAD = 0.5;
/** Slack added to the beam's own arc and reach before the bot calls it a
 * threat — a hero on the exact edge is one step from being burned. */
const BEAM_MARGIN_RAD = 0.25;
const BEAM_MARGIN_PX = 26;

/**
 * A dodge input when a boss's BEAM (`laser_eyes`) is about to cross the hero,
 * or is crossing him right now — else null.
 *
 * The sweep travels ONE WAY, from one edge of its arc to the other, so the
 * answer a competent player finds is not "sidestep" (the arc is swept, a step
 * across it changes nothing) but "get behind it": move around the boss toward
 * the side the beam has ALREADY passed. That is what this does — it walks the
 * hero around the boss at his current distance to a bearing safely behind the
 * beam's current one, during the windup (when the beam is parked at its start
 * edge) exactly as during the sweep.
 *
 * The bot has to be taught this move explicitly. Without it the hero stands in
 * the lane taking the full burn and then walks through the fire it left, which
 * would make every headless balance run of the moon meaningless.
 */
function dodgeBeam(
  state: GameState,
  hero: Player,
  e: GameState["enemies"][number],
) {
  const mech = e.mech;
  if (!mech) return null;
  const beam = mech.beam;
  const winding = mech.telegraph?.kind === "laser_eyes" ? mech.telegraph : null;
  if (!beam && !winding) return null;

  // The beam's bearing RIGHT NOW: mid-sweep it is wherever the arc has reached;
  // during the windup it is parked at the start edge, about to set off.
  let bearing: number;
  let half: number;
  let reach: number;
  if (beam) {
    const t = 1 - Math.max(0, Math.min(1, beam.remainingMs / beam.durationMs));
    half = beam.sweep / 2;
    bearing = beam.angle - half + beam.sweep * t;
    reach = beam.range;
  } else {
    const spec = activeMechanics(e, enemyDef(e.defId))?.abilities?.find(
      (a) => a.id === "laser_eyes",
    );
    if (!spec || !winding?.dir || !("sweepDeg" in spec)) return null;
    half = (spec.sweepDeg * Math.PI) / 180 / 2;
    bearing = Math.atan2(winding.dir.y, winding.dir.x) - half;
    reach = spec.range;
  }

  const player = hero;
  const dx = player.pos.x - e.pos.x;
  const dy = player.pos.y - e.pos.y;
  const dist = Math.hypot(dx, dy);
  if (dist > reach + BEAM_MARGIN_PX) return null; // already out of its reach
  const heroAngle = Math.atan2(dy, dx);
  // Signed shortest angle from the beam to the hero. Positive = the beam has
  // yet to reach him, which is the dangerous side.
  let delta = heroAngle - bearing;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  // Behind the beam already, by a comfortable margin: nothing to do.
  if (delta < -BEAM_MARGIN_RAD) return null;
  // Beyond the far edge of the whole arc: the sweep will never reach him.
  if (beam ? false : delta > half * 2 + BEAM_MARGIN_RAD) return null;

  // Walk around the boss to a bearing safely behind the beam, holding his
  // current distance — circling, not retreating, so he keeps his shot.
  const safe = bearing - BEAM_CLEAR_RAD;
  return steer(state, hero, {
    x: e.pos.x + Math.cos(safe) * dist,
    y: e.pos.y + Math.sin(safe) * dist,
  });
}

/**
 * A step OFF burning floor (`state.scorches`) when the hero is standing in it
 * — else null. The burn is a slow tick rather than a spike, so this sits below
 * the real dodges; but a bot that ignored it would happily hold its firing
 * position inside a fire for the whole fight, which is neither what a human
 * does nor a measurement worth having.
 *
 * The escape aims at the nearest clear ground rather than at a fixed distance:
 * a beam lays a BAND of fire, so the way out is across the band, and the
 * shortest way across is the direction the patches thin out in.
 */
export function dodgeScorch(state: GameState, hero: Player): GameInput | null {
  if (state.scorches.length === 0) return null;
  const player = hero;
  let inFire = false;
  // The summed outward push of every patch he is standing in: the way out of a
  // band is the way its own weight is not.
  let awayX = 0;
  let awayY = 0;
  for (const patch of state.scorches) {
    const dx = player.pos.x - patch.pos.x;
    const dy = player.pos.y - patch.pos.y;
    const d = Math.hypot(dx, dy);
    if (d > patch.radius + PLAYER.radius) continue;
    inFire = true;
    // A patch he is dead centre of gives no bearing; nudge off its seed so the
    // sum is never exactly zero and he never stands paralysed in a fire.
    const n = d > 0.5 ? 1 / d : 1;
    awayX += (d > 0.5 ? dx : Math.cos(patch.seed)) * n;
    awayY += (d > 0.5 ? dy : Math.sin(patch.seed)) * n;
  }
  if (!inFire) return null;
  const len = Math.hypot(awayX, awayY);
  if (len < 1e-4) return null;
  return steer(state, hero, {
    x: player.pos.x + (awayX / len) * 90,
    y: player.pos.y + (awayY / len) * 90,
  });
}

/**
 * A step away from ARMED BAIT (`state.baits` — PUMP AND DUMP) the hero is about
 * to walk into — else null.
 *
 * The bot needs this taught explicitly and it is the one dodge in this file
 * that is really about a MISTAKE rather than a threat: bait is drawn to look
 * exactly like loot, the autopilot's whole job is to hoover up loot, and left
 * alone it would sprint at every pile on the field and detonate all of them in
 * a row. That is genuinely what a first-time player does, which makes it good
 * design — but it makes every headless balance run of the fight meaningless.
 *
 * Only ARMED piles are avoided. One still arming is inert and the hero can walk
 * straight over it, which is exactly the window the ability grants a player who
 * saw it land.
 */
export function dodgeBait(state: GameState, hero: Player): GameInput | null {
  if (state.baits.length === 0) return null;
  const player = hero;
  let awayX = 0;
  let awayY = 0;
  let threatened = false;
  for (const bait of state.baits) {
    if (bait.armMs > 0) continue; // inert — nothing to avoid yet
    const dx = player.pos.x - bait.pos.x;
    const dy = player.pos.y - bait.pos.y;
    const d = Math.hypot(dx, dy);
    // Give the trigger a wide berth rather than skimming its edge: the blast is
    // far bigger than the trigger, so "just outside the trigger" is still the
    // wrong place to be standing when a neighbouring pile goes.
    const keepOut = bait.triggerRadius + PLAYER.radius + 18;
    if (d > keepOut) continue;
    threatened = true;
    const n = d > 0.5 ? 1 / d : 1;
    awayX += (d > 0.5 ? dx : Math.cos(bait.seed)) * n;
    awayY += (d > 0.5 ? dy : Math.sin(bait.seed)) * n;
  }
  if (!threatened) return null;
  const len = Math.hypot(awayX, awayY);
  if (len < 1e-4) return null;
  return steer(state, hero, {
    x: player.pos.x + (awayX / len) * 80,
    y: player.pos.y + (awayY / len) * 80,
  });
}

/**
 * A sidestep input when a bouncing HAY BALL (`state.hayBalls`, Boot Hill) is
 * bearing down the hero's lane — else null. Bales roll straight LEFT at a fixed
 * `y`, so a body in the same lane gets shoved back down the street; the human
 * read is to step PERPENDICULAR (up/down) out of the lane before it arrives.
 * Considers only bales still to the hero's right (ahead of the roll) and within
 * `hayBallDodgeDist`, whose lane overlaps his within the combined radii plus
 * `hayBallLaneMargin`. Dodges toward the OPEN side (the map centre, so he never
 * sidesteps off the field), and hops if a bale is right on top of him — an
 * airborne hero clears a bale like he clears enemy contact.
 */
export function dodgeHayBall(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): GameInput | null {
  if (state.hayBalls.length === 0 || tune.hayBallDodgeDist <= 0) return null;
  const player = hero;
  const midY = state.level.height / 2;
  let threat: (typeof state.hayBalls)[number] | null = null;
  let best = Infinity;
  for (const ball of state.hayBalls) {
    const ahead = ball.pos.x - player.pos.x; // >0 = still up-street, closing
    if (ahead < -ball.radius || ahead > tune.hayBallDodgeDist) continue;
    const laneGap = Math.abs(ball.pos.y - player.pos.y);
    const laneReach = ball.radius + PLAYER.radius + tune.hayBallLaneMargin;
    if (laneGap > laneReach) continue;
    if (ahead < best) {
      best = ahead;
      threat = ball;
    }
  }
  if (!threat) return null;
  // Step away from the bale's lane, toward the roomier side (map centre) when
  // the hero straddles its centreline, so the dodge never walks him off-field.
  let sign = player.pos.y < threat.pos.y ? -1 : 1;
  if (Math.abs(player.pos.y - threat.pos.y) < 2)
    sign = player.pos.y > midY ? -1 : 1;
  const grounded = player.z === 0;
  const jump = grounded && best <= threat.radius + PLAYER.radius;
  return steer(
    state,
    hero,
    { x: player.pos.x, y: player.pos.y + sign * 90 },
    jump,
  );
}

/**
 * A dodge input when a SAND STORM (mars) is about to sweep over the grounded
 * hero — else null. A storm drifts a straight, readable line SLOW enough to
 * walk clear of, and being caught means a 2-second KNOCKOUT (Player.knockoutMs)
 * that leaves him prone and helpless in the horde — a far worse trade than one
 * hit. So the bot reads it like a charge telegraph: if he sits inside a storm's
 * swept corridor and it's closing, sidestep PERPENDICULAR off the drift line to
 * the open side and walk clear. A gust is too wide to hop, so the escape is
 * lateral, never a jump. A storm that already STRUCK is spent — it can't knock
 * him out again — so its fading drift is ignored.
 */
export function dodgeSandstorm(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): GameInput | null {
  const pos = hero.pos;
  for (const storm of state.sandstorms) {
    if (storm.struck) continue;
    const dir = storm.dir;
    const relX = pos.x - storm.pos.x;
    const relY = pos.y - storm.pos.y;
    // How far ahead of the storm the hero sits, along its drift, and how far off
    // its centreline (the swept lane's half-width).
    const along = relX * dir.x + relY * dir.y;
    if (along < -storm.radius) continue; // behind it — it's drifting away
    const reactDist =
      storm.radius + PLAYER.radius + storm.speed * tune.sandstormReactSec;
    if (along > reactDist) continue; // still far up its path — it may drift wide
    const perpX = relX - dir.x * along;
    const perpY = relY - dir.y * along;
    const perp = Math.hypot(perpX, perpY);
    const corridor = storm.radius + PLAYER.radius + tune.sandstormClearance;
    if (perp >= corridor) continue; // outside the swept lane — no need to move
    // Step to whichever side he's already leaning (fastest out of the lane);
    // dead-centre, take the drift's left normal. Flip if that side walks him
    // into a wall.
    let px = -dir.y;
    let py = dir.x;
    if (perp > 1e-3 && perpX * px + perpY * py < 0) {
      px = -px;
      py = -py;
    }
    const stepOut = corridor + 50;
    let tx = pos.x + px * stepOut;
    let ty = pos.y + py * stepOut;
    if (insideObstacle(state, { x: tx, y: ty }, PLAYER.radius)) {
      tx = pos.x - px * stepOut;
      ty = pos.y - py * stepOut;
    }
    return steer(state, hero, { x: tx, y: ty });
  }
  return null;
}

/**
 * A JUMP input when an employee stampede (`state.stampedes`, GOODCO HQ) is about
 * to trample the grounded hero — else null. A herd charges a straight, fast line
 * to the LEFT, and being caught means a ~20% bite AND a 2-second knockdown in the
 * horde — but a jump sails clean over the whole wall (z above JUMP.dodgeHeight).
 * So the human read is a well-timed HOP: considers only herds still to the hero's
 * right (ahead of the charge) whose band overlaps his lane, and hops once the
 * near edge is within `stampedeDodgeDist` — close enough that he's airborne when
 * the wall reaches him, not so early he lands back down into it. A herd that
 * already STRUCK is spent (it can't knock him down again), and a hop only fires
 * from the ground, so a mid-air hero rides his existing jump over it.
 */
export function dodgeStampede(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): GameInput | null {
  if (state.stampedes.length === 0 || tune.stampedeDodgeDist <= 0) return null;
  const player = hero;
  if (player.z > 0) return null; // already airborne — the current hop clears it
  const laneReach =
    STAMPEDES.bandHalfHeight + PLAYER.radius + tune.stampedeLaneMargin;
  const nearReach = STAMPEDES.bandHalfDepth + PLAYER.radius;
  for (const herd of state.stampedes) {
    if (herd.struck) continue;
    if (Math.abs(herd.pos.y - player.pos.y) > laneReach) continue; // not his lane
    // Gap from the herd's LEADING (left) edge to the hero, along the charge.
    const ahead = herd.pos.x - nearReach - player.pos.x;
    if (ahead < -nearReach * 2) continue; // already charged past him
    if (ahead > tune.stampedeDodgeDist) continue; // still too far to commit the hop
    // Hop in place — steer to hold his ground and clear the wall overhead.
    return steer(state, hero, { x: player.pos.x, y: player.pos.y }, true);
  }
  return null;
}

/** Clearance past the danger ring the escape steers to (world px). Kept
 * SHORT — bolting all the way past the pull reach ping-pongs the bot between
 * neighbouring holes on well-dense maps. */
const WELL_DODGE_CLEARANCE = 40;
/** Tangential lean mixed into the radial escape, so a well sitting on the
 * bot's route is ROUNDED (the escape slides around the rim in the direction
 * he was already travelling) instead of bounced off head-on. */
const WELL_DODGE_TANGENT = 0.55;

/**
 * A bolt OUT of a gravity well's pull before it drags the grounded hero into
 * the core (`state.wells` — the rift's black holes; a swallow is instant
 * death, the worst outcome on the board). The human read is simply to never
 * linger inside the pull: the moment the hero sinks past the inner band
 * (`WELL_DODGE_DEPTH` of the reach, where the drag starts winning against
 * his walk), steer him radially clear — with a tangential lean along his
 * current momentum so a hole sitting on the route is rounded, not fought.
 * Kiting is what feeds the hole (the survivor backs away from the horde and
 * into the pull, eyes on the fight), so this preempts every combat branch.
 */
export function dodgeWell(state: GameState, hero: Player): GameInput | null {
  const player = hero;
  for (const well of state.wells) {
    const n = normalize(player.pos.x - well.pos.x, player.pos.y - well.pos.y);
    const danger = wellDangerRadius(well);
    if (n.len >= danger) continue;
    // Radial out; dead-centre (never in practice — the core devours first)
    // bolts toward the map centre like the asteroid dodge.
    let rx = n.x;
    let ry = n.y;
    if (n.len < 1e-3) {
      const away = direction(well.pos, {
        x: state.level.width / 2,
        y: state.level.height / 2,
      });
      rx = away.x || 1;
      ry = away.y;
    }
    // Tangential side: keep the side his momentum already leans to, so the
    // escape arc continues his travel around the rim. The lean FADES OUT with
    // depth — deep in the ring every scrap of speed must fight the drag
    // radially (walking is all he has; there is no dash), or the pull wins.
    let tx = -ry;
    let ty = rx;
    if (player.vel.x * tx + player.vel.y * ty < 0) {
      tx = -tx;
      ty = -ty;
    }
    const depthIn = clamp01((danger - n.len) / (danger * 0.4));
    const tangent = WELL_DODGE_TANGENT * (1 - depthIn);
    const e = normalize(rx + tx * tangent, ry + ty * tangent);
    const out = danger + PLAYER.radius + WELL_DODGE_CLEARANCE;
    // Deep enough that the drag rivals his walk (a knockback or a kiting
    // backstep can dump him this far in), legs alone lose the tug-of-war —
    // but AIRBORNE the pull drops to `airPullFraction` (0.6×), so the human
    // read is a HOP outward: leap while the leap still clears.
    const pullHere = well.pullSpeed * (1 - n.len / well.pullRadius);
    const jump = player.z === 0 && pullHere > PLAYER.speed * 0.6;
    return steer(
      state,
      hero,
      {
        x: well.pos.x + e.x * out,
        y: well.pos.y + e.y * out,
      },
      jump,
    );
  }
  return null;
}

/** Extra clearance the bot puts between itself and a meteor's blast edge when
 * it steps off an impact mark (world px) — a human leaves a margin, not a
 * hair. */
const ASTEROID_DODGE_MARGIN = 26;
/** How close to impact (ms) a strike must be before the bot bothers to clear
 * its mark — early enough to walk out, late enough not to flinch at every rock
 * that is still a second-and-a-half from landing. */
const ASTEROID_DODGE_LEAD_MS = 1100;

/**
 * A step OFF a meteor's impact mark when one is about to land on the hero
 * (`state.asteroids`) — else null. A falling rock telegraphs its blast with a
 * firming ground shadow; the human read is to walk clear of the circle before
 * it detonates. Considers only rocks near enough to impact
 * (`ASTEROID_DODGE_LEAD_MS`) whose blast would catch where the hero now stands,
 * picks the most imminent, and steers straight out past its blast edge (plus a
 * margin). Standing dead on the mark, it breaks the tie toward the map centre
 * so the dodge never walks him off the field.
 */
export function dodgeAsteroid(
  state: GameState,
  hero: Player,
): GameInput | null {
  if (state.asteroids.length === 0) return null;
  const player = hero;
  let threat: Asteroid | null = null;
  let soonest = Infinity;
  for (const rock of state.asteroids) {
    const timeToImpact = rock.fallMs - rock.ageMs;
    if (timeToImpact > ASTEROID_DODGE_LEAD_MS) continue;
    const reach = rock.blastRadius + PLAYER.radius + ASTEROID_DODGE_MARGIN;
    if (distance(rock.target, player.pos) > reach) continue;
    if (timeToImpact < soonest) {
      soonest = timeToImpact;
      threat = rock;
    }
  }
  if (!threat) return null;
  const clear = threat.blastRadius + PLAYER.radius + ASTEROID_DODGE_MARGIN;
  let away = direction(threat.target, player.pos);
  if (away.x === 0 && away.y === 0) {
    // Standing dead on the mark: bolt toward the roomier side (map centre).
    away = direction(threat.target, {
      x: state.level.width / 2,
      y: state.level.height / 2,
    });
    if (away.x === 0 && away.y === 0) away = { x: 1, y: 0 };
  }
  return steer(state, hero, {
    x: threat.target.x + away.x * (clear + 40),
    y: threat.target.y + away.y * (clear + 40),
  });
}

/** Extra clearance the bot puts between itself and a martyr's blast edge
 * (world px). Wider than the meteor's margin because the bomb is WALKING: the
 * mark it will go off on is wherever the man gets to, not where he is now. */
const MARTYR_DODGE_MARGIN = 40;

/**
 * A run clear of a LIT MARTYR (`Enemy.fuseMs`, engine/game/martyrs.ts) — else
 * null. The human read is not subtle: something has just shouted, it is
 * flashing, it is sprinting at you, and the only wrong answer is to keep
 * standing where you were.
 *
 * Two things make it a different problem from a meteor's mark. The blast has
 * no fixed centre — it goes off wherever the body reaches, so the bot flees
 * the BODY rather than a spot on the floor — and the body is chasing, so the
 * escape has to clear the blast radius PLUS the ground he covers in what is
 * left of the fuse. Both are folded into the one target below.
 *
 * The bot does NOT try to shoot the fuse out. That is a genuinely hard read a
 * human makes on feel — is my damage enough, is he far enough — and a bot that
 * gambled on it wrong would post a balance measurement of a hero standing in
 * an explosion on purpose. It keeps shooting him on the way out, because the
 * ordinary fight strategy is already pointed at whatever is nearest.
 */
export function dodgeMartyr(state: GameState, hero: Player): GameInput | null {
  let threat: { pos: Vec2; clear: number } | null = null;
  let nearest = Infinity;
  for (const e of state.enemies) {
    const fuse = e.fuseMs;
    // A martyr still WALKING is an ordinary monster to be shot at; only a lit
    // fuse is a reason to break off whatever the strategy was doing.
    if (fuse === undefined || fuse <= 0 || !martyrLit(e)) continue;
    const spec = enemyDef(e.defId).martyr;
    if (!spec) continue;
    // How far he can still travel before it goes off, so the bot clears where
    // the blast will BE rather than where it would have been.
    const closing = e.speed * (fuse / 1000);
    const clear = spec.blastRadius + PLAYER.radius + MARTYR_DODGE_MARGIN;
    const d = distance(e.pos, hero.pos);
    if (d > clear + closing) continue;
    if (d < nearest) {
      nearest = d;
      threat = { pos: e.pos, clear: clear + closing };
    }
  }
  if (!threat) return null;
  let away = direction(threat.pos, hero.pos);
  if (away.x === 0 && away.y === 0) {
    away = direction(threat.pos, {
      x: state.level.width / 2,
      y: state.level.height / 2,
    });
    if (away.x === 0 && away.y === 0) away = { x: 1, y: 0 };
  }
  return steer(state, hero, {
    x: threat.pos.x + away.x * threat.clear,
    y: threat.pos.y + away.y * threat.clear,
  });
}
