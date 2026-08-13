// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's mutable state: level info, spawner/pack runtimes, the autopilot
// scratchpad, and the GameState root that step() advances.

import type { DeathRiteBeat, DeathRiteId } from "../death-rites/types.ts";
import type { DifficultyMobLevels, LevelDef } from "../defs/levels/types.ts";
import type { CutsceneState } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import type {
  ChoiceState,
  Companion,
  Enemy,
  Player,
  PlayerCorpse,
} from "./actors.ts";
import type {
  ActiveTalk,
  EscortState,
  QuestGiver,
  QuestOffer,
  QuestProgress,
} from "./quests.ts";
import type {
  Difficulty,
  Equipment,
  GamePhase,
  PendingCritBlob,
  PendingProc,
  StatName,
  ViewRect,
} from "./core.ts";
import type { GameEvent, GameStats } from "./events.ts";
import type { Trade, TradeRequest } from "../trade.ts";
import type {
  Asteroid,
  BaitCharge,
  Crater,
  GravityWell,
  HayBall,
  Projectile,
  SandStorm,
  ScorchPatch,
  Stampede,
  StampedeWarn,
} from "./hazards.ts";
import type {
  Arrival,
  ArrivalPlan,
  Critter,
  Decor,
  DialogueState,
  DoorState,
  ElevatorState,
  GateState,
  LairState,
  Item,
  Landmark,
  LootMode,
  MapMarker,
  Merchant,
  Obstacle,
  PartyStamp,
  Vehicle,
  WheelDebris,
  CanopyPiece,
  TileSpec,
} from "./world.ts";

/** Static facts about the running level, snapshotted from its LevelDef. */
export type LevelInfo = {
  /** Key into LEVELS. */
  id: string;
  /** Story order (1-based). */
  index: number;
  name: string;
  width: number;
  height: number;
  /** Downward acceleration in world px/s² — lower gravity floats jumps. */
  gravity: number;
  /** Tileset/mood key for the renderer. */
  biome: string;
  /** How the renderer paints the ground for this level. */
  tiles: TileSpec;
  /** What the HUD calls this level's hostiles. */
  foes: string;
};

/**
 * Runtime state for one PLACED PACK (see `PackSpec` / stepPacks), built at
 * level creation from `LevelDef.packs` in order. A pack sleeps (`dormant`)
 * until the player closes to its trigger radius, at which point its members
 * spawn around the anchor and it goes `active`; once every spawned member is
 * dead it is `cleared`. Serialized with the run, so a resumed game remembers
 * which patches of ground are already emptied.
 */
/**
 * A SPAWN POINT's live state (parallel to `LevelDef.spawners`, see spawners.ts).
 * Dormant until the hero trips it, then it emits its `queue` a few at a time on
 * the `emitAtMs` clock until drained. A chained point watches its predecessor's
 * `drainedAtMs`.
 */
export type SpawnerRuntime = {
  /** Author id (for chaining), or null. */
  id: string | null;
  /** The spawn point's anchor (world px). */
  at: Vec2;
  triggerRadius: number;
  spawnRadius: number;
  intervalMs: number;
  perEmit: number;
  /** Concurrent-alive cap: the most of THIS point's live members allowed near
   * the hero at once. At the cap the point pauses and drips only to replace
   * kills; a member left behind (out of `approachRadius × SPAWNERS.leashMult`
   * of the hero) is counted as gone (replaced), and emission is suspended while
   * the hero is out of trigger range. */
  maxAlive: number;
  /** POST-KILL RESPAWN DELAY (ms): once at the alive cap, the wait after a
   * member dies (or is left behind) before the replacement is summoned in.
   * Resolved at level creation from `SPAWNERS.respawnDelayMs` scaled by
   * difficulty, boss proximity, and campaign progress (see create.ts). */
  respawnDelayMs: number;
  /** The live-member count from the previous tick — a drop signals a kill so the
   * respawn delay can be armed. */
  lastLive: number;
  /** The enemy defIds still to emit, resolved for the run's difficulty. */
  queue: string[];
  /** The queue's original length — the foe count still owed while it drains. */
  total: number;
  /** dormant → arming pending; active → emitting; drained → empty. */
  status: "dormant" | "active" | "drained";
  /** Sim time (ms) the point emptied, or null until then (for chaining). */
  drainedAtMs: number | null;
  /** Next emission time (sim ms) while active. */
  emitAtMs: number;
  /** `Enemy.id`s emitted so far (for "is this wave cleared?"). */
  memberIds: number[];
  /** Chain: arm after the spawner with this id drains, this long after. */
  after: string | null;
  afterDelayMs: number;
  /** This point's HARD-CODED per-difficulty mob levels (a within-map override of
   * the level default), carried so `emitBatch` scales its drip like its lingering
   * cluster. Undefined = the point uses the level's `mobLevels`. */
  mobLevels?: DifficultyMobLevels;
  /**
   * HELLGATE (config HELLGATES, `SpawnerSpec.hellgate`): the rampage STAGE this
   * point stays shut below. Absent/0 on an ordinary spawn point — which is what
   * marks it as one: every hellgate rule (the arming gate, the escalating
   * emission, the endless `refill`, the separate active budget) keys off this
   * being above 0. See spawners.ts.
   */
  openStage?: number;
  /**
   * HELLGATES only: the point's authored mob mix, kept so a drained gate can
   * RE-QUEUE it while the rampage still holds instead of closing for good.
   * Absent on an ordinary point (which drains exactly once, by design).
   */
  refill?: string[];
  /**
   * ALARM CLOCK (sim ms): while `now` is below this, the point was ALARMED by
   * a linked mob (`raiseAlarm`) and emits at the hero even though he is
   * outside its trigger radius — the squad answering the call. Cleared when
   * the window lapses (the point falls back to dormant if he never arrived).
   * Absent/null on points never alarmed. Optional so pre-alarm saved runs
   * still deserialize.
   */
  alarmedUntilMs?: number | null;
};

/**
 * One MOB POST's live slot (config MOB_SPAWNS / mob-spawns.ts): the runtime
 * half of a `MobSpawnSpec` — who is standing the post, or how long until
 * somebody is again. The parts maps' whole horde is an array of these.
 */
export type MobSpawnState = {
  /** The spec's own id — what a saved run keys the slot by. */
  id: string;
  /** The post (world px): where its mob stands, sleeps and respawns. */
  at: Vec2;
  /** Key into ENEMY_DEFS — every occupant of this post is this breed. */
  enemy: string;
  /** The RESOLVED respawn delay (ms): the authored/default base scaled for the
   * run's difficulty at creation, floored at `MOB_SPAWNS.respawnMinMs`. */
  respawnMs: number;
  /** The authored per-difficulty level band a fresh occupant is scaled by
   * (see `resolveMobScaling`); absent = the level's own. */
  mobLevels?: DifficultyMobLevels;
  /** The dormant walk a fresh occupant inherits (see `SpawnSpec.patrol`). */
  patrol?: Vec2[];
  /** The live occupant's `Enemy.id` — null while the post is vacant. */
  mobId: number | null;
  /** When the vacant post refills (sim ms) — null while it is occupied. A due
   * respawn is HELD (not cleared) while a hero stands close enough to watch. */
  respawnAtMs: number | null;
};

