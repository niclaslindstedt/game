// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The YAML STORY loader — cutscenes, the hero's inner monologues, and the story
// items whose lore pages carry the plot. Peer of the sound/music/level/enemy/item
// loaders, and takes a BASE DIRECTORY for the same reason they do: a MOD's story
// goes through this exact loader and this exact schema (see mod/tools/build.mjs),
// so "it works in my mod" and "it works in the game" mean the same thing.
//
// Layout — one tree and two single-file catalogs:
//   cutscenes/<id>.yaml   one scene: the file stem IS the id.
//   thoughts.yaml         a `thoughts:` mapping of id → monologue, plus the
//                         `capRotation:` the cap-farm mutter cycles.
//   story-items.yaml      a `storyItems:` mapping of id → plot piece.
//
// A catalog key IS the id, stamped onto the def here so the YAML never has to
// repeat it (and so the two can never disagree).
//
// The loader does the two shape changes the authored form makes for readability,
// and nothing else:
//
//  1. **A prop's sprite is called `sprite:`, not `kind:`.** `CutsceneProp.kind`
//     is a renderer key in the generic player (@game/lib/cutscene.ts, which
//     knows nothing about sprites); in THIS renderer a prop kind is a sprite
//     name, and one file cannot readably use `kind` for both a prop's art and a
//     beat's discriminant.
//  2. **`variants:` expands into whole scenes.** The prelude is the same room on
//     every difficulty except the weapon on the wall, so it is authored ONCE
//     with `label:` handles on the parts that differ; each variant patches those
//     labels and is emitted as `<id>_<difficulty>`, which is exactly what
//     `cutsceneVariant` resolves at run creation. A BEAT's label is an authoring
//     handle only — stripped here, never reaching the game. **A PROP's label is
//     also its `id`**, and so it does travel: a `prop` beat takes a piece off
//     the stage by that name (the wall weapon, the moment the hero has it), and
//     a thing addressed twice under two spellings is a thing that drifts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const SHIPPED_ROOT = fileURLToPath(new URL("../../content", import.meta.url));

/** Every key a beat may carry besides its authoring `label`. */
const BEAT_KEYS = [
  "kind",
  "ms",
  "text",
  "actor",
  "to",
  "at",
  "by",
  "speed",
  "sprite",
  "faceLeft",
  "amp",
  "lift",
  "prop",
  "hidden",
  "sound",
];

/**
 * Load a cutscene tree.
 *
 * @param dir  the folder of `<id>.yaml` scenes (the game's `content/cutscenes`,
 *             or a mod's `cutscenes/`).
 * @returns `{ cutscenes, entries }` — `cutscenes` is the flat `{ id → def }`
 *          catalog the engine takes, variants expanded; `entries` is
 *          `[{ id, doc }]` in file order (the AUTHORED docs, variants intact)
 *          for the schema to validate. Throws on a structural error: a stem that
 *          disagrees with its `id`, a duplicate, or a variant patching a label
 *          the scene does not carry.
 */
