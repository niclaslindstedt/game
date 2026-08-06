// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// A RUN IS NOT `createGame(params)` — and this module is the correction.
//
// The whole STATIC replication tier rests on one claim: the client's own
// `createGame` produces the same world the server's did, so the first delta is
// nearly empty. That claim is TRUE of `createGame` and was FALSE of a RUN,
// because the app performed several more mutations before the first tick — it
// seeded the hero's campaign quest chain, funded his purse from his whole
// banked wealth, marked the inner monologues he had already read, skipped an
// opening he had already watched on this difficulty, and muted the dialogue for
// a bot run. None of those could be expressed as session parameters, so a
// session built from them would have held a hero with no campaign chain, an
// empty purse, unread thoughts made unread again, and an opening the player has
// sat through four times playing a fifth — and the client's first delta would
// have carried every one of those as a "correction" to a run that was right to
// begin with.
//
// **THE RULE THIS MODULE EXISTS TO ENFORCE: ANYTHING THE APP DOES TO A RUN
// BEFORE ITS FIRST TICK IS A SESSION PARAMETER, NOT APP CODE.** A field added to
// the app's run setup and not to `RunParams` is a desync, and it will present as
// a replication bug three rooms into a level rather than as the missing line it
// is. That is why this is ONE function called by all three: the app builds a
// fresh run with it, the session server builds its authoritative run with it,
// and an arriving client rebuilds the same run with it.
//
// **WHAT DELIBERATELY DOES NOT LIVE HERE.** A `?scenario=` is a developer
// staging hook applied to a local run and never travels (a session that could be
// handed an arbitrary scenario is a session a client could stage). And a PARKED
// RUN or a CHECKPOINT RESTORE is not built from parameters at all — it ADOPTS an
// arbitrary `GameState`, which is a different door into the session and a
// separate piece of work, deliberately not handled here.

import { createRngFromState, rngState } from "@game/lib/rng.ts";

import { createGame } from "./create.ts";
import { enterCar } from "./vehicles.ts";
import { dismissIntro, skipCutscene, skipStoryOpening } from "./items/flow.ts";
import { seedCampaignQuests } from "./quests/campaign.ts";
import { markThoughtsSeen, muteDialogue } from "./story.ts";
import type { CampaignQuestSave } from "./quests/campaign-save.ts";
import type {
  BuildSnapshot,
  Difficulty,
  GameState,
  Loadout,
} from "./types/index.ts";

/**
 * How much of a run's opening to skip before the first tick.
 *
 * Three states rather than a boolean, because the two skips are different
 * verbs with different landing places and conflating them is how a warp-in ends
 * up sitting on a title card nobody asked for.
 */
export type OpeningSkip =
  /** Play the whole thing — the prelude, the monologue, the scripted strike. */
  | "none"
  /** The hero has already watched this level's opening on this difficulty (a
   * die-and-retry loop): skip the prelude, the monologue and the opening
   * strike, arming him, and land on the level-name `title` card — the splash
   * is orientation, not story, so even a replay announces where it starts. */
  | "story"
  /** A developer warp-in: bail the prelude and dismiss the intro straight into
   * the run. */
  | "all";

/**
 * Everything a run is built from — the arguments AND the six things the app
 * used to do afterwards.
 *
 * `server/wire/protocol.ts`'s `SessionParams` is structurally this.
 *
 * **IT IS WRITTEN IN THE WIRE'S TERMS ON PURPOSE** — `difficulty` a string,
 * `loadout` and `campaignQuests` opaque, `openingSkip` a string — so a
 * `SessionParams` is assignable to it with no conversion at all. The wire leaf
 * may not import the engine, so a conversion would be a THIRD copy of this
 * shape maintained by hand, and the field somebody forgets to copy is exactly
 * the desync this module exists to prevent. The casts happen once, below.
 */
