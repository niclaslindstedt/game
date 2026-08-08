#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sound pipeline. Compiles `content/sounds/*.yaml` into the catalog the
// app's sfx bus plays from, the same way levels, enemies and items compile.
//
// It emits into `pwa/src/generated/` rather than `engine/generated/` because a
// sound is an APP concern, not an engine one: the engine emits events and has
// no idea they make noise, and putting the bank in the engine's tree would
// hand every consumer of `@game/core` 274 voices of data it never reads.
//
// Output is gitignored and regenerated on every build, like every other
// compiled catalog — `content/sounds/` is the source of truth.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { validateSound } from "./asset-tools/sound-schema.mjs";
import { loadSounds } from "./sound-data/load-yaml.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));

// The engine's event names, so a sound that answers an event nobody emits is
// caught here. Read from the source rather than imported: this generator has
// no other reason to load the engine, and a regex over a union of string
// literals is not the kind of thing that drifts.
const events = new Set(
  [
    ...readFileSync(
      path.join(root, "engine", "game", "types", "events.ts"),
      "utf8",
    ).matchAll(/type:\s*"([a-zA-Z]+)"/g),
  ].map((m) => m[1]),
);

// The CUES the app raises directly (`Cue` in pwa/src/game/sfx/cues.ts), read
// the same way and for the same reason: a sound answering a cue nobody raises
// is a sound that can never play, and that should be a build error rather than
// a silence somebody chases at 2am.
const cues = new Set(
  [
    ...(readFileSync(
      path.join(root, "pwa", "src", "game", "sfx", "cues.ts"),
      "utf8",
    ).match(/export type Cue =([^;]+);/)?.[1] ?? ""),
  ]
    .join("")
    .split("|")
    .map((part) => part.trim().replace(/^"|"$/g, ""))
    .filter(Boolean),
);

const { entries } = loadSounds();

const errors = [];
const warnings = [];
for (const { doc } of entries) {
  const res = validateSound(doc, { events, cues, shipped: true });
  errors.push(...res.errors);
  warnings.push(...res.warnings);
}

// Two sounds may not answer the SAME event shape (or the same cue): which one
// wins would be decided by file order, which is not a decision anybody made.
// Events and cues are separate key spaces, so they are claimed separately —
// `footstep|metal` and an event key can never collide.
const claimed = new Map();
for (const { id, doc } of entries) {
  if (!doc.on) continue;
  const key = isCue(doc.on) ? `cue ${cueKey(doc.on)}` : matchKey(doc.on);
  if (claimed.has(key)) {
    errors.push(
      `sounds "${claimed.get(key)}" and "${id}" both answer ${key} — ` +
        "one event shape, one sound",
    );
  }
  claimed.set(key, id);
}

for (const w of warnings) console.warn(`! ${w}`);
if (errors.length > 0) {
  console.error(
    `${errors.length} sound schema error(s):\n  ${errors.join("\n  ")}`,
  );
  process.exit(1);
}

/** Does this `on:` block answer a CUE rather than an event? */
function isCue(on) {
  return on.cue !== undefined;
}

/** An `on:` block as the string the runtime looks a sound up by. Mirrors
 * `routeKey` in pwa/src/game/sfx/index.ts — keep the two in step, and see the
 * comment there for what it costs when they drift. */
function matchKey(on) {
  return [
    on.type,
    on.weaponClass ?? "",
    on.crit ?? "",
    on.kind ?? "",
    on.tier ?? "",
  ].join("|");
}

/** …and the same for a cue. Mirrors `playCue` in pwa/src/game/sfx/cues.ts. */
function cueKey(on) {
  return [on.cue, on.surface ?? ""].join("|");
}

const byKey = Object.fromEntries(
  entries
    .filter((e) => e.doc.on && !isCue(e.doc.on))
    .map((e) => [matchKey(e.doc.on), e.id]),
);
const byCue = Object.fromEntries(
  entries
    .filter((e) => e.doc.on && isCue(e.doc.on))
    .map((e) => [cueKey(e.doc.on), e.id]),
);

/** One entry as the runtime holds it. The staging fields are emitted ONLY when
 * the author set them: a catalog in which every sound carries four `undefined`s
 * is four bytes a sound of nothing, and the whole bank is on the wire. */
const cook = (list) =>
  Object.fromEntries(
    list.map((e) => [
      e.id,
      {
        id: e.id,
        voices: e.doc.voices,
        ...(e.doc.spatial ? { spatial: true } : {}),
        ...(e.doc.loop ? { loop: true } : {}),
        ...(e.doc.stopOn === undefined ? {} : { stopOn: e.doc.stopOn }),
        ...(e.doc.fadeMs === undefined ? {} : { fadeMs: e.doc.fadeMs }),
      },
    ]),
  );

// SPLIT IN TWO, for the same reason `sfx/ui.ts` is not re-exported from the sfx
// barrel: the interface's sounds are on the app's STARTUP path (a menu makes a
// noise before any run exists), and the run's are not. One catalog would park
// every kill, explosion and jingle in the entry chunk to click a button — which
// is the 170 KB critical-path budget's whole concern, and measurably so: it
// cost 4 KB gzipped before this split.
const UI_PREFIX = "ui_";
const uiEntries = entries.filter((e) => e.id.startsWith(UI_PREFIX));
const runEntries = entries.filter((e) => !e.id.startsWith(UI_PREFIX));

const banner = `// @generated by scripts/generate-sounds.mjs — DO NOT EDIT.
// Source of truth: content/sounds/*.yaml. Regenerate with \`npm run levels\`
// (also runs inside \`npm run assets\` / \`make assets\`).
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0`;

const destDir = path.join(root, "pwa", "src", "generated");
mkdirSync(destDir, { recursive: true });

writeFileSync(
  path.join(destDir, "sounds.ts"),
  `${banner}
import type { SoundDef } from "../game/sfx/types.ts";

/** Every sound a RUN makes, by id. Not on the startup path — see the split in
 * scripts/generate-sounds.mjs. */
export const GENERATED_SOUNDS: Record<string, SoundDef> = ${JSON.stringify(cook(runEntries), null, 2)} as unknown as Record<string, SoundDef>;

/** Event shape → sound id, keyed exactly as \`routeKey\` builds it. */
export const GENERATED_SOUND_KEYS: Record<string, string> = ${JSON.stringify(byKey, null, 2)};

/** Cue → sound id, keyed \`cue|surface\` exactly as \`playCue\` builds it. A
 * cue is a moment the APP raises rather than one the engine emits — see
 * pwa/src/game/sfx/cues.ts. */
export const GENERATED_CUE_KEYS: Record<string, string> = ${JSON.stringify(byCue, null, 2)};
`,
);

writeFileSync(
  path.join(destDir, "sounds-ui.ts"),
  `${banner}
import type { SoundDef } from "../game/sfx/types.ts";

/** The INTERFACE's sounds — the slice the startup path may reach. */
export const GENERATED_UI_SOUNDS: Record<string, SoundDef> = ${JSON.stringify(cook(uiEntries), null, 2)} as unknown as Record<string, SoundDef>;
`,
);

console.log(
  `wrote pwa/src/generated/sounds.ts — ${runEntries.length} run sounds ` +
    `(${Object.keys(byKey).length} event-triggered, ` +
    `${Object.keys(byCue).length} cue-triggered); sounds-ui.ts — ` +
    `${uiEntries.length} ui sounds; ` +
    `${entries.reduce((n, e) => n + (e.doc.voices?.length ?? 0), 0)} ` +
    "voices total",
);
