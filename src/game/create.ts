// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Run setup: builds the initial GameState from a level definition
// (defs/levels.ts). Monsters spawn in difficulty bands that scale with
// distance from the player spawn toward the objective; fixed spawns (bosses)
// guard their landmarks. The seed makes generation deterministic — tests
// pass a constant, the app passes a clock-derived value so every retry lays
// the level out differently.

import { createCutscene } from "@game/lib/cutscene.ts";
import { createRng, randomRange, type Rng } from "@game/lib/rng.ts";
import { clamp, distance, vec, type Vec2 } from "@game/lib/vec.ts";
import { applyLoadout } from "./arrival.ts";
import {
  ENEMY_AI,
  LOOT,
  MEDKIT,
  OBSTACLES,
  PACKS,
  PLAYER,
  RARE_MOBS,
  STAMINA,
} from "./config.ts";
import { cutsceneDef, cutsceneVariant } from "./defs/cutscenes.ts";
import {
  difficultyDef,
  meetsMinDifficulty,
  resolvePackCount,
  scaledMobCount,
} from "./defs/difficulties.ts";
import { enemyDef } from "./defs/enemies/index.ts";
import { gearDef, weaponDef } from "./defs/equipment.ts";
import { LEVEL_ORDER, levelDef, type LevelDef } from "./defs/levels/index.ts";
import { buildWells } from "./hazards.ts";
import {
  recomputeMaxHp,
  recomputeMaxStamina,
  rollEquipment,
  syncInventoryCapacity,
} from "./items.ts";
import { xpToLevelUp } from "./leveling.ts";
import { createExplored, revealAround } from "./map.ts";
import { createMerchant } from "./merchant.ts";
import {
  evolutionHpMult,
  mobContactScaleFor,
  mobHpScaleFor,
  mobLevelFor,
} from "./menace.ts";
import { BALANCE } from "./tuning.ts";
import { boundingRadius, rockHalf } from "./obstacles.ts";
import type {
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
  StatName,
} from "./types.ts";

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
  // intro clears (see items.ts `beginRespec`). Off for every ordinary run.
  respec = false,
  // Level ids the hero has already CLEARED on this difficulty (the app seeds
  // this from the character's clears). Gates `requiresClear` guaranteed drops
  // — chiefly the bunker key, latent until "eastworld" is beaten. Empty on a
  // dev jump or a fresh hero.
  clearedLevels: string[] = [],
): GameState {
  const def = levelDef(levelId);
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
  const playerSpawn = vec(def.playerSpawn.x, def.playerSpawn.y);
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
  const obstacles = buildWalls(def, () => nextId++);
  const doors = buildDoors(def, obstacles, () => nextId++);
  obstacles.push(
    ...scatterObstacles(rng, def, playerSpawn, obstacles, () => nextId++),
  );
  const blocked = (pos: Vec2, radius: number) =>
    obstacles.some((o) => distance(pos, o.pos) < o.radius + radius);

  const enemies: Enemy[] = [];
  for (const spawn of def.spawns) {
    // Difficulty-gated spawns sit out the rungs below their `minDifficulty`.
    if (!meetsMinDifficulty(difficulty, spawn.minDifficulty)) continue;
    if ("at" in spawn) {
      enemies.push(
        spawnEnemy(
          spawn.enemy,
          vec(spawn.at.x, spawn.at.y),
          rng,
          nextId++,
          mobHp,
          0,
          1,
          mobLvl,
        ),
      );
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
          !blocked(pos, margin)
        ) {
          break;
        }
      }
      enemies.push(
        spawnEnemy(spawn.enemy, pos, rng, nextId++, mobHp, 0, 1, mobLvl),
      );
    }
  }

  // The scripted vanguard (see LevelDef.openingStrike): a lone rusher placed
  // ahead of the pack, marked so only ITS first touch arms the holstered hero.
  if (def.openingStrike) {
    const rusher = spawnEnemy(
      def.openingStrike.enemy,
      vec(def.openingStrike.at.x, def.openingStrike.at.y),
      rng,
      nextId++,
      mobHp,
      0,
      1,
      mobLvl,
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

  const decor = scatterDecor(rng, def);

  // Untouchable dialogue figures are not foes: they can never be killed, so
  // counting them would leave the HUD's total forever out of reach.
  const foeCount = enemies.filter((e) => !enemyDef(e.defId).apparition).length;

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

  // The prelude may be a single scene or a chain (the launch, then the
  // flight); each scene resolves its per-difficulty variant when one is
  // registered (`<id>_<difficulty>`), so the weapon on the living-room wall
  // is always the one this run actually starts with.
  const preludes = (
    typeof def.prelude === "string" ? [def.prelude] : (def.prelude ?? [])
  ).map((id) => cutsceneVariant(id, difficulty));

  const state: GameState = {
    phase: preludes.length > 0 ? "cutscene" : "intro",
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
    playerSpawn,
    landmarks: def.landmarks.map((l) => ({
      kind: l.kind,
      sprite: l.sprite ?? l.kind,
      anchor: l.anchor ?? "center",
      pos: { ...l.pos },
    })),
    dialogue: null,
    choice: null,
    companions: [],
    companionFocus: null,
    storyItems: [],
    clearedLevels,
    thoughtsSeen: [],
    capThoughtMs: 0,
    capThoughtIdx: 0,
    doors,
    // Travel gates stay latent until their key trinket is USED (spendGateKey).
    gates: [],
    // The wandering merchant: placed (and forever rolled) on his own seeded
    // stream, so the run's rng sequence is exactly what it was without him.
    merchant: createMerchant(seed, def, playerSpawn, blocked),
    explored: createExplored(def),
    mapMarkers: [],
    player: {
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
      // One empty medkit stack per quality; stamina potions share one stack.
      medkits: new Array<number>(MEDKIT.tiers.length).fill(0),
      staminaPotions: 0,
      moving: false,
      weaponCooldownMs: 0,
      // Levels with a scripted opening strike (SpaceZ HQ) start the hero with
      // his weapon holstered — the vanguard's first swing draws it. Every
      // other level opens armed.
      disarmed: def.openingStrike !== undefined,
      hurtFlashMs: 0,
      level: 1,
      xp: 0,
      xpToNext: xpToLevelUp(1),
      pendingStatPoints: 0,
      // The purse opens empty — coins come from selling loot to the merchant
      // (a carried loadout restores its banked purse below).
      coins: 0,
      stats: {
        stamina: 0,
        strength: 0,
        dexterity: 0,
        intelligence: 0,
        speed: 0,
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
        speed: 0,
        luck: 0,
      },
      equipment: {
        // The starting weapon: whatever the DIFFICULTY hangs on the hero's
        // wall (an heirloom wand down the ladder, a bare stick at the top) —
        // the one thing he grabs to go after Ada. FINITE: minted with its
        // catalog durability so it wears out and has to be replaced by
        // whatever the run yields (see wearEquippedWeapon). When it finally
        // shatters with an empty bag the engine draws the unbreakable
        // blaster fallback.
        weapon: {
          id: nextId++,
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
        charm: null,
        // No bag worn to start — the base carry is all the hero has until he
        // loots one (see the BAG gear + inventoryCapacity).
        bag: null,
      },
      // The bag starts at its STRENGTH-0 floor; allocating STRENGTH grows it
      // (see inventoryCapacity / syncInventoryCapacity).
      inventory: new Array<null>(LOOT.baseInventorySize).fill(null),
    },
    enemies,
    projectiles: [],
    items: [],
    decor,
    obstacles,
    wells: buildWells(def, () => nextId++),
    asteroids: [],
    // The first rock is owed a full interval; 0 on levels without the rain.
    asteroidTimerMs: def.asteroids
      ? randomRange(rng, def.asteroids.everyMs[0], def.asteroids.everyMs[1])
      : 0,
    wellTickMs: 0,
    bagFullHintCooldownMs: 0,
    staminaEmptyMs: 0,
    victoryCountdownMs: null,
    levelUpFxMs: 0,
    minionEquipmentDrops: 0,
    waveSpawned: (def.waves?.budget ?? []).map(() => 0),
    packs,
    moveSpawnCredit: 0,
    // The camp clock opens anchored on the spawn — standing at the lander
    // farming the opening waves is exactly the camping the starvation answers.
    campAnchor: { ...playerSpawn },
    campMs: 0,
    trickleMs: 0,
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
      totalEnemies: foeCount + waveTotal + packTotal,
      shotsFired: 0,
      damageDealt: 0,
      damageTaken: 0,
      itemsCollected: 0,
      xpGained: 0,
      timeMs: 0,
      combatMs: 0,
      peakMenace: 0,
    },
    events: [],
    pendingProcs: [],
    pendingCritBlobs: [],
    nextId,
    rng,
    fxRng,
  };

  // The hero has seen where he lands: the map opens with the spawn uncovered.
  revealAround(state, playerSpawn);

  // The difficulty's head start: pre-allocated stat points (the gentler rungs
  // open with a few level-ups' worth of training banked). Applied before any
  // loadout, which simply overwrites them with the hero's own earned stats.
  for (const [stat, points] of Object.entries(diff.startingStats)) {
    state.player.stats[stat as StatName] += points ?? 0;
  }
  // The clothes on his back: each startingGear def minted plain into its
  // slot — base armor, full durability, no affixes. A loadout (below) simply
  // overwrites them with whatever the hero actually wore out of the last run.
  for (const gearId of diff.startingGear ?? []) {
    const def = gearDef(gearId);
    if (def.slot === "charm" || def.slot === "bag") continue;
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
    state.player.equipment[def.slot] = piece;
  }
  recomputeMaxHp(state);
  recomputeMaxStamina(state);
  syncInventoryCapacity(state);
  state.player.hp = state.player.maxHp;
  state.player.stamina = state.player.maxStamina;

  // Hand-placed pickups (locked-room loot, plot pieces on pedestals) mint
  // last: equipment rolls draw on the state's rng exactly like drops do.
  for (const placed of def.placedItems ?? []) {
    state.items.push(placeItem(state, placed));
  }

  // Dress the run in the carried-over progress, when there is any: level,
  // stats, equipment, bag, and powerups from the previous level's clear.
  if (loadout) applyLoadout(state, loadout);

  return state;
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
      equipment: rollEquipment(state, { defId: placed.defId }),
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
      enemies.push(spawnEnemy(pick, pos, rng, takeId(), mobHp, 0, 1, mobLvl));
    }
  }
}