export type RunParams = {
  /** The run's seed. Every rng stream in the level is derived from it. */
  seed: number;
  levelId: string;
  /** The run's difficulty id (`easy` … `jesus`). */
  difficulty: string;
  /** The arriving hero's carry-over, or null for the authored fresh start. */
  loadout?: unknown | null;
  /** A LEVEL TOKEN respec is owed at the run's start. */
  respec?: boolean;
  /**
   * ARRIVE AT THE WHEEL rather than on foot — the far side of the DRIVE home.
   *
   * The trip back from GOODCO is played (src/game/drive/), so the hero pulls
   * onto his own drive in the car he left in; standing him beside it on arrival
   * would throw away the one thing the whole minute was about. It is a SESSION
   * PARAMETER rather than a poke at the state after `createGame`, because
   * everything the app settles about a run before its first tick has to be:
   * the app, the session and an arriving client all build the same run from the
   * same parameters, and a field only one of them applied is a desync.
   *
   * A no-op on any level whose carve pins no car.
   */
  startInCar?: boolean;
  /** Level ids the hero has already cleared on this difficulty — the engine
   * gates drops on them (the bunker key stays latent until Boot Hill falls). */
  clearedLevels?: readonly string[];
  /** The hero has already met this level's merchant on this difficulty, so the
   * trader is set up at the door from the start. */
  merchantDiscovered?: boolean;
  /**
   * HOW DEEP THE CACHE THIS CHARACTER HAS EARNED IS — the garage chest Ruth
   * pays for THE SCALE, one rung deeper each difficulty (src/game/cache.ts).
   * Seeded from the character's own high-water mark, so the chest stands in the
   * hub at its full earned depth from the first frame of every visit after the
   * one it was given in — including a fresh run on a gentler rung. 0 = not
   * earned. It still only appears where the carve gave it a spot, which is the
   * garage and nowhere else.
   */
  cacheSlots?: number;
  /**
   * The CAMPAIGN chain the hero carries (`quests/campaign.ts`), or null.
   *
   * Seeded before anything reads the quest log, so a chain's gate, a giver's
   * head mark and the tracker are all correct on the first frame.
   */
  campaignQuests?: unknown | null;
  /**
   * The hero's whole banked wealth, or null to keep whatever the loadout gave.
   *
   * A real run's purse is funded from the banked coins PLUS any store credit
   * still held as `pendingCoins`, which `applyLoadout` does not restore — a
   * synthetic run (BOT VIEW, the demo) flies a loadout rather than a purse and
   * passes null.
   */
  coins?: number | null;
  /** The inner monologues this hero has already read on this difficulty. We die
   * and replay a lot; an already-read thought is not read again. */
  seenThoughts?: readonly string[];
  /**
   * THE KEEPSAKES THIS HERO CARRIES — story-item ids banked on the CHARACTER
   * for good (`StoryItemDef.keepsake`), chiefly the RIFT CREATOR.
   *
   * A run starts with `state.storyItems` empty because that list is what THIS
   * run has found; a keepsake is what every run before it left the hero
   * holding, and the roster that knows is app-side. So it arrives the way
   * every other pre-tick fact does — as a parameter — which is also what
   * carries it to a joining client, whose own copy of the run has to agree
   * about who may tear a seam home.
   */
  keepsakes?: string[];
  /** How much of the opening to skip (an `OpeningSkip` name; anything else is
   * read as `none`, because a parameter that arrives from a wire is a claim
   * rather than a fact). */
  openingSkip?: string;
  /**
   * THE SESSION'S LOOT RULE — `free` (the default and the shipped campaign's)
   * or `allocated`. A string rather than the union because a parameter that
   * arrives from a wire is a claim rather than a fact; anything else is read as
   * `free`, which is the safe answer (nobody is locked out of anything).
   */
  lootMode?: string;
  /**
   * THE HOSTING CHARACTER IS HARDCORE. Carried here so it rides into
   * `SessionParams` with everything else a run is built from, but the ENGINE
   * NEVER READS IT — hardcore (permadeath, the keepsake stash) is app-side, as
   * it has always been. What it feeds is the session's DOOR: a hardcore game
   * admits only hardcore characters, and the handshake refuses the mismatch by
   * name (`server/wire/handshake.ts`).
   */
  hardcore?: boolean;
  /** Mute the in-world dialogue: with a bot steering there is nobody to tap
   * through the arrival scenes, so un-muted they would freeze the run in the
   * `dialogue` phase and flash a page per tick. */
  muteDialogue?: boolean;
  /**
   * HOW MUCH DAYLIGHT THE RUN STANDS IN, 0 (deep night) to 1 (broad daylight)
   * — read only by a venue with a `sky` (`src/game/daylight.ts`).
   *
   * A parameter rather than something the run works out for itself for the
   * reason every field here is one: the app reads the wall clock, the engine
   * may not, and a session whose host built its night from a clock the joiner
   * could not see would hand the two of them different pictures of the same
   * garage. Out-of-range values are clamped on read (a parameter that arrives
   * from a wire is a claim rather than a fact); absent is full daylight.
   */
  daylight?: number;
  /**
   * The build an AUTO PILOT flight already in progress engaged on.
   *
   * A FLIGHT outlives a run — the ride crosses levels — so the refund it owes
   * when it stops must revert to the build the player had before the FIRST
   * level. `startAutopilot` only stamps a run that has no baseline yet, which
   * is what keeps this one authoritative.
   */
  autopilotBuild?: unknown | null;
};

