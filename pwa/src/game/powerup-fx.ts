// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The POWERUP LOOK catalog — one visual kit per powerup, app-side only (the
// engine knows nothing of it, exactly like weapon-fx.ts). A powerup's KIND
// decides what is drawn (a well draws a core, a trail draws burning patches);
// this catalog decides how it LOOKS, so two powers that share a kind read as
// completely different things: the DUST DEVIL is a red grit column that hunts,
// the EVENT HORIZON is a black throat that swallows, and both are `well`.
//
// Every colour is an `r, g, b` triple (no alpha) so the draw code can dial the
// alpha per layer — that is what keeps additive light additive.

/** One powerup's colour kit. */
export type PowerupStyle = {
  /** The power's own hue — rims, rings, arcs. */
  core: string;
  /** The hot inner light (usually a paler version of `core`). */
  hot: string;
  /** The dark that grounds it — a scorch, a throat, a shadow. */
  deep: string;
  /** Motes/embers/grit thrown by the effect. */
  spark: string;
  /**
   * How the well's core reads: `void` swallows (a black throat under a
   * lensing ring, streaks falling IN), `grit` shreds (a spinning dust column,
   * motes flung around it). Only read by the `well` kind.
   */
  wellLook?: "void" | "grit";
};

/** The shipped kits, keyed by ability id. A powerup with no entry falls back
 * to `DEFAULT_POWERUP_STYLE`, so the catalog can grow one power at a time. */
export const POWERUP_STYLES: Record<string, PowerupStyle> = {
  fire_orbs: {
    core: "255, 154, 60",
    hot: "255, 236, 178",
    deep: "72, 24, 8",
    spark: "255, 196, 92",
  },
  stasis_field: {
    core: "140, 214, 235",
    hot: "226, 248, 255",
    deep: "24, 58, 78",
    spark: "198, 240, 255",
  },
  item_magnet: {
    core: "232, 108, 96",
    hot: "255, 208, 168",
    deep: "70, 20, 20",
    spark: "255, 226, 150",
  },
  ion_wake: {
    core: "96, 186, 255",
    hot: "226, 246, 255",
    deep: "12, 34, 62",
    spark: "168, 224, 255",
  },
  blast_shield: {
    core: "108, 180, 255",
    hot: "236, 248, 255",
    deep: "16, 40, 76",
    spark: "200, 232, 255",
  },
  moonfall: {
    core: "206, 214, 226",
    hot: "255, 255, 255",
    deep: "38, 40, 50",
    spark: "232, 238, 248",
  },
  pale_shroud: {
    core: "176, 226, 236",
    hot: "236, 252, 255",
    deep: "26, 48, 58",
    spark: "206, 242, 250",
  },
  dust_devil: {
    core: "206, 132, 84",
    hot: "246, 214, 156",
    deep: "62, 32, 18",
    spark: "232, 176, 112",
    wellLook: "grit",
  },
  reactor_surge: {
    core: "255, 176, 46",
    hot: "255, 246, 214",
    deep: "78, 30, 4",
    spark: "255, 214, 120",
  },
  event_horizon: {
    core: "180, 93, 240",
    hot: "236, 214, 255",
    deep: "8, 4, 16",
    spark: "206, 150, 255",
    wellLook: "void",
  },
  the_unmaking: {
    core: "168, 108, 236",
    hot: "232, 208, 255",
    deep: "14, 8, 26",
    spark: "196, 154, 255",
  },
  dead_mans_hand: {
    core: "124, 198, 255",
    hot: "240, 250, 255",
    deep: "18, 34, 58",
    spark: "196, 232, 255",
  },
  iron_stampede: {
    core: "196, 200, 208",
    hot: "255, 236, 200",
    deep: "44, 40, 40",
    spark: "216, 190, 150",
  },
  continuity_protocol: {
    core: "232, 185, 62",
    hot: "255, 244, 206",
    deep: "62, 44, 8",
    spark: "255, 226, 140",
  },
  sentry_grid: {
    core: "216, 58, 58",
    hot: "255, 226, 182",
    deep: "40, 36, 40",
    spark: "255, 176, 46",
  },
};

/** The kit an un-listed powerup wears — a neutral arcane blue-violet. */
export const DEFAULT_POWERUP_STYLE: PowerupStyle = {
  core: "150, 170, 255",
  hot: "232, 238, 255",
  deep: "18, 20, 40",
  spark: "196, 210, 255",
};

/** The look for `defId` (never null — un-listed powers get the default). */
export function powerupStyle(defId: string): PowerupStyle {
  return POWERUP_STYLES[defId] ?? DEFAULT_POWERUP_STYLE;
}
