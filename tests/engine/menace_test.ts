// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The menace system: the escalation meter that answers an overpowered player.
// Overkilling and fast kills bank menace; idling bleeds it off — but never
// below the permanent floor the evolution RATCHET earns by one-shotting the
// current crop. The (uncapped) stage lures a denser horde, evolves
// freshly-spawned minions (more hp → more xp, worse loot), and — with the
// hero's power level — scales elites and bosses when they engage. Runs on
// the synthetic engine fixtures.

import { describe, expect, it } from "vitest";

import {
  autoPowerScale,
  createGame,
  currentMobLevel,
  dismissIntro,
  enemyDef,
  enemyPowerLevelTerm,
  enemyPowerScale,
  mobContactScaleFor,
  heroDamageLevel,
  heroGearLevel,
  heroPowerLevel,
  hitEnemy,
  LEVELING,
  MENACE,
  menaceFloorStage,
  menaceStage,
  menaceWarmup,
  mobHpScaleFor,
  mobLevelScale,
  resetBalanceTuning,
  setBalanceTuning,
  skipCutscene,
  step,
  weaponDps,
} from "@game/core";
import type { Equipment, GameInput, GameState } from "@game/core";

import { DT, idle, makeEnemy, run, startGame, stopWaves } from "./helpers.ts";

/** A run past the prelude on a chosen difficulty (fixtures are installed). */
function startOn(difficulty: string, levelId = "test_level"): GameState {
  const state = createGame(42, levelId, difficulty as never);
  skipCutscene(state);
  dismissIntro(state);
  return state;
}

/** Slot a specific weapon so the swing/shot damage is known. */
function equip(state: GameState, defId: string): void {
  const weapon: Equipment = {
    id: 777,
    defId,
    slot: "weapon",
    tier: "regular",
    ilvl: 5,
    affixes: [],
  };
  state.player.equipment.weapon = weapon;
  state.player.weaponCooldownMs = 0;
}

/** Strip to just the far boss and clear obstacles for surgical arrangements. */
function bareStage(state: GameState): void {
  stopWaves(state);
  state.obstacles = [];
  state.enemies = state.enemies.filter(
    (e) => enemyDef(e.defId).role === "boss",
  );
}

