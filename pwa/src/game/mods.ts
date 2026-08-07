// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// MODS — the web side of Steam Workshop content. Steam builds only.
//
// A mod reaches this module as a `ModBundle`: plain JSON, already compiled and
// already validated by `mod/tools/build.mjs` in the shell's main process. The
// page never sees a mod's YAML, never reads a file, and never runs a line of
// anything a mod shipped. That is the security story in one sentence, and it is
// why the format has no scripting hook: subscribing to a mod must not mean
// running a stranger's code.
//
// Applying one is two moves, and the engine already had the seam for both:
//
//  1. **The catalogs** go in through `registerDefs` — the same hook the engine
//     test suites use to run against synthetic fixtures. It replaces the ACTIVE
//     registry that every `levelDef` / `enemyDef` accessor reads, so a mod's
//     monster is looked up by exactly the code that looks up a shipped one.
//  2. **The sprites** are merged into the loaded sprite record, which is a
//     plain `Record<name, ImageBitmap>` the renderer reads through
//     `spriteByName`. A mod's frames become ImageBitmaps like the atlas's own
//     and the renderer cannot tell them apart.
//
// The one rule that governs everything here: **A MOD IS APPLIED TO A RUN, NEVER
// TO A SAVE.** The catalogs are global mutable state, so a mod loaded for one
// run is still loaded in the menus afterwards — and a hero who levelled on a
// mod's map, wearing a mod's drop, must not become a corrupt roster entry the
// day the player unsubscribes. So a mod is applied when a run starts and
// `restoreBaseDefs()` puts the shipped catalogs back when it ends, and a hero
// remembers which mod they were made under (`ModStamp`) rather than the mod's
// content being folded into them.

import {
  ABILITY_DEFS,
  CAP_THOUGHT_IDS,
  COMPANION_DEFS,
  CUTSCENE_DEFS,
  DIFFICULTY_DEFS,
  ENEMY_DEFS,
  GEAR_DEFS,
  LEVELS,
  MAP_BLUEPRINTS,
  QUEST_DEFS,
  QUEST_GIVER_DEFS,
  SET_DEFS,
  STORY_ITEM_DEFS,
  TALENT_DEFS,
  THOUGHT_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  registerDefs,
  type DefOverrides,
} from "@game/core";

import type { ChiptuneTrack } from "@ui/lib/chiptune.ts";

import { synth } from "./audio.ts";
import type { Sprites } from "./assets.ts";
import {
  setModTracks,
  setRecordedTracks,
  type RecordedTrack,
} from "./music/index.ts";
import {
  setCueCatalog,
  setSoundCatalog,
  SHIPPED_CUE_KEYS,
  SHIPPED_SOUNDS,
  SHIPPED_SOUND_KEYS,
} from "./sfx/index.ts";
import {
  clearSamples,
  setSamples,
  warmSamples,
  type LoadedSample,
} from "./sfx/samples.ts";
import { setUiSoundCatalog, SHIPPED_UI_SOUNDS } from "./sfx/ui.ts";
import {
  clearSpriteClips,
  setSpriteClips,
  type ClipState,
  type SpriteClip,
  type SpriteClips,
} from "./render/clips.ts";
import type { SoundCatalog, SoundDef } from "./sfx/types.ts";
import {
  setActiveDefs,
  setActiveMods,
  type ModBundle,
  type ModClash,
  type ModSprite,
  type ModStamp,
} from "./mod-state.ts";

export {
  activeMods,
  isModActive,
  modClashes,
  type ModBundle,
  type ModClash,
  type ModSample,
  type ModSprite,
  type ModStamp,
} from "./mod-state.ts";

/** The bundle format this build understands, mirroring `BUNDLE_FORMAT` in
 * mod/tools/build.mjs. A bundle from a newer game is refused with a readable
 * reason rather than half-loaded. The pair is pinned by
 * `tests/content/mod_build_test.ts` — they drifted apart once, and a number
 * this side that is one behind the compiler's refuses every mod there is. */
export const SUPPORTED_BUNDLE_FORMAT = 2;

/**
 * Why a bundle was refused. Kept as a code rather than a sentence because the
 * MODS screen renders it and the log records it, and those want different
 * lengths of the same fact.
 */
export type ModRejection = "format" | "empty";

