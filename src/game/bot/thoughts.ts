// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// BOT VIEW thought resolver — turn the RAW per-tick decision label the autopilot
// sets (state.ts `think`) into a STABLE, overarching thought for the debug bubble.
//
// The autopilot decides fresh every tick, so a hero dancing at a pack's edge
// flips between neighbouring branches ("KITE" one tick, "GIVE GROUND" the next)
// and the raw label strobes — unreadable, and it hides what he's actually doing.
// This layer answers the two questions a watcher has: *which thought matters most
// right now* (an incoming meteor beats a kite), and *what is the sustained
// intent* (a strafing skirmish, not two flickering half-thoughts). It:
//
//   • PREEMPTS with events — a hazard dodge or an emergency bail is shown the
//     instant it fires and latched briefly, so a one-frame reflex stays legible.
//   • holds the DOMINANT state — otherwise the most-sustained recent state thought
//     (boss / skirmish / travel) wins, with hysteresis so a momentary crossover
//     can't switch the display.
//   • MERGES a strafe pair — when the skirmish family shows both a retreat and a
//     push within the window, it reads as one "SKIRMISH" instead of oscillating.
//
// Pure w.r.t. the game: it reads only its own memory + a monotonic clock
// (`state.stats.timeMs`, passed in), never `state`/`state.rng`, so a botted run
// stays exactly as deterministic as a recorded human one (same seed + fresh bot
// → identical thought evolution). The label it returns is a debug annotation the
// sim never reads back — spend them freely.

/** A thought's tier: `event` fires on an occurrence and is shown at once (a
 * dodge, a bail); `state` describes a sustained posture (kiting, travelling) and
 * competes on how much of the recent window it holds. */
type Tier = "event" | "state";

type ThoughtClass = {
  /** The group this label belongs to — labels in one family never fight each
   * other for the display; they resolve to a single representative. */
  family: string;
  /** Importance. A higher-ranked event preempts a lower-ranked shown thought. */
  rank: number;
  tier: Tier;
};

/** Any label not in {@link THOUGHTS} — a newly-added branch that predates its
 * taxonomy entry — falls back to a lone state family so it still shows plainly
 * (no merge, no preempt) rather than being dropped. */
const UNKNOWN: ThoughtClass = { family: "misc", rank: 10, tier: "state" };

/**
 * The label taxonomy: every raw thought the bot can `think()`, grouped into a
 * family with an importance rank and a tier. Keep this in step with the `think()`
 * call sites — a label missing here still renders (via {@link UNKNOWN}), it just
 * can't preempt or merge.
 */
