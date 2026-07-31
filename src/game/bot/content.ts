// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// AUTOMATIC CONTENT ENGAGEMENT and MAP DISCOVERY. The bot is the level's
// CONTROL: it proves every chest and elite the designer placed is reachable
// and the map is beatable, WITHOUT the level authoring any bot-specific hint.
// It sweeps to the nearest A*-reachable un-engaged piece — the map's ELITES
// first (its named mid-bosses are prioritized objectives), then the chest
// caches — commits until that piece is consumed, then re-picks, and only
// commits to the boss once nothing reachable is left to discover. The fog
// sweep (`exploreTarget`) is the discovery half: directional coverage from the
// hero's own side outward, with the stall gauge that stops a bogged run from
// looping on fog forever. Pure w.r.t. the GameState — only the bot's own
// content/explore memory is mutated, so determinism holds.

import { distance } from "@game/lib/vec.ts";
import type { Vec2 } from "@game/lib/vec.ts";
import { insideWellPull } from "./nav.ts";
import {
  ensureRoute,
  knownPortals,
  remainingRoute,
  ROUTE_REPLAN_GOAL,
} from "./nav.ts";
import {
  axisProgress,
  objectiveAxis,
  parityHopeless,
  readyForBoss,
} from "./perception.ts";
import type { Bot } from "./state.ts";
import type { BotTuning } from "./tuning.ts";
import { MAP, PLAYER } from "../config/index.ts";
import { mapCols, mapRows } from "../map.ts";
import { findPortalPath, navDistanceField } from "../pathfind.ts";
import { blockedByObstacle } from "../obstacles.ts";
import { enemyDef } from "../defs/enemies/index.ts";
import type { GameState, Obstacle, Player } from "../types/index.ts";
import { inert } from "../disposition.ts";

/** Coarse cell (world px) the bot's ROUGH IDEA of a foe's position snaps to —
 * he knows which patch of the map an elite (or a hunted enemy) holds and heads
 * that way, not its exact pixel. Coarser than `ROUTE_REPLAN_GOAL`, so a target
 * milling about its patch doesn't thrash the A* replan every tick; `findPath`
 * snaps a cell centre that lands in a wall onto open floor. */
const ROUGH_OBJECTIVE_CELL = 160;

/** `p` snapped to the centre of its {@link ROUGH_OBJECTIVE_CELL} — the "rough
 * idea of where it is" every live-foe objective is tracked at. */
export function roughPos(p: Vec2): Vec2 {
  const c = ROUGH_OBJECTIVE_CELL;
  return {
    x: (Math.floor(p.x / c) + 0.5) * c,
    y: (Math.floor(p.y / c) + 0.5) * c,
  };
}

/** The world positions of every un-looted CHEST on the field (a chest is a
 * breakable obstacle flagged `chest`; looting removes it). These are the OFF-PATH
 * caches the sweep detours for — the whole point of "discover the map". */
function chestTargets(state: GameState): Vec2[] {
  // A chest parked inside a gravity well's pull (the rift's
  // dash-past-the-hole dares) is off the sweep: the bot has no dash to cash
  // it, and committing to one fed him to the core / wedged the run out on
  // the repulsion boundary.
  return state.obstacles
    .filter((o) => o.chest && !insideWellPull(state, o.pos))
    .map((o) => o.pos);
}

/** The nearest un-looted CHEST within {@link BotTuning.chestDetourDist} the
 * body can sweep STRAIGHT to — the opportunistic "crack it while we're here"
 * read ({@link survive} step 1), so a quiet march never walks past a loot
 * locker. Chests are jumpable cover, so the chest itself never blocks the
 * sweep — only a real wall culls one. */
export function nearestChestNearby(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): Obstacle | undefined {
  if (tune.chestDetourDist <= 0) return undefined;
  let best: Obstacle | undefined;
  let bestD = tune.chestDetourDist;
  for (const o of state.obstacles) {
    if (!o.chest) continue;
    // A well-guarded chest is not worth the detour — see chestTargets.
    if (insideWellPull(state, o.pos)) continue;
    const d = distance(o.pos, hero.pos);
    if (d >= bestD) continue;
    if (blockedByObstacle(state, hero.pos, o.pos, PLAYER.radius)) continue;
    best = o;
    bestD = d;
  }
  return best;
}