/** Mint one enemy instance (also used by the wave spawner in step.ts).
 * `hpMult` is the horde's relative-level hp scale the caller resolved
 * (mobHpScaleFor / mobLevelScale) — kill XP scales with max hp, so tougher
 * monsters also pay out more. `evo` is the menace evolution stage stamped
 * onto a MINION spawned while the horde is rampaging (see menace.ts): it
 * stacks extra hp (worth more xp, scaled by the difficulty's
 * `menaceEffectMult` via `evoEffect`) and marks the mob so its drop rolls
 * better. Elites and bosses ignore `evo` — they instead power-match the
 * player when they engage (maybePowerScale). */
export function spawnEnemy(
  defId: string,
  pos: Vec2,
  rng: Rng,
  id: number,
  hpMult = 1,
  evo = 0,
  evoEffect = 1,
  mlvl = 1,
): Enemy {
  const def = enemyDef(defId);
  const jitter =
    def.role === "boss"
      ? 0
      : randomRange(rng, -ENEMY_AI.speedJitter, ENEMY_AI.speedJitter);
  const evolved = def.role === "minion" ? Math.max(0, evo) : 0;
  // A RARE/UNIQUE mob's whole tier lands here (config RARE_MOBS): the def is
  // authored at ordinary minion numbers and the multipliers make it special.
  const rarity = def.rarity ? RARE_MOBS.tuning[def.rarity] : undefined;
  // The developer mob-hp knob multiplies in here — the one chokepoint every
  // spawn path funnels through — so placed mobs, waves, and rushers all
  // toughen together (and pay proportionally more XP, since kill XP is
  // hp-proportional).
  const hp = Math.max(
    1,
    Math.round(
      def.hp *
        hpMult *
        evolutionHpMult(evolved, evoEffect) *
        BALANCE.mobHp *
        (rarity?.hpMult ?? 1),
    ),
  );
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
    // beat them — and rare/unique mobs re-stamp the same way.
    mlvl: Math.max(1, mlvl + (def.levelBonus ?? 0) + (rarity?.levelBonus ?? 0)),
    speed: def.speed * (1 + jitter),
    contactCooldownMs: 0,
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
 * Expand one wall/door segment into a chain of solid circles. Centers step
 * by 1.5× the radius, so neighbouring circles overlap enough that no body
 * can slip between them — a segment collides as one continuous wall.
 */
function expandSegment(
  kind: string,
  sprite: string,
  from: Vec2,
  to: Vec2,
  radius: number,
  jumpable: boolean,
  takeId: () => number,
): Obstacle[] {
  const obstacles: Obstacle[] = [];
  const length = distance(from, to);
  const steps = Math.max(1, Math.ceil(length / (radius * 1.5)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    obstacles.push({
      id: takeId(),
      kind,
      sprite,
      pos: vec(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t),
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
function buildWalls(def: LevelDef, takeId: () => number): Obstacle[] {
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
      ),
    );
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
    const chain = expandSegment(
      "door_locked",
      "door_locked",
      door.from,
      door.to,
      door.radius,
      false,
      takeId,
    );
    obstacles.push(...chain);
    doors.push({
      id: door.id,
      center: vec((door.from.x + door.to.x) / 2, (door.from.y + door.to.y) / 2),
      obstacleIds: chain.map((o) => o.id),
      open: false,
    });
  }
  return doors;
}

/**
 * Scatter the level's solid obstacles: clear of landmarks (the boss must
 * reach his flag), clear of the player spawn, and spaced apart from each
 * other (walls included) so the field always leaves walkable lanes.
 */
function scatterObstacles(
  rng: Rng,
  def: LevelDef,
  playerSpawn: Vec2,
  walls: Obstacle[],
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
      for (let attempts = 0; attempts < 30; attempts++) {
        const pos = vec(
          randomRange(rng, radius + 8, def.width - radius - 8),
          randomRange(rng, radius + 8, def.height - radius - 8),
        );
        const clear =
          distance(pos, playerSpawn) > OBSTACLES.spawnClearance + radius &&
          def.landmarks.every(
            (l) => distance(pos, l.pos) > def.decorClearance + radius,
          ) &&
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
        scattered.push(obstacle);
        break;
      }
    }
  }
  return scattered;
}

/** Scatter the level's decorative features, keeping landmarks clear. */
function scatterDecor(rng: Rng, def: LevelDef): Decor[] {
  const decor: Decor[] = [];
  for (const { kind, sprite, count } of def.decor) {
    for (let i = 0; i < count; i++) {
      let pos = vec(0, 0);
      for (let attempts = 0; attempts < 20; attempts++) {
        pos = vec(
          randomRange(rng, 24, def.width - 24),
          randomRange(rng, 24, def.height - 24),
        );
        const clear = def.landmarks.every(
          (l) => distance(pos, l.pos) > def.decorClearance,
        );
        if (clear) break;
      }
      decor.push({ kind, sprite: sprite ?? kind, pos });
    }
  }
  return decor;
}