export type PackState = {
  /** Where the pack sits on the map — the anchor its members spawn around. */
  at: Vec2;
  /** How close (world px) the player must get to wake it. */
  triggerRadius: number;
  /** Radius (world px) members scatter within when the pack wakes. */
  spawnRadius: number;
  /** Life cycle: asleep, spawned-and-fighting, or wiped out. */
  status: "dormant" | "active" | "cleared";
  /** How many members will spawn when this pack wakes (resolved for the run's
   * difficulty at creation) — folded into the HUD foe total up front, and the
   * count still OWED while the pack is dormant (see `unspawnedMinions`). */
  total: number;
  /** `Enemy.id`s of the members spawned when the pack woke — the pack clears
   * when none of them are alive anymore. Empty until it wakes. */
  memberIds: number[];
};

/**
 * The AUTO PILOT meter (see autopilot.ts): while `active` the app feeds the
 * engine bot's steering into `step()` and fast-forwards the loop at `speed`,
 * and the engine drains the purse at `AUTOPILOT.coinsPerSecond × speed` per
 * game-second — disengaging itself (with an `autopilotStopped` event) the
 * moment the coins run out.
 */
/**
 * The hero's CHOSEN build, frozen — what an AUTO PILOT flight is measured
 * against and reverted to (see `refundAutopilotBuild`).
 *
 * It lives with the types rather than beside the function that reads it because
 * a FLIGHT outlives a run: the ride crosses levels, each level is a fresh
 * `GameState`, and the baseline therefore has to travel — as `autopilot.build`
 * on the run, seeded from `SessionParams.autopilotBuild` exactly as the hero's
 * gear is seeded from `loadout`. Held app-side alone, it could not survive the
 * simulation moving into the session server.
 */
export type BuildSnapshot = {
  stats: Record<StatName, number>;
  spentStats: Record<StatName, number>;
  talents: Record<string, number>;
};

export type AutopilotState = {
  /** The autopilot is flying the hero (and the meter is running). */
  active: boolean;
  /**
   * The build the FLIGHT engaged on, or null when no ride is in progress.
   *
   * Stamped by `startAutopilot` when the run does not already carry one, and
   * cleared by `refundAutopilotBuild` once the points are handed back. A run
   * the ride crosses INTO is handed the flight's original baseline through the
   * session parameters, so a stamp is never overwritten mid-flight — the refund
   * must revert to the build the player had before the FIRST level, not before
   * the last one.
   */
  build?: BuildSnapshot | null;
  /**
   * The SEAT that bought the ride — whose purse the meter bills, and whose
   * build the refund reverts.
   *
   * It lives on the run because `stepAutopilot` is a per-tick pass with no
   * actor to hand it, and a purse is PRIVATE: without it the meter drained
   * seat 0 whoever engaged, so a joiner's ride was paid for out of the host's
   * coins. Absent on a legacy or adopted state, which reads as seat 0 — the
   * one hero a solo run has.
   */
  seat?: number;
  /** The engaged speed rung (config `AUTOPILOT.speeds`) — scales both the
   * app's fast-forward and the per-game-second price. */
  speed: number;
  /** Fractional coins accrued but not yet deducted — whole coins leave the
   * purse, the remainder carries so no tick rounds the bill away. */
  drainCarry: number;
  /** Whole coins this RUN's meter has burned (session totals live app-side —
   * a new run starts a fresh count). */
  coinsSpent: number;
  /** Whole coins this RUN has EARNED while the ride flew — the loot the bot
   * hauled to the counter and sold (`sellItem`), which is the only way coins
   * come INTO a run. The ride's takings, booked separately from the
   * `coinsSpent` meter so the LOOT scoreboard can show what the flight brought
   * home next to what it cost. Store-bought top-ups
   * (`creditAutopilotPurse`) are NOT earnings and never land here. */
  coinsEarned: number;
};

/**
 * The running DEATH SCENE while `phase === "dying"` (see `death-scene.ts`):
 * the dramatic tableau that plays when the hero falls, before the YOU DIED
 * modal. Null in every other phase. The scene freezes the fallen hero at
 * `center`, rings the horde around him, wanders more mobs in from the screen
 * edges, and rolls clouds across the field until `ms` reaches
 * `DEATH_SCENE.durationMs` (or a tap sets `skip`), when the run drops to
 * `defeat`.
 */
export type DeathSceneState = {
  /** Ms elapsed since the hero fell — the scene's own clock, advanced each
   * tick while `dying`. Drives the mob gather, the edge spawns, and (app-side)
   * the cloud roll and blood pool. */
  ms: number;
  /** Where the hero fell — the frozen centre the horde rings and the camera
   * holds on. */
  center: Vec2;
  /** The XP the DEATH TOLL took at the fall (`applyDeathXpPenalty`), banked
   * here so the defeat splash reads it once the scene ends. Mirrors
   * `stats.xpLost`. */
  xpLost: number;
  /** Ms until the next edge-spawned mob wanders in (counts down each tick). */
  spawnCooldownMs: number;
  /** Latched by a tap (`skipDeathScene`) to end the tableau early — the next
   * `dying` tick drops straight to the defeat splash. */
  skip: boolean;
};

/**
 * THE DIM — the handover that plays once a driven car TOUCHES the level's road
 * out (`LevelDef.driveOut`), between the wheel leaving the player's hands and
 * whatever comes next. Null every other tick of the run.
 *
 * The hub's departure used to be a CUT: the bumper crossed the garage door's
 * threshold and the next frame was somewhere else. Then it was a SCENE, nearly
 * two seconds of the engine driving the car away down the tarmac under a wash
 * to black. Both are gone, and for the same reason: the thing on the far side
 * of the garage's road is the DRIVING MINIGAME, so a car driving itself is a
 * cutscene about the exact activity the player is a half-second away from
 * doing. Touching the road dims the picture and hands over — the car just
 * coasts on while it happens (`COASTING`, engine/game/vehicles.ts).
 *
 * It is engine-owned for the same reason the death scene is: it is the
 * simulation that knows where the road runs and when the trip is really booked,
 * so the whole beat stays deterministic, replicable and headless-testable, and
 * the app only paints what the clock says.
 */
export type DepartureState = {
  /** Ms elapsed since the car reached the road — the beat's own clock, advanced
   * each playing tick. The app dims the picture against it. */
  ms: number;
  /** The level the car is bound for — the `car` travel door's first
   * destination, resolved at the moment of the commit so the app need not look
   * it up again. Carried onto the `carDeparted` event when the beat ends. */
  to: string;
  /** Latched once `carDeparted` has been pushed, so the trip is booked exactly
   * once however many ticks the app takes to tear the run down. The picture
   * stays at full black from here. */
  booked: boolean;
};

/**
 * The running BOSS DEATH RITE while `phase === "bossDeath"` — the scripted
 * send-off a boss gets instead of toppling over (see `boss-death.ts`). Null in
 * every other phase. The mirror of `DeathSceneState` above, and shaped the same
 * way on purpose.
 *
 * WHY THE BOSS TRAVELS ON THE SCENE RATHER THAN STAYING IN `state.enemies`:
 * `killEnemy` splices a dead enemy out before anything downstream runs, and
 * leaving a corpse in the live list would put it back in front of every aggro
 * search, contact pass and AoE gather for the length of the rite. So the rite
 * carries what it needs to POSE the body and nothing else — which is also what
 * makes it replicate as a handful of numbers rather than as an actor.
 */