/** The ROUGH positions ({@link roughPos} cells) of every live ELITE the hero
 * should hunt — the map's named mid-bosses, first-class macro objectives
 * beside the chest caches (see {@link nearestContent}): the bot knows roughly
 * where each one holds court and marches in that direction, so no named foe is
 * ever left standing when the boss falls. The coarse cell (not the exact
 * pixel) is the deliberate "rough idea": the target stays put while the elite
 * mills about its patch.
 *
 * The pool only OPENS once the hero is boss-ready ({@link readyForBoss}) OR
 * parity is structurally unreachable ({@link parityHopeless} — JESUS) —
 * before that the normal leveling flow (spawner farm, the directional fog
 * sweep down the authored weave) already meets the route's elites at the
 * intended pace, and dedicated under-levelled cross-map marches were measured
 * to wedge the hero in the late-wave flood and cost him the boss. So the hunt
 * is the endgame GUARANTEE: any elite the sweep missed is sought out before
 * the boss is committed. A leftover elite still above even the boss-ready
 * hero's level (per {@link BotTuning.bossEngageMargin}) stays excluded unless
 * the run is committed (then it's now or never), and apparitions (untouchable
 * scenery) never count. */
function eliteTargets(
  state: GameState,
  hero: Player,
  tune: BotTuning,
): { id: number; pos: Vec2 }[] {
  // HOPELESS PARITY (a player-relative rung — JESUS): the horde levels in
  // lockstep with the hero, so boss-readiness never arrives and waiting
  // would keep this pool shut for the whole run — the elites (and the quest
  // chains they carry: a keycard, a compound door) are as beatable now as
  // they will ever be, so the hunt opens at once and the per-elite level
  // bar is waived. Deliberately NOT extended to authored rungs: opening the
  // pool early there re-created exactly the wedges the gate guards against
  // (measured: goodco/rift runs cancelled on under-levelled elite marches).
  const committed = parityHopeless(state);
  if (!committed && !readyForBoss(state, hero, tune)) return [];
  const out: { id: number; pos: Vec2 }[] = [];
  for (const e of state.enemies) {
    const def = enemyDef(e.defId);
    if (def.role !== "elite" || inert(def, e)) continue;
    if (!committed && hero.level < Math.max(1, e.mlvl - tune.bossEngageMargin))
      continue;
    out.push({ id: e.id, pos: roughPos(e.pos) });
  }
  return out;
}

/** The skip-list key for an abandoned ELITE hunt — keyed by the enemy's ID,
 * not its cell: an elite moves, so a positional key would stop matching and
 * the abandoned hunt would come straight back. */
function eliteKey(id: number): string {
  return `elite:${id}`;
}

/** A cheap signature of the remaining content — the un-looted chest count plus
 * the rough cells of the huntable elites. The committed content target is
 * re-picked only when this changes (a chest cracked, an elite slain or grown
 * huntable, a hunted elite drifting to a new patch), so the bot holds one
 * target instead of dithering every tick. */
function contentSig(state: GameState, hero: Player, tune: BotTuning): number {
  let sig = chestTargets(state).length;
  for (const e of eliteTargets(state, hero, tune)) {
    sig = (sig * 31 + e.id + e.pos.x * 3 + e.pos.y * 7) % 2147483647;
  }
  return sig;
}

/** A stable key for a content position (rounded), so an ABANDONED target can be
 * recognised and skipped across re-picks even as the hero moves. */
function contentKey(p: Vec2): string {
  return `${Math.round(p.x)},${Math.round(p.y)}`;
}

/** How long (sim ms) the bot may fail to shorten its ROUTE to a committed content
 * target before giving up on it — a cache it's A*-reachable to but keeps getting
 * shoved away from. Generous, so it's a genuine can't-get-there, not a scuffle.
 * On a wave map every march crosses live fights, and the old 12s window
 * abandoned chest walks mid-scuffle (measured: the break-room locker was
 * skipped while the hero fought 250px from its door) — so a chest walk now
 * gets the same patience as an elite hunt. */
