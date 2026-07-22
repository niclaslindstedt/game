// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Level hazards: gravity wells, asteroid strikes, hay balls, sand storms,
// and employee stampedes.

/**
 * Gravity wells — black holes placed by a level (LevelDef.wells). Each well
 * drags whatever crosses its pull radius toward the core: the grounded
 * player and enemies (reach `pullRadius`), and loose loot from much farther
 * out (reach `lootRadius`, about a phone screen away) — which piles up on the
 * rim instead of being destroyed, a dare to dash in. A jump no longer sails
 * clean over a hole: airborne the hero still drifts toward the core
 * (`airPullFraction` of the ground pull) and the hole's gravity fights his
 * hop (`jumpGravity`), so he can't hang over the horizon at full height. A
 * MINION dragged into the core is devoured outright: off the board with no
 * kill, no XP and no loot — the hole pays nobody. Elites and bosses are too
 * massive to swallow (their set pieces survive a bad camp spot) and
 * apparitions too immaterial; both only suffer the drag. A grounded player
 * dragged all the way into the core is DEVOURED too — instant death, the
 * price of a loot dash gone wrong. These are the per-well DEFAULTS — a level's
 * well spec may override each number. Units: world px, world px/s.
 */
export const WELLS = {
  /** Reach of the pull on the player and enemies. */
  pullRadius: 130,
  /** Inside this the hole devours minions and the grounded player alike. */
  coreRadius: 16,
  /**
   * Peak pull at the core's edge (px/s), falling off linearly to 0 at
   * `pullRadius`. Deliberately above the hero's base walk (PLAYER.speed 56):
   * the outer band is a lean he can walk out of, the inner third a genuine
   * fight — SPEED, the sprint, or a jump is what gets him clear.
   */
  pullSpeed: 96,
  /**
   * Reach of the pull on loose LOOT — about a phone screen away, so drops
   * scattered around a hole slide toward it from well beyond the player's own
   * pull. The tug eases in (`1 - d/lootRadius` SQUARED): a crawl at the far
   * edge, quickening as it nears the core — slow from the edges, then faster.
   */
  lootRadius: 300,
  /** Peak loot pull at the core (px/s), eased to ~0 at `lootRadius`. */
  lootPullSpeed: 96,
  /**
   * The share of the ground pull that still tugs the hero HORIZONTALLY while
   * he is airborne over the well: a jump over a hole no longer sails clean —
   * he drifts toward the core, weaker than on the ground but never nothing.
   */
  airPullFraction: 0.6,
  /**
   * Extra downward acceleration (px/s²) the hole heaps on the hero's jump
   * while he is airborne inside the pull radius — peak at the core's edge,
   * linear falloff to 0 at the reach (the same shape as the drag). The hole's
   * gravity fights the hop, so he JUMPS LESS HIGH the nearer the horizon.
   */
  jumpGravity: 900,
  /**
   * Dragged items park this far from the center — just outside the core, so
   * the loot hoard on the event horizon is grabbable at a price.
   */
  itemRestRadius: 22,
} as const;

/**
 * Asteroids — the meteor strikes a level turns on with LevelDef.asteroids.
 * Each rock falls OUT OF THE SKY at a slanting angle onto a target patch near
 * the player: a faint ground mark (a shadow that firms as the rock nears)
 * telegraphs the impact, then the rock lands and DETONATES. The blast is an
 * AoE — minions caught in the lethal CORE are vaporized (an environmental
 * kill: no XP, no loot, no menace — like a well swallow, so strikes can't be
 * farmed), and everything the shockwave touches (surviving minions, elites,
 * and the grounded hero) is FLUNG outward to the sides. The hero also takes a
 * difficulty-scaled bite of his MAX hp scaled by how near the centre he stood
 * (the fraction is DifficultyDef.asteroidDamageFrac, 20%→75% up the ladder) —
 * jumping (z above JUMP.dodgeHeight) at the moment of impact sails clear of
 * the blast exactly like it clears enemy contact. The impact leaves a CRATER
 * on the surface (levels whose ground can scar name the sprites via
 * `asteroids.craterSprites`) that lingers, then fades once the dust settles.
 * Rocks come in from varied angles and ignore obstacles and level bounds.
 * Units: world px, px/s, ms.
 */