export type BossDeathState = {
  /** Ms elapsed since the killing blow — the scene's own clock.
   *
   * REAL TIME, NOT DILATED. The rite dilates the sim (`BOSS_DEATH.timeScale`)
   * so the held horde, the hero's leap and the effect layer all stretch
   * together, but this clock advances at wall rate — so a rite is always the
   * same length of real time and its beats are the real milliseconds the
   * catalog authored. Driving both off one clock makes every rite eight times
   * longer than it reads and is the easiest thing here to get wrong. */
  ms: number;
  /** Which beat is running. Latched rather than derived purely so the step can
   * fire each transition's event exactly once. */
  beat: DeathRiteBeat;
  /** The rite being performed (`DeathRiteDef.id`). */
  rite: DeathRiteId;
  /**
   * WHICH ENDING this is. A `death` rite finishes the boss where it knelt; a
   * `flight` rite is the coward's exit (`EnemyDef.flees`) — it tears a way out,
   * bolts for it, and is drawn through spinning.
   *
   * Carried on the scene rather than re-derived from the rite def because the
   * app reads it every frame to decide WHO it is drawing moving, and a lookup
   * per frame to answer a question the scene already knows is waste.
   */
  kind: "death" | "flight";
  /**
   * WHERE THE BOSS IS RIGHT NOW. Equal to `center` for the whole of a death
   * rite (the body does not move once it is on its knees) and live for a
   * flight, where the boss runs from `center` to `exit`.
   */
  bossPos: Vec2;
  /**
   * FLIGHT ONLY: the mouth of the exit it tore open — where it is running to,
   * and where it spins out of existence. Null on a death rite.
   */
  exit: Vec2 | null;
  /** The boss's def id — the app resolves its gore family and anatomy from
   * this, exactly as it does for any other body. */
  defId: string;
  /** The boss's SPRITE FAMILY (`EnemyDef.sprite`), carried rather than derived:
   * a def id is not a sprite name and the two only coincide for some bosses, so
   * building `<defId>_kneel` silently drew nothing for the rest. `bossCorpse`
   * carries its sprite for the same reason. */
  sprite: string;
  /** Where the boss fell: the rite's anchor, the ring's centre, and where the
   * camera holds. */
  center: Vec2;
  /** The boss's collision radius, so the hero's standoff is sized against the
   * body he is actually standing over rather than against a constant. */
  radius: number;
  /**
   * WHICH PLAYER is performing the rite, as an index into the party — the seat
   * whose blow felled the boss (stamped by `enterBossDeath`), so in co-op the
   * hero who landed the kill is the one who leaps while the scene is shown to
   * everybody. Solo it is always 0. Read through `bossDeathExecutioner`, which
   * falls back to seat 0 for a seat that has since emptied.
   */
  executioner: number;
  /** Where the executioner stood when the blow landed — his scripted approach
   * runs from here to the standoff, so it is a real path rather than a
   * teleport. */
  from: Vec2;
  /** The bearing the blow runs along (radians, hero → boss). The cut opens
   * along it and the wreckage is thrown down it. */
  heading: number;
  /** Latched by a press past `BOSS_DEATH.skipGraceMs` — the next tick runs the
   * rite out and hands over to the last words. */
  skip: boolean;
};

