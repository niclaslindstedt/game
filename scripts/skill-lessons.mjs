#!/usr/bin/env node
// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Skill-lesson printer (see .agent/skills/LESSONS.md): lessons learned by
// past sessions live as one-file-per-lesson fragments under
// .agent/skills/<skill>/.lessons/<unix-timestamp>-<slug>.md, each with YAML
// front matter (title, date) and the lesson in the body. Fragments — not
// SKILL.md edits — are how sessions record lessons, so parallel sessions
// never conflict on one file. This script is how the next session reads
// them back.
//
//   node scripts/skill-lessons.mjs                  list skills with lesson counts
//   node scripts/skill-lessons.mjs <skill>          print a skill's lessons, oldest first
//   node scripts/skill-lessons.mjs <skill> --check  validate fragments (exit 1 on problems)
//   node scripts/skill-lessons.mjs --check          validate every skill's fragments

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(here, "..", ".agent", "skills");
// Past this many fragments the printout nudges toward a consolidation pass
// (merge near-duplicates, prune stale ones, promote the load-bearing ones
// into SKILL.md) — see .agent/skills/LESSONS.md.
const CONSOLIDATE_AT = 15;

const FILENAME_RE = /^\d+-[a-z0-9][a-z0-9-]*\.md$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseFragment(file) {
  const raw = readFileSync(file, "utf8");
  const name = path.basename(file);
  const errors = [];
  if (!FILENAME_RE.test(name)) {
    errors.push("filename must be <unix-timestamp>-<slug>.md");
  }
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    return {
      name,
      title: "",
      date: "",
      body: raw.trim(),
      errors: [...errors, "missing YAML front matter (--- title/date ---)"],
    };
  }
  const meta = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].replace(/^["']|["']$/g, "").trim();
  }
  if (!meta.title) errors.push("front matter is missing a title");
  if (!meta.date) errors.push("front matter is missing a date");
  else if (!DATE_RE.test(meta.date))
    errors.push(`date "${meta.date}" is not YYYY-MM-DD`);
  const body = m[2].trim();
  if (!body) errors.push("empty body — the lesson goes in the body");
  return { name, title: meta.title ?? "", date: meta.date ?? "", body, errors };
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

function check(skills) {
  let bad = 0;
  for (const skill of skills) {
    for (const lesson of lessonsFor(skill)) {
      for (const err of lesson.errors) {
        console.error(`✗ ${skill}/.lessons/${lesson.name}: ${err}`);
        bad++;
      }
    }
  }
  if (bad) process.exit(1);
  console.log("All lesson fragments are well-formed.");
  return;
}

const args = process.argv.slice(2);
const checking = args.includes("--check");
const skill = args.find((a) => !a.startsWith("--"));

if (skill && !existsSync(path.join(SKILLS_DIR, skill, "SKILL.md"))) {
  console.error(
    `Unknown skill "${skill}". Available: ${allSkills().join(", ")}`,
  );
  process.exit(1);
}

if (checking) {
  check(skill ? [skill] : allSkills());
} else if (!skill) {
  // Inventory: every skill that has lessons, with counts.
  const rows = allSkills()
    .map((s) => ({ skill: s, count: lessonsFor(s).length }))
    .filter((r) => r.count > 0);
  if (!rows.length) {
    console.log(
      "No skill has lesson fragments yet (see .agent/skills/LESSONS.md).",
    );
  } else {
    for (const r of rows) {
      const nudge =
        r.count > CONSOLIDATE_AT ? "  ← due for a consolidation pass" : "";
      console.log(`${String(r.count).padStart(3)}  ${r.skill}${nudge}`);
    }
    console.log(`\nPrint one with: node scripts/skill-lessons.mjs <skill>`);
  }
} else {
  const lessons = lessonsFor(skill);
  if (!lessons.length) {
    console.log(
      `${skill} has no lesson fragments yet (.agent/skills/${skill}/.lessons/).`,
    );
    process.exit(0);
  }
  console.log(`# Lessons learned — ${skill} (${lessons.length})\n`);
  for (const l of lessons) {
    console.log(`## ${l.title || l.name} (${l.date || "undated"})\n`);
    console.log(l.body + "\n");
    for (const err of l.errors) console.error(`   ⚠ ${l.name}: ${err}`);
  }
  if (lessons.length > CONSOLIDATE_AT) {
    console.log(
      `⚠ ${lessons.length} fragments — due for a consolidation pass: merge near-duplicates, delete stale lessons, promote load-bearing ones into SKILL.md (see .agent/skills/LESSONS.md).`,
    );
  }
}