describe("menace — the meter", () => {
  it("buckets menace into evolution stages, with NO upper roof", () => {
    const state = startGame();
    state.menace = 0;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage - 0.01;
    expect(menaceStage(state)).toBe(0);
    state.menace = MENACE.perStage;
    expect(menaceStage(state)).toBe(1);
    // The old ten-stage cap is gone: the horde keeps evolving as long as the
    // player's output keeps proving it too easy.
    state.menace = MENACE.perStage * 25;
    expect(menaceStage(state)).toBe(25);
  });

  it("an overpowered kill jolts the meter and lures the horde in", () => {
    const state = startGame();
    bareStage(state);
    state.player.level = 6; // past the early-game warmup so the jolt isn't damped
    equip(state, "test_hammer"); // melee, 34 dmg, reach 44
    const { x, y } = state.player.pos;
    // One 10-hp fodder in reach: a 34-damage swing overkills it by ≥ 24, so the
    // OVERKILL still triggers the meter on top of the rolling output.
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    expect(state.menace).toBe(0);
    const creditBefore = state.moveSpawnCredit;

    step(state, idle, DT);

    expect(state.stats.kills).toBe(1);
    // The overkill spike pushed the meter off zero this very step.
    expect(state.menace).toBeGreaterThan(0);
    // Overkill banked spawn-credit (idle, so nothing else could add it).
    expect(state.moveSpawnCredit).toBeGreaterThan(creditBefore);
  });

  it("overkill is damage beyond FULL hp — finishing a wounded mob doesn't count", () => {
    // Overkill is the blow's damage minus the mob's MAX hp, not the hp it had
    // left. A modest hit that finishes an almost-dead mob banks nothing; the
    // same hit that dwarfs a mob's whole bar banks overkill.
    const kill = (hp: number, maxHp: number) => {
      const state = startGame();
      bareStage(state);
      state.player.level = 6; // warmed up so any overkill lands at full weight
      equip(state, "test_hammer"); // ~34 dmg — far under a 500-hp bar
      const { x, y } = state.player.pos;
      state.enemies.push(
        makeEnemy({ pos: { x: x + 20, y }, hp, maxHp }, "test_fodder"),
      );
      const creditBefore = state.moveSpawnCredit;
      step(state, idle, DT);
      expect(state.stats.kills).toBe(1);
      return {
        menace: state.menace,
        credit: state.moveSpawnCredit - creditBefore,
      };
    };
    // Finishing a 5/500 mob: the 34-dmg blow is far below its 500 max, so
    // damage − maxHp < 0 → no overkill at all.
    const wounded = kill(5, 500);
    // Crushing a 10/10 mob: 34 − 10 = 24 of overkill → a real jolt.
    const crushed = kill(10, 10);
    expect(wounded.credit).toBe(0);
    expect(crushed.credit).toBeGreaterThan(0);
    expect(crushed.menace).toBeGreaterThan(wounded.menace);
  });

  it("an overkill crossing a stage boundary emits menaceRose", () => {
    const state = startGame();
    bareStage(state);
    state.player.level = 6; // warmed up so the overkill jolt lands at full weight
    equip(state, "test_hammer");
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    // Park menace just below stage 1: this kill's overkill — ≥ 2.4 healthbars
    // (24 / 10 maxHp) × perOverkill × sensitivity — tips it over. Being wildly
    // overpowered relative to the mob escalates on the spot.
    state.menace = MENACE.perStage - 0.5;

    step(state, idle, DT);

    const rose = state.events.find((e) => e.type === "menaceRose");
    expect(rose).toBeDefined();
    expect(rose && rose.type === "menaceRose" && rose.stage).toBe(1);
    expect(menaceStage(state)).toBe(1);
  });

  it("sustained damage output heats the meter even without overkill", () => {
    // The rolling DPS/kill-rate driver: grind a tanky mob (no killing blow, so
    // no overkill spike) and the meter still climbs purely from output. Run it
    // on a sensitive difficulty with a warmed-up hero, since the DPS channel is
    // deliberately a gentle supporting term (see MENACE.perBarDps).
    const state = startOn("jesus");
    bareStage(state);
    state.player.level = 8;
    equip(state, "test_hammer");
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy(
        { pos: { x: x + 20, y }, hp: 100_000, maxHp: 100_000 },
        "test_fodder",
      ),
    );
    expect(state.menace).toBe(0);

    // A couple of seconds of sustained swings, never landing a kill.
    run(state, idle, 180, (s) => s.stats.kills > 0);

    expect(state.stats.kills).toBe(0); // never died: no overkill possible
    expect(state.combatDps).toBeGreaterThan(0); // output was tracked
    expect(state.menace).toBeGreaterThan(0); // and it heated the meter
  });

  it("idling bleeds menace back off over time", () => {
    const state = startGame();
    bareStage(state); // only the far boss remains — nothing to fight
    state.menace = 30;

    run(state, idle, 63); // ~1s of standing still

    // ~decayPerSec drained over the second, never below zero.
    expect(state.menace).toBeLessThan(30);
    expect(state.menace).toBeCloseTo(30 - MENACE.decayPerSec, 0);
  });
});