export type GameState = {
  phase: GamePhase;
  /**
   * The running prelude scene while `phase === "cutscene"` (see
   * @game/lib/cutscene and defs/cutscenes.ts); null once it played out.
   */
  cutscene: CutsceneState | null;
  /**
   * The prelude scenes still waiting behind the running one (`LevelDef.
   * prelude` as a list — the launch, then the flight). When the current
   * scene ends, the next id here starts; SKIP drops the whole queue.
   */
  cutsceneQueue: string[];
  /**
   * WHAT THIS RUN KNOWS THAT ITS SCENES DO NOT — the tags a prelude's
   * conditional dressing is matched against (`CutsceneProp.needs` / `until`).
   *
   * It lives on the STATE rather than being applied once at creation because a
   * prelude is a CHAIN: the second scene is built when the first plays out
   * (`advanceCutsceneChain`), long after the run's parameters were read, and a
   * chain whose first scene knew the house had burned and whose second did not
   * would be worse than neither knowing.
   */
  cutsceneTags: readonly string[];
  /**
   * WHERE THE RUNNING CUTSCENE CHAIN LETS GO — the phase the last scene hands
   * the stage to. A PRELUDE lands on the hero's opening monologue; a level's
   * FAREWELL (`LevelDef.farewell`) lands on the epilogue and the splash.
   *
   * It is on the state rather than worked out from the phase because by the
   * time the chain drains, "which end of the run was this" is no longer
   * visible: both are the `cutscene` phase with an empty queue.
   */
  cutsceneThen: "intro" | "victory";
  /**
   * Which page of the level's opening monologue is on screen while
   * `phase === "intro"` — the hero's black-screen briefing dialogue. Turning
   * past the last page drops into the `title` card; unused in other phases.
   * Indexes `introPages(state)`, which is the level's own monologue with any
   * ARRIVAL line in front of it.
   */
  introPage: number;
  /**
   * Which page of the level's post-victory EPILOGUE is on screen while
   * `phase === "outro"` (`LevelDef.outro` — the intro's black-screen mirror,
   * entered when the victory countdown runs out on a level that ships one).
   * Turning past the last page lands on the `victory` splash. 0 and unused
   * on levels without an outro.
   */
  outroPage: number;
  /**
   * Ms of VICTORY QUAKE left: on a level with an `outro`, clearing the
   * objective arms this alongside the victory countdown (the world shakes
   * itself apart while the hero grabs the last loot). Purely presentational —
   * the renderer jitters the camera off it; ticks down only while `playing`,
   * like the countdown it mirrors. 0 everywhere else.
   */
  quakeMs: number;
  /**
   * Developer POSE switch (set by a scenario's `freeze` — see scenario.ts):
   * while true the world's actors hold still — enemies neither move, strike,
   * nor fire, and the merchant stops wandering (so a pose can't be broken by
   * his discovery scene). The hero still moves, jumps, and fights freely.
   * Purely a staging tool for screenshots and visual judgement; nothing in
   * gameplay ever sets it.
   */
  freeze: boolean;
  /**
   * A LEVEL TOKEN respec is owed at this run's start: the hero jumped a rung
   * on a spent token, so before play begins the whole banked build is refunded
   * into a pool for a from-scratch reallocation (a Diablo-style respec). Set at
   * creation, consumed by `dismissIntro` (which enters the `respec` phase in
   * its place) and cleared by `beginRespec`; false on every ordinary run.
   */
  respecPending: boolean;
  level: LevelInfo;
  /**
   * THE MAP THIS RUN IS ACTUALLY BEING PLAYED ON — carved from the mission's
   * blueprint on the run's own seed (see `mapgen/`).
   *
   * `createGame` resolves the level through `resolveLevelDef` and then builds
   * the world from what it got — but a run keeps ASKING the level questions
   * long after creation (which zones are quiet, whose lair is this door, where
   * does the exit stand), and the CATALOG cannot answer any of them: it holds
   * the mission, which has no geometry on it at all. Parked here so
   * `runLevelDef(state)` can answer with the run's own def instead; never read
   * directly. Optional only for the synthetic states the engine tests build by
   * hand.
   */
  carvedLevel?: LevelDef;
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
  /**
   * HOW MUCH DAYLIGHT THIS RUN STANDS IN, 0 (the deep of the night) to 1 (broad
   * daylight) — read only on a venue with a `sky` (see `engine/game/daylight.ts`),
   * and ignored everywhere else.
   *
   * It is a SESSION PARAMETER rather than something the engine works out,
   * because the wall clock is the app's to read and `step()` may not touch one:
   * the host reads the hour once before the first tick and hands the number to
   * everybody, so a party spread across two time zones plays in one night
   * rather than two. Absent — every run created before this existed, every
   * headless simulation, every engine test — reads as full daylight, which is
   * exactly how those runs looked already.
   *
   * Purely presentational. Nothing in the simulation reads it: sight, aggro,
   * reach and spawns are what they are at noon.
   */
  daylight?: number;
  /**
   * WHO MAY PICK A DROP UP — the session's loot rule.
   *
   * `"free"` is free-for-all: anything on the floor goes to whoever reaches it,
   * which is Diablo 2 classic and the shipped default, because friends-only
   * sessions are the use case and the scramble for a legendary is most of what
   * makes a party feel like a party. `"allocated"` stamps each drop with a seat
   * (`Item.owner`) rolled among the heroes who were in the fight, and nobody
   * else can take it.
   *
   * It is a RUN parameter rather than a setting because it has to be the same
   * for everybody in a session and cannot change under a party mid-fight; the
   * host chooses it when they open the game. Absent reads as `"free"`, so a
   * single-player run — and every run created before this existed — is
   * untouched, and no pickup in the campaign changes.
   */
  lootMode?: LootMode;
  /**
   * MORE THAN ONE PERSON HAS PLAYED THIS RUN (`PartyStamp`) — so it banks no
   * leaderboard record, for the reasons written on the
   * type. Null (and absent, on every run created before this existed) means a
   * solo run, which is what the whole shipped campaign is.
   *
   * Latched by `seatHero` when the second hero is seated, never cleared.
   */
  party?: PartyStamp | null;
  /**
   * OPEN TRADES (`engine/game/trade.ts`) — at most one per
   * seat, and absent on every single-player run, which is what makes this cost
   * the shipped campaign nothing.
   *
   * It is RUN state rather than per-player state because a trade is a fact
   * about two heroes at once: holding half of one on each side is how the two
   * halves come to disagree about what is on the table.
   */
  trades?: Trade[];
  /**
   * STANDING TRADE REQUESTS (`engine/game/trade.ts` rule 5) — the asks nobody has
   * answered yet, at most one outgoing per seat, and absent on every
   * single-player run.
   *
   * Run state for exactly the reason `trades` is: an ask is a fact about two
   * seats at once, and half of one held on each side is how the two halves
   * come to disagree about whether it still stands.
   */
  tradeRequests?: TradeRequest[];
  /**
   * A REQUESTED IN-SESSION CROSSING (`engine/game/travel.ts`) — the destination
   * the host chose, and how much of its opening to skip (`OpeningSkip`'s own
   * words; a wire value is a claim, read defensively). Set by `requestTravel`
   * (the `travelTo` run command, seat 0 only) and consumed by the SESSION
   * between ticks, which rebuilds the run on the destination and carries the
   * whole party through. Nothing in `step()` reads it, so a run that never
   * consumes one — every local run — is byte-identical with or without it.
   */
  pendingTravel?: { to: string; skip: string };
  /**
   * REQUESTED SOLO CROSSINGS — one hero stepping off this level while the rest
   * of the party keeps playing on it (`engine/game/travel.ts`,
   * `requestSoloTravel`).
   *
   * The town portal's verb, and the reason it is a LIST rather than the single
   * request `pendingTravel` is: a party crossing is one decision the host makes
   * for everybody, while a solo crossing is each player's own — two people can
   * step home in the same tick, and one overwriting the other would strand
   * somebody on a field they had already left. At most one entry per seat
   * (a second request from the same seat replaces the first), so it is bounded
   * by the seat cap.
   *
   * Consumed by the SESSION between ticks, which routes that seat into the
   * destination's world and leaves this one standing (`server/worlds.ts`).
   * Nothing in `step()` reads it, so a run that never consumes one — every
   * local single-player run — is byte-identical with or without it.
   */
  pendingSolo?: { seat: number; to: string; skip: string }[];
  /**
   * The escalation meter (see config MENACE). Heated by the player's rolling
   * combat output (`combatDps` / `combatKillRate`) and jolted by overpowered
   * kills; idling bleeds it off — but never below `menaceFloor`. Read as an
   * uncapped stage that lures, evolves, and scales the horde. Starts at 0.
   */
  menace: number;
  /**
   * The PERMANENT menace floor the evolution ratchet has earned (see
   * `bankOverkill`): raised a full stage each time the current stage's mobs
   * keep getting one-shot, never lowered — the horde that evolved because it
   * was too easy stays evolved for the rest of the run. Starts at 0.
   */
  menaceFloor: number;
  /**
   * Healthbars of overkill banked toward the NEXT ratchet stage (only blows
   * against mobs of the current evolution crop count; the crop's CLEAN kills
   * refund it — see `MENACE.ratchetReliefPerKill`). Capped at twice the
   * threshold; spends `MENACE.ratchetHealthbars` each time the floor rises.
   * Starts at 0.
   */
  evoProof: number;
  /**
   * Ms until the ratchet may lift the floor another stage (the "one evolve
   * per malice round" pacing, `MENACE.ratchetCooldownMs`). Counts down each
   * playing tick. Starts at 0.
   */
  evoRatchetMs: number;
  /**
   * Rolling estimate of the player's damage-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's damage. The
   * main fuel the menace meter reads: sustained high DPS heats it. Starts at 0.
   */
  combatDps: number;
  /**
   * Rolling estimate of the player's kills-per-second, an EMA smoothed over
   * MENACE.rateWindowSec and updated each step from that step's kills. Heats
   * the menace meter alongside `combatDps` — a fast clear rate escalates on top
   * of raw damage output. Starts at 0.
   */
  combatKillRate: number;
  /**
   * Rolling estimate of the horde's SPAWN rate — minions/sec appearing from the
   * wave spawner and woken packs, an EMA smoothed over `MENACE.clearanceWindowSec`.
   * Paired with `minionKillRate` to answer "is the screen getting MORE or LESS
   * crowded" — the CLEARANCE GATE that decides whether the rolling menace heat is
   * allowed to fire (`tickMenace`): output only heats the meter while the player
   * out-clears the spawn rate. Starts at 0.
   */
  minionSpawnRate: number;
  /**
   * Rolling estimate of the player's minion KILL rate — minions/sec felled by the
   * hero's own hand (powerup kills exempt, like `combatKillRate`), an EMA over the
   * same window as `minionSpawnRate`. Net kills over the throughput is the
   * clearance fraction the gate reads. Starts at 0.
   */
  minionKillRate: number;
  /**
   * This step's minion spawns and the hero's own minion kills, awaiting the next
   * `tickMenace` fold into the rate EMAs above (consumed and zeroed there). The
   * spawner runs AFTER the menace tick within a step, so a spawn is booked on the
   * following tick — a one-frame lag the EMA smooths over. Both start at 0.
   */
  pendingMinionSpawns: number;
  pendingMinionKills: number;
  /**
   * The hero ATTACK — one melee swing, one trigger pull (however many pellets),
   * one cast — whose kills have already fed the overkill channel this run (see
   * `bankOverkill`). Menace is judged AT MOST ONCE PER ATTACK: the first kill
   * of an attack banks its jolt/ratchet/lure and the rest of that attack's
   * kills are menace-silent, so a shotgun volley or a wide cleave escalates
   * like one blow, not like a massacre. Attack ids are minted from `nextId`
   * at each attack's source; -1 = no attack judged yet. Starts at -1.
   */
  lastMenaceAttack: number;
  /**
   * Cumulative damage dealt by sources that are not the hero's own weapon —
   * powerups (the screen-nuke bomb, the fire orbs, the storm cell) and the
   * COMPANIONS' attacks. Booked alongside `stats.damageDealt` but kept out of
   * the menace meter: `step` subtracts this step's slice from the damage
   * `tickMenace` reads, so a bomb clearing the screen or a party carrying the
   * fight never heats the escalation the player didn't earn with their own
   * weapon. Starts at 0.
   */
  menaceExemptDamage: number;
  /**
   * Cumulative kills scored by non-hero sources — the same powerup and
   * COMPANION sources as `menaceExemptDamage`. Booked alongside `stats.kills`
   * but subtracted from the kills `tickMenace` reads, so those kills never feed
   * the menace kill-rate heat (and they skip the overkill jolt and evolution
   * ratchet entirely — see `killEnemy`). Starts at 0.
   */
  menaceExemptKills: number;
  /** Where the run begins; also the origin difficulty scales out from. */
  playerSpawn: Vec2;
  /** Story props to draw (the lander, the boss's flag, …). */
  landmarks: Landmark[];
  /** The running conversation while `phase === "dialogue"`; null otherwise. */
  dialogue: DialogueState | null;
  /**
   * Latched true when the player taps the dialogue MUTE button: every
   * in-world scene (elite/boss dialogue, unique last words, companion join
   * words, the hero's inner monologues, story-item lore, and the merchant's
   * greeting) is suppressed for the rest of this level. A new level builds a
   * fresh state, so the mute lifts on the next map. Cutscenes are unaffected —
   * they own a SKIP button of their own.
   */
  dialogueMuted: boolean;
  /** The pending SPARE-or-KILL verdict while `phase === "choice"` — a GROUP
   * beat: shown to everybody, the world frozen for it. */
  choice: ChoiceState | null;
  /** The recruited party, in join order (see companions.ts). */
  companions: Companion[];
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /**
   * KEEPSAKES the hero arrived carrying — story items banked on the character
   * across every run (`StoryItemDef.keepsake`), handed in as a session
   * parameter because no run can know them for itself.
   *
   * Distinct from `storyItems`, which is what THIS run has found. The rift
   * tool is the one that does anything: holding it is what lets a hero tear a
   * seam home from wherever he stands (`engine/game/rift-tool.ts`).
   */
  keepsakes: string[];
  /**
   * Level ids the hero has already CLEARED on this run's difficulty (seeded by
   * the app from the character's clears; empty on a dev jump or fresh hero).
   * Read only by `requiresClear`-gated guaranteed drops — the bunker key
   * (RASPUTIN's SEVERED HAND) stays latent until this contains "boot_hill", so
   * the secret level unlocks only after the campaign is beaten.
   */
  clearedLevels: string[];
  /**
   * THOUGHT_DEFS ids the hero has already thought through — each first-kill
   * inner monologue plays exactly once per run.
   */
  thoughtsSeen: string[];
  /**
   * Cooldown (ms, counts down each step) gating the RECURRING cap-farm mutter
   * (`maybeCapThought`): the "these enemies are pathetic — go find Ada" thought
   * that replays while the hero grinds an out-levelled map. 0 = ready to fire;
   * a firing re-arms it to `DIALOGUE.capThoughtCooldownMs`. Kept off
   * `thoughtsSeen` precisely because it must repeat.
   */
  capThoughtMs: number;
  /**
   * Round-robin cursor into `CAP_THOUGHT_IDS` — which cap-farm variation fires
   * next. Bumped each time `maybeCapThought` speaks so a long farm cycles the
   * moods instead of repeating one line.
   */
  capThoughtIdx: number;
  /** Locked doors built from the level def, open or not. */
  doors: DoorState[];
  /** Elevator pads built from the level def (see `ElevatorState`) — empty on a
   * level that authors none. */
  elevators: ElevatorState[];
  /** Occupied houses built from the level def (see `LairState`) — shut until the
   * hero walks up to one. */
  lairs: LairState[];
  /**
   * Ms of grace left after a ride, during which no pad fires.
   *
   * Without it the lift is a trap rather than a lift: the car sets the hero down
   * ON the return pad, which is within its own contact radius, so he would ride
   * straight back and forth forever. The lock runs out as he steps off.
   */
  elevatorLockMs: number;
  /**
   * Travel gates torn open this run (`spendGateKey`) — empty until a key
   * trinket is used; the level def's `gates` entries stay latent until then.
   */
  gates: GateState[];
  /** The level's wandering merchant (see merchant.ts). */
  merchant: Merchant;
  /**
   * THE CACHE — the antique chest (engine/game/cache.ts). WHERE it stands on this
   * map, or null on every map that has no spot for one (which is all of them
   * but the hub: a stash you can reach mid-mission is a bag with no cap).
   *
   * The spot comes off the carve like any landmark, so it is decided whether or
   * not the hero owns the chest yet — the map always knows where the thing goes.
   * Whether it is THERE is `cacheOwned`.
   */
  cachePos: Vec2 | null;
  /**
   * HOW DEEP THIS HERO'S CHEST IS — the cells they may actually use, out of the
   * `CACHE.maxSlots` the grid is always laid out at. 0 = no chest at all.
   *
   * A HIGH-WATER MARK, and a SESSION PARAMETER (`RunParams.cacheSlots`) off the
   * deepest chest the character has ever been paid — never a fact the run
   * discovers, because a joiner and the host must build the same world from the
   * same parameters. `grantCache` raises it mid-run when Ruth's errand is
   * handed in on a rung deeper than anything the hero already had; nothing
   * anywhere lowers it, so a fresh EASY run still opens the chest JESUS paid.
   */
  cacheSlots: number;
  /**
   * The chest COMING INTO BEING, counting down from `CACHE.arriveMs`; 0 or
   * absent once it simply stands there. Set by `grantCache` at the handover and
   * counted off in the step, so the arrival plays on the client exactly as the
   * mercy angel's descent does — the engine holds the tap and the renderer
   * dramatizes the rest (render/conjure.ts).
   */
  cacheArriveMs?: number;
  /** THE HERO'S VEHICLES — the car and the garage ship, minted where the
   * carve pins their landmarks (the garage; empty everywhere else). Machines,
   * not props: see `Vehicle` and engine/game/vehicles.ts. */
  vehicles: Vehicle[];
  /** Wheels torn off a vehicle, bouncing away or come to rest — dropped by
   * `detachWheel`, stepped by `stepVehicles`, never cleaned up: the wreck
   * keeps its history. Empty on every map without a car crash. */
  wheelDebris: WheelDebris[];
  /**
   * The people on this map with an errand to hand out (see quests.ts), built
   * at creation from the quest-giver catalog. Empty on a map nobody wrote a
   * quest for — and on every mod-less run of a game that ships none, which is
   * why nothing downstream may assume there is at least one.
   */
  questGivers: QuestGiver[];
  /**
   * THE QUEST LOG: one entry per errand the hero has been offered this run,
   * keyed by quest id. A quest missing from here has never been offered; the
   * statuses are what the tracker, the giver's head mark, and the chain gate
   * (`requires`) all read. Quests are a RUN's business, not a save's — a
   * restarted level offers its errands again.
   */
  quests: Record<string, QuestProgress>;
  /**
   * WHAT EACH ERRAND IS PAYING IN GEAR, keyed by quest id — minted ONCE, the
   * first time its conversation opens, and read unchanged by the offer, the log
   * and the handover.
   *
   * It is stored rather than derived, and that is the whole point of the
   * feature: a reward the player is shown before they accept has to be the
   * reward they are handed afterwards. Rolling it at the handover made the
   * offer's promise a lie; rolling it per render made it a slot machine that
   * span while they read it (and minted an item id every frame). See
   * quests/reward-choices.ts.
   */
  questRewards: Record<string, Equipment[]>;
  /**
   * The conversation on screen while some hero's `screen === "quest"`; null
   * otherwise. ONE conversation at a time, party-wide: the record stays on
   * the run and the holder is the hero whose screen is up, so a second hero
   * walking up to a giver mid-conversation is politely refused (see
   * quests/index.ts).
   */
  questOffer: QuestOffer | null;
  /**
   * The conversation TREE on screen while some hero's `screen === "talk"`;
   * null otherwise (see conversation.ts). Distinct from `questOffer` because
   * the two are different things: an offer is a page the player accepts or
   * declines, a talk is a tree he steers. One at a time, like the offer.
   */
  talk: ActiveTalk | null;
  /**
   * WHAT THIS RUN HAS LEARNED, BEEN TOLD, OR TALKED SOMEBODY INTO — a set of
   * plain string flags, the one bridge between a conversation branch and the
   * rest of the game (see conversation.ts). An objective may require one, a
   * later branch may be gated on one, and a merchant's stall may unlock on
   * one; nothing that reads a flag knows which branch set it.
   *
   * A campaign quest's flags travel with the hero between maps (banked on the
   * character alongside its log), because half of what makes a chain feel long
   * is that a thing you were told two venues ago still counts.
   */
  questFlags: Record<string, boolean>;
  /**
   * People being walked somewhere by a running `escort` objective — bodies on
   * the field with hp the horde can reach. Empty until one is accepted.
   */
  escorts: EscortState[];
  /**
   * The fog of war: one byte per `MAP.cellSize` grid cell, row-major
   * (`mapCols(level)` cells per row), 1 once the cell has been on screen.
   * Stamped by `revealRect` each step from the camera view (so everything
   * seen is remembered) and by `revealAround` once at creation around the
   * spawn; never re-fogged. See map.ts.
   */
  explored: Uint8Array;
  /** Pins on the level map: story finds, rare loot, elite/boss victories. */
  mapMarkers: MapMarker[];
  /**
   * SEAT 0's camera rect (world px) — `GameInput.view` stamped by `step()`
   * each tick it arrives, so state-readers know roughly WHAT THE PLAYER CAN
   * SEE. The summon geometry reads it (mobs must run in from off screen) and
   * so does the autopilot's wall-end sense, which looks exactly as far as the
   * screen edge in each direction (a wall's end visibly on screen is known;
   * one past the edge is not). Both want "a screenful", not a specific screen.
   *
   * ANYTHING THAT AIMS ON A HERO'S BEHALF WANTS `Player.view` INSTEAD — eight
   * clients have eight cameras, and a joiner who may only strike what is on
   * the host's screen cannot fight. `game/sight.ts` picks the right one.
   * Absent on headless runs (tests, the sim without a camera) — readers fall
   * back to the phone-landscape baseline, or to no gate at all.
   */
  view?: ViewRect;
  /**
   * Progress along the level's INTENDED PATH (`LevelDef.path`): the index of the
   * next waypoint the hero is steering toward. Advanced by `advancePath` each
   * step as he reaches each node; read by the autopilot (to navigate) and the
   * app (to point the guidance arrow). 0 with no path — inert.
   */
  pathIndex: number;
  /**
   * THE PARTY — every hero in the run, in SEAT order. Seat 0 is the host's, and
   * it is the only seat a single-player run has.
   *
   * It is a LIST rather than one hero because a session seats up to
   * `MAX_CLIENTS` of them, and because a pass written against one hero silently
   * means "seat 0" the day a second player arrives. Nothing in the engine
   * treats the one-element case specially; read it through `game/party.ts`,
   * which is the one module allowed to ask the party a question, and take a
   * `Player` as a PARAMETER wherever a pass is about one specific hero.
   *
   * A seat is never empty and never reordered while a run lives: a player who
   * leaves keeps their hero standing (`Player.departed` owns what happens to
   * it), because
   * splicing the list would renumber everybody else's seat and every command in
   * flight names a seat.
   *
   * Typed as a NON-EMPTY tuple, which is the type stating the one invariant the
   * whole party model rests on: a run always has seat 0. It is what lets
   * `players[0]` read as a `Player` while `players[seat]` — an index that came
   * from somewhere else, very possibly from a stranger's command — reads as
   * `Player | undefined` and has to be checked.
   */
  players: [Player, ...Player[]];
  /**
   * Fallen heroes' bodies, each holding the gear its owner was wearing when
   * they went down (see `downed.ts` and
   * `PlayerCorpse`). Only ever populated in a party: solo, one hero falling is
   * the party wiped, and the wipe path never mints a corpse. Recovery is the
   * owner walking back (`stepCorpseRecovery`); whatever is never recovered is
   * folded into the owner's banked loadout by `extractLoadout`.
   */
  corpses: PlayerCorpse[];
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /**
   * Scenery floating OVER the field (see `CanopyPiece`) — drawn above the hero
   * and the horde, drifting off the render clock. Empty on a level that authors
   * no `canopy`.
   */
  canopy: CanopyPiece[];
  /**
   * Living scenery on the ground plane (see `Critter`) — cattle, chickens,
   * jackrabbits. Wanders off the render clock exactly as the canopy drifts, and
   * is never stepped. Empty on a level that authors no `fauna`.
   */
  critters: Critter[];
  /** Solid features scattered at level creation — see Obstacle. */
  obstacles: Obstacle[];
  /**
   * Bumped every time the OBSTACLE SET CHANGES SHAPE mid-run — today only the
   * `lockdown` ability, whose blast shutters drop in and retract again.
   *
   * It exists because the autopilot builds its nav grid ONCE per level and
   * caches it (`ensureRoute`). A wall that appears after that is a wall the bot
   * cannot see: it paths straight through, collides, and grinds against it
   * until its unstuck logic flails. Anything that adds or removes an obstacle
   * must bump this; `ensureRoute` rebuilds when it moves.
   */
  obstaclesVersion: number;
  /** Black holes built from the level def's `wells` — static all run. */
  wells: GravityWell[];
  /** Meteors currently falling (levels with LevelDef.asteroids). */
  asteroids: Asteroid[];
  /** Ms until the next asteroid spawns (levels with LevelDef.asteroids). */
  asteroidTimerMs: number;
  /** Craters left by past strikes, fading out (levels with LevelDef.asteroids
   * whose ground can scar — see `asteroids.craterSprites`). */
  craters: Crater[];
  /** Hay bales currently rolling (levels with LevelDef.hayBalls). */
  hayBalls: HayBall[];
  /** Ms until the next hay bale rolls in (levels with LevelDef.hayBalls). */
  hayBallTimerMs: number;
  /** Sand storms currently drifting (levels with LevelDef.sandstorms). */
  sandstorms: SandStorm[];
  /** Ms until the next sand storm spawns (levels with LevelDef.sandstorms). */
  sandstormTimerMs: number;
  /**
   * Patches of BURNING FLOOR a boss's beam has laid (the `laser_eyes` ability).
   * Unlike every other hazard list these are owned by a FIGHT rather than by
   * the level, so they exist on every map — a boss carries its own hazard in.
   */
  scorches: ScorchPatch[];
  /**
   * Piles of BAIT a boss threw down (the `bait_drop` ability). Owned by a
   * FIGHT, like the burning floor above, so they exist on every map.
   */
  baits: BaitCharge[];
  /** Employee herds currently charging (levels with LevelDef.stampedes). */
  stampedes: Stampede[];
  /** Ms until the next stampede charges in (levels with LevelDef.stampedes). */
  stampedeTimerMs: number;
  /** The approach-dust telegraph for the herd owed next, once the countdown has
   * entered its (difficulty-scaled) lead window — else null. The lane is locked
   * here so the dust marks the exact band the wall will charge down. */
  stampedeWarn: StampedeWarn | null;
  /** Countdown to the next approach-rumble grain (config STAMPEDES.rumbleEveryMs);
   * the herd's roll is emitted on this cadence (levels with LevelDef.stampedes). */
  stampedeRumbleMs: number;
  /**
   * Ms until the next MARTYR walks in (levels with `LevelDef.martyrs`). Held —
   * not counted — until the level's `afterProgress` gate has been crossed, so
   * the first one arrives a full interval after the crossing rather than the
   * instant it is reached.
   */
  martyrTimerMs: number;
  /**
   * Has the run crossed the level's `martyrs.afterProgress` mark yet? A LATCH
   * rather than a live read, because the gate answers "is the player still
   * learning this floor" — a question about how far into the run they are, not
   * about where they are standing. Without it, walking back up the aisles to
   * the trader turns the beat off again, which measured out as a cadence armed
   * for a ninth of the level.
   */
  martyrsArmed: boolean;
  /**
   * THE NIGHT SHIFT TURNING UP (levels with `LevelDef.arrivals`): every car
   * that has rolled onto the lot this run, from the moment it appears at the
   * kerb to long after it is parked and its driver has gone inside. A finished
   * arrival is KEPT — the car it left behind is part of the car park now.
   */
  arrivals: Arrival[];
  /** Ms until the next car rolls in (levels with `LevelDef.arrivals`). */
  arrivalTimerMs: number;
  /** The lot's geometry, worked out once when the run was built — the access
   * lane, the rank, and the doorway the badge opens. Null on every level with
   * no arrivals, and on one whose carve left the lot no way in. */
  arrivalPlan: ArrivalPlan | null;
  /**
   * Ms until another "bags are full" nudge may fire. Counts down each step;
   * a blocked pickup emits `pickupBlocked` only when this reaches 0, then
   * resets it to `LOOT.bagFullHintCooldownMs` (see `stepItems`).
   */
  bagFullHintCooldownMs: number;
  /**
   * Ms the sprint pool has sat BONE-DRY — exactly empty, not merely low. Counts
   * up each step while `player.stamina` is 0 and resets to 0 the instant any
   * stamina returns. Drives the stamina-drink MERCY DROP: the longer the hero is
   * stranded winded, the higher each kill's chance of coughing up an energy
   * drink, ramping to the rung's cap over `MERCY.staminaEmptyDrinkRampMs` (see
   * `staminaDrinkChance`).
   */
  staminaEmptyMs: number;
  /**
   * Ms left of the stamina regen LOCKOUT — the frozen-regen window a run or a
   * jump trips when it empties the sprint pool (see `STAMINA.emptyRegenLockMs`).
   * Counts down each step; while it stands the pool refills at nothing, so a
   * hero who bottomed out mid-sprint (or on a takeoff) must walk it off and
   * wait the beat out. Re-armed to the full window whenever a run/jump empties
   * the pool again.
   */
  staminaRegenLockMs: number;
  /**
   * Ms left of the combat-clock grace window (the "combat is still live" tail).
   * Refreshed to `RUN.combatGraceMs` on every kill and counted down each
   * playing tick; while it — or a live foe — stands, `stats.combatMs` accrues.
   * Starts at 0, so a run that opens on an empty field banks no survival time
   * until the first foe appears.
   */
  combatGraceMs: number;
  /**
   * The running DEATH SCENE while `phase === "dying"` — the dramatic tableau
   * played when the hero falls, before the defeat splash (see
   * `death-scene.ts`). Null in every other phase.
   */
  deathScene: DeathSceneState | null;
  /**
   * THE DIM: the handover that plays once a driven car touches the level's road
   * out — the picture going dark over a coasting car, and then the road (see
   * `vehicles.ts`). Null every other tick.
   */
  departure: DepartureState | null;
  /**
   * The running BOSS DEATH RITE while `phase === "bossDeath"` — the scripted
   * send-off played over the boss the moment it falls, before its last words
   * (see `boss-death.ts`). Null in every other phase.
   */
  bossDeath: BossDeathState | null;
  /** Counts down once the objective clears; the level ends at 0. */
  victoryCountdownMs: number | null;
  /**
   * Where the level's boss fell, left as a clickable corpse once the player
   * chooses to STAY on a cleared field (see `staying`). The victory menu's
   * STAY option drops the hero back into `playing`; this corpse is the marker
   * they walk back to and tap to re-open the menu (and finally move on). Set
   * when a boss dies (`killEnemy`), null on any level the hero never felled a
   * boss on (the bossless hub) — which is exactly when STAY is not offered.
   */
  bossCorpse: { pos: Vec2; sprite: string } | null;
  /**
   * True once the player picks STAY from the victory menu: the win is already
   * banked, but the hero lingers on the cleared field to farm loot and finish
   * off stragglers. It suppresses the auto-victory countdown from re-arming
   * (so a still-cleared objective doesn't yank the menu straight back up) and
   * arms the `bossCorpse` tap that re-opens the menu when the player is ready.
   */
  staying: boolean;
  /** The AUTO PILOT meter (see autopilot.ts) — engaged flag, speed rung, and
   * the coin drain's running fractions. The app steers; the engine bills. */
  autopilot: AutopilotState;
  /**
   * Ms left of the level-up celebration: set to `LEVELING.dingCelebrationMs`
   * when a level lands (grantXp), counted down each playing step, and the
   * `levelup` stat-chooser phase only opens when it reaches 0 — the golden
   * burn (drawn off this field) and the fanfare get their moment before the
   * modal interrupts. Ticks only while `playing`, so a dialogue that cuts in
   * merely postpones the chooser.
   */
  levelUpFxMs: number;
  /**
   * Equipment dropped by regular monsters so far — the pity counter behind
   * LOOT.minEquipmentPerLevel (boss drops don't count toward it).
   */
  minionEquipmentDrops: number;
  /**
   * Monsters spawned so far per wave-budget line (indexed like the level's
   * `waves.budget`). The spawner streams each line in until its count is
   * exhausted; empty when the level has no waves.
   */
  waveSpawned: number[];
  /**
   * PLACED PACKS for this run, parallel to `LevelDef.packs` (see `PackState`
   * / stepPacks): fixed clusters that sleep until the player nears them, then
   * boil up and are cleared by wiping them out. Empty when the level has no
   * packs.
   */
  packs: PackState[];
  /**
   * SPAWN POINTS for this run, parallel to `LevelDef.spawners` (see
   * `SpawnerRuntime` / stepSpawners): finite points that arm on approach and
   * drain their mob count over time. Empty when the level authors none.
   */
  spawners: SpawnerRuntime[];
  /**
   * MOB POSTS for this run, parallel to `LevelDef.mobSpawns` (see
   * `MobSpawnState` / stepMobSpawns): one mob to a post, refilled on the
   * difficulty's clock once killed or dragged away. Empty when the level
   * authors none — every level but the STATIC PARTS maps.
   */
  mobSpawns: MobSpawnState[];
  /**
   * World px the player has walked that the spawner hasn't converted into
   * monsters yet — moving through the level stirs more of the horde awake
   * (waves.moveSpawnEvery px each).
   */
  moveSpawnCredit: number;
  /**
   * Where the player last SETTLED (config CAMPING): re-anchored to his
   * position whenever he strays past `CAMPING.campRadius` of it. While he
   * stays inside the radius, `campMs` counts up.
   */
  campAnchor: Vec2;
  /**
   * Ms the player has camped inside `campRadius` of `campAnchor`. Past
   * `CAMPING.graceMs` the spawner starves the camper — the live floor and the
   * timed budget stream fade out over `CAMPING.fadeMs` — and the beckoning
   * trickle from the objective direction takes over. Reset by moving on.
   */
  campMs: number;
  /**
   * Cooldown (ms, counts down) between trickle arrivals — shared by the
   * camped-player BEACON spawns and the post-budget STRAGGLER stream, both of
   * which walk in slowly from the objective direction (see stepSpawner).
   */
  trickleMs: number;
  /**
   * Ms of post-NUKE calm still to run (config `NUKE.calmMs`, counts down in
   * stepSpawner). While positive the spawner holds every refill — the live
   * floor, the walk-credit pull, the timed stream, the trickle — so the screen
   * a screen-nuke just cleared actually STAYS clear long enough to break away,
   * instead of the ring instantly repopulating at the screen edge. Set by
   * `detonateNuke`; starts at 0.
   */
  nukeCalmMs: number;
  /**
   * Ms of post-NUKE RECOVERY still to run (config `NUKE.recoverMs`, counts down
   * in stepSpawner only once `nukeCalmMs` has burned off). While positive the
   * live near-floor eases back from 0 to full instead of snapping the cleared
   * swarm back the instant the calm ends — so the horde walks back in at the
   * ordinary rate, not all in a single frame. Set by `detonateNuke`; starts
   * at 0.
   */
  nukeRecoverMs: number;
  /**
   * Resolved kill thresholds for the level's `loot.earlyDrops` schedule,
   * parallel to it: a rolled `[min, max]` entry gets a concrete count here at
   * creation, a fixed entry keeps its number. Empty when the level has no
   * schedule.
   */
  earlyDropKills: number[];
  /**
   * Cursor into the `loot.earlyDrops` schedule: the index of the next unfired
   * entry (entries are authored in ascending kill order). Advances as each
   * scripted opening drop is handed over; equals the schedule length once they
   * have all dropped.
   */
  earlyDropCursor: number;
  stats: GameStats;
  /** Events emitted by the most recent `step()`. */
  events: GameEvent[];
  /**
   * PROCS queued by this tick's weapon blows (`proc` affixes), drained by
   * `stepProcs` after the attack pass — resolving them inline would splice
   * the enemy list out from under the sweep that triggered them.
   */
  pendingProcs: PendingProc[];
  /**
   * MAGIC CRIT BLOBS queued by this tick's magic weapon crits (config
   * `MAGIC_CRIT`), drained by `stepMagicCritBlobs` after the attack pass —
   * same reason as `pendingProcs`: an inline burst would splice the enemy
   * list out from under the loop that spawned it. Empty between ticks (filled
   * and drained within one `step`), so it needs no save serialization.
   */
  pendingCritBlobs: PendingCritBlob[];
  /**
   * REFLECTED damage the ARCANE RETRIBUTION talent owes attackers this tick —
   * one entry per blow the hero took, drained by `stepReflectedDamage` AFTER
   * the enemy pass: billing the attacker inline (mid contact-loop) would splice
   * the enemy list out from under the `for…of` iterating it. `seat` is the
   * struck hero whose talent reflects (absent reads as seat 0), so the bite is
   * billed as THEIR blow. Empty between ticks (filled and drained within one
   * `step`), so it needs no save serialization. */
  pendingReflects: { enemyId: number; amount: number; seat?: number }[];
  /** Monotonic id source for spawned entities. */
  nextId: number;
  /** Seeded stream for in-run rolls (crits, drops) — keeps runs replayable. */
  rng: Rng;
  /**
   * A SECOND seeded stream, for combat FLAVOR only — currently the per-blow
   * damage-range roll (see `rollWeaponDamage`). Kept apart from `rng` on
   * purpose: damage variance must never advance the loot/crit stream, so drop
   * determinism (and every seeded loot test) is unaffected by how a swing rolls.
   * Not serialized — re-seeded on resume; a reloaded run rolling slightly
   * different flavor damage is invisible, while a fresh run from a seed stays
   * fully reproducible.
   */
  fxRng: Rng;
  /**
   * A THIRD seeded stream, for the GOLD faucet alone (`items/gold.ts`) — the
   * per-kill purse roll, its size, and where its piles scatter.
   *
   * Kept apart from `rng` for the same reason `fxRng` is, one step sharper:
   * gold is CALIBRATED against the other faucet (what the run's loot sells
   * for), and if a gold draw advanced the loot stream then moving
   * `GOLD.dropMult` would reshuffle every equipment drop in the run — so the
   * A/B that sets the knob would move both halves at once and measure nothing.
   * It also means the whole feature perturbs no existing seeded loot test.
   *
   * Frozen and thawed with the other two (see `session-setup.ts`), so a run
   * that crosses a process boundary or comes back off disk resumes the exact
   * stream it left.
   */
  goldRng: Rng;
};
