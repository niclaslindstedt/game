// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOT TUNING — the autopilot's positioning knobs, one neutral default per lever,
// with per-level overrides. This is the engine-side half of the `bot.yaml`
// pipeline (see the `bot-improvement` skill): `content/bot.yaml` is the
// hand-authored source of truth, compiled to `src/generated/botTuning.ts` by
// `scripts/generate-bot-tuning.mjs` (run inside `npm run levels`), and
// the bot resolves a per-level `BotTuning` off it every tick via
// `botTuningFor()` — so a knob can be retuned globally OR bent for one map
// without touching the bot's decision code.
//
// This module is a LEAF: it deliberately does NOT import the generated
// overrides (the resolver takes them as an argument). That keeps the generator
// free to import `BOT_TUNING_DEFAULTS` here to validate the YAML's knob keys
// without triggering the bootstrap cycle it would hit importing the file it is
// about to write (mirrors how generate-levels.mjs avoids the level registry).
//
// The DEFAULTS reproduce the bot's shipped constants EXACTLY, so a run with no
// override in `bot.yaml` plays identically to before the pipeline existed. New
// knobs migrate here one at a time as the bot is iterated — keep the set to the
// levers actually READ by the bot modules, never a knob the decision code ignores.

/** The three survival POSTURES and how each weights safety against kills — the
 * playstyle axis `survive()` reads (`aggro`/`balanced`/`flee`). */
export type PostureTuning = {
  /** Scales both the danger bubble and the reach-aware engage hold (>1 fights
   * further out, peeling off the pack earlier; <1 presses in tighter). */
  standoffMul: number;
  /** HP fraction below which the hero breaks contact to heal/reset. */
  fleeHp: number;
  /** Packed-foe count that (with encirclement) triggers a punch-out. */
  surround: number;
};

/** The autopilot's positioning tunables. Distances are world px; fractions are
 * of the relevant span. One neutral default each, matching the bot's shipped
 * constants. */
