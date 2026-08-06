// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO'S NAME IN THE SHIPPED CAMPAIGN.
//
// The player names their character, and the game says it: `{HERO}` is written
// wherever an authored line means that name, and every surface that draws
// authored text resolves it (`src/game/hero-name.ts`). Two things can go wrong
// with a token, and only one of them is loud on its own:
//
//  1. A MALFORMED token — `{hero}`, `{ HERO }`, `{NAME}` — resolves to nothing
//     and prints in the game's pixel font, which has no brace glyph, as
//     `?HERO?`. Nothing else in the catalogs refuses it, so this suite does.
//  2. The handful of lines that SAY the name are a story beat, not a
//     formatting detail (see `docs/manuscript.md` → "The hero's name"): almost
//     nobody in the campaign knows the man, and the scarcity is what makes the
//     name land. Another voice picking it up is a change to the story, so it
//     is asserted here rather than left to a reviewer to notice.

import { describe, expect, it } from "vitest";

import {
  COMPANION_DEFS,
  CONVERSATION_DEFS,
  CUTSCENE_DEFS,
  ENEMY_DEFS,
  HERO_NAME_FALLBACK,
  HERO_NAME_TOKEN,
  LEVELS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  STORY_ITEM_DEFS,
  THOUGHT_DEFS,
  withHeroName,
} from "@game/core";

/** Every catalog that carries a line somebody says, reads or thinks. */
const CATALOGS: Record<string, unknown> = {
  enemies: ENEMY_DEFS,
  levels: LEVELS,
  cutscenes: CUTSCENE_DEFS,
  thoughts: THOUGHT_DEFS,
  storyItems: STORY_ITEM_DEFS,
  companions: COMPANION_DEFS,
  quests: QUEST_DEFS,
  questGivers: QUEST_GIVER_DEFS,
  conversations: CONVERSATION_DEFS,
};

/** Every string in a catalog, with the path it was found at. */
function strings(
  node: unknown,
  path: string,
): { path: string; text: string }[] {
  if (typeof node === "string") return [{ path, text: node }];
  if (Array.isArray(node)) {
    return node.flatMap((item, i) => strings(item, `${path}[${i}]`));
  }
  if (node && typeof node === "object") {
    return Object.entries(node).flatMap(([key, value]) =>
      strings(value, `${path}.${key}`),
    );
  }
  return [];
}

const ALL = Object.entries(CATALOGS).flatMap(([name, catalog]) =>
  strings(catalog, name),
);

/** Anything brace-shaped — the token itself, or a near miss pretending to be. */
const BRACED = ALL.filter((s) => s.text.includes("{") || s.text.includes("}"));

describe("the hero's name in authored content", () => {
  it("finds strings to check at all (the walk still reaches the catalogs)", () => {
    // A refactor that renamed a catalog export would otherwise turn every
    // assertion below into a vacuous pass over an empty list.
    expect(ALL.length).toBeGreaterThan(1000);
  });

  it("writes the token exactly, everywhere a brace appears", () => {
    const malformed = BRACED.filter(
      (s) => s.text.split(HERO_NAME_TOKEN).join("").match(/[{}]/) !== null,
    );
    expect(malformed.map((s) => `${s.path}: ${s.text}`)).toEqual([]);
  });

  it("leaves no brace behind once the name is put in", () => {
    for (const { text } of BRACED) {
      expect(withHeroName(text, "ZOLTAN")).not.toMatch(/[{}]/);
      expect(withHeroName(text)).toContain(HERO_NAME_FALLBACK);
    }
  });

  it("is said out loud in exactly the five lines the script spends it on", () => {
    // Every line that says the name OUT LOUD — the hero's own speaker labels
    // (thought `speaker`, a cutscene actor's `name`) are the box's header
    // rather than a line, so they are excluded by asking for pages of text.
    const spoken = BRACED.filter(
      (s) => !/\.(speaker|name)$/.test(s.path) && s.text !== HERO_NAME_TOKEN,
    ).map((s) => s.path.replace(/\[\d+\]/g, "[]"));
    expect(spoken.sort()).toEqual(
      [
        // THE ARCHITECT, his old bench partner, greeting him on the HQ floor.
        "enemies.architect.dialogue[][]",
        // THE BRO SUPERCORE, which has held his file since it took his job.
        "enemies.bro_supercore.dialogue[][]",
        // RUTH, Ada's mother, letting herself into his garage.
        "conversations.ruth_arrival.nodes[].say[]",
        // The LAB SCIENTIST who ate lunch beside him for six years, on the
        // second of the three blows he refuses to answer.
        "thoughts.goodco_second_blow.pages[].them[]",
        // …and the one voice that is nobody else's: HIS OWN, snapping at
        // himself to stop farming and go find Ada.
        "thoughts.cap_pathetic_1.pages[][]",
      ].sort(),
    );
  });

  it("heads the hero's own pages with the name rather than a pronoun", () => {
    // Every pinned beat is his own voice, so every one of them is headed by
    // the token — a thought that hard-coded a name would print somebody else's
    // over the player's words.
    for (const [id, def] of Object.entries(THOUGHT_DEFS)) {
      expect(`${id}: ${def.speaker}`).toBe(`${id}: ${HERO_NAME_TOKEN}`);
    }
    // …and so is his half of every cutscene he is staged in.
    for (const [id, def] of Object.entries(CUTSCENE_DEFS)) {
      const hero = def.actors.find((actor) => actor.id === "hero");
      if (!hero?.name) continue;
      expect(`${id}: ${hero.name}`).toBe(`${id}: ${HERO_NAME_TOKEN}`);
    }
  });
});
