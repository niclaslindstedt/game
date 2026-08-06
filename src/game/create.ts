// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// oss-spec:allow-large-file: run setup — one cohesive, order-sensitive world-generation sequence
// Run setup: builds the initial GameState from a level definition
// (defs/levels.ts). Monsters spawn in difficulty bands that scale with
// distance from the player spawn toward the objective; fixed spawns (bosses)
// guard their landmarks. The seed makes generation deterministic — tests
// pass a constant, the app passes a clock-derived value so every retry lays
// the level out differently.

import { createCutscene } from "@game/lib/cutscene.ts";
import { createRng, randomRange, type Rng } from "@game/lib/rng.ts";
import { clamp, distance, normalize, vec, type Vec2 } from "@game/lib/vec.ts";
import { applyLoadout } from "./arrival.ts";
import {
  CHESTS,
  ELEVATOR,
  ENEMY_AI,
  HELLGATES,
  LOOT,
  MEDKIT,
  MENACE,
  OBSTACLES,
  PACKS,
  PATH,
  PLAYER,
  RARE_MOBS,
  SPAWNERS,
  STAMINA,
} from "./config/index.ts";
import { cutsceneDef, cutsceneVariant } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  resolvePackCount,
  scaledAliveCap,
  scaledMobCount,
} from "./defs/difficulties.ts";
import type { DifficultyDef } from "./defs/difficulties.ts";
import { enemyDef, mobSpeed } from "./defs/enemies/index.ts";
import { gearDef, weaponDef } from "./defs/equipment.ts";
import {
  LEVEL_ORDER,
  levelPosition,
  type LevelDef,
} from "./defs/levels/index.ts";
import type { DifficultyHp, DifficultyMobLevels } from "./defs/levels/types.ts";
import { crateMaxHp } from "./crates.ts";
import { buildWells } from "./hazards.ts";
import {
  isOffhandItem,
  recomputeMaxHp,
  recomputeMaxStamina,
  rollEquipment,
  startingAmmo,
  syncInventoryCapacity,
  wearSlotFor,
} from "./items/index.ts";
import { xpToLevelUp } from "./leveling.ts";
import { revealAround } from "./fog.ts";
import { createExplored } from "./map.ts";
import { resolveLevelDef } from "./mapgen/index.ts";
import { createMerchant, revealMerchant } from "./merchant.ts";
import { createVehicles, vehicleFootprint } from "./vehicles.ts";
import { createQuestGivers } from "./quests/index.ts";
import {
  difficultyBandIndex,
  evolutionLevelBonus,
  mobContactScaleFor,
  mobHpLevelFactor,
  mobHpScaleFor,
  mobLevelFor,
  resolveMobScaling,
  rollMobLevel,
} from "./menace.ts";
import { BALANCE } from "./tuning.ts";
import { boundingRadius, rockHalf } from "./obstacles.ts";
import { LAIR_TRIGGER } from "./lairs.ts";
import { areCutscenesEnabled, isDialogueEnabled } from "./story.ts";
import { anyZoneContains } from "./zones.ts";
import type {
  CanopyPiece,
  Critter,
  Decor,
  Difficulty,
  DoorState,
  Enemy,
  Equipment,
  GameState,
  Item,
  Loadout,
  Obstacle,
  PackState,
  Player,
  SpawnerRuntime,
  StatName,
} from "./types/index.ts";
import { countsAsFoe } from "./disposition.ts";

