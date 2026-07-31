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

import {
  debugCallHorde,
  debugDetonateNuke,
  debugLevelUpFx,
  dropItem,
  rollEquipment,
  type Tier,
} from "@game/core";

import {
  eliteLook,
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
    id: "blood-nick",
    icon: "icon_talent_piercing_shot",
    label: "A NICK",
    blurb: "A GLANCING BLOW - A FEW DROPS AND A FRECKLE ON THE FLOOR",
    group: "IMPACT",
    keywords: ["blood", "gore", "spray", "light", "scratch"],
    stage: { spawns: horde(5, 30, 70) },
    showMs: 1100,
    fire: (ctx) => strike(ctx, 3, { bars: 0.08 }),
  },
  {
    id: "blood-maim",
    icon: "spell_mortal_strike",
    label: "OPENED UP",
    blurb: "A BLOW THAT TAKES MOST OF THE BAR - THE SPRAY GROWS WITH IT",
    group: "IMPACT",
    keywords: ["blood", "gore", "spray", "heavy", "wound", "mist"],
    stage: { spawns: horde(5, 30, 70) },
    showMs: 1100,
    fire: (ctx) => strike(ctx, 3, { bars: 0.9 }),
  },
  {
    id: "blood-emptied",
    icon: "spell_annihilate",
    label: "EMPTIED",
    blurb: "A BLOW MANY TIMES ITS HEALTH BURSTS THE MOB - EVERY DROP AT ONCE",
    group: "IMPACT",
    keywords: ["blood", "gore", "overkill", "burst", "vast", "one-shot"],
    stage: { spawns: horde(9, 30, 78) },
    showMs: 1800,
    fire: (ctx) => {
      // A hundred times the mobs' whole health — what a level 99 hero does to a
      // level 1 crowd. The VOLUME is one body's worth per mob, the same as any
      // one-shot; everything else that reads here is FORCE, which has no
      // ceiling: the wound becomes a gore detonation, the pieces are chunks
      // rather than beads, and the haze goes right across the field.
      for (const mob of ctx.mobs) {
        ctx.emit(killEvent(mob, { bars: 100 }));
      }
    },
  },
  {
    id: "blood-floor",
    icon: "icon_talent_berserker_rage",
    label: "A BLOODIED FLOOR",
    blurb: "THE GROUND REMEMBERS - IT REDDENS WHERE THE FIGHTING WAS",
    group: "IMPACT",
    keywords: ["blood", "gore", "floor", "ground", "pool", "stain", "wet"],
    stage: { spawns: horde(14, 24, 64) },
    showMs: 2600,
    fire: (ctx) => {
      // A whole pack cut down on one spot: what the exhibit is FOR is the
      // aftermath, so it kills everything staged and lets the floor fill in.
      for (const mob of ctx.mobs) ctx.emit(killEvent(mob, { bars: 1.4 }));
    },
  },
  {
    id: "blood-soaked",
    icon: "spell_berserk",
    label: "DRENCHED",
    blurb: "HE WEARS WHAT HE DID - IT LANDS ON HIM AND IT STAYS THERE",
    group: "IMPACT",
    keywords: [
      "blood",
      "gore",
      "hero",
      "player",
      "soak",
      "coat",
      "drenched",
      "armor",
      "face",
      "horror",
    ],
    // Point-blank work, because that is the only kind that reaches his face:
    // the soak is mixed by DISTANCE (hero-soak.ts), so a crowd cut down at
    // arm's length paints his visor while the same pack at range would only
    // ever mark his boots. Nine rounds of it over the show, which is the real
    // path a bad map puts him through — nothing here sets the soak directly.
    // …and he is holding a SHIELD, because the second arm is a zone of the soak
    // like any other (`SOAK_ZONES`) and it is the one held BETWEEN him and the
    // work — so an exhibit about what comes back on him that showed a bare arm
    // would be showing the feature with its loudest surface missing.
    stage: {
      spawns: horde(27, 14, 32),
      gear: { offhand: "tower_shield" },
    },
    // Long, and deliberately: the money shot is the LAST beat, once the crowd
    // and its damage numbers are gone and he is left standing alone in the
    // middle of it wearing the lot.
    showMs: 7000,
    fire: (ctx) => {
      const rounds = 9;
      for (let round = 0; round < rounds; round++) {
        ctx.after(round * 380, () => {
          // Taken OFF the field as well as killed, so the bodies stop piling up
          // in front of the one thing the exhibit is about.
          for (let i = 0; i < 3; i++) {
            const mob = ctx.kill();
            if (mob) ctx.emit(killEvent(mob, { bars: 2.2, xp: 0 }));
          }
        });
      }
    },
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
    blurb: "A FINISHING BLOW TOPPLES THE MOB IN PLACE, THEN IT BLINKS OUT",
    group: "IMPACT",
    keywords: ["death", "body", "kill", "xp float"],
    stage: { spawns: horde(8, 34, 90) },
    showMs: 2200,
    fire: (ctx) => {
      const mob = ctx.kill();
      // A chip finish on an already-wounded mob: too small a blow to throw the
      // body, so this stages the plain topple (see `corpseLaunch`).
      if (mob) ctx.emit(killEvent(mob, { bars: 0.3 }));
    },
  },
  {
    id: "overkill",
    icon: "spell_war_stomp",
    label: "KILL LAUNCH",
    blurb: "THE HARDER THE KILLING BLOW, THE FURTHER THE BODY FLIES",
    group: "IMPACT",
    keywords: ["knockback", "launch", "fling", "kill", "tumble"],
    stage: { spawns: horde(10, 30, 70) },
    showMs: 3400,
    fire: (ctx) => {
      const mob = ctx.kill();
      if (mob) ctx.emit(killEvent(mob, { bars: 5 }));
    },
  },
  {
    id: "cleave",
    icon: "icon_machete",
    label: "CLEAVED IN TWO",
    blurb: "AN EDGED BLOW GOES THROUGH - NEVER TWICE THE SAME WAY",
    group: "IMPACT",
    keywords: ["gore", "cut", "halves", "blade", "dismember", "behead", "nsfw"],
    stage: { spawns: horde(10, 34, 90) },
    showMs: 2600,
    fire: (ctx) => {
      // FOUR AT ONCE, and that is the exhibit: one cleave shows one cut, which
      // says nothing about a feature whose whole point is that the cut is
      // ROLLED. Four bodies standing in different places take four different
      // cuts and spill whatever those cuts went through, so the variety is the
      // thing on screen rather than a claim in the blurb.
      for (let i = 0; i < 4; i++) {
        const mob = ctx.kill();
        // A blade taking six times the bar off a mob standing at full health:
        // five bars of OVERKILL, well past the threshold a cut is earned at
        // (see CLEAVE_BARS), so the dearer cuts are in the pool too.
        if (mob) ctx.emit(killEvent(mob, { bars: 6, edged: true }));
      }
    },
  },
  {
    id: "gib",
    icon: "gib_ribs",
    label: "BURST INTO PIECES",
    blurb: "A BLUNT BLOW BURSTS THE BODY - IT LANDS IN ITS OWN SPATTER",
    group: "IMPACT",
    keywords: ["gore", "gibs", "meat", "viscera", "dismember", "quake", "nsfw"],
    stage: { spawns: horde(8, 34, 90) },
    showMs: 3200,
    fire: (ctx) => {
      const mob = ctx.kill();
      // Far past what the body could hold — the top of the ladder, where a
      // person comes apart into their own inventory.
      if (mob) ctx.emit(killEvent(mob, { bars: 9 }));
    },
  },
  {
    id: "cleave-behead",
    icon: "gib_skull",
    label: "TAKEN AT THE NECK",
    blurb:
      "A SMALL PIECE OFF THE TOP IS THROWN CLEAR - THE SKULL COMES WITH IT",
    group: "IMPACT",
    keywords: ["gore", "cut", "behead", "head", "skull", "limb", "nsfw"],
    stage: { spawns: horde(10, 34, 90) },
    // A cut ACROSS the body, high enough up that the piece above it is a limb
    // rather than a half — which is what makes it be thrown clear instead of
    // merely parting (`CUT_LIMB_FRAC`). The offset is pinned and nothing else
    // is, so what falls out of the neck still varies take to take.
    cut: { angle: 0, offset: -0.38, toss: -1, pinned: null, depth: 0 },
    showMs: 2600,
    fire: (ctx) => {
      for (let i = 0; i < 3; i++) {
        const mob = ctx.kill();
        if (mob) ctx.emit(killEvent(mob, { bars: 6, edged: true }));
      }
    },
  },
  {
    id: "cleave-legs",
    icon: "gib_bone",
    label: "WALKED OUT FROM UNDER HIMSELF",
    blurb: "A SMALL PIECE OFF THE BOTTOM STAYS STANDING WHERE IT WAS",
    group: "IMPACT",
    keywords: ["gore", "cut", "legs", "knees", "standing", "limb", "nsfw"],
    stage: { spawns: horde(10, 34, 90) },
    // The mirror of the beheading, and the reason neither is authored: both fall
    // out of ONE rule about where the line landed (a small piece off the top has
    // nowhere to stand, a small piece off the bottom is already on the floor).
    cut: { angle: 0, offset: 0.38, toss: null, pinned: 1, depth: 0 },
    showMs: 2800,
    fire: (ctx) => {
      for (let i = 0; i < 3; i++) {
        const mob = ctx.kill();
        if (mob) ctx.emit(killEvent(mob, { bars: 6, edged: true }));
      }
    },
  },
  {
    id: "cleave-oblique",
    icon: "cleave_wound",
    label: "SLICED THROUGH THE DEPTH",
    blurb: "IN AT THE FRONT, OUT AT THE SIDE OF THE BACK - THE WET FACE SHOWS",
    group: "IMPACT",
    keywords: ["gore", "cut", "oblique", "slice", "depth", "3d", "nsfw"],
    stage: { spawns: horde(10, 34, 90) },
    // THE THIRD AXIS, pinned because it is a MINORITY by design — about a fifth
    // of cuts go in obliquely, so a diorama that rolled honestly would show the
    // effect this exhibit exists for roughly half the time. Only the depth is
    // pinned: the angle, where the line fell and what spilled all still roll,
    // which is what keeps it a picture of the system rather than of one frame.
    cut: { depth: 0.55 },
    showMs: 2800,
    fire: (ctx) => {
      for (let i = 0; i < 4; i++) {
        const mob = ctx.kill();
        if (mob) ctx.emit(killEvent(mob, { bars: 6, edged: true }));
      }
    },
  },
  {
    id: "cleave-slab",
    icon: "gore_inside",
    label: "A SLAB OFF THE FRONT",
    blurb: "THE BLADE WENT IN NEARLY FLAT - MOSTLY INSIDE, A RIND OF SKIN",
    group: "IMPACT",
    keywords: ["gore", "cut", "slab", "slice", "depth", "inside", "nsfw"],
    stage: { spawns: horde(8, 34, 90) },
    // The far end of the same knob (`OBLIQUE_MAX`), where the ratio of skin to
    // red says the blade went almost parallel to the screen. Worth its own case
    // because it is the one that breaks if the exit line is ever allowed all the
    // way through: at a full slab the far piece starts at the body's own edge
    // and there is nothing left of it to draw.
    cut: { depth: 0.8 },
    showMs: 2800,
    fire: (ctx) => {
      for (let i = 0; i < 3; i++) {
        const mob = ctx.kill();
        if (mob) ctx.emit(killEvent(mob, { bars: 6, edged: true }));
      }
    },
  },
  {
    id: "gore-ecto",
    icon: "gib_ecto_core",
    label: "A HAUNTING COMES APART",
    blurb: "GREEN GOO, A COLD LIGHT, AND A PUFF WHERE IT WAS STANDING",
    group: "IMPACT",
    keywords: ["gore", "ghost", "ecto", "goo", "green", "slime", "nsfw"],
    stage: { spawns: horde(8, 34, 90, "ghost") },
    showMs: 3200,
    fire: (ctx) => {
      // BOTH SHAPES SIDE BY SIDE, and that is the exhibit: the whole claim of
      // the family work is that a ghost CUTS and BURSTS as a ghost rather than
      // as a person in green, so the cut and the burst have to be on screen
      // together to be judged against each other.
      const cut = ctx.kill();
      if (cut) ctx.emit(killEvent(cut, { bars: 6, edged: true }));
      const burst = ctx.kill();
      if (burst) ctx.emit(killEvent(burst, { bars: 9 }));
    },
  },
  {
    id: "gore-sparks",
    icon: "gib_bot_optic",
    label: "A MACHINE COMES APART",
    blurb: "PLATE, WIRE AND A CELL - AND IT SMOKES WHERE IT STOOD",
    group: "IMPACT",
    keywords: ["gore", "robot", "sparks", "oil", "wire", "machine", "nsfw"],
    stage: { spawns: horde(8, 34, 90, "servo_bot") },
    showMs: 3200,
    fire: (ctx) => {
      const cut = ctx.kill();
      if (cut) ctx.emit(killEvent(cut, { bars: 6, edged: true }));
      const burst = ctx.kill();
      if (burst) ctx.emit(killEvent(burst, { bars: 9 }));
    },
  },
  {
    id: "gore-cosmic",
    icon: "gib_cosmic_core",
    label: "A RIFT-THING COMES APART",
    blurb: "SHARDS AND MOTES - IT GLIMMERS, AND THEN THE FLOOR IS CLEAN",
    group: "IMPACT",
    keywords: ["gore", "rift", "cosmic", "void", "star", "light", "nsfw"],
    stage: { spawns: horde(8, 34, 90, "voidling") },
    showMs: 3200,
    fire: (ctx) => {
      const cut = ctx.kill();
      if (cut) ctx.emit(killEvent(cut, { bars: 6, edged: true }));
      const burst = ctx.kill();
      if (burst) ctx.emit(killEvent(burst, { bars: 9 }));
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

  // ── The TWO POWERS EACH MAP INTRODUCES past SPACEZ HQ's classics (see
  // content/powerups.yaml). Every one of them stages itself the same way the
  // classics do — `runAbilities` starts it ALREADY RUNNING — so what the shelf
  // shows is the live power ticking, not a mock-up of it. Each is staged over
  // ITS OWN LEVEL's ground, so a moon rock lands on the moon and a black hole
  // opens on the rift road.
  {
    id: "ion-wake",
    icon: "icon_ion_wake",
    label: "ION WAKE",
    blurb: "BURNING ENGINE WASH LAID BEHIND A HERO WHO KEEPS MOVING",
    group: "POWERS",
    keywords: ["powerup", "trail", "fire", "wake", "thruster", "spacez"],
    stage: { runAbilities: ["ion_wake"], spawns: horde(12, 40, 120) },
    // The one power that is ABOUT movement: the hero laps the diorama so the
    // wake has somewhere to be laid (a standing hero would show one pool).
    walk: { radius: 46, periodMs: 3400 },
    showMs: 3400,
  },
  {
    id: "blast-shield",
    icon: "icon_blast_shield",
    label: "BLAST SHIELD",
    blurb: "THE PLATED SHELL, AND THE BLUE CRACK WHEN ITS POOL RUNS OUT",
    group: "POWERS",
    keywords: ["powerup", "barrier", "shield", "absorb", "shatter", "spacez"],
    stage: { runAbilities: ["blast_shield"], spawns: horde(8, 46, 120) },
    showMs: 1800,
    // The shell holds for the first beat of the show, then the pool is spent —
    // the exhibit is the whole arc, plates to shatter.
    fire: (ctx) =>
      ctx.emit({
        type: "barrierBroke",
        pos: heroPos(ctx.state),
        defId: "blast_shield",
      }),
  },
  {
    id: "moonfall",
    icon: "icon_moonfall",
    label: "MOONFALL",
    blurb: "ROCK COMING DOWN OUT OF THE BLACK - FLASH, DUST RING, SPLINTERS",
    group: "POWERS",
    keywords: ["powerup", "rain", "meteor", "rock", "crater", "moon"],
    levelId: "moon",
    stage: { runAbilities: ["moonfall"], spawns: horde(14, 40, 150) },
    showMs: 2600,
  },
  {
    id: "pale-shroud",
    icon: "icon_pale_shroud",
    label: "PALE SHROUD",
    blurb: "THE HERO GOES SPECTRAL - THE COLOUR DRAINS AND BLOWS PASS THROUGH",
    group: "POWERS",
    keywords: ["powerup", "phase", "ghost", "spectral", "shroud", "moon"],
    levelId: "moon",
    stage: { runAbilities: ["pale_shroud"], spawns: horde(12, 34, 110) },
    showMs: 2200,
    // A blow arriving on a hero who isn't there any more — the whole point.
    fire: (ctx) => ctx.emit({ type: "playerPhased", pos: heroPos(ctx.state) }),
  },
  {
    id: "dust-devil",
    icon: "icon_dust_devil",
    label: "DUST DEVIL",
    blurb: "A SPINNING GRIT COLUMN THAT HUNTS THE NEAREST BODY AND GRINDS IT",
    group: "POWERS",
    keywords: ["powerup", "well", "cyclone", "dust", "grit", "mars"],
    levelId: "mars",
    stage: { runAbilities: ["dust_devil"], spawns: horde(12, 50, 130) },
    showMs: 2600,
  },
  {
    id: "reactor-surge",
    icon: "icon_reactor_surge",
    label: "REACTOR SURGE",
    blurb: "THE HERO RUNNING HOT - HEAT RING, RISING SPARKS, EDGES ON FIRE",
    group: "POWERS",
    keywords: ["powerup", "surge", "buff", "heat", "overcharge", "mars"],
    levelId: "mars",
    stage: { runAbilities: ["reactor_surge"], spawns: horde(10, 44, 120) },
    showMs: 2000,
  },
  {
    id: "overpressure",
    icon: "icon_overpressure",
    label: "OVERPRESSURE",
    blurb: "FOUR TIMES BEHIND EVERY BLOW - THE HORDE STOPS DYING AND BURSTS",
    group: "POWERS",
    keywords: ["powerup", "surge", "buff", "gib", "gore", "burst", "quadruple"],
    // A CROWD, and a long show: the power's whole read is the SECOND-ORDER
    // effect — every blow now lands so far past what a body was holding that the
    // gore ladder answers it (see game-screen/overkill.ts). One mob would show a
    // buff icon; a room of them shows what the buff is FOR.
    stage: { runAbilities: ["overpressure"], spawns: horde(16, 40, 110) },
    showMs: 3200,
  },
  {
    id: "event-horizon",
    icon: "icon_event_horizon",
    label: "EVENT HORIZON",
    blurb: "A BLACK THROAT HAULING THE HORDE IN - THE FRAME BENDS AROUND IT",
    group: "POWERS",
    keywords: ["powerup", "well", "black hole", "void", "pull", "rift"],
    levelId: "the_rift",
    stage: { runAbilities: ["event_horizon"], spawns: horde(16, 60, 150) },
    showMs: 3000,
  },
  {
    id: "the-unmaking",
    icon: "icon_unmaking",
    label: "THE UNMAKING",
    blurb: "RINGS OF NOTHING WASHING OUT - THE EDGE TEARS AS IT PASSES",
    group: "POWERS",
    keywords: ["powerup", "pulse", "void", "wave", "shove", "rift"],
    levelId: "the_rift",
    stage: { runAbilities: ["the_unmaking"], spawns: horde(16, 50, 140) },
    showMs: 2600,
  },
  {
    id: "dead-mans-hand",
    icon: "icon_dead_mans_hand",
    label: "DEAD MAN'S HAND",
    blurb: "PHANTOM ROUNDS CRACKING OFF ON THEIR OWN AT THE NEAREST BODY",
    group: "POWERS",
    keywords: ["powerup", "volley", "gun", "phantom", "west", "eastworld"],
    levelId: "eastworld",
    stage: { runAbilities: ["dead_mans_hand"], spawns: horde(12, 60, 150) },
    showMs: 2400,
  },
  {
    id: "iron-stampede",
    icon: "icon_iron_stampede",
    label: "IRON STAMPEDE",
    blurb: "THE LONGHORN LINE COMING THROUGH - AND THROUGH WHAT IT HITS",
    group: "POWERS",
    keywords: ["powerup", "volley", "bull", "charge", "pierce", "eastworld"],
    levelId: "eastworld",
    stage: { runAbilities: ["iron_stampede"], spawns: horde(14, 70, 170) },
    showMs: 3000,
  },
  {
    id: "continuity-protocol",
    icon: "icon_continuity",
    label: "CONTINUITY PROTOCOL",
    blurb: "THE GOLD WARD, AND THE FLARE WHEN IT REFUSES A KILLING BLOW",
    group: "POWERS",
    keywords: ["powerup", "ward", "gold", "save", "death", "bunker"],
    levelId: "the_bunker",
    stage: {
      runAbilities: ["continuity_protocol"],
      spawns: horde(10, 40, 110),
    },
    showMs: 2200,
    // The ward doing its one job — the beat the whole power exists for.
    fire: (ctx) =>
      ctx.emit({
        type: "wardHeld",
        pos: heroPos(ctx.state),
        floor: 1,
        defId: "continuity_protocol",
      }),
  },
  {
    id: "sentry-grid",
    icon: "icon_sentry_grid",
    label: "SENTRY GRID",
    blurb: "FOUR GUNS BOLTED TO THE FLOOR, RAKING WHATEVER COMES IN",
    group: "POWERS",
    keywords: ["powerup", "turret", "gun", "sentry", "grid", "bunker"],
    levelId: "the_bunker",
    stage: { runAbilities: ["sentry_grid"], spawns: horde(14, 60, 160) },
    showMs: 3000,
  },

  // ── BOSSES: the set-piece moves ────────────────────────────────────────────
  // The shelf that did not exist, for effects that mostly did not either: three
  // of these events were emitted by the engine and drawn by nobody, so a boss's
  // slam landed for more than its contact damage with nothing on screen at all.
  {
    id: "boss-slam",
    icon: "spell_ground_slam",
    label: "GROUND SLAM",
    blurb: "THE SHOCKWAVE, THE FLOOR IT THROWS, AND THE JOLT",
    group: "BOSSES",
    keywords: ["boss", "slam", "shockwave", "telegraph", "mechanic", "quake"],
    levelId: "moon",
    stage: { spawns: horde(6, 40, 90) },
    showMs: 1200,
    fire: (ctx) =>
      ctx.emit({
        type: "enemySlam",
        pos: heroPos(ctx.state),
        radius: 78,
        defId: "armstrong",
      }),
  },
  {
    id: "boss-enrage",
    icon: "icon_talent_berserker_rage",
    label: "THE ENRAGE TURN",
    blurb: "A SET PIECE CORNERED - FASTER AND HARDER, PERMANENTLY",
    group: "BOSSES",
    keywords: ["boss", "enrage", "rage", "phase", "mechanic", "turn"],
    levelId: "moon",
    stage: { spawns: horde(1, 40, 50) },
    showMs: 1400,
    fire: (ctx) => {
      const mob = ctx.mobs[0];
      ctx.emit({
        type: "enemyEnraged",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
        defId: "armstrong",
      });
    },
  },
  {
    id: "boss-summon",
    icon: "icon_skull",
    label: "THE CALL",
    blurb: "THE GROUND COUGHS WHERE THE DEAD ARE ABOUT TO STAND",
    group: "BOSSES",
    keywords: ["boss", "summon", "adds", "call", "mechanic", "spawn"],
    levelId: "moon",
    stage: { spawns: horde(4, 50, 90, "ghost") },
    showMs: 1200,
    fire: (ctx) => {
      const mob = ctx.mobs[0];
      ctx.emit({
        type: "enemySummoned",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
        defId: "armstrong",
        count: 3,
      });
    },
  },
  {
    // The one exhibit in the gallery that stages a REAL, UNFROZEN boss and lets
    // the engine cast for itself. The beam is drawn from live state
    // (`enemy.mech.beam`) rather than from its event, because it has to track
    // the boss frame for frame as it sweeps — so an exhibit that only pushed
    // the event would show the flash and no beam. Thawing the stage is the
    // honest fix: what plays here is the engine's own cast, windup and all.
    id: "boss-laser-eyes",
    icon: "armstrong_cast_1",
    label: "LASER EYES",
    blurb: "THE EYES LIGHT, THE BEARING LOCKS, AND THE FLOOR GOES UP",
    group: "BOSSES",
    keywords: ["boss", "laser", "beam", "eyes", "armstrong", "burn", "sweep"],
    levelId: "moon",
    // The hero is put in front of the level's OWN ARMSTRONG rather than beside
    // a second one spawned for the occasion: `clearEnemies` deliberately keeps
    // a level's boss (deleting the objective would end the run), so a staged
    // copy just means two bosses casting two beams across each other.
    stage: { freeze: false, place: "boss" },
    // Long enough to carry the whole three beats — the cast pose, the sweep,
    // and the burning ground it leaves standing afterwards.
    showMs: 5200,
  },
  {
    id: "boss-scorch",
    icon: "scorch_char",
    label: "BURNING FLOOR",
    blurb: "THE BAND A BEAM LEFT ALIGHT, COOLING AS IT BURNS OUT",
    group: "BOSSES",
    keywords: ["boss", "fire", "scorch", "burn", "ground", "hazard", "beam"],
    levelId: "moon",
    stage: {},
    showMs: 4000,
    fire: (ctx) => {
      // Laid straight into state, because burning floor IS state — there is no
      // event for it (the patches outlive any one tick, so the renderer reads
      // the list the same way it reads the meteors and the storms).
      const hero = ctx.state.player.pos;
      ctx.state.scorches.length = 0;
      for (let i = 0; i < 9; i++) {
        const d = 28 + i * 22;
        ctx.state.scorches.push({
          pos: { x: hero.x - 60 + d * 0.9, y: hero.y - 40 + i * 9 },
          radius: 15,
          remainingMs: 3600,
          durationMs: 3600,
          tickMs: 500,
          intervalMs: 700,
          damage: 0,
          defId: "armstrong",
          seed: i * 37,
        });
      }
    },
  },
  {
    id: "boss-flag-plant",
    icon: "the_planted_flag_1",
    label: "FLAG PLANT",
    blurb: "THE FLAG GOES IN, AND THE GRAVE IT WAS PLANTED ON ANSWERS",
    group: "BOSSES",
    keywords: ["boss", "flag", "plant", "summon", "armstrong", "structure"],
    levelId: "moon",
    stage: {
      spawns: [
        {
          enemy: "the_planted_flag",
          count: 1,
          minDistance: 60,
          maxDistance: 70,
        },
        { enemy: "ghost", count: 3, minDistance: 70, maxDistance: 110 },
      ],
    },
    showMs: 1600,
    fire: (ctx) => {
      const flag = ctx.mobs.find((m) => m.defId === "the_planted_flag");
      ctx.emit({
        type: "bossFlagPlanted",
        pos: flag ? { ...flag.pos } : heroPos(ctx.state),
        defId: "armstrong",
        flagDefId: "the_planted_flag",
      });
    },
  },

  {
    id: "boss-coin-cannon",
    icon: "coin_shot",
    label: "COIN CANNON",
    blurb: "A FAN OF COINS THAT COME OFF THE WALLS INSTEAD OF DYING ON THEM",
    group: "BOSSES",
    keywords: ["boss", "coin", "doge", "ricochet", "bounce", "fan", "volley"],
    levelId: "spacez_hq",
    // Unfrozen and put in front of the real DOGE-1, for the same reason the
    // beam exhibit is: the ricochet only means anything against the level's
    // OWN walls, and a staged copy in open floor would show a straight line.
    stage: { freeze: false, place: "boss" },
    showMs: 4200,
  },
  {
    id: "boss-bait",
    icon: "bait_pile",
    label: "PUMP AND DUMP",
    blurb:
      "COINS ON THE FLOOR THAT LOOK EXACTLY LIKE LOOT, BECAUSE THAT IS THE POINT",
    group: "BOSSES",
    keywords: ["boss", "bait", "coin", "trap", "mine", "doge", "loot"],
    levelId: "spacez_hq",
    stage: {},
    showMs: 3600,
    fire: (ctx) => {
      // Laid into state directly, like the burning floor: bait outlives any one
      // tick, so the renderer reads the list rather than an event.
      const hero = ctx.state.player.pos;
      ctx.state.baits.length = 0;
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2 + 0.6;
        ctx.state.baits.push({
          id: 9000 + i,
          pos: {
            x: hero.x + Math.cos(angle) * 62,
            y: hero.y + Math.sin(angle) * 42,
          },
          // Staged already ARMED — the glint is the whole thing to look at.
          armMs: 0,
          remainingMs: 3400,
          durationMs: 3400,
          triggerRadius: 20,
          blastRadius: 52,
          damage: 0,
          defId: "doge_1",
          seed: i * 41,
        });
      }
    },
  },
  {
    id: "boss-airstrike",
    icon: "drop_pod",
    label: "ORBITAL DELIVERY",
    blurb: "PODS ON MARKS AROUND YOU - THEY LAND, THEY BURST, THEY OPEN",
    group: "BOSSES",
    keywords: [
      "boss",
      "airstrike",
      "pod",
      "mosque",
      "drop",
      "strike",
      "meteor",
    ],
    levelId: "mars",
    stage: { spawns: horde(6, 60, 130) },
    showMs: 3200,
    fire: (ctx) => {
      // The pods ride the meteor system, so the exhibit puts real ones in the
      // sky and lets the engine's own fall, shadow and blast play out.
      const hero = ctx.state.player.pos;
      for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2 + 0.4;
        const target = {
          x: hero.x + Math.cos(angle) * 74,
          y: hero.y + Math.sin(angle) * 52,
        };
        ctx.state.asteroids.push({
          id: 9100 + i,
          target,
          entry: { x: target.x + 160, y: target.y - 200 },
          fallMs: 1400,
          ageMs: 0,
          blastRadius: 58,
          rockRadius: 9,
          spin: 0,
          sprite: "drop_pod",
          damage: 0,
          sourceDefId: "elon_mosque",
          hatch: { defId: "servo_bot", count: 1 },
        });
      }
      ctx.emit({
        type: "bossAirstrike",
        pos: heroPos(ctx.state),
        count: 3,
        defId: "elon_mosque",
      });
    },
  },
  {
    id: "boss-call-horde",
    icon: "incel_a_0",
    label: "CALL OF INCELS",
    blurb:
      "THE FOLLOWERS ARRIVE AT A DEAD RUN, DOWN A LANE THE DUST DREW FIRST",
    group: "BOSSES",
    keywords: [
      "boss",
      "horde",
      "stampede",
      "incel",
      "mosque",
      "charge",
      "lane",
    ],
    levelId: "mars",
    stage: { freeze: false },
    showMs: 4600,
    fire: (ctx) => {
      ctx.emit({
        type: "bossHorde",
        pos: heroPos(ctx.state),
        defId: "elon_mosque",
      });
      // The herd itself comes from the engine's own hazard, so what plays is
      // the real approach dust, the real wall and the real trample.
      debugCallHorde(ctx.state, "incel");
    },
  },

  {
    id: "boss-recompile",
    icon: "zai_repair_node_1",
    label: "RECOMPILE",
    blurb: "THE BAR CLIMBING, AND THE THING IN THE ROOM IT IS CLIMBING FROM",
    group: "BOSSES",
    keywords: ["boss", "heal", "node", "tether", "zai", "repair", "recompile"],
    levelId: "eastworld",
    // Put the camera on the level's OWN supercore and raise the node beside it:
    // a tether is a link between two things, so an exhibit that framed only one
    // end of it would be showing nothing at all.
    stage: {
      place: "boss",
      spawns: [
        {
          enemy: "zai_repair_node",
          count: 1,
          minDistance: 60,
          maxDistance: 70,
        },
      ],
    },
    showMs: 3600,
    fire: (ctx) => {
      // The tether is drawn from live state, so the exhibit stages the actual
      // link: a wounded boss and a node, tied together the way the ability
      // ties them. What plays is the real renderer, not a mock-up of it.
      const node = ctx.mobs.find((m) => m.defId === "zai_repair_node");
      const boss = ctx.state.enemies.find((e) => e.defId === "zai_supercore");
      if (node && boss) {
        boss.hp = boss.maxHp * 0.4;
        (boss.mech ??= {}).nodeId = node.id;
      }
      ctx.emit({
        type: "bossRecompile",
        pos: boss ? { ...boss.pos } : heroPos(ctx.state),
        nodePos: node ? { ...node.pos } : heroPos(ctx.state),
        defId: "zai_supercore",
        nodeDefId: "zai_repair_node",
      });
    },
  },
  {
    id: "boss-lockdown",
    icon: "blast_shutter",
    label: "LOCKDOWN",
    blurb: "SHUTTERS RING YOU, AND EXACTLY ONE OF THEM IS MISSING",
    group: "BOSSES",
    keywords: ["boss", "lockdown", "shutter", "warden", "cage", "bunker"],
    levelId: "the_bunker",
    stage: {},
    showMs: 3600,
    fire: (ctx) => {
      // Dropped straight into `state.obstacles`, because that is genuinely all
      // the ability does — the shutters ARE obstacles, and drawObstacles is
      // what puts them on screen in a real fight too.
      const hero = ctx.state.player.pos;
      // The bunker's own floor furniture is dark and boxy, and a ring of dark
      // boxy shutters standing among it reads as more of the same. The exhibit
      // is about the SHAPE the ring makes and the hole in it, so it clears the
      // room first — the only liberty it takes, and it takes it in the open.
      ctx.state.obstacles.length = 0;
      const gapAt = 0.9;
      for (let i = 0; i < 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        let d = angle - gapAt;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) <= (55 * Math.PI) / 180 / 2) continue;
        ctx.state.obstacles.push({
          id: 9200 + i,
          kind: "shutter",
          sprite: "blast_shutter",
          pos: {
            x: hero.x + Math.cos(angle) * 78,
            y: hero.y + Math.sin(angle) * 78,
          },
          radius: 9,
          jumpable: false,
        });
      }
      ctx.state.obstaclesVersion++;
      ctx.emit({
        type: "bossLockdown",
        pos: { ...hero },
        radius: 78,
        gapAngle: gapAt,
        defId: "vault_warden",
      });
    },
  },

  // ── ELITES: the tier built out of the hero's own kit ───────────────────────
  // Ten primitives, each shown in ONE elite's authored colours (see the `look`
  // note in src/game/defs/enemies/abilities.ts) — which is also what these
  // exhibits are FOR. The whole claim of the tier is that a shared primitive
  // reads as a different move in a different mob's hands, and the only way to
  // judge that claim is to look at one and then look at another.
  //
  // Every one fires the REAL `eliteCast` event the engine pushes, so an exhibit
  // can never drift from what ships; the three that are drawn from live state
  // rather than from the event (the ring, the shell, the tether) stage that
  // state on a real mob, exactly as the RECOMPILE exhibit stages its node.
  {
    id: "elite-orbit-guard",
    icon: "elite_mote",
    label: "ORBIT GUARD",
    blurb: "A RING OF MOTES TURNING, AND THE LAST STRIDE IN COSTS SOMETHING",
    group: "ELITES",
    keywords: [
      "elite",
      "orbit",
      "ring",
      "motes",
      "lucky",
      "leprechaun",
      "gold",
    ],
    levelId: "the_rift",
    stage: {
      spawns: [{ enemy: "lucky", count: 1, minDistance: 54, maxDistance: 62 }],
    },
    showMs: 4200,
    fire: (ctx) => {
      // The ring is drawn from the caster's LIVE state (an effect holds a
      // position, and a ring is attached to a body that walks), so the exhibit
      // starts the real thing rather than miming it.
      const mob = ctx.mobs.find((m) => m.defId === "lucky");
      if (mob) {
        const mech = (mob.mech ??= {});
        mech.orbitMs = 4200;
        mech.orbitAngle = 0;
        mech.orbitBiteMs = 0;
      }
      ctx.emit({
        type: "eliteCast",
        kind: "orbit_guard",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
        defId: "lucky",
        count: 5,
        radius: 32,
        ms: 4200,
      });
    },
  },
  {
    id: "elite-seeker-volley",
    icon: "elite_bolt",
    label: "SEEKER VOLLEY",
    blurb: "SLOW BOLTS THAT STEER — OUTRUN THEM OR BREAK THE LINE",
    group: "ELITES",
    keywords: [
      "elite",
      "seeker",
      "homing",
      "bolt",
      "volley",
      "jeff",
      "delivery",
    ],
    levelId: "the_bunker",
    stage: {
      spawns: [
        {
          enemy: "jeff_baywatch",
          count: 1,
          minDistance: 120,
          maxDistance: 140,
        },
      ],
    },
    showMs: 3200,
    fire: (ctx) => {
      const mob = ctx.mobs.find((m) => m.defId === "jeff_baywatch");
      const from = mob ? { ...mob.pos } : heroPos(ctx.state);
      ctx.emit({
        type: "eliteCast",
        kind: "seeker_volley",
        pos: from,
        defId: "jeff_baywatch",
        angle: Math.atan2(
          ctx.state.player.pos.y - from.y,
          ctx.state.player.pos.x - from.x,
        ),
        spread: (38 * Math.PI) / 180,
        count: 5,
      });
    },
  },
  {
    id: "elite-ember-trail",
    icon: "scorch_char",
    label: "EMBER TRAIL",
    blurb: "IT PAINTS THE PATH YOU KITE IT DOWN, AND THE PATH BURNS",
    group: "ELITES",
    keywords: ["elite", "trail", "fire", "burn", "medic", "contagion", "moon"],
    levelId: "moon",
    stage: {},
    showMs: 4200,
    fire: (ctx) => {
      // Laid straight into `state.scorches`, because that is genuinely what the
      // ability does — the patches ARE the burning floor the boss beam lays,
      // wearing the caster's own kit. A curve rather than a line, so the
      // exhibit shows the one thing that matters: it paints where the mob WENT.
      const hero = heroPos(ctx.state);
      ctx.state.scorches.length = 0;
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        ctx.state.scorches.push({
          pos: {
            x: hero.x - 90 + t * 180,
            y: hero.y + Math.sin(t * Math.PI) * 46,
          },
          field: "burn",
          look: eliteLook("quarantine_medic", "ember_trail"),
          radius: 24,
          remainingMs: 4200,
          durationMs: 4200,
          tickMs: 0,
          intervalMs: 560,
          damage: 0,
          defId: "quarantine_medic",
          seed: i * 37,
        });
      }
      ctx.emit({
        type: "eliteCast",
        kind: "ember_trail",
        pos: hero,
        defId: "quarantine_medic",
        ms: 4200,
      });
    },
  },
  {
    id: "elite-shock-pulse",
    icon: "nikola_tesla_1",
    label: "SHOCK PULSE",
    blurb: "A RING OUT, AND YOU ARE PUT BACK WHERE IT WANTS YOU",
    group: "ELITES",
    keywords: ["elite", "pulse", "ring", "knockback", "tesla", "shock", "rift"],
    levelId: "the_rift",
    stage: {},
    showMs: 1600,
    fire: (ctx) => {
      ctx.emit({
        type: "eliteCast",
        kind: "shock_pulse",
        pos: heroPos(ctx.state),
        defId: "nikola_tesla",
        radius: 66,
        look: eliteLook("nikola_tesla", "shock_pulse"),
      });
    },
  },
  {
    id: "elite-blink-strike",
    icon: "amelia_earhart_1",
    label: "BLINK STRIKE",
    blurb: "IT IS NOT WHERE IT WAS — AND IT SWINGS WHERE YOU WERE",
    group: "ELITES",
    keywords: [
      "elite",
      "blink",
      "teleport",
      "amelia",
      "earhart",
      "gap",
      "rift",
    ],
    levelId: "the_rift",
    stage: {},
    showMs: 1800,
    fire: (ctx) => {
      // ONE event carrying BOTH ends, which is how the ability reports it: the
      // departure and the arrival are one move, and two effects would drift.
      const hero = heroPos(ctx.state);
      ctx.emit({
        type: "eliteCast",
        kind: "blink_strike",
        pos: { x: hero.x - 150, y: hero.y - 40 },
        to: { x: hero.x - 30, y: hero.y },
        defId: "amelia_earhart",
        look: eliteLook("amelia_earhart", "blink_strike"),
      });
    },
  },
  {
    id: "elite-rally-cry",
    icon: "security_chief_1",
    label: "RALLY CRY",
    blurb: "IT TOUCHES YOU NOT AT ALL, AND MAKES EVERYTHING ELSE WORSE",
    group: "ELITES",
    keywords: ["elite", "rally", "shout", "buff", "horde", "security", "chief"],
    stage: {
      spawns: [{ enemy: "guard", count: 6, minDistance: 40, maxDistance: 110 }],
    },
    showMs: 2400,
    fire: (ctx) => {
      ctx.emit({
        type: "eliteCast",
        kind: "rally_cry",
        pos: heroPos(ctx.state),
        defId: "security_chief",
        radius: 200,
        count: ctx.mobs.length,
        ms: 6000,
        look: eliteLook("security_chief", "rally_cry"),
      });
    },
  },
  {
    id: "elite-snare-field",
    icon: "janitor_1",
    label: "SNARE FIELD",
    blurb: "IT HURTS NOBODY, WHICH IS WHY IT WORKS",
    group: "ELITES",
    keywords: ["elite", "snare", "slow", "field", "janitor", "web", "mop"],
    showMs: 4000,
    stage: {},
    fire: (ctx) => {
      // A `snare` patch is the SECOND rule `state.scorches` holds, so the
      // exhibit lays a real one — the weave, the release, and the fact that it
      // deals nothing are all the shipping code's.
      const hero = heroPos(ctx.state);
      ctx.state.scorches.length = 0;
      ctx.state.scorches.push({
        pos: { ...hero },
        field: "snare",
        slowFactor: 0.55,
        look: eliteLook("janitor", "snare_field"),
        radius: 52,
        remainingMs: 4000,
        durationMs: 4000,
        tickMs: 0,
        intervalMs: 0,
        damage: 0,
        defId: "janitor",
        seed: 11,
      });
      ctx.emit({
        type: "eliteCast",
        kind: "snare_field",
        pos: { ...hero },
        defId: "janitor",
        radius: 52,
        ms: 4000,
      });
    },
  },
  {
    id: "elite-siphon-tether",
    icon: "grigori_rasputin_1",
    label: "SIPHON TETHER",
    blurb: "IT HOLDS STILL AND DRINKS — BREAK THE LINE OR FEED IT",
    group: "ELITES",
    keywords: [
      "elite",
      "siphon",
      "drain",
      "tether",
      "rasputin",
      "heal",
      "rift",
    ],
    levelId: "the_rift",
    stage: {
      spawns: [
        {
          enemy: "grigori_rasputin",
          count: 1,
          minDistance: 110,
          maxDistance: 130,
        },
      ],
    },
    showMs: 3600,
    fire: (ctx) => {
      // Drawn from live state like the ring and the shell: a tether is a link
      // between two moving things, so the exhibit ties a real one.
      const mob = ctx.mobs.find((m) => m.defId === "grigori_rasputin");
      if (mob) {
        const mech = (mob.mech ??= {});
        mech.siphonMs = 3600;
        mech.siphonTickMs = 0;
        mob.hp = mob.maxHp * 0.5;
      }
      ctx.emit({
        type: "eliteCast",
        kind: "siphon_tether",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
        to: { ...ctx.state.player.pos },
        defId: "grigori_rasputin",
        ms: 3600,
      });
    },
  },
  {
    id: "elite-ward-shield",
    icon: "mark_suckerberg_1",
    label: "WARD SHIELD",
    blurb: "A BUDGET, NOT A TIMER — SPEND EVERYTHING NOW",
    group: "ELITES",
    keywords: [
      "elite",
      "ward",
      "shield",
      "shell",
      "barrier",
      "suckerberg",
      "bunker",
    ],
    levelId: "the_bunker",
    stage: {
      spawns: [
        {
          enemy: "mark_suckerberg",
          count: 1,
          minDistance: 56,
          maxDistance: 66,
        },
      ],
    },
    showMs: 4200,
    fire: (ctx) => {
      const mob = ctx.mobs.find((m) => m.defId === "mark_suckerberg");
      if (mob) {
        const mech = (mob.mech ??= {});
        mob.hp = mob.maxHp * 0.7;
        mech.wardHp = Math.round(mob.maxHp * 0.26);
        mech.wardMs = 4200;
      }
      ctx.emit({
        type: "eliteCast",
        kind: "ward_shield",
        pos: mob ? { ...mob.pos } : heroPos(ctx.state),
        defId: "mark_suckerberg",
        ms: 4200,
      });
    },
  },
  {
    id: "elite-quake-line",
    icon: "elite_fissure_0",
    label: "QUAKE LINE",
    blurb: "IT STAYS PUT AND THE FLOOR DOES THE WALKING",
    group: "ELITES",
    keywords: [
      "elite",
      "quake",
      "fissure",
      "crack",
      "lane",
      "prospector",
      "drill",
    ],
    levelId: "moon",
    stage: {},
    showMs: 2400,
    fire: (ctx) => {
      // The fissures arrive IN ORDER down the lane, which is the whole read —
      // so the exhibit staggers them exactly as the ability's `stepMs` does
      // rather than flashing the lane all at once.
      const hero = heroPos(ctx.state);
      const look = eliteLook("prospector", "quake_line");
      for (let i = 0; i < 5; i++) {
        ctx.after(i * 110, () => {
          ctx.emit({
            type: "eliteCast",
            kind: "quake_line",
            phase: "tick",
            pos: { x: hero.x - 60 + i * 30, y: hero.y },
            defId: "prospector",
            radius: 20,
            look,
          });
        });
      }
    },
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
    id: "loot-rarity",
    icon: "icon_treasure_map",
    label: "RARITY AURA",
    blurb: "THE WHOLE LADDER SIDE BY SIDE - HALO, SMOKE, BEAM, MOTES, RING",
    group: "WORLD",
    keywords: [
      "loot",
      "drop",
      "rarity",
      "tier",
      "glow",
      "aura",
      "smoke",
      "beam",
      "magic",
      "rare",
      "unique",
      "legendary",
      "artifact",
    ],
    // The whole point of this one is COMPARISON: the ladder is a set of layers
    // that each switch on at a rung, and a single find tells you nothing about
    // whether the rung above it reads as more. Laid out low-to-high, left to
    // right, on the MOON's dark regolith — coloured light is judged against the
    // floor it has to carry across, and a pale deck plate flatters every tier
    // equally, which is the one thing a comparison must not do.
    levelId: "moon",
    stage: {},
    showMs: 4000,
    fire: (ctx) => {
      const at = heroPos(ctx.state);
      const ladder: Tier[] = [
        "trash",
        "regular",
        "magic",
        "rare",
        "set",
        "unique",
        "legendary",
        "artifact",
      ];
      ladder.forEach((tier, i) => {
        ctx.state.items.push({
          id: ctx.state.nextId++,
          kind: "equipment",
          pos: { x: at.x + (i - (ladder.length - 1) / 2) * 30, y: at.y + 34 },
          equipment: rollEquipment(ctx.state, { defId: "gladius", tier }),
        });
      });
    },
  },
  {
    id: "loot-toss",
    icon: "icon_coins",
    label: "LOOT TOSS",
    blurb:
      "THE D2 SPILL - LOOT ARCS OUT OF THE BODY, TUMBLES AND CLATTERS DOWN",
    group: "WORLD",
    keywords: [
      "loot",
      "drop",
      "toss",
      "throw",
      "arc",
      "bounce",
      "spill",
      "land",
      "dust",
      "shine",
    ],
    stage: {},
    showMs: 2200,
    fire: (ctx) => {
      // One body, one spill: the fan every kill pays out. Mixed on purpose —
      // the arcs, the tumble and the landing dust are shared, but each piece
      // lands on its OWN material (a blade rings, mail jingles, glass clinks)
      // and the named ones bloom on top of it.
      // Well clear of the hero: a spill that lands under his feet is a spill he
      // walks off with, and the show is the ARRIVAL, not the pickup.
      const from = {
        x: ctx.state.player.pos.x + 62,
        y: ctx.state.player.pos.y,
      };
      const spill: { defId: string; tier: Tier }[] = [
        { defId: "gladius", tier: "regular" },
        { defId: "chainmail_hauberk", tier: "magic" },
        { defId: "cargo_pants", tier: "rare" },
        { defId: "crystal_orb", tier: "unique" },
        { defId: "combat_knife", tier: "legendary" },
      ];
      spill.forEach((entry, i) => {
        const angle = (i / spill.length) * Math.PI * 2;
        dropItem(
          ctx.state,
          {
            id: ctx.state.nextId++,
            kind: "equipment",
            pos: {
              x: from.x + Math.cos(angle) * 46,
              y: from.y + Math.sin(angle) * 30,
            },
            equipment: rollEquipment(ctx.state, {
              defId: entry.defId,
              tier: entry.tier,
            }),
          },
          from,
        );
      });
      // The loose pickups ride along, so the flask and the spark voices are in
      // the same show as the steel.
      dropItem(
        ctx.state,
        { id: ctx.state.nextId++, kind: "medkit", pos: { ...from }, tier: 1 },
        from,
      );
      dropItem(
        ctx.state,
        { id: ctx.state.nextId++, kind: "xp", pos: { ...from } },
        from,
      );
    },
  },
  {
    id: "blood-tracks",
    icon: "icon_leather_boots",
    label: "BLOODY BOOTPRINTS",
    blurb: "HE WALKS IT OUT OF THE POOL AND PRINTS IT ON CLEAN GROUND",
    group: "WORLD",
    keywords: [
      "blood",
      "gore",
      "footprints",
      "bootprints",
      "tracks",
      "trail",
      "floor",
      "walk",
      "steps",
    ],
    // The whole exhibit is the WALK: a pack cut down on one spot leaves a pool,
    // and he laps past it. What to watch is the trail RUNNING OUT — the prints
    // go from a wet sole to a drying scuff over the next few strides, because
    // the boot carries a finite amount (render/blood-tracks.ts).
    // A knot cut down right where he is standing, then a lap that carries him
    // OUT of the pool it left and back in again: the ellipse he walks is wider
    // than the mess is, so half of every lap is clean ground for him to print
    // on. Staging the kills out on the lap instead would leave him permanently
    // in the blood, and a hero who never leaves it never lays a trail. The
    // moon's dark regolith is the floor that shows a dark mark best.
    levelId: "moon",
    stage: { spawns: horde(9, 10, 40) },
    walk: { radius: 76, periodMs: 5200 },
    showMs: 7000,
    fire: (ctx) => {
      for (const mob of ctx.mobs) ctx.emit(killEvent(mob, { bars: 1 }));
    },
  },
  {
    id: "jump-dust",
    icon: "spell_ground_slam",
    label: "JUMP DUST",
    blurb: "THE SHOVE-OFF AND THE TOUCHDOWN, IN THE FLOOR'S OWN COLOUR",
    group: "WORLD",
    keywords: ["jump", "land", "takeoff", "dust", "puff", "smoke", "impact"],
    // Mars: its rust is the clearest read that the cloud is sampled off the
    // GROUND rather than painted a stock grey. The same jump on the moon comes
    // up pale, and inside a base it comes up deck-plate grey.
    levelId: "mars",
    stage: { spawns: horde(4, 44, 110) },
    showMs: 1600,
    fire: (ctx) => {
      const at = ctx.state.player.pos;
      // The whole arc in one show: he shoves off, and a beat later he lands
      // hard — the takeoff's low backward smear against the landing's ring,
      // cloud and grit.
      ctx.emit({ type: "jump", pos: { ...at }, speed: 60 });
      ctx.after(520, () =>
        ctx.emit({
          type: "land",
          pos: { ...ctx.state.player.pos },
          impact: 1.4,
          speed: 60,
        }),
      );
    },
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
    ...FIELD_EXHIBITS.filter((e) => e.group === "BOSSES"),
    ...FIELD_EXHIBITS.filter((e) => e.group === "ELITES"),
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