describe("menace — difficulty and warmup gate the heat", () => {
  /** Menace banked by one identical overkill kill on the given difficulty.
   * The fodder's bar is sized so the overkill stays well under the ratchet
   * threshold (`MENACE.ratchetHealthbars`) — this suite compares the METER
   * jolt the rungs' menace knobs produce; the difficulty-blind ratchet has
   * its own suite below. */
  function joltOn(difficulty: string, level: number): number {
    const state = startOn(difficulty);
    bareStage(state);
    state.player.level = level;
    equip(state, "test_hammer");
    // An OVERPOWERED build: enough STRENGTH that the hammer roughly triples its
    // ~34 base (well under the ratchet's 6-healthbar threshold) so the overkill
    // is unambiguous. Auto-stat growth is off by default now, so the hero can't
    // lean on free per-level STR — spell it out, or even EASY's tiny jolt is
    // eaten by the per-step menace decay.
    state.player.stats.strength = 8;
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 30, maxHp: 30 }, "test_fodder"),
    );
    // Pin the rng high so the blow neither misses, is dodged, nor crits (and
    // no drop rolls) — the jolt is then the pure overkill formula, and the
    // rungs compare on their menace knobs alone instead of per-seed luck.
    state.rng = () => 0.99;
    step(state, idle, DT);
    expect(state.stats.kills).toBe(1);
    return state.menace;
  }

  it("the same overpowered kill escalates far harder as difficulty climbs", () => {
    const warmed = 8; // past the warmup so only the difficulty mult differs
    const easy = joltOn("easy", warmed);
    const medium = joltOn("medium", warmed);
    const hard = joltOn("hard", warmed);
    const nightmare = joltOn("nightmare", warmed);
    const jesus = joltOn("jesus", warmed);
    expect(easy).toBeGreaterThan(0);
    expect(medium).toBeGreaterThan(easy);
    expect(hard).toBeGreaterThan(medium);
    expect(nightmare).toBeGreaterThan(hard);
    expect(jesus).toBeGreaterThan(nightmare);
    // EASY is near-inert: a rampage is practically impossible even for an
    // overpowered build (a whole stage is MENACE.perStage of heat).
    expect(easy).toBeLessThan(MENACE.perStage * 0.1);
  });

  it("early levels are damped so a fresh hero cannot rampage yet", () => {
    // The same kill on the same difficulty banks far less at level 1 than once
    // the player has grown into their power.
    expect(joltOn("medium", 1)).toBeLessThan(joltOn("medium", 8));
    // The warmup eases from the floor at level 1 up to 1.0 by 1 + warmupLevels.
    expect(menaceWarmup({ player: { level: 1 } } as GameState)).toBeCloseTo(
      MENACE.warmupFloor,
    );
    expect(
      menaceWarmup({ player: { level: 1 + MENACE.warmupLevels } } as GameState),
    ).toBeCloseTo(1);
  });

  it("even a god-tier build barely warms the meter on EASY", () => {
    // A maxed hero clearing a whole warmed-up run on EASY stays cool: the
    // difficulty's menaceMult keeps gain below the decay floor.
    const state = startOn("easy");
    state.player.level = 20;
    for (let i = 0; i < 20 * 60; i++) {
      // Feed the meter a brutal, sustained overkill stream by hand.
      state.combatDps = 800;
      state.combatKillRate = 8;
      step(state, idle, DT);
    }
    expect(menaceStage(state)).toBe(0);
  });
});