export function createGame(
  seed: number,
  levelId: string = LEVEL_ORDER[0] as string,
  difficulty: Difficulty = "medium",
  // The hero's carry-over from the previous level (see arrival.ts): the app
  // passes the loadout it banked on the last victory — or a derived stand-in
  // for dev jumps. Omitted = the authored fresh start (level 1, the
  // difficulty's wall weapon in hand).
  loadout?: Loadout,
  // A LEVEL TOKEN jump: refund the carried build into a respec pool once the
  // intro clears (see items/stat-points.ts `beginRespec`). Off for every ordinary run.
  respec = false,
  // Level ids the hero has already CLEARED on this difficulty (the app seeds
  // this from the character's clears). Gates `requiresClear` guaranteed drops
  // — chiefly the bunker key, latent until "boot_hill" is beaten. Empty on a
  // dev jump or a fresh hero.
  clearedLevels: string[] = [],
  // True when the hero has ALREADY met this level's merchant on this difficulty
  // (the app seeds it from the character's `merchantsMet`). The trader is then
  // set up at the door from the first tick — a death-and-restart can walk
  // straight to the counter to repair — and greets the hero back on approach.
  merchantDiscovered = false,
): GameState {
  // This run's map: a chamber grid carved from the mission's blueprint on the
  // run's own seed (see `mapgen/`). Everything below reads a plain `LevelDef`.
  const def = resolveLevelDef(levelId, seed);
  const diff = difficultyDef(difficulty);
  // Every monster spawns at the horde's RELATIVE level (player level + the
  // difficulty's offset). Placed spawns mint their HP at the authored level-1
  // baseline — the opening ring is deliberately a warm-up — while the wave
  // spawner tracks the player's live level (mobLevelScale). Their MONSTER
  // LEVEL for loot, though, follows the hero who actually arrives (the
  // carried loadout's level): a level-14 arrival's warm-up mobs still drop
  // level-appropriate finds, not the opener's ilvl-1 castoffs.
  const mobHp = mobHpScaleFor(1, difficulty);
  const mobLvl = mobLevelFor(loadout?.level ?? 1, difficulty);
  const rng = createRng(seed);
  // The flavor stream: seeded off the same seed (so a run replays identically)
  // but a separate sequence, so damage variance never disturbs the loot stream.
  const fxRng = createRng((seed ^ 0x9e3779b9) >>> 0);
  // The rare/unique encounter stream (config RARE_MOBS): seeded off the same
  // seed but its OWN sequence, exactly like the merchant — so laying special
  // mobs into a level leaves its main rng (obstacles, spawns, decor, and every
  // downstream combat/loot roll) byte-identical to what it was without them.
  const rareRng = createRng((seed ^ 0x5f356495) >>> 0);
  // The GOLD stream (items/gold.ts): its own sequence so tuning the gold faucet
  // leaves every equipment drop in a seeded run exactly where it was — the A/B
  // that calibrates the knob compares gold against loot sales, and a shared
  // stream would move both halves at once.
  const goldRng = createRng((seed ^ 0x1f83d9ab) >>> 0);
  const playerSpawn = vec(def.playerSpawn.x, def.playerSpawn.y);
  const heroLevel = loadout?.level ?? 1;
  // REGULAR-mob scaling (spawn points, packs, waves, the opening scatter): when
  // the level (or a spawner override) hard-codes a level for this rung, hp AND
  // mlvl come from the rolled authored band and the ±spawn band is off; else the
  // player-relative fallbacks (mobHp/mobLvl) — JESUS, and the synthetic fixtures
  // that author no band, so their rng order is unchanged. Rolled per mob.
  const scaleRegular = (override?: DifficultyMobLevels) =>
    resolveMobScaling(
      override ?? def.mobLevels,
      difficulty,
      heroLevel,
      rng,
      mobHp,
      mobLvl,
    );
  // A pinned ELITE/BOSS's authored per-difficulty level + base hp (required for
  // non-JESUS). Mutates a freshly-spawned instance: pins its `mlvl` (so
  // maybePowerScale keeps it instead of re-stamping player-relative) and sets its
  // authored base maxHp (which the live power-match then multiplies). A no-op on
  // JESUS / when unauthored, leaving the relative placement untouched.
  const applyAuthored = (
    enemy: Enemy,
    level?: DifficultyMobLevels,
    hp?: DifficultyHp,
  ): Enemy => applyAuthoredScaling(enemy, level, hp, difficulty, rng);
  let nextId = 1;

  // The difficulty axis: bands are fractions of the distance from the player
  // spawn to the objective (the boss's post — or the exit door on a bossless
  // `reachExit` level), so "further out = harder" scales with the level's
  // actual geometry.
  const bossSpawn = def.spawns.find(
    (s) => "at" in s && enemyDef(s.enemy).role === "boss",
  );
  const bandReach =
    bossSpawn && "at" in bossSpawn
      ? distance(playerSpawn, bossSpawn.at)
      : def.objective.type === "reachExit"
        ? distance(playerSpawn, def.objective.at)
        : Math.hypot(def.width, def.height);

  // Obstacles go down first so monsters (and their walk-in spawns) never
  // start wedged inside one. Deliberate walls and locked doors land before
  // the scatter so scattered pieces keep their distance from the
  // architecture.
  // The WALL stream: its own sequence, like `fxRng`/`rareRng`, so a ridge's
  // sprite picks and meander never disturb the main generation stream (obstacle
  // scatter, spawns, decor) and every existing map lays out exactly as before.
  const wallRng = createRng((seed ^ 0x7f4a7c15) >>> 0);
  const obstacles = buildWalls(def, () => nextId++, wallRng);
  obstacles.push(...buildBuildings(def, () => nextId++));
  // Structured prop lines (conveyor runs, workstation rows) — placed before the
  // scatter so scattered pieces keep clear of the architecture. Its colliding
  // props join the obstacle field; its flat props are merged into `decor` below.
  const propLines = buildPropLines(def, () => nextId++);
  obstacles.push(...propLines.obstacles);
  const doors = buildDoors(def, obstacles, () => nextId++);
  // THE VEHICLES' FOOTPRINTS: solid ground under the car and the garage
  // ship (see src/game/vehicles.ts). The machines themselves are drawn
  // ASSEMBLED by the vehicle renderer, so these blockers carry no sprite
  // and the obstacle pass skips their kind. The car is low enough to hop.
  const vehicles = createVehicles(def);
  for (const vehicle of vehicles) {
    for (const print of vehicleFootprint(vehicle)) {
      obstacles.push({
        id: nextId++,
        kind: "vehicle",
        sprite: "",
        pos: print.pos,
        radius: print.radius,
        jumpable: vehicle.kind === "car",
      });
    }
  }
  // Break hp for this run's crates, scaled once to the hero's starting level so
  // a crate takes about as many blows as a weak trash mob all campaign.
  const crateHp = crateMaxHp(loadout?.level ?? 1, difficulty);
  obstacles.push(
    ...scatterObstacles(
      rng,
      def,
      playerSpawn,
      obstacles,
      crateHp,
      () => nextId++,
    ),
  );
  // Special chests (LevelDef.chests): placed reward containers, minted like a
  // crate but hardier (CHESTS.hpMult) and flagged so they spill a richer haul
  // (crates.ts). They join the obstacle field so collision, cover, and the
  // hero's auto-smash targeting all treat them like a breakable crate.
  for (const chest of def.chests ?? []) {
    obstacles.push({
      id: nextId++,
      kind: "chest",
      sprite: chest.sprite ?? CHESTS.sprite,
      pos: vec(chest.at.x, chest.at.y),
      radius: CHESTS.radius,
      jumpable: true,
      breakable: true,
      chest: true,
      hp: Math.round(crateHp * CHESTS.hpMult),
      maxHp: Math.round(crateHp * CHESTS.hpMult),
    });
  }
  const blocked = (pos: Vec2, radius: number) =>
    obstacles.some((o) => distance(pos, o.pos) < o.radius + radius);
  // A procedural placement must dodge both flavors of design zone: no mobs,
  // obstacles or decor spawn inside a safe or quiet region (see zones.ts).
  const inNoSpawnZone = (pos: Vec2) =>
    anyZoneContains(def.safeZones, pos) || anyZoneContains(def.quietZones, pos);

  // A spareable unique the hero already SPARED walks the campaign at his side
  // (carried in the loadout's party), so its ENEMY twin must not spawn to be
  // fought again — you don't re-fight your own companion. It stays absent
  // until that companion is gone from the party (a downed one still counts as
  // present; a party that no longer carries it lets the twin return). The
  // loadout hasn't been applied yet (`state.companions` is still empty here),
  // so read the carried party directly.
  const partyCompanions = new Set(
    (loadout?.companions ?? []).map((c) => c.defId),
  );
  const alreadyRecruited = (enemyId: string): boolean => {
    const companion = enemyDef(enemyId).spareable?.companion;
    return companion !== undefined && partyCompanions.has(companion);
  };

  const enemies: Enemy[] = [];
  for (const spawn of def.spawns) {
    // Difficulty-gated spawns sit out the rungs below their `minDifficulty`.
    if (!meetsMinDifficulty(difficulty, spawn.minDifficulty)) continue;
    // A spared companion's enemy twin stays off the board while it is in the
    // party (see `partyCompanions`).
    if (alreadyRecruited(spawn.enemy)) continue;
    if ("at" in spawn) {
      const enemy = applyAuthored(
        spawnEnemy(
          spawn.enemy,
          vec(spawn.at.x, spawn.at.y),
          rng,
          nextId++,
          mobHp,
          0,
          mobLvl,
        ),
        spawn.level,
        spawn.hp,
      );
      // A PATROLLER walks its authored route while dormant (see stepPatrol in
      // working.ts): the runtime route is `at → …waypoints`, walked back and
      // forth, starting outbound toward the first authored waypoint.
      if (spawn.patrol && spawn.patrol.length > 0) {
        enemy.patrol = [
          vec(spawn.at.x, spawn.at.y),
          ...spawn.patrol.map((p) => vec(p.x, p.y)),
        ];
        enemy.patrolIndex = 1;
        enemy.patrolDir = 1;
      }
      // An ALARM-LINKED mob calls its spawn point the moment it wakes (see
      // raiseAlarm in spawners.ts).
      if (spawn.alarms) enemy.alarms = spawn.alarms;
      enemies.push(enemy);
      continue;
    }
    const [bandMin, bandMax] = spawn.band;
    const count = scaledMobCount(spawn.count, difficulty);
    for (let i = 0; i < count; i++) {
      const margin = enemyDef(spawn.enemy).radius + 4;
      let pos = vec(0, 0);
      // Rejection sampling is fine at this scale; the attempt cap keeps
      // pathological seeds from looping forever.
      for (let attempts = 0; attempts < 40; attempts++) {
        pos = vec(
          randomRange(rng, margin, def.width - margin),
          randomRange(rng, margin, def.height - margin),
        );
        const fromSpawn = distance(pos, playerSpawn) / bandReach;
        if (
          fromSpawn >= bandMin &&
          fromSpawn <= bandMax &&
          distance(pos, playerSpawn) >= ENEMY_AI.minSpawnDistance &&
          !blocked(pos, margin) &&
          !inNoSpawnZone(pos)
        ) {
          break;
        }
      }
      const s = scaleRegular();
      enemies.push(
        spawnEnemy(
          spawn.enemy,
          pos,
          rng,
          nextId++,
          s.hpMult,
          0,
          s.mlvl,
          s.banded,
        ),
      );
    }
  }

  // The scripted vanguard (see LevelDef.openingStrike): a lone rusher placed
  // ahead of the pack, marked so only ITS first touch arms the holstered hero.
  if (def.openingStrike) {
    const s = scaleRegular();
    const rusher = spawnEnemy(
      def.openingStrike.enemy,
      vec(def.openingStrike.at.x, def.openingStrike.at.y),
      rng,
      nextId++,
      s.hpMult,
      0,
      s.mlvl,
      s.banded,
    );
    rusher.vanguard = true;
    enemies.push(rusher);
  }

  // The level's RARE & UNIQUE encounters (config RARE_MOBS): each tier rolled
  // once per run — a rare on most runs, a named unique on a fraction of them.
  // Rolled on the dedicated `rareRng` so a level with `rareSpawns` keeps its
  // main rng sequence (and every downstream combat/loot roll) exactly as it
  // was without them — the merchant's own-stream trick.
  placeRareEncounters(
    rareRng,
    def,
    playerSpawn,
    bandReach,
    blocked,
    enemies,
    () => nextId++,
    mobHp,
    mobLvl,
  );

  const decor = [...propLines.decor, ...scatterDecor(rng, def)];
  // The CANOPY drifts on its OWN stream, for the same reason the wall chain does:
  // it is pure presentation, and drawing from the main stream would shift every
  // obstacle and spawn on every level that gained one.
  const canopy = scatterCanopy(createRng((seed ^ 0x2545f491) >>> 0), def);
  // The FAUNA gets its own stream too, and for the same reason — a level that
  // grows a herd must not shift where its rocks landed.
  const critters = scatterFauna(createRng((seed ^ 0x27220a95) >>> 0), def);

  // Untouchable dialogue figures and neutral bystanders are not foes: neither
  // can be killed as it stands, so counting them would leave the HUD's total
  // forever out of reach. A bystander PROVOKED mid-run joins the tally, which
  // is correct — it can be killed now, and the player made it so.
  const foeCount = enemies.filter(countsAsFoe).length;

  // The wave budget is part of the level's population from the start — the
  // HUD's "ghosts N/total" counts the whole haunting, not just the placed few.
  const waveTotal = (def.waves?.budget ?? []).reduce(
    (sum, entry) =>
      meetsMinDifficulty(difficulty, entry.minDifficulty)
        ? sum + scaledMobCount(entry.count, difficulty)
        : sum,
    0,
  );

  // Placed packs sleep until the player nears them (stepPacks), but their
  // members are part of the level's population from the start — resolve each
  // pack's count for this difficulty now so the HUD total counts the whole
  // level and a `clearAll` objective waits for every pack to be woken and
  // wiped (see `unspawnedMinions`).
  const packs: PackState[] = (def.packs ?? []).map((pack) => {
    const total = pack.members.reduce(
      (sum, member) => sum + resolvePackCount(member.count, difficulty),
      0,
    );
    return {
      at: { ...pack.at },
      triggerRadius: pack.triggerRadius ?? PACKS.triggerRadius,
      spawnRadius: pack.spawnRadius ?? PACKS.spawnRadius,
      status: "dormant",
      total,
      memberIds: [],
    };
  });
  const packTotal = packs.reduce((sum, pack) => sum + pack.total, 0);

  // SPAWN POINTS (spawners.ts): flatten each point's difficulty-scaled members
  // into an emission queue it drips out once the hero trips it. The `lingering`
  // front of that queue is PRE-PLACED around the point right now — a cluster
  // already standing guard (dormant, waking on approach) — so a point reads as a
  // knot of mobs with reinforcements, not an empty tile. Gated by `minDifficulty`
  // — the whole point by its own, and each MEMBER LINE by its own on top, so one
  // point can field a worse breed on the higher rungs (see the hellgates).
  const spawners: SpawnerRuntime[] = [];
  let spawnerLingering = 0;
  for (const s of def.spawners ?? []) {
    if (!meetsMinDifficulty(difficulty, s.minDifficulty)) continue;
    const queue: string[] = [];
    for (const member of s.members) {
      if (!meetsMinDifficulty(difficulty, member.minDifficulty)) continue;
      const n = scaledMobCount(member.count, difficulty);
      for (let i = 0; i < n; i++) queue.push(member.enemy);
    }
    // A member-gated point can resolve to an EMPTY mix on a low rung (every line
    // gated out); skip it rather than parking a point that can never emit.
    if (queue.length === 0) continue;
    const at = vec(s.at.x, s.at.y);
    const spawnRadius = s.spawnRadius ?? SPAWNERS.spawnRadius;
    // Stand the lingering cluster around the point at creation, scattered clear
    // of walls; they wake on approach like any placed mob. Pulled off the queue
    // so they aren't ALSO streamed in later. A HELLGATE never lingers: its mobs
    // may not stand on the map before the rampage has torn the gate open.
    const linger =
      s.lingering && !s.hellgate
        ? Math.min(queue.length, scaledMobCount(s.lingering, difficulty))
        : 0;
    for (let i = 0; i < linger; i++) {
      const enemyId = queue.shift()!;
      const radius = enemyDef(enemyId).radius;
      let pos = {
        x: clamp(at.x, radius, def.width - radius),
        y: clamp(at.y, radius, def.height - radius),
      };
      for (let attempt = 0; attempt < SPAWNERS.placeAttempts; attempt++) {
        const angle = rng() * Math.PI * 2;
        const d = Math.sqrt(rng()) * spawnRadius;
        const p = {
          x: clamp(at.x + Math.cos(angle) * d, radius, def.width - radius),
          y: clamp(at.y + Math.sin(angle) * d, radius, def.height - radius),
        };
        if (!blocked(p, radius)) {
          pos = p;
          break;
        }
      }
      const sc = scaleRegular(s.mobLevels);
      enemies.push(
        spawnEnemy(
          enemyId,
          pos,
          rng,
          nextId++,
          sc.hpMult,
          0,
          sc.mlvl,
          sc.banded,
        ),
      );
      spawnerLingering++;
    }
    // The post-kill refill pace: the authored (or default) base delay, shortened
    // for the rung, for how close this point sits to the level's boss, and for
    // how deep into the campaign the map is — so later maps and boss bays refill
    // relentlessly (see resolveSpawnerRespawnDelay).
    const distToBoss =
      bossSpawn && "at" in bossSpawn ? distance(at, bossSpawn.at) : Infinity;
    // A HELLGATE takes its whole cadence from config HELLGATES, not from the
    // authored point fields: the gates are a system, tuned in one place, and
    // every one of these numbers is re-derived per tick from the live rampage
    // stage anyway (see `hellgateTuning`). The `openStage` it carries is what
    // marks it a gate for the rest of the engine, and `refill` is the mix it
    // re-queues so it never runs dry while the meter holds.
    const hellgate = s.hellgate === true;
    spawners.push({
      id: s.id ?? null,
      at,
      triggerRadius: hellgate
        ? HELLGATES.triggerRadius
        : (s.triggerRadius ?? SPAWNERS.triggerRadius),
      spawnRadius,
      intervalMs: hellgate
        ? HELLGATES.intervalMs
        : (s.intervalMs ?? SPAWNERS.intervalMs),
      perEmit: hellgate ? HELLGATES.perEmit : (s.perEmit ?? SPAWNERS.perEmit),
      // The rung's crowd thickness, thinned on the doorstep. A hellgate keeps
      // its own cap (re-derived per tick from the rampage stage, under its own
      // global budget), but an ordinary point's is scaled by `aliveMult` —
      // without this the whole campaign held a flat 14 live members per point on
      // EVERY difficulty, since the only other place `aliveMult` is read is the
      // wave spawner and `the_bunker` is the only map that streams waves — and
      // then softened by how close the point sits to where the hero lands (see
      // resolveLandingSoftening).
      maxAlive: hellgate
        ? HELLGATES.maxAlive
        : Math.max(
            1,
            Math.round(
              scaledAliveCap(s.maxAlive ?? SPAWNERS.maxAlive, difficulty) *
                resolveLandingSoftening(
                  distance(at, playerSpawn),
                  bandReach,
                  difficulty,
                ),
            ),
          ),
      respawnDelayMs: hellgate
        ? HELLGATES.respawnDelayMs
        : resolveSpawnerRespawnDelay(
            s.respawnDelayMs ?? SPAWNERS.respawnDelayMs,
            difficulty,
            distToBoss,
            bandReach,
            levelId,
          ),
      lastLive: 0,
      queue,
      total: queue.length,
      status: "dormant" as const,
      drainedAtMs: null,
      emitAtMs: 0,
      memberIds: [],
      after: s.after ?? null,
      afterDelayMs: s.afterDelayMs ?? SPAWNERS.chainDelayMs,
      mobLevels: s.mobLevels,
      ...(hellgate
        ? {
            openStage: Math.max(1, s.openStage ?? HELLGATES.openStage),
            refill: [...queue],
          }
        : {}),
    });
  }
  // The level's OWED foe count. A hellgate's queue is deliberately left out: it
  // is bonus content behind a rampage the run may never reach, and it re-queues
  // itself forever once open — counting it would inflate the HUD's remaining-foe
  // readout on every nightmare run and starve the last-monster-standing trophy.
  const spawnerTotal =
    spawners.reduce((sum, s) => sum + (s.openStage ? 0 : s.total), 0) +
    spawnerLingering;

  // The prelude may be a single scene or a chain (the launch, then the
  // flight); each scene resolves its per-difficulty variant when one is
  // registered (`<id>_<difficulty>`), so the weapon on the living-room wall
  // is always the one this run actually starts with. The CUTSCENES display
  // preference drops the whole prelude (straight to the intro) when off.
  const preludes = areCutscenesEnabled()
    ? (typeof def.prelude === "string"
        ? [def.prelude]
        : (def.prelude ?? [])
      ).map((id) => cutsceneVariant(id, difficulty))
    : [];

  // The DIALOGUE display preference starts the run muted when off, silencing
  // every in-world scene — and the hero's opening monologue with them: a muted
  // run skips the `intro` phase straight to the level-name card (exactly like
  // tapping SKIP), so DIALOGUE off means no story text anywhere.
  const dialogueMuted = !isDialogueEnabled();

  const state: GameState = {
    phase: preludes.length > 0 ? "cutscene" : dialogueMuted ? "title" : "intro",
    respecPending: respec,
    cutscene:
      preludes.length > 0 ? createCutscene(cutsceneDef(preludes[0]!)) : null,
    cutsceneQueue: preludes.slice(1),
    introPage: 0,
    outroPage: 0,
    quakeMs: 0,
    combatGraceMs: 0,
    freeze: false,
    difficulty,
    menace: 0,
    menaceFloor: 0,
    evoProof: 0,
    evoRatchetMs: 0,
    combatDps: 0,
    combatKillRate: 0,
    minionSpawnRate: 0,
    minionKillRate: 0,
    pendingMinionSpawns: 0,
    pendingMinionKills: 0,
    lastMenaceAttack: -1,
    menaceExemptDamage: 0,
    menaceExemptKills: 0,
    level: {
      id: def.id,
      index: def.index,
      name: def.name,
      width: def.width,
      height: def.height,
      gravity: def.gravity,
      biome: def.biome,
      tiles: def.tiles,
      foes: def.foes,
    },
    // THE MAP TRAVELS WITH THE RUN (see `runLevelDef`): the catalog holds only
    // the MISSION — the story, the ladder, the loot pools — and has no geometry
    // on it at all, so anything that asks the catalog mid-run gets no answer.
    carvedLevel: def,
    playerSpawn,
    landmarks: def.landmarks.map((l) => ({
      kind: l.kind,
      sprite: l.sprite ?? l.kind,
      anchor: l.anchor ?? "center",
      pos: { ...l.pos },
    })),
    dialogue: null,
    dialogueMuted,
    choice: null,
    companions: [],
    storyItems: [],
    clearedLevels,
    thoughtsSeen: [],
    capThoughtMs: 0,
    capThoughtIdx: 0,
    doors,
    elevators: (def.elevators ?? []).map((e) => ({
      id: e.id,
      pos: { ...e.pos },
      to: { ...e.to },
      sprite: e.sprite ?? "elevator_pad",
      radius: e.radius ?? ELEVATOR.rideRadius,
      ...(e.label ? { label: e.label } : {}),
      ...(e.opensWith ? { opensWith: e.opensWith } : {}),
      used: false,
    })),
    elevatorLockMs: 0,
    lairs: (def.lairs ?? []).map((l) => ({
      id: l.id,
      pos: { ...l.pos },
      open: false,
      sprite: l.sprite,
      openSprite: l.openSprite,
      triggerRadius: l.triggerRadius ?? LAIR_TRIGGER,
    })),
    // Travel gates stay latent until their key trinket is USED (spendGateKey).
    gates: [],
    // The wandering merchant: placed (and forever rolled) on his own seeded
    // stream, so the run's rng sequence is exactly what it was without him.
    merchant: createMerchant(
      seed,
      def,
      playerSpawn,
      blocked,
      merchantDiscovered,
    ),
    // The parked machines minted above (their footprints already stand in
    // `obstacles`) — the car and the ship, where the carve pinned them.
    vehicles,
    // No wheel has come off anything yet — crashes fill this.
    wheelDebris: [],
    // The people with errands on this map (see quests/). Placed exactly where
    // they are authored — a person with a quest is a landmark, and one that
    // moved between runs could not be walked back to.
    questGivers: createQuestGivers(def.id, blocked),
    quests: {},
    // Minted lazily, once per errand, the first time its conversation opens.
    questRewards: {},
    questOffer: null,
    talk: null,
    questFlags: {},
    escorts: [],
    explored: createExplored(def),
    mapMarkers: [],
    pathIndex: 0,
    players: [createHero(playerSpawn, def, difficulty, diff, () => nextId++)],
    corpses: [],
    enemies,
    projectiles: [],
    items: [],
    decor,
    canopy,
    critters,
    obstacles,
    obstaclesVersion: 0,
    wells: buildWells(def, () => nextId++),
    asteroids: [],
    craters: [],
    // The first rock is owed a full interval; 0 on levels without the rain.
    asteroidTimerMs: def.asteroids
      ? randomRange(rng, def.asteroids.everyMs[0], def.asteroids.everyMs[1])
      : 0,
    hayBalls: [],
    // The first bale is owed a full interval; 0 on levels without them.
    hayBallTimerMs: def.hayBalls
      ? randomRange(rng, def.hayBalls.everyMs[0], def.hayBalls.everyMs[1])
      : 0,
    sandstorms: [],
    // The first storm is owed a full interval; 0 on levels without squalls.
    sandstormTimerMs: def.sandstorms
      ? randomRange(rng, def.sandstorms.everyMs[0], def.sandstorms.everyMs[1])
      : 0,
    // Burning floor is laid by a BOSS, not by the level, so it starts empty on
    // every map rather than being conditioned on any level data.
    scorches: [],
    baits: [],
    stampedes: [],
    // The first herd is owed a full interval; 0 on levels without stampedes.
    stampedeTimerMs: def.stampedes
      ? randomRange(rng, def.stampedes.everyMs[0], def.stampedes.everyMs[1])
      : 0,
    stampedeRumbleMs: 0,
    stampedeWarn: null,
    bagFullHintCooldownMs: 0,
    staminaEmptyMs: 0,
    staminaRegenLockMs: 0,
    deathScene: null,
    departure: null,
    victoryCountdownMs: null,
    bossCorpse: null,
    bossDeath: null,
    staying: false,
    // The AUTO PILOT meter opens disengaged; the app re-arms it on the next
    // run when a session spans levels (see autopilot.ts).
    autopilot: {
      active: false,
      speed: 1,
      drainCarry: 0,
      coinsSpent: 0,
      coinsEarned: 0,
    },
    levelUpFxMs: 0,
    minionEquipmentDrops: 0,
    waveSpawned: (def.waves?.budget ?? []).map(() => 0),
    packs,
    spawners,
    moveSpawnCredit: 0,
    // The camp clock opens anchored on the spawn — standing at the lander
    // farming the opening waves is exactly the camping the starvation answers.
    campAnchor: { ...playerSpawn },
    campMs: 0,
    trickleMs: 0,
    nukeCalmMs: 0,
    nukeRecoverMs: 0,
    // Resolve the scripted opening drops: a rolled [min, max] threshold picks
    // a concrete kill discovered in play; a fixed number stands as authored.
    earlyDropKills: (def.loot.earlyDrops ?? []).map((d) =>
      Array.isArray(d.atKills)
        ? Math.floor(randomRange(rng, d.atKills[0], d.atKills[1] + 1))
        : d.atKills,
    ),
    // The scripted opening drops fire in kill order from the first entry.
    earlyDropCursor: 0,
    stats: {
      kills: 0,
      totalEnemies: foeCount + waveTotal + packTotal + spawnerTotal,
      shotsFired: 0,
      jumps: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsCollected: 0,
      goldCollected: 0,
      coinsSold: 0,
      xpGained: 0,
      xpLost: 0,
      timeMs: 0,
      combatMs: 0,
      peakMenace: 0,
    },
    events: [],
    pendingProcs: [],
    pendingCritBlobs: [],
    pendingReflects: [],
    nextId,
    rng,
    fxRng,
    goldRng,
  };

  // The hero has seen where he lands: the map opens with the spawn uncovered.
  revealAround(state, playerSpawn);
  // A `revealed` venue (his own garage) he knows by heart: the whole floor
  // is lit from the first frame — nothing ever re-fogs, so one fill is all
  // it takes.
  if (def.revealed) state.explored.fill(1);

  // SEAT 0 IS CORRECT FOR THE REST OF THIS FUNCTION, and for exactly one
  // reason: `createGame` MINTS the party, and it mints it with one hero in it.
  // Every joiner arrives later through `seatHero`, which dresses their own seat
  // from their own arrival parameters — so "the hero" here is not a stand-in
  // for a parameter, it is the only hero that exists yet.
  //
  // The difficulty's head start: pre-allocated stat points (the gentler rungs
  // open with a few level-ups' worth of training banked). Applied before any
  // loadout, which simply overwrites them with the hero's own earned stats.
  for (const [stat, points] of Object.entries(diff.startingStats)) {
    state.players[0].stats[stat as StatName] += points ?? 0;
  }
  // The clothes on his back: each startingGear def minted plain into its
  // slot — base armor, full durability, no affixes. A loadout (below) simply
  // overwrites them with whatever the hero actually wore out of the last run.
  for (const gearId of diff.startingGear ?? []) {
    const def = gearDef(gearId);
    // A TRINKET is never worn (it pays out from the bag) and no rung opens
    // with a second arm filled, so neither is minted onto the body here.
    if (def.slot === "trinket" || isOffhandItem(def.slot)) continue;
    const piece: Equipment = {
      id: state.nextId++,
      defId: gearId,
      slot: def.slot,
      tier: "regular",
      ilvl: def.levelReq ?? 1,
      affixes: [],
    };
    if (def.armor !== undefined) piece.armor = def.armor;
    if (def.durability !== undefined) piece.durability = def.durability;
    // Rings resolve to a free finger; everything else names its own slot.
    const slot = wearSlotFor(state, state.players[0], piece);
    if (slot) state.players[0].equipment[slot] = piece;
  }
  recomputeMaxHp(state, state.players[0]);
  recomputeMaxStamina(state, state.players[0]);
  syncInventoryCapacity(state, state.players[0]);
  state.players[0].hp = state.players[0].maxHp;
  state.players[0].stamina = state.players[0].maxStamina;

  // Hand-placed pickups (locked-room loot, plot pieces on pedestals) mint
  // last: equipment rolls draw on the state's rng exactly like drops do.
  for (const placed of def.placedItems ?? []) {
    state.items.push(placeItem(state, placed));
  }

  // Dress the run in the carried-over progress, when there is any: level,
  // stats, equipment, bag, and powerups from the previous level's clear.
  if (loadout) applyLoadout(state, state.players[0], loadout);

  // A merchant met here before is set up at the door from the outset — revealed
  // now (after the loadout, so his stall prices off the arriving hero's level).
  // A PARKED trader (the hub's counter) is revealed on every run: standing at
  // a counter and waiting to be "discovered" would be a fixture pretending to
  // be an encounter.
  if (merchantDiscovered || def.merchant?.parked) revealMerchant(state);

  return state;
}

