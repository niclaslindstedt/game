---
title: A command copied into a lesson body loses the working directory it was run from
date: 2026-08-08
scope: .agents/skills
concepts: [lesson-writing, commands, cwd]
---

A lesson that quotes `node scripts/effects-gallery.mjs …` read as a root-level
script for months; the script is `pwa/scripts/effects-gallery.mjs` and the
SKILL.md block it was copied from carried a `# from pwa/` comment that the
fragment did not.

A SKILL.md can set the working directory once at the top of a section. A
fragment is read ALONE, out of any section, so every command in one has to be
runnable as written from the repo root — or say where it is run from. When
recording a lesson, re-read its commands as a stranger would: no surrounding
context, no cwd.
