// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Weapon arsenal sheet (see the `weapon-system` skill): renders ONE image —
// assets-preview/weapon-sheet.png — with a row per weapon def: its inventory
// icon and projectile sprite at 4×, its name, and a stat caption (levelReq,
// class, damage/cadence, behaviors), grouped by level pool with the specials
// at the end. The single eyes-on surface for "does the whole arsenal read":
// icon silhouettes, projectile sprites, and the stat ladder side by side.
// Run `make assets` first if grids changed (this renders from the same
// sprite-data source, so it never disagrees with the atlas).
//
//   node scripts/weapon-sheet.mjs && open website/assets-preview/weapon-sheet.png

import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { renderText } from "./asset-tools/font.mjs";
import { writePng } from "./asset-tools/preview.mjs";
import { blit, createSurface, fill, upscale } from "./asset-tools/surface.mjs";
import { gridToSurface } from "./asset-tools/grid.mjs";
import { SPRITES, SPRITE_PALETTES } from "./sprite-data/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..");

const {
  WEAPON_DEFS,
  weaponAssumedTargets,
  weaponCritMult,
  weaponDamageVariance,
} = await import(path.join(root, "src/game/defs/equipment.ts"));
const { LEVELS, LEVEL_ORDER } = await import(
  path.join(root, "src/game/defs/levels/index.ts")
);

// The catalog average IS the mean of the weapon's range; the band half-width
// comes from the variance model, so the sheet shows the same "8-12" the item
// card does.
const dmgRange = (def) => {
  const v = weaponDamageVariance(def);
  return {
    min: Math.round(def.damage * (1 - v)),
    max: Math.round(def.damage * (1 + v)),
  };
};

const SCALE = 4;
const ROW_H = 12 * SCALE + 10;
const ICON_X = 8;
const SHOT_X = ICON_X + 12 * SCALE + 12;
const TEXT_X = SHOT_X + 8 * SCALE + 16;
const WIDTH = 620;
const BG = [24, 26, 38, 255];
const HEADER = [126, 240, 200, 255];
const NAME = [230, 232, 235, 255];
const STAT = [154, 163, 173, 255];
const WARN = [224, 106, 106, 255];

const spriteSurface = (name) => {
  const grid = SPRITES[name];
  return grid ? gridToSurface(grid, SPRITE_PALETTES[name]) : null;
};

/** The sheet's row groups: each level's pool (sorted by levelReq) — the
 * generated exceptional/elite versions of its bases folded in, since they
 * drop from the same pool (defs/grades.ts) — then every weapon in no pool:
 * the starters, signatures, and trophies. */
const groups = [];
const pooled = new Set();
for (const levelId of LEVEL_ORDER) {
  const level = LEVELS[levelId];
  if (!level) continue;
  const poolIds = new Set(level.loot.weaponPool);
  const defs = Object.values(WEAPON_DEFS)
    .filter((d) => poolIds.has(d.gradeBase ?? d.id))
    .sort((a, b) => a.levelReq - b.levelReq);
  defs.forEach((d) => pooled.add(d.id));
  groups.push({ title: `${level.name} — BASE POOL`, defs });
}
groups.push({
  title: "SPECIALS (STARTERS, SIGNATURES, TROPHIES)",
  defs: Object.values(WEAPON_DEFS)
    .filter((d) => !pooled.has(d.id))
    .sort((a, b) => a.levelReq - b.levelReq),
});

const rows = groups.reduce((n, g) => n + g.defs.length, 0);