/**
 * Resolve a spawn point's POST-KILL RESPAWN DELAY from its base (ms). Three
 * factors shorten it, each ≤ 1 and multiplied together (then floored at
 * `SPAWNERS.respawnDelayMin`):
 *
 * - DIFFICULTY (`DifficultyDef.spawnerRespawnMult`): harder rungs refill faster.
 * - BOSS PROXIMITY: `bossProximityMin` at the boss's spot, ramping to 1× at the
 *   boss's distance from the hero's spawn (`bandReach`) — the boss bay refills
 *   far quicker than the opening rooms. No boss on the map ⇒ 1× everywhere.
 * - CAMPAIGN PROGRESS: 1× on the first map, `mapProgressionMin` on the last, the
 *   maps between interpolated — so the campaign gets progressively harder.
 */
/**
 * THE LANDING RAMP (see `SPAWNERS.landingReach`): how much of its live cap a
 * spawn point keeps, given how far it sits from where the hero lands. A point ON
 * the landing keeps the rung's `landingAliveMin` share; the softening ramps
 * linearly away to none at `landingReach` of the way to the objective, so the
 * map opens thin and thickens as the hero commits to it.
 *
 * Priced off `bandReach` (the spawn→objective axis) rather than a fixed radius
 * so it means the same thing on a hand-authored map and on a carved one — a
 * generated map is roughly twice the area, and a fixed radius would soften a
 * quarter of one and a tenth of the other. Both kinds of map resolve their
 * points through here, so the ramp is one rule rather than two.
 */
