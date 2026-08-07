// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// WHAT A MOD FOLDER MAY HOLD — the one description of the layout, read by the
// validator (`validate.mjs`) and by the packager (`package.mjs`).
//
// It is written down here rather than inferred from `build.mjs` because the two
// questions are genuinely different. The compiler asks "what can I LOAD", and
// answers it by looking only where it expects content to be — so a stray
// `notes.txt`, a `.DS_Store`, an editor backup or a folder of source PSDs is
// invisible to it, compiles fine, and then travels to every subscriber inside
// the published item. This file asks the other question: "is everything here
// something the game will actually read", which is what makes a package clean
// rather than merely valid.
//
// Keep it in step with `build.mjs`. Every directory and root file below is one
// the compiler loads, in the same shape; a catalog added there needs a row
// here, or the validator will refuse the very files the compiler is about to
// read.

/**
 * The audio containers a mod's recording may be in.
 *
 * RECORDINGS ARE A DESKTOP FEATURE, and that is what sets this list. A mod only
 * ever reaches the game through the Steam shell (`mods-bridge.ts` refuses to
 * even look anywhere else), so the decoder on the other side of these bytes is
 * always the same Chromium — not "every browser", which is what the list was
 * originally cut down to. Ogg/Opus and FLAC are decoded there as surely as WAV
 * is, and Opus is roughly a third of MP3 at the same quality, which is real
 * headroom against the per-mod budget rather than a nicety.
 *
 * Kept here rather than in the compiler so the folder audit and the compiler
 * cannot disagree about what a `sounds/` file is.
 */
export const SAMPLE_EXTS = ["wav", "mp3", "ogg", "opus", "flac"];

/**
 * The two ways a sprite may be authored.
 *
 * A `.yaml` grid is the game's own format and stays first, because it is what
 * every refusal should name for somebody who has not read the docs. A `.png` is
 * the same sprite drawn in an editor instead — decoded by the compiler, never
 * by the game (see `png.mjs`). ONE image format on purpose: PNG is lossless,
 * indexed-friendly and universally exported, and a second one would only be a
 * second decoder for art that would come out worse.
 */
export const SPRITE_EXTS = ["yaml", "png"];

/** Directories the compiler loads, and how deep the YAML sits in each.
 *
 * `depth: 1` is `<dir>/<id>.yaml`; `depth: 2` is `<dir>/<group>/<id>.yaml`,
 * where the group is the biome / rarity / sprite family. The depth is exact —
 * a loader reads one level and one level only, so a file nested deeper is a
 * file the game silently never sees, which is the single most confusing way for
 * a mod to be "valid" and missing half its content. */
export const TREES = {
  levels: { depth: 1, what: "a mission" },
  maps: { depth: 1, what: "a map blueprint" },
  enemies: { depth: 2, group: "biome", what: "a monster" },
  items: { depth: 2, group: "rarity", what: "a weapon, gear piece or relic" },
  // The other tree that takes MEDIA beside its YAML, for the same reason
  // `sounds/` does: a pixel artist's deliverable is a PICTURE. A grid of
  // palette characters is a fine way to author sixteen pixels of moon rock in
  // a text editor, and a terrible way to receive a finished sprite sheet from
  // somebody who draws for a living — so `sprites/<family>/<id>.png` is the
  // same sprite by the same name, decoded to raw pixels by the compiler
  // (`png.mjs`) so the game still only ever sees a flat byte array.
  sprites: {
    depth: 2,
    group: "family",
    exts: SPRITE_EXTS,
    what: "pixel art",
  },
  // The one tree that takes MEDIA beside its YAML: `sounds/<id>.wav` (or
  // `.mp3`) is a RECORDING that replaces the synthesized sound of the same id,
  // which is how a mod ships professionally produced audio instead of a list
  // of oscillators. The YAML stays optional and does the same job it always
  // did — routing a NEW sound to an event, or trimming a recording's level.
  sounds: { depth: 1, exts: ["yaml", ...SAMPLE_EXTS], what: "a sound" },
  // …and the same for MUSIC, for a reason that is stronger there than for the
  // effects: a conversion that has commissioned a score has a finished mix,
  // and asking its author to re-enter it as sixteenth-note tokens is asking
  // them to throw the work away. A recorded track plays through an `<audio>`
  // element rather than the sequencer, so it streams instead of sitting in
  // memory as decoded PCM (see pwa/src/game/music/recorded.ts).
  music: { depth: 1, exts: ["yaml", ...SAMPLE_EXTS], what: "a score" },
  cutscenes: { depth: 1, what: "a scene" },
  quests: { depth: 1, what: "an errand" },
  // The one tree that is not YAML: a RULE is code, and authoring code as a
  // quoted string inside a data file would cost an author their editor's
  // highlighting, their line numbers and their diff.
  scripts: {
    depth: 1,
    ext: "lua",
    what: "a rule the engine hands to a script",
  },
};

