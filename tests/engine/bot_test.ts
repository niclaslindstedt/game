// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot (src/game/bot/index.ts): bot strategies produce ordinary GameInput
// from the live state, so a bot can play the game headlessly — closing on
// monsters, kiting at weapon range, scooping pickups, pushing for the boss —
// while keeping the run exactly as deterministic as a human's.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  botAct,
  botAllocate,
  CONSUMABLES,
  createBot,
  enemyDef,
  JUMP,
  metaLane,
  STAMINA,
  step,
  weaponDef,
  weaponRangeFor,
  type Bot,
  type Equipment,
  type GameState,
} from "@game/core";
import {
  clearStage,
  DT,
  equipBlaster,
  makeEnemy,
  startGame,
} from "./helpers.ts";

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** Step the sim with the bot at the controls, spending its level-ups. */
function drive(
  state: GameState,
  bot: Bot,
  maxSteps: number,
  done?: (s: GameState) => boolean,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (done?.(state)) return i;
    step(state, botAct(bot, state), DT);
    while (state.player.pendingStatPoints > 0) {
      allocateStat(state, botAllocate(bot, state));
    }
  }
  return maxSteps;
}

describe("bot strategies", () => {
  it("rush closes on the nearest monster", () => {
    const state = startGame();
    clearStage(state);
    const ghost = makeEnemy({
      pos: { x: state.player.pos.x + 220, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    state.enemies.push(ghost);
    const before = dist(state.player.pos, ghost.pos);
    drive(state, createBot("rush"), 60);
    expect(dist(state.player.pos, ghost.pos)).toBeLessThan(before - 50);
  });

  it("kite settles inside weapon range but outside the pack's grasp", () => {
    // Kiting is a ranged tactic — hold the crowd at bolt reach — so give the
    // bot the blaster rather than the default melee sword.
    const state = equipBlaster(startGame());
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 220, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 42, // it chases; the bot must keep backing off
      }),
    );
    drive(state, createBot("kite"), 400);
    const ghost = state.enemies.find((e) => enemyDef(e.defId).role !== "boss")!;
    const d = dist(state.player.pos, ghost.pos);
    expect(d).toBeLessThanOrEqual(weaponDef("blaster").range);
    expect(d).toBeGreaterThan(60);
    expect(state.stats.damageTaken).toBe(0);
    expect(state.stats.shotsFired).toBeGreaterThan(0);
  });

  it("boss strategy crosses the map and engages ARMSTRONG", () => {
    // Kiting the boss across the map is a ranged tactic; the melee default
    // would have to shove through the ridge terrain to touch him.
    const state = equipBlaster(startGame());
    clearStage(state); // just the parked boss at the flag
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    const steps = drive(
      state,
      createBot("boss"),
      6000,
      (s) => s.stats.damageDealt > 0 || s.enemies.length === 0,
    );
    expect(steps).toBeLessThan(6000);
    expect(dist(state.player.pos, boss.home)).toBeLessThan(400);
  });

  it("survivor scoops a nearby pickup", () => {
    const state = startGame();
    clearStage(state);
    state.items = [
      {
        id: 9001,
        kind: "medkit",
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      },
    ];
    drive(state, createBot("survivor"), 300, (s) => s.items.length === 0);
    expect(state.stats.itemsCollected).toBe(1);
  });

  it("survivor pushes for the boss once levelled and the map is discovered", () => {
    const state = startGame();
    clearStage(state);
    state.player.level = 6;
    // The bot now DISCOVERS its side of the map before the boss (coverage-gated
    // exploration). Reveal the whole map so there is nothing left to uncover —
    // then the levelled hero commits to the boss, the contract this asserts.
    state.explored.fill(1);
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    const before = dist(state.player.pos, boss.home);
    drive(state, createBot("survivor"), 600);
    expect(dist(state.player.pos, boss.home)).toBeLessThan(before - 300);
  });

  it("explores its own side of the map before heading for the boss", () => {
    // Under-levelled with a clear field, the bot should DISCOVER new ground — its
    // own side first — rather than beeline the far-off boss. Drive it and watch
    // the fog coverage climb while it stays out of the boss's half of the map.
    const state = startGame();
    clearStage(state); // just the parked boss; no waves, no threats near
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    // Keep the hero UNDER the boss-ready level (exploration fills the leveling
    // window) — the boss out-levels a fresh hero, as on the real maps.
    boss.mlvl = 20;
    const exploredFrac = (s: GameState) => {
      let n = 0;
      for (let i = 0; i < s.explored.length; i++) n += s.explored[i]!;
      return n / s.explored.length;
    };
    const before = exploredFrac(state);
    const bot = createBot("survivor");
    // Stay inside the anti-loiter window (seekFightAfterMs, 5s): past it the
    // fightless lull latches a hunt on the only enemy left (the parked boss)
    // and the thought flips to SEEK FIGHT — its own test below.
    drive(state, bot, 300);
    // It genuinely uncovered more of the map (the fog sweep is live)…
    expect(exploredFrac(state)).toBeGreaterThan(before);
    // …via the directional fog sweep, not a boss beeline…
    expect(bot.lastThought).toBe("EXPLORE FOG");
    // …and it kept to its OWN side — nowhere near the boss's corner yet.
    expect(state.player.pos.x).toBeLessThan(boss.home.x - 600);
  });

  it("survivor punches out the gap when surrounded", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    const c = { ...state.player.pos };
    // Ring the hero with fast chasers, leaving a clear GAP on the +x side.
    for (let deg = 0; deg < 360; deg += 30) {
      if (deg < 45 || deg > 315) continue; // the open lane, to the right
      const a = (deg * Math.PI) / 180;
      state.enemies.push(
        makeEnemy({
          pos: { x: c.x + Math.cos(a) * 120, y: c.y + Math.sin(a) * 120 },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 99,
          speed: 30,
        }),
      );
    }
    drive(state, createBot("survivor"), 120);
    // He fled toward the open side (+x), not into the wall of bodies.
    expect(state.player.pos.x).toBeGreaterThan(c.x + 40);
  });

  it("idle never steers", () => {
    const state = startGame();
    const input = botAct(createBot("idle"), state);
    expect(input.steering).toBe(false);
    expect(input.jump).toBe(false);
  });

  it("balanced is the survivor alias (identical play)", () => {
    const a = startGame();
    const b = startGame();
    drive(a, createBot("survivor"), 500);
    drive(b, createBot("balanced"), 500);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.stats).toEqual(b.stats);
  });

  it("aggro holds tighter to a pack than flee", () => {
    // Both postures share the survivor core; the difference is the standoff.
    // Against a stationary cluster, aggro closes to fighting range while flee
    // widens the gap — so flee ends farther from the pack's centre.
    const distToCluster = (posture: "aggro" | "flee") => {
      const state = equipBlaster(startGame());
      clearStage(state);
      const c = { ...state.player.pos };
      const foes = [];
      for (let i = 0; i < 4; i++) {
        const foe = makeEnemy({
          pos: { x: c.x + 130 + i * 6, y: c.y - 24 + i * 16 },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 1,
          speed: 0, // stationary — the distance is the bot's chosen standoff
        });
        state.enemies.push(foe);
        foes.push(foe);
      }
      drive(state, createBot(posture), 150);
      const cx = foes.reduce((s, e) => s + e.pos.x, 0) / foes.length;
      const cy = foes.reduce((s, e) => s + e.pos.y, 0) / foes.length;
      return dist(state.player.pos, { x: cx, y: cy });
    };
    expect(distToCluster("flee")).toBeGreaterThan(distToCluster("aggro"));
  });

  it("a ranged loadout holds further off a pack than a melee one (reach-aware)", () => {
    // Reach-aware standoff: a projectile weapon holds near its own range so it
    // kills from a distance, while a melee loadout — which can only reach at arm's
    // length — closes to swing. So the same survivor against the same stationary
    // cluster keeps MORE distance with a gun than with the sword, and never gets
    // touched holding at bolt reach. (`ranged` here is the blaster; the default
    // startGame hero carries a melee sword.)
    const standoff = (equip: (s: GameState) => GameState) => {
      const state = equip(startGame());
      clearStage(state);
      // Under-leveled vs the parked boss — probe the classic hold, not the
      // boss-ready rush posture.
      state.enemies.find((e) => enemyDef(e.defId).role === "boss")!.mlvl = 20;
      const foes = [];
      for (let i = 0; i < 5; i++) {
        const foe = makeEnemy({
          pos: {
            x: state.player.pos.x + 130 + i * 8,
            y: state.player.pos.y - 32 + i * 16,
          },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 1,
          speed: 0, // stationary — the gap is the bot's chosen standoff
        });
        state.enemies.push(foe);
        foes.push(foe);
      }
      drive(state, createBot("balanced"), 200);
      const nearest = Math.min(
        ...foes.map((e) => dist(state.player.pos, e.pos)),
      );
      return { nearest, dmg: state.stats.damageTaken };
    };
    const ranged = standoff(equipBlaster);
    const melee = standoff((s) => s);
    expect(ranged.nearest).toBeGreaterThan(melee.nearest);
    // The gun holds well outside a foe's ~34px grasp and never takes a hit.
    expect(ranged.nearest).toBeGreaterThan(72);
    expect(ranged.dmg).toBe(0);
  });

  it("a melee hero presses INTO swinging reach and grinds, not out of it", () => {
    // Cowards pick ranged. A melee loadout must close to WITHIN its own blade's
    // reach and hold there so the auto-swing connects every tick — the fix for
    // the hero who fled to the ranged grasp standoff (72), beyond his ~38px reach,
    // and only ever landed a hit when a mob ran him down (one swing, back out).
    const state = startGame(); // default hero carries the melee sword
    clearStage(state);
    // Stay UNDER-leveled vs the parked boss: this probes the CLASSIC balanced
    // hold, not the boss-ready rush (which leans into the aggro row).
    state.enemies.find((e) => enemyDef(e.defId).role === "boss")!.mlvl = 20;
    const foes = [];
    for (let i = 0; i < 5; i++) {
      const foe = makeEnemy({
        pos: {
          x: state.player.pos.x + 120 + i * 8,
          y: state.player.pos.y - 32 + i * 16,
        },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 1,
        speed: 0, // stationary — the gap is the bot's chosen standoff
      });
      state.enemies.push(foe);
      foes.push(foe);
    }
    drive(state, createBot("balanced"), 200);
    const reach = weaponRangeFor(state, state.player.equipment.weapon);
    const nearest = Math.min(...foes.map((e) => dist(state.player.pos, e.pos)));
    // He closed to within his blade's reach (so the swing lands) …
    expect(nearest).toBeLessThanOrEqual(reach);
    // … and actually connected — the whole point is the blade grinds the pack.
    expect(state.stats.damageDealt).toBeGreaterThan(0);
  });
});