function resolveLandingSoftening(
  distToSpawn: number,
  bandReach: number,
  difficulty: Difficulty,
): number {
  const floor = difficultyDef(difficulty).landingAliveMin ?? 1;
  if (floor >= 1) return 1;
  const reach = bandReach * SPAWNERS.landingReach;
  if (!(reach > 0) || !Number.isFinite(distToSpawn)) return 1;
  const t = clamp(distToSpawn / reach, 0, 1);
  return floor + (1 - floor) * t;
}

function resolveSpawnerRespawnDelay(
  baseMs: number,
  difficulty: Difficulty,
  distToBoss: number,
  bandReach: number,
  levelId: string,
): number {
  const diffMult = difficultyDef(difficulty).spawnerRespawnMult ?? 1;
  const t =
    bandReach > 0 && Number.isFinite(distToBoss)
      ? clamp(distToBoss / bandReach, 0, 1)
      : 1;
  const bossMult =
    SPAWNERS.bossProximityMin + (1 - SPAWNERS.bossProximityMin) * t;
  const { position, total } = levelPosition(levelId);
  const progress = total > 1 ? position / (total - 1) : 0;
  const mapMult = 1 + (SPAWNERS.mapProgressionMin - 1) * progress;
  return Math.max(
    SPAWNERS.respawnDelayMin,
    Math.round(baseMs * diffMult * bossMult * mapMult),
  );
}