const THOUGHTS: Record<string, ThoughtClass> = {
  // ── Reflexes: telegraphed hazards. Event-driven, top rank — a watcher wants
  //    to SEE the dodge the instant it happens, even for a single frame.
  HERD: { family: "herd", rank: 100, tier: "event" },
  WELL: { family: "well", rank: 100, tier: "event" },
  METEOR: { family: "meteor", rank: 100, tier: "event" },
  STORM: { family: "storm", rank: 100, tier: "event" },
  HAY: { family: "hay", rank: 100, tier: "event" },
  DODGE: { family: "dodge", rank: 100, tier: "event" },
  UNSTICK: { family: "unstick", rank: 95, tier: "event" },
  // ── Emergencies: bleeding out / hemmed in. Event-driven and high — they must
  //    override the combat read, and they re-fire each tick they persist so the
  //    latch keeps them shown for the whole bail.
  "FALL BACK": { family: "fallback", rank: 80, tier: "event" },
  "PUNCH OUT": { family: "punchout", rank: 80, tier: "event" },
  // ── The committed hop in flight (Bot.hopPlan): airborne on a purposeful
  //    jump, steering at the landing ground it was committed to. HOP OUT is
  //    the escape hop riding out (same family as the break-out it continues);
  //    HOP OVER is the ranged reposition over a contact.
  "HOP OUT": { family: "punchout", rank: 80, tier: "event" },
  "HOP OVER": { family: "hopover", rank: 80, tier: "event" },
  "GRAB MEDKIT": { family: "medkit", rank: 80, tier: "event" },
  "GRAB ARROW": { family: "medkit", rank: 80, tier: "event" },
  // ── Boss set-piece. State-driven: dominant while he's committed to the boss.
  "FIGHT BOSS": { family: "boss", rank: 60, tier: "state" },
  "APPROACH BOSS": { family: "boss", rank: 60, tier: "state" },
  "PUSH BOSS": { family: "boss", rank: 60, tier: "state" },
  "RUSH BOSS": { family: "boss", rank: 60, tier: "state" },
  "TO BOSS": { family: "boss", rank: 60, tier: "state" },
  // ── The disarmed opening. State-driven, its own family.
  "ARM UP": { family: "armup", rank: 45, tier: "state" },
  // ── The escape-route guard: repositioning to keep an exit open before the
  //    ring closes. State-driven (it re-fires while the fan stays pinched) but
  //    ranked above the skirmish so the watcher sees WHY he's peeling off.
  "KEEP EXIT": { family: "exit", rank: 45, tier: "state" },
  // ── Skirmish: the MERGEABLE combat family. KITE (hold at reach, push forward),
  //    GIVE GROUND (peel off the pack), ADVANCE (clean push) are the three faces
  //    of one edge-fight — {@link skirmishLabel} collapses a strafing mix of them
  //    into "SKIRMISH".
  KITE: { family: "skirmish", rank: 40, tier: "state" },
  "GIVE GROUND": { family: "skirmish", rank: 40, tier: "state" },
  ADVANCE: { family: "skirmish", rank: 40, tier: "state" },
  RUSH: { family: "rush", rank: 40, tier: "state" },
  // ── Loot / upkeep detours. State-driven.
  "GRAB ITEM": { family: "grab", rank: 30, tier: "state" },
  "GET REPAIR": { family: "repair", rank: 30, tier: "state" },
  // ── Deliberate stamina stands: the pre-fight top-up plant (BREATHER) and the
  //    bone-dry recovery stand (CATCH BREATH). One family — both read as "he is
  //    catching his breath on purpose", not a wedge.
  BREATHER: { family: "breather", rank: 30, tier: "state" },
  "CATCH BREATH": { family: "breather", rank: 30, tier: "state" },
  // ── The GPS nudge: working toward an externally-pinned coordinate.
  "TO MARK": { family: "mark", rank: 25, tier: "state" },
  // ── The anti-loiter hunt: idled too long without a fight, marching on the
  //    nearest enemy. Ranked over the ordinary travel goals it preempts.
  "SEEK FIGHT": { family: "seekfight", rank: 25, tier: "state" },
  // ── Macro travel goals. Distinct families (a committed goal, they don't
  //    oscillate) so each shows its true destination.
  "CLEAR SPAWNER": { family: "spawner", rank: 20, tier: "state" },
  "HUNT ELITE": { family: "elite", rank: 20, tier: "state" },
  "SEEK CHEST": { family: "chest", rank: 20, tier: "state" },
  "CRACK CHEST": { family: "chest", rank: 20, tier: "state" },
  "TO SHOP": { family: "shop", rank: 20, tier: "state" },
  "FOLLOW ARROW": { family: "arrow", rank: 20, tier: "state" },
  "EXPLORE FOG": { family: "fog", rank: 20, tier: "state" },
  // ── Standing easy.
  IDLE: { family: "idle", rank: 0, tier: "state" },
};

function classify(label: string): ThoughtClass {
  return THOUGHTS[label] ?? UNKNOWN;
}

/** One recorded raw decision, kept in the rolling window. */
type ThoughtSample = {
  label: string;
  family: string;
  rank: number;
  tier: Tier;
  atMs: number;
};

/** Per-bot resolver memory. Hangs off the {@link import("./state.ts").Bot}, keyed
 * off pure state — a fresh bot on the same seed evolves it identically. Lazily
 * created by {@link createThoughtMemory}. */
export type ThoughtMemory = {
  /** Raw decisions within the last {@link WINDOW_MS}, oldest first. */
  window: ThoughtSample[];
  /** The label currently on screen. */
  shown: string;
  shownFamily: string;
  shownRank: number;
  /** When `shown` was last (re)selected — drives the dwell hysteresis. */
  shownSince: number;
  /** While an event thought is latched, the time it holds until. */
  eventUntil: number;
};

export function createThoughtMemory(): ThoughtMemory {
  return {
    window: [],
    shown: "",
    shownFamily: "",
    shownRank: -1,
    shownSince: 0,
    eventUntil: 0,
  };
}

/** How far back the dominance read looks (ms). ~44 ticks at the 16 ms sim step —
 * long enough that a strafe oscillation is fully in view, short enough that the
 * display tracks a real state change within a beat. */
const WINDOW_MS = 700;
/** Minimum time (ms) a state thought holds before a DIFFERENT state family can
 * take over — the anti-flicker floor for the sustained read. */
const MIN_DWELL_MS = 300;
/** How long (ms) an event thought stays shown after it last fired — a one-frame
 * reflex is readable, a persisting bail shows throughout (it refreshes the latch
 * each tick it re-fires). */
const LATCH_MS = 450;
/** The skirmish merge needs at least this many of EACH side (retreat and push)
 * in the window to read as a strafe rather than a single blip. */
const SKIRMISH_MIN = 2;

/** The skirmish family's display: SKIRMISH when the window holds both a real
 * retreat AND a real push (the strafe), else the most-recent single face of it. */
