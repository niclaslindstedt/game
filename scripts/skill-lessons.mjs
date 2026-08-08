#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Skill-lesson printer — the reading half of the `skill-reflection` skill.
//
// Lessons learned by past sessions live as one-file-per-lesson fragments under
// .agent/skills/<skill>/.lessons/<unix-timestamp>-<slug>.md, each with YAML
// front matter (title, date, and the optional scope/concepts filters) and the
// lesson in the body. Fragments — not SKILL.md edits — are how sessions record
// lessons, so parallel sessions never conflict on one file. This script is how
// the next session reads them back, and how a reflection pass finds the ones
// that have gone stale or say the same thing twice.
//
//   node scripts/skill-lessons.mjs                     inventory: skills with lesson counts
//   node scripts/skill-lessons.mjs <skill>             print a skill's lessons, oldest first
//   node scripts/skill-lessons.mjs <skill> --list      index only: file, scope, concepts, title
//   node scripts/skill-lessons.mjs --list              that index across every skill
//   node scripts/skill-lessons.mjs --vocab             every concept in use, with counts
//   node scripts/skill-lessons.mjs --check[ --strict]  validate fragments (exit 1 on problems)
//
// Filters (combine freely; --list applies to them too):
//
//   --scope=engine/game/bot            lessons relevant to a path (plus every global lesson)
//   --scope=a,b --no-global         …without the global ones, for a consolidation sweep
//   --concepts=nav-grid,fog         lessons carrying ANY of these concepts
//   --files=nav-grid,1753093100     lessons whose filename contains ANY of these

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(here, "..");
const SKILLS_DIR = path.join(REPO_ROOT, ".agent", "skills");
// Past this many fragments the printout nudges toward a consolidation pass
// (merge near-duplicates, prune stale ones, promote the load-bearing ones
// into SKILL.md) — see the `skill-reflection` skill.
const CONSOLIDATE_AT = 15;

const FILENAME_RE = /^\d+-[a-z0-9][a-z0-9-]*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CONCEPT_RE = /^[a-z0-9][a-z0-9-]*$/;

/**
 * Unwrap a YAML scalar. Only strips quotes when the value is genuinely
 * quoted at BOTH ends with the same character — a title that merely OPENS
 * with a quote ("Taking damage" and "low HP" are signals…) keeps it.
 */
