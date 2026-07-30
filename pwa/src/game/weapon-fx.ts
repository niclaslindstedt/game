// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Signature WEAPON EFFECTS for the field hero's attacks — the styled MELEE
// slash crescent that rides the blade (`drawSlash`, see
// render.ts `drawPlayer`), the RANGED/MAGIC muzzle flash / cast bloom
// (`drawMuzzle`), and the themed gore a melee hit throws (`drawBurst`). Each
// weapon CLASS has a plain base look, and a UNIQUE gets its OWN — Excalibur
// flares holy gold, Mjölnir spits sparks, Muramasa bleeds, Pyrelight casts fire,
// Pale Rider fires a deathly shot — so a named weapon FEELS more powerful than a
// plain one. Purely a render concern (this game's presentation layer); the
// engine carries the weapon's CHOICE of element on the def and draws none of it.
//
// Authoring: set `fx:` on the weapon's own YAML and preview it with the
// weapon-swing script —
//   node pwa/scripts/weapon-swing.mjs poses excalibur   # a melee unique's slash
//   node pwa/scripts/weapon-swing.mjs uniques           # contact sheet of melee slashes
//   node pwa/scripts/weapon-swing.mjs shots             # contact sheet of ranged/magic muzzles
//   node pwa/scripts/weapon-swing.mjs live muramasa     # the slash + its gore
//   node pwa/scripts/weapon-swing.mjs live pyrelight    # the cast bloom
//
// WHICH look a weapon wears is NOT here — it is `fx:` in the weapon's own YAML
// (`UniqueDef.fx`), for the same reason a power's colours live beside its
// numbers: a table keyed by shipped ids means a mod's legendary can only look
// like whichever shipped weapon shares its class. The kits it names are the
// leaf `weapon-elements.ts`; this file is every pixel drawn from them.

import { uniqueDefOrNull, type WeaponFx } from "@game/core";

// The ELEMENT vocabulary — an import-free leaf, because the item pipeline reads
// it too and cannot reach `@game/core` (see the header there). Re-exported so
// every existing importer of this module is unaffected.
import {
  DEFAULT_SLASH,
  MAGIC_SHOT,
  RANGED_SHOT,
  SHOT_ELEMENTS,
  SLASH_ELEMENTS,
  type GoreStyle,
  type ParticleKind,
  type ShotStyle,
  type SlashStyle,
} from "./weapon-elements.ts";

export {
  DEFAULT_SLASH,
  SHOT_ELEMENTS,
  SLASH_ELEMENTS,
  type GoreStyle,
  type ParticleKind,
  type ShotStyle,
  type SlashStyle,
} from "./weapon-elements.ts";

/**
 * The signature look a NAMED weapon wears, built from what its own def says
 * (`UniqueDef.fx` — authored in `content/items/<rarity>/<id>.yaml`).
 *
 * This used to be a table in this file, keyed by unique id, which meant a MOD's
 * legendary could only ever swing the plain class look: its id was not in the
 * table and there was no way for its author to add one. The kits stayed here —
 * they are pixels, and pixels are the app's — but WHICH kit a weapon wears is
 * the weapon's own business, exactly as `AbilityDef.look` is a power's.
 *
 * An unknown element resolves to the plain look rather than throwing: the
 * compile step already refused it, and a render path is the wrong place to take
 * a run down.
 */
function styleFrom<T>(
  fx: WeaponFx | undefined,
  elements: Record<string, T>,
  plain: T,
): T {
  if (!fx) return plain;
  const kit = fx.element ? elements[fx.element] : undefined;

  // PLAIN under KIT under OVERRIDES. The plain look has to stay underneath
  // rather than being replaced: it is what carries the class's own SHAPE (a
  // gun's rays, a wand's bloom), which no element names and every shot needs.
  const style = { ...plain, ...kit } as Record<string, unknown>;
  for (const [k, v] of Object.entries(fx)) {
    // `element` is the choice of kit, not a channel; `undefined` would erase
    // the layer below, so only fields the author actually wrote are folded on.
    if (k !== "element" && v !== undefined) style[k] = v;
  }
  return style as T;
}

/**
 * The `fx:` block of an equipped weapon's named def, if it has one — read from
 * the ACTIVE catalog, so a mod's weapon answers for itself.
 *
 * MEMOIZED, because `shotStyleFor` is called per projectile per frame and
 * building a style object there would allocate through the whole flight of
 * every round on screen. The cache holds the def it was built from and rebuilds
 * when that identity changes, which is exactly when a mod is applied or backed
 * out — so it needs no invalidation hook and cannot serve a stale look.
 */
const styleCache = new Map<
  string,
  { def: unknown; slash: SlashStyle; ranged: ShotStyle; magic: ShotStyle }
>();

function cacheFor(uniqueId: string | undefined) {
  if (!uniqueId) return null;
  const def = uniqueDefOrNull(uniqueId);
  const fx = def?.fx;
  if (!fx) return null;
  const hit = styleCache.get(uniqueId);
  if (hit && hit.def === def) return hit;
  const entry = {
    def,
    slash: styleFrom(fx, SLASH_ELEMENTS, DEFAULT_SLASH),
    ranged: styleFrom(fx, SHOT_ELEMENTS, {
      ...RANGED_SHOT,
      shape: "rays" as const,
    }),
    magic: styleFrom(fx, SHOT_ELEMENTS, {
      ...MAGIC_SHOT,
      shape: "bloom" as const,
    }),
  };
  styleCache.set(uniqueId, entry);
  return entry;
}

