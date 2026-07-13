// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Signature slash effects for the field hero's melee WEAPON SWING (developer
// flag): the styled crescent that rides the blade (see render.ts `drawPlayer` /
// `drawBladeSlash`) plus the themed gore burst a hit throws off. A UNIQUE weapon
// gets its OWN look — Excalibur flares holy gold, Mjölnir spits sparks, Muramasa
// bleeds — so a named blade FEELS more powerful than a plain one. Purely a
// render concern (this game's presentation layer), keyed off the equipped
// weapon's `uniqueId`; the engine knows nothing about it.
//
// Authoring: add a style below and preview it with the weapon-swing script —
//   node scripts/weapon-swing.mjs poses excalibur
//   node scripts/weapon-swing.mjs uniques           # a contact sheet of them all
//   node scripts/weapon-swing.mjs live muramasa     # the slash + its gore

/** A speck thrown off the slash arc — each kind reads as an element. */
export type ParticleKind =
  "ember" | "spark" | "frost" | "void" | "mote" | "blood";

/** The gore a hit throws when a signature weapon lands a melee blow. */
export type GoreStyle = {
  /** Core spray color. */
  color: string;
  /** How many specks fly. */
  count: number;
  /** How far they scatter (world px). */
  spread: number;
  /** Speck look; defaults to a plain spray. */
  particle?: ParticleKind;
};

/** One weapon's slash signature: the crescent's colors plus optional flourish. */
export type SlashStyle = {
  /** Crescent fill. */
  core: string;
  /** The hot leading edge riding the blade. */
  edge: string;
  /** Soft glow bloomed behind the crescent. Omit for a clean blade. */
  glow?: string;
  /** Specks thrown off the sweeping edge. */
  particle?: ParticleKind;
  /** Ghost crescents trailing the blade — a heavier, weightier swing. */
  afterimages?: number;
  /** Crescent thickness multiplier (1 = the plain slash). */
  weight?: number;
  /** The gore a landed blow throws (see GameScreen). */
  gore?: GoreStyle;
};

/** The plain slash every base weapon (and any un-styled unique) wears. */
export const DEFAULT_SLASH: SlashStyle = { core: "#e6f1ff", edge: "#ffffff" };

// Reusable elemental kits — most uniques are a kit, some with a tweak.
const FIRE: SlashStyle = {
  core: "#ffd9a0",
  edge: "#fff3cf",
  glow: "#ff7a1e",
  particle: "ember",
  gore: { color: "#ff8a2a", count: 10, spread: 16, particle: "ember" },
};
const HOLY: SlashStyle = {
  core: "#fff6d6",
  edge: "#ffffff",
  glow: "#ffe08a",
  particle: "mote",
  afterimages: 2,
  gore: { color: "#ffe9a6", count: 10, spread: 15, particle: "mote" },
};
const FROST: SlashStyle = {
  core: "#daf3ff",
  edge: "#ffffff",
  glow: "#68c8ff",
  particle: "frost",
  gore: { color: "#a6e6ff", count: 9, spread: 14, particle: "frost" },
};
const STORM: SlashStyle = {
  core: "#dfe8ff",
  edge: "#ffffff",
  glow: "#7aa2ff",
  particle: "spark",
  afterimages: 1,
  gore: { color: "#bcd2ff", count: 12, spread: 18, particle: "spark" },
};
const VOID: SlashStyle = {
  core: "#e7d8ff",
  edge: "#f4ecff",
  glow: "#8a4fff",
  particle: "void",
  afterimages: 2,
  gore: { color: "#b98cff", count: 10, spread: 15, particle: "void" },
};
const BLOOD: SlashStyle = {
  core: "#ffd2d2",
  edge: "#ffffff",
  glow: "#d83a3a",
  particle: "blood",
  gore: { color: "#c62828", count: 14, spread: 18, particle: "blood" },
};
const VENOM: SlashStyle = {
  core: "#dcffcf",
  edge: "#f3ffe6",
  glow: "#63cc2e",
  particle: "spark",
  gore: { color: "#7ad83a", count: 11, spread: 16, particle: "spark" },
};