describe("bot objective awareness", () => {
  // The map's ELITES are prioritized macro objectives: the bot knows roughly
  // where each huntable one holds court (its coarse rough-idea cell) and
  // marches on it ahead of the chest caches and the boss push. And the bot
  // never LOITERS: five fightless seconds latch a hunt on the nearest enemy.
  it("hunts a far elite as a prioritized macro objective", () => {
    const state = startGame();
    clearStage(state); // just the parked boss
    state.player.level = 6;
    state.player.maxHp = state.player.hp = 10_000;
    state.explored.fill(1); // nothing left to discover — isolate the hunt read
    const elite = makeEnemy(
      {
        id: 9100,
        pos: { x: state.player.pos.x + 700, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 5, // at parity — huntable
      },
      "test_elite",
    );
    state.enemies.push(elite);
    const before = dist(state.player.pos, elite.pos);
    const bot = createBot("survivor");
    drive(state, bot, 120);
    // Mid-march the thought names the errand…
    expect(bot.lastThought).toBe("HUNT ELITE");
    // …and he closes on the elite, not the (also-live) boss across the map.
    drive(state, bot, 400);
    expect(dist(state.player.pos, elite.pos)).toBeLessThan(before - 250);
  });

  it("leaves an elite far above his level for later", () => {
    const state = startGame();
    clearStage(state);
    state.player.level = 6;
    state.explored.fill(1);
    state.enemies.push(
      makeEnemy(
        {
          id: 9100,
          pos: { x: state.player.pos.x + 700, y: state.player.pos.y },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 40, // far out of his class — not huntable yet
        },
        "test_elite",
      ),
    );
    const bot = createBot("survivor");
    drive(state, bot, 120);
    // No huntable elite, no fog, no chest en route → the plan reads TO BOSS.
    expect(bot.lastThought).not.toBe("HUNT ELITE");
  });

  it("marches on the nearest enemy after five fightless seconds", () => {
    // The AIMLESS phase the anti-loiter exists for: an under-levelled hero on
    // a cleared field sweeps fog — but with a live straggler idling nearby, a
    // fightless lull should turn the wander into a hunt that puts it down.
    const state = startGame();
    clearStage(state); // just the parked boss; the fog is untouched
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    boss.mlvl = 20; // under-levelled → the plan explores rather than TO BOSS
    const straggler = makeEnemy({
      id: 9101,
      pos: { x: state.player.pos.x + 560, y: state.player.pos.y + 230 },
    });
    state.enemies.push(straggler);
    const bot = createBot("survivor");
    let sawSeek = false;
    const steps = drive(state, bot, 4000, (s) => {
      if (bot.lastThought === "SEEK FIGHT") sawSeek = true;
      return !s.enemies.some((e) => e.id === 9101);
    });
    // A lull latched the hunt (the thought named it) and it ended in the kill.
    expect(sawSeek).toBe(true);
    expect(steps).toBeLessThan(4000);
  });

  it("keeps a foe-ward march — the boss push — over chasing stragglers", () => {
    const state = startGame();
    clearStage(state); // the parked boss stays — the macro plan marches on it
    state.player.level = 20; // boss-ready, nothing else to do → TO BOSS
    state.explored.fill(1);
    const straggler = makeEnemy({
      id: 9101,
      pos: { x: state.player.pos.x + 560, y: state.player.pos.y + 230 },
    });
    state.enemies.push(straggler);
    const bot = createBot("survivor");
    // Well past the 5s window: marching on the boss is already moving in an
    // enemy's direction, so no hunt latches and the march holds.
    drive(state, bot, 500);
    expect(bot.lastThought).toBe("TO BOSS");
    expect(state.enemies.some((e) => e.id === 9101)).toBe(true);
  });
});

describe("bot strategic aim", () => {
  // The bot points the auto-weapon where it does the MOST damage (input.aim,
  // read like a desktop mouse): a spread/cone covers the densest cluster, a
  // single shot finishes the most wounded body — unless something is about to
  // bite, which is always shot first.
  it("finishes the most wounded foe in range with a single-target gun", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    const p = state.player.pos;
    state.enemies.push(
      makeEnemy({
        id: 9100,
        pos: { x: p.x + 140, y: p.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
      makeEnemy({
        id: 9101,
        pos: { x: p.x - 200, y: p.y },
        hp: 5,
        maxHp: 1_000_000,
      }),
    );
    const input = botAct(createBot("balanced"), state);
    expect(input.aim).toBeDefined();
    // The wounded body behind him is the pick — thin the pack.
    expect(input.aim!.x).toBeLessThan(p.x);
  });

  it("shoots the body about to bite over a far wounded one", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    const p = state.player.pos;
    state.enemies.push(
      makeEnemy({
        id: 9100,
        pos: { x: p.x + 50, y: p.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
      makeEnemy({
        id: 9101,
        pos: { x: p.x - 200, y: p.y },
        hp: 5,
        maxHp: 1_000_000,
      }),
    );
    const input = botAct(createBot("balanced"), state);
    expect(input.aim).toBeDefined();
    expect(input.aim!.x).toBeGreaterThan(p.x);
  });

  it("aims a spread gun into the densest cluster", () => {
    const state = startGame();
    clearStage(state);
    state.player.equipment.weapon = {
      id: state.nextId++,
      defId: "test_scattergun", // 4 pellets over a 24° fan
      slot: "weapon",
      tier: "regular",
      ilvl: 1,
      affixes: [],
    };
    const p = state.player.pos;
    // A lone foe left, a three-body cluster right — same distance both ways.
    state.enemies.push(
      makeEnemy({ id: 9100, pos: { x: p.x - 120, y: p.y } }),
      makeEnemy({ id: 9101, pos: { x: p.x + 120, y: p.y - 18 } }),
      makeEnemy({ id: 9102, pos: { x: p.x + 120, y: p.y } }),
      makeEnemy({ id: 9103, pos: { x: p.x + 120, y: p.y + 18 } }),
    );
    const input = botAct(createBot("balanced"), state);
    expect(input.aim).toBeDefined();
    expect(input.aim!.x).toBeGreaterThan(p.x);
  });
});

describe("bot safe-direction kiting", () => {
  // An OVERWHELMED retreat (bar chewed below the caution line, a real pack
  // pressing) drifts BACKWARD along the spawn→boss axis — toward cleared
  // ground — because the fresh spawns live ahead. A banked NUKE makes the bot
  // daring: it keeps the classic forward drift even while hurt.
  const retreatAxisDot = (nuke: boolean): number => {
    const state = equipBlaster(startGame());
    clearStage(state);
    // Boss-ready and fully discovered, so the macro goal is unambiguously the
    // BOSS (forward) — the daring drift has one direction to show.
    state.player.level = 99;
    state.explored.fill(1);
    state.obstacles = state.obstacles.filter((o) => !o.chest);
    // Chewed below the caution line (but above the emergency fleeHp bail).
    state.player.hp = Math.round(state.player.maxHp * 0.5);
    if (nuke) state.player.heldAbilities.push("screen_nuke");
    const boss = state.enemies.find((e) => enemyDef(e.defId).role === "boss")!;
    // Stand mid-axis (ground behind to give), outside the boss lock.
    const sx = state.playerSpawn.x;
    const sy = state.playerSpawn.y;
    let ax = boss.pos.x - sx;
    let ay = boss.pos.y - sy;
    const am = Math.hypot(ax, ay) || 1;
    ax /= am;
    ay /= am;
    state.player.pos = { x: sx + ax * (am / 2), y: sy + ay * (am / 2) };
    // A real pack breaching the danger bubble PERPENDICULAR to the axis, so
    // the give-ground bearing along the axis is decided by the bias alone.
    for (const [i, off] of [50, 70, 90].entries()) {
      state.enemies.push(
        makeEnemy({
          id: 9100 + i,
          pos: {
            x: state.player.pos.x - ay * off,
            y: state.player.pos.y + ax * off,
          },
          hp: 1_000_000,
          maxHp: 1_000_000,
        }),
      );
    }
    const input = botAct(createBot("balanced"), state);
    return (
      (input.target.x - state.player.pos.x) * ax +
      (input.target.y - state.player.pos.y) * ay
    );
  };

  it("kites an overwhelming pack BACKWARD, toward cleared ground", () => {
    expect(retreatAxisDot(false)).toBeLessThan(0);
  });

  it("keeps the daring forward drift with a nuke banked", () => {
    expect(retreatAxisDot(true)).toBeGreaterThan(0);
  });
});

describe("bot jump discipline", () => {
  // Jumps are expensive (a takeoff spends 10% of the pool and only standing still
  // refills it), so the bot saves them for breaking a genuine SURROUND — and even
  // then only spends one when a body is about to bite, running the rest of the way
  // out on foot so it never winds itself into the jog-capped death spiral.
  function ringHero(state: GameState, radius: number, n = 12): void {
    const c = { ...state.player.pos };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      state.enemies.push(
        makeEnemy({
          pos: { x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 99,
          speed: 20,
        }),
      );
    }
  }

  it("breaks a surround on FOOT while the ring is still off him", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 110); // encircled, but nothing is inside biting range yet
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("PUNCH OUT");
    expect(input.jump).toBe(false); // runs the gap open, banking the pool
  });

  it("spends the jump only once a body closes to biting range", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 40); // a body inside contact range — hop over the ring
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("PUNCH OUT");
    expect(input.jump).toBe(true);
  });

  it("will not hop itself out of stamina to break a surround", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 40); // a body biting — would hop with a full pool
    state.player.stamina = state.player.maxStamina * 0.2; // …but the pool is low
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("PUNCH OUT");
    expect(input.jump).toBe(false); // keeps its sprint legs instead of winding out
  });

  it("dodges a telegraphed move on foot, not with a jump", () => {
    // A slam/charge is dodged by stepping off the line — the windup gives time to
    // walk clear, so the hop that used to fire here was a needless stamina drain.
    const state = equipBlaster(startGame());
    clearStage(state);
    // A charging elite locked onto the hero, mid-dash straight at him.
    const foe = makeEnemy({
      pos: { x: state.player.pos.x - 60, y: state.player.pos.y },
      hp: 1_000_000,
      maxHp: 1_000_000,
    });
    foe.mech = { dashMs: 400, dashDir: { x: 1, y: 0 } };
    state.enemies.push(foe);
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("DODGE");
    expect(input.jump).toBe(false);
  });

  it("jumps to escape a bite when bleeding below half, no surround needed", () => {
    // Bleeding + a LANDED hit + a body about to bite warrants the untouchable
    // airborne frames — the hero doesn't have to be fully ringed to hop out.
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.hp = state.player.maxHp * 0.45; // below the ~half hop threshold
    state.player.hurtFlashMs = 250; // the bite just landed
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 38, y: state.player.pos.y }, // biting
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 20,
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.jump).toBe(true);
  });

  it("stays grounded while bleeding if no hit has actually landed", () => {
    // Low HP + a body at contact range but NO recent bite: proximity alone is
    // not a cue to spend the pool — without the landed-hit gate the bleeding
    // hero re-hopped on every cooldown for as long as a body shadowed him.
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.hp = state.player.maxHp * 0.45;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 38, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 20,
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.jump).toBe(false);
  });

  it("spaces discretionary hops out by the cooldown", () => {
    // One escape hop, then feet until the next is earned: the same genuine
    // surround that warrants the first hop is refused a second one until
    // `hopCooldownMs` has passed.
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 40); // a body biting inside a genuine ring
    const bot = createBot("survivor");
    expect(botAct(bot, state).jump).toBe(true); // the first hop fires
    state.stats.timeMs = 1000; // still inside the cooldown window
    expect(botAct(bot, state).jump).toBe(false); // breaks out on foot
    state.stats.timeMs = 4000; // cooldown served
    expect(botAct(bot, state).jump).toBe(true); // the next hop is earned
  });

  it("stays on foot for a lone biter while healthy", () => {
    // Same single biter, but at full HP and no surround — nothing warrants a hop,
    // so he gives ground on foot and banks the pool.
    const state = equipBlaster(startGame());
    clearStage(state);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 38, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 20,
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.jump).toBe(false);
  });

  it("flinches back a few px right after taking a hit", () => {
    // Taking damage is itself a signal to give ground: a foe the hero would
    // otherwise HOLD and grind is peeled off for a beat once he's been bitten.
    const stage = () => {
      const state = startGame(); // default melee sword
      clearStage(state);
      // Under-leveled vs the parked boss — probe the classic hold, not the
      // boss-ready rush posture.
      state.enemies.find((e) => enemyDef(e.defId).role === "boss")!.mlvl = 20;
      state.player.disarmed = false;
      const reach = weaponRangeFor(state, state.player.equipment.weapon);
      state.enemies.push(
        makeEnemy({
          pos: { x: state.player.pos.x + reach * 0.75, y: state.player.pos.y },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 1,
          speed: 0, // stationary — isolate the flinch, not the chase
        }),
      );
      return state;
    };
    // Unhurt: the foe sits in the hold band — he stands and grinds.
    const calm = stage();
    const calmBot = createBot("balanced");
    expect(botAct(calmBot, calm).steering).toBe(false); // HOLD

    // Just bitten: the widened danger bubble now covers that same foe → give ground.
    const hurt = stage();
    hurt.player.hurtFlashMs = 200;
    const hurtBot = createBot("balanced");
    const input = botAct(hurtBot, hurt);
    expect(hurtBot.lastThought).toBe("GIVE GROUND");
    expect(input.steering).toBe(true);
  });
});

