// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHICH MOD IS ON — an import-free leaf, and it has to be one.
//
// The MODS screen is on the app's STARTUP path (it is a main-menu row), and its
// builder needs exactly one fact from the mod system: which mod is currently
// applied, so the list can mark it. Its neighbour `mods.ts` cannot answer that
// question, because answering it there would mean the startup path imports a
// module that imports `@game/core` — and one import away sit the level catalog,
// the loot roller, the enemy defs and the whole step pipeline. Tree-shaking does
// not save you: it is global, so an export used by ANY chunk keeps its bytes
// wherever its module was placed, and the module was on the startup path. The
// 170 KB gzipped critical-path budget (`pwa/scripts/check-seo.mjs`) is what
// notices.
//
// So this is the same move `engine/game/flags.ts` makes for the engine's runtime
// toggles: the STATE lives in a leaf that imports nothing, and the module that
// does the heavy work writes to it. A settings screen must not import the
// dialogue system to mute it, and a menu row must not import the simulation to
// put "ON" beside a mod's name.

/**
 * One sprite as the compiler emits it: raw RGBA, base64'd.
 *
 * No palette, no grid, and — the part worth saying twice — NO PNG. A mod may
 * AUTHOR its art either way (`sprites/<family>/<id>.yaml` as a character grid,
 * or `<id>.png` straight out of an editor), and by the time it reaches this
 * type the difference is gone: the compiler rasterizes the grid and decodes the
 * picture, so the whole pixel format — every palette rule, every decoder —
 * stays on its side of the wall. The page's job is `new ImageData(bytes, w, h)`
 * over a buffer whose size it already knows, which is synchronous, infallible
 * and has no format to get wrong.
 */
export type ModSprite = {
  name: string;
  width: number;
  height: number;
  rgba: string;
};

/**
 * ONE RECORDED SOUND — a `.wav` or `.mp3` a mod ships to replace a synthesized
 * one, base64'd exactly as a sprite's pixels are.
 *
 * `id` is the routing, and it is the whole routing: it is the id of the sound
 * this recording stands in for, taken from the file's own stem, so a mod
 * shipping `sounds/enemy_killed.wav` is heard everywhere `enemy_killed` was.
 * The bytes travel encoded rather than as PCM because the file IS the mod
 * author's deliverable — re-encoding somebody's mastered audio into our own
 * container would be the one lossy step in a pipeline that has none.
 */
export type ModSample = {
  /** The CLIP name — a file stem. What plays it, and how, is a sound def in
   * `sounds` whose voice names this clip; the compiler writes that def even
   * for a bare dropped-in recording, so there is only ever one mechanism. */
  id: string;
  /**
   * The encoded files, base64'd, in take order.
   *
   * SEVERAL when the mod shipped `<clip>.1.wav`, `<clip>.2.wav` … — the answer
   * to the one thing a recording does that a synthesized sound does not, which
   * is repeat itself EXACTLY. The shipped bank's noise voices redraw their
   * buffer every play; a lone recording is the same waveform four hundred
   * times a run, and the ear catches that long before the four hundredth.
   */
  takes: string[];
};

/**
 * What a CONVERSION calls itself — the two strings the title screen draws in
 * place of the game's own, so a total conversion opens under its own name
 * rather than under somebody else's.
 *
 * Deliberately only those two. The storage prefix, the precache id, the
 * character archive's game name and every discovery surface stay the INSTALL's
 * (`pwa/src/identity.ts`): a mod that moved them would orphan the roster and
 * rewrite a site it does not own.
 */
export type ModBrand = { title: string; tagline: string };

/**
 * ONE LINE OF A MOD'S INVENTORY — a file the game loads, and what its author
 * says it is (`contents:` in the mod's manifest).
 *
 * The MOD INFO screen is built from these, and they are the only honest source
 * for what it has to say. A bundle can be counted — two levels, nine sprites —
 * but "what does this mod do to my game" is a question only the person who
 * wrote the files can answer, and a player deciding whether to switch on a
 * stranger's conversion is asking exactly that.
 */
export type ModContent = {
  /** The file, relative to the mod folder. Shown as the row's own line so a
   * player can see the shape of what they installed. */
  path: string;
  /** One line, the author's words. */
  summary: string;
  /** Whether it brings something new or takes over something the game already
   * had — the difference between "adds a monster" and "replaces the shotgun". */
  change: "adds" | "replaces";
};

/** A compiled mod, exactly as `mod/tools/build.mjs` emits it.
 *
 * The TYPES live here rather than beside the code that applies them for the
 * same reachability reason the state does: the bridge and the MODS screen both
 * need to describe a bundle, and neither may import the module that knows how
 * to load one. */