/** The slash signature for the equipped weapon (by unique id), or the plain one. */
export function slashStyleFor(uniqueId: string | undefined): SlashStyle {
  return cacheFor(uniqueId)?.slash ?? DEFAULT_SLASH;
}

/** The gore a signature weapon throws on a melee hit, or null (plain gore). */
export function goreStyleFor(uniqueId: string | undefined): GoreStyle | null {
  return slashStyleFor(uniqueId).gore ?? null;
}

// Stable per-speck pseudo-random (a hashed sine) so specks hold their identity
// frame to frame within a swing instead of flickering — Math.random would
// re-roll every frame. Not for gameplay; a look only.
function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

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

// ---- Ranged & magic: the shot signature ------------------------------------
// A gun/wand can't slash, so its signature rides its SHOT instead: the flash at
// the muzzle/wand-tip when it fires (drawMuzzle) and the glow trailing its round
// or bolt in flight (drawProjectileTrail). Each weapon CLASS has a plain base
// look; a UNIQUE overrides it with its element.

/** The shot signature for the equipped weapon, filled with the class default. A
 * base weapon keeps the plain class look; a NAMED unique flares the element its
 * own def names — and a magic unique swells into a `bloom` rather than the base
 * ring. */
export function shotStyleFor(
  uniqueId: string | undefined,
  cls: "ranged" | "magic",
): ShotStyle {
  const styled = cacheFor(uniqueId);
  if (!styled) return cls === "magic" ? MAGIC_SHOT : RANGED_SHOT;
  // The showier shape is what a signature weapon gets for having one at all
  // (magic blooms rather than ringing), so it is applied under the element's
  // colours rather than being authored per weapon.
  return cls === "magic" ? styled.magic : styled.ranged;
}

/**
 * The flash at the muzzle / wand tip when a weapon fires — a gun's ray-burst, a
 * caster's ring or bloom, colored by the weapon's signature. `mx`/`my` is the
 * flash centre (screen coords), `aim` the shot direction, `t` 0→1 over its life.
 */
export function drawMuzzle(
  ctx: CanvasRenderingContext2D,
  mx: number,
  my: number,
  aim: number,
  t: number,
  style: ShotStyle,
): void {
  const fade = 1 - t;
  const w = style.weight ?? 1;
  const shape = style.shape ?? "rays";
  ctx.save();
  if (style.glow) {
    ctx.globalAlpha = 0.5 * fade;
    ctx.fillStyle = style.glow;
    ctx.beginPath();
    ctx.arc(mx, my, (3 + t * 5) * w, 0, Math.PI * 2);
    ctx.fill();
  }
  if (shape === "rays") {
    ctx.globalAlpha = fade;
    ctx.fillStyle = style.core;
    ctx.beginPath();
    ctx.arc(mx, my, (2 + fade * 2) * w, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = style.spark;
    ctx.lineWidth = 1;
    for (const spread of [0, 0.5, -0.5]) {
      const len = (4 + t * 5) * w;
      ctx.beginPath();
      ctx.moveTo(mx, my);
      ctx.lineTo(
        mx + Math.cos(aim + spread) * len,
        my + Math.sin(aim + spread) * len,
      );
      ctx.stroke();
    }
  } else {
    ctx.globalAlpha = 0.9 * fade;
    ctx.strokeStyle = style.spark;
    ctx.lineWidth = shape === "bloom" ? 2 : 1;
    ctx.beginPath();
    ctx.arc(mx, my, (2 + t * 8) * w, 0, Math.PI * 2);
    ctx.stroke();
    if (shape === "bloom") {
      ctx.globalAlpha = 0.7 * fade;
      ctx.fillStyle = style.core;
      ctx.beginPath();
      ctx.arc(mx, my, (2 + t * 3) * w, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalAlpha = fade;
      ctx.fillStyle = style.core;
      ctx.fillRect(mx - 1, my - 1, 2, 2);
    }
  }
  if (style.particle) {
    const color = PARTICLE_COLOR[style.particle];
    for (let i = 0; i < 4; i++) {
      const h1 = hash(i + 1);
      const h2 = hash(i + 9);
      const a = aim + (h1 - 0.5) * 1.2;
      const d = (2 + t * 8 * (0.5 + h2)) * w;
      ctx.globalAlpha = fade * (0.6 + 0.4 * h2);
      ctx.fillStyle = t < 0.3 ? "#ffffff" : color;
      ctx.fillRect(
        Math.round(mx + Math.cos(a) * d),
        Math.round(my + Math.sin(a) * d),
        1,
        1,
      );
    }
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

/**
 * The glow trailing the hero's round / bolt in flight — a soft halo, a hot core,
 * and a short fading tail behind it, in the weapon's signature colors. Drawn
 * UNDER the projectile sprite (screen coords). `dir` is the unit travel vector.
 */
export function drawProjectileTrail(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  dir: { x: number; y: number },
  style: ShotStyle,
): void {
  const w = style.weight ?? 1;
  ctx.save();
  if (style.glow) {
    ctx.globalAlpha = 0.32;
    ctx.fillStyle = style.glow;
    ctx.beginPath();
    ctx.arc(px, py, 3.5 * w, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let i = 3; i >= 1; i--) {
    ctx.globalAlpha = 0.36 * (1 - i / 4);
    ctx.fillStyle = style.spark;
    const d = i * 2.5 * w;
    ctx.fillRect(Math.round(px - dir.x * d), Math.round(py - dir.y * d), 1, 1);
  }
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = style.core;
  ctx.beginPath();
  ctx.arc(px, py, 1.6 * w, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
}