export const ASTEROIDS = {
  /** Impact points land within this radius of the player (px): a strike
   * threatens the hero's patch, it does not home onto him. */
  targetJitter: 150,
  /** How far up-range the rock enters from, measured along the ground from its
   * impact point (px). Combined with `entryHeight` it sets the slant of the
   * fall; a fresh random bearing each rock makes them rain from every angle. */
  entryGroundDist: 210,
  /** The visual altitude a rock enters at, easing to 0 at impact (px, renderer
   * only — the engine tracks the strike by its fall timer, not a z). */
  entryHeight: 340,
  /** Fall time from entry to impact, rolled per rock (ms) — this IS the
   * telegraph window the hero (and the bot) get to clear the mark. */
  fallMs: [1250, 1900] as [number, number],
  /** Explosion (AoE) radius, rolled per rock (px). */
  blastRadius: [44, 64] as [number, number],
  /** The lethal CORE as a fraction of the blast radius: a minion within it is
   * vaporized; mobs in the outer ring are flung, not killed. */
  killFraction: 0.6,
  /** Visual rock radius, rolled per rock (px) — the sprite size, not the
   * blast. */
  rockRadius: [7, 11] as [number, number],
  /** Peak outward launch speed at ground zero (px/s), easing to 0 at the blast
   * edge — the shockwave that flings mobs and the hero to the sides. */
  knockbackSpeed: 360,
  /** How long a flung body coasts before the launch bleeds out (ms). */
  knockbackMs: 320,
  /** e-folding time of the launch's velocity decay (ms): the fling is fast at
   * first and eases as it settles, rather than stopping dead. */
  knockbackTauMs: 130,
  /** Rocks falling at once are capped here; the spawner defers above it. */
  maxAlive: 3,
  /** Crater radius as a fraction of the blast radius. */
  craterFraction: 0.55,
  /** How long a fresh crater lingers before it fades from the surface (ms). */
  craterMs: 9000,
  /** The crater's fade-out tail at the end of its life (ms). */
  craterFadeMs: 2500,
  /** Craters on the field are capped here; the oldest is retired first so a
   * long run's scars never pile up unbounded. */
  maxCraters: 14,
} as const;

/**
 * Hay balls — the spinning, bouncing bales a level rolls in with
 * LevelDef.hayBalls (Eastworld's western prop hazard). Each spawns just past
 * the RIGHT screen edge in a lane of its own and rolls straight to the LEFT
 * across the player's surroundings, spinning and hopping (the bounce is a
 * renderer-only sine off `bouncePeriodMs`/`bounceHeight`). Unlike the asteroid
 * rain a bale does NOT take a scaled bite: contact costs a VERY SLIGHT flat hp
 * (`damage`, once per bale) and SHOVES the grounded hero LEFT (`knockback`,
 * every tick it overlaps) — so a bale caught standing in the lane drags him
 * back down the street and he must step OUT of the lane (or jump, z above
 * JUMP.dodgeHeight, like clearing enemy contact) to stop being pushed. Bales
 * plow minions aside unharmed, ignore obstacles and level bounds, and despawn
 * once past the player's stage. Units: world px, px/s, ms.
 */
export const HAY_BALLS = {
  /** Spawn distance to the RIGHT of the player — just past the screen edge. */
  spawnDistance: 260,
  /** Vertical spread of the spawn lane around the player (px), so successive
   * bales roll down different lanes rather than one groove. */
  laneJitter: 150,
  /** Roll speed, rolled per bale (px/s) — slower than an asteroid so the shove
   * reads as a drag, not a flick. */
  speed: [70, 110] as [number, number],
  /** Collision radius, rolled per bale (px) — small, light bales. */
  radius: [6, 9] as [number, number],
  /** Leftward shove speed (px/s) applied every tick the grounded hero overlaps
   * a bale — kept under the roll speed so a bale drags him a stretch before it
   * rolls on past. */
  knockback: 78,
  /** The VERY SLIGHT flat hp a bale costs on contact, once per bale. */
  damage: 3,
  /** Peak of the visual hop (px, renderer only). */
  bounceHeight: 9,
  /** Time for one full bounce (ms, renderer only). */
  bouncePeriodMs: 620,
  /** Bales in flight are capped here; the spawner defers above it. */
  maxAlive: 4,
  /** A bale this far from the player despawns — it has left the stage. */
  despawnDistance: 620,
} as const;

