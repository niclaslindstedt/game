// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The EFFECTS GALLERY's catalog: every visual effect the game ships, one exhibit
// each. An entry says how to STAGE the effect (a `ScenarioSpec` — the level, the
// hero's build, the ring of mobs it needs) and how to FIRE it (an engine event
// pushed into the live run, or a real engine detonation).
//
// The firing side deliberately goes through the ENGINE EVENT STREAM rather than
// pushing `Effect` objects: an exhibit emits the same `GameEvent` a real fight
// would, and the run's own consumers (`applyEventFx`, the full-screen CSS
// overlays, the sfx bus) turn it into the look and the sound. So an exhibit
// shows exactly what ships — re-tune an effect and the gallery follows it with
// no edit here, the way the ARSENAL reads items through the in-game ItemCard.
//
// Hand-authored here: the IMPACT, POWERS and WORLD shelves. The MELEE, SHOTS and
// TALENTS shelves are GENERATED from the FX and talent catalogs
// (`weapon-exhibits.ts`, `talent-exhibits.ts`) so they cannot fall behind them.

import { debugDetonateNuke, debugLevelUpFx } from "@game/core";

import {
  heroPos,
  hitEvent,
  horde,
  killEvent,
  strike,
  type Exhibit,
} from "./exhibit-kit.ts";
import { talentExhibits } from "./talent-exhibits.ts";
import { weaponExhibits } from "./weapon-exhibits.ts";