/** Every extension a tree accepts — YAML unless the tree says otherwise. The
 * FIRST one is the tree's own shape, and the one an error message names. */
const treeExts = (tree) => tree.exts ?? [tree.ext ?? "yaml"];

/**
 * The CLIP a recording belongs to, or null when the file is not a recording.
 *
 * A clip may have several TAKES, named `<clip>.1.wav`, `<clip>.2.wav` … — the
 * answer to the one thing a recording does that a synthesized sound does not,
 * which is repeat itself exactly. (The shipped bank's `noise` voices redraw
 * their buffer every play, so four hundred takedowns a run are four hundred
 * slightly different sounds; a single recording is the same waveform four
 * hundred times, and the ear notices long before the four hundredth.) So
 * `enemy_hit.wav` and `enemy_hit.1.wav` name the SAME clip, and the take index
 * is stripped here so every caller sees one name for one sound.
 */
export function sampleStem(name) {
  for (const ext of SAMPLE_EXTS) {
    if (!name.endsWith(`.${ext}`)) continue;
    const stem = name.slice(0, -(ext.length + 1));
    // `.1`, `.02`, `.17` — a trailing all-digit segment is a take number, not
    // part of the name. A clip that genuinely wants to end in a number can
    // still be `boom_2.wav`, since the separator is a dot.
    const take = /\.(\d+)$/.exec(stem);
    return take ? stem.slice(0, -take[0].length) : stem;
  }
  return null;
}

/**
 * Which TAKE of its clip a recording is: 0 when the name carries no index, and
 * the number itself when it does. Only the ORDER matters — the numbers pick the
 * order the takes cycle in, and gaps in them are an author's business.
 */
export function sampleTake(name) {
  for (const ext of SAMPLE_EXTS) {
    if (!name.endsWith(`.${ext}`)) continue;
    const take = /\.(\d+)$/.exec(name.slice(0, -(ext.length + 1)));
    return take ? Number(take[1]) : 0;
  }
  return 0;
}

/** The rarity directories `items/` may group by — the loader takes the
 * directory name AS the rarity, so a typo is a rarity that does not exist
 * rather than a file in the wrong place. */
export const ITEM_RARITIES = new Set([
  "trash",
  "regular",
  "set",
  "unique",
  "legendary",
  "artifact",
]);

/** Catalogs that are a single FILE at the mod's root. */
export const ROOT_CONTENT = {
  "animations.yaml":
    "how your sprites move — the clips that replace the two-frame convention",
  "ladder.yaml": "where your levels sit on the difficulty ladder",
  "powerups.yaml": "the powers a pickup grants",
  "talents.yaml": "the passives the hero buys ranks in",
  "companions.yaml": "who a spared elite joins you as",
  "sets.yaml": "the kits your green pieces belong to",
  "difficulties.yaml": "what the five difficulty rungs are called",
  "thoughts.yaml": "the hero's inner monologues",
  "story-items.yaml": "the plot pieces his finds spell out",
  "quest-givers.yaml": "the people who hand out your errands",
};

/** The manifest itself — not content, and never listed in its own `contents:`. */
export const MANIFEST = "mod.yaml";

/**
 * Files that belong in a mod folder without being content the game loads.
 * Each says what it is FOR, and whether a package carries it.
 *
 * `.workshop-id` is the one deliberate exclusion: it names the Workshop item
 * the author publishes to, so shipping it inside a zip hands everybody who
 * unpacks it a pointer at somebody else's item.
 */
export const SIDECARS = {
  "README.md": {
    packaged: true,
    what: "what your mod is, for the people who install it",
  },
  "LICENSE.md": { packaged: true, what: "your terms" },
  LICENSE: { packaged: true, what: "your terms" },
  "preview.png": { packaged: true, what: "the Workshop thumbnail" },
  ".workshop-id": {
    packaged: false,
    what: "the Workshop item this folder publishes to — yours, so it stays out of a package",
  },
  "mod.json": {
    packaged: false,
    what: "compiler output (`cli.mjs build`) — the game compiles your YAML itself, so a package never carries it",
  },
};

/** Junk that turns up in a mod folder by accident, matched by NAME so the
 * refusal can say what it is rather than "unexpected file". Everything here is
 * something a tool or an editor left behind. */