const CONTENT_ABANDON_MS = 20_000;
/** The remaining route must shrink by this many px² to count as headway, so
 * jitter around a wall doesn't reset the timer. */
const CONTENT_PROGRESS_EPS = 80 * 80;
/** The abandon window for an ELITE hunt — more patient than a chest walk's
 * {@link CONTENT_ABANDON_MS}: the march to a named foe crosses live
 * battlefields, and every scuffle stalls the route without meaning the elite
 * is unreachable. */
const ELITE_ABANDON_MS = 20_000;
/** Once the remaining route is this short the bot is basically ON the target
 * (engaging it) — combat/looting will consume it, so the abandon timer holds
 * off. Above it, a stalled route means he genuinely can't get there. */
const CONTENT_ENGAGE_ROUTE = 320;

/** Once per tick, gauge headway toward the committed content target and
 * ABANDON it once none is made within {@link CONTENT_ABANDON_MS} — pushing its
 * key onto the per-level skip set so the next re-pick moves on (and the boss
 * finally gets committed). FAR from the piece, headway is the remaining ROUTE
 * length shrinking (route, not euclidean distance, so a hero pinned against
 * the wall of a sealed pocket still reads as "can't get there"). ON the
 * piece, headway is its BAR making NEW LOWS — an elite's hp, a chest's break
 * hp — because being parked next to it consumes nothing: an elite fight the
 * hero keeps resetting (bleed → retreat → it leashes home and regens it all
 * back) and a chest the wave flood never lets him crack are STALEMATES that
 * would otherwise pin the run for the rest of the clock. An abandoned elite
 * is skipped by its enemy id ({@link eliteKey}); a chest by its cell. Called
 * from {@link botAct}; mutates only bot memory, so determinism holds. */
export function trackContentAbandon(
  bot: Bot,
  state: GameState,
  hero: Player,
): void {
  const c = bot.content;
  const rc = bot.route;
  if (!c || !c.target || !rc) return;
  // Only gauge while the cached route actually leads to this target.
  if (distance(rc.goal, c.target) > ROUTE_REPLAN_GOAL) return;
  const rem = remainingRoute(rc, hero.pos);
  const remSq = rem * rem;
  let headway = false;
  if (rem <= CONTENT_ENGAGE_ROUTE) {
    // ON the piece: headway = its bar coming down past the lowest seen (an
    // elite's hp, a chest's break hp) — being parked next to it is not enough.
    const target = c.target;
    const hp =
      c.kind === "elite"
        ? state.enemies.find((e) => e.id === c.enemyId)?.hp
        : state.obstacles.find(
            (o) => o.chest && o.pos.x === target.x && o.pos.y === target.y,
          )?.hp;
    if (hp === undefined) return; // consumed — the sig change re-picks next read
    if (c.minHp === undefined || hp < c.minHp) {
      c.minHp = hp;
      headway = true;
    }
  } else if (remSq < c.bestDistSq - CONTENT_PROGRESS_EPS) {
    headway = true;
  }
  if (headway) {
    c.bestDistSq = Math.min(c.bestDistSq, remSq);
    c.bestTimeMs = state.stats.timeMs;
    return;
  }
  // An elite hunt crosses live battlefields — fights stall the march far more
  // than a chest walk, so it gets a more patient window before giving up.
  const abandonMs = c.kind === "elite" ? ELITE_ABANDON_MS : CONTENT_ABANDON_MS;
  if (state.stats.timeMs - c.bestTimeMs > abandonMs) {
    if (!bot.contentSkip || bot.contentSkip.levelId !== state.level.id)
      bot.contentSkip = { levelId: state.level.id, keys: [] };
    bot.contentSkip.keys.push(
      c.kind === "elite" && c.enemyId !== undefined
        ? eliteKey(c.enemyId)
        : contentKey(c.target),
    );
    c.target = null; // force a re-pick (excluding the skipped key) next read
  }
}

