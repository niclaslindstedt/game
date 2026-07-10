// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Character import/export: a signed archive round-trips, and a hand-edited one
// is rejected by the signature check (the anti-cheat speed bump). See
// website/src/game/character-transfer.ts.

import { createZip, readZip } from "@niclaslindstedt/oss-framework/zip";
import { describe, expect, it } from "vitest";

import type { Character } from "../website/src/game/characters.ts";
import {
  packCharacter,
  unpackCharacter,
} from "../website/src/game/character-transfer.ts";

const NOW = 1_700_000_000_000;

function sampleCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-abc",
    name: "ADA",
    hardcore: true,
    createdAt: NOW - 5000,
    dead: false,
    loadout: {
      level: 12,
      xp: 3400,
      stats: { power: 4, agility: 3, vitality: 5, focus: 2 },
      equipment: {
        weapon: {
          id: 0,
          defId: "blaster",
          slot: "weapon",
          tier: "regular",
          ilvl: 1,
          affixes: [],
        },
        head: null,
        chest: null,
        legs: null,
        feet: null,
        charm: null,
        bag: null,
      },
      inventory: [],
      heldAbilities: [],
      coins: 50,
      companions: [],
    },
    clears: ["easy:landing", "easy:hq"],
    beaten: ["easy"],
    storySeen: ["easy:landing"],
    ...overrides,
  } as Character;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

describe("character import/export", () => {
  it("round-trips a signed archive", async () => {
    const original = sampleCharacter();
    const bytes = await packCharacter(original, NOW);
    const restored = await unpackCharacter(bytes);

    expect(restored.name).toBe("ADA");
    expect(restored.hardcore).toBe(true);
    expect(restored.loadout?.level).toBe(12);
    expect(restored.clears).toEqual(["easy:landing", "easy:hq"]);
    expect(restored.beaten).toEqual(["easy"]);
    expect(restored.storySeen).toEqual(["easy:landing"]);
  });

  it("rejects a hand-edited character (signature mismatch)", async () => {
    const bytes = await packCharacter(sampleCharacter(), NOW);
    const entries = await readZip(bytes);
    const manifest = entries.find((e) => e.name === "manifest.json")!;
    const character = entries.find((e) => e.name === "character.json")!;

    // Cheat: bump the level in the payload but keep the original signature.
    const edited = JSON.parse(dec.decode(character.data)) as Character;
    edited.loadout!.level = 99;
    const tampered = await createZip([
      manifest,
      { name: "character.json", data: enc.encode(JSON.stringify(edited)) },
    ]);

    await expect(unpackCharacter(tampered)).rejects.toThrow(/verified/i);
  });

  it("rejects a file that isn't an archive", async () => {
    await expect(
      unpackCharacter(enc.encode("not a zip at all")),
    ).rejects.toThrow();
  });
});