function unquote(value) {
  const v = value.trim();
  const q = v[0];
  if ((q === '"' || q === "'") && v.length > 1 && v.endsWith(q)) {
    return v.slice(1, -1).replace(/\\(["'\\])/g, "$1");
  }
  return v;
}

/** Split a front-matter value that may be `a, b` or a `[a, b]` flow list. */
function splitList(value) {
  if (!value) return [];
  return value
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((s) => unquote(s))
    .filter(Boolean);
}

/**
 * Does a lesson's scope entry and a queried path talk about the same place?
 * Prefix in EITHER direction, so a lesson scoped `engine/game/bot/` answers a
 * query for `engine/game/bot/index.ts` and a query for `engine/` alike.
 */
function pathsOverlap(a, b) {
  const norm = (p) => p.replace(/^\.\//, "").replace(/\/+$/, "");
  const x = norm(a);
  const y = norm(b);
  return x === y || x.startsWith(y + "/") || y.startsWith(x + "/");
}

function parseFragment(file) {
  const raw = readFileSync(file, "utf8");
  const name = path.basename(file);
  const errors = [];
  const warnings = [];
  if (!FILENAME_RE.test(name)) {
    errors.push("filename must be <unix-timestamp>-<slug>.md");
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    return {
      name,
      title: "",
      date: "",
      scope: [],
      concepts: [],
      body: raw.trim(),
      errors: [...errors, "missing YAML front matter (--- title/date ---)"],
      warnings,
    };
  }
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = unquote(kv[2]);
  }
  if (!meta.title) errors.push("front matter is missing a title");
  if (!meta.date) errors.push("front matter is missing a date");
  else if (!DATE_RE.test(meta.date))
    errors.push(`date "${meta.date}" is not YYYY-MM-DD`);

  // scope is OPTIONAL — a lesson with no scope is global, true everywhere.
  const scope = splitList(meta.scope);
  for (const p of scope) {
    if (p.startsWith("/") || p.includes("..")) {
      errors.push(`scope "${p}" must be a repo-relative path`);
    } else if (!existsSync(path.join(REPO_ROOT, p))) {
      // Not a format error — a scope whose path is gone is the single best
      // signal that the lesson itself has gone stale, so it is surfaced for a
      // human/agent call rather than failing the format check.
      warnings.push(`scope "${p}" no longer exists in the repo`);
    }
  }
  const concepts = splitList(meta.concepts);
  for (const c of concepts) {
    if (!CONCEPT_RE.test(c))
      errors.push(`concept "${c}" must be lower-case kebab (a-z0-9-)`);
  }

  const body = m[2].trim();
  if (!body) errors.push("empty body — the lesson goes in the body");
  return {
    name,
    title: meta.title ?? "",
    date: meta.date ?? "",
    scope,
    concepts,
    body,
    errors,
    warnings,
  };
}

function lessonsFor(skill) {
  const dir = path.join(SKILLS_DIR, skill, ".lessons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => parseFragment(path.join(dir, f)))
    .sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : a.name.localeCompare(b.name),
    );
}

function allSkills() {
  return readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter(
      (e) =>
        e.isDirectory() &&
        existsSync(path.join(SKILLS_DIR, e.name, "SKILL.md")),
    )
    .map((e) => e.name)
    .sort();
}

// ---------------------------------------------------------------- arguments

const args = process.argv.slice(2);
const flagValue = (flag) => {
  const hit = args.find((a) => a === `--${flag}` || a.startsWith(`--${flag}=`));
  if (!hit) return undefined;
  const eq = hit.indexOf("=");
  return eq === -1 ? "" : hit.slice(eq + 1);
};
const has = (flag) => args.some((a) => a === `--${flag}`);

const checking = has("check");
const strict = has("strict");
const listing = has("list");
const vocab = has("vocab");
const noGlobal = has("no-global");
const scopeFilter = splitList(flagValue("scope"));
const conceptFilter = splitList(flagValue("concepts")).map((c) =>
  c.toLowerCase(),
);
const fileFilter = splitList(flagValue("files"));
const filtering =
  scopeFilter.length > 0 || conceptFilter.length > 0 || fileFilter.length > 0;
const skill = args.find((a) => !a.startsWith("--"));

if (skill && !existsSync(path.join(SKILLS_DIR, skill, "SKILL.md"))) {
  console.error(
    `Unknown skill "${skill}". Available: ${allSkills().join(", ")}`,
  );
  process.exit(1);
}

const targets = skill ? [skill] : allSkills();

function matches(lesson) {
  if (fileFilter.length && !fileFilter.some((f) => lesson.name.includes(f)))
    return false;
  if (
    conceptFilter.length &&
    !lesson.concepts.some((c) => conceptFilter.includes(c.toLowerCase()))
  )
    return false;
  if (scopeFilter.length) {
    // A lesson with NO scope is global: it answers every path query, unless
    // the caller explicitly asked for the scoped ones only.
    if (!lesson.scope.length) return !noGlobal;
    if (!lesson.scope.some((s) => scopeFilter.some((q) => pathsOverlap(s, q))))
      return false;
  }
  return true;
}

function selected(skillName) {
  return lessonsFor(skillName).filter(matches);
}

// ------------------------------------------------------------------- modes

function describeFilter() {
  const parts = [];
  if (scopeFilter.length) parts.push(`scope ${scopeFilter.join(", ")}`);
  if (conceptFilter.length) parts.push(`concepts ${conceptFilter.join(", ")}`);
  if (fileFilter.length) parts.push(`files ${fileFilter.join(", ")}`);
  if (noGlobal) parts.push("scoped only");
  return parts.length ? ` — filtered by ${parts.join("; ")}` : "";
}

function printIndex(skillName, lessons) {
  console.log(
    `# ${skillName} — ${lessons.length} lesson(s)${describeFilter()}\n`,
  );
  for (const l of lessons) {
    console.log(l.name);
    console.log(`   ${l.title || "(untitled)"}`);
    const scope = l.scope.length ? l.scope.join(", ") : "(global)";
    const concepts = l.concepts.length ? l.concepts.join(", ") : "(none)";
    console.log(`   scope: ${scope}  ·  concepts: ${concepts}\n`);
  }
}

function printBodies(skillName, lessons) {
  console.log(
    `# Lessons learned — ${skillName} (${lessons.length})${describeFilter()}\n`,
  );
  for (const l of lessons) {
    console.log(`## ${l.title || l.name} (${l.date || "undated"})\n`);
    const scope = l.scope.length ? l.scope.join(", ") : "(global)";
    const concepts = l.concepts.length ? l.concepts.join(", ") : "(none)";
    console.log(`_${l.name} · scope: ${scope} · concepts: ${concepts}_\n`);
    console.log(l.body + "\n");
    for (const err of l.errors) console.error(`   ⚠ ${l.name}: ${err}`);
    for (const w of l.warnings) console.error(`   ⚠ ${l.name}: ${w}`);
  }
}

function nudge(skillName, total) {
  if (total <= CONSOLIDATE_AT) return;
  console.log(
    `⚠ ${skillName} has ${total} fragments — due for a consolidation pass. Load the \`skill-reflection\` skill: merge near-duplicates, delete stale lessons, promote the load-bearing ones into SKILL.md.`,
  );
}

if (checking) {
  let bad = 0;
  let stale = 0;
  for (const s of targets) {
    for (const lesson of lessonsFor(s)) {
      for (const err of lesson.errors) {
        console.error(`✗ ${s}/.lessons/${lesson.name}: ${err}`);
        bad++;
      }
      for (const w of lesson.warnings) {
        console.error(`⚠ ${s}/.lessons/${lesson.name}: ${w}`);
        stale++;
      }
    }
  }
  if (stale)
    console.error(
      `\n${stale} lesson(s) point at a path that no longer exists — likely stale. Load the \`skill-reflection\` skill to re-scope or delete them.`,
    );
  if (bad || (strict && stale)) process.exit(1);
  console.log("All lesson fragments are well-formed.");
} else if (vocab) {
  const counts = new Map();
  for (const s of targets)
    for (const l of selected(s))
      for (const c of l.concepts) counts.set(c, (counts.get(c) ?? 0) + 1);
  if (!counts.size) {
    console.log("No concepts recorded yet.");
  } else {
    console.log(`# Concept vocabulary${describeFilter()}\n`);
    for (const [c, n] of [...counts].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    )) {
      console.log(`${String(n).padStart(4)}  ${c}`);
    }
    console.log(
      `\nNear-duplicate tags are a consolidation smell — merge them in the same pass that merges the lessons.`,
    );
  }
} else if (!skill && !listing && !filtering) {
  // Inventory: every skill that has lessons, with counts.
  const rows = allSkills()
    .map((s) => ({ skill: s, count: lessonsFor(s).length }))
    .filter((r) => r.count > 0);
  if (!rows.length) {
    console.log("No skill has lesson fragments yet (load `skill-reflection`).");
  } else {
    for (const r of rows) {
      const tail =
        r.count > CONSOLIDATE_AT ? "  ← due for a consolidation pass" : "";
      console.log(`${String(r.count).padStart(3)}  ${r.skill}${tail}`);
    }
    console.log(`\nPrint one with: node scripts/skill-lessons.mjs <skill>`);
  }
} else {
  let printedAny = false;
  for (const s of targets) {
    const all = lessonsFor(s);
    const lessons = all.filter(matches);
    if (!lessons.length) {
      if (skill)
        console.log(
          `${s} has no matching lesson fragments (.agent/skills/${s}/.lessons/)${describeFilter()}.`,
        );
      continue;
    }
    printedAny = true;
    if (listing) printIndex(s, lessons);
    else printBodies(s, lessons);
    nudge(s, all.length);
  }
  if (printedAny) {
    console.log(
      "Before this session commits, load the `skill-reflection` skill: reword or delete what has gone stale, merge what now says the same thing twice, and promote anything that is true in 100% of this skill's runs into SKILL.md itself.",
    );
  }
}