/**
 * The nearest A*-REACHABLE un-engaged content — a huntable ELITE (at its
 * {@link eliteTargets} rough cell) or a chest cache, cheapest route first — or
 * null when every reachable piece has been consumed. Cached on the bot and
 * recomputed only when the content inventory changes — so the run commits to
 * one piece, sweeps to it (engaging it as combat takes over near it), and
 * re-picks the next once it's gone. Unreachable pieces (walled off with no
 * key) are skipped, so a genuinely sealed cache never stalls the sweep. Pure
 * w.r.t. state + the bot's memory.
 */
export function nearestContent(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
): Vec2 | null {
  const rc = ensureRoute(bot, state);
  const sig = contentSig(state, hero, tune);
  const needPick =
    !bot.content ||
    bot.content.levelId !== state.level.id ||
    bot.content.sig !== sig ||
    bot.content.target === null; // abandoned → re-pick, excluding the skip set
  if (needPick) {
    const from = hero.pos;
    const skip =
      bot.contentSkip && bot.contentSkip.levelId === state.level.id
        ? bot.contentSkip.keys
        : [];
    // STICKY elite commitment: the content inventory changed (sig) but the
    // committed elite is still alive, huntable, and un-skipped → keep hunting
    // IT — just track its current rough cell — rather than re-picking the
    // nearest. A field of drifting elites re-signs every few seconds, and
    // re-picking each time thrashed the march between two hunts for minutes
    // (measured) instead of finishing one.
    const prev = bot.content;
    if (
      prev &&
      prev.levelId === state.level.id &&
      prev.kind === "elite" &&
      prev.target !== null &&
      prev.enemyId !== undefined &&
      !skip.includes(eliteKey(prev.enemyId))
    ) {
      const held = eliteTargets(state, hero, tune).find(
        (t) => t.id === prev.enemyId,
      );
      if (held) {
        // The elite drifted to a NEW cell → restart the approach gauge: the
        // ratcheted best-route-so-far belongs to the OLD cell, and holding it
        // makes a target that flaps between two cells read as "no headway"
        // and get spuriously abandoned mid-march (measured). The near-elite
        // hp gauge still catches a genuine stalemate.
        if (held.pos.x !== prev.target.x || held.pos.y !== prev.target.y) {
          prev.bestDistSq = Infinity;
          prev.bestTimeMs = state.stats.timeMs;
        }
        prev.sig = sig;
        prev.target = { x: held.pos.x, y: held.pos.y };
        return prev.target;
      }
    }
    let best: Vec2 | null = null;
    let bestKind: "elite" | "chest" | null = null;
    let bestId: number | undefined;
    // ONE nearest-first pool: the huntable elites (the named objectives the
    // sweep is now aware of) alongside the chest caches, cheapest route wins —
    // so an elite is a genuine destination, yet a cache on the way still gets
    // cracked first. (A strict elites-before-chests ordering was measured to
    // drag the hero on long cross-map marches into the late-wave flood and
    // cost him the boss.)
    const candidates: { kind: "elite" | "chest"; id?: number; pos: Vec2 }[] = [
      ...eliteTargets(state, hero, tune).map((e) => ({
        kind: "elite" as const,
        id: e.id,
        pos: e.pos,
      })),
      ...chestTargets(state).map((pos) => ({ kind: "chest" as const, pos })),
    ];
    let bestCost = Infinity;
    for (const t of candidates) {
      const key =
        t.kind === "elite" && t.id !== undefined
          ? eliteKey(t.id)
          : contentKey(t.pos);
      if (skip.includes(key)) continue;
      // Portal-aware, so a piece the LIFT is the only way to (the annex a
      // generated mission ends in) is a destination like any other, priced by
      // the whole journey rather than dismissed as unreachable.
      const route = findPortalPath(rc.grid, knownPortals(state), from, t.pos);
      if (!route) continue;
      const cost = route.length;
      if (cost < bestCost) {
        bestCost = cost;
        best = { x: t.pos.x, y: t.pos.y };
        bestKind = t.kind;
        bestId = t.id;
      }
    }
    // SECOND CHANCE for abandoned chests: the pool is otherwise dry, so clear
    // the chest cells off the skip list ONCE (see `contentSkip.retriedChests`)
    // and let the next re-pick march back — an early-run abandon is usually a
    // walkover for the leveled late-run hero, and the level should end with
    // every locker cracked before the boss seals it. Elite skips stay.
    if (
      best === null &&
      bot.contentSkip &&
      bot.contentSkip.levelId === state.level.id &&
      !bot.contentSkip.retriedChests &&
      bot.contentSkip.keys.some((k) => !k.startsWith("elite:"))
    ) {
      bot.contentSkip.keys = bot.contentSkip.keys.filter((k) =>
        k.startsWith("elite:"),
      );
      bot.contentSkip.retriedChests = true;
    }
    bot.content = {
      levelId: state.level.id,
      sig,
      target: best,
      kind: bestKind,
      enemyId: bestId,
      // Seed the route-length gauge at Infinity so the first measured route
      // counts as progress and starts the abandon clock cleanly. (A held
      // elite never reaches this re-pick — the sticky path above keeps its
      // gauges alive on the same content object.)
      bestDistSq: Infinity,
      bestTimeMs: state.stats.timeMs,
    };
  }
  return bot.content?.target ?? null;
}

