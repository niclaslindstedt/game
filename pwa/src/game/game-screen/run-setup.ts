// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Building one run's engine state: the seed and dev URL overrides, the
// resume/checkpoint/fresh-createGame decision, the BOT VIEW arrival hero,
// the `?scenario=` mutation, the per-character story ledger seeding, the
// opening-skip + music arming branches, the autoplay bot, the fast-forward
// speed, and the `?debug` window hooks. GameScreen calls createRunSession
// once per run effect and wires the result into the loop.

import type { MutableRefObject } from "react";

import {
  applyScenario,
  BOT_PROFILES,
  createRunFromParams,
  BOT_STRATEGIES,
  createBot,
  debug,
  runLevelDef,
  hasLevel,
  markThoughtsSeen,
  muteDialogue,
  skipCutscene,
  skipStoryOpening,
  warn,
  type Bot,
  type BotProfile,
  type BotStrategy,
  type CarDamage,
  type Difficulty,
  type GameState,
  type RunParams,
  type ScenarioSpec,
} from "@game/core";

import { botViewSpec } from "../bot-view-specs.ts";
import { washCar } from "../car-condition.ts";
import { cloneGameState } from "../checkpoint.ts";
import {
  characterCacheSlots,
  characterPurse,
  campaignChainFor,
  clearedLevelsFor,
  hasMetMerchant,
  seenThoughts,
  type Character,
} from "../characters.ts";
import { DEMO_BOT_SPEC, DEMO_GAME_SPEED } from "../demo.ts";
import { pauseMusic, playLevelMusic } from "../music/index.ts";
import { buildBotViewLoadout } from "../seed-characters.ts";
import { armedLootMode } from "../session-intent.ts";
import { getSettings } from "../settings.ts";
import { runDaylight } from "../time-of-day.ts";
import type { PlayerAction } from "../render.ts";
import { openingSeenFor, type RunCheckpoint } from "./run-progress.ts";

import { runCommand } from "../run-commands.ts";

// Fast-forward ceiling: the most the `?speed=` param / `__speed` debug hook may
// crank the sim clock. High enough to blitz a bot playtest, capped so a single
// frame's step burst stays bounded (the game loop's own maxStepsPerFrame is the
// hard backstop).
const MAX_SIM_SPEED = 16;

/** A pinned weapon pose (?debug `window.__swing`) — see the weapon-swing dev
 * script and the `weapon-system` skill. */
export type DebugPose = {
  kind: PlayerAction["kind"];
  weaponClass: PlayerAction["weaponClass"];
  t: number;
  arc?: number;
  range?: number;
} | null;

declare global {
  interface Window {
    /** ?debug hook: pin the held weapon to a fixed swing fraction. */
    __swing?: (o: DebugPose) => void;
    /** ?debug hook: fast-forward the sim N× (clamped to MAX_SIM_SPEED). */
    __speed?: (f: number) => void;
    /** ?debug hook: slow-motion — scale the sim clock (0.1 = tenth speed). */
    __timeScale?: (f: number) => void;
    /** ?debug hook: detonate the screen-clearing NUKE's FX at the hero. */
    __nuke?: () => void;
    /** ?debug hook: play the LEVEL-UP light-explosion FX at the hero (no ding). */
    __levelup?: () => void;
  }
}

/** The run's live speed/pose tuning, mutated by the `?debug` window hooks
 * (`__speed`, `__timeScale`, `__swing`) and read by the loop each frame. */
export type RunTuning = {
  /** FAST-FORWARD: run the whole run N× faster by simulating more fixed
   * steps per frame — genuinely advancing the game quicker, deterministic. */
  simSpeed: number;
  /** Slow-motion: scales the step SIZE (0.1 = tenth speed) for animation
   * tuning — the OPPOSITE of fast-forward. A neutral 1 in normal play. */
  timeScale: number;
  /** A pinned swing/shot pose overriding the live hero action, or null. */
  debugPose: DebugPose;
  /** Latched by the `?debug` `window.__nuke()` hook; the loop injects one
   * screen-clearer `nuke` event post-step, then clears it. */
  nukePending: boolean;
  /** Latched by the `?debug` `window.__levelup()` hook; the loop plays the
   * level-up light-explosion FX (shockwave + burst + flash + fanfare) post-step
   * WITHOUT actually dinging, then clears it. */
  levelUpPending: boolean;
};