export type BotTuning = {
  /** The standoff HELD from the nearest body — just beyond a foe's ~34px grasp.
   * The floor every reach-aware hold is clamped to, so a hold never creeps
   * inside a bite. */
  graspStandoff: number;
  /** RANGED/MAGIC engage distance as a fraction of the weapon's own range: the
   * hero holds at `range * engageRangeFrac` (floored at `graspStandoff`) so he
   * kills from near max reach instead of hugging the front line. Melee, which
   * can't reach that far, holds at its own range regardless. */
  engageRangeFrac: number;
  /** MELEE hold distance as a fraction of the blade's ACTUAL reach
   * (weaponRangeFor — base range widened by STR): the melee hero holds near the
   * blade TIP (`reach * meleeHoldFrac`, leaned in by the posture's standoffMul)
   * so the auto-swing's cone lands on the front line every tick. Floored at the
   * foe's grasp + {@link meleeGraspClearance} (so the body stays OUTSIDE the
   * bite) and capped by `maxEngageRangeFrac` (so even the flee posture stays
   * within reach). Melee is a HOLD-AND-GRIND lane — cowards pick ranged — but it
   * grinds from just past the bite, not inside it. */
  meleeHoldFrac: number;
  /** The SHORT-BLADE MELEE danger bubble (world px): the give-ground line used
   * only when the blade is too short to clear the foe's grasp (a knuckle/knife vs
   * a big body), where no safe standoff exists and the hero must press in and
   * trade. A normal blade instead gives ground at the grasp clearance line (see
   * {@link meleeGraspClearance}). NOT the ranged {@link graspStandoff} (72), which
   * exceeds a starter blade's ~38 reach; just beyond a big elite's ~42px bite, and
   * always clamped below the melee hold so a hold band survives. */
  meleeGraspStandoff: number;
  /** MELEE grasp CLEARANCE (world px): the margin the hero keeps between his body
   * and the nearest foe's actual CONTACT GRASP — the centre-to-centre distance at
   * which its touch bites, `(mobRadius + heroRadius) * contactReachMult`, the same
   * line step/ uses. The melee hold is floored at `grasp + this` so, whenever
   * the blade is long enough to reach from there, the hero stands his body just
   * OUTSIDE the bite and swings without eating a contact hit on every blow. A
   * blade too short to clear the grasp still has to press in — arm length is
   * arm length. Grasp-aware so it holds off a small mob and a big one alike. */
  meleeGraspClearance: number;
  /** HARD CEILING on the engage hold as a fraction of the hero's ACTUAL reach
   * (weaponRangeFor — base range widened by STR/INT): the reach-aware hold is
   * clamped to `reach * maxEngageRangeFrac` so no posture standoff (flee's 1.7×)
   * can push it past where the weapon connects. Keeps the hero close enough to
   * HIT the pack instead of skirmishing out of range. <1, comfortably inside
   * reach so shots reliably land as bodies drift at the edge. */
  maxEngageRangeFrac: number;
  /** AoE/CONE engage fraction: a spread weapon (a shotgun's fan, a fire-hose
   * cone — `count > 1` or a `spreadDeg`) fires a FIXED number of pellets, so
   * closing the range concentrates them onto the pack and catches mobs 2/3/4
   * instead of only clipping the front body at max reach. When such a weapon
   * faces a real cluster the hold drops to `reach * aoeEngageFrac` (floored at
   * `graspStandoff`) — nearer than the single-target `engageRangeFrac`. A lone
   * foe (no pack) keeps the normal, safer standoff. */
  aoeEngageFrac: number;
  /** The HP fraction at/below which a body about to bite is met with a JUMP
   * (untouchable airborne frames to escape the hit), not just a foot retreat —
   * "taking damage while low is a cue to hop out". Above it a hop needs a genuine
   * surround; below it, bleeding alone warrants one. ~half. */
  hopHpFrac: number;
  /** Extra px added to the danger bubble in the ~250ms right after the hero takes
   * a hit — a FLINCH so a trade doesn't become a pile-on. Taking damage is itself
   * a signal to give a few px of ground; kept small so the hold doesn't unravel. */
  hurtBackoffPx: number;
  /** The stamina RESERVE (fraction of the max pool) the hero keeps before
   * spending a discretionary JUMP — the surround break-out hop and the boss
   * repositioning hop only fire above it, so a run of hops can't wind him out
   * (empty pool → jog-capped → run down). Below it he breaks contact on FOOT and
   * lets the pool refill; a mechanic-specific dodge that a jump is the ONLY
   * escape for (a charging stampede, a bale on top of him) still hops regardless.
   * The floor is also raised above a single jump's cost, so he never taps the
   * pool to the very bottom. */
  hopStaminaReserve: number;
  /** How much GROUND (world px) a discretionary JUMP must be able to gain for
   * the takeoff to be worth its stamina: before hopping, the bot sweeps a
   * body-width probe this deep toward the intended landing ground and REFUSES
   * the hop when a solid wall/rock blocks it — a jump into a wall just rises in
   * place and burns 10% of the pool for nothing; the escape continues on FOOT
   * (nav rounds the wall). Roughly one hop's worth of horizontal travel. */
  hopCommitDist: number;
  /** MINIMUM GAP (sim ms) between discretionary JUMPS — the cooldown that keeps
   * hops RARE. A takeoff spends 10% of a pool only standing still refills, so a
   * hero who hops at every scuffle winds himself out; with the cooldown, even
   * sustained trouble (surrounded, or bleeding at contact) buys ONE escape hop
   * and then feet until the next is earned. Mechanic dodges a jump is the ONLY
   * escape for (a charging stampede, a bale on top) bypass it — but still
   * restart the clock. 0 disables (hops gated only by stamina + trouble). */
  hopCooldownMs: number;
  /** MINIMUM GAP (sim ms) between PASS-OVER TOP-OFFS — the spend-and-refill
   * switch on capped consumables: with a medkit/potion/repair-kit stack FULL
   * and the same kind lying underfoot (or inside a running magnet's pull), the
   * bot spends ONE — only when the bar it feeds actually has room — and the
   * walked-over pickup refills the stack. The cooldown keeps a field littered
   * with kits after one scuffle from turning the march into a top-off crawl:
   * these items are very low priority when the pockets are already full, and
   * clearing the level always comes first (the switch never steers — it only
   * fires in passing). 0 disables the read. */
  topOffCooldownMs: number;
  /** How near (world px) an un-looted CHEST must be for the hero to break off a
   * quiet march and CRACK IT on the spot — walk into weapon range and let the
   * auto-attack smash it open (a loot locker is never walked past). Only fires
   * with no threat in the local ring and a clear straight sweep to the chest;
   * the macro content sweep still routes to the far ones. 0 disables. */
  chestDetourDist: number;
  /** The DEADBAND (world px) around the engage hold inside which the hero STANDS
   * STILL and fires instead of shuffling: he only closes in when the nearest foe
   * is farther than `engageDist + holdBand`, and gives ground when it is nearer
   * than `engageDist - holdBand`. Wider = he plants more readily (less jitter,
   * fewer micro-adjustments); 0 restores the old always-moving skirmish. */
  holdBand: number;
  /** While DISARMED (a scripted opening), the standoff the hero approaches the
   * nearest foe to and HOLDS — close enough to trip the level's first-sight
   * beat and let the scripted vanguard rush in and draw the blade, but outside
   * the pack so he doesn't barge into the middle unarmed. */
  armApproachStandoff: number;
  /** Max bodies packed within the surround ring the hero will still MARCH the
   * macro goal straight through; above it he holds at reach and thins the front
   * line first instead of walking into a thick field. */
  pushThroughMax: number;
  /** KITE-FORWARD push (RANGED/magic only, path levels): the maximum weight of
   * the away-from-pack vector blended into the OBJECTIVE heading when a body has
   * merely pushed inside the hold band — but NOT breached the danger bubble —
   * while the hero is HEALTHY. Instead of backpedalling away from the pack (which
   * on a walled finite-knot map traces a quarter-circle into the corner and never
   * drains the knot — the moon "stuck" trap), the hero repositions NET-FORWARD:
   * `normalize(objective + awayUnit × push)`, where `push` ramps 0→this as the
   * nearest body closes from the hold's edge to the danger bubble. Kept BELOW 1 so
   * the blend can never flip backward — he pushes the map at reach and clears the
   * knot ON THE MOVE. A true danger-bubble breach (or an overwhelmed/bleeding
   * hero, or an open map) still gives ground away from the pack. Melee is
   * unaffected: its hold band collapses onto the danger bubble, so the
   * kite-forward zone is empty for a blade. 0 disables (restore the old always-
   * backpedal give-ground). */
  kiteForwardPush: number;
  /** CIRCLE-STRAFE arc (radians) the hero advances around a target he's holding
   * at weapon range — the tangential lead that turns a static weapon-range hold
   * into a moving orbit, so enemy shots aimed at his current spot slip past
   * while his auto-aimed weapon keeps hitting. 0 = stand still (the old hold). */
  orbitStep: number;
  /** How far (world px) the bot strikes out to uncover FOG — the reach of the
   * frontier search that picks the next unexplored pocket. Larger = the hero
   * ranges further off the path to discover new ground before the boss. */
  exploreReach: number;
  /** How many DIRECTIONAL BANDS the spawn→boss axis is split into for exploration
   * priority. The bot uncovers the lowest (spawn-side) band's fog before the next,
   * so it sweeps its OWN SIDE → the MIDDLE → the boss's side rather than beelining.
   * The final (boss-side) band is left for the approach — the bot commits to the
   * boss once the near map is uncovered instead of poking every corner beside it.
   * A single band (or a level with no objective axis) is the old undirected
   * nearest-pocket sweep. */
  exploreBands: number;
  /** The fraction of the map the bot uncovers before it STOPS exploring and heads
   * for the boss (0..1). Discovery is deliberately partial — the bot sweeps its
   * own side and the middle to about this coverage, then commits, leaving the
   * boss's side of the map dark until the approach. Keeps the sweep from chasing
   * every last fogged corner (which stalls the run) — the boss is still the goal. */
  exploreTargetFrac: number;
  /** ANTI-LOITER: how long (ms) the hero may go WITHOUT A FIGHT — no live foe
   * inside the local threat ring, no hit taken — before he stops pottering
   * about and MARCHES ON the nearest enemy, committing to that foe until it is
   * down or a real fight finds him (see macro.ts `trackEngagement`). Keeps the
   * bot moving toward the action between objectives instead of idling on
   * cleared ground. 0 disables the read. */
  seekFightAfterMs: number;
  /** How many levels UNDER the boss's monster level the hero will engage it at.
   * 0 = wait for LEVEL PARITY (the default — don't fight the boss under-levelled);
   * a positive value engages that many levels early (rushes sooner); negative
   * over-levels first. Coverage still commits the bot to the boss short of parity
   * ({@link BotTuning.exploreTargetFrac}), so this never strands a hero who tops
   * out under the boss. */
  bossEngageMargin: number;
  /** How far AHEAD (world px, along its roll) a bouncing hay ball
   * (`state.hayBalls`, Eastworld) must be before the hero sidesteps out of its
   * lane. Bigger = he reacts to a bale from further off; 0 disables the dodge.
   * Only bales in his lane and bearing down trigger it (see `dodgeHayBall`). */
  hayBallDodgeDist: number;
  /** Extra half-width (world px) added to the hero+bale radii when judging
   * whether a bale shares the hero's LANE — the slack that decides "this bale
   * will hit me" vs "it rolls past clear". Larger = he leaves the lane with more
   * margin to spare. */
  hayBallLaneMargin: number;
  /** SAND-STORM avoidance (mars): the lateral margin (world px) the hero puts
   * between himself and a drifting storm's centreline when he sidesteps out of
   * its swept corridor — added to the storm body + his own radius. Bigger =
   * gives the gust a wider berth. */
  sandstormClearance: number;
  /** SAND-STORM avoidance: how many seconds of the storm's approach the hero
   * reacts within. He only sidesteps once a storm on his line will reach him
   * inside this window (or already overlaps), so he ignores a distant gust that
   * may still drift wide. */
  sandstormReactSec: number;
  /** EMPLOYEE-STAMPEDE avoidance (SpaceZ HQ): how far AHEAD (world px, along its
   * charge) a herd's near edge must be before the hero HOPS to clear it. A herd
   * charges fast and a jump sails clean over the whole wall, so the read is a
   * well-timed hop — big enough that he's airborne (z above JUMP.dodgeHeight)
   * when the wall reaches him. 0 disables the dodge; only a herd in his lane and
   * bearing down triggers it (see `dodgeStampede`). */
  stampedeDodgeDist: number;
  /** EMPLOYEE-STAMPEDE avoidance: extra half-height (world px) added to the herd
   * band + the hero's radius when judging whether a herd shares his LANE — the
   * slack that decides "this wall will hit me" vs "it charges past clear". */
  stampedeLaneMargin: number;
  /** STAMINA PACING — the RUN THRESHOLD: the stamina fraction (of the max
   * pool) at/below which non-urgent movement drops to the WALK pace. The
   * rule is deliberately simple and absolute: the hero RUNS only under
   * URGENCY (a foe inside `walkThreatDist`, a reflex dodge, an emergency
   * bail — those branches sprint regardless) or while the pool sits above
   * this threshold; below it every reposition is WALKED. Running burns the
   * FULL drain at any pace and only a walk regains (a trickle —
   * STAMINA.walkRegenFactor), so draining the pool on a quiet march is
   * throwing away fight fuel (empty pool → jog-capped + a 2s standstill
   * regen lockout, the worst of everything). Arriving at fights rested is
   * the PRE-FIGHT TOP-UP's job (`topUpSpotDist`), not this threshold's. 0
   * disables all pacing (always run flat out). */
  walkStaminaFrac: number;
  /** STAMINA PACING release: once a below-threshold walk has begun, keep
   * walking until the pool recovers to this fraction of max, then resume
   * the run — the hysteresis band that stops the pace flapping run/walk
   * around the threshold every few ticks. Clamped sensible: at or above
   * walkStaminaFrac. */
  walkResumeFrac: number;
  /** STAMINA PACING — the STAND FLOOR: at/below this fraction of the max
   * pool (and nothing urgent near) the hero stops WALKING and PLANTS
   * outright ("CATCH BREATH") until the pool climbs back to the run
   * threshold (`walkStaminaFrac`). Standing is the only real refill — the
   * full breather rate, ten times the walk's trickle — and the only pace
   * that pays down the empty-pool standstill lockout, so a nearly-spent
   * hero stands while he can instead of crawling the pool back a point at
   * a time. The never-burn-it-all floor: the bot should reach 0 stamina
   * only when urgency forces the sprint. 0 disables the stand (walk all
   * the way down). */
  standStaminaFrac: number;
  /** PRE-FIGHT TOP-UP: a pack spotted within this range (world px, beyond the
   * fight ring) should be engaged at a FULL pool. The bot does the where-do-
   * we-meet arithmetic — if walking at them still refills the pool before
   * contact (their closing speed + his walk pace vs the walk regen), he walks
   * the approach; otherwise he PLANTS and lets them cover the ground while
   * the faster standstill regen races their approach ("BREATHER"). 0
   * disables (no pre-fight top-up). */
  topUpSpotDist: number;
  /** WINDED PACING override: a foe within this range (world px) is close enough
   * to run a walking hero down, so he keeps the full sprint pace and spends
   * what's left of the pool outrunning it — pacing is for the quiet stretches,
   * never for a body already on him. */
  walkThreatDist: number;
  /** How hard an OVERWHELMED retreat (hp chewed below the bot's caution line,
   * a real pack pressing) drifts BACKWARD along the spawn→boss axis — toward
   * ground already cleared — instead of forward toward the objective (where
   * the fresh spawns live). The fraction of the unit away-from-pack vector the
   * spawn-ward heading is blended in at; the away vector stays dominant, so
   * dodging the horde still wins over walking a straight line back. A healthy
   * hero keeps the classic forward kite (measured: constant backward drift
   * costs the boss on a wave level), and a hero with a NUKE banked keeps it
   * regardless — armed like that he can afford to be daring. 0 disables. */
  retreatBackBias: number;
  /** THE WALL-END SENSE: the fraction of the KNOWN-MAP distance the bot
   * trusts when a blocked travel sweep makes it ask the engine "where does
   * this obstacle end?" (`visibleObstacleEnd`, obstacles.ts). The bot's
   * sight along each bearing is the distance to the actual screen edge —
   * the live camera rect the app stamps into `state.view`, or the
   * phone-landscape baseline when headless — UNIONED with the ground
   * already uncovered from the fog that way (the minimap's memory,
   * `exploredRay` in map.ts), scaled by this knob: the bot knows exactly
   * what a player watching the screen AND the minimap knows. A wall's end
   * anywhere on that known map is walked for (latched to one side, so a
   * long wall is traced consistently instead of oscillated against); one
   * under never-seen fog is unknown, and the bot's fallback objective is to
   * go UNCOVER it — tracing the wall toward the nearest fog frontier
   * (`traceTowardFog`, bot/nav.ts) — before the deflection fan and,
   * ultimately, the unstuck escape. 1 = full sight, <1 near-sighted,
   * >1 clairvoyant; 0 disables the sense (fog trace included). */
  wallSightFrac: number;
  /** KEEP AN ESCAPE ROUTE: the minimum count of OPEN lanes (of the
   * 16-direction escape fan — low enemy pressure, not walled) an OVERWHELMED
   * hero (hp below the caution line) demands while a real pack presses. When
   * the horde's envelopment squeezes the open lanes below this he stops
   * holding and repositions down the best remaining lane BEFORE the ring
   * closes — the escape route is kept, not found late. 0 disables the guard.
   * A healthy hero skips it, and a NUKE banked waives it (daring). */
  escapeLaneMin: number;
  /** The three posture rows (aggro/balanced/flee). */
  postures: Record<"aggro" | "balanced" | "flee", PostureTuning>;
};