/**
 * Build a run.
 *
 * The order is the app's own and is load-bearing in two places: the campaign
 * chain is seeded before anything reads the quest log, and the opening is
 * skipped LAST, after the thoughts are marked, so a skipped opening cannot
 * replay a beat the hero has already read.
 */
export function createRunFromParams(params: RunParams): GameState {
  const state = createGame(
    params.seed,
    params.levelId,
    params.difficulty as Difficulty,
    (params.loadout as Loadout | null) ?? undefined,
    params.respec ?? false,
    params.clearedLevels ? [...params.clearedLevels] : [],
    params.merchantDiscovered ?? false,
    params.cacheSlots ?? 0,
  );
  seedCampaignQuests(
    state,
    (params.campaignQuests as CampaignQuestSave | null) ?? undefined,
  );
  // SEAT 0 IS CORRECT HERE: this runs inside `createRunFromParams`, which
  // builds the run from its session parameters BEFORE the run is handed to a
  // session — so the party is one hero by construction, and the purse the
  // parameters describe is that hero's. A joiner brings their own purse with
  // their own seat (see `seatHero`), never this one.
  if (typeof params.coins === "number") state.players[0].coins = params.coins;
  if (params.seenThoughts?.length) {
    markThoughtsSeen(state, params.seenThoughts);
  }
  if (params.keepsakes?.length) state.keepsakes = [...params.keepsakes];
  // AT THE WHEEL, if the trip in was a drive. `enterCar` is the same verb the
  // tap uses, so the seat, the lifted blockers, the running engine and the
  // `carStarted` cue are all exactly what boarding normally does — the hero has
  // simply not let go of it since GOODCO.
  if (params.startInCar) {
    const hero = state.players[0];
    const car = state.vehicles.find((v) => v.kind === "car");
    if (hero && car) {
      hero.pos.x = car.pos.x;
      hero.pos.y = car.pos.y;
      enterCar(state, hero);
    }
  }
  // THE HOUR THE RUN IS PLAYED IN. Clamped here rather than trusted, so a
  // hostile or simply wrong wire value can only ever pick a point on the day
  // the renderer already knows how to draw.
  if (typeof params.daylight === "number" && Number.isFinite(params.daylight)) {
    state.daylight = Math.min(1, Math.max(0, params.daylight));
  }
  state.autopilot.build = (params.autopilotBuild as BuildSnapshot) ?? null;
  if (params.lootMode === "allocated") state.lootMode = "allocated";
  if (params.muteDialogue) muteDialogue(state);
  applyOpeningSkip(state, params.openingSkip);
  return state;
}

/**
 * Skip as much of the opening as the parameters ask for.
 *
 * `all` is two verbs rather than one because `skipCutscene` lands the prelude
 * on the level's TITLE card — it is `dismissIntro` that carries it into play,
 * which is the same two-step the keyboard and the headless bot take.
 */