describe("bot hop commitment", () => {
  // A jump is DECIDED before it fires (Bot.hopPlan): the bot picks WHY (flee /
  // reposition) and WHERE (a landing ground its body can actually reach), then
  // sticks to that plan for the whole flight. Without the commitment the
  // takeoff restarts the hop cooldown, the very next airborne tick re-decides
  // into a calmer branch, and the "escape" degenerates into a straight-up
  // bounce that spends 10% of the pool and repositions nothing.
  function ringHero(state: GameState, radius: number, n = 12): void {
    const c = { ...state.player.pos };
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      state.enemies.push(
        makeEnemy({
          pos: { x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 99,
          speed: 20,
        }),
      );
    }
  }

  it("latches a flee plan at takeoff and steers the whole flight at it", () => {
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 40); // a body biting inside a genuine ring — hop out
    const bot = createBot("survivor");
    const takeoff = botAct(bot, state);
    expect(takeoff.jump).toBe(true);
    expect(bot.hopPlan?.flee).toBe(true);
    const plan = bot.hopPlan!;
    // Airborne the next tick: the re-decide must NOT dissolve the jump — the
    // bot keeps steering at the committed escape ground until he lands.
    state.player.z = 20;
    state.stats.timeMs = 100;
    const flight = botAct(bot, state);
    expect(flight.steering).toBe(true);
    expect(flight.jump).toBe(false); // one takeoff per decision, no re-request
    expect(dist(flight.target, plan.target)).toBeLessThan(25);
    // Landed: the jump's purpose is spent — the plan clears, the read resumes.
    state.player.z = 0;
    state.stats.timeMs = 200;
    botAct(bot, state);
    expect(bot.hopPlan).toBeFalsy();
  });

  it("refuses the hop when no landing ground is reachable", () => {
    // Boxed in by TALL walls on every side, a jump cannot translate anywhere —
    // it would just rise in place and burn the pool. The break-out stays on
    // FOOT (nav rounds what it can); the takeoff is refused.
    const state = equipBlaster(startGame());
    clearStage(state);
    ringHero(state, 40); // the same ring that earns a hop on open ground
    const p = state.player.pos;
    state.obstacles = [
      ...state.obstacles,
      {
        id: 9601,
        kind: "wall",
        sprite: "wall",
        jumpable: false,
        pos: { x: p.x, y: p.y - 60 },
        radius: 0,
        half: { x: 60, y: 10 },
      },
      {
        id: 9602,
        kind: "wall",
        sprite: "wall",
        jumpable: false,
        pos: { x: p.x, y: p.y + 60 },
        radius: 0,
        half: { x: 60, y: 10 },
      },
      {
        id: 9603,
        kind: "wall",
        sprite: "wall",
        jumpable: false,
        pos: { x: p.x - 60, y: p.y },
        radius: 0,
        half: { x: 10, y: 60 },
      },
      {
        id: 9604,
        kind: "wall",
        sprite: "wall",
        jumpable: false,
        pos: { x: p.x + 60, y: p.y },
        radius: 0,
        half: { x: 10, y: 60 },
      },
    ];
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("PUNCH OUT");
    expect(input.jump).toBe(false);
    expect(bot.hopPlan).toBeFalsy();
  });

  it("melee keeps its escape hop — jumps flee, they never press", () => {
    // A melee blade can't land a blow while airborne (step.ts z-gates the
    // swing), so a melee hero's jumps exist to FLEE a pack that has him — the
    // one purpose the user-visible surround break-out serves. That hop must
    // survive the loadout gates on the forward-press branches.
    const state = startGame(); // default melee sword
    clearStage(state);
    state.player.disarmed = false;
    ringHero(state, 40);
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("PUNCH OUT");
    expect(input.jump).toBe(true);
    expect(bot.hopPlan?.flee).toBe(true);
  });
});