/** A fogged patch smaller than this many cells (in a ~7×7 window) is a stray
 * sliver — a rock's shadow, a wall nook — not a pocket worth a detour, so it
 * never yanks the hero around. */
const FOG_BLOB_MIN_CELLS = 8;

/** How often (sim ms) the fog sweep re-picks its pocket. The frontier moves at
 * walking pace and the pick costs a walking-distance flood plus a scan of the
 * whole fog grid, while `macroTarget` — and so this — is read several times a
 * tick. Holding one pick for a beat is both cheaper and steadier: the hero
 * commits to a pocket instead of re-deciding sixty times a second. */
const EXPLORE_REPICK_MS = 500;

/**
 * The world-space centroid of the sizable UNEXPLORED pocket the bot should uncover
 * NEXT — the directional coverage sweep that discovers the map from the hero's own
 * side outward before it ever commits to the boss (see {@link macroTarget}).
 *
 * Scans the coarse fog grid (`state.explored`, `map.ts`) for FRONTIER cells — fog
 * on the boundary of the known region (≥1 uncovered 4-neighbour) — and ranks them
 * by DIRECTIONAL BAND first, WALKING DISTANCE second: the axis (spawn→boss) is
 * split into `exploreBands` slices and the hero clears the lowest (spawn-side)
 * slice's fog before the next, so he sweeps his OWN SIDE → the MIDDLE → the
 * boss's. The final (boss-side) band is deliberately left unexplored so he commits
 * to the boss on approach rather than poking every corner beside it — reaching it
 * uncovers that band anyway. With no axis (an open arena) every cell is band 0,
 * i.e. the old undirected nearest-pocket sweep.
 *
 * "Nearest" is the ROUTE, not the crow ({@link navDistanceField}), and reachability
 * replaces the old LINE OF SIGHT gate. Sight is the wrong question on a map made of
 * rooms: the fog a searcher wants next is precisely what he CANNOT see — the far
 * side of the doorway he has not walked through — so the sighted-only rule left the
 * sweep able to name nothing but the pocket it was standing in, and on a generated
 * map (rooms, compounds, a walled street) that ended discovery a district from the
 * landing. Route distance answers both halves at once: fog sealed behind stone is
 * unreachable and drops out, and of what remains the pocket that is genuinely the
 * shortest WALK wins rather than the one that merely looks close across a wall.
 *
 * Averages the fog in a small window around the winning seed into a centroid,
 * returning it only if the pocket is big enough ({@link FOG_BLOB_MIN_CELLS}). A
 * one-cell inset skips the never-quite-revealed level rim. Null when no explorable
 * frontier remains — the signal to push the boss. The pick is held for
 * {@link EXPLORE_REPICK_MS} on the bot's own memory; pure w.r.t. the state, so
 * botted runs stay deterministic.
 */