// ---- Text list mode --------------------------------------------------------
// `--list` (or `--md`) skips the image and prints a full markdown catalog of
// the arsenal — every weapon with its rolled DAMAGE RANGE, cadence, effective
// DPS, and behaviors, grouped exactly as the sheet is, plus a per-class
// coverage ladder across levelReq 1-100. The single textual answer to "what
// weapons do we have, and is the 1-100 climb covered for each playstyle".
if (process.argv.includes("--list") || process.argv.includes("--md")) {
  const behaviorsOf = (def) => {
    const p = def.projectile;
    return [
      p?.count && `×${p.count} spread ${p.spreadDeg}°`,
      p?.pierce && `pierce ${p.pierce}`,
      p?.homing && "homing",
      p?.chain && `chain ${p.chain}`,
      !p && def.sweepDeg && `sweep ${def.sweepDeg}°`,
    ]
      .filter(Boolean)
      .join(", ");
  };
  const out = [];
  out.push("# Arsenal — full weapon list\n");
  out.push(
    "Damage is the range each blow rolls (crits multiply the rolled value). " +
      "EFF is the damage-budget model's effective DPS (per-target × assumed " +
      "targets × crit lift).\n",
  );
  for (const group of groups) {
    out.push(`\n## ${group.title}\n`);
    out.push(
      "| req | class | name | dmg | cadence | dps | eff | range | behaviors |",
    );
    out.push("| --: | :-- | :-- | :-- | --: | --: | --: | --: | :-- |");
    for (const def of group.defs) {
      const { min, max } = dmgRange(def);
      const dps = Math.round((def.damage * 1000) / def.cooldownMs);
      const eff = Math.round(
        dps *
          weaponAssumedTargets(def) *
          (1 + 0.15 * (weaponCritMult(def) - 1)),
      );
      out.push(
        `| ${def.levelReq} | ${def.class} | ${def.name} | ${min}-${max} | ${def.cooldownMs}ms | ${dps} | ${eff} | ${def.range} | ${behaviorsOf(def)} |`,
      );
    }
  }
  // Per-class coverage ladder — every pool weapon (bases + grade variants),
  // sorted by requirement, so a thin stretch for a playstyle is visible.
  out.push("\n## Coverage ladder by class (pool weapons, by levelReq)\n");
  const byClass = { melee: [], ranged: [], magic: [] };
  for (const def of Object.values(WEAPON_DEFS)) {
    if (pooled.has(def.id)) byClass[def.class].push(def);
  }
  for (const [cls, defs] of Object.entries(byClass)) {
    defs.sort((a, b) => a.levelReq - b.levelReq);
    out.push(
      `- **${cls}** (${defs.length}): ` +
        defs.map((d) => `${d.name.toLowerCase()}(${d.levelReq})`).join(" → "),
    );
  }
  console.log(out.join("\n"));
  process.exit(0);
}

const sheet = createSurface(WIDTH, groups.length * 24 + rows * ROW_H + 16);
fill(sheet, BG);

let y = 8;
for (const group of groups) {
  blit(sheet, upscale(renderText(group.title, HEADER), 2), ICON_X, y);
  y += 24;
  for (const def of group.defs) {
    const icon = spriteSurface(def.icon);
    if (icon) blit(sheet, upscale(icon, SCALE), ICON_X, y);
    const shotName = def.projectile?.sprite;
    const shot = shotName ? spriteSurface(shotName) : null;
    if (shot) {
      blit(sheet, upscale(shot, SCALE), SHOT_X, y + 2 * SCALE);
    }
    const p = def.projectile;
    const behaviors = [
      p?.count && `X${p.count} SPREAD`,
      p?.pierce && `PIERCE ${p.pierce}`,
      p?.homing && "HOMING",
      p?.chain && `CHAIN ${p.chain}`,
      !p && def.sweepDeg && `SWEEP ${def.sweepDeg}`,
    ]
      .filter(Boolean)
      .join("  ");
    const dps = Math.round((def.damage * 1000) / def.cooldownMs);
    // The budget model's number: per-target dps × targets × crit lift.
    const eff = Math.round(
      dps * weaponAssumedTargets(def) * (1 + 0.15 * (weaponCritMult(def) - 1)),
    );
    const { min, max } = dmgRange(def);
    blit(sheet, upscale(renderText(def.name, NAME), 2), TEXT_X, y + 2);
    blit(
      sheet,
      upscale(
        renderText(
          `REQ ${def.levelReq}  ${def.class.toUpperCase()}  DMG ${min}-${max}  ${def.cooldownMs}MS  DPS ${dps}  EFF ${eff}  RANGE ${def.range}`,
          STAT,
        ),
        2,
      ),
      TEXT_X,
      y + 16,
    );
    if (behaviors) {
      blit(sheet, upscale(renderText(behaviors, STAT), 2), TEXT_X, y + 30);
    }
    // Loud markers for the two mistakes a sheet exists to catch.
    if (!icon) {
      blit(
        sheet,
        upscale(renderText("MISSING ICON " + def.icon, WARN), 2),
        ICON_X,
        y + 16,
      );
    }
    if (shotName && !shot) {
      blit(
        sheet,
        upscale(renderText("MISSING SHOT " + shotName, WARN), 2),
        SHOT_X,
        y + 16,
      );
    }
    y += ROW_H;
  }
}

const outDir = path.join(here, "../website/assets-preview");
mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, "weapon-sheet.png");
await writePng(sheet, out);
console.log(`wrote ${rows} weapons → ${out}`);