describe("bot pickup discipline", () => {
  it("leaves a consumable on the ground when its stack is already full", () => {
    // A full stack turns the pickup away at the touch (step.ts), so steering
    // at it parks the hero on an item he can never collect — a capped kind is
    // simply not wanted until one is spent.
    const state = startGame();
    clearStage(state);
    state.items = [
      {
        id: 9001,
        kind: "repair",
        pos: { x: state.player.pos.x + 150, y: state.player.pos.y },
      },
    ];
    state.player.repairKits = CONSUMABLES.stackCap;
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("GRAB ITEM");

    // The same kit with pocket room IS wanted — the filter is the stack cap.
    state.player.repairKits = 0;
    const wanting = createBot("survivor");
    botAct(wanting, state);
    expect(wanting.lastThought).toBe("GRAB ITEM");
  });

  it("detours to a golden arrow ahead of nearer ordinary loot", () => {
    // A warm arrow pays a real share of the level bar — worth more than any
    // consumable, so it wins the pick even when a medkit lies closer.
    const state = startGame();
    clearStage(state);
    state.items = [
      {
        id: 9001,
        kind: "medkit",
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
      },
      {
        id: 9002,
        kind: "xp",
        pos: { x: state.player.pos.x - 150, y: state.player.pos.y },
      },
    ];
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("GRAB ITEM");
    expect(input.target.x).toBeLessThan(state.player.pos.x); // toward the arrow
  });
});

describe("bot consumable top-off", () => {
  // With a stack at its cap the ground pickup is refused (it stays where it
  // lies), so passing over one with full pockets normally wastes it. The
  // PASS-OVER TOP-OFF spends one from the full stack — only when the bar that
  // kind feeds has real room — so the walked-over pickup refills it.
  it("drinks a stamina potion in passing to make room for the one underfoot", () => {
    const state = startGame();
    clearStage(state);
    state.player.staminaPotions = CONSUMABLES.stackCap;
    state.player.stamina = state.player.maxStamina * 0.5;
    state.items = [{ id: 9001, kind: "drink", pos: { ...state.player.pos } }];
    const input = botAct(createBot("survivor"), state);
    expect(input.useStaminaPotion).toBe(true);
  });

  it("keeps the stack corked when the pool is basically full", () => {
    const state = startGame();
    clearStage(state);
    state.player.staminaPotions = CONSUMABLES.stackCap;
    state.player.stamina = state.player.maxStamina; // nothing to top off
    state.items = [{ id: 9001, kind: "drink", pos: { ...state.player.pos } }];
    const input = botAct(createBot("survivor"), state);
    expect(input.useStaminaPotion).toBe(false);
  });

  it("mends in passing when a kit lies underfoot and the loadout carries wear", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = CONSUMABLES.stackCap;
    state.player.equipment.weapon.durability = 60; // worn, far from breaking
    state.items = [{ id: 9001, kind: "repair", pos: { ...state.player.pos } }];
    const input = botAct(createBot("survivor"), state);
    expect(input.useRepairKit).toBe(true);
  });

  it("rate-limits the top-off so a kit-littered field is not a crawl", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = CONSUMABLES.stackCap;
    state.player.equipment.weapon.durability = 60;
    state.items = [{ id: 9001, kind: "repair", pos: { ...state.player.pos } }];
    const bot = createBot("survivor");
    expect(botAct(bot, state).useRepairKit).toBe(true); // first switch fires
    state.stats.timeMs = 5000; // inside the 10s cooldown
    expect(botAct(bot, state).useRepairKit).toBe(false);
    state.stats.timeMs = 11_000; // cooldown served
    expect(botAct(bot, state).useRepairKit).toBe(true);
  });
});

describe("bot arrow strategy", () => {
  // The bot LEARNS what a golden arrow pays (5% increments) from the "+N XP"
  // collection events, and treats a nearby arrow that would DING — a level-up
  // is a free full heal — as a strategic medkit.
  it("learns an arrow's XP share from the collection event", () => {
    const state = startGame();
    clearStage(state);
    state.player.xpToNext = 100;
    state.events.push({
      type: "itemCollected",
      kind: "xp",
      name: "GOLDEN ARROW",
      xp: 23,
    });
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.arrowXp?.pct).toBe(0.25); // 23% remembered as the 25% step
  });

  it("holds the medkit when a dinging arrow is in reach", () => {
    const state = startGame();
    clearStage(state);
    const player = state.player;
    player.medkits[0] = 2;
    player.hp = player.maxHp * 0.45; // would normally pop a kit (< 55%)
    player.xpToNext = 100;
    player.xp = 85; // a 25% arrow tips the bar
    state.items = [
      {
        id: 9001,
        kind: "xp",
        pos: { x: player.pos.x + 100, y: player.pos.y },
      },
    ];
    const bot = createBot("survivor");
    bot.arrowXp = { pct: 0.25, level: player.level };
    expect(botAct(bot, state).useMedkit).toBe(false); // the arrow is the heal

    // Nearly dead, the gamble is off — the kit fires even with the arrow near.
    player.hp = player.maxHp * 0.2;
    expect(botAct(bot, state).useMedkit).toBe(true);
  });

  it("grabs the dinging arrow over a medkit when bleeding", () => {
    const state = startGame();
    clearStage(state);
    const player = state.player;
    // Below even the aggro fleeHp bail (0.28) — the boss-ready fixture run
    // flips the balanced posture to its rush/aggro row.
    player.hp = player.maxHp * 0.25;
    player.xpToNext = 100;
    player.xp = 85;
    state.items = [
      {
        id: 9001,
        kind: "medkit",
        pos: { x: player.pos.x + 60, y: player.pos.y },
      },
      {
        id: 9002,
        kind: "xp",
        pos: { x: player.pos.x - 120, y: player.pos.y },
      },
    ];
    state.enemies.push(
      makeEnemy({
        pos: { x: player.pos.x + 200, y: player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 20,
      }),
    );
    const bot = createBot("survivor");
    bot.arrowXp = { pct: 0.25, level: player.level };
    botAct(bot, state);
    expect(bot.lastThought).toBe("GRAB ARROW");
  });
});