/**
 * Sand storms — small, animated dust squalls a level turns on with
 * LevelDef.sandstorms (Mars). Each spawns on a ring just past the phone screen
 * edge (the asteroid/enemy-spawn rationale) and DRIFTS across the player's
 * surroundings in a straight line, SLOW enough to walk clear of — getting out
 * of the way is the whole defence. A storm shoves minions aside like an
 * asteroid (chaos, no harm). The grounded hero it catches is struck ONCE: a
 * difficulty-scaled bite of his MAX hp (DifficultyDef.sandstormDamageFrac) AND
 * a KNOCKOUT — he drops prone and helpless for `knockoutMs`. Having struck,
 * the storm keeps drifting (passes OVER the fallen hero) and thins out over
 * `fadeMs` before vanishing. A jump (z above JUMP.dodgeHeight) sails clear of
 * the gust exactly like a rock, and a hero already knocked out is never caught
 * a second time. Units: world px, px/s, ms.
 */
export const SANDSTORMS = {
  /** Spawn distance from the player — just past the screen edge. */
  ringDistance: 260,
  /** Aim scatter around the player (px): a storm threatens a swathe, not a
   * homing strike. */
  targetJitter: 90,
  /** Drift speed, rolled per storm (px/s) — a slow rolling wall of dust the
   * hero can stroll out of, well under the asteroid streak. */
  speed: [52, 78] as [number, number],
  /** Body radius, rolled per storm (px) — SMALL squalls, a few strides wide. */
  radius: [26, 40] as [number, number],
  /** Storms in flight are capped here; the spawner defers above it. */
  maxAlive: 2,
  /** A storm this far from the player despawns — it has left the stage. */
  despawnDistance: 700,
  /** How long the caught hero lies prone and helpless (ms). */
  knockoutMs: 2000,
  /** After it strikes, the storm thins out over this window (ms) as it passes
   * over the fallen hero, then vanishes. */
  fadeMs: 1400,
} as const;

/**
 * Employee stampedes — the "asteroid" beat of SpaceZ HQ (a level turns them on
 * with LevelDef.stampedes). Every `everyMs` a HERD of `runnerCount` panicked
 * staffers mints just past the RIGHT screen edge in a vertical wall and
 * charges straight to the LEFT at a steady, heavy pace, a churning dust cloud
 * boiling off its back. The wall knocks over EVERYTHING
 * in its lane: minions caught in the band are BOWLED OVER — flung aside and left
 * KNOCKED OUT for a few seconds (`trampleStunMs`; no damage, no kill, no XP, no
 * loot — a herd can't be farmed and doesn't thin the horde) before they scramble
 * back up — while elites and bosses hold their ground and are only shoved.
 * The grounded hero it catches is struck ONCE: a difficulty-scaled bite of his
 * MAX hp (DifficultyDef.stampedeDamageFrac, 10%→40% up the ladder) AND a
 * KNOCKDOWN (he drops prone and helpless for `knockdownMs`, the same
 * `Player.knockoutMs` a sand storm uses). Jumping (z above JUMP.dodgeHeight)
 * sails clean over the whole herd — a hop is the intended dodge — and stepping
 * out of its lane clears it too. A herd that has struck keeps charging (passes
 * OVER the fallen hero) and despawns once past his stage; a hero already down is
 * never caught twice. The herd ignores obstacles and level bounds. It is HEARD
 * before it is seen: a low rumble of feet fades up over the last `warnMs` of the
 * countdown (before the wall appears) and swells through the charge, peaking as
 * it passes (the `stampedeRumble` event, emitted on the `rumbleEveryMs` cadence
 * with a 0..1 intensity). It is also SEEN coming: over the last `telegraphMs`
 * (scaled per difficulty by `DifficultyDef.stampedeTelegraphMult`) a line of
 * DUST kicks up along the exact lane the wall will charge down (`state.stampedeWarn`,
 * the lane rolled the moment the telegraph lights so the dust and the herd
 * agree), fading in as the spawn nears — a gentle rung gets a long look, JESUS a
 * blink. The collision band is a THIN VERTICAL LINE (small `bandHalfDepth`, tall
 * `bandHalfHeight`) so a hop clears it cleanly — the wall passes underfoot in a
 * blink rather than a wide slab that's near-impossible to time. Units: world px,
 * px/s, ms, fractions.
 */