export type ModBundle = {
  formatVersion: number;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  kind: "addon" | "conversion";
  /** What this mod calls the GAME on its title screen. Conversions only; null
   * everywhere else (see `ModBrand`). */
  brand: ModBrand | null;
  /** A conversion's campaign, in play order; null for an addon, whose levels
   * join the shipped order at their own `index`. */
  campaign: string[] | null;
  levels: unknown[];
  /** The GENERATED MAPS recipes, keyed by the level each one carves — a mod's
   * venue gets a fresh carve per run like a shipped one instead of always
   * playing its hand-drawn layout. */
  blueprints: Record<string, unknown>;
  enemies: Record<string, unknown>;
  /** Plain bases the loot system rolls tiers and affixes onto. */
  weapons: Record<string, unknown>;
  gear: Record<string, unknown>;
  /** Named relics, minted at their authored rarity. */
  uniques: Record<string, unknown>;
  /** The mod's own sounds, by id. */
  sounds: Record<string, unknown>;
  /** The mod's RECORDED sounds — the `.wav`/`.mp3` files it ships, each named
   * after the sound id it replaces. Absent from a bundle compiled before they
   * were a thing, and from the many mods that ship none. */
  samples?: ModSample[];
  /** The mod's own POWERUPS, by id — already `{ id → AbilityDef }`. */
  powerups: Record<string, unknown>;
  /** The mod's own TALENTS, by id — already `{ id → TalentDef }`. They merge
   * into the shipped trees like every other catalog (later wins), so an addon
   * ADDS a talent and a conversion replaces one by shipping its id. */
  talents: Record<string, unknown>;
  /** The mod's own COMPANIONS, by id — who its spared elites become. An
   * enemy's `spareable.companion` names one of these or a shipped one. */
  companions: Record<string, unknown>;
  /** The mod's own SETS, by id — the kits its `rarity: set` pieces belong to
   * and draw their tiered bonuses from. */
  sets: Record<string, unknown>;
  /** The mod's own RULES, by script id — `{ id → { id, source } }`, the Lua a
   * mod ships to replace a shipped formula. The one catalog that is BEHAVIOUR
   * rather than data (see docs/scripting.md); absent from almost every mod,
   * since an addon that adds monsters changes no rules. */
  scripts?: Record<string, { id: string; source: string }>;
  /** What the difficulty ladder's rungs are CALLED under this mod: a PARTIAL
   * `{ rung → { name?, tagline? } }` folded onto the shipped defs. The numbers
   * behind a rung stay the game's — see the schema's header for why. */
  difficulties: Record<string, { name?: string; tagline?: string }>;
  /** Event shape → sound id, keyed as `routeKey` builds it — how a mod
   * replaces a shipped sound rather than only adding one. */
  soundKeys: Record<string, string>;
  /** Cue → sound id, keyed `cue|surface`. The moments the APP raises rather
   * than the engine (a footfall, and whatever joins it), so a mod can give the
   * game boots on a surface nobody authored one for. */
  cueKeys?: Record<string, string>;
  /** The mod's own scores, by track id — already cooked into the shape the
   * chiptune player takes, since the shell compiled them. */
  music: Record<string, unknown>;
  /** …and the RECORDED ones: `{ id, data }` with `data` base64. A separate
   * field rather than a variant inside `music` because they are played by a
   * different player — an `<audio>` element rather than the sequencer, so a
   * three-minute score streams instead of sitting in memory as decoded PCM. */
  musicSamples?: { id: string; data: string }[];
  /** THE STORY. `cutscenes` arrives with its per-difficulty `variants:` already
   * expanded into `<id>_<difficulty>` scenes, so what the page registers is
   * exactly what `cutsceneVariant` looks up; `capRotation` is the cap-farm
   * mutter order, which REPLACES the shipped one rather than merging with it. */
  cutscenes: Record<string, unknown>;
  thoughts: Record<string, unknown>;
  capRotation: string[];
  storyItems: Record<string, unknown>;
  /** THE ERRANDS a mod's maps hand out, and the people who hand them out —
   * two catalogs for the same reason the game splits them: one person owns a
   * whole chain (see `engine/game/defs/quests.ts`). */
  quests: Record<string, unknown>;
  questGivers: Record<string, unknown>;
  sprites: ModSprite[];
  /**
   * HOW THE ART MOVES: subject → state → `{ frames, delayMs, drive }`.
   *
   * Structurally typed here rather than importing `SpriteClips`, for the reason
   * this whole leaf exists: the MODS screen is on the startup path and this
   * module may name nothing that drags the renderer along behind it. The real
   * type is `render/clips.ts`, and `mods.ts` — which is allowed to know both —
   * is where the two meet.
   *
   * Absent from a mod that ships none, which is nearly all of them: the shipped
   * art is two frames a body and the renderer knows that convention by heart.
   */
  clips?: Record<
    string,
    Record<string, { frames: string[]; delayMs: number; drive: string }>
  >;
  /**
   * THE HUD a mod ships: its regions, its elements, its event sounds and its
   * Lua judgements, from the mod's own `hud/` folder.
   *
   * Structurally typed here rather than importing `HudLayout`, for the reason
   * this whole leaf exists: the MODS screen is on the startup path and this
   * module may name nothing that drags the renderer along behind it. The real
   * types are `hud/types.ts`, and `mods.ts` — which is allowed to know both —
   * is where the two meet.
   *
   * Absent from the many mods that leave the HUD alone. A mod that ships one
   * element replaces THAT element and nothing else: the merge is per id, so a
   * pouch re-skin does not cost the player the rest of their HUD.
   */
  hud?: {
    regions?: Record<string, unknown>;
    elements?: unknown[];
    events?: Record<string, string>;
    scripts?: Record<string, { id: string; source: string }>;
  };
  /**
   * THE IN-GAME MENUS a mod ships: its windows, the modals it can raise, the
   * rows it hangs off ours, and the Lua behind them — from the mod's own
   * `menus/` folder.
   *
   * Structurally typed for the same reason the HUD above is: this leaf is on
   * the startup path and may name nothing that drags the renderer along. The
   * real types are `menus/types.ts`.
   *
   * Absent from the many mods that leave the windows alone. A mod that ships
   * one row replaces THAT row and nothing else.
   */
  menus?: {
    menus?: unknown[];
    modals?: unknown[];
    elements?: unknown[];
    scripts?: Record<string, { id: string; source: string }>;
  };
  /** The manifest's own inventory — what the MOD INFO screen reads. Empty for
   * a mod authored before `contents:` existed, which is why the screen still
   * has to be able to say something without it. */
  contents: ModContent[];
};