describe("bot chest cracking", () => {
  function placeChest(state: GameState, dx: number): void {
    state.obstacles = [
      ...state.obstacles,
      {
        id: 9500,
        kind: "chest",
        sprite: "locker",
        pos: { x: state.player.pos.x + dx, y: state.player.pos.y },
        radius: 9,
        jumpable: true,
        breakable: true,
        chest: true,
        hp: 20,
        maxHp: 20,
      },
    ];
  }

  it("walks to a nearby chest and smashes it open", () => {
    // A locker on a quiet field is never walked past: the bot closes to
    // weapon range and plants, and the auto-attack (stepWeapon's crate
    // fallback) breaks it open.
    const state = equipBlaster(startGame());
    clearStage(state);
    placeChest(state, 200);
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).toBe("CRACK CHEST");
    const steps = drive(
      state,
      bot,
      2000,
      (s) => !s.obstacles.some((o) => o.chest && o.id === 9500),
    );
    expect(steps).toBeLessThan(2000); // cracked, loot spilled
  });

  it("scoops the cracked chest's spill instead of marching off", () => {
    // The payoff of the errand IS the loot on the ground — a human sweeps up
    // the stamina pot / gear the locker just spilled before moving on, and
    // never celebrates the crack with a jump (there is nothing to escape).
    const state = equipBlaster(startGame());
    clearStage(state);
    placeChest(state, 200);
    const bot = createBot("survivor");
    drive(state, bot, 2000, (s) => !s.obstacles.some((o) => o.chest));
    expect(state.items.length).toBeGreaterThan(0); // the locker paid out
    const jumpsAtCrack = state.stats.jumps;
    // A collectable piece is one the bot's own filters would keep (uncapped
    // stack, bag room) — everything the chest drops here on a fresh hero.
    const scooped = drive(
      state,
      bot,
      2000,
      (s) => !s.items.some((i) => i.kind !== "xp"),
    );
    expect(scooped).toBeLessThan(2000); // every spilled piece banked
    expect(state.stats.jumps).toBe(jumpsAtCrack); // on foot the whole time
  });
});

describe("bot winded pacing", () => {
  // Stage a hero with one stationary foe at `foeDist` px and the sprint pool
  // at `frac` of max — the two axes the walk rule reads.
  function stage(foeDist: number, frac: number): GameState {
    const state = startGame();
    clearStage(state);
    state.player.disarmed = false;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + foeDist, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        speed: 0,
      }),
    );
    state.player.stamina = state.player.maxStamina * frac;
    return state;
  }

  it("runs freely in the open while the pool sits above the reserve floor", () => {
    // Sprint is cheap ground covered — with no fight in sight the bot spends
    // the pool down to the ~20% reserve rather than pacing itself early.
    const state = stage(600, 0.5);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBeUndefined();
  });

  it("drops to the recovery walk at the reserve floor", () => {
    const state = stage(600, 0.15);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBe(STAMINA.walkThrottle);
  });

  it("stands to catch breath when bone-dry — standing clears the regen lockout", () => {
    // A dry pool re-arms `STAMINA.emptyRegenLockMs` on every draining frame,
    // so a hero who keeps pushing never regains a drop (and even the recovery
    // walk crawls at a quarter speed under the empty-pool cap). With nothing
    // inside the walk-threat ring he PLANTS: the stand runs the lockout down
    // and then refills at the full breather rate.
    const state = stage(600, 0);
    const bot = createBot("balanced");
    const input = botAct(bot, state);
    expect(input.steering).toBe(false);
    expect(bot.lastThought).toBe("CATCH BREATH");
  });

  it("releases the stand into the recovery walk at the reserve floor", () => {
    const state = stage(600, 0);
    const bot = createBot("balanced");
    botAct(bot, state); // bone-dry — the winded stand latches
    // The pool climbed back to the reserve floor: stand → walk, and the walk
    // (still latched as recovering) carries it on toward the resume band.
    state.player.stamina = state.player.maxStamina * 0.3;
    const input = botAct(bot, state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBe(STAMINA.walkThrottle);
  });

  it("never stands bone-dry with a foe inside the walk-threat ring", () => {
    // The body at 120px would maul a parked hero — he keeps moving (the
    // engine's empty-pool jog cap is the pace) and recovers later.
    const state = stage(120, 0);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
  });

  it("keeps the full sprint pace while a foe is really close", () => {
    // The body at 120px can run a walking hero down — pacing is for the quiet
    // stretches, so he spends what's left of the pool at full speed.
    const state = stage(120, 0.05);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBeUndefined();
  });

  it("latches the walk until the pool recovers past the resume line", () => {
    // Hysteresis: a fresh (timid — floor ~25%) bot at 35% runs (never dipped
    // below the floor), but once the pool has hit the reserve the SAME bot
    // keeps walking through 35% and only opens back up a full band above the
    // floor (~45%).
    const fresh = stage(600, 0.35);
    expect(botAct(createBot("balanced"), fresh).throttle).toBeUndefined();

    const state = stage(600, 0.2);
    const bot = createBot("balanced");
    expect(botAct(bot, state).throttle).toBe(STAMINA.walkThrottle); // floored
    state.player.stamina = state.player.maxStamina * 0.35;
    expect(botAct(bot, state).throttle).toBe(STAMINA.walkThrottle); // recovering
    state.player.stamina = state.player.maxStamina * 0.5;
    expect(botAct(bot, state).throttle).toBeUndefined(); // recovered — run
  });
});

describe("bot bravery", () => {
  // The reserve floor and the pre-fight rested bar slide with how much the
  // hero can afford: weapon punch vs the local health bars, supplies in the
  // pockets, and the recent shredding rate. A naked rookie paces timidly; a
  // kitted shredder digs deep into the pool.
  function march(frac: number): GameState {
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.disarmed = false;
    // A distant tank keeps the field non-empty and the bars enormous, so the
    // weapon axis reads ~0 for the rookie cases.
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 900, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: 0,
      }),
    );
    state.player.stamina = state.player.maxStamina * frac;
    return state;
  }

  function kitOut(state: GameState): void {
    state.player.medkits[0] = 3;
    state.player.staminaPotions = 3;
    state.player.heldAbilities = ["test_nuke", "test_storm"];
  }

  it("a naked rookie paces at the timid floor", () => {
    const state = march(0.2); // below the timid ~25% floor
    expect(botAct(createBot("balanced"), state).throttle).toBe(
      STAMINA.walkThrottle,
    );
  });

  it("a stocked-up hero runs deeper into the pool", () => {
    // Full pockets (medkits, potions, a nuke + storm banked) buy roughly half
    // the bravery scale — the floor slides under 20%, so the same pool level
    // that walked the rookie keeps this hero running.
    const state = march(0.2);
    kitOut(state);
    expect(botAct(createBot("balanced"), state).throttle).toBeUndefined();
  });

  it("a hero one-shotting the local bars digs nearly to the brave floor", () => {
    // Tiny health bars: one blaster bolt strips a whole bar, so the weapon
    // axis reads fully brave — with full pockets the floor sits near 10%.
    const state = march(0.15);
    kitOut(state);
    for (const enemy of state.enemies) {
      enemy.maxHp = 5;
      enemy.hp = 5;
    }
    expect(botAct(createBot("balanced"), state).throttle).toBeUndefined();

    state.player.stamina = state.player.maxStamina * 0.08; // under even that
    expect(botAct(createBot("balanced"), state).throttle).toBe(
      STAMINA.walkThrottle,
    );
  });

  it("a brave hero engages at ~70% without a breather", () => {
    // Same spotted-pack setup that plants the timid rookie: fast pack 400px
    // out, pool at 75%. Fully kitted and one-shotting, the rested bar relaxes
    // to ~70%, so he engages instead of idling for the last drops.
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.disarmed = false;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 400, y: state.player.pos.y },
        hp: 5,
        maxHp: 5,
        mlvl: 1,
        speed: 60,
      }),
    );
    kitOut(state);
    state.player.stamina = state.player.maxStamina * 0.75;
    const bot = createBot("balanced");
    const input = botAct(bot, state);
    expect(input.steering).toBe(true);
    expect(bot.lastThought).not.toBe("BREATHER");
  });
});