function skirmishLabel(window: ThoughtSample[]): string {
  let retreat = 0;
  let push = 0;
  let recent = "KITE";
  for (const s of window) {
    if (s.family !== "skirmish") continue;
    if (s.label === "GIVE GROUND") retreat++;
    else push++; // KITE or ADVANCE
    recent = s.label;
  }
  if (retreat >= SKIRMISH_MIN && push >= SKIRMISH_MIN) return "SKIRMISH";
  return recent;
}

/** The label to show for a family given the current window: the skirmish merge
 * for `skirmish`, else the most-recent raw label seen in that family (which, for
 * the single-label families, is simply that label). */
function familyDisplay(family: string, window: ThoughtSample[]): string {
  if (family === "skirmish") return skirmishLabel(window);
  for (let i = window.length - 1; i >= 0; i--) {
    if (window[i]!.family === family) return window[i]!.label;
  }
  return family;
}

/** The state-tier family holding the most of the window: by sample count, ties
 * broken by higher rank, then by most-recent occurrence. Returns null if the
 * window has no state samples (only events). */
function dominantState(
  window: ThoughtSample[],
): { family: string; rank: number } | null {
  const count = new Map<string, number>();
  const rank = new Map<string, number>();
  const lastAt = new Map<string, number>();
  for (const s of window) {
    if (s.tier !== "state") continue;
    count.set(s.family, (count.get(s.family) ?? 0) + 1);
    rank.set(s.family, s.rank);
    lastAt.set(s.family, s.atMs);
  }
  let best: string | null = null;
  for (const [family, n] of count) {
    if (best === null) {
      best = family;
      continue;
    }
    const bn = count.get(best)!;
    if (
      n > bn ||
      (n === bn && rank.get(family)! > rank.get(best)!) ||
      (n === bn &&
        rank.get(family)! === rank.get(best)! &&
        lastAt.get(family)! > lastAt.get(best)!)
    ) {
      best = family;
    }
  }
  return best === null ? null : { family: best, rank: rank.get(best)! };
}

/**
 * Fold this tick's RAW decision label into the stable displayed thought. Mutates
 * `mem` (the rolling window + shown state) and returns the label to draw.
 *
 * @param mem   per-bot resolver memory
 * @param raw   the label `botAct` settled on this tick (state.ts `think`)
 * @param nowMs a monotonic clock, `state.stats.timeMs`
 */
export function resolveThought(
  mem: ThoughtMemory,
  raw: string,
  nowMs: number,
): string {
  const cls = classify(raw);
  mem.window.push({
    label: raw,
    family: cls.family,
    rank: cls.rank,
    tier: cls.tier,
    atMs: nowMs,
  });
  // Drop anything older than the window (and any out-of-order clock resets).
  const cutoff = nowMs - WINDOW_MS;
  let drop = 0;
  while (drop < mem.window.length && mem.window[drop]!.atMs < cutoff) drop++;
  if (drop > 0) mem.window.splice(0, drop);

  // EVENT this tick → show it now and (re)latch. A higher-ranked event overrides
  // a lower-ranked one already latched; the same event just refreshes the hold.
  if (cls.tier === "event") {
    if (mem.shownFamily !== cls.family) mem.shownSince = nowMs;
    mem.shown = raw;
    mem.shownFamily = cls.family;
    mem.shownRank = cls.rank;
    mem.eventUntil = nowMs + LATCH_MS;
    return mem.shown;
  }

  // A recent event is still latched → keep holding it over the state read.
  if (nowMs < mem.eventUntil) return mem.shown;

  // STATE read: the dominant family in the window, merged/labelled.
  const dom = dominantState(mem.window) ?? {
    family: cls.family,
    rank: cls.rank,
  };
  const candidate = familyDisplay(dom.family, mem.window);

  if (mem.shown === "") {
    mem.shown = candidate;
    mem.shownFamily = dom.family;
    mem.shownRank = dom.rank;
    mem.shownSince = nowMs;
    return mem.shown;
  }

  if (dom.family === mem.shownFamily) {
    // Same family — only the merged sub-label (e.g. KITE ↔ SKIRMISH) can move,
    // and it tracks the window so it doesn't strobe. Update it in place.
    mem.shown = candidate;
    mem.shownRank = dom.rank;
    return mem.shown;
  }

  // A DIFFERENT family wants the display. Switch once it has earned the dwell, or
  // immediately if the old family has aged out of the window entirely (nothing
  // left to hold on to).
  const dwellOk = nowMs - mem.shownSince >= MIN_DWELL_MS;
  const shownStillPresent = mem.window.some(
    (s) => s.family === mem.shownFamily,
  );
  if (dwellOk || !shownStillPresent) {
    mem.shown = candidate;
    mem.shownFamily = dom.family;
    mem.shownRank = dom.rank;
    mem.shownSince = nowMs;
  }
  return mem.shown;
}