export type RunSession = {
  state: GameState;
  /** The level this run actually plays (after the `?level=` dev override). */
  runLevelId: string;
  /** True when this mount adopted a run parked in memory (menu CONTINUE). */
  resumed: boolean;
  /** Whether this mount should capture the combat-start retry checkpoint (a
   * run started from scratch — not resumed, not adopted from a checkpoint). */
  captureCheckpoint: boolean;
  /** Whether this run actually SHOWS its opening (or already has it banked) —
   * false for a dev warp, a `?scenario=` staging, and a muted run, whose
   * combat start must NOT stamp the opening "seen" on the character: a level
   * warped into once would otherwise skip its real first-visit story forever
   * (see run-progress.ts, where every `markStorySeen` reads this). */
  openingPlayed: boolean;
  /** The developer BOT VIEW / `?bot=` playtest bot, or null. */
  bot: Bot | null;
  tuning: RunTuning;
  /** Dismiss the level intro and roll the level theme — the run's opener,
   * shared by the title card, the keyboard advance, and the bot. */
  beginRun: () => void;
  seed: number;
  /**
   * The character behind this run is HARDCORE — read by the run driver
   * for an ADOPTED run, whose `params` below are null. A BUILT run carries the
   * same fact on `params.hardcore`; a spectator carries false (they host
   * nothing).
   */
  hardcore: boolean;
  /**
   * WHAT THIS RUN WAS BUILT FROM — the description a session server would need
   * to build the same one.
   *
   * Null when the run was ADOPTED rather than built: a parked run resumed from
   * the menu, or a checkpoint a RETRY dropped back into. Neither is describable
   * by parameters, so a session hosting one has to be handed the state itself
   * (see `freezeRun` and `SessionOptions.adopt`).
   */
  params: RunParams | null;
};