/** What a hero remembers about the mods they were played under. Stored on the
 * character, so a roster full of mod heroes still reads correctly on a device
 * that has since unsubscribed from all of them. */
export type ModStamp = { id: string; name: string; version: string };

/** One id that more than one enabled mod defines, and who ended up owning it.
 * Collected while applying and shown on the MODS screen, because a silent
 * override is exactly the bug a load order exists to make visible. */
export type ModClash = {
  kind:
    | "sprite"
    | "level"
    | "map blueprint"
    | "enemy"
    | "item"
    | "sound"
    | "music"
    | "powerup"
    | "talent"
    | "companion"
    | "set"
    | "difficulty"
    | "cutscene"
    | "thought"
    | "story item"
    | "quest"
    | "rule script"
    | "animation"
    | "hud"
    // A window, a modal or one row of either.
    | "menu";
  id: string;
  /** Mod ids that define it, in load order — the LAST one is the winner. */
  claimedBy: string[];
};

let active: ModStamp[] = [];
let clashes: ModClash[] = [];
/** The exact catalog overrides the last `applyMods` registered (the object it
 * handed `registerDefs`), structurally typed because this leaf sits on the
 * startup path and may not name the engine's types. Null for the shipped
 * game. See `activeDefOverrides` for who reads it and why. */
let activeDefs: Record<string, unknown> | null = null;

/** The mods applied to the engine, in LOAD ORDER. Empty for the shipped game. */
export function activeMods(): ModStamp[] {
  return active;
}

/** Whether this id is applied right now — what the MODS screen marks with ON. */
export function isModActive(id: string): boolean {
  return active.some((stamp) => stamp.id === id);
}

/** What the current stack overrides between its own members. */
export function modClashes(): ModClash[] {
  return clashes;
}

/** Record what is applied. Called only by `mods.ts`, on either side of a modded
 * run — a screen must never set this, because setting it without swapping the
 * catalogs would make every surface that reads it lie. */
export function setActiveMods(stamps: ModStamp[], found: ModClash[]): void {
  active = stamps;
  clashes = found;
}

/**
 * THE CATALOGS THE SESSION PROCESS MUST SIMULATE WITH (docs/multiplayer.md).
 *
 * The page applies a mod by swapping the live registry (`registerDefs`), but
 * a hosted run SIMULATES in the session's own process, whose registry this
 * swap never touched — so a modded run's horde would spawn from the SHIPPED
 * catalogs while the renderer drew a mod. The run driver reads this and sends
 * it with the `start` message, and the session registers it before it builds
 * the run. Null means the shipped game, which is every unmodded run.
 */
export function activeDefOverrides(): Record<string, unknown> | null {
  return activeDefs;
}

/** Record the overrides `applyMods` registered (null on restore). Called only
 * by `mods.ts`, beside `setActiveMods` and for the same reason. */
export function setActiveDefs(defs: Record<string, unknown> | null): void {
  activeDefs = defs;
}