// The signature roster — keyed by UNIQUE_DEFS id (see src/game/defs/uniques.ts,
// world-uniques.ts). A weightier kit (afterimages, heavier gore) reads as a
// bigger, meaner blade. Un-listed uniques and all base weapons fall to
// DEFAULT_SLASH, so the catalog is safe to grow one entry at a time.
export const SLASH_STYLES: Record<string, SlashStyle> = {
  // Holy / light
  excalibur: { ...HOLY, glow: "#ffd94a", weight: 1.15 },
  oathbrand: HOLY,
  durendal: { ...HOLY, core: "#eaf1ff", glow: "#9fd0ff", afterimages: 3 },
  // Storm / lightning
  mjolnir: { ...STORM, weight: 1.2, afterimages: 2 },
  stormlash: STORM,
  skybreaker: STORM,
  // Fire / plasma / meteor
  the_reckoning: FIRE,
  herdbreaker: FIRE,
  worldsplitter: { ...FIRE, glow: "#ff5a1e", weight: 1.2, afterimages: 1 },
  gram: { ...FIRE, core: "#ffe3b0", glow: "#ffae33" },
  // Frost / neutron
  gravemaker: { ...FROST, core: "#d7e6ea", glow: "#5aa0b0", particle: "void" },
  // Void / plasma
  nightfall: VOID,
  // Blood / cursed
  muramasa: { ...BLOOD, afterimages: 2, weight: 1.1 },
  hordebane: { ...BLOOD, glow: "#e04a1e", particle: "ember" },
  the_fallen_standard: { ...BLOOD, glow: "#b23030" },
  // Venom
  kingsbane: VENOM,
  // Scrappy — a small spark, nothing grand
  muskrats_tooth: { core: "#eaf1ff", edge: "#ffffff", particle: "spark" },
};

/** The slash signature for the equipped weapon (by unique id), or the plain one. */
export function slashStyleFor(uniqueId: string | undefined): SlashStyle {
  return (uniqueId && SLASH_STYLES[uniqueId]) || DEFAULT_SLASH;
}

/** The gore a signature weapon throws on a melee hit, or null (plain gore). */
export function goreStyleFor(uniqueId: string | undefined): GoreStyle | null {
  return (uniqueId && SLASH_STYLES[uniqueId]?.gore) || null;
}

// Stable per-speck pseudo-random (a hashed sine) so specks hold their identity
// frame to frame within a swing instead of flickering — Math.random would
// re-roll every frame. Not for gameplay; a look only.
const hash = (n: number) => {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
};

/** Particle base colors — a warm/cool family per kind. */
const PARTICLE_COLOR: Record<ParticleKind, string> = {
  ember: "#ffb038",
  spark: "#eaf2ff",
  frost: "#bfeeff",
  void: "#c79bff",
  mote: "#ffeebb",
  blood: "#c62828",
};

/** A doll-local point rotated about the pivot by `rot`. */
function rot(
  pt: { x: number; y: number },
  piv: { x: number; y: number },
  a: number,
): { x: number; y: number } {
  const dx = pt.x - piv.x;
  const dy = pt.y - piv.y;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: piv.x + dx * c - dy * s, y: piv.y + dx * s + dy * c };
}

export type SlashGeom = {
  /** The shoulder pivot the blade (and slash) rotate about. */
  pivot: { x: number; y: number };
  /** The blade's outer (tip) and inner (hand) points, doll-local. */
  tip: { x: number; y: number };
  base: { x: number; y: number };
  /** Rotation range swept so far (strike start → now). */
  rotFrom: number;
  rotTo: number;
  /** 0..1 overall opacity (fades on recover). */
  alpha: number;
  /** 0..1 swing progress, drives the particle stream. */
  phase: number;
};

/**
 * Draw the styled slash for one swing, in the caller's doll-local/facing space
 * (drawPlayer's transform). The crescent — a ribbon between the tip's arc and
 * the hand's arc — is filled in the style's core color under an optional glow,
 * trailed by ghost crescents, topped by a hot leading edge, and showered with
 * themed specks thrown off the sweeping tip.
 */