describe("menace — evolution of the horde", () => {
  it("un-evolved at menace 0: wave spawns carry no evo and base hp", () => {
    const state = startGame();
    state.menace = 0;
    const before = new Set(state.enemies.map((e) => e.id));
    run(state, idle, 4); // the live floor pulls minions in

    const spawned = state.enemies.filter(
      (e) => !before.has(e.id) && enemyDef(e.defId).role === "minion",
    );
    expect(spawned.length).toBeGreaterThan(0);
    for (const e of spawned) {
      expect(e.evo).toBeUndefined();
      // No evolution — just the horde's relative-level scale (medium fields
      // mobs two levels under a level-1 hero).
      expect(e.maxHp).toBe(
        Math.round(enemyDef(e.defId).hp * mobHpScaleFor(1, "medium")),
      );
    }
  });

  it("evolves wave-spawned minions while menace is high: more hp, stamped", () => {
    const state = startGame();
    // Mid-bucket so the stage is stable across the few decaying ticks.
    state.menace = MENACE.perStage * 3 + MENACE.perStage / 2; // stage 3
    run(state, idle, 4);

    const evolved = state.enemies.filter((e) => e.evo !== undefined);
    expect(evolved.length).toBeGreaterThan(0);
    for (const e of evolved) {
      expect(e.evo).toBeGreaterThanOrEqual(1);
      // Each mob's hp is consistent with its OWN stamped stage, on top of
      // the relative-level scale (medium menaceEffectMult is 1).
      const mult = 1 + (e.evo ?? 0) * MENACE.hpPerStage;
      expect(e.maxHp).toBe(
        Math.round(enemyDef(e.defId).hp * mobHpScaleFor(1, "medium") * mult),
      );
      // An evolved mob is worth more xp (xp is hp-proportional) than an
      // un-evolved spawn of its kind.
      expect(e.maxHp).toBeGreaterThan(
        Math.round(enemyDef(e.defId).hp * mobHpScaleFor(1, "medium")),
      );
    }
  });

  it("evolved (malice) mobs find worse gear — the tier roll pays the penalty", () => {
    // Kill 120 mobs at saturated drop odds, once un-evolved and once at a
    // deep evolution stage, off the same seed: the per-stage tier PENALTY
    // (MENACE.tierPenaltyPerStage) drives the evolved crop's magic odds to
    // zero — a rampage is a leveling faucet, not a loot farm.
    const magicOrBetter = (evo: number): number => {
      setBalanceTuning({ dropRate: 20 });
      const state = startGame(); // same seed both arms — comparable streams
      stopWaves(state);
      state.items = [];
      for (let i = 0; i < 120; i++) {
        const enemy = makeEnemy(
          {
            id: state.nextId++,
            pos: { x: state.player.pos.x + 60, y: state.player.pos.y },
            hp: 45,
            maxHp: 45,
          },
          "test_minion",
        );
        if (evo > 0) enemy.evo = evo;
        state.enemies.push(enemy);
        hitEnemy(state, enemy, 45, undefined, { rollAccuracy: false });
      }
      resetBalanceTuning();
      return state.items.filter(
        (i) =>
          i.kind === "equipment" &&
          i.equipment.tier !== "regular" &&
          i.equipment.tier !== "trash",
      ).length;
    };
    const plain = magicOrBetter(0);
    const evolved = magicOrBetter(10);
    expect(plain).toBeGreaterThan(0); // the ordinary rain pays magic finds
    // Ten stages of tier PENALTY thin the evolved crop's magic+ rate well
    // below the ordinary rain — a rampage is a leveling faucet, not a loot farm.
    expect(evolved).toBeLessThan(plain);
  });

  it("high menace lures a denser crowd than a calm field", () => {
    // Sustained rampage vs. calm: re-pin menace each tick so the stage holds.
    const minionsAfter = (keepMenace: number) => {
      const state = startGame();
      for (let i = 0; i < 30; i++) {
        state.menace = keepMenace;
        step(state, idle, DT);
      }
      return state.enemies.filter((e) => enemyDef(e.defId).role === "minion")
        .length;
    };
    expect(minionsAfter(MENACE.perStage * 10)).toBeGreaterThan(minionsAfter(0));
  });
});