export function loadCutscenes(dir = `${SHIPPED_ROOT}/cutscenes`) {
  const cutscenes = {};
  const entries = [];
  const errors = [];

  // A mod need not ship cutscenes; an absent tree is an empty catalog.
  if (!existsSync(dir)) return { cutscenes, entries };

  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".yaml"))
    .sort()) {
    const stem = file.slice(0, -".yaml".length);
    const doc = parse(readFileSync(`${dir}/${file}`, "utf8"));
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
      errors.push(`${file}: expected a mapping (a scene)`);
      continue;
    }
    if (doc.id !== stem) {
      errors.push(`${file}: id is "${doc.id}", expected "${stem}"`);
      continue;
    }
    if (doc.id in cutscenes) {
      errors.push(`duplicate cutscene id "${doc.id}"`);
      continue;
    }
    entries.push({ id: doc.id, doc });
    cutscenes[doc.id] = sceneDef(doc, doc.id);
    for (const [difficulty, patches] of Object.entries(doc.variants ?? {})) {
      const id = `${doc.id}_${difficulty}`;
      try {
        cutscenes[id] = sceneDef(patched(doc, patches), id);
      } catch (e) {
        errors.push(`${file}: variant "${difficulty}" — ${e.message}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `${errors.length} cutscene tree error(s):\n  ${errors.join("\n  ")}`,
    );
  }
  return { cutscenes, entries };
}

/** An authored scene doc → the `CutsceneDef` the player takes, under `id`. */
function sceneDef(doc, id) {
  const stage = doc.stage ?? {};
  return {
    id,
    stage: {
      ...pick(stage, ["width", "height", "backdrop", "palette", "drift"]),
      props: (stage.props ?? []).map((prop) => ({
        kind: prop.sprite,
        pos: prop.at,
        // A labelled prop keeps its label as the id beats address it by.
        ...(prop.label === undefined ? {} : { id: prop.label }),
        ...pick(prop, [
          "parallax",
          "wrap",
          "ground",
          "hidden",
          "needs",
          "until",
        ]),
      })),
    },
    actors: (doc.actors ?? []).map((actor) =>
      pick(actor, ["id", "sprite", "name", "at", "faceLeft", "hidden"]),
    ),
    beats: (doc.beats ?? []).map((beat) => pick(beat, BEAT_KEYS)),
  };
}

/**
 * One variant of a scene: the authored doc with each `label:`-ed prop and beat
 * shallow-merged with that label's patch. Shallow because a patch replaces a
 * whole value (a prop's sprite, a caption's lines) rather than editing inside
 * one — a deep merge on `text:` would append lines to the base scene's.
 */
function patched(doc, patches) {
  if (!patches || typeof patches !== "object" || Array.isArray(patches)) {
    throw new Error("expected a mapping of label → patch");
  }
  const labels = new Set(
    [...(doc.stage?.props ?? []), ...(doc.beats ?? [])]
      .map((node) => node?.label)
      .filter(Boolean),
  );
  for (const label of Object.keys(patches)) {
    if (!labels.has(label)) {
      throw new Error(
        `no part labelled "${label}" in this scene (it has ` +
          `${labels.size ? [...labels].map((l) => `"${l}"`).join(", ") : "none"})`,
      );
    }
  }
  const apply = (node) =>
    node?.label && patches[node.label]
      ? { ...node, ...patches[node.label] }
      : node;
  return {
    ...doc,
    stage: { ...doc.stage, props: (doc.stage?.props ?? []).map(apply) },
    beats: (doc.beats ?? []).map(apply),
  };
}

/**
 * Load the player-thought catalog.
 *
 * @param baseDir  the tree holding `thoughts.yaml` (the game's `content/`, or a
 *                 mod's root).
 * @returns `{ thoughts, capRotation, entries }` — `thoughts` is the flat
 *          `{ id → def }` catalog with each `id` stamped in, `capRotation` the
 *          authored cap-farm rotation (empty when the file omits it), `entries`
 *          `[{ id, def }]` in file order for the schema.
 */
export function loadThoughts(baseDir = SHIPPED_ROOT) {
  const { catalog, doc } = singleFile(baseDir, "thoughts.yaml", "thoughts");
  const thoughts = {};
  const entries = [];
  for (const [id, def] of Object.entries(catalog)) {
    thoughts[id] = { id, ...def };
    entries.push({ id, def });
  }
  const capRotation = doc?.capRotation ?? [];
  if (!Array.isArray(capRotation)) {
    throw new Error("thoughts.yaml: capRotation must be a list of thought ids");
  }
  return { thoughts, capRotation, entries };
}

/**
 * Load the story-item catalog.
 *
 * @param baseDir  the tree holding `story-items.yaml` (the game's `content/`, or
 *                 a mod's root).
 * @returns `{ storyItems, entries }`, shaped like `loadThoughts`.
 */
export function loadStoryItems(baseDir = SHIPPED_ROOT) {
  const { catalog } = singleFile(baseDir, "story-items.yaml", "storyItems");
  const storyItems = {};
  const entries = [];
  for (const [id, def] of Object.entries(catalog)) {
    storyItems[id] = { id, ...def };
    entries.push({ id, def });
  }
  return { storyItems, entries };
}

/** One of the two single-file catalogs: `{ doc, catalog }`, both empty when the
 * file is absent (a mod need ship neither). */
function singleFile(baseDir, file, key) {
  const source = `${baseDir}/${file}`;
  if (!existsSync(source)) return { doc: null, catalog: {} };

  const doc = parse(readFileSync(source, "utf8"));
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    throw new Error(`${file}: expected a YAML mapping`);
  }
  const catalog = doc[key];
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog)) {
    throw new Error(`${file}: expected a "${key}:" mapping of id → entry`);
  }
  return { doc, catalog };
}

/** The listed keys that are actually present, in list order. */
function pick(source, keys) {
  const out = {};
  for (const key of keys) {
    if (source?.[key] !== undefined) out[key] = source[key];
  }
  return out;
}
