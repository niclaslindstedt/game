// SPDX-License-Identifier: LicenseRef-GoneInSpace-Mod-SDK-1.0
// THE PRE-PUBLISH AUDIT — everything `check` cannot see.
//
// `cli.mjs check` compiles a mod and answers "will the game load this". It is
// the fast inner loop and it stays that. What it CANNOT answer is the question
// somebody about to hand a stranger a zip actually has:
//
//   * is everything in this folder something the game reads? A compiler looks
//     only where content lives, so a `.DS_Store`, an editor backup, a folder of
//     layered source art, a `.env` with a token in it or last week's `notes.txt`
//     all compile perfectly and then travel to every subscriber.
//   * is anything here in a place NOTHING reads? A sprite one directory too
//     deep, an item under a rarity that does not exist, a catalog spelled
//     `powerup.yaml` — each is a file its author believes is in the game.
//   * does it say what it IS, to a player rather than to a compiler? That is
//     `README.md` and the manifest's `contents:` block, and neither can be
//     derived: only the author knows what their file is for.
//
// So this is the OTHER half of the toolchain, and `package.mjs` refuses to zip
// a mod that does not pass it — because the one moment all of this is worth
// catching is the moment before the folder leaves the machine.
//
// It reports every problem at once, like the compiler, and for the same reason:
// a folder with three stray files should take one round trip to clean, not
// three.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";

import { glyphProblem } from "../../scripts/asset-tools/glyphs.mjs";
import { buildMod } from "./build.mjs";
import {
  CHANGE_KINDS,
  MANIFEST,
  SIDECARS,
  NESTED,
  TREES,
  classify,
  junkReason,
  sampleStem,
} from "./layout.mjs";

/** A README shorter than this is a placeholder rather than a description. */
const README_MIN = 200;
/** A summary is one line in a menu row, drawn in the pixel font. */
const SUMMARY_MIN = 8;
const SUMMARY_MAX = 120;
/** The scaffold plants this so an unedited README cannot be published. */
export const README_TODO = "TODO: describe your mod";

/**
 * Audit a mod folder.
 *
 * @param modDir  the folder holding `mod.yaml`
 * @param opts.catalog  the parsed `mod/catalog.json`. Given, the COMPILER runs
 *   too and its findings are merged in, so `validate` is a superset of `check`.
 *   Omitted, only the folder and the manifest are audited.
 * @returns `{ errors, warnings, contents, files }` — `contents` is the manifest's
 *   declared list (each `{ path, summary, change }`), `files` the classified
 *   tree.
 */
export function validateMod(modDir, { catalog } = {}) {
  const errors = [];
  const warnings = [];

  if (!existsSync(modDir) || !statSync(modDir).isDirectory()) {
    return {
      errors: [`${modDir}: not a folder`],
      warnings,
      contents: [],
      files: emptyFiles(),
    };
  }
  const manifestPath = path.join(modDir, MANIFEST);
  if (!existsSync(manifestPath)) {
    return {
      errors: [`${MANIFEST}: no manifest — every mod needs one at its root`],
      warnings,
      contents: [],
      files: emptyFiles(),
    };
  }

  const files = walk(modDir);
  for (const { rel, why } of files.junk) {
    errors.push(`${rel}: ${why} — remove it before you package`);
  }
  for (const { rel, why } of files.stray) {
    errors.push(`${rel}: ${why}`);
  }

  let manifest = null;
  try {
    manifest = parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    errors.push(`${MANIFEST}: not valid YAML — ${e.message}`);
  }
  if (
    manifest !== null &&
    (typeof manifest !== "object" || Array.isArray(manifest))
  ) {
    errors.push(`${MANIFEST}: expected a mapping`);
    manifest = null;
  }

  // Every content file is parsed here even though the compiler parses them
  // again, because a file in a directory the compiler does not read (already an
  // error above) still deserves the more useful of the two complaints when it
  // is ALSO broken YAML.
  for (const rel of files.content) {
    if (!rel.endsWith(".yaml")) continue;
    try {
      parse(readFileSync(path.join(modDir, rel), "utf8"));
    } catch (e) {
      errors.push(`${rel}: not valid YAML — ${e.message}`);
    }
  }

  checkReadme(modDir, files, errors, warnings);
  const contents = checkContents(manifest, files, catalog, errors, warnings);

  if (files.content.length === 0) {
    errors.push(
      "this folder holds no content at all — a mod is levels, monsters, items, " +
        "art, sound or story, in the folders mod/FORMAT.md lists",
    );
  }

  // The compiler last: its findings are about what the files SAY, and a folder
  // whose files are in the wrong place should be told that first.
  if (catalog) {
    const built = buildMod(modDir, catalog);
    errors.push(...built.errors);
    warnings.push(...built.warnings);
  }

  return { errors, warnings, contents, files };
}

