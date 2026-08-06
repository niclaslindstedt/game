// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The developer EFFECTS GALLERY (pwa/src/game/effects-gallery/): its catalog must
// cover every visual effect the game ships, each exhibit must ship the icon it
// draws itself with, and every id it stages (weapon, talent, ability, enemy,
// level) must exist. These are the guards that keep the gallery from quietly
// falling behind the game it exists to show — add a signature weapon or a talent
// and the coverage checks below fail until its exhibit appears.

import { readFileSync } from "node:fs";

import {
  ABILITY_DEFS,
  ENEMY_DEFS,
  isWeaponDef,
  LEVELS,
  talentDefs,
  uniqueDef,
  UNIQUE_IDS,
} from "@game/core";
import { describe, expect, it } from "vitest";

import { effectsCatalog } from "../../pwa/src/game/effects-gallery/effects-catalog.ts";
import {
  isDriveExhibit,
  type Exhibit,
} from "../../pwa/src/game/effects-gallery/exhibit-kit.ts";

const EFFECTS = effectsCatalog();
/** The RUN-hosted exhibits — everything the coverage checks below are about.
 * The DRIVE shelf stages a road rather than a `ScenarioSpec` and is covered by
 * its own suite (drive_exhibits_test.ts). */
const STAGED = EFFECTS.filter((e) => !isDriveExhibit(e));

// `effectsCatalog` composes its shelves by filtering the hand-authored list per
// group, so an exhibit whose group is missing from that composition is authored,
// type-checked, and INVISIBLE — it never reaches the gallery, and every check in
// this file passes it by. Assert the shelves instead of trusting the list.
const SHELVES = [
  "IMPACT",
  "MELEE",
  "SHOTS",
  "POWERS",
  "TALENTS",
  "BOSSES",
  "ELITES",
  "WORLD",
  // THE ROAD — hosted by a `DriveState` rather than a run, and composed onto the
  // end of the catalog like every other shelf, so the same "is it actually
  // reachable" check covers it.
  "DRIVE",
];

// The generated sprite-atlas manifest is the shipping sprite inventory.
const sprites = new Set(
  Object.keys(
    JSON.parse(
      readFileSync(
        new URL("../../pwa/src/game/assets/atlas.json", import.meta.url),
        "utf8",
      ),
    ),
  ),
);

/** Every id an exhibit's staging names, so a rename can't leave a dead exhibit
 * behind (`applyScenario` only warns on an unknown id — the gallery would show
 * an empty stage and nobody would know why). */
function stagedIds(exhibit: Exhibit) {
  // A DRIVE exhibit has no `ScenarioSpec` at all — it stages a road rather than
  // a run, and what it plants is checked by driving it (drive_exhibits_test.ts).
  const stage = isDriveExhibit(exhibit) ? {} : (exhibit.stage ?? {});
  return {
    weapons: [stage.weapon].filter(
      (id): id is string => typeof id === "string",
    ),
    talents: Object.keys(stage.talents ?? {}),
    abilities: [...(stage.abilities ?? []), ...(stage.runAbilities ?? [])],
    enemies: (stage.spawns ?? []).map((spawn) => spawn.enemy),
  };
}

describe("effects gallery / catalog hygiene", () => {
  it("every exhibit id is unique", () => {
    const seen = new Set<string>();
    for (const exhibit of EFFECTS) {
      expect(seen.has(exhibit.id), `duplicate exhibit id "${exhibit.id}"`).toBe(
        false,
      );
      seen.add(exhibit.id);
    }
  });

  for (const exhibit of EFFECTS) {
    it(`${exhibit.id} ships its icon`, () => {
      expect(
        sprites.has(exhibit.icon),
        `${exhibit.icon} missing from the atlas — draw ` +
          `content/sprites/icons/${exhibit.icon}.yaml and run \`make assets\``,
      ).toBe(true);
    });
  }

  it("reaches the gallery with every shelf on it", () => {
    const shown = new Set(EFFECTS.map((e) => e.group));
    for (const shelf of SHELVES) {
      expect(shown.has(shelf as (typeof EFFECTS)[number]["group"]), shelf).toBe(
        true,
      );
    }
    // And nothing is on a shelf the composition never assembles.
    for (const exhibit of EFFECTS) {
      expect(SHELVES, exhibit.id).toContain(exhibit.group);
    }
  });

  it("every exhibit carries a label and a blurb", () => {
    for (const exhibit of EFFECTS) {
      expect(exhibit.label.length, exhibit.id).toBeGreaterThan(0);
      expect(exhibit.blurb.length, exhibit.id).toBeGreaterThan(0);
    }
  });

  it("stages only ids that exist", () => {
    for (const exhibit of EFFECTS) {
      const ids = stagedIds(exhibit);
      for (const id of ids.weapons) {
        const known = isWeaponDef(id) || UNIQUE_IDS.includes(id);
        expect(known, `${exhibit.id}: unknown weapon "${id}"`).toBe(true);
      }
      for (const id of ids.talents) {
        expect(
          talentDefs()[id],
          `${exhibit.id}: unknown talent "${id}"`,
        ).toBeDefined();
      }
      for (const id of ids.abilities) {
        expect(
          ABILITY_DEFS[id],
          `${exhibit.id}: unknown ability "${id}"`,
        ).toBeDefined();
      }
      for (const id of ids.enemies) {
        expect(
          ENEMY_DEFS[id],
          `${exhibit.id}: unknown enemy "${id}"`,
        ).toBeDefined();
      }
      if (!isDriveExhibit(exhibit) && exhibit.levelId) {
        expect(
          LEVELS[exhibit.levelId],
          `${exhibit.id}: unknown level`,
        ).toBeDefined();
      }
    }
  });
});

describe("effects gallery / coverage", () => {
  // A signature look is reachable in play only through the weapon that wears
  // it, so the gallery covers exactly the styles whose weapon can use them.
  const weaponOf = (id: string) => {
    const def = uniqueDef(id);
    return def.slot === "weapon" && isWeaponDef(def.base) ? def.base : null;
  };
  // Every weapon that AUTHORS a signature (`fx:` in its own YAML) must be on a
  // shelf. Read from the catalog rather than from a list in the app, which is
  // the whole point of the look living on the def: add `fx:` to a weapon and
  // its exhibit appears, or this fails.
  const styled = UNIQUE_IDS.filter((id) => uniqueDef(id).fx !== undefined);

  it("has signatures to cover, or this suite proves nothing", () => {
    expect(styled.length).toBeGreaterThan(20);
  });

  for (const id of styled) {
    it(`signature ${id} has an exhibit`, () => {
      // A signature on something that is not a weapon can never play, so there
      // would be nothing to show — the schema refuses one anyway.
      const base = weaponOf(id);
      expect(base === null || STAGED.some((e) => e.stage?.weapon === id)).toBe(
        true,
      );
    });
  }

  for (const def of Object.values(talentDefs())) {
    it(`talent ${def.id} has an exhibit`, () => {
      expect(
        STAGED.some((e) => e.stage?.talents?.[def.id] !== undefined),
        `no exhibit trains ${def.id} — see gallery/talent-exhibits.ts`,
      ).toBe(true);
    });
  }

  it("covers every timed powerup", () => {
    const timed = Object.values(ABILITY_DEFS).filter((def) => !def.nuke);
    for (const def of timed) {
      expect(
        STAGED.some((e) => e.stage?.runAbilities?.includes(def.id)),
        `no exhibit runs the ${def.id} powerup`,
      ).toBe(true);
    }
  });
});