const FIELD_EXHIBITS: Exhibit[] = [
  // ── IMPACT: what a blow looks like where it lands ──────────────────────────
  {
    id: "hit-splash",
    icon: "spell_rending_strike",
    label: "HIT SPLASH",
    blurb: "GORE SPRAY AND THE DAMAGE NUMBER ON A LANDED BLOW",
    group: "IMPACT",
    keywords: ["blood", "gore", "damage", "number", "hit"],
    stage: { spawns: horde(5, 30, 70) },
    showMs: 900,
    fire: (ctx) => strike(ctx, 3),
  },
  {
    id: "crit",
    icon: "spell_crushing_blow",
    label: "CRITICAL HIT",
    blurb: "THE FAT GOLD FIGURE THAT JOLTS - SIZED BY HOW HARD IT ROLLED",
    group: "IMPACT",
    keywords: ["crit", "damage", "number", "gold"],
    stage: { spawns: horde(3, 30, 60) },
    showMs: 1000,
    fire: (ctx) => {
      // A glancing crit beside a top-of-band slam, so the size ramp reads.
      const [near, far] = ctx.mobs;
      if (near) ctx.emit(hitEvent(near, { crit: true, critPower: 1 }));
      if (far) ctx.emit(hitEvent(far, { crit: true, critPower: 0.1 }));
    },
  },
  {
    id: "corpse",
    icon: "icon_skull",
    label: "CORPSE KEEL-OVER",
    blurb: "A SLAIN MOB TOPPLES, LIES STILL, THEN BLINKS OUT",
    group: "IMPACT",
    keywords: ["death", "body", "kill", "xp float"],
    stage: { spawns: horde(8, 34, 90) },
    showMs: 2200,
    fire: (ctx) => {
      const mob = ctx.kill();
      if (mob) ctx.emit(killEvent(mob));
    },
  },
  {
    id: "overkill",
    icon: "spell_war_stomp",
    label: "OVERKILL LAUNCH",
    blurb: "AN OVERPOWERED KILL PUNTS THE BODY FLYING, TUMBLING END OVER END",
    group: "IMPACT",
    keywords: ["knockback", "launch", "fling", "kill", "tumble"],
    stage: { spawns: horde(10, 30, 70) },
    showMs: 3400,
    fire: (ctx) => {
      const mob = ctx.kill();
      if (mob) ctx.emit(killEvent(mob, { overkillBars: 5 }));
    },
  },
  {
    id: "incinerate",
    icon: "spell_inferno",
    label: "INCINERATION",
    blurb: "THE BODY BURNS UP AND LEAVES A SMOKING CHARRED SKELETON",
    group: "IMPACT",
    keywords: ["fire", "burn", "skeleton", "smoke", "nuke kill"],
    stage: { spawns: horde(8, 34, 90) },
    showMs: 1800,
    fire: (ctx) => {
      const mob = ctx.kill();
      if (mob) ctx.emit(killEvent(mob, { incinerated: true }));
    },
  },
  {
    id: "pack-xp",
    icon: "spell_death_blossom",
    label: "PACK KILL XP",
    blurb: "A KNOT OF FOES DROPPED AT ONCE FUSES INTO ONE OVERSIZED XP POP",
    group: "IMPACT",
    keywords: ["xp", "float", "merge", "pack", "text"],
    stage: { spawns: horde(14, 36, 62) },
    showMs: 2600,
    fire: (ctx) => {
      // The whole knot falls to one blow — that is what merges the drips.
      for (let i = 0; i < 12; i++) {
        const mob = ctx.kill();
        if (!mob) break;
        ctx.emit(killEvent(mob, { xp: 240 }));
      }
    },
  },
  {
    id: "combat-tags",
    icon: "spell_smoke_screen",
    label: "COMBAT TAGS",
    blurb: "THE FLOATING WORDS - DODGE, MISS, SHIELDED, BAG FULL",
    group: "IMPACT",
    keywords: ["text", "dodge", "miss", "shielded", "float"],
    stage: { spawns: horde(4, 34, 80) },
    showMs: 1200,
    fire: (ctx) => {
      const [a, b, c] = ctx.mobs;
      if (a)
        ctx.emit({ type: "enemyDodge", pos: { ...a.pos }, defId: a.defId });
      if (b) ctx.emit({ type: "enemyMiss", pos: { ...b.pos }, defId: b.defId });
      if (c) {
        ctx.emit({ type: "enemyShielded", pos: { ...c.pos }, defId: c.defId });
      }
      ctx.emit({ type: "playerDodge", pos: heroPos(ctx.state) });
      ctx.emit({
        type: "pickupBlocked",
        reason: "bagFull",
        pos: heroPos(ctx.state),
      });
    },
  },
  {
    id: "parry",
    icon: "icon_talent_parry",
    label: "PARRY",
    blurb: "THE STEEL RING THAT TURNS A BLOW FULLY ASIDE",
    group: "IMPACT",
    keywords: ["talent", "melee", "block", "deflect"],
    stage: { spawns: horde(4, 26, 50) },
    showMs: 900,
    fire: (ctx) => ctx.emit({ type: "parry", pos: heroPos(ctx.state) }),
  },

  // ── POWERS: the big spectacles and the spell rings ─────────────────────────
  {
    id: "nuke",
    icon: "icon_nuke",
    label: "SCREEN NUKE",
    blurb: "THE PANIC BUTTON - BLINDING FLASH, FIRE, SMOKE, A BURNED HORDE",
    group: "POWERS",
    keywords: ["bomb", "explosion", "flash", "powerup", "incinerate"],
    stage: { spawns: horde(26, 30, 150) },
    showMs: 2600,
    // The REAL detonation (the engine's own debug hook): its `nuke` event, the
    // caught mobs' incinerated kills, the camera kick and the full-screen CSS
    // burst all follow from the engine exactly as they do in play.
    fire: (ctx) => debugDetonateNuke(ctx.state),
  },
  {
    id: "levelup",
    icon: "icon_star",
    label: "LEVEL UP",
    blurb: "THE DING AT THE CAP - LIGHT EXPLOSION, GOD-RAYS, THE HORDE HURLED",
    group: "POWERS",
    keywords: ["ding", "level", "light", "flash", "burn", "pillar"],
    // The spectacle is sized to the level reached (levelup-intensity.ts), so
    // stage the hero at the cap for the full detonation.
    stage: { level: 99, spawns: horde(20, 26, 110) },
    showMs: 2400,
    fire: (ctx) => debugLevelUpFx(ctx.state),
  },
  {
    id: "levelup-early",
    icon: "spell_ember_burst",
    label: "LEVEL UP - EARLY DING",
    blurb: "THE SAME SHOW AT A LOW LEVEL - A MODEST GLOW, NOT A DETONATION",
    group: "POWERS",
    keywords: ["ding", "level", "intensity", "light"],
    stage: { level: 3, spawns: horde(12, 26, 110) },
    showMs: 2000,
    fire: (ctx) => debugLevelUpFx(ctx.state),
  },
  {
    id: "lightning",
    icon: "spell_chain_lightning",
    label: "LIGHTNING STRIKE",
    blurb: "A FRACTAL BOLT CRACKS DOWN, LIGHTS THE FLOOR AND SPARKS FIRE",
    group: "POWERS",
    keywords: ["bolt", "storm", "thunder", "spark", "flash"],
    stage: { spawns: horde(8, 40, 110) },
    showMs: 900,
    fire: (ctx) => {
      const mob = ctx.mobs[0];
      ctx.emit({
        type: "lightning",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
      });
    },
  },
  {
    id: "nova",
    icon: "spell_supernova",
    label: "ARCANE NOVA",
    blurb: "THE VIOLET RING BURSTING OUT TO ITS DAMAGE RADIUS",
    group: "POWERS",
    keywords: ["proc", "burst", "ring", "arcane", "crit"],
    stage: { spawns: horde(10, 40, 110) },
    showMs: 700,
    fire: (ctx) =>
      ctx.emit({ type: "nova", pos: heroPos(ctx.state), radius: 64 }),
  },
  {
    id: "frost-nova",
    icon: "spell_frost_nova",
    label: "FROST NOVA",
    blurb: "THE ICY PULSE THAT FREEZES THE SWARM WHEN THE HERO IS STRUCK",
    group: "POWERS",
    keywords: ["frost", "ice", "chill", "ring", "talent", "companion"],
    stage: { spawns: horde(10, 40, 110) },
    showMs: 700,
    fire: (ctx) =>
      ctx.emit({
        type: "nova",
        pos: heroPos(ctx.state),
        radius: 72,
        frost: true,
      }),
  },
  {
    id: "singularity",
    icon: "spell_void_lance",
    label: "ARCANE SINGULARITY",
    blurb: "RINGS RUSH INWARD TO A DARK CORE - A NOVA RUN BACKWARDS",
    group: "POWERS",
    keywords: ["vortex", "collapse", "void", "talent", "pull"],
    stage: { spawns: horde(12, 40, 110) },
    showMs: 800,
    fire: (ctx) =>
      ctx.emit({ type: "singularity", pos: heroPos(ctx.state), radius: 76 }),
  },
  {
    id: "seismic",
    icon: "spell_earthshatter",
    label: "SEISMIC LANDING",
    blurb: "A GROUND SHOCKWAVE RINGS OUT WHERE THE JUMP TOUCHED DOWN",
    group: "POWERS",
    keywords: ["slam", "landing", "shockwave", "talent", "melee"],
    stage: { spawns: horde(10, 40, 110) },
    showMs: 800,
    fire: (ctx) =>
      ctx.emit({
        type: "seismicLanding",
        pos: { x: ctx.state.player.pos.x, y: ctx.state.player.pos.y },
        radius: 84,
      }),
  },
  // The three timed powerups stage themselves: `runAbilities` starts them
  // ALREADY RUNNING, so the orbs are circling, the field is slowing and the
  // magnet is pulling the moment the exhibit opens. PLAY re-stages, which is
  // what restarts a power whose duration has since lapsed.
  {
    id: "fire-orbs",
    icon: "icon_fire_orbs",
    label: "FIRE ORBS",
    blurb:
      "THE POWERUP'S FIREBALLS CIRCLING THE HERO, MANGLING WHAT THEY TOUCH",
    group: "POWERS",
    keywords: ["powerup", "orbit", "fireball", "ability"],
    stage: { runAbilities: ["fire_orbs"], spawns: horde(12, 40, 110) },
    showMs: 1200,
  },
  {
    id: "stasis-field",
    icon: "icon_stasis",
    label: "STASIS FIELD",
    blurb: "THE PULSING SLOW-FIELD RING - EVERYTHING INSIDE IT CRAWLS",
    group: "POWERS",
    keywords: ["powerup", "slow", "field", "ring", "ability"],
    stage: { runAbilities: ["stasis_field"], spawns: horde(12, 40, 120) },
    showMs: 1200,
  },
  {
    id: "item-magnet",
    icon: "icon_magnet",
    label: "ITEM MAGNET",
    blurb: "THE WARM REACH RING THAT DRAGS GROUND LOOT TO THE HERO",
    group: "POWERS",
    keywords: ["powerup", "magnet", "loot", "pull", "ability"],
    stage: {
      runAbilities: ["item_magnet"],
      // Loose pickups for it to drag in — the pull is the effect.
      drops: [
        { item: "medkit", count: 4, minDistance: 46, maxDistance: 96 },
        { item: "xp", count: 4, minDistance: 46, maxDistance: 96 },
      ],
    },
    showMs: 1600,
  },

  {
    id: "storm-cell",
    icon: "icon_storm",
    label: "STORM CELL",
    blurb: "THE POWERUP'S OWN BOLTS, FALLING ON THE NEAREST FOE ON A TIMER",
    group: "POWERS",
    keywords: ["powerup", "storm", "lightning", "bolt", "ability"],
    stage: { runAbilities: ["storm_cell"], spawns: horde(10, 40, 130) },
    showMs: 1600,
  },

  // ── WORLD: the field's own effects ─────────────────────────────────────────
  {
    id: "crate-smash",
    icon: "crate",
    label: "CRATE SMASH",
    blurb: "THE BOX KEELS OVER, BURSTS INTO SPLINTERS AND FADES",
    group: "WORLD",
    keywords: ["crate", "break", "splinter", "loot", "obstacle"],
    stage: {},
    showMs: 1100,
    fire: (ctx) => {
      const pos = {
        x: ctx.state.player.pos.x + 40,
        y: ctx.state.player.pos.y,
      };
      // The chip that flies off a blow the box survives, then the break.
      ctx.emit({ type: "crateHit", pos: { ...pos } });
      ctx.emit({ type: "crateBroken", pos, sprite: "crate" });
    },
  },
  {
    id: "meteor",
    icon: "spell_meteor",
    label: "METEOR IMPACT",
    blurb: "A FLASH CORE, A SHOCKWAVE RING AND A SPINNING DUST CLOUD",
    group: "WORLD",
    keywords: ["asteroid", "impact", "dust", "hazard", "moon", "crater"],
    // The moon is where meteors actually rain, so the blast sits on its
    // own ground (its own falling rocks join in overhead).
    levelId: "moon",
    stage: { spawns: [{ enemy: "ghost", count: 8, maxDistance: 120 }] },
    showMs: 1100,
    fire: (ctx) =>
      ctx.emit({
        type: "asteroidImpact",
        pos: { x: ctx.state.player.pos.x + 30, y: ctx.state.player.pos.y + 10 },
        radius: 62,
      }),
  },
  {
    id: "trample-dust",
    icon: "spell_ground_slam",
    label: "TRAMPLE DUST",
    blurb: "THE SCUFF OF FLOOR DUST A STAMPEDE KICKS UP OFF A BOWLED MOB",
    group: "WORLD",
    keywords: ["stampede", "dust", "hazard", "knockdown", "herd"],
    stage: { spawns: horde(6, 34, 90) },
    showMs: 800,
    fire: (ctx) => {
      for (const mob of ctx.mobs.slice(0, 3)) {
        ctx.emit({
          type: "stampedeTrample",
          pos: { ...mob.pos },
          defId: mob.defId,
        });
      }
    },
  },
  {
    id: "sandstorm",
    icon: "spell_smoke_screen",
    label: "SAND STORM",
    blurb:
      "A MARTIAN GUST ROLLS THROUGH, BLINDS THE FIELD AND FLATTENS THE HERO",
    group: "WORLD",
    keywords: ["hazard", "storm", "dust", "mars", "knockout"],
    // Its own weather, on its own level: the exhibit brings the next gust
    // forward instead of waiting out the level's 9-16s timer. The show runs
    // long because a storm SPAWNS OFF THE RIM and drifts in — it needs those
    // seconds to actually cross the frame.
    levelId: "mars",
    stage: { freeze: false, spawns: horde(6, 40, 110, "fembot") },
    showMs: 6000,
    fire: (ctx) => {
      ctx.state.sandstormTimerMs = 0;
    },
  },
  {
    id: "hay-balls",
    icon: "spell_ricochet",
    label: "TUMBLEWEED BALES",
    blurb: "EASTWORLD'S BALES ROLL THE LANE AND SHOVE WHAT THEY CATCH",
    group: "WORLD",
    keywords: ["hazard", "hay", "bale", "eastworld", "roll", "tumbleweed"],
    // A bale is minted a screen to the RIGHT and rolls left, so the show is
    // given the seconds it takes to roll through.
    levelId: "eastworld",
    stage: { freeze: false, spawns: horde(6, 40, 110, "cowbot") },
    showMs: 6000,
    fire: (ctx) => {
      ctx.state.hayBallTimerMs = 0;
    },
  },
  {
    id: "meteor-rain",
    icon: "spell_cataclysm",
    label: "METEOR RAIN",
    blurb: "THE MOON'S SKY FALLING - ROCKS INBOUND, SHADOWS GROWING",
    group: "WORLD",
    keywords: ["hazard", "asteroid", "meteor", "moon", "sky", "fall"],
    levelId: "moon",
    stage: { freeze: false, spawns: horde(6, 40, 120, "ghost") },
    showMs: 4000,
    fire: (ctx) => {
      ctx.state.asteroidTimerMs = 0;
    },
  },
  {
    id: "the-fall",
    icon: "spell_last_stand",
    label: "THE FALL",
    blurb:
      "THE DEATH TABLEAU - THE BODY DROPS, CLOUDS ROLL IN, THE VIEW PUSHES",
    group: "WORLD",
    keywords: ["death", "dying", "defeat", "clouds", "zoom", "blood"],
    stage: { spawns: horde(10, 30, 90) },
    // The scene runs for seconds; the runner rebuilds the diorama afterwards
    // (a run that has ended can't be re-staged in place).
    showMs: 4200,
    fire: (ctx) => {
      // What a fatal blow does: the engine takes it from here (enterDeathScene
      // on the next step) and plays the whole tableau.
      ctx.state.player.hp = 0;
    },
  },
  {
    id: "hurt-flash",
    icon: "icon_talent_ironhide",
    label: "HURT FLASH",
    blurb: "THE RED WASH OVER THE WHOLE FRAME WHEN THE HERO IS BITTEN",
    group: "WORLD",
    keywords: ["damage", "hurt", "flash", "red", "screen"],
    stage: { spawns: horde(6, 34, 90) },
    showMs: 800,
    fire: (ctx) => {
      // The flash is a state timer the renderer reads, not an effect — arm it
      // the way a real bite does and let render.ts wash the frame. The event
      // carries the grunt on the sound bus.
      ctx.state.player.hurtFlashMs = 250;
      ctx.emit({ type: "playerHurt", crit: false, cause: "gallery" });
    },
  },
];