export function exploreTarget(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
  wholeMap = false,
): Vec2 | null {
  const now = state.stats.timeMs;
  const held = bot.explore;
  if (
    held &&
    held.levelId === state.level.id &&
    held.pickMs !== undefined &&
    held.pickFar === wholeMap &&
    now - held.pickMs < EXPLORE_REPICK_MS
  )
    return held.pick ?? null;
  const pick = pickFogPocket(bot, state, hero, tune, wholeMap);
  if (held && held.levelId === state.level.id) {
    held.pick = pick;
    held.pickMs = now;
    held.pickFar = wholeMap;
  }
  return pick;
}

/** The fog sweep's actual search — see {@link exploreTarget}, which holds its
 * answer for a beat. */
function pickFogPocket(
  bot: Bot,
  state: GameState,
  hero: Player,
  tune: BotTuning,
  wholeMap: boolean,
): Vec2 | null {
  const cell = MAP.cellSize;
  const cols = mapCols(state.level);
  const rows = mapRows(state.level);
  const axis = objectiveAxis(state);
  const bands = Math.max(1, Math.floor(tune.exploreBands));
  // Explorable bands: with an axis, sweep all but the FINAL (boss-side) one so the
  // hero heads for the boss once his side + the middle are uncovered; with no axis
  // (open arena) every cell is band 0, so nothing is excluded. Searching for a way
  // IN opens every band — the door he is missing may be beside the objective.
  const maxBand = wholeMap ? bands - 1 : axis ? Math.max(0, bands - 2) : 0;
  const rc = ensureRoute(bot, state);
  // `exploreReach` bounds how far the hero RANGES off his route during the
  // leveling window. It must not bound a search he cannot finish without —
  // when the objective has no route yet the only way on is to find one, so the
  // whole map is in scope however far the next dark pocket lies.
  const walk = navDistanceField(
    rc.grid,
    hero.pos,
    wholeMap ? Infinity : tune.exploreReach,
  );
  const nav = rc.grid;
  // Rank frontier by (band asc, walking distance asc): the lowest band anywhere in
  // reach wins, so the spawn-side fog is cleared before the hero advances toward
  // the boss's side, and within a band the pocket that is the shortest WALK is
  // taken first.
  let seedTx = -1;
  let seedTy = -1;
  let bestBand = Infinity;
  let bestWalk = Infinity;
  for (let ty = 1; ty < rows - 1; ty++) {
    for (let tx = 1; tx < cols - 1; tx++) {
      const idx = ty * cols + tx;
      if (state.explored[idx] === 1) continue;
      // FRONTIER only: a fully-fogged cell walled off deep inside the dark is not
      // a target — one whose 4-neighbourhood already touches uncovered ground is.
      if (
        state.explored[idx - 1] !== 1 &&
        state.explored[idx + 1] !== 1 &&
        state.explored[idx - cols] !== 1 &&
        state.explored[idx + cols] !== 1
      )
        continue;
      const wx = (tx + 0.5) * cell;
      const wy = (ty + 0.5) * cell;
      const band = axis
        ? Math.min(
            bands - 1,
            Math.floor(axisProgress(axis, { x: wx, y: wy }) * bands),
          )
        : 0;
      if (band > maxBand) continue;
      if (band > bestBand) continue;
      const nx = Math.floor(wx / nav.cell);
      const ny = Math.floor(wy / nav.cell);
      if (nx < 0 || ny < 0 || nx >= nav.cols || ny >= nav.rows) continue;
      // A pocket inside a gravity well's PULL is not a destination — the same
      // rule the chest sweep follows. The repulsion field that keeps the hero
      // out of the holes cancels the last stretch of the walk, so he arrives
      // nowhere and circles the rim instead: measured on the rift as a run of
      // loiters at the lip of the chest-guard well. The fog behind it is
      // uncovered on the way past soon enough.
      if (insideWellPull(state, { x: wx, y: wy })) continue;
      const ni = ny * nav.cols + nx;
      const legs = walk[ni] as number;
      if (!Number.isFinite(legs)) continue; // no route to it — fog behind stone
      // De-quantize: the flood answers per 40px nav cell, and a fog cell is
      // finer, so a whole neighbourhood of frontier comes back with the SAME
      // number. Ties then fall to scan order, which is the top-left corner of
      // the map — a sweep that always drifts north-west no matter where the
      // hero stands. Adding the last hop from the cell's own anchor to the fog
      // cell restores a true nearest-first within the cell.
      const d =
        legs +
        Math.hypot(
          wx - (nav.anchorX[ni] as number),
          wy - (nav.anchorY[ni] as number),
        );
      if (band === bestBand && d >= bestWalk) continue;
      bestBand = band;
      bestWalk = d;
      seedTx = tx;
      seedTy = ty;
    }
  }
  if (seedTx < 0) return null;
  // Grow the pocket: average the fogged cells in a small window around the seed,
  // requiring a minimum size so a lone stray cell never becomes a detour.
  const win = 3;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let ty = seedTy - win; ty <= seedTy + win; ty++) {
    if (ty < 0 || ty >= rows) continue;
    for (let tx = seedTx - win; tx <= seedTx + win; tx++) {
      if (tx < 0 || tx >= cols) continue;
      if (state.explored[ty * cols + tx] === 1) continue;
      sumX += (tx + 0.5) * cell;
      sumY += (ty + 0.5) * cell;
      count++;
    }
  }
  if (count < FOG_BLOB_MIN_CELLS) return null;
  return { x: sumX / count, y: sumY / count };
}