/** Files a package carries: the manifest, every declared content file, and the
 * sidecars that are the author's to ship. Sorted, so two packages of the same
 * folder hold the same entries in the same order. */
export function packagedFiles(files) {
  return [
    MANIFEST,
    ...files.content,
    ...files.sidecar.filter((rel) => SIDECARS[rel]?.packaged),
  ].sort();
}

function emptyFiles() {
  return { content: [], sidecar: [], junk: [], stray: [] };
}

// ---------------------------------------------------------------------------
// The tree
// ---------------------------------------------------------------------------

/**
 * Every path under `modDir`, classified.
 *
 * A directory that is junk or that nothing reads is reported ONCE and not
 * descended into: `node_modules/` holds thirty thousand files, and thirty
 * thousand findings is not a report anybody can act on.
 */
function walk(modDir) {
  const found = emptyFiles();

  const descend = (dir, prefix) => {
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
      a.name.localeCompare(b.name),
    )) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        const verdict = classifyDir(rel);
        if (verdict.role === "ok") descend(path.join(dir, entry.name), rel);
        else found[verdict.role].push({ rel: `${rel}/`, why: verdict.why });
        continue;
      }
      const verdict = classify(rel);
      if (verdict.role === "manifest") continue;
      if (verdict.role === "content") found.content.push(rel);
      else if (verdict.role === "sidecar") found.sidecar.push(rel);
      else found[verdict.role].push({ rel, why: verdict.why });
    }
  };

  descend(modDir, "");
  return found;
}

/** The same question as `classify`, for a DIRECTORY. */
function classifyDir(rel) {
  const parts = rel.split("/");
  const name = parts[parts.length - 1];
  const junk = junkReason(name);
  if (junk) return { role: "junk", why: junk };
  if (name.startsWith(".")) {
    return {
      role: "stray",
      why: "a hidden folder is tooling rather than content, and the game never reads one",
    };
  }
  if (parts.length === 1) {
    return TREES[name] || NESTED[name]
      ? { role: "ok" }
      : {
          role: "stray",
          why: `nothing is loaded from "${name}/" — see mod/FORMAT.md for the folders the compiler reads`,
        };
  }
  // `hud/` is the one folder with folders of its own (its elements and its
  // judgements), so its second level is as legitimate as a biome's.
  const nested = NESTED[parts[0]];
  if (nested && parts.length === 2 && parts[1] in nested.trees) {
    return { role: "ok" };
  }
  const tree = TREES[parts[0]];
  if (tree && tree.depth === 2 && parts.length === 2) return { role: "ok" };
  return {
    role: "stray",
    why: `nothing is loaded this deep under "${parts[0]}/" — see mod/FORMAT.md`,
  };
}

// ---------------------------------------------------------------------------
// README.md
// ---------------------------------------------------------------------------

/**
 * The mod's own front page.
 *
 * Required, and it is the one file here written for a PERSON: the manifest's
 * `description` is a sentence on a menu row, and a player deciding whether to
 * install somebody's conversion needs more than a sentence. It is also what the
 * Workshop page and the folder a friend was sent have in common — the zip
 * carries it, so a mod handed over outside Steam still says what it is.
 */
function checkReadme(modDir, files, errors, warnings) {
  if (!files.sidecar.includes("README.md")) {
    errors.push(
      "README.md: missing — every mod needs one, saying what it is, what it " +
        "changes and how to play it (mod/FORMAT.md has the shape)",
    );
    return;
  }
  const text = readFileSync(path.join(modDir, "README.md"), "utf8");
  if (text.includes(README_TODO)) {
    errors.push(
      `README.md: still carries the scaffold's "${README_TODO}" — write it before you publish`,
    );
  }
  if (!/^#\s+\S/m.test(text)) {
    warnings.push("README.md: no heading — open it with `# YOUR MOD'S NAME`");
  }
  if (text.trim().length < README_MIN) {
    warnings.push(
      `README.md: ${text.trim().length} characters — that is a placeholder, not a description a player can decide from`,
    );
  }
}

// ---------------------------------------------------------------------------
// contents:
// ---------------------------------------------------------------------------