/** The shipped baseline — every value is the bot's historical constant, so an
 * un-overridden level plays exactly as it did before the tuning pipeline. */
export const BOT_TUNING_DEFAULTS: BotTuning = {
  graspStandoff: 72,
  engageRangeFrac: 0.8,
  meleeHoldFrac: 0.82,
  meleeGraspStandoff: 54,
  meleeGraspClearance: 10,
  maxEngageRangeFrac: 0.85,
  aoeEngageFrac: 0.5,
  hopHpFrac: 0.5,
  hurtBackoffPx: 24,
  hopStaminaReserve: 0.35,
  hopCommitDist: 90,
  hopCooldownMs: 4000,
  topOffCooldownMs: 10_000,
  chestDetourDist: 320,
  holdBand: 28,
  armApproachStandoff: 140,
  pushThroughMax: 2,
  kiteForwardPush: 0.75,
  orbitStep: 0.6,
  exploreReach: 900,
  exploreBands: 3,
  exploreTargetFrac: 0.55,
  seekFightAfterMs: 5000,
  bossEngageMargin: 0,
  hayBallDodgeDist: 96,
  hayBallLaneMargin: 12,
  sandstormClearance: 30,
  sandstormReactSec: 1.6,
  stampedeDodgeDist: 64,
  stampedeLaneMargin: 10,
  walkStaminaFrac: 0.7,
  walkResumeFrac: 0.75,
  standStaminaFrac: 0.15,
  topUpSpotDist: 480,
  walkThreatDist: 260,
  retreatBackBias: 0.6,
  wallSightFrac: 1,
  escapeLaneMin: 4,
  postures: {
    // Trades safety for kills: fights up close, tolerates a denser ring.
    aggro: { standoffMul: 0.65, fleeHp: 0.28, surround: 7 },
    // The classic survivor — the shared anchors.
    balanced: { standoffMul: 1, fleeHp: 0.4, surround: 5 },
    // Trades kills for safety: holds well out of reach, disengages early.
    flee: { standoffMul: 1.7, fleeHp: 0.6, surround: 4 },
  },
};