export function createRunSession(deps: {
  levelId: string;
  difficulty: Difficulty;
  characterRef: MutableRefObject<Character>;
  /** The parked engine state to adopt on this mount, consumed here. */
  resumeRef: MutableRefObject<GameState | null>;
  checkpointRef: MutableRefObject<RunCheckpoint | null>;
  botView: boolean;
  demo: boolean;
  /** Warp-in (PLAYGROUND's SELECT LEVEL): skip the whole opening. */
  skipOpening: boolean;
  runId: number;
  /**
   * SPECTATING somebody else's session: the state the net client already built
   * from the welcome, adopted whole.
   *
   * It short-circuits everything below, and that is the point rather than a
   * shortcut. A spectator's run was not built here, is not theirs to mutate,
   * and every construction-time step in this file — seeding the story ledger,
   * `?scenario=`, the autoplay bot, the opening skips, the checkpoint — either
   * edits a replica the server will overwrite or books somebody else's progress
   * onto this hero.
   */
  spectate?: GameState | null;
  /**
   * ARRIVE AT THE WHEEL — the far side of the DRIVE home (drive-screen/).
   *
   * A ref rather than a prop because the fact belongs to the CROSSING, not to
   * the mount: the drive sets it as it hands the trip back and this build
   * consumes it, so an ordinary walk into the garage a minute later is on foot
   * exactly as it always was.
   */
  arriveInCarRef?: MutableRefObject<boolean>;
  /** A thought the hero arrived still having — the DRIVE's verdict on the trip
   * in, spoken as the first page of this level's opening monologue. Consumed
   * on the same arrival that set it. */
  arrivalThoughtRef?: MutableRefObject<string | undefined>;
  /** THE WAGON AS THE ROAD LEFT IT (`RunParams.car`) — carried on a ref for the
   * same reason the two above are: it is a fact about the CROSSING. Consumed
   * here, so walking into the garage on foot next time mints whatever that
   * level's own car already was. */
  arrivalCarRef?: MutableRefObject<CarDamage | undefined>;
}): RunSession {
  if (deps.spectate) return spectatorSession(deps.spectate, deps.runId);
  const {
    levelId,
    difficulty,
    characterRef,
    resumeRef,
    checkpointRef,
    botView,
    demo,
    skipOpening,
    runId,
  } = deps;

  // Dev/playtest handles: `?seed=` pins the run's layout, `?level=` jumps
  // to any catalog level (see docs/configuration.md).
  const params = new URLSearchParams(window.location.search);
  const seedParam = Number(params.get("seed"));
  const seed =
    Number.isInteger(seedParam) && seedParam > 0
      ? seedParam & 0x7fffffff
      : Date.now() & 0x7fffffff;
  // `?level=` is a dev override that jumps to any catalog level and bypasses
  // the campaign unlock gate; otherwise the run starts on the picked level.
  const levelParam = params.get("level");
  // `hasLevel`, not the shipped `LEVELS` record: a MOD's venues arrive through
  // `registerDefs` (pwa/src/game/mods.ts) and never join that record, so
  // testing against it silently ignored `?level=<a mod's level>` and started
  // the campaign's first map instead — which is the one thing a mod author
  // driving the playtest harness is trying to do.
  const devLevel = levelParam && hasLevel(levelParam) ? levelParam : null;
  const runLevelId = devLevel ?? levelId;
  // Resuming a run parked in memory (exited to the menu from the pause
  // screen): adopt the frozen engine state as-is. Consumed once — a RETRY /
  // NEXT LEVEL later in this mount falls back to a fresh createGame.
  const resumed = resumeRef.current;
  resumeRef.current = null;
  // A retry checkpoint captured for THIS level: RETRY after a death adopts a
  // fresh copy of it (combat-start of this level) rather than replaying the
  // whole opening. Only consulted when not resuming a parked run from the
  // menu; a checkpoint for a different level (a stale one from before NEXT
  // LEVEL) does not apply and is left to be superseded.
  const checkpoint =
    !resumed && checkpointRef.current?.levelId === runLevelId
      ? checkpointRef.current.state
      : null;
  // The carry-over: the character's persistent build. The hero arrives with
  // the exact level, stats and items they carry right now — into any level,
  // any difficulty. A brand-new hero (no banked build yet) starts from the
  // authored fresh start (level 1, the difficulty's wall weapon).
  // BOT VIEW drops a REALISTIC arrival hero (leveled + rolled gear for this
  // map/difficulty) so the watched autopilot plays the level as an arriving
  // player would, not from the character's own build. The chosen BOT SPEC
  // (DEVELOPER → PLAYGROUND → BOT VIEW → BOT SPEC) picks the whole showcase: the arrival
  // hero's weapon/gear lane here, and the bot's stat picks + posture below.
  // The demo pins the melee showcase; the developer BOT VIEW honours the
  // picked BOT SPEC.
  const botViewChoice = botView
    ? botViewSpec(demo ? DEMO_BOT_SPEC : getSettings().botViewSpec)
    : null;
  const botViewLoadout = botViewChoice
    ? buildBotViewLoadout(runLevelId, difficulty, botViewChoice.build)
    : null;
  // Autoplay: the engine bot steers instead of the pointer and spends level-ups
  // itself. Turned on by DEVELOPER → PLAYGROUND → BOT VIEW (the chosen BOT SPEC's posture +
  // stat lane) or the `?bot=<strategy>` URL param. An optional
  // ?botProfile=<build> (melee/ranged/magic/balanced/auto) commits the hero to a
  // stat-distribution build — a lane, or the even `balanced` spread. See the
  // playtest skill.
  //
  // Decided BEFORE the run is built, because whether a bot is steering is a
  // RUN PARAMETER (it mutes the dialogue) rather than something done to the run
  // afterwards. `createBot` touches no state, so it costs nothing to know early.
  const requested = params.get("bot");
  const requestedProfile = params.get("botProfile");
  const profile =
    requestedProfile && (BOT_PROFILES as string[]).includes(requestedProfile)
      ? (requestedProfile as BotProfile)
      : "meta";
  // BOT VIEW plays the picked spec (its posture + stat lane); a `?bot=` playtest
  // uses the requested strategy and ?botProfile.
  const bot = botViewChoice
    ? createBot(botViewChoice.strategy, botViewChoice.profile)
    : requested && (BOT_STRATEGIES as string[]).includes(requested)
      ? createBot(requested as BotStrategy, profile)
      : null;

  // The opening skips only for a level this hero has FINISHED on this
  // difficulty: a run that died or was abandoned partway still owes its
  // story, so the next entry tells it again (the mid-fight RETRY is
  // unaffected — it adopts the combat-start checkpoint and never rebuilds
  // the opening). Which is a RUN PARAMETER, not something done to the run
  // afterwards. The HUB is the one exception: home never "completes", so its
  // opening — the campaign's own prelude — skips once witnessed instead of
  // replaying on every LOAD.
  // …asked through the rule an IN-SESSION crossing shares with it: the host's
  // app answers the same question for the destination it hands the session.
  const openingSeen = openingSeenFor(
    characterRef.current,
    runLevelId,
    difficulty,
  );
  // `?scenario=<json>` stages an exact situation on a run built from scratch,
  // and it is applied AFTER the run is built. A run that is about to be staged
  // therefore skips nothing here, exactly as before: the staging decides where
  // it lands, and the music chain below reads the phase the spec left.
  const scenarioParam = params.get("scenario");
  const wantsScenario = Boolean(scenarioParam) && !resumed && !checkpoint;

  /**
   * EVERYTHING THIS RUN IS BUILT FROM — the arguments AND the things the app
   * used to do to the state afterwards.
   *
   * It is one object rather than a series of calls because the same parameters
   * have to be able to build the same run in the session server and in an
   * arriving client's renderer (`createRunFromParams`, `engine/game/session-setup.ts`).
   * **A field added here and not to `RunParams` is a desync**, and it will
   * present as a replication bug rather than as the missing line it is.
   */
  const runParams: RunParams = {
    seed,
    levelId: runLevelId,
    difficulty,
    loadout: botViewLoadout ?? characterRef.current.loadout ?? null,
    respec: false,
    // Campaign progress the engine gates drops on (the bunker key stays latent
    // until Boot Hill is cleared on this difficulty).
    clearedLevels: clearedLevelsFor(characterRef.current, difficulty),
    // Met the trader here before? He's set up at the door from the start, so a
    // restart-after-death can walk over and repair.
    merchantDiscovered: hasMetMerchant(
      characterRef.current,
      runLevelId,
      difficulty,
    ),
    // THE CACHE — how deep a chest Ruth has paid this hero, which is the
    // DEEPEST she ever has and never this rung's. It survives a death, an
    // abandoned run and a fresh difficulty: furniture is not re-earned, and a
    // gentler rung does not take rows back off a stash the player has filled.
    // The engine still only stands it where the carve gave it a spot.
    cacheSlots: characterCacheSlots(characterRef.current),
    // AT THE WHEEL, when the trip in was the drive home — he pulls onto his own
    // drive in the car he left GOODCO in, rather than being stood beside it.
    startInCar: deps.arriveInCarRef?.current === true,
    // …AND THE CAR HE ARRIVED IN, dents and all — the machine this level is
    // about to mint off its own `car` landmark is the one he has been driving
    // all night (engine/game/vehicles.ts `applyCarDamage`).
    car: deps.arrivalCarRef?.current,
    // WHAT HE MADE OF THE TRIP IN — the drive's own reading of it
    // (`driveVerdict`), spoken before the level's own briefing.
    arrivalThought: deps.arrivalThoughtRef?.current,
    // THE CAMPAIGN CHAIN the hero carries (quests/campaign.ts), seeded before
    // anything reads the quest log so a chain's gate, a giver's head mark and
    // the tracker are all correct on the first frame.
    campaignQuests: campaignChainFor(characterRef.current, difficulty) ?? null,
    // Fund the purse from the hero's FULL banked wealth: the loadout's banked
    // coins PLUS any store credit still held as `pendingCoins` (a brand-new
    // hero who bought coins before ever banking a loadout — see characters.ts
    // `characterPurse`). `applyLoadout` restores only `loadout.coins`, so
    // without this the store-bought credit — shown as the hero's PURSE on the
    // coin-store screen — is unspendable in the run: AUTO PILOT reads
    // `state.players[0].coins` and would show 0 / "CAN'T AFFORD" while the menu
    // shows billions. The end-of-run bank already includes the pending (see
    // `recordVictory`/`bankLoadout`'s `coinsIncludePending`), so it is not
    // folded in a second time. BOT VIEW / demo fly a synthetic loadout rather
    // than the hero's purse and pass null.
    coins: botView || demo ? null : characterPurse(characterRef.current),
    // Already-read inner monologues are pre-marked so a die-and-retry loop does
    // not replay them.
    seenThoughts: seenThoughts(characterRef.current, difficulty),
    // THE KEEPSAKES HE ARRIVED CARRYING — the RIFT CREATOR among them, which is
    // what lets him tear a seam home mid-run. Banked on the CHARACTER across
    // every run, so the roster is the only thing that knows and the run has to
    // be told (engine/game/rift-tool.ts).
    keepsakes: characterRef.current.keepsakes ?? [],
    openingSkip: wantsScenario
      ? "none"
      : skipOpening
        ? "all"
        : openingSeen
          ? "story"
          : "none",
    muteDialogue: bot !== null,
    // WHAT TIME IT IS (see ../time-of-day.ts). A run parameter rather than
    // something the renderer works out per frame, because the whole party has
    // to be in the same night and the engine may not read a clock. The visit
    // that plays a venue's opening is the story's own night — home is dark the
    // evening Ada goes out for chips — and every visit after it keeps the
    // player's own hours. Only a venue with a `sky` reads it at all.
    daylight: runDaylight(params, !openingSeen),
    // THE SESSION'S LOOT RULE, read from the armed HOST intent WITHOUT
    // consuming it — the run is built here and the doors are opened later, in
    // the driver. Undefined (every single-player run, and every hosted game
    // left on the default) is free-for-all.
    lootMode: armedLootMode(),
    // The hardcore admission gate: a hardcore character's session admits only
    // hardcore characters. The engine ignores this — it feeds the door.
    hardcore: characterRef.current.hardcore === true,
  };

  const state =
    resumed ??
    (checkpoint ? cloneGameState(checkpoint) : createRunFromParams(runParams));
  // …AND THE OTHER HALF OF THE WAGON'S CONDITION FOLLOWS THE FIRST. A run BUILT
  // FROM PARAMETERS with no car handed to it has a factory-straight machine on
  // it by construction (`createCar`) — a fresh campaign, a RETRY off a
  // checkpoint's build, a level picked from the menu — so the blood has to come
  // off with the dents, or the next campaign's first trip out starts in a clean
  // car wearing somebody else's night. A RESUMED field and a CHECKPOINT are
  // left alone: both hold a car that is already whatever the run made of it.
  if (!resumed && !checkpoint && deps.arrivalCarRef?.current === undefined) {
    washCar();
  }
  // One arrival, one seat: consumed here so the next visit to the hub is on
  // foot like every other.
  if (deps.arriveInCarRef) deps.arriveInCarRef.current = false;
  if (deps.arrivalThoughtRef) deps.arrivalThoughtRef.current = undefined;
  if (deps.arrivalCarRef) deps.arrivalCarRef.current = undefined;

  // A run started from scratch (not resumed from the menu, not adopted from a
  // checkpoint that already froze it): capture the combat-start checkpoint
  // once this mount, superseding any stale one from an earlier level.
  const captureCheckpoint = !resumed && !checkpoint;
  // Does this run SHOW its opening (or carry it already banked)? A dev warp
  // (`skipOpening`), a `?scenario=` staging and a muted run all reach combat
  // without ever putting the story on stage, so their progress events must not
  // stamp the opening "seen" — that stamp is what made a warped-into level
  // skip its real first-visit intro forever. An adopted run (resume /
  // checkpoint) settled the question on the mount that built it.
  const openingPlayed =
    resumed !== null || checkpoint !== null
      ? true
      : !skipOpening && !wantsScenario && !state.dialogueMuted;
  // The per-character story ledger, for the two paths the PARAMETERS do not
  // build: a resumed or checkpointed state is adopted whole, so the thoughts
  // this hero has already read are seeded into it here rather than at creation
  // (a post-victory RETRY must not replay a late kill/sight beat either). A
  // fresh run already carries them — `markThoughtsSeen` is idempotent, so
  // saying so twice costs nothing and keeps the rule in one place.
  markThoughtsSeen(state, seenThoughts(characterRef.current, difficulty));
  // `?scenario=<json>` (dev/test): mutate the fresh run into an exact
  // situation — position, hp, gear, spawns (see docs/configuration.md and
  // the test-scenario skill). Resumed/checkpointed runs already lived past
  // their opening, so the spec only applies to a run built from scratch.
  let scenarioApplied = false;
  if (wantsScenario && scenarioParam) {
    try {
      applyScenario(state, JSON.parse(scenarioParam) as ScenarioSpec);
      scenarioApplied = true;
      debug(`scenario applied: ${scenarioParam}`);
    } catch {
      warn(`?scenario= is not valid JSON — ignored: ${scenarioParam}`);
    }
  }
  debug(`run ${runId} started (seed ${seed}, ${difficulty})`);

  // The run's music: the level theme rolls once the intro is dismissed and
  // stops for the end-of-run jingles (victory/defeat events).
  const beginRun = () => {
    // A LIVE verb, so it travels: the title card is tapped while the run is
    // already going, unlike the two construction-time skips below.
    runCommand(state, "dismissIntro");
    playLevelMusic(runLevelDef(state).music);
  };

  // In debug mode (?debug) the live state is reachable from the console /
  // automated playtests, and `__scenario(spec)` re-shapes the live run from
  // DevTools. See the debug-game and test-scenario skills.
  if (params.has("debug")) {
    const dev = window as {
      __game?: GameState;
      __scenario?: (spec: ScenarioSpec) => void;
      __talent?: (id: string, rank?: number) => void;
    };
    dev.__game = state;
    dev.__scenario = (spec) => applyScenario(state, spec);
    // Talent tuning hook: `window.__talent(id, rank)` trains the named passive
    // talent to `rank` (default its max) on the LIVE run so its always-on FX —
    // the magic tree's orbiting flames / storm / seeker orbs / singularity /
    // immolation aura, or a proc/aura talent's cue — can be eyeballed without
    // levelling into it (rank 0 untrains it). The rank is clamped to the def's
    // `maxRank` and an unknown id is ignored (it reuses `applyScenario`'s talent
    // block; `syncItemSpells` re-derives the conjurations on the next tick).
    // Replaces the retired `window.__cast`; drives the `talent-preview` dev
    // script — see the `talent-fx` skill and docs/configuration.md.
    dev.__talent = (id, rank) =>
      applyScenario(state, {
        talents: { [id]: rank ?? Number.MAX_SAFE_INTEGER },
      });
  }

  // Autoplay mutes the in-world dialogue: with the engine bot steering there
  // is nobody to read (or tap through) the arrival scenes, last words,
  // thoughts, lore, companion joins and merchant greeting — un-muted they'd
  // freeze the run in the `dialogue` phase and flash one page per tick as the
  // bot clicks through them. Muting latches `state.dialogueMuted` so those
  // scenes never enter the stage at all (BOT VIEW and the `?bot=` playtests
  // watch the fight, not the story). A FRESH run is already muted by its own
  // parameters; this catches the two paths that adopt a state instead.
  if (bot) muteDialogue(state);

  if (resumed) {
    // Back from the menu: the run was frozen on the pause screen and the
    // menu played the title theme over it. Re-arm this level's theme but
    // keep it paused, so the player lands on the same PAUSED overlay and one
    // tap resumes both the sim and the music in place.
    playLevelMusic(runLevelDef(state).music);
    pauseMusic();
  } else if (checkpoint) {
    // Straight back into the fight: the checkpoint is already in the
    // `playing` phase, past the prelude and intro, so just roll the level
    // theme — no cutscene, no monologue, no scripted strike to sit through.
    playLevelMusic(runLevelDef(state).music);
  } else if (scenarioApplied && state.phase === "playing") {
    // A scenario that skipped the opening starts mid-run by construction:
    // roll the level theme, nothing left to dismiss.
    playLevelMusic(runLevelDef(state).music);
  } else if (skipOpening) {
    // Warp-in from the developer SELECT LEVEL: bail the whole opening and
    // drop straight into play. skipCutscene lands the prelude on the level
    // `title` card, then beginRun's dismissIntro carries it into `playing` —
    // the same shortcut the keyboard and headless bot use, done up front.
    // CONSTRUCTION, not play: these two run before the loop exists, on a state
    // nothing else is holding yet, so they are direct engine calls rather than
    // commands. On the net path the session applies its own opening skips at
    // creation, from the same session parameters.
    if (state.phase === "cutscene") skipCutscene(state);
    beginRun();
  } else if (openingSeen) {
    // A level already CLEARED on this difficulty (or the hub, once its
    // opening has been watched): skip the prelude, the intro monologue and
    // the scripted opening strike, arming the hero — but land on the
    // level-name TITLE card, not in play. The card is orientation rather
    // than story (arriving from the garage with no announcement read as a
    // bug), and its tap/auto-advance runs beginRun, which rolls the level
    // theme exactly as a first visit does.
    skipStoryOpening(state);
  }

  // FAST-FORWARD: `?speed=<n>` (or the ?debug `window.__speed(n)`) runs the
  // whole run N× faster by simulating more fixed steps per frame — genuinely
  // advancing the game quicker, so a `?bot=` playtest clears a level in a
  // fraction of the wall-clock time. This is the OPPOSITE of `__timeScale`:
  // fast-forward runs MORE steps at the same step size (deterministic — a
  // fast-forwarded bot run is identical to a real-time one), while
  // `__timeScale` slows by scaling the step SIZE. Clamped to [1, MAX_SIM_SPEED].
  //
  // The BASE speed is the player's persisted GAME SPEED choice (SETTINGS →
  // GAME SPEED, chosen before the run). An automated bot playtest can OVERRIDE
  // it higher via `?speed=` (and `__speed` retunes live). See
  // docs/configuration.md.
  // The demo always runs real-time so it reads as play; the developer BOT
  // VIEW honours the picked GAME SPEED fast-forward.
  const tuning: RunTuning = {
    simSpeed: demo
      ? DEMO_GAME_SPEED
      : Math.min(getSettings().gameSpeed, MAX_SIM_SPEED),
    timeScale: 1,
    debugPose: null,
    nukePending: false,
    levelUpPending: false,
  };
  const speedParam = Number(params.get("speed"));
  if (Number.isFinite(speedParam) && speedParam > 1) {
    tuning.simSpeed = Math.min(speedParam, MAX_SIM_SPEED);
  }
  if (params.has("debug")) {
    // Weapon-swing tuning hook: `window.__swing({kind, weaponClass, t})` PINS
    // the held weapon to a fixed fraction `t` (0..1) of its swing arc so a
    // screenshot can sample the animation frame by frame; `null` clears it
    // and hands the weapon back to the live attack. For a melee swing, passing
    // `arc` (the weapon's cone, rad) and `range` (its reach, world px) shapes
    // the blade's sweep AND draws the matching slash cone pinned at the same
    // fraction. Paired with the `weapon-swing` dev script — see the
    // `weapon-system` skill and docs/configuration.md.
    window.__swing = (o) => {
      tuning.debugPose = o;
    };
    window.__speed = (f) => {
      tuning.simSpeed =
        Number.isFinite(f) && f >= 1 ? Math.min(f, MAX_SIM_SPEED) : 1;
    };
    // Slow-motion tuning hook: `window.__timeScale(f)` scales the simulation
    // clock — 0.1 runs the whole run (steering, swings, slash cones, muzzle
    // flashes, mob motion) at a tenth speed so a fast animation can be
    // eyeballed or screenshotted frame by frame, 1 restores real time. It
    // slows the SIM, not the render, so it costs nothing and stays
    // deterministic. See the `weapon-system` skill and docs/configuration.md.
    window.__timeScale = (f) => {
      tuning.timeScale = Number.isFinite(f) && f > 0 ? f : 1;
    };
    // Nuke FX tuning hook: `window.__nuke()` sets off a real screen-nuke at the
    // hero WITHOUT the rare pickup — the canvas shockwave/embers/scorch, the
    // full-screen CSS flash/fire/smoke overlay (createNukeFx), AND the caught
    // mobs burning up into smoking charred skeletons — so the whole detonation
    // can be eyeballed or screenshotted (pair with __timeScale to slow it). The
    // loop runs the detonation post-step (see GameScreen). Drives the
    // `nuke-preview` dev script. See the `visual-effects` skill and
    // docs/configuration.md.
    window.__nuke = () => {
      tuning.nukePending = true;
    };
    // Level-up FX tuning hook: `window.__levelup()` plays the whole ding
    // SPECTACLE at the hero WITHOUT actually leveling — the light shockwave that
    // hurls the horde, the world-anchored burst + rings + sparkle-stars, the
    // full-screen flash/bloom/rays/pillar overlay, the golden burn, and the
    // fanfare — so the explosion of light can be eyeballed or screenshotted
    // (pair with __scenario for a horde, __timeScale to slow it). It plays at
    // the hero's OWN level's intensity (levelup-intensity.ts), so stage a level
    // via __scenario to preview a dim early ding vs the full one at the cap.
    // No stat points are granted, so the chooser modal never opens. The loop
    // runs it post-step (see GameScreen). Drives the `levelup-preview` dev
    // script. See the `visual-effects` skill and docs/configuration.md.
    window.__levelup = () => {
      tuning.levelUpPending = true;
    };
  }

  return {
    state,
    runLevelId,
    resumed: resumed !== null,
    captureCheckpoint,
    openingPlayed,
    bot,
    tuning,
    beginRun,
    seed,
    // The hardcore door gate for an ADOPTED run: the parameters below are
    // null for one, so the driver reads the hosting character's mode from
    // here instead.
    hardcore: characterRef.current.hardcore === true,
    // The parameters describe a run that was BUILT. An adopted one is not
    // described by them and must not pretend to be: handing a session the
    // parameters of a run it is not simulating is a client carving one map and
    // playing on another.
    params: resumed || checkpoint ? null : runParams,
  };
}