/** Mint one of the level def's hand-placed pickups. */
function placeItem(
  state: GameState,
  placed: NonNullable<LevelDef["placedItems"]>[number],
): Item {
  const pos = { ...placed.pos };
  const id = state.nextId++;
  if (placed.kind === "equipment") {
    return {
      id,
      kind: "equipment",
      pos,
      // Minted during `createGame`, when the party is one hero — see the note
      // in `createGame` above.
      equipment: rollEquipment(state, state.players[0], {
        defId: placed.defId,
      }),
    };
  }
  if (placed.kind === "story") {
    return { id, kind: "story", pos, defId: placed.defId };
  }
  return { id, kind: placed.kind, pos };
}

/**
 * Roll and place the level's RARE & UNIQUE encounters (see config RARE_MOBS
 * and `LevelDef.rareSpawns`). Each tier rolls its existence once, picks one
 * candidate, lands it at a banded spot along the spawn→objective axis (the
 * `SpawnSpec.band` yardstick), and — for a rare pack mob — scatters the
 * rolled pack count around that anchor so the encounter reads as one find.
 */
function placeRareEncounters(
  rng: Rng,
  def: LevelDef,
  playerSpawn: Vec2,
  bandReach: number,
  blocked: (pos: Vec2, radius: number) => boolean,
  enemies: Enemy[],
  takeId: () => number,
  mobHp: number,
  mobLvl: number,
): void {
  for (const kind of ["rare", "unique"] as const) {
    const candidates = def.rareSpawns?.[kind] ?? [];
    if (candidates.length === 0) continue;
    if (rng() >= RARE_MOBS.encounterChance[kind]) continue;
    const pick = candidates[Math.floor(rng() * candidates.length)] as string;
    const mob = enemyDef(pick);
    const margin = mob.radius + 4;
    const [bandMin, bandMax] = RARE_MOBS.band;
    // Banded rejection sampling, same shape as the ordinary spawn bands; the
    // fallback (a pathological seed exhausting its attempts) is mid-map.
    let anchor = vec(def.width / 2, def.height / 2);
    for (let attempts = 0; attempts < 40; attempts++) {
      const pos = vec(
        randomRange(rng, margin, def.width - margin),
        randomRange(rng, margin, def.height - margin),
      );
      const fromSpawn = distance(pos, playerSpawn) / bandReach;
      if (
        fromSpawn >= bandMin &&
        fromSpawn <= bandMax &&
        distance(pos, playerSpawn) >= ENEMY_AI.minSpawnDistance &&
        !blocked(pos, margin)
      ) {
        anchor = pos;
        break;
      }
    }
    const count =
      kind === "rare" && mob.pack
        ? Math.floor(randomRange(rng, mob.pack[0], mob.pack[1] + 1))
        : 1;
    for (let i = 0; i < count; i++) {
      const pos =
        i === 0
          ? { ...anchor }
          : vec(
              clamp(
                anchor.x +
                  randomRange(
                    rng,
                    -RARE_MOBS.packScatter,
                    RARE_MOBS.packScatter,
                  ),
                margin,
                def.width - margin,
              ),
              clamp(
                anchor.y +
                  randomRange(
                    rng,
                    -RARE_MOBS.packScatter,
                    RARE_MOBS.packScatter,
                  ),
                margin,
                def.height - margin,
              ),
            );
      enemies.push(spawnEnemy(pick, pos, rng, takeId(), mobHp, 0, mobLvl));
    }
  }
}

/** Mint one enemy instance (also used by the wave spawner in step/).
 * `hpMult` is the horde's relative-level hp scale the caller resolved
 * (mobHpScaleFor / mobLevelScale). Kill XP is LEVEL-based (`mobLevelXp` off the
 * mob's `mlvl`), not hp-based, so hp and xp are decoupled. `evo` is the menace
 * evolution stage stamped onto a MINION spawned while the horde is rampaging
 * (see menace.ts): it adds ONE LEVEL PER STAGE to the mob's monster level
 * (`evolutionLevelBonus`), which is what makes it tougher, meaner, worth more
 * xp and richer to loot — all through the same `mlvl` the ordinary spawn band
 * moves. Elites and bosses ignore `evo` — they instead power-match
 * the player when they engage (maybePowerScale). */
/**
 * Stamp a freshly-spawned instance with a SET PIECE's authored per-difficulty
 * level and base hp — the pinned-elite/boss path, shared by level creation and by
 * anything that mints a set piece mid-run (a lair's occupant coming through its
 * door).
 *
 * It pins `mlvl` (so `maybePowerScale` keeps it instead of re-stamping the mob
 * player-relative) and sets the authored base maxHp the live power-match then
 * multiplies. A no-op when unauthored, leaving the relative placement untouched.
 */
export function applyAuthoredScaling(
  enemy: Enemy,
  level: DifficultyMobLevels | undefined,
  hp: DifficultyHp | undefined,
  difficulty: Difficulty,
  rng: Rng,
): Enemy {
  const lvl = rollMobLevel(level, difficulty, rng);
  if (lvl === null) {
    // JESUS: the LEVEL (and with it the loot) stays player-relative — a JESUS
    // hero has out-levelled every authored number — but the HP must NOT fall
    // through to the minion spawn path: there a pinned boss's catalog bar rides
    // the geometric per-level hp curve (×200+ at the JESUS floor) and the engage
    // power-match multiplies it AGAIN, landing set pieces at 30k–320k hp — a
    // 10–30 minute fight no build sustains. Anchor it like every other rung
    // instead: the authored NIGHTMARE bar × one more rung step
    // (MENACE.jesusPinnedHpMult); maybePowerScale then scales it to the hero who
    // actually shows up, same as always.
    if (hp) {
      enemy.maxHp = Math.max(1, Math.round(hp[3] * MENACE.jesusPinnedHpMult));
      enemy.hp = enemy.maxHp;
    }
    return enemy;
  }
  enemy.mlvl = lvl;
  enemy.authoredMlvl = lvl;
  const idx = difficultyBandIndex(difficulty);
  if (hp && idx !== null) {
    enemy.maxHp = Math.max(1, Math.round(hp[idx]!));
    enemy.hp = enemy.maxHp;
  }
  return enemy;
}

export function spawnEnemy(
  defId: string,
  pos: Vec2,
  rng: Rng,
  id: number,
  hpMult = 1,
  evo = 0,
  mlvl = 1,
  // HARD-CODED level? Then `mlvl` is the mob's final level (the level spec's
  // rolled band already varies it), so skip the internal ±spawn band that the
  // relative path adds — no double-dip. `true` = the old banded behaviour.
  banded = true,
): Enemy {
  const def = enemyDef(defId);
  const jitter =
    def.role === "boss"
      ? 0
      : randomRange(rng, -ENEMY_AI.speedJitter, ENEMY_AI.speedJitter);
  // The menace EVOLUTION step, in LEVELS: a minion spawned into a rampage of
  // stage N carries N levels over its normal level. Elites/bosses take none —
  // they power-match the hero when their fight opens instead.
  const evolved = def.role === "minion" ? evolutionLevelBonus(evo) : 0;
  // A RARE/UNIQUE mob's whole tier lands here (config RARE_MOBS): the def is
  // authored at ordinary minion numbers and the multipliers make it special.
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  // The PER-MOB SPAWN LEVEL BAND (config MENACE.mobLevelBand): a plain minion
  // rolls a uniform integer offset a few levels either side of the horde
  // baseline, so a wave is a mix of levels rather than a flat clone army. The
  // offset shifts the mob's monster level (feeding its hp here, and its
  // level-based kill XP and loot gates via `mlvl` below). Elites, bosses, and
  // rare/unique mobs skip it — they settle a deterministic mlvl when their
  // fight engages (`maybePowerScale`). A HARD-CODED-level spawn skips it too
  // (`banded=false`) — its authored range is the spread. Drawn from the same
  // seeded rng as the speed jitter, so runs stay reproducible.
  const band =
    banded && def.role === "minion" && !rarity
      ? Math.floor(
          rng() * (MENACE.mobLevelBand.max - MENACE.mobLevelBand.min + 1),
        ) + MENACE.mobLevelBand.min
      : 0;
  // The developer mob-hp knob multiplies in here — the one chokepoint every
  // spawn path funnels through — so placed mobs, waves, and rushers all
  // toughen together. The band AND the evolution stage both shift the mob's
  // monster LEVEL, so they move hp through the same geometric
  // `mobHpLevelFactor` the caller used for the baseline (`hpMult` =
  // factor(mlvl) × autoPowerScale): the ratio `factor(mlvl+shift) /
  // factor(mlvl)` re-levels the bar, floored by the same `mobHpScaleFloor` so
  // a deep-negative roll can't zero a mob out. Evolution therefore costs no
  // separate multiplier at all — a stage-3 mob is simply a mob three levels
  // higher, in hp exactly as in xp and loot.
  const levelShift = band + evolved;
  const shiftedHpMult =
    levelShift === 0
      ? hpMult
      : hpMult * (mobHpLevelFactor(mlvl + levelShift) / mobHpLevelFactor(mlvl));
  const hp = Math.max(
    1,
    Math.round(
      def.hp *
        Math.max(MENACE.mobHpScaleFloor, shiftedHpMult) *
        BALANCE.mobHp *
        (rarity?.hpMult ?? 1),
    ),
  );
  // ONE HIDDEN CLASS for every enemy. The tick's per-enemy AI loop
  // (step/enemies.ts) reads a dozen instance fields per mob per tick, and the
  // optional ones (`awake`, `spoke`, `vanishMs`, `mech`, `approachRadius`, …)
  // are added lazily during play — each first assignment would transition the
  // object's shape, so with mixed histories every `enemy.*` load in that loop
  // goes MEGAMORPHIC (measured as a top sim cost). Stamping EVERY field here
  // (absent optionals as `undefined`, in the type's declared order) means no
  // later `enemy.x = …` ever grows the shape — it only mutates an existing
  // slot — so all enemies share one hidden class and those loads stay
  // monomorphic. `undefined` reads identically to an absent field at every
  // site (truthy guards, `?? d`, `?.`, `!== undefined`, `??=`), and no code
  // enumerates or `in`-tests enemy keys, so behavior is unchanged.
  const enemy: Enemy = {
    id,
    defId,
    pos,
    home: { ...pos },
    hp,
    maxHp: hp,
    // The MONSTER LEVEL the loot system reads (base levelReq gates, tier
    // unlock gates, the dropped item's own level): the horde baseline the
    // caller resolved (mobLevelFor) plus this def's own head start (a
    // rare/unique tier adds its own — the special finds reach the tier gates
    // early, like elites do). Elites and bosses re-stamp it the moment their
    // fight engages (maybePowerScale), so their drops match the hero who
    // beat them — and rare/unique mobs re-stamp the same way. The menace
    // EVOLUTION stage rides here too (one level per stage), which is the whole
    // of what a rampage does to the rank and file.
    mlvl: Math.max(
      1,
      mlvl + (def.levelBonus ?? 0) + (rarity?.levelBonus ?? 0) + levelShift,
    ),
    speed: mobSpeed(def) * (1 + jitter),
    contactCooldownMs: 0,
    critFlashMs: undefined,
    awake: undefined,
    engaged: undefined,
    spoke: undefined,
    evo: undefined,
    powerScaled: undefined,
    contactMult: undefined,
    authoredMlvl: undefined,
    chillMs: undefined,
    chillFactor: undefined,
    vanguard: undefined,
    workRng: undefined,
    workTarget: undefined,
    workLegMs: undefined,
    workPauseMs: undefined,
    patrol: undefined,
    patrolIndex: undefined,
    patrolDir: undefined,
    patrolBestDist: undefined,
    patrolStuckMs: undefined,
    alarms: undefined,
    approachRadius: undefined,
    vanishMs: undefined,
    rangedCooldownMs: undefined,
    mech: undefined,
    knockMs: undefined,
    knockVel: undefined,
  };
  // The horde's gentle per-level DAMAGE ramp (MENACE.mobDamagePerLevel),
  // stamped at spawn like the hp scale — times the rare/unique tier's meaner
  // touch. Elites/bosses overwrite it when their fight engages
  // (maybePowerScale folds it in with the power-match share).
  const contactScale =
    mobContactScaleFor(enemy.mlvl) * (rarity?.damageMult ?? 1);
  if (contactScale !== 1) enemy.contactMult = contactScale;
  if (evolved > 0) enemy.evo = evolved;
  return enemy;
}