describe("menace — the evolution ratchet (no breaks)", () => {
  /** A clean, warmed-up stage with the rng pinned high (no crits, no drops)
   * so each hand-dealt blow banks exactly its own overkill. */
  function warmedStage(difficulty = "medium"): GameState {
    const state = startOn(difficulty);
    bareStage(state);
    state.player.level = 8; // fully past the warmup damping
    state.rng = () => 0.99;
    return state;
  }

  /** One-shot a staged 10-hp mob of evolution stage `evo` with a 40-damage
   * blow — 3 healthbars of overkill banked toward the ratchet per kill. */
  function oneShot(state: GameState, evo: number): void {
    const { x, y } = state.player.pos;
    const enemy = makeEnemy(
      { id: state.nextId++, pos: { x: x + 30, y }, hp: 10, maxHp: 10 },
      "test_fodder",
    );
    if (evo > 0) enemy.evo = evo;
    state.enemies.push(enemy);
    hitEnemy(state, enemy, 40);
  }

  it("one-shotting the current crop lifts the permanent floor, stage by stage", () => {
    const state = warmedStage();
    expect(state.menaceFloor).toBe(0);
    // 3 healthbars of overkill per kill: two kills cross ratchetHealthbars (6)
    // and the floor locks in stage 1 — the next crop spawns evolved.
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.menace).toBeGreaterThanOrEqual(state.menaceFloor);
    // Stage-1 mobs getting one-shot just as fast force stage 2 — and so on,
    // with NO roof. (The between-stages breather is skipped by hand here;
    // its pacing has its own test below.)
    state.evoRatchetMs = 0;
    oneShot(state, 1);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("stale un-evolved leftovers prove nothing once the floor has risen", () => {
    const state = warmedStage();
    state.menaceFloor = MENACE.perStage; // stage-1 floor already earned
    state.menace = state.menaceFloor;
    // Massacring old evo-0 stragglers banks no proof toward stage 2.
    for (let i = 0; i < 6; i++) oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
    // The same blows against the CURRENT crop do.
    oneShot(state, 1);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("clean kills of the crop RELIEVE the proof — a mixed horde holds the floor", () => {
    const state = warmedStage();
    // One overkill banks 3 healthbars of proof…
    oneShot(state, 0);
    expect(state.evoProof).toBeCloseTo(3);
    // …and three honest kills (a finisher within the bar — no overkill)
    // refund it back to zero: trash one-shots alone can't evolve a horde
    // whose heavies still take real fights.
    const { x, y } = state.player.pos;
    for (let i = 0; i < 3; i++) {
      const heavy = makeEnemy(
        { id: state.nextId++, pos: { x: x + 30, y }, hp: 40, maxHp: 400 },
        "test_fodder",
      );
      state.enemies.push(heavy);
      hitEnemy(state, heavy, 100); // kills from 40, far under the 400 bar
    }
    expect(state.evoProof).toBe(0);
    expect(menaceFloorStage(state)).toBe(0);
  });

  it("climbs at most one stage per cooldown — one evolve per malice round", () => {
    const state = warmedStage();
    oneShot(state, 0);
    oneShot(state, 0); // stage 1 locks in and arms the breather
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.evoRatchetMs).toBe(MENACE.ratchetCooldownMs);
    // A massacre burst against the fresh crop banks proof, but the breather
    // holds the next stage — and the bank caps at 2× the threshold, so the
    // burst defers at most ONE stage past its own moment.
    for (let i = 0; i < 10; i++) oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(1);
    expect(state.evoProof).toBe(MENACE.ratchetHealthbars * 2);
    // Once the breather has burned down (playing ticks), the banked proof
    // spends the next stage on the very next overkill.
    run(state, idle, Math.ceil(MENACE.ratchetCooldownMs / DT) + 2);
    oneShot(state, 1);
    expect(menaceFloorStage(state)).toBe(2);
  });

  it("idling never cools the meter below the earned floor", () => {
    const state = warmedStage();
    state.menaceFloor = MENACE.perStage * 2;
    state.menace = MENACE.perStage * 3; // some transient heat on top
    run(state, idle, 300); // ~5s of standing still
    expect(state.menace).toBe(state.menaceFloor); // heat bled, floor held
    expect(menaceStage(state)).toBe(2);
  });

  it("ratchets even on EASY — the difficulty sizes the step, not whether it happens", () => {
    // EASY's menaceMult (0.05) makes the METER nearly inert, but the ratchet
    // is deliberately difficulty-blind: mobs getting one-shot instantly must
    // evolve the horde on every rung.
    const state = warmedStage("easy");
    oneShot(state, 0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(1);
  });

  it("the early-game warmup damps the ratchet for a fresh hero", () => {
    const state = warmedStage();
    state.player.level = 1; // warmupFloor (0.12) damps the proof
    oneShot(state, 0);
    oneShot(state, 0);
    expect(menaceFloorStage(state)).toBe(0);
  });
});

describe("hero power level — gear drives the horde", () => {
  it("averages the total equipped ilvl over the whole rack", () => {
    const state = startGame();
    // The fresh rack (wall weapon + street clothes, all ilvl 1-ish) reads
    // well under the character level, so a fresh hero's power IS his level.
    expect(heroGearLevel(state)).toBeLessThan(1);
    expect(heroPowerLevel(state)).toBe(state.player.level);
    // Deck the hero out: a 70-ilvl weapon alone averages 10 over 7 slots.
    state.player.equipment.weapon.ilvl = 70;
    expect(heroGearLevel(state)).toBe(10);
    expect(heroPowerLevel(state)).toBe(10);
  });

  it("a decked-out hero meets a horde TOUGHENED to his gear, not his sheet", () => {
    const state = startGame(); // medium: mobLevelOffset −2
    const mlvlBefore = currentMobLevel(state);
    const hpScaleBefore = mobLevelScale(state);
    expect(mlvlBefore).toBe(1); // level-1 hero, floor at 1
    state.player.equipment.weapon.ilvl = 70; // power level 10
    // Gear buys harder fights — minion hp and the set-piece power-match —
    // but the loot-facing monster level stays on the character sheet.
    expect(mobLevelScale(state)).toBeGreaterThan(hpScaleBefore);
    expect(enemyPowerScale(state)).toBeGreaterThan(1);
    expect(currentMobLevel(state)).toBe(mlvlBefore);
  });

  it("ordinary play is untouched — gear trailing the level changes nothing", () => {
    const state = startGame();
    state.player.level = 10;
    // Mid-campaign gear sits a few levels under the mobs it dropped from.
    state.player.equipment.weapon.ilvl = 8;
    expect(heroPowerLevel(state)).toBe(10);
    expect(currentMobLevel(state)).toBe(8); // 10 − 2, exactly as before
  });
});

describe("hero power level — calculated damage drives the horde", () => {
  /** The mapping's own arithmetic, from the exported pieces: the weapon's
   * sustained output, read against the typical healthbar at the hero's
   * autoPowerScale, inverted through the mob-hp-per-level ramp. */
  const expectedDamageLevel = (state: GameState) => {
    const dps = weaponDps(state, state.player.equipment.weapon);
    const bar = LEVELING.refMobHp * autoPowerScale(state.player.level);
    return (
      1 + ((dps * MENACE.damageLevelKillSec) / bar - 1) / MENACE.mobHpPerLevel
    );
  };

  it("maps the weapon's sustained output onto the mob-hp curve", () => {
    const state = startGame();
    expect(heroDamageLevel(state)).toBeCloseTo(expectedDamageLevel(state), 6);
  });

  it("fair-for-level damage reads WELL under the character level (grace)", () => {
    const state = startGame();
    // The fixture starter is level-appropriate: its damage level sits below
    // the character level, so the max() never hears from it and ordinary
    // play is exactly as before.
    expect(heroDamageLevel(state)).toBeLessThan(state.player.level);
    expect(heroPowerLevel(state)).toBe(state.player.level);
  });

  it("an absurd damage roll toughens the horde to what the hero swings", () => {
    const state = startGame();
    const hpScaleBefore = mobLevelScale(state);
    const bossScaleBefore = enemyPowerScale(state);
    // A +900% damage affix — the kind of roll ilvl never priced in. The
    // weapon's ilvl stays put, so the GEAR level alone would miss it.
    state.player.equipment.weapon.affixes.push({
      kind: "damagePct",
      value: 9,
    });
    expect(heroGearLevel(state)).toBeLessThan(state.player.level);
    const damageLevel = heroDamageLevel(state);
    expect(damageLevel).toBeGreaterThan(state.player.level);
    expect(heroPowerLevel(state)).toBe(damageLevel);
    // The horde's TOUGHNESS follows the damage: minion hp and the set-piece
    // power-match both rise.
    expect(mobLevelScale(state)).toBeGreaterThan(hpScaleBefore);
    expect(enemyPowerScale(state)).toBeGreaterThan(bossScaleBefore);
  });

  it("neither damage nor gear opens loot gates — no good-find→better-finds loop", () => {
    const state = startGame();
    const mlvlBefore = currentMobLevel(state);
    // An absurd damage roll: toughness answers (heroPowerLevel), but the
    // monster level — and the levelReq/tier/item-level gates hanging off
    // it — is exactly what the CHARACTER level says: harder fights and
    // more xp, never a better successor.
    state.player.equipment.weapon.affixes.push({
      kind: "damagePct",
      value: 9,
    });
    expect(heroPowerLevel(state)).toBeGreaterThan(state.player.level);
    expect(currentMobLevel(state)).toBe(mlvlBefore);
    // A twink rack: same rule — gear toughens the horde, not the drops.
    state.player.equipment.weapon.affixes.pop();
    state.player.equipment.weapon.ilvl = 70; // gear level 10 across 7 slots
    expect(heroPowerLevel(state)).toBe(10);
    expect(currentMobLevel(state)).toBe(mlvlBefore);
    // Only the character level moves the loot gates.
    state.player.level = 10;
    expect(currentMobLevel(state)).toBeGreaterThan(mlvlBefore);
  });

  it("mob health answers the damage: the leveled bar meets the output", () => {
    const state = startGame();
    state.player.equipment.weapon.affixes.push({
      kind: "damagePct",
      value: 9,
    });
    // At equilibrium a typical minion of the answered level takes the
    // weapon's sustained output ~damageLevelKillSec seconds to fell — the
    // absurd weapon is pulled back to a fair fight instead of melting the
    // campaign.
    const dps = weaponDps(state, state.player.equipment.weapon);
    const level = heroDamageLevel(state);
    const bar =
      LEVELING.refMobHp *
      (1 + (level - 1) * MENACE.mobHpPerLevel) *
      autoPowerScale(state.player.level);
    expect(bar / dps).toBeCloseTo(MENACE.damageLevelKillSec, 6);
  });

  it("swapping the absurd weapon away drops the read again", () => {
    const state = startGame();
    const fair = heroDamageLevel(state);
    state.player.equipment.weapon.affixes.push({
      kind: "damagePct",
      value: 9,
    });
    expect(heroDamageLevel(state)).toBeGreaterThan(fair);
    state.player.equipment.weapon.affixes.pop();
    expect(heroDamageLevel(state)).toBeCloseTo(fair, 6);
  });
});

describe("menace — powerups don't trigger it", () => {
  const useItem: GameInput = { ...idle, useItem: true };

  /** A warmed-up, bare stage with the hero's own weapon silenced, so the only
   * combat output is whatever powerup the test fires. */
  function powerupStage(): GameState {
    const state = startGame();
    bareStage(state);
    state.player.level = 8; // past the warmup, so a real kill WOULD escalate
    state.player.weaponCooldownMs = 1_000_000; // the hero swings nothing himself
    return state;
  }

  /** Drop `count` overkillable fodder in blast range of the hero. */
  function seedFodder(state: GameState, count: number): void {
    const { x, y } = state.player.pos;
    for (let i = 0; i < count; i++) {
      state.enemies.push(
        makeEnemy(
          { pos: { x: x + 16 + i * 6, y }, hp: 10, maxHp: 10 },
          "test_fodder",
        ),
      );
    }
  }

  it("a screen-nuke bomb clears the pack without heating the meter", () => {
    const state = powerupStage();
    seedFodder(state, 6);
    state.player.heldAbilities = ["test_nuke"];
    const creditBefore = state.moveSpawnCredit;

    step(state, useItem, DT);

    // The bomb did its job — six fodder dead, the field cleared.
    expect(state.stats.kills).toBe(6);
    expect(
      state.enemies.filter((e) => enemyDef(e.defId).role === "minion"),
    ).toHaveLength(0);
    // …yet nothing on the menace side moved: no meter, no rolling fuel, no
    // dinner-bell lure, no permanent-floor ratchet.
    expect(state.menace).toBe(0);
    expect(state.combatDps).toBe(0);
    expect(state.combatKillRate).toBe(0);
    expect(state.moveSpawnCredit).toBe(creditBefore);
    expect(state.menaceFloor).toBe(0);
    expect(state.evoProof).toBe(0);
  });

  it("even a CRITTING bomb — real overkill — banks no jolt or ratchet", () => {
    const state = powerupStage();
    state.rng = () => 0; // force the crit so each blast overkills its target
    seedFodder(state, 4);
    state.player.heldAbilities = ["test_nuke"];
    const creditBefore = state.moveSpawnCredit;

    step(state, useItem, DT);

    expect(state.stats.kills).toBe(4);
    // The overkill spike that a WEAPON crit would have jolted/lured/ratcheted
    // with is inert here — a bomb's overkill is not the hero's own power.
    expect(state.menace).toBe(0);
    expect(state.moveSpawnCredit).toBe(creditBefore);
    expect(state.menaceFloor).toBe(0);
    expect(state.evoProof).toBe(0);
  });

  it("damage powerups (storm) deal damage without feeding the meter", () => {
    const state = powerupStage();
    state.player.heldAbilities = ["test_storm"];
    step(state, useItem, DT); // start the storm running
    state.enemies.push(
      makeEnemy(
        {
          pos: { x: state.player.pos.x + 40, y: state.player.pos.y },
          hp: 1_000_000,
          maxHp: 1_000_000,
        },
        "test_minion",
      ),
    );
    const dealtBefore = state.stats.damageDealt;

    run(state, idle, 120); // a couple of seconds of strikes

    // The storm connected — the run stats book its damage…
    expect(state.stats.damageDealt).toBeGreaterThan(dealtBefore);
    // …but that output never entered the menace fuel, so the meter stays cold.
    expect(state.combatDps).toBe(0);
    expect(state.menace).toBe(0);
  });

  it("the hero's OWN weapon still escalates — the exemption is powerup-only", () => {
    // Same overkillable fodder, but felled by the hero's weapon rather than a
    // bomb: the meter and the lure both react, proving nothing global changed.
    const state = startGame();
    bareStage(state);
    state.player.level = 8;
    equip(state, "test_hammer"); // ~34 dmg vs a 10-hp bar → real overkill
    const { x, y } = state.player.pos;
    state.enemies.push(
      makeEnemy({ pos: { x: x + 20, y }, hp: 10, maxHp: 10 }, "test_fodder"),
    );
    const creditBefore = state.moveSpawnCredit;

    step(state, idle, DT);

    expect(state.stats.kills).toBe(1);
    expect(state.menace).toBeGreaterThan(0);
    expect(state.moveSpawnCredit).toBeGreaterThan(creditBefore);
  });
});

describe("menace — elites and bosses match the player", () => {
  const findBoss = (state: GameState) =>
    state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;

  it("leaves a boss at base hp when the player is fresh (level 1, no menace)", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    const base = boss.maxHp;
    // Stand on the boss so it engages this step.
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };
    expect(enemyPowerScale(state)).toBe(1);

    step(state, idle, DT);

    expect(boss.powerScaled).toBe(true);
    expect(boss.maxHp).toBe(base); // scale 1 → untouched
    expect(boss.contactMult).toBe(1);
  });

  it("scales a boss to the player's power when it engages", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    const base = boss.maxHp;
    state.player.level = 10; // a leveled hero
    const scale = enemyPowerScale(state); // (1 + 9·bossLevelWeight) × autoPowerScale
    expect(scale).toBeGreaterThan(1);
    // Contact rides only the LEVEL term (never autoPowerScale — nothing in
    // the hero's survivability grows with the auto-stat curve) times the
    // horde's gentle per-level damage ramp.
    const levelTerm = enemyPowerLevelTerm(state);
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };

    step(state, idle, DT);

    expect(boss.powerScaled).toBe(true);
    expect(boss.maxHp).toBe(Math.round(base * scale));
    expect(boss.contactMult).toBeCloseTo(
      mobContactScaleFor(boss.mlvl) *
        (1 + (levelTerm - 1) * MENACE.bossContactShare),
    );
  });

  it("locks the scale in exactly once (idempotent across ticks)", () => {
    const state = startGame();
    stopWaves(state);
    const boss = findBoss(state);
    state.player.level = 10;
    state.player.pos = { x: boss.pos.x + 40, y: boss.pos.y };
    step(state, idle, DT);
    const scaled = boss.maxHp;

    // Level up mid-fight; the already-engaged boss must NOT re-scale.
    state.player.level = 20;
    run(state, idle, 5);
    expect(boss.maxHp).toBe(scaled);
  });
});
