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

/** The audio containers a mod's recording may be in — the two every browser
 * decodes, which is what a shell's WebView is. Kept here rather than in the
 * compiler so the folder audit and the compiler cannot disagree about what a
 * `sounds/` file is. */
export const SAMPLE_EXTS = ["wav", "mp3"];

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
  sprites: { depth: 2, group: "family", what: "pixel art" },
  // The one tree that takes MEDIA beside its YAML: `sounds/<id>.wav` (or
  // `.mp3`) is a RECORDING that replaces the synthesized sound of the same id,
  // which is how a mod ships professionally produced audio instead of a list
  // of oscillators. The YAML stays optional and does the same job it always
  // did — routing a NEW sound to an event, or trimming a recording's level.
  sounds: { depth: 1, exts: ["yaml", ...SAMPLE_EXTS], what: "a sound" },
  music: { depth: 1, what: "a score" },
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

/** The sound id a recording replaces, or null when the file is not one. */
export function sampleStem(name) {
  for (const ext of SAMPLE_EXTS) {
    if (name.endsWith(`.${ext}`)) return name.slice(0, -(ext.length + 1));
  }
  return null;
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