/**
 * Expand one wall/door segment into a chain of solid circles. Centers step by
 * 1.5× the radius, so neighbouring circles overlap enough that no body can slip
 * between them — a segment collides as one continuous wall.
 *
 * A wall may ask for a SPRITE POOL and a MEANDER (`sprites` / `wander` on the
 * spec), which is what turns a chain from a stamped lattice into a ridge: each
 * stone picks its own sprite and the line drifts off true. Both are drawn from
 * `wallRng` — the level's own wall stream — so they cost the main generation
 * stream nothing and a map that asks for neither lays out byte-identically to
 * before.
 *
 * The drift is a bounded RANDOM WALK, tapered to nothing at both ends, and that
 * is what keeps it safe rather than merely pretty. Independent per-stone jitter
 * could put two neighbours a full diameter apart and open a hole a hero walks
 * through — a wall with a secret door nobody designed. A walk whose per-stone
 * step is a fraction of the radius can never separate neighbours by more than
 * the overlap allows, and tapering the ends to zero leaves the segment's
 * endpoints exactly where they were, so wall junctions still meet and a
 * doorway's edges stay put.
 */
function expandSegment(
  kind: string,
  sprite: string,
  from: Vec2,
  to: Vec2,
  radius: number,
  jumpable: boolean,
  takeId: () => number,
  opts?: { sprites?: string[]; wander?: number; rng?: Rng },
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / (radius * 1.5)));
  const pool = opts?.sprites?.length ? opts.sprites : null;
  const rng = opts?.rng;
  // Cap the drift at a little over a radius: beyond that the chain stops reading
  // as one ridge and starts reading as scattered rocks that happen to line up.
  const drift = rng ? Math.min(opts?.wander ?? 0, radius * 1.6) : 0;
  const step = radius * 0.3;
  const dir = normalize(to.x - from.x, to.y - from.y);
  let along = 0;
  let across = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let x = from.x + (to.x - from.x) * t;
    let y = from.y + (to.y - from.y) * t;
    if (drift > 0 && rng) {
      along = clamp(along + (rng() - 0.5) * 2 * step, -drift, drift);
      across = clamp(across + (rng() - 0.5) * 2 * step, -drift, drift);
      // sin() is 0 at both ends and 1 in the middle: the ridge is pinned where it
      // has to meet something and free where it does not.
      const taper = Math.sin(Math.PI * t);
      x += (dir.x * along - dir.y * across) * taper;
      y += (dir.y * along + dir.x * across) * taper;
    }
    obstacles.push({
      id: takeId(),
      kind,
      sprite:
        pool && rng
          ? (pool[Math.floor(rng() * pool.length)] as string)
          : sprite,
      pos: vec(x, y),
      radius,
      jumpable,
    });
  }
  return obstacles;
}

/**
 * Expand the level's wall segments into chains of solid circles. Deliberate
 * architecture skips the scatter clearance rules: door gaps are the
 * designer's responsibility, not the sampler's.
 */
function buildWalls(
  def: LevelDef,
  takeId: () => number,
  wallRng: Rng,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const wall of def.walls ?? []) {
    obstacles.push(
      ...expandSegment(
        wall.kind,
        wall.sprite ?? wall.kind,
        wall.from,
        wall.to,
        wall.radius,
        wall.jumpable,
        takeId,
        // Only a wall that ASKS for variety touches the wall stream, so a map
        // authored without it keeps the exact chain it always had.
        wall.sprites || wall.wander
          ? { sprites: wall.sprites, wander: wall.wander, rng: wallRng }
          : undefined,
      ),
    );
  }
  return obstacles;
}

/**
 * Expand the level's hand-placed BUILDINGS (`LevelDef.buildings`) into
 * box-collider obstacles: one solid rectangle per building, centred on its
 * `pos`, colliding (and blocking sight/shots) as its `w`×`h` footprint. The
 * `radius` is the circumscribed radius — the coarse cull/spacing figure the
 * scatter and grid use — while `half` carries the true box.
 */
function buildBuildings(def: LevelDef, takeId: () => number): Obstacle[] {
  const obstacles: Obstacle[] = [];
  for (const b of def.buildings ?? []) {
    const half = vec(b.w / 2, b.h / 2);
    obstacles.push({
      id: takeId(),
      kind: "building",
      sprite: b.sprite,
      pos: vec(b.pos.x, b.pos.y),
      radius: boundingRadius(half),
      half,
      jumpable: b.jumpable ?? false,
    });
  }
  return obstacles;
}

/**
 * Expand the level's PROP LINES (`LevelDef.propLines`) into STRUCTURED placements:
 * a sprite stamped every `spacing` world px along each `from`→`to` segment, so a
 * factory floor reads as aligned rows (a conveyor belt, a line of workstations, a
 * painted lane) instead of random scatter. Deterministic — no rng, so the
 * structure sits exactly where the author drew it. A `collide` line yields box/
 * circle `Obstacle`s (like a `building`); a flat line yields non-colliding
 * `Decor`. The first prop sits on `from`, the rest march toward `to` at
 * `spacing`, the last one at or before `to`.
 */
export function buildPropLines(
  def: LevelDef,
  takeId: () => number,
): { obstacles: Obstacle[]; decor: Decor[] } {
  const obstacles: Obstacle[] = [];
  const decor: Decor[] = [];
  // A RANK YIELDS TO A PICKUP. The ranks are laid down deterministically and
  // the hand-placed pieces sit where the level put them, so a line whose stride
  // happens to land on a plot piece walls it in — and a story item the hero can
  // see and cannot reach is a chain that stops with nothing to read. The prop is
  // skipped rather than nudged: a rank with a gap in it reads as a rank
  // somebody left room in, where a rank with one prop shunted aside reads as a
  // mistake.
  const spared = (pos: Vec2, radius: number): boolean =>
    (def.placedItems ?? []).every(
      (p) => distance(pos, p.pos) > PICKUP_CLEARANCE + radius,
    ) &&
    (def.chests ?? []).every(
      (c) => distance(pos, c.at) > PICKUP_CLEARANCE + radius,
    );
  for (const line of def.propLines ?? []) {
    const n = normalize(line.to.x - line.from.x, line.to.y - line.from.y);
    const step = Math.max(1, line.spacing);
    for (let d = 0; d <= n.len + 1e-6; d += step) {
      const pos = vec(line.from.x + n.x * d, line.from.y + n.y * d);
      if (line.collide) {
        const half = line.half ? vec(line.half.x, line.half.y) : undefined;
        const radius = half ? boundingRadius(half) : (line.radius ?? 8);
        if (!spared(pos, radius)) {
          if (n.len === 0) break;
          continue;
        }
        obstacles.push({
          id: takeId(),
          kind: line.sprite,
          sprite: line.sprite,
          pos,
          radius,
          ...(half ? { half } : {}),
          jumpable: line.jumpable ?? false,
        });
      } else {
        decor.push({ kind: line.sprite, sprite: line.sprite, pos });
      }
      if (n.len === 0) break;
    }
  }
  return { obstacles, decor };
}