function applyOpeningSkip(state: GameState, skip: string | undefined): void {
  if (skip === "story") {
    skipStoryOpening(state);
    return;
  }
  if (skip === "all") {
    if (state.phase === "cutscene") skipCutscene(state);
    dismissIntro(state);
  }
}

// ---------------------------------------------------------------------------
// THE SECOND DOOR — adopting a run instead of building one
// ---------------------------------------------------------------------------
//
// Not every run is built from parameters. A PARKED RUN (the player left to the
// menu mid-level) and a CHECKPOINT RESTORE (RETRY after a death drops back into
// the fight rather than replaying the opening) both ADOPT an arbitrary
// `GameState` — there is no set of arguments that describes "the world exactly
// as it stood when he walked away", and there never will be.
//
// So a session can be handed one, and the pair below is how it crosses a
// process boundary: a `GameState` is plain JSON apart from its two rng
// CLOSURES, which are frozen as their stream positions and rebuilt on the far
// side — the same trick `pwa/src/game/checkpoint.ts` uses to clone a run in
// memory and `saved-run.ts` uses to write one to storage.
//
// **THIS IS NOT `saved-run.ts` AND MUST NOT BECOME IT.** That module carries a
// migration ladder because a run written to a player's disk has to survive the
// next release. Nothing here does: both ends of a wire are the same build, and
// the handshake refuses a mismatch by name before a single game byte is
// exchanged. A version ladder here would be machinery guarding against a case
// the protocol has already made impossible.
//
// **AND ADOPTING COSTS THE STATIC TIER, WHICH IS WHY IT IS THE SECOND DOOR
// RATHER THAN THE ONLY ONE.** A client rebuilds the terrain from the parameters
// and is sent only what differs; a client whose server ADOPTED a state cannot
// rebuild anything, so it has to be sent a FULL first snapshot. Host with
// parameters whenever there are parameters — see `server/session.ts`.

/**
 * A run frozen for travel: everything but the rng closures, plus their stream
 * positions and the fog grid as a plain array.
 *
 * Deliberately opaque. Nothing outside `adoptRun` should read a field off one:
 * it is a `GameState` in transit, and code that reached into it would be code
 * that has to be updated whenever the state grows a member — which is the
 * hand-written-packer failure the whole wire is designed around.
 */
export type FrozenRun = Record<string, unknown> & {
  rngState: number;
  fxRngState: number;
  goldRngState: number;
};

/**
 * Freeze a run so it can cross a process boundary.
 *
 * `explored` becomes a plain array because it is the one TYPED array on the
 * state: `JSON.stringify` turns a `Uint8Array` into an object keyed by every
 * index, which survives the trip looking like data and arrives as something
 * `step()` cannot write a byte into.
 */
export function freezeRun(state: GameState): FrozenRun {
  const { rng, fxRng, goldRng, explored, ...rest } = state;
  return {
    ...(structuredClone(rest) as Record<string, unknown>),
    // Transient per-step chatter, blanked rather than carried: a frozen run
    // must replay no stale sounds or gore on the far side. Overridden after
    // the clone rather than destructured away, because dropping it from
    // `rest` and re-adding it here says the same thing twice.
    events: [],
    explored: Array.from(explored),
    rngState: rngState(rng),
    fxRngState: rngState(fxRng),
    goldRngState: rngState(goldRng),
  };
}

/** Thaw a frozen run back into something `step()` can advance. */
export function adoptRun(frozen: FrozenRun): GameState {
  const {
    rngState: seedState,
    fxRngState,
    goldRngState,
    explored,
    ...rest
  } = frozen;
  return {
    ...(rest as unknown as GameState),
    explored: Uint8Array.from((explored as number[] | undefined) ?? []),
    events: [],
    rng: createRngFromState(seedState),
    fxRng: createRngFromState(fxRngState),
    goldRng: createRngFromState(goldRngState),
  };
}