/**
 * The whole effects catalog, shelf by shelf: what a blow looks like where it
 * lands, every signature blade, every signature shot, the powers, every talent,
 * and the field's own effects.
 */
export function effectsCatalog(): Exhibit[] {
  const weapons = weaponExhibits();
  return [
    ...FIELD_EXHIBITS.filter((e) => e.group === "IMPACT"),
    ...weapons.filter((e) => e.group === "MELEE"),
    ...weapons.filter((e) => e.group === "SHOTS"),
    ...FIELD_EXHIBITS.filter((e) => e.group === "POWERS"),
    ...talentExhibits(),
    ...FIELD_EXHIBITS.filter((e) => e.group === "WORLD"),
  ];
}

/** The searchable text of an exhibit, lowercased. */
function haystack(exhibit: Exhibit): string {
  return [
    exhibit.label,
    exhibit.blurb,
    exhibit.group,
    exhibit.id,
    ...(exhibit.keywords ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

/**
 * The exhibits of `catalog` matching a search box's text: every
 * whitespace-separated term must appear somewhere in the entry's label, blurb,
 * group, id or keywords (an AND over substrings — "fire orb" finds FIRE ORBS,
 * "unique slash" the signature blades, "frost" everything icy). Empty text
 * matches the whole catalog, in shelf order.
 */
export function searchExhibits(
  catalog: readonly Exhibit[],
  query: string,
): Exhibit[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [...catalog];
  return catalog.filter((exhibit) => {
    const text = haystack(exhibit);
    return terms.every((term) => text.includes(term));
  });
}