/** A DEEP-partial tuning override: any subset of the flat knobs, plus any subset
 * of the posture rows each with any subset of its fields. This is what an author
 * writes in `bot.yaml` — a level bends only the knobs it needs. */
export type BotTuningPatch = Omit<Partial<BotTuning>, "postures"> & {
  postures?: Partial<
    Record<"aggro" | "balanced" | "flee", Partial<PostureTuning>>
  >;
};

/** The shape the generated `src/generated/botTuning.ts` exports: the global
 * `default` layer plus per-level overrides keyed by level id. */
export type BotTuningOverrides = {
  default: BotTuningPatch;
  byLevel: Record<string, BotTuningPatch>;
};

/** Merge a partial posture map over a full one (per-row, per-field). */
function mergePostures(
  base: BotTuning["postures"],
  patch: BotTuningPatch["postures"],
): BotTuning["postures"] {
  if (!patch) return base;
  const out = { ...base };
  for (const key of ["aggro", "balanced", "flee"] as const) {
    const row = patch[key];
    if (row) out[key] = { ...base[key], ...row };
  }
  return out;
}

/** Apply one partial layer (flat knobs + the nested posture rows) over a full
 * tuning, returning a fresh object. Non-posture keys copy straight across. */
function applyLayer(base: BotTuning, patch: BotTuningPatch): BotTuning {
  const { postures, ...flat } = patch;
  return {
    ...base,
    ...flat,
    postures: mergePostures(base.postures, postures),
  };
}

/**
 * Resolve the effective {@link BotTuning} for a level: the shipped defaults, the
 * generated `default` layer, then the level's own overrides on top — a pure
 * function of its arguments (no module state, no clock/rng), so a botted run
 * stays deterministic. `botTuningFor` (state.ts) passes the generated `BOT_TUNING_OVERRIDES` and
 * `state.level.id`.
 */
export function resolveBotTuning(
  overrides: BotTuningOverrides,
  levelId: string,
): BotTuning {
  let tune = applyLayer(BOT_TUNING_DEFAULTS, overrides.default ?? {});
  const perLevel = overrides.byLevel[levelId];
  if (perLevel) tune = applyLayer(tune, perLevel);
  return tune;
}