describe("bot pre-fight top-up", () => {
  // The sprint pool is FIGHT fuel: a pack spotted inside the top-up range is
  // engaged at 100%. The where-do-we-meet read picks the pace — walk the
  // approach when the walk regen refills before contact, else plant and let
  // them cover the ground while the faster standstill regen races them.
  function spot(foeDist: number, foeSpeed: number, frac: number): GameState {
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.disarmed = false;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + foeDist, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
        speed: foeSpeed,
      }),
    );
    state.player.stamina = state.player.maxStamina * frac;
    return state;
  }

  it("plants a breather when walking can't refill before contact", () => {
    // A fast pack 400px out, pool at 30%: walking at them meets far too soon,
    // so he stands his ground and tops up while they close.
    const state = spot(400, 60, 0.3);
    const bot = createBot("balanced");
    const input = botAct(bot, state);
    expect(input.steering).toBe(false);
    expect(bot.lastThought).toBe("BREATHER");
  });

  it("walks the approach when the meet-math says the pool refills in time", () => {
    // A slow camp at the spot horizon, pool nearly full: the walk regen wins
    // the race, so he keeps covering ground at the breather pace.
    const state = spot(460, 5, 0.9);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBe(STAMINA.walkThrottle);
  });

  it("engages at full pool without pausing", () => {
    const state = spot(400, 60, 1);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBeUndefined();
  });

  it("ignores a pack beyond the spot range — open-field rules apply", () => {
    const state = spot(600, 60, 0.5);
    const input = botAct(createBot("balanced"), state);
    expect(input.steering).toBe(true);
    expect(input.throttle).toBeUndefined();
  });
});

describe("bot travel discipline", () => {
  // A jump on open ground buys nothing (the untouchable frames only matter
  // with a body about to bite) and every takeoff spends 10% of a pool that
  // only refills standing still — so the macro march never hops, and the
  // stamina potions stay corked for actual fights.
  function quietMarch(): GameState {
    const state = equipBlaster(startGame());
    clearStage(state); // just the parked boss, far away — a quiet field
    state.player.disarmed = false;
    return state;
  }

  it("marches open ground on foot, never hopping", () => {
    const state = quietMarch();
    const input = botAct(createBot("survivor"), state);
    expect(input.steering).toBe(true);
    expect(input.jump).toBe(false);
  });

  it("keeps the stamina potion corked with no threat around", () => {
    const state = quietMarch();
    state.player.staminaPotions = 5;
    state.player.stamina = 0; // bone-dry mid-march — jog it off, don't drink
    const input = botAct(createBot("survivor"), state);
    expect(input.useStaminaPotion).toBeFalsy();
  });

  it("drinks the stamina potion winded with a threat pressing", () => {
    const state = quietMarch();
    state.player.staminaPotions = 5;
    state.player.stamina = state.player.maxStamina * 0.1;
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
        mlvl: 99,
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.useStaminaPotion).toBe(true);
  });
});

describe("bot powerup strategy", () => {
  // The bot plays the dock by VALUE (nuke > storm > orbit > stasis > magnet):
  // the nuke waits for a real crowd, combat powers for a decent fight, and the
  // cheap utilities are spent eagerly — including as shelf-space burns that
  // keep a dock slot cycling free for the next strong pickup.
  function stage(): GameState {
    const state = equipBlaster(startGame());
    clearStage(state);
    state.player.disarmed = false;
    return state;
  }

  /** Ring `n` slow tanks around the hero, inside the surround ring. */
  function pack(state: GameState, n: number, radius = 100): void {
    const c = state.player.pos;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      state.enemies.push(
        makeEnemy({
          id: 9200 + i,
          pos: { x: c.x + Math.cos(a) * radius, y: c.y + Math.sin(a) * radius },
          hp: 1_000_000,
          maxHp: 1_000_000,
          mlvl: 99,
          speed: 20,
        }),
      );
    }
  }

  it("saves the nuke through a sizeable fight — it waits for the flood", () => {
    const state = stage();
    state.player.heldAbilities = ["test_nuke"];
    pack(state, 10);
    expect(botAct(createBot("survivor"), state).useItem).toBeFalsy();
  });

  it("spends the nuke into an overwhelming flood", () => {
    const state = stage();
    state.player.heldAbilities = ["test_nuke"];
    pack(state, 22, 120); // a real flood, inside the blast radius
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(0);
  });

  it("hands the flood to the most precious power, not the oldest slot", () => {
    const state = stage();
    state.player.heldAbilities = ["test_stasis", "test_nuke"];
    pack(state, 22, 120);
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(1); // the nuke — not the older stasis
  });

  it("times a combat power for a decent fight", () => {
    const state = stage();
    state.player.heldAbilities = ["test_storm"];
    pack(state, 3);
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(0);
  });

  it("pops the stasis when cornered — winded, bleeding, a pack hunting", () => {
    const state = stage();
    state.player.heldAbilities = ["test_stasis"];
    state.player.stamina = state.player.maxStamina * 0.1; // can't outrun them
    state.player.hp = state.player.maxHp * 0.4; // bleeding under half
    pack(state, 5, 200); // five hunters inside the threat ring
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(0);
  });

  it("keeps the stasis banked while healthy — even against the same pack", () => {
    const state = stage();
    state.player.heldAbilities = ["test_stasis"];
    pack(state, 5, 200); // same hunters, but rested and unhurt
    expect(botAct(createBot("survivor"), state).useItem).toBeFalsy();
  });

  it("pops the magnet over a lootable spill", () => {
    const state = stage();
    state.player.heldAbilities = ["test_magnet"];
    const p = state.player.pos;
    state.items = [0, 1, 2].map((i) => ({
      id: 9300 + i,
      kind: "medkit" as const,
      pos: { x: p.x + 26 + i * 6, y: p.y + 18 },
    }));
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(0);
  });

  it("burns the junk utility once the dock is down to its last open slot", () => {
    const state = stage();
    // Two of three slots taken, no fight and no loot anywhere — the magnet
    // still burns so a slot keeps cycling free for the next strong pickup.
    state.player.heldAbilities = ["test_magnet", "test_storm"];
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(0);
  });

  it("with a full dock burns the cheapest power — never the nuke", () => {
    const state = stage();
    state.player.heldAbilities = ["test_nuke", "test_storm", "test_stasis"];
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBe(true);
    expect(input.useItemIndex).toBe(2); // the stasis — cheapest on the shelf
  });

  it("holds a full dock of combat powers with nobody around to hit", () => {
    const state = stage();
    state.player.heldAbilities = ["test_storm", "test_storm", "test_storm"];
    expect(botAct(createBot("survivor"), state).useItem).toBeFalsy();
  });

  it("sorts the dock into its own priority order, one move per tick", () => {
    // The viewer-facing ranking: the bot walks the row into best-first order
    // (nuke ahead of stasis) so the dock on screen reads how it values them.
    const state = stage();
    state.player.heldAbilities = ["test_stasis", "test_nuke"];
    const input = botAct(createBot("survivor"), state);
    expect(input.useItem).toBeFalsy();
    expect(input.moveItem).toEqual({ from: 1, to: 0 });
    // Applying the move settles the dock; the next tick has nothing to sort.
    step(state, input, DT);
    expect(state.player.heldAbilities).toEqual(["test_nuke", "test_stasis"]);
    expect(botAct(createBot("survivor"), state).moveItem).toBeUndefined();
  });

  it("drops the cheapest powerup to make room for a better find", () => {
    // Dock full of lesser powers, a NUKE lying in reach: toss the magnet (the
    // cheapest — never a trade DOWN) so the walk-over can bank the find.
    const state = stage();
    state.player.heldAbilities = ["test_magnet", "test_storm", "test_storm"];
    state.items = [
      {
        id: 9400,
        kind: "ability",
        defId: "test_nuke",
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
      },
    ];
    const input = botAct(createBot("survivor"), state);
    expect(input.dropItemIndex).toBe(0);
  });

  it("prefers freeing a RUNNING slot — already spent, the drop costs nothing", () => {
    const state = stage();
    state.player.heldAbilities = ["test_storm", "test_storm", "test_storm"];
    // Slot 0 is running in place; even a lowly magnet find justifies freeing
    // it, since the storm keeps striking either way.
    state.player.abilities.push({
      defId: "test_storm",
      remainingMs: 5000,
      angle: 0,
      cooldownMs: 0,
      slot: 0,
    });
    state.items = [
      {
        id: 9401,
        kind: "ability",
        defId: "test_magnet",
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
      },
    ];
    const input = botAct(createBot("survivor"), state);
    expect(input.dropItemIndex).toBe(0);
  });

  it("won't trade a banked power DOWN for a lesser ground find", () => {
    const state = stage();
    state.player.heldAbilities = ["test_storm", "test_storm", "test_storm"];
    state.items = [
      {
        id: 9402,
        kind: "ability",
        defId: "test_magnet",
        pos: { x: state.player.pos.x + 80, y: state.player.pos.y },
      },
    ];
    const input = botAct(createBot("survivor"), state);
    expect(input.dropItemIndex).toBeUndefined();
  });
});