/**
 * The run a SPECTATOR watches.
 *
 * Everything this hands back is deliberately inert. The state came off the wire
 * and the session that owns it is on somebody else's machine, so there is no
 * seed to pin, no bot to run, no checkpoint to capture and no parameters to
 * describe it with (`params: null` is the same answer a parked run gives, and
 * for the same reason — a session must never be handed the parameters of a run
 * it is not simulating).
 *
 * The one thing it does is roll the level's music, because a watcher who can
 * hear the fight is watching a game and one who cannot is watching a diagram.
 */
function spectatorSession(state: GameState, runId: number): RunSession {
  debug(`run ${runId} joined as a spectator (${state.level.id})`);
  playLevelMusic(runLevelDef(state).music);
  return {
    state,
    runLevelId: state.level.id,
    // Not "resumed": that word means a run parked on THIS device, and it is
    // what tells the loop to land on the paused overlay. A joined run is live.
    resumed: false,
    captureCheckpoint: false,
    // A spectator banks nothing anyway; the flag is inert here.
    openingPlayed: false,
    bot: null,
    tuning: {
      // REAL TIME, always. The session owns the clock; a spectator running its
      // loop at 4× would only send four times as many inputs nobody applies.
      simSpeed: 1,
      timeScale: 1,
      debugPose: null,
      nukePending: false,
      levelUpPending: false,
    },
    // The intro belongs to whoever is playing. A spectator's tap must not
    // dismiss it — the verb is refused by the session anyway, and a local
    // no-op is the honest thing to hand the title card.
    beginRun: () => {},
    seed: 0,
    hardcore: false,
    params: null,
  };
}