const JUNK = [
  [/^\.DS_Store$/, "left behind by the macOS Finder"],
  [/^Thumbs\.db$/i, "left behind by Windows Explorer"],
  [/^desktop\.ini$/i, "left behind by Windows Explorer"],
  [/^__MACOSX$/, "an archiver's resource fork"],
  [/^node_modules$/, "a package tree, and a mod is data that needs none"],
  [/~$/, "an editor backup"],
  [/\.(bak|orig|rej|swp|swo|tmp)$/i, "an editor or merge leftover"],
  [
    /\.(zip|7z|rar|tar|gz|tgz)$/i,
    "an archive, which nothing unpacks from inside a mod",
  ],
  [/\.(psd|xcf|ase|aseprite|kra)$/i, "a source art file the game cannot read"],
];

/** Why this name is junk, or null when it is not. */
export function junkReason(name) {
  for (const [pattern, why] of JUNK) {
    if (pattern.test(name)) return why;
  }
  return null;
}

/** What a `contents:` entry may claim it does to the game. */
export const CHANGE_KINDS = new Set(["adds", "replaces"]);

/**
 * Classify one path inside a mod folder.
 *
 * @param {string} rel  the path relative to the mod root, with `/` separators
 * @returns one of:
 *   `{ role: "manifest" }`
 *   `{ role: "content", catalog }`   — a file the compiler loads
 *   `{ role: "sidecar", packaged }`  — a file that belongs but is not content
 *   `{ role: "junk", why }`
 *   `{ role: "stray", why }`         — nothing here reads it
 */
export function classify(rel) {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];

  const junk =
    junkReason(name) ?? parts.slice(0, -1).map(junkReason).find(Boolean);
  if (junk) return { role: "junk", why: junk };

  if (rel === MANIFEST) return { role: "manifest" };
  if (rel in SIDECARS) {
    return { role: "sidecar", packaged: SIDECARS[rel].packaged };
  }
  // A dot-prefixed name that is not a known sidecar is tooling, always —
  // `.git/`, `.vscode/`, `.gitignore`, a stray `.env`.
  if (parts.some((part) => part.startsWith("."))) {
    return {
      role: "stray",
      why: "a hidden file is tooling rather than content, and the game never reads one",
    };
  }

  if (parts.length === 1) {
    if (name in ROOT_CONTENT) return { role: "content", catalog: name };
    if (name === "mainmenu.yaml") {
      return {
        role: "stray",
        why: "the title menu is the game's own chrome and cannot be replaced by a mod",
      };
    }
    if (name === "conversations.yaml" || name === "leveling.yaml") {
      return {
        role: "stray",
        why: `the game never loads "${name}" from a mod`,
      };
    }
    return {
      role: "stray",
      why: name.endsWith(".yaml")
        ? `no catalog is read from "${name}" — see mod/FORMAT.md for the file names the compiler loads`
        : "the game loads only the YAML catalogs listed in mod/FORMAT.md",
    };
  }

  const tree = TREES[parts[0]];
  if (!tree) {
    return {
      role: "stray",
      why: `"${parts[0]}/" is not a folder the compiler reads — see mod/FORMAT.md`,
    };
  }
  const exts = treeExts(tree);
  if (parts.length !== tree.depth + 1) {
    const shape =
      tree.depth === 1
        ? `${parts[0]}/<id>.${exts[0]}`
        : `${parts[0]}/<${tree.group}>/<id>.${exts[0]}`;
    return {
      role: "stray",
      why: `${tree.what} is loaded from ${shape} — this one sits at a depth nothing reads`,
    };
  }
  if (!exts.some((ext) => name.endsWith(`.${ext}`))) {
    const list = exts.map((ext) => `.${ext}`).join(" or ");
    return {
      role: "stray",
      why: `${parts[0]}/ holds ${list} files only — the compiler skips everything else`,
    };
  }
  // `sprites/` and `quests/` are the two loaders that SKIP an underscored file
  // (it is how a partial is marked), so one there is a file that silently never
  // loads rather than a file in the wrong place.
  if (
    name.startsWith("_") &&
    (parts[0] === "sprites" || parts[0] === "quests")
  ) {
    return {
      role: "stray",
      why: `${parts[0]}/ skips a name starting with "_", so this one never loads`,
    };
  }
  if (parts[0] === "items" && !ITEM_RARITIES.has(parts[1])) {
    return {
      role: "stray",
      why:
        `"${parts[1]}" is not an item rarity — the directory IS the rarity, one of ` +
        [...ITEM_RARITIES].join(", "),
    };
  }
  return { role: "content", catalog: parts[0] };
}
