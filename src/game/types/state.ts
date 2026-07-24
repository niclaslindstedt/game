// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The run's mutable state: level info, spawner/pack runtimes, the autopilot
// scratchpad, and the GameState root that step() advances.

import type { DifficultyMobLevels } from "../defs/levels/types.ts";
import type { CutsceneState } from "@game/lib/cutscene.ts";
import type { Rng } from "@game/lib/rng.ts";
import type { Vec2 } from "@game/lib/vec.ts";

import type { ChoiceState, Companion, Enemy, Player } from "./actors.ts";
import type {
  Difficulty,
  GamePhase,
  PendingCritBlob,
  PendingProc,
  StatName,
} from "./core.ts";
import type { GameEvent, GameStats } from "./events.ts";
import type {
  Asteroid,
  Crater,
  GravityWell,
  HayBall,
  Projectile,
  SandStorm,
  Stampede,
  StampedeWarn,
} from "./hazards.ts";
import type {
  Decor,
  DialogueState,
  DoorState,
  GateState,
  Item,
  Landmark,
  MapMarker,
  Merchant,
  Obstacle,
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
   * ALARM CLOCK (sim ms): while `now` is below this, the point was ALARMED by
   * a linked mob (`raiseAlarm`) and emits at the hero even though he is
   * outside its trigger radius — the squad answering the call. Cleared when
   * the window lapses (the point falls back to dormant if he never arrived).
   * Absent/null on points never alarmed. Optional so pre-alarm saved runs
   * still deserialize.
   */
  alarmedUntilMs?: number | null;
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
export type AutopilotState = {
  /** The autopilot is flying the hero (and the meter is running). */
  active: boolean;
  /** The engaged speed rung (config `AUTOPILOT.speeds`) — scales both the
   * app's fast-forward and the per-game-second price. */
  speed: number;
  /** Fractional coins accrued but not yet deducted — whole coins leave the
   * purse, the remainder carries so no tick rounds the bill away. */
  drainCarry: number;
  /** Whole coins this RUN's meter has burned (session totals live app-side —
   * a new run starts a fresh count). */
  coinsSpent: number;
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
   * Which page of the level's opening monologue is on screen while
   * `phase === "intro"` — the hero's black-screen briefing dialogue. Turning
   * past the last page drops into the `title` card; unused in other phases.
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
  /** The run's chosen difficulty (scales spawns, hp, and loot). */
  difficulty: Difficulty;
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
  /** The pending SPARE-or-KILL verdict while `phase === "choice"`. */
  choice: ChoiceState | null;
  /** The recruited party, in join order (see companions.ts). */
  companions: Companion[];
  /**
   * Which companion's equip screen is open while `phase === "companion"`
   * (a `Companion.id`); null otherwise.
   */
  companionFocus: number | null;
  /** Collected story items (STORY_ITEM_DEFS ids) — keys, dossiers, the lot. */
  storyItems: string[];
  /**
   * Level ids the hero has already CLEARED on this run's difficulty (seeded by
   * the app from the character's clears; empty on a dev jump or fresh hero).
   * Read only by `requiresClear`-gated guaranteed drops — the bunker key
   * (RASPUTIN's SEVERED HAND) stays latent until this contains "eastworld", so
   * the secret level unlocks only after the campaign is beaten.
   */
  clearedLevels: string[];
  /**
   * THOUGHT_DEFS ids the hero has already thought through — each first-kill
   * inner monologue plays exactly once per run.
   */
  thoughtsSeen: string[];
  /**
   * SPELL_DEFS ids newly UNLOCKED but not yet shown to the player — filled by
   * `allocateStat` when spending an INTELLIGENCE point pushes effective INT
   * across a spell's ×10 threshold (10, 20, … 250). The app drains this queue
   * to raise the "SPELL UNLOCKED" modal, one entry at a time
   * (`takeSpellUnlock`). Not an event (which would die at the next step's
   * `events = []`) because stat allocation runs OUTSIDE `step()`; a persistent
   * queue survives until the modal consumes it.
   */
  pendingSpellUnlocks: string[];
  /**
   * The talent-picker QUEUE — one entry per talent point the hero has earned
   * but not yet spent, each the TREE STAT (strength/dexterity/intelligence)
   * whose milestone minted it, in STR > DEX > INT order. It is a deterministic
   * CACHE derived from the hero's chosen stats + owned ranks, rebuilt by
   * `reconcileTalentPoints` after any relevant change — never hand-maintained —
   * so a respec revoking an unspent point or a full tree refusing one both fall
   * out for free. The app drains it through the talent picker (the modal that
   * replaces the old "SPELL UNLOCKED" reveal), one point at a time; the level-up
   * pause holds while it is non-empty (see `resumeAfterLevelup`). Not an event,
   * for the same reason `pendingSpellUnlocks` isn't — stat allocation runs
   * outside `step()`.
   */
  pendingTalentPoints: StatName[];
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
  /**
   * Travel gates torn open this run (`spendGateKey`) — empty until a key
   * trinket is used; the level def's `gates` entries stay latent until then.
   */
  gates: GateState[];
  /** The level's wandering merchant (see merchant.ts). */
  merchant: Merchant;
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
   * The last camera rect the app reported (world px) — `GameInput.view`
   * stamped by `step()` each tick it arrives, so state-readers know WHAT THE
   * PLAYER CAN SEE. The autopilot's wall-end sense reads it to look exactly
   * as far as the screen edge in each direction (a wall's end visibly on
   * screen is known; one past the edge is not). Absent on headless runs
   * (tests, the sim) — readers fall back to the phone-landscape baseline.
   */
  view?: { x: number; y: number; width: number; height: number };
  /**
   * Progress along the level's INTENDED PATH (`LevelDef.path`): the index of the
   * next waypoint the hero is steering toward. Advanced by `advancePath` each
   * step as he reaches each node; read by the autopilot (to navigate) and the
   * app (to point the guidance arrow). 0 with no path — inert.
   */
  pathIndex: number;
  player: Player;
  enemies: Enemy[];
  projectiles: Projectile[];
  items: Item[];
  decor: Decor[];
  /** Solid features scattered at level creation — see Obstacle. */
  obstacles: Obstacle[];
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
};
