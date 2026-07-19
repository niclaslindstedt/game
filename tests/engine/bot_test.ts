// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The autopilot (src/game/bot.ts): bot strategies produce ordinary GameInput
// from the live state, so a bot can play the game headlessly — closing on
// monsters, kiting at weapon range, scooping pickups, pushing for the boss —
// while keeping the run exactly as deterministic as a human's.

import { describe, expect, it } from "vitest";

import {
  allocateStat,
  botAct,
  botAllocate,
  createBot,
  enemyDef,
  metaLane,
  step,
  weaponDef,
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
    drive(state, bot, 400);
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