/** The fraction of the fog grid the hero has uncovered so far (0..1) — the
 * COVERAGE gauge that tells the sweep when it has discovered enough (his side +
 * the middle) and should stop fanning out and head for the boss. Pure. */
export function exploredFraction(state: GameState): number {
  const grid = state.explored;
  if (grid.length === 0) return 1;
  let n = 0;
  for (let i = 0; i < grid.length; i++) n += grid[i]!;
  return n / grid.length;
}

/** Coverage (fraction of the map) the sweep must gain to count as real EXPLORATION
 * HEADWAY — below it, the crawl of the reveal circle around a bogged hero doesn't
 * read as progress. */
const EXPLORE_PROGRESS_EPS = 0.03;
/** Making no {@link EXPLORE_PROGRESS_EPS} coverage headway for this long (sim ms)
 * means the sweep is STUCK — the bot gives up discovering and commits to the boss
 * (the safety that stops boss-level parity from trapping a bogged run). Generous,
 * so it's a genuine stall, not a brief scuffle. */
const EXPLORE_STALL_MS = 15_000;

/** Once per tick, gauge EXPLORATION HEADWAY by map coverage and LATCH `done` once
 * it stalls ({@link EXPLORE_STALL_MS} without an {@link EXPLORE_PROGRESS_EPS}
 * gain) — so a hero who can neither reach boss-level parity nor uncover more map
 * stops looping on fog and heads for the boss. Called from {@link botAct}; mutates
 * only bot memory, so determinism holds. */
export function trackExploreStall(bot: Bot, state: GameState): void {
  const frac = exploredFraction(state);
  const now = state.stats.timeMs;
  if (!bot.explore || bot.explore.levelId !== state.level.id) {
    bot.explore = {
      levelId: state.level.id,
      mark: frac,
      markMs: now,
      done: false,
    };
    return;
  }
  const e = bot.explore;
  if (e.done) return;
  if (frac >= e.mark + EXPLORE_PROGRESS_EPS) {
    e.mark = frac;
    e.markMs = now;
  } else if (now - e.markMs > EXPLORE_STALL_MS) {
    e.done = true; // stalled for good — commit to the boss for the rest of the run
  }
}

/** Has the exploration sweep given up on this level (coverage stalled)? Then the
 * bot commits to the boss even short of parity/coverage — see {@link macroTarget}. */
export function exploreStalled(bot: Bot): boolean {
  return bot.explore?.done === true;
}