/**
 * Expand one DOORWAY into the chain of slat blocks that fills it.
 *
 * A door is not a wall run, and expanding it as one gets it visibly wrong. The
 * `from`–`to` span a door is given is the doorway's two EDGES — the centres of
 * the wall stones flanking the hole — so each of those stones already covers a
 * radius of the span. A wall-style chain, which puts a stone on each endpoint,
 * therefore hangs half a block of door over the wall at either end: a door a
 * whole block wider than the doorway it hangs in.
 *
 * So the END blocks are pinned half a block INSIDE those edges — their sprites
 * then start exactly where the opening does — and the rest are spread evenly
 * between them. `ceil` on the count is the other half of it: it keeps the
 * spacing from ever opening past a block width and leaving a slot of daylight
 * in the middle of a shut door.
 *
 * A door built this way tiles at a full block (`2 × radius` — a wall sprite's
 * own width) wherever the opening divides evenly, which is the point: each
 * block reads as a block, and that is what lets the roll-up take them away one
 * at a time (render/effects.ts `garageDoor`). Tiling that cleanly would leave
 * the colliders merely TANGENT, though, and a hairline seam between two circles
 * is a seam a shot can thread — so the blocks carry a collider inflated back
 * past their spacing. A sprite is drawn at its own size wherever its obstacle
 * sits, so that inflation is collision-only and nothing about the door LOOKS
 * fatter.
 */
function expandDoor(
  sprite: string,
  from: Vec2,
  to: Vec2,
  radius: number,
  takeId: () => number,
): Obstacle[] {
  // The free opening: the span minus the half-stone each flanking wall puts
  // into it. Blocks stand a further half-block in, so their sprites START at
  // the opening's edge rather than straddling it.
  const span = Math.max(0, distance(from, to) - radius * 2);
  const dir = normalize(to.x - from.x, to.y - from.y);
  const count = Math.max(1, Math.ceil(span / (radius * 2)));
  const inner = Math.max(0, span - radius * 2);
  const step = count > 1 ? inner / (count - 1) : 0;
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < count; i++) {
    // A doorway too narrow for two blocks gets one, in the middle of it.
    const along = count > 1 ? radius * 2 + step * i : radius + span / 2;
    obstacles.push({
      id: takeId(),
      kind: sprite,
      sprite,
      pos: vec(from.x + dir.x * along, from.y + dir.y * along),
      radius: Math.max(radius, step * 0.7),
      jumpable: false,
    });
  }
  return obstacles;
}

/**
 * Expand the level's locked doors into `door_locked` obstacle chains
 * (appended to `obstacles`) and the DoorState entries that let the key
 * remove them again. Doors are never jumpable — a hop over a locked door
 * would make the key a souvenir.
 */
function buildDoors(
  def: LevelDef,
  obstacles: Obstacle[],
  takeId: () => number,
): DoorState[] {
  const doors: DoorState[] = [];
  for (const door of def.doors ?? []) {
    const sprite = door.sprite ?? "door_locked";
    const chain = expandDoor(sprite, door.from, door.to, door.radius, takeId);
    obstacles.push(...chain);
    const first = chain[0] as Obstacle;
    const last = chain[chain.length - 1] as Obstacle;
    const state: DoorState = {
      id: door.id,
      center: vec((door.from.x + door.to.x) / 2, (door.from.y + door.to.y) / 2),
      obstacleIds: chain.map((o) => o.id),
      open: false,
      sprite,
      // The SLATS' own ends, not the doorway's: the roll-up redraws the blocks
      // the obstacles no longer hold, and it can only land them back on their
      // own pixels if it is handed where they actually stood.
      from: vec(first.pos.x, first.pos.y),
      to: vec(last.pos.x, last.pos.y),
    };
    if (door.opens === "approach") state.approach = true;
    if (door.openSprite) state.openSprite = door.openSprite;
    if (door.rollUp) state.rollUp = true;
    doors.push(state);
  }
  return doors;
}

/**
 * Scatter the level's solid obstacles: clear of landmarks (the boss must
 * reach his flag), clear of the player spawn, and spaced apart from each
 * other (walls included) so the field always leaves walkable lanes.
 */
/** Shortest distance from `p` to segment `a`–`b` (a point-to-segment clamp). */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  const t =
    lenSq === 0
      ? 0
      : clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  return distance(p, { x: a.x + abx * t, y: a.y + aby * t });
}

/**
 * Shortest distance from `p` to the intended path — the polyline through the
 * spawn and every `LevelDef.path` waypoint. Infinity on a level with no path, so
 * the keep-clear check below no-ops there.
 */
function distToPath(def: LevelDef, spawn: Vec2, p: Vec2): number {
  const pts = [spawn, ...(def.path ?? [])];
  if (pts.length < 2) return Infinity;
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    best = Math.min(best, distToSegment(p, pts[i]!, pts[i + 1]!));
  }
  return best;
}

/** How much floor a hand-placed pickup keeps to itself, so the scatter can
 * never wall one in: the hero's own width plus the spacing every prop already
 * keeps from its neighbours. */
const PICKUP_CLEARANCE = PLAYER.radius * 2 + OBSTACLES.spacing;

/** A point along a rect's border, inset by `inset` — the wall-hugging
 * candidate an `edge` scatter line draws (furniture against the room's own
 * walls, the floor kept open). */
function edgePoint(
  rng: Rng,
  rect: { x: number; y: number; width: number; height: number },
  inset: number,
): Vec2 {
  const w = Math.max(0, rect.width - inset * 2);
  const h = Math.max(0, rect.height - inset * 2);
  const side = Math.floor(rng() * 4);
  const along = rng();
  switch (side) {
    case 0:
      return vec(rect.x + inset + along * w, rect.y + inset);
    case 1:
      return vec(rect.x + inset + along * w, rect.y + rect.height - inset);
    case 2:
      return vec(rect.x + inset, rect.y + inset + along * h);
    default:
      return vec(rect.x + rect.width - inset, rect.y + inset + along * h);
  }
}

function scatterObstacles(
  rng: Rng,
  def: LevelDef,
  playerSpawn: Vec2,
  walls: Obstacle[],
  crateHp: number,
  takeId: () => number,
): Obstacle[] {
  const scattered: Obstacle[] = [];
  const clearOf = (others: Obstacle[], pos: Vec2, radius: number) =>
    others.every(
      (o) => distance(pos, o.pos) > o.radius + radius + OBSTACLES.spacing,
    );
  for (const spec of def.obstacles) {
    for (let i = 0; i < spec.count; i++) {
      // Sized rocks roll a footprint once per placement (retries keep it): the
      // box's half-extents drive collision, its circumradius the placement.
      const base = spec.sprite ?? spec.kind;
      let half: Vec2 | undefined;
      let radius = spec.radius;
      let sprite = base;
      if (spec.rockSizes && spec.rockSizes.length > 0) {
        const cell = spec.cell ?? 16;
        const [w, h] = spec.rockSizes[
          Math.floor(rng() * spec.rockSizes.length)
        ] as [number, number];
        half = rockHalf(w, h, cell);
        radius = boundingRadius(half);
        sprite = `${base}_${w}x${h}`;
      }
      // EDGE placement candidates hug the borders of the line's district
      // rects — furniture stands against the walls of its room, keeping the
      // floor open (the garage bay's workbench world). The inset holds the
      // prop clear of the wall chain itself.
      const edgeRects: {
        x: number;
        y: number;
        width: number;
        height: number;
      }[] =
        spec.edge && spec.within
          ? spec.within.flatMap((z) => (z.shape === "rect" ? [z.rect] : []))
          : [];
      for (let attempts = 0; attempts < 30; attempts++) {
        const pos =
          edgeRects.length > 0
            ? edgePoint(
                rng,
                edgeRects[Math.floor(rng() * edgeRects.length)]!,
                radius + 14,
              )
            : vec(
                randomRange(rng, radius + 8, def.width - radius - 8),
                randomRange(rng, radius + 8, def.height - radius - 8),
              );
        const clear =
          // A prop that belongs to a DISTRICT only lands inside one (see
          // `within`): the cactus stays in the desert, the crates in the
          // compound, so the map's regions read as different places.
          (spec.within === undefined || anyZoneContains(spec.within, pos)) &&
          distance(pos, playerSpawn) > OBSTACLES.spawnClearance + radius &&
          def.landmarks.every(
            (l) => distance(pos, l.pos) > def.decorClearance + radius,
          ) &&
          // A HAND-PLACED PICKUP MUST BE STANDABLE. A plot piece or a cache is
          // put somewhere on purpose, and the scatter that lands on top of it
          // does not hide it — it walls it in, and a story item the hero can see
          // and cannot reach is a chain that stops with nothing to read. Clear
          // by a body and a step, which is what the pickup radius asks for.
          (def.placedItems ?? []).every(
            (p) => distance(pos, p.pos) > PICKUP_CLEARANCE + radius,
          ) &&
          (def.chests ?? []).every(
            (c) => distance(pos, c.at) > PICKUP_CLEARANCE + radius,
          ) &&
          // Keep the intended path walkable — no furniture on the route.
          distToPath(def, playerSpawn, pos) > PATH.clearance + radius &&
          clearOf(walls, pos, radius) &&
          clearOf(scattered, pos, radius);
        if (!clear) continue;
        const obstacle: Obstacle = {
          id: takeId(),
          kind: spec.kind,
          sprite,
          pos,
          radius,
          jumpable: spec.jumpable,
        };
        if (half) obstacle.half = half;
        // A breakable crate carries live break hp — the hero's weapon smashes
        // it for guaranteed loot (see crates.ts). A chance-based PROP
        // (`spec.loot`) carries its spill odds and themed drop weights too.
        if (spec.breakable) {
          obstacle.breakable = true;
          obstacle.hp = crateHp;
          obstacle.maxHp = crateHp;
          if (spec.loot?.chance !== undefined)
            obstacle.lootChance = spec.loot.chance;
          if (spec.loot?.drop) obstacle.lootDrop = spec.loot.drop;
        }
        scattered.push(obstacle);
        break;
      }
    }
  }
  return scattered;
}