export function bundleProblem(bundle: ModBundle): ModRejection | null {
  if (bundle.formatVersion !== SUPPORTED_BUNDLE_FORMAT) return "format";
  // EVERY catalog counts, and the list must match the compiler's own `adds`
  // check: a mod that adds only sounds, only powers or only story compiles fine,
  // so refusing it here as "empty" would be the page disagreeing with the
  // compiler about what a mod is.
  const adds =
    bundle.levels.length +
    [
      bundle.blueprints,
      bundle.enemies,
      bundle.weapons,
      bundle.gear,
      bundle.uniques,
      bundle.sounds,
      bundle.music,
      bundle.powerups,
      bundle.talents,
      bundle.companions,
      bundle.sets,
      bundle.difficulties,
      bundle.cutscenes,
      bundle.thoughts,
      bundle.storyItems,
      bundle.quests,
    ].reduce((n, catalog) => n + Object.keys(catalog ?? {}).length, 0) +
    // A mod whose whole contribution is a folder of recordings — the point of
    // shipping real audio at all — adds nothing to any catalog above. Nor does
    // one whose contribution is a recorded soundtrack, an ART PACK that redraws
    // the game's bodies, or a pack that only re-times how they move.
    (bundle.samples?.length ?? 0) +
    (bundle.musicSamples?.length ?? 0) +
    bundle.sprites.length +
    Object.keys(bundle.clips ?? {}).length;
  return adds === 0 ? "empty" : null;
}

// ---------------------------------------------------------------------------
// The base catalogs, captured once so a mod can always be backed out.
//
// This is captured LAZILY on the first apply rather than at module load: at
// load time the engine's own catalogs are the active ones, but so is anything
// a previous apply left behind if this module were ever re-imported. Reading
// them at the moment of the first apply is the only point at which "the
// shipped catalogs" is unambiguous.
// ---------------------------------------------------------------------------
let baseDefs: DefOverrides | null = null;
let baseSprites: Sprites | null = null;

/**
 * Apply a STACK of compiled mods to the engine and the sprite set, in load
 * order.
 *
 * THE ORDER IS THE WHOLE POINT, and it is the answer to a question the compiler
 * cannot answer. Each mod is compiled ALONE — its author never saw the other
 * mods a player happens to have — so a clash between two mods is not something
 * validation can catch the way a clash with the base game is. It has to be
 * resolved at load, by a rule the player can see and change: **later wins**.
 * The last mod in the order has the final say on any id two of them define, for
 * levels, enemies and sprites alike, so "move it down to make it win" is one
 * rule covering every kind of content.
 *
 * Every override is recorded rather than performed silently (`ModClash`), so
 * the MODS screen can say which mod is currently drawing a sprite two mods both
 * ship — the single most confusing thing about a modded install.
 *
 * @param bundles  the enabled mods, in load order (earliest first)
 * @param sprites  the loaded sprite record, mutated in place — the renderer
 *                 holds this exact object, so a copy would draw nothing
 * @returns the stamps to write onto any hero played under them
 */
