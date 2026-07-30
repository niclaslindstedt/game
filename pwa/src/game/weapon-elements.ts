// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ELEMENTS — the shared vocabulary a weapon names to say what it looks like,
// and the only part of the signature-FX system that is not pixels.
//
// It is an IMPORT-FREE LEAF, and that is load-bearing: `scripts/generate-items.mjs`
// reads the element names from here to check every weapon's authored `fx:`, and
// it runs FIRST in the content chain, before the catalog that `weapon-fx.ts`
// (which reaches `@game/core` for a weapon's def) would import. A leaf breaks
// that cycle; putting the names beside the drawing would re-make it.
//
// The kits themselves are the game's house palette — one per element per class,
// so `fx: { element: fire }` means the same fire on a blade and on a gun. The
// drawing that consumes them is `weapon-fx.ts`.

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

// THE ELEMENTS — the shared vocabulary a weapon names to say what it looks
// like, one kit per element per class (the melee half here, the shot half
// below). A weapon picks an element and, if it wants, tweaks a channel; that is
// how the shipped roster was always written, and now it is how it is AUTHORED
// (`fx:` in the item's YAML), so a mod's legendary flares its own element
// instead of swinging the plain class look.
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

// The four elements the SHOT half had and the slash half did not, derived from
// the same palettes below so the vocabulary is symmetric: any element a weapon
// can fire, a blade can also carry. Without them a mod's cosmic sword would
// have had to author six hex values by hand.
const COSMIC: SlashStyle = {
  core: "#eaf1ff",
  edge: "#ffffff",
  glow: "#6a8aff",
  particle: "mote",
  gore: { color: "#9fd0ff", count: 10, spread: 16, particle: "mote" },
};
const DEATH: SlashStyle = {
  core: "#f0f0f2",
  edge: "#ffffff",
  glow: "#7a8090",
  particle: "void",
  gore: { color: "#c0c4d0", count: 10, spread: 15, particle: "void" },
};
const SOLAR: SlashStyle = {
  core: "#fff0c0",
  edge: "#ffffff",
  glow: "#ff9a1e",
  particle: "mote",
  weight: 1.25,
  gore: { color: "#ffcf3a", count: 11, spread: 17, particle: "mote" },
};
const TECH: SlashStyle = {
  core: "#eaffff",
  edge: "#ffffff",
  glow: "#2ad0c0",
  particle: "spark",
  gore: { color: "#7affea", count: 10, spread: 15, particle: "spark" },
};

/** Every element a weapon may name in its `fx:`, and the SLASH kit each one
 * wears on a blade. The shot half is `SHOT_ELEMENTS` below; both are keyed by
 * the same names, so one word covers a weapon of any class. */
export const SLASH_ELEMENTS: Record<string, SlashStyle> = {
  fire: FIRE,
  holy: HOLY,
  frost: FROST,
  storm: STORM,
  void: VOID,
  blood: BLOOD,
  venom: VENOM,
  cosmic: COSMIC,
  death: DEATH,
  solar: SOLAR,
  tech: TECH,
};

/** A ranged/magic weapon's shot signature. */
export type ShotStyle = {
  /** Flash shape: a gun's `rays` starburst, a caster's `ring`, or a soft
   * `bloom`. Defaults per class (ranged → rays, magic → bloom). */
  shape?: "rays" | "ring" | "bloom";
  /** Hot core of the muzzle/cast flash — and the round's glow in flight. */
  core: string;
  /** Rays / ring / trail color. */
  spark: string;
  /** Soft glow behind the flash and around the round in flight. */
  glow?: string;
  /** Motes puffed out of the muzzle. */
  particle?: ParticleKind;
  /** Flash + trail size multiplier (1 = the plain shot). */
  weight?: number;
};

// The plain look each class fires with — a base weapon's (or an enemy's) shot,
// matching the pre-signature look so only NAMED weapons change. A signature
// unique gets the showier `bloom` (magic) via `shotStyleFor`.
/** The plain look a gun fires with — a base weapon's, or an enemy's. */
export const RANGED_SHOT: ShotStyle = {
  shape: "rays",
  core: "#fff2c0",
  spark: "#ffd36b",
};
/** The plain look a wand casts with. */
export const MAGIC_SHOT: ShotStyle = {
  shape: "ring",
  core: "#e6d6ff",
  spark: "#c9a6ff",
  glow: "#8a4fff",
};

// Reusable elemental shot kits — colors only, so the class default supplies the
// shape (rays for a gun, bloom for a wand).
const FLAME_SHOT: ShotStyle = {
  core: "#ffe0a0",
  spark: "#ff7a1e",
  glow: "#ff4a1e",
  particle: "ember",
};
const HOLY_SHOT: ShotStyle = {
  core: "#fff6d6",
  spark: "#ffe08a",
  glow: "#ffd94a",
  particle: "mote",
};
const VOID_SHOT: ShotStyle = {
  core: "#e7d8ff",
  spark: "#9a6bff",
  glow: "#6a2ac0",
  particle: "void",
};
const STORM_SHOT: ShotStyle = {
  core: "#dfe8ff",
  spark: "#8ab0ff",
  glow: "#4a6aff",
  particle: "spark",
};
const COSMIC_SHOT: ShotStyle = {
  core: "#eaf1ff",
  spark: "#9fd0ff",
  glow: "#6a8aff",
  particle: "mote",
};
const FROST_SHOT: ShotStyle = {
  core: "#daf3ff",
  spark: "#8ad8ff",
  glow: "#3a8ad0",
  particle: "frost",
};
const VENOM_SHOT: ShotStyle = {
  core: "#dcffcf",
  spark: "#7ad83a",
  glow: "#3a8a1e",
  particle: "spark",
};
const DEATH_SHOT: ShotStyle = {
  core: "#f0f0f2",
  spark: "#c0c4d0",
  glow: "#7a8090",
  particle: "void",
};
const SOLAR_SHOT: ShotStyle = {
  core: "#fff0c0",
  spark: "#ffcf3a",
  glow: "#ff9a1e",
  particle: "mote",
  weight: 1.25,
};
const TECH_SHOT: ShotStyle = {
  core: "#eaffff",
  spark: "#7affea",
  glow: "#2ad0c0",
  particle: "spark",
};

// The one element the SLASH half had and the shot half did not — a blood-fed
// gun is a perfectly ordinary idea, and the vocabulary has to be symmetric or
// `fx: { element: blood }` means "nothing" on a rifle.
const BLOOD_SHOT: ShotStyle = {
  core: "#ffd2d2",
  spark: "#d83a3a",
  glow: "#8a1e1e",
  particle: "blood",
};

/** Every element a weapon may name in its `fx:`, and the SHOT kit each one
 * wears on a gun or a wand. Keyed exactly like `SLASH_ELEMENTS`, so one word
 * covers a weapon of any class. */
export const SHOT_ELEMENTS: Record<string, ShotStyle> = {
  fire: FLAME_SHOT,
  holy: HOLY_SHOT,
  frost: FROST_SHOT,
  storm: STORM_SHOT,
  void: VOID_SHOT,
  blood: BLOOD_SHOT,
  venom: VENOM_SHOT,
  cosmic: COSMIC_SHOT,
  death: DEATH_SHOT,
  solar: SOLAR_SHOT,
  tech: TECH_SHOT,
};