export function drawSlash(
  ctx: CanvasRenderingContext2D,
  geom: SlashGeom,
  style: SlashStyle,
): void {
  const { pivot, tip, base, rotFrom, rotTo, alpha } = geom;
  const N = 12;
  const rotAt = (i: number) => rotFrom + (rotTo - rotFrom) * (i / N);

  const ribbon = (from: number, to: number) => {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const a = from + (to - from) * (i / N);
      const q = rot(tip, pivot, a);
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    for (let i = N; i >= 0; i--) {
      const a = from + (to - from) * (i / N);
      const q = rot(base, pivot, a);
      ctx.lineTo(q.x, q.y);
    }
    ctx.closePath();
  };

  ctx.save();

  // Glow: a fatter, dimmer under-crescent bloomed behind the blade.
  if (style.glow) {
    ctx.globalAlpha = 0.28 * alpha;
    ctx.strokeStyle = style.glow;
    ctx.lineJoin = "round";
    ctx.lineWidth = 3 * (style.weight ?? 1);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const q = rot(tip, pivot, rotAt(i));
      if (i === 0) ctx.moveTo(q.x, q.y);
      else ctx.lineTo(q.x, q.y);
    }
    ctx.stroke();
  }

  // Ghost crescents trailing the blade — a heavier swing leaves an echo.
  const ghosts = style.afterimages ?? 0;
  for (let g = ghosts; g >= 1; g--) {
    const back = (rotTo - rotFrom) * 0.16 * g;
    ctx.globalAlpha = 0.12 * alpha;
    ctx.fillStyle = style.core;
    ribbon(rotFrom, Math.max(rotFrom, rotTo - back));
    ctx.fill();
  }

  // The crescent body.
  ctx.globalAlpha = 0.82 * alpha;
  ctx.fillStyle = style.core;
  ribbon(rotFrom, rotTo);
  ctx.fill();

  // The hot leading edge — the blade's current line.
  const tipNow = rot(tip, pivot, rotTo);
  const baseNow = rot(base, pivot, rotTo);
  ctx.globalAlpha = Math.min(1, alpha + 0.05);
  ctx.strokeStyle = style.edge;
  ctx.lineWidth = 1.5 * (style.weight ?? 1);
  ctx.beginPath();
  ctx.moveTo(baseNow.x, baseNow.y);
  ctx.lineTo(tipNow.x, tipNow.y);
  ctx.stroke();

  // Themed specks thrown off the sweeping tip.
  if (style.particle) drawParticles(ctx, geom, style.particle);

  ctx.restore();
  ctx.globalAlpha = 1;
}

/** A stream of themed specks flung off the blade's leading edge. Stateless — a
 * speck's life advances with the swing `phase`, so it flies out and recycles
 * without any per-frame randomness. */
function drawParticles(
  ctx: CanvasRenderingContext2D,
  geom: SlashGeom,
  kind: ParticleKind,
): void {
  const { pivot, tip, rotFrom, rotTo, alpha, phase } = geom;
  const COUNT = kind === "spark" ? 10 : 14;
  const DRIFT = kind === "frost" ? 5 : 8;
  const color = PARTICLE_COLOR[kind];
  const span = rotTo - rotFrom || 0.001;
  for (let i = 0; i < COUNT; i++) {
    const h1 = hash(i + 1);
    const h2 = hash(i + 31);
    const h3 = hash(i + 61);
    // Life recycles across the swing; each speck offset so they don't pulse.
    const life = (phase * 1.6 + h1) % 1;
    // Spawn along the RECENT part of the sweep (near the leading edge).
    const a = rotTo - span * h2 * 0.5;
    const seed = rot(tip, pivot, a);
    // Fly outward from the pivot, with a little sideways scatter.
    const out = a + (h3 - 0.5) * 0.5;
    const d = life * DRIFT + 1;
    let px = seed.x + Math.cos(out) * d;
    let py = seed.y + Math.sin(out) * d;
    if (kind === "ember") py -= life * 3; // embers rise
    const fade = (1 - life) * alpha;
    if (fade <= 0.02) continue;
    ctx.globalAlpha = fade;
    ctx.fillStyle = life < 0.4 ? "#ffffff" : color;
    if (kind === "spark") {
      // A short streak along the flight line.
      ctx.strokeStyle = life < 0.4 ? "#ffffff" : color;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - Math.cos(out) * 2, py - Math.sin(out) * 2);
      ctx.stroke();
    } else {
      const r = kind === "frost" ? 1 : 1 + (1 - life);
      ctx.fillRect(px - r / 2, py - r / 2, r, r);
    }
  }
}

/**
 * Draw a themed gore burst — the colored spray a signature melee blow throws.
 * Called from `drawEffects` for a `burst` effect (world space, screen coords
 * `x`/`y` already resolved). `t` is 0→1 over the burst's life.
 */
export function drawBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  gore: GoreStyle,
  seed: number,
): void {
  const color = gore.particle ? PARTICLE_COLOR[gore.particle] : gore.color;
  ctx.save();
  for (let i = 0; i < gore.count; i++) {
    const h1 = hash(i + seed);
    const h2 = hash(i + seed + 17);
    const ang = h1 * Math.PI * 2;
    const dist = (0.3 + 0.7 * h2) * gore.spread * t;
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist - t * 3; // a little upward lift
    const fade = (1 - t) * (0.7 + 0.3 * h2);
    if (fade <= 0.02) continue;
    ctx.globalAlpha = fade;
    ctx.fillStyle = t < 0.3 ? "#ffffff" : i % 3 === 0 ? gore.color : color;
    const r = 1 + Math.round((1 - t) * 1.5);
    ctx.fillRect(Math.round(px - r / 2), Math.round(py - r / 2), r, r);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