export async function applyMods(
  bundles: ModBundle[],
  sprites: Sprites,
): Promise<ModStamp[]> {
  // The shipped catalogs, read from the engine itself rather than passed in:
  // a caller that had to supply them would have to import `@game/core` to get
  // them, and every caller here is a menu on the startup path.
  if (!baseDefs) {
    baseDefs = {
      levels: LEVELS,
      blueprints: MAP_BLUEPRINTS,
      enemies: ENEMY_DEFS,
      weapons: WEAPON_DEFS,
      gear: GEAR_DEFS,
      uniques: UNIQUE_DEFS,
      abilities: ABILITY_DEFS,
      talents: TALENT_DEFS,
      companions: COMPANION_DEFS,
      cutscenes: CUTSCENE_DEFS,
      thoughts: THOUGHT_DEFS,
      capThoughts: CAP_THOUGHT_IDS,
      sets: SET_DEFS,
      difficulties: DIFFICULTY_DEFS,
      storyItems: STORY_ITEM_DEFS,
      quests: QUEST_DEFS,
      questGivers: QUEST_GIVER_DEFS,
    };
  }
  if (!baseSprites) baseSprites = { ...sprites };

  // Every apply starts from the SHIPPED catalogs, never from whatever the last
  // one left behind. Merging onto the live registry would make the result
  // depend on the order runs were started in, so disabling a mod would not
  // actually remove its content until a relaunch.
  const levels: Record<string, unknown> = { ...(baseDefs.levels ?? {}) };
  const blueprints: Record<string, unknown> = {
    ...(baseDefs.blueprints ?? {}),
  };
  const enemies: Record<string, unknown> = { ...(baseDefs.enemies ?? {}) };
  const weapons: Record<string, unknown> = { ...(baseDefs.weapons ?? {}) };
  const gear: Record<string, unknown> = { ...(baseDefs.gear ?? {}) };
  const uniques: Record<string, unknown> = { ...(baseDefs.uniques ?? {}) };
  const abilities: Record<string, unknown> = { ...(baseDefs.abilities ?? {}) };
  const talents: Record<string, unknown> = { ...(baseDefs.talents ?? {}) };
  const companions: Record<string, unknown> = {
    ...(baseDefs.companions ?? {}),
  };
  const sets: Record<string, unknown> = { ...(baseDefs.sets ?? {}) };
  // THE RULES start EMPTY rather than from the shipped catalog, unlike every
  // other line here — because the script registry holds OVERRIDES only. The
  // shipped `content/scripts/*.lua` live under it permanently (the host falls
  // through to them for a file, and for a HOOK, no mod took over), which is
  // also what makes a broken override recoverable instead of fatal.
  const scripts: Record<string, unknown> = {};
  // The ladder's rungs are MERGED per rung, not replaced: a mod supplies a name
  // and a tagline, and everything else about the rung — the mob multipliers,
  // the xp rates, the mercy curves, the starting weapon — is the game's economy
  // and stays exactly as it shipped.
  const difficulties: Record<string, unknown> = Object.fromEntries(
    Object.entries(baseDefs.difficulties ?? {}).map(([id, def]) => [
      id,
      { ...def },
    ]),
  );
  const cutscenes: Record<string, unknown> = { ...(baseDefs.cutscenes ?? {}) };
  const thoughts: Record<string, unknown> = { ...(baseDefs.thoughts ?? {}) };
  const storyItems: Record<string, unknown> = {
    ...(baseDefs.storyItems ?? {}),
  };
  const quests: Record<string, unknown> = { ...(baseDefs.quests ?? {}) };
  const questGivers: Record<string, unknown> = {
    ...(baseDefs.questGivers ?? {}),
  };
  // The cap-farm rotation is a LIST, not a catalog: there is no merging two
  // orders, so the last mod that authors one owns it and the shipped rotation
  // stands until then. `setThoughtDefs` drops any id the merged catalog lacks,
  // so a conversion that replaces the thoughts can't leave it pointing at lines
  // that no longer exist.
  let capThoughts: readonly string[] = baseDefs.capThoughts ?? [];
  const sounds: SoundCatalog = { ...SHIPPED_SOUNDS };
  const soundKeys: Record<string, string> = { ...SHIPPED_SOUND_KEYS };
  // THE INTERFACE'S BANK IS A SECOND CATALOG, not a slice of the first: the
  // menus keep the `ui_*` sounds in their own chunk so a title screen does not
  // download the combat bank to click a button. A mod merges into both, or
  // `sounds/ui_confirm.yaml` compiles, ships, and is never heard.
  const uiSounds: SoundCatalog = { ...SHIPPED_UI_SOUNDS };
  const cueKeys: Record<string, string> = { ...SHIPPED_CUE_KEYS };
  // The CLIPS — a mod's audio files, by name. Merged like every other catalog
  // (later wins), and NOT owner-claimed: what the player hears is a sound def,
  // and that is what `soundOwners` already tracks. One ledger, because to a
  // player it is one thing — "which mod's kill sound am I hearing" — and the
  // answer must not depend on whether the mod that won authored voices or
  // shipped a file.
  const samples = new Map<string, LoadedSample>();
  // HOW THE ART MOVES. Merged per SUBJECT+STATE rather than per subject, so a
  // mod that gives the ghoul a talking mouth and a later one that gives it a
  // longer walk both land — the alternative ("last mod to mention the ghoul
  // owns every one of its animations") would make an art pack and an animation
  // pack mutually exclusive for no reason a player could see.
  const clips: SpriteClips = {};
  const clipOwners = new Map<string, string[]>();
  const spriteOwners = new Map<string, string[]>();
  const levelOwners = new Map<string, string[]>();
  const blueprintOwners = new Map<string, string[]>();
  const enemyOwners = new Map<string, string[]>();
  const itemOwners = new Map<string, string[]>();
  const soundOwners = new Map<string, string[]>();
  const powerupOwners = new Map<string, string[]>();
  const talentOwners = new Map<string, string[]>();
  const companionOwners = new Map<string, string[]>();
  const setOwners = new Map<string, string[]>();
  const scriptOwners = new Map<string, string[]>();
  const difficultyOwners = new Map<string, string[]>();
  const music: Record<string, ChiptuneTrack> = {};
  // The RECORDED scores share the music clash ledger: to a player "this mod's
  // theme" is one thing, and which player renders it is not their problem.
  const recordedMusic = new Map<string, RecordedTrack>();
  const musicOwners = new Map<string, string[]>();
  const cutsceneOwners = new Map<string, string[]>();
  const thoughtOwners = new Map<string, string[]>();
  const storyItemOwners = new Map<string, string[]>();
  // The errands and their givers share ONE clash ledger: they are one feature
  // to a player ("this mod's quests"), and a giver whose quests another mod
  // took over is the same confusion either way round.
  const questOwners = new Map<string, string[]>();

  for (const bundle of bundles) {
    for (const level of bundle.levels as { id: string }[]) {
      levels[level.id] = level;
      claim(levelOwners, level.id, bundle.id);
    }
    // A blueprint and the level it carves are two claims, not one: a conversion
    // may re-carve a shipped venue without replacing the venue itself, so the
    // MODS screen has to be able to say which mod's RECIPE won separately from
    // which mod's map did.
    for (const [id, def] of Object.entries(bundle.blueprints ?? {})) {
      blueprints[id] = def;
      claim(blueprintOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.enemies)) {
      enemies[id] = def;
      claim(enemyOwners, id, bundle.id);
    }
    // Weapons, gear and uniques share ONE clash ledger: they are one namespace
    // to a player ("this mod's sword") and, for weapons and gear, one registry
    // to the engine — `isWeaponDef` is what tells those two apart.
    for (const [id, def] of Object.entries(bundle.weapons)) {
      weapons[id] = def;
      claim(itemOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.gear)) {
      gear[id] = def;
      claim(itemOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.uniques)) {
      uniques[id] = def;
      claim(itemOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.powerups ?? {})) {
      abilities[id] = def;
      claim(powerupOwners, id, bundle.id);
    }
    // The passive TREES. A mod's talent merges in beside the shipped ones and a
    // shadowed id is replaced, exactly as a monster is — the compiler has
    // already refused an ADDON that shadows one, and made sure no two talents in
    // the merged catalog carry the same proc block.
    for (const [id, def] of Object.entries(bundle.talents ?? {})) {
      talents[id] = def;
      claim(talentOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.companions ?? {})) {
      companions[id] = def;
      claim(companionOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.sets ?? {})) {
      sets[id] = def;
      claim(setOwners, id, bundle.id);
    }
    // THE RULES. Claimed per FILE rather than per hook, because a file is what
    // a player can see themselves losing on the MODS screen ("this mod's
    // loot.lua is being overridden") and what they can fix by moving a row.
    for (const [id, def] of Object.entries(bundle.scripts ?? {})) {
      scripts[id] = def;
      claim(scriptOwners, id, bundle.id);
    }
    for (const [id, voice] of Object.entries(bundle.difficulties ?? {})) {
      // Fold, never assign: an unknown rung is impossible (the compiler checks
      // it against the five the game ships), and a rung a mod does not mention
      // keeps the name it shipped with.
      const base = difficulties[id];
      if (!base) continue;
      difficulties[id] = {
        ...(base as object),
        ...(voice.name === undefined ? {} : { name: voice.name }),
        ...(voice.tagline === undefined ? {} : { tagline: voice.tagline }),
      };
      claim(difficultyOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.sounds ?? {})) {
      sounds[id] = def as SoundDef;
      if (id in uiSounds) uiSounds[id] = def as SoundDef;
      claim(soundOwners, id, bundle.id);
    }
    // THE CLIPS — the audio itself. A recording is no longer a second kind of
    // sound consulted ahead of the catalog: the compiler emitted a def for it
    // in `bundle.sounds` above (a `call: sample` voice naming this clip), so
    // the merge that just happened is the whole of the routing, and this is
    // only the bytes it will reach for.
    //
    // NOT claimed in `soundOwners`: the def that names the clip already was,
    // one loop up. Claiming here too would report a sound pack as two mods
    // fighting over every sound in it.
    for (const sample of bundle.samples ?? []) {
      samples.set(sample.id, {
        id: sample.id,
        takes: sample.takes.map(base64ToBytes),
      });
    }
    // A mod's CUE routing, last for the same reason the event routing is: a
    // later mod answering the same cue wins it.
    Object.assign(cueKeys, bundle.cueKeys ?? {});
    for (const [id, track] of Object.entries(bundle.music ?? {})) {
      music[id] = track as ChiptuneTrack;
      recordedMusic.delete(id); // an arrangement replacing an earlier mod's mix
      claim(musicOwners, id, bundle.id);
    }
    for (const track of bundle.musicSamples ?? []) {
      recordedMusic.set(track.id, {
        id: track.id,
        bytes: base64ToBytes(track.data),
      });
      delete music[track.id]; // …and a mix replacing an earlier arrangement
      claim(musicOwners, track.id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.cutscenes ?? {})) {
      cutscenes[id] = def;
      claim(cutsceneOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.thoughts ?? {})) {
      thoughts[id] = def;
      claim(thoughtOwners, id, bundle.id);
    }
    if (bundle.capRotation?.length) capThoughts = bundle.capRotation;
    for (const [id, def] of Object.entries(bundle.storyItems ?? {})) {
      storyItems[id] = def;
      claim(storyItemOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.questGivers ?? {})) {
      questGivers[id] = def;
      claim(questOwners, id, bundle.id);
    }
    for (const [id, def] of Object.entries(bundle.quests ?? {})) {
      quests[id] = def;
      claim(questOwners, id, bundle.id);
    }
    // A mod's `on:` routing goes in last, so a later mod answering the same
    // event wins it — the same "later wins" rule everything else follows.
    Object.assign(soundKeys, bundle.soundKeys ?? {});
    // Decoded and merged per mod IN ORDER rather than all at once, so a later
    // mod's frame lands on top of an earlier one's exactly as its defs do.
    for (const [name, bitmap] of await decodeSprites(bundle.sprites)) {
      (sprites as Record<string, ImageBitmap>)[name] = bitmap;
      claim(spriteOwners, name, bundle.id);
    }
    for (const [subject, states] of Object.entries(bundle.clips ?? {})) {
      for (const [state, clip] of Object.entries(states)) {
        (clips[subject] ??= {})[state as ClipState] = clip as SpriteClip;
        // Claimed as "ghoul walk" rather than as "ghoul": the clash screen's
        // job is to name the thing the player is looking at, and two mods that
        // animate the same body in different states are not in conflict.
        claim(clipOwners, `${subject} ${state}`, bundle.id);
      }
    }
  }

  setSoundCatalog(sounds, soundKeys);
  setCueCatalog(sounds, cueKeys);
  setUiSoundCatalog(uiSounds);
  // The recordings go in as bytes and are decoded by the browser's own audio
  // decoder. Warming here rather than on first play so the kill that starts a
  // modded run is heard: a decode takes milliseconds, but a frame is 16 of
  // them. It is a no-op while audio is still locked, and the lazy path in
  // `samples.ts` picks those up on the player's first gesture.
  setSamples([...samples.values()]);
  warmSamples(synth);
  // The clips go in beside the frames they name — both are art, both are
  // replaced wholesale rather than merged onto the last run's, and a clip
  // installed without its sprites would name frames nothing answers to.
  setSpriteClips(clips);
  // Only the mods' scores travel: the shipped ones are behind their own dynamic
  // imports and stay exactly where they are, so a mod that replaces one does it
  // by claiming its id here rather than by anything being rebuilt.
  setModTracks(music);
  setRecordedTracks([...recordedMusic.values()]);
  const defs: DefOverrides = {
    ...baseDefs,
    levels: levels as DefOverrides["levels"],
    blueprints: blueprints as DefOverrides["blueprints"],
    enemies: enemies as DefOverrides["enemies"],
    // Weapons and gear are ONE registry pair behind `registerDefs`, so both go
    // together or the omitted one is replaced with an empty catalog.
    weapons: weapons as DefOverrides["weapons"],
    gear: gear as DefOverrides["gear"],
    uniques: uniques as DefOverrides["uniques"],
    abilities: abilities as DefOverrides["abilities"],
    talents: talents as DefOverrides["talents"],
    companions: companions as DefOverrides["companions"],
    sets: sets as DefOverrides["sets"],
    // ALWAYS passed, even when no enabled mod ships a rule: an empty record is
    // what clears a previous mod's formulas, and `registerDefs` bumps the
    // script host's generation off the assignment either way.
    scripts: scripts as DefOverrides["scripts"],
    difficulties: difficulties as DefOverrides["difficulties"],
    cutscenes: cutscenes as DefOverrides["cutscenes"],
    thoughts: thoughts as DefOverrides["thoughts"],
    capThoughts,
    storyItems: storyItems as DefOverrides["storyItems"],
    quests: quests as DefOverrides["quests"],
    questGivers: questGivers as DefOverrides["questGivers"],
  };
  registerDefs(defs);
  // The SAME overrides, kept for the session process (docs/multiplayer.md): a
  // hosted run simulates over there, where this `registerDefs` never reached.
  // The run driver sends this with `start` and the session registers it before
  // it builds — so the horde a modded host fights is the mod's, not the
  // shipped game's wearing its skin.
  setActiveDefs(defs as unknown as Record<string, unknown>);

  const stamps = bundles.map((bundle) => ({
    id: bundle.id,
    name: bundle.name,
    version: bundle.version,
  }));
  setActiveMods(stamps, [
    ...contested("sprite", spriteOwners),
    ...contested("animation", clipOwners),
    ...contested("level", levelOwners),
    ...contested("map blueprint", blueprintOwners),
    ...contested("enemy", enemyOwners),
    ...contested("item", itemOwners),
    ...contested("sound", soundOwners),
    ...contested("powerup", powerupOwners),
    ...contested("talent", talentOwners),
    ...contested("companion", companionOwners),
    ...contested("set", setOwners),
    ...contested("rule script", scriptOwners),
    ...contested("difficulty", difficultyOwners),
    ...contested("music", musicOwners),
    ...contested("cutscene", cutsceneOwners),
    ...contested("thought", thoughtOwners),
    ...contested("story item", storyItemOwners),
    ...contested("quest", questOwners),
  ]);
  return stamps;
}