/**
 * `contents:` — the manifest's inventory: every file the game loads, and what
 * each one is, in the author's own words.
 *
 * It earns its keep twice. It is what the MODS screen shows a player who taps a
 * mod — "what does this actually do to my game" is otherwise answerable only by
 * counting files — and it is an ALLOW-LIST: a file in the folder that the
 * manifest does not claim is either content its author forgot about or
 * something that should never have been in a mod at all, and both are worth
 * hearing about before the zip leaves the machine.
 */
function checkContents(manifest, files, catalog, errors, warnings) {
  if (!manifest) return [];
  const declared = manifest.contents;
  if (declared === undefined) {
    errors.push(
      `${MANIFEST}: no contents: block — list every file the game loads, each ` +
        "with a line saying what it is (mod/FORMAT.md → contents:)",
    );
    return [];
  }
  if (!Array.isArray(declared)) {
    errors.push(`${MANIFEST}: contents: must be a list of { path, summary }`);
    return [];
  }

  const onDisk = new Set(files.content);
  const claimed = new Map();
  const contents = [];

  declared.forEach((entry, i) => {
    const at = `${MANIFEST}: contents[${i}]`;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      errors.push(`${at}: expected a mapping with a path: and a summary:`);
      return;
    }
    for (const key of Object.keys(entry)) {
      if (!["path", "summary", "change"].includes(key)) {
        errors.push(
          `${at}: unknown field "${key}" — takes path, summary, change`,
        );
      }
    }
    const file = String(entry.path ?? "");
    if (!file) {
      errors.push(`${at}: needs a path: — the file it describes`);
      return;
    }
    if (
      file !== path.posix.normalize(file) ||
      file.startsWith("/") ||
      file.startsWith("..")
    ) {
      errors.push(
        `${at}: path "${file}" must be relative to the mod folder, with / separators`,
      );
      return;
    }
    if (claimed.has(file)) {
      errors.push(
        `${at}: "${file}" is already described at contents[${claimed.get(file)}]`,
      );
      return;
    }
    claimed.set(file, i);

    if (!onDisk.has(file)) {
      const verdict = classify(file);
      errors.push(
        verdict.role === "sidecar"
          ? `${at}: "${file}" is ${SIDECARS[file].what} — the game does not load it as content, so it is not listed here`
          : verdict.role === "content"
            ? `${at}: "${file}" is not in the mod folder`
            : `${at}: "${file}" — ${verdict.why}`,
      );
      return;
    }

    const change = entry.change ?? "adds";
    if (!CHANGE_KINDS.has(change)) {
      errors.push(
        `${at}: change "${change}" — expected "adds" (new to the game) or ` +
          '"replaces" (it takes over something already there)',
      );
    }
    const summary = String(entry.summary ?? "").trim();
    if (summary.length < SUMMARY_MIN) {
      errors.push(
        `${at}: "${file}" needs a summary: — one line saying what it is, in ` +
          "words a player reads on the MODS screen",
      );
      return;
    }
    if (summary.length > SUMMARY_MAX) {
      errors.push(
        `${at}: summary is ${summary.length} characters — keep it under ${SUMMARY_MAX}, it is one line on a menu row`,
      );
    }
    if (/\n/.test(summary)) {
      errors.push(`${at}: summary is one line — fold it, or say less`);
    }
    // The MOD INFO screen draws it in the game's own pixel font, so the same
    // check `brand:` gets: an em dash pasted from a document is a "?" on the
    // player's screen and nowhere else.
    const problem = glyphProblem(summary, catalog?.glyphs, "summary");
    if (problem) errors.push(`${at}: ${problem}`);

    contents.push({ path: file, summary, change });
  });

  const undescribed = files.content.filter((rel) => !claimed.has(rel));
  for (const rel of undescribed) {
    errors.push(
      `${MANIFEST}: contents: does not describe "${rel}" — every file the game ` +
        "loads is listed, so nothing ships that nobody meant to ship",
    );
  }

  // A mod whose every line says "replaces" is almost always an addon that
  // copied the field down the list rather than one that really takes over the
  // shipped game, and the MODS screen would tell the player so.
  //
  // A SOUND PACK is the honest exception, and the only one: a folder of
  // recordings named after the sounds they stand in for replaces every time,
  // by construction — there is no other thing a `.wav` in `sounds/` can do.
  const soundPack = contents.every(
    (entry) =>
      entry.path.startsWith("sounds/") && sampleStem(entry.path) !== null,
  );
  if (
    contents.length > 1 &&
    !soundPack &&
    contents.every((entry) => entry.change === "replaces") &&
    manifest.kind !== "conversion"
  ) {
    warnings.push(
      `${MANIFEST}: every entry says change: replaces, but this is an addon — ` +
        '"adds" is what a file that brings something new does',
    );
  }
  return contents;
}
