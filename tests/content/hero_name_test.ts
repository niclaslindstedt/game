// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE HERO'S NAME IN THE SHIPPED CAMPAIGN.
//
// The player names their character, and the game says it: `{HERO}` is written
// wherever an authored line means that name, and every surface that draws
// authored text resolves it (`engine/game/hero-name.ts`). Two things can go wrong
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
  CACHE_TOKEN,
  COMPANION_DEFS,
  CONVERSATION_DEFS,
  CUTSCENE_DEFS,
  ENEMY_DEFS,
  HERO_NAME_FALLBACK,
  HERO_NAME_TOKEN,
  LEVELS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  resolveCacheLine,
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

/**
 * EVERY TOKEN AUTHORED CONTENT MAY WRITE.
 *
 * The braces are a closed vocabulary, not a free-form template language: a line
 * may say the hero's name, and Ruth's handover may say whichever chest the
 * difficulty pays (`{CACHE}` — engine/game/cache.ts). Anything else brace-shaped
 * is a typo that ships as `?SOMETHING?` in a font with no brace glyph, which is
 * what the first assertion below exists to catch.
 *
 * ADD A TOKEN HERE WHEN YOU ADD ONE TO THE GAME. Leaving it out fails the
 * malformed-token check, which is the intended failure: a new token is a new
 * thing every surface that draws authored text has to resolve, and this list is
 * where that decision is recorded.
 */
const TOKENS = [HERO_NAME_TOKEN, CACHE_TOKEN];

/** Anything brace-shaped — a token, or a near miss pretending to be one. */
const BRACED = ALL.filter((s) => s.text.includes("{") || s.text.includes("}"));

/** The lines that say the HERO'S NAME, which is what most of this suite is
 * about — distinct from "has a brace in it" now that there is more than one
 * token, and the distinction is load-bearing for the scarcity assertion. */
const NAMED = ALL.filter((s) => s.text.includes(HERO_NAME_TOKEN));

describe("the hero's name in authored content", () => {
  it("finds strings to check at all (the walk still reaches the catalogs)", () => {
    // A refactor that renamed a catalog export would otherwise turn every
    // assertion below into a vacuous pass over an empty list.
    expect(ALL.length).toBeGreaterThan(1000);
  });

  it("writes a known token exactly, everywhere a brace appears", () => {
    const malformed = BRACED.filter((s) => {
      let text = s.text;
      for (const token of TOKENS) text = text.split(token).join("");
      return text.match(/[{}]/) !== null;
    });
    expect(malformed.map((s) => `${s.path}: ${s.text}`)).toEqual([]);
  });

  it("leaves no brace behind once every token is resolved", () => {
    for (const { text } of BRACED) {
      // Both resolvers, because a page may carry either token and the box runs
      // both over it. `resolveCacheLine` takes a whole page and may DROP one
      // (a rung that pays no chest), which is a resolution too.
      const named = withHeroName(text, "ZOLTAN");
      expect(resolveCacheLine([named], "medium")?.[0] ?? "").not.toMatch(
        /[{}]/,
      );
    }
    for (const { text } of NAMED) {
      expect(withHeroName(text)).toContain(HERO_NAME_FALLBACK);
    }
  });

  it("is said out loud in exactly the five lines the script spends it on", () => {
    // Every line that says the name OUT LOUD — the hero's own speaker labels
    // (thought `speaker`, a cutscene actor's `name`) are the box's header
    // rather than a line, so they are excluded by asking for pages of text.
    const spoken = NAMED.filter(
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