/** Note that `modId` defines `id`, keeping the claims in load order. */
function claim(owners: Map<string, string[]>, id: string, modId: string): void {
  const claimed = owners.get(id);
  if (claimed) claimed.push(modId);
  else owners.set(id, [modId]);
}

/** The ids more than one mod claimed — the only ones worth reporting. An id a
 * single mod defines is that mod doing its job, whether or not it also shadows
 * a shipped one (which its own `kind: conversion` already declared). */
function contested(
  kind: ModClash["kind"],
  owners: Map<string, string[]>,
): ModClash[] {
  const out: ModClash[] = [];
  for (const [id, claimedBy] of owners) {
    if (claimedBy.length > 1) out.push({ kind, id, claimedBy });
  }
  return out;
}

/**
 * Put the shipped game back. Called when a modded run ends, so the menus, the
 * roster and the next run are the base game again — a mod is a property of a
 * RUN, never of the install.
 */
export function restoreBaseDefs(sprites: Sprites): void {
  if (baseDefs) registerDefs(baseDefs);
  if (baseSprites) {
    // Restore by REPLACING the contents of the same object rather than swapping
    // it: the renderer captured this reference at load and never re-reads it.
    for (const name of Object.keys(sprites)) {
      delete (sprites as Record<string, ImageBitmap>)[name];
    }
    Object.assign(sprites, baseSprites);
  }
  setSoundCatalog(SHIPPED_SOUNDS, SHIPPED_SOUND_KEYS);
  setCueCatalog(SHIPPED_SOUNDS, SHIPPED_CUE_KEYS);
  setUiSoundCatalog(SHIPPED_UI_SOUNDS);
  clearSamples();
  // …and the clips with the frames they named. Left behind, they would point
  // every call site at sprites that have just been deleted, which draws the
  // bodies that had a mod's animation as nothing at all.
  clearSpriteClips();
  setModTracks({});
  setRecordedTracks([]);
  setActiveMods([], []);
  setActiveDefs(null);
}

/**
 * Raw RGBA → ImageBitmap, one per sprite.
 *
 * `createImageBitmap` over an `ImageData` is the only step here, and it is the
 * reason the compiler ships pixels rather than a PNG: decoding a PNG is
 * asynchronous, failable, and — for content a stranger authored — a decoder
 * attack surface. A flat byte array of a size we already know is none of those.
 */
async function decodeSprites(
  sprites: ModSprite[],
): Promise<[string, ImageBitmap][]> {
  const out: [string, ImageBitmap][] = [];
  for (const sprite of sprites) {
    const bytes = base64ToBytes(sprite.rgba);
    const expected = sprite.width * sprite.height * 4;
    // A short buffer would throw inside ImageData with a message naming
    // neither the mod nor the sprite; skip it and let the mob draw as nothing,
    // which is at least the failure the compiler already warned about.
    if (bytes.length !== expected) continue;
    const data = new ImageData(
      new Uint8ClampedArray(bytes),
      sprite.width,
      sprite.height,
    );
    out.push([sprite.name, await createImageBitmap(data)]);
  }
  return out;
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