describe("bot profiles", () => {
  // Tally the stats an 8-beat allocation cycle spends, advancing spentStats
  // directly so the rotation index (which keys off spent points) walks the whole
  // cycle without tangling with the level-scaled stat cap.
  const tally = (profile: "melee" | "ranged" | "magic", n = 48) => {
    const state = startGame();
    const bot = createBot("balanced", profile);
    const counts: Partial<Record<string, number>> = {};
    for (let i = 0; i < n; i++) {
      const stat = botAllocate(bot, state);
      counts[stat] = (counts[stat] ?? 0) + 1;
      state.player.spentStats[stat]++;
    }
    return counts;
  };
  const top = (counts: Partial<Record<string, number>>) =>
    Object.entries(counts).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0]![0];

  it("melee pours into strength but still banks INT for the AoE cleave", () => {
    const c = tally("melee");
    expect(top(c)).toBe("strength");
    expect(c.intelligence ?? 0).toBeGreaterThan(0); // reach/AoE/crit
    expect(c.dexterity ?? 0).toBeGreaterThan(0); // swing cadence
  });

  it("ranged gates on DEX yet banks STR (its damage) and INT", () => {
    const c = tally("ranged");
    expect(top(c)).toBe("dexterity");
    expect(c.strength ?? 0).toBeGreaterThan(0); // guns scale off STR
    expect(c.intelligence ?? 0).toBeGreaterThan(0); // reach/AoE/crit
  });

  it("magic commits to INT and feeds SPIRIT", () => {
    const c = tally("magic");
    expect(top(c)).toBe("intelligence");
    expect(c.spirit ?? 0).toBeGreaterThan(0); // mana pool + regen
  });

  it("a fixed profile pins the lane regardless of the held weapon", () => {
    // A magic profile allocates INT even with the default melee sword in hand.
    const state = startGame();
    const bot = createBot("balanced", "magic");
    expect(botAllocate(bot, state)).toBe("intelligence");
  });

  it("defaults to the META (level-band) profile", () => {
    expect(createBot("survivor").profile).toBe("meta");
  });

  it("meta picks melee / magic / melee by the level it is spun up at", () => {
    // The lane itself: melee early, magic mid–high (armor climbs ~40), melee at
    // the artifact cap.
    expect(metaLane(1)).toBe("melee");
    expect(metaLane(39)).toBe("melee");
    expect(metaLane(40)).toBe("magic");
    expect(metaLane(98)).toBe("magic");
    expect(metaLane(99)).toBe("melee");

    // And it drives the allocation off the STARTING level: a fresh bot per level
    // opens its lane's rotation on its primary — STR for melee, INT for magic.
    const laneStat = (level: number): string => {
      const state = startGame();
      state.player.level = level;
      return botAllocate(createBot("survivor"), state); // default meta
    };
    expect(laneStat(5)).toBe("strength"); // early melee
    expect(laneStat(50)).toBe("intelligence"); // mid–high magic
    expect(laneStat(99)).toBe("strength"); // endgame melee (artifacts)
  });

  it("meta COMMITS its lane at spin-up and does not thrash as the hero levels", () => {
    // A bot spun up in the nightmare mid-game locks MAGIC and keeps allocating
    // INT even after it levels into the endgame band — spent points can't be
    // reallocated, so the lane is decided once, not re-evaluated per level.
    const state = startGame();
    state.player.level = 50; // constructed mid-game → magic
    const bot = createBot("survivor");
    expect(botAllocate(bot, state)).toBe("intelligence");
    state.player.level = 99; // now at the cap — lane stays put
    expect(botAllocate(bot, state)).toBe("intelligence");
    expect(bot.metaLaneChoice).toBe("magic");
  });
});

describe("bot repair awareness", () => {
  /** A held weapon worn down to `durability`, so the wear heuristics fire. */
  function wornWeapon(durability: number): Equipment {
    return {
      id: 7000,
      defId: "test_pipe",
      slot: "weapon",
      tier: "regular",
      ilvl: 5,
      affixes: [],
      durability,
    };
  }

  it("detours to a repair kit when the blade is wearing thin and it holds none", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = 0;
    state.player.equipment.weapon = wornWeapon(1); // nearly spent
    // A threat present but well beyond the danger bubble, so the hero is free to
    // scoop the kit rather than give ground.
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
      }),
    );
    // A repair kit on the ground within detour reach.
    state.items.push({
      id: 8001,
      kind: "repair",
      pos: { x: state.player.pos.x + 100, y: state.player.pos.y },
    });
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("GET REPAIR");
    expect(input.target.x).toBeGreaterThan(state.player.pos.x); // toward the kit
  });

  it("spends a held repair kit once the weapon is nearly spent", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = 1;
    state.player.equipment.weapon = wornWeapon(1);
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.useRepairKit).toBe(true);
  });

  it("holds the kit while the blade is still healthy", () => {
    const state = startGame();
    clearStage(state);
    state.player.repairKits = 1;
    state.player.equipment.weapon = wornWeapon(
      weaponDef("test_pipe").durability, // fresh
    );
    state.enemies.push(
      makeEnemy({
        pos: { x: state.player.pos.x + 200, y: state.player.pos.y },
      }),
    );
    const input = botAct(createBot("survivor"), state);
    expect(input.useRepairKit).toBeFalsy();
  });

  it("keeps a botted horde run deterministic", () => {
    const a = startGame();
    const b = startGame();
    drive(a, createBot("survivor"), 1200);
    drive(b, createBot("survivor"), 1200);
    expect(a.player.pos).toEqual(b.player.pos);
    expect(a.enemies.map((e) => e.pos)).toEqual(b.enemies.map((e) => e.pos));
    expect(a.stats).toEqual(b.stats);
  });

  it("plays a real horde run headlessly", () => {
    const state = startGame();
    drive(state, createBot("survivor"), 1875); // 30 seconds
    // No survival requirement (the owner playtests winnability by hand) —
    // the bot just has to genuinely play: move, attack, kill. The default
    // sword is melee, so measure damage dealt rather than bolts fired.
    expect(state.stats.damageDealt).toBeGreaterThan(0);
    expect(state.stats.kills).toBeGreaterThan(0);
  });
});