export const STAMPEDES = {
  /** Spawn distance to the RIGHT of the player — just past the screen edge. */
  spawnDistance: 300,
  /** Vertical spread of the herd's spawn centre around the player (px), so
   * successive herds thunder down different bands of the floor. */
  laneJitter: 130,
  /** Runners in one herd — the "group of five" that reads as a stampede. */
  runnerCount: 5,
  /** Charge speed, rolled per herd (px/s) — a heavy, rolling wall the hero has
   * a beat to read before a hop or a step aside clears it. */
  speed: [120, 150] as [number, number],
  /** Collision radius of a single runner (px) — one staffer's body. Halved with
   * the sprite so the smaller wall is easier to read and slip. */
  runnerRadius: 4,
  /** Half-height of the herd's collision band (px): the vertical wall the five
   * runners spread across. A body inside `pos.y ± this` (plus its own radius)
   * is in the herd's path. This is the LONG axis of the thin hitbox line. */
  bandHalfHeight: 26,
  /** Half-depth of the herd's collision band along its charge (px): the front-
   * to-back thickness of the wall of runners. Kept THIN — the hitbox is a
   * vertical line, so the wall passes underfoot in a blink and a hop clears it
   * cleanly (a wide slab was near-impossible to time a jump over). */
  bandHalfDepth: 4,
  /** Horizontal stagger between successive runners (px, renderer + spawn): the
   * herd charges in a loose ragged column, not one flat rank. */
  runnerStaggerX: 8,
  /** How long the trampled hero lies prone and helpless (ms). */
  knockdownMs: 2000,
  /** Sideways+forward fling speed applied to a trampled minion (px/s) the tick
   * it is caught — it is knocked away in the herd's travel line, so the trample
   * reads as bodies scattering before they scramble back up. */
  tramplePush: 260,
  /** How long a trampled MINION lies KNOCKED OUT (ms): the herd bowls it over
   * rather than killing it, so it is flung aside (`tramplePush`) and left
   * helpless — AI sat out (its `knockMs`) — for this long before it scrambles
   * back up. A few seconds, a touch under the hero's own knockdown. */
  trampleStunMs: 1800,
  /** Herds in flight are capped here; a stampede is a big beat, not a swarm. */
  maxAlive: 1,
  /** A herd this far past the player despawns — it has left the stage. */
  despawnDistance: 700,
  /** APPROACH RUMBLE — the herd is HEARD before it is seen. This many ms before
   * a herd mints, a low roll of feet fades up from silence, so the wall never
   * arrives on a silent floor; it starts before the runners appear, not with
   * them. */
  warnMs: 1900,
  /** The pre-spawn rumble's intensity ceiling (0..1), reached just as the herd
   * mints — pitched to match the charging herd's proximity intensity at its
   * spawn distance so the roll swells seamlessly into the pass. */
  warnPeak: 0.55,
  /** Distance over which a CHARGING herd's rumble fades (px): full-throated as
   * the wall passes the hero (distance→0), gone once it is this far off. */
  rumbleRange: 700,
  /** Cadence of the rumble grains the engine emits (ms); the app overlaps each
   * grain into a continuous roll. Below the rumble floor no grain fires. */
  rumbleEveryMs: 150,
  /** APPROACH TELEGRAPH — the wall is SEEN coming, not just heard. This many ms
   * before a herd mints (the BASE lead, scaled per rung by
   * `DifficultyDef.stampedeTelegraphMult` — 1.5× on easy down to 0.4× on JESUS),
   * a line of DUST kicks up along the exact lane the herd will charge down, so
   * the player can read WHICH band to clear before the runners appear. The lane
   * (`state.stampedeWarn.y`) is rolled the instant the telegraph lights and the
   * herd then spawns on it, so the dust and the wall never disagree. */
  telegraphMs: 1000,
} as const;