/**
 * Scatter the level's CANOPY — the scenery that floats OVER the field (see
 * `LevelDef.canopy`).
 *
 * Each piece gets a start, a drift and its line's look; the RENDERER derives
 * where it is at any moment from the render clock, so nothing here is stepped and
 * none of it reaches a save. Landmarks and walls are ignored on purpose: this
 * layer is above all of that and collides with nothing.
 */
function scatterCanopy(rng: Rng, def: LevelDef): CanopyPiece[] {
  const out: CanopyPiece[] = [];
  for (const line of def.canopy ?? []) {
    const [driftLo, driftHi] = line.drift ?? [4, 14];
    const [scaleLo, scaleHi] = line.scale ?? [1, 1];
    for (let i = 0; i < line.count; i++) {
      // A drift direction anywhere on the circle, so the layer has no grain.
      const angle = rng() * Math.PI * 2;
      const speed = randomRange(rng, driftLo, driftHi);
      out.push({
        kind: line.kind,
        sprite: line.sprite ?? line.kind,
        pos: vec(rng() * def.width, rng() * def.height),
        vel: vec(Math.cos(angle) * speed, Math.sin(angle) * speed),
        parallax: line.parallax ?? 1.35,
        blur: line.blur ?? 2,
        alpha: line.alpha ?? 0.55,
        scale: randomRange(rng, scaleLo, scaleHi),
      });
    }
  }
  return out;
}

/**
 * Scatter the level's FAUNA — the living scenery that mills about on the ground
 * plane (see `LevelDef.fauna`).
 *
 * Each critter gets a HOME point and a wander envelope; the RENDERER derives
 * where it is at any moment from the render clock, exactly as it does for the
 * canopy. Nothing here is stepped and none of it reaches a save.
 *
 * The home point is drawn inside the line's `within` districts when it has any,
 * so a herd stays on the grass. It is NOT held off obstacles: a cow that clips a
 * fence post for a moment is a cow, and testing every home against the whole
 * obstacle field would cost more than the layer is worth.
 */
function scatterFauna(rng: Rng, def: LevelDef): Critter[] {
  const out: Critter[] = [];
  for (const line of def.fauna ?? []) {
    const [rangeLo, rangeHi] = line.range ?? [40, 110];
    const [speedLo, speedHi] = line.speed ?? [6, 16];
    const [scaleLo, scaleHi] = line.scale ?? [1, 1];
    for (let i = 0; i < line.count; i++) {
      let home = vec(0, 0);
      for (let attempts = 0; attempts < 20; attempts++) {
        home = vec(
          randomRange(rng, 40, def.width - 40),
          randomRange(rng, 40, def.height - 40),
        );
        if (line.within === undefined || anyZoneContains(line.within, home))
          break;
      }
      out.push({
        kind: line.kind,
        sprite: line.sprite ?? line.kind,
        animated: line.animated ?? false,
        home,
        range: randomRange(rng, rangeLo, rangeHi),
        speed: randomRange(rng, speedLo, speedHi),
        // Two independent phases, so the x and y sweeps are out of step and the
        // path is a wandering figure rather than a diagonal.
        phase: vec(rng() * Math.PI * 2, rng() * Math.PI * 2),
        stepSec: randomRange(rng, 0.34, 0.62),
        scale: randomRange(rng, scaleLo, scaleHi),
      });
    }
  }
  return out;
}

/** Scatter the level's decorative features, keeping landmarks clear. A line with
 * a `within` restriction only lands inside those regions (see the obstacle
 * scatter) — a district's own dressing, not the whole map's. */
function scatterDecor(rng: Rng, def: LevelDef): Decor[] {
  const decor: Decor[] = [];
  for (const { kind, sprite, count, within } of def.decor) {
    for (let i = 0; i < count; i++) {
      let pos = vec(0, 0);
      for (let attempts = 0; attempts < 20; attempts++) {
        pos = vec(
          randomRange(rng, 24, def.width - 24),
          randomRange(rng, 24, def.height - 24),
        );
        const clear =
          (within === undefined || anyZoneContains(within, pos)) &&
          def.landmarks.every((l) => distance(pos, l.pos) > def.decorClearance);
        if (clear) break;
      }
      decor.push({ kind, sprite: sprite ?? kind, pos });
    }
  }
  return decor;
}

/**
 * ONE FRESH HERO, at the spawn — the shape every seat starts as.
 *
 * Lifted out of `createGame`'s state literal because a run now has a PARTY:
 * seat 0 is built here at creation, and `seatHero` builds every later arrival
 * from the same function. Two literals would be two definitions of what a hero
 * IS, free to drift the day one of them grows a field — and the drift would
 * present as a joiner whose build quietly behaves differently from the host's.
 */
export function createHero(
  playerSpawn: Vec2,
  def: LevelDef,
  difficulty: Difficulty,
  diff: DifficultyDef,
  mintId: () => number,
): Player {
  return {
    pos: { ...playerSpawn },
    z: 0,
    vz: 0,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    // The sprint pool starts full at its STAMINA-0 base.
    stamina: STAMINA.base,
    maxStamina: STAMINA.base,
    facing: vec(1, 0),
    vel: vec(0, 0),
    faceLeft: false,
    abilities: [],
    // Granted forever spells re-derive from the worn loadout on the first
    // tick (`syncItemSpells`) — nothing to seed here.
    itemSpells: [],
    heldAbilities: [],
    // One empty medkit stack per quality; stamina potions and repair kits
    // each share one stack.
    medkits: new Array<number>(MEDKIT.tiers.length).fill(0),
    staminaPotions: 0,
    repairKits: 0,
    // THE OPENING HOLSTER: a hundred rounds for the weapon in his hand and a
    // hundred for the sidearm behind it (`startingAmmo`) — a long, unhurried
    // introduction to the fact that ammunition exists. It has to know the
    // DIFFICULTY'S starting weapon, because EASY opens with a shotgun and a
    // holster stocked from the sidearm alone would leave that hero unable to
    // fire a shot. A carried loadout overwrites the whole pouch below.
    ammo: startingAmmo(diff.startingWeapon),
    cleanSlates: 0,
    moving: false,
    weaponCooldownMs: 0,
    // Levels with a scripted opening strike (GOODCO HQ) start the hero with
    // his weapon holstered — the vanguard's first swing draws it. Every
    // other level opens armed.
    disarmed: def.openingStrike !== undefined,
    hurtFlashMs: 0,
    knockoutMs: 0,
    knockMs: 0,
    knockVel: vec(0, 0),
    level: 1,
    xp: 0,
    xpToNext: xpToLevelUp(1, difficulty),
    pendingStatPoints: 0,
    // The talent-picker queue — reconciled from the hero's stats/ranks after
    // the loadout applies (a fresh hero has none). `screen` and
    // `companionFocus` stay absent: a fresh hero is on the field.
    pendingTalentPoints: [],
    // The purse opens empty — coins come from selling loot to the merchant
    // (a carried loadout restores its banked purse below).
    coins: 0,
    stats: {
      stamina: 0,
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      luck: 0,
    },
    // Only the points the player spends on the chooser (see `spentStats`).
    // The difficulty head-start folded into `stats` below is deliberately
    // NOT counted here — it isn't the player's own pick.
    spentStats: {
      stamina: 0,
      strength: 0,
      dexterity: 0,
      intelligence: 0,
      luck: 0,
    },
    // No talents trained yet — a carried loadout restores them, and an
    // adopted veteran's converted points reconcile in after the loadout
    // applies (see `applyLoadout` / `reconcileTalentPoints`).
    talents: {},
    equipment: {
      // The starting weapon: whatever the DIFFICULTY hangs on the hero's
      // wall (an heirloom wand down the ladder, a bare stick at the top) —
      // the one thing he grabs to go after Ada. FINITE: minted with its
      // catalog durability so it wears out and has to be replaced by
      // whatever the run yields (see wearEquippedWeapon). When it finally
      // shatters with an empty bag the engine draws the unbreakable
      // blaster fallback.
      weapon: {
        id: mintId(),
        defId: diff.startingWeapon,
        slot: "weapon",
        tier: "regular",
        ilvl: 1,
        affixes: [],
        durability: weaponDef(diff.startingWeapon).durability,
      },
      // The clothes on his back (DifficultyDef.startingGear): a t-shirt,
      // jeans and worn boots — no bonuses, a whisper of armor, honest
      // cotton durability. Filled in below; the head stays bare.
      head: null,
      chest: null,
      legs: null,
      feet: null,
      // The neck is bare: amulets are a JESUS-only find. The ENGAGEMENT BAND
      // fills a ring finger below, from `startingGear` — the one piece of
      // jewellery the hero owns before the ladder pays out any of its own.
      amulet: null,
      ring1: null,
      ring2: null,
      // Nothing in the second arm to start: no bag (the base carry is all
      // the hero has until he loots one — see inventoryCapacity) and no
      // shield either.
      offhand: null,
    },
    // The bag starts at its STRENGTH-0 floor; allocating STRENGTH grows it
    // (see inventoryCapacity / syncInventoryCapacity).
    inventory: new Array<null>(LOOT.baseInventorySize).fill(null),
    // The LOST & FOUND starts empty; only a paid AUTO PILOT ride fills it
    // (see items/vault.ts), and `applyLoadout` carries it across.
    vault: [],
  };
}