describe("bot hay-ball awareness", () => {
  /** A hay-ball level, staged clean with just the hero. */
  function stageHayLevel(): GameState {
    const state = startGame(1, "test_hayball_level");
    clearStage(state);
    state.hayBalls = [];
    return state;
  }

  const bale = (pos: { x: number; y: number }) => ({
    id: 9300,
    pos,
    speed: 90,
    radius: 8,
    spin: 0,
    struck: false,
  });

  it("sidesteps out of the lane of a bale bearing down on it", () => {
    const state = stageHayLevel();
    const p = state.player.pos;
    // A bale just ahead (up-street) and a touch below the hero's lane.
    state.hayBalls.push(bale({ x: p.x + 40, y: p.y + 20 }));
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("HAY");
    // Steps perpendicular AWAY from the bale (up, since it is below him), not
    // forward into the roll — the target holds his x and clears his lane.
    expect(input.target.y).toBeLessThan(p.y);
    expect(Math.abs(input.target.x - p.x)).toBeLessThan(2);
  });

  it("ignores a bale rolling down a different lane", () => {
    const state = stageHayLevel();
    const p = state.player.pos;
    state.hayBalls.push(bale({ x: p.x + 40, y: p.y + 300 }));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("HAY");
  });

  it("ignores a bale that has already rolled past it", () => {
    const state = stageHayLevel();
    const p = state.player.pos;
    state.hayBalls.push(bale({ x: p.x - 100, y: p.y }));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("HAY");
  });
});

describe("bot sand-storm avoidance", () => {
  /** A hand-built storm placed by the test rather than the spawner. */
  function pushStorm(
    state: GameState,
    overrides: Partial<{
      pos: { x: number; y: number };
      dir: { x: number; y: number };
      speed: number;
      radius: number;
      struck: boolean;
    }>,
  ): void {
    state.sandstorms.push({
      id: state.nextId++,
      pos: overrides.pos ?? { ...state.player.pos },
      dir: overrides.dir ?? { x: 1, y: 0 },
      speed: overrides.speed ?? 60,
      radius: overrides.radius ?? 34,
      spin: 0,
      struck: overrides.struck ?? false,
      fadeMs: overrides.struck ? 1400 : null,
    });
  }

  /** A far, harmless mob so `botAct` runs its full combat flow (past the
   * clear-field shortcut) — the realistic "mid-fight, a storm rolls in" case. */
  function distantFoe(state: GameState): void {
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 900, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    ];
  }

  it("sidesteps an incoming storm perpendicular off its drift line", () => {
    const state = startGame();
    clearStage(state);
    distantFoe(state);
    const at = { ...state.player.pos };
    // A storm 100px behind him, drifting straight at him along +x: he sits dead
    // on its centreline and it's closing — he must step off the line (in ±y).
    pushStorm(state, { pos: { x: at.x - 100, y: at.y }, dir: { x: 1, y: 0 } });
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("STORM");
    expect(input.steering).toBe(true);
    // The escape is lateral: mostly a ±y move, not straight down the drift.
    expect(Math.abs(input.target.y - at.y)).toBeGreaterThan(
      Math.abs(input.target.x - at.x),
    );
    expect(input.jump).toBe(false);
  });

  it("dodges a storm even on a clear field, before it can idle him into one", () => {
    const state = startGame();
    clearStage(state);
    state.enemies = []; // nothing to fight — the loop would otherwise idle
    const at = { ...state.player.pos };
    pushStorm(state, { pos: { x: at.x - 100, y: at.y }, dir: { x: 1, y: 0 } });
    const bot = createBot("survivor");
    expect(botAct(bot, state).steering).toBe(true);
    expect(bot.lastThought).toBe("STORM");
  });

  it("ignores a storm that has already struck (it can't hit again)", () => {
    const state = startGame();
    clearStage(state);
    distantFoe(state);
    pushStorm(state, {
      pos: { x: state.player.pos.x - 40, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
      struck: true,
    });
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("STORM");
  });

  it("ignores a storm whose swept lane misses him", () => {
    const state = startGame();
    clearStage(state);
    distantFoe(state);
    // Same approach, but offset far to the side — well outside the corridor.
    pushStorm(state, {
      pos: { x: state.player.pos.x - 100, y: state.player.pos.y + 300 },
      dir: { x: 1, y: 0 },
    });
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("STORM");
  });

  it("ignores a storm already drifting away from him", () => {
    const state = startGame();
    clearStage(state);
    distantFoe(state);
    // Storm ahead of him, drifting further away (+x) — it's leaving, not coming.
    pushStorm(state, {
      pos: { x: state.player.pos.x + 120, y: state.player.pos.y },
      dir: { x: 1, y: 0 },
    });
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("STORM");
  });
});

describe("bot stampede awareness", () => {
  /** A stampede level, staged clean with just the hero. */
  function stageStampedeLevel(): GameState {
    const state = startGame(1, "test_stampede_level");
    clearStage(state);
    state.stampedes = [];
    return state;
  }

  const herd = (pos: { x: number; y: number }) => ({
    id: 9400,
    pos,
    speed: 260,
    runners: [],
    struck: false,
  });

  /** A far, harmless mob so botAct runs its full combat flow (past the
   * clear-field shortcut) — the realistic "mid-fight, a herd charges in" case. */
  function distantFoe(state: GameState): void {
    state.enemies = [
      makeEnemy({
        pos: { x: state.player.pos.x + 900, y: state.player.pos.y },
        hp: 1_000_000,
        maxHp: 1_000_000,
      }),
    ];
  }

  it("HOPS a herd bearing down its lane", () => {
    const state = stageStampedeLevel();
    distantFoe(state);
    const p = state.player.pos;
    state.stampedes.push(herd({ x: p.x + 40, y: p.y }));
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("HERD");
    expect(input.jump).toBe(true);
  });

  it("hops a herd even on a clear field, before it can idle him into one", () => {
    const state = stageStampedeLevel();
    state.enemies = []; // nothing to fight — the loop would otherwise idle
    const p = state.player.pos;
    state.stampedes.push(herd({ x: p.x + 40, y: p.y }));
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("HERD");
    expect(input.jump).toBe(true);
  });

  it("ignores a herd charging down a different lane", () => {
    const state = stageStampedeLevel();
    distantFoe(state);
    const p = state.player.pos;
    state.stampedes.push(herd({ x: p.x + 40, y: p.y + 300 }));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("HERD");
  });

  it("ignores a herd that has already charged past it", () => {
    const state = stageStampedeLevel();
    distantFoe(state);
    const p = state.player.pos;
    state.stampedes.push(herd({ x: p.x - 200, y: p.y }));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("HERD");
  });

  it("does not re-hop while already airborne over a herd", () => {
    const state = stageStampedeLevel();
    distantFoe(state);
    const p = state.player.pos;
    state.player.z = JUMP.dodgeHeight + 10;
    state.stampedes.push(herd({ x: p.x + 40, y: p.y }));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("HERD");
  });
});

describe("bot meteor awareness", () => {
  /** An asteroid level, staged clean with just the hero. */
  function stageAsteroidLevel(): GameState {
    const state = startGame(1, "test_asteroid_level");
    clearStage(state);
    state.asteroids = [];
    state.asteroidTimerMs = 999_999;
    return state;
  }

  const rock = (target: { x: number; y: number }, timeToImpact: number) => ({
    id: 9400,
    target,
    entry: { x: target.x - 120, y: target.y - 120 },
    fallMs: 1500,
    ageMs: 1500 - timeToImpact,
    blastRadius: 55,
    rockRadius: 9,
    spin: 0,
  });

  it("steps off an impact mark about to land on it", () => {
    const state = stageAsteroidLevel();
    const p = { ...state.player.pos };
    // A rock landing right on the hero in 600ms — inside the lead window.
    state.asteroids.push(rock({ x: p.x + 8, y: p.y }, 600));
    const bot = createBot("survivor");
    const input = botAct(bot, state);
    expect(bot.lastThought).toBe("METEOR");
    // Steers clear of the blast circle — the target is outside the reach.
    const d = Math.hypot(input.target.x - (p.x + 8), input.target.y - p.y);
    expect(d).toBeGreaterThan(55);
  });

  it("ignores a strike landing well away from it", () => {
    const state = stageAsteroidLevel();
    const p = state.player.pos;
    state.asteroids.push(rock({ x: p.x + 300, y: p.y }, 600));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("METEOR");
  });

  it("does not flinch at a rock still high in the sky", () => {
    const state = stageAsteroidLevel();
    const p = state.player.pos;
    // Aimed at him, but a full 1.4s from impact — too early to bother yet.
    state.asteroids.push(rock({ x: p.x, y: p.y }, 1400));
    const bot = createBot("survivor");
    botAct(bot, state);
    expect(bot.lastThought).not.toBe("METEOR");
  });
});
