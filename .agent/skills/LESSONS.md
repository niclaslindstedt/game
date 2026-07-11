# Skill lessons — the fragment convention

Skills accumulate **lessons learned** — gotchas, heuristics, failure modes
discovered mid-pass that the next session should know. Lessons are recorded
as **one file per lesson** under the skill's `.lessons/` directory, never by
appending to `SKILL.md`: parallel sessions appending bullets to the same
section of one file is a guaranteed merge conflict, while two sessions each
adding their own fragment never collide.

## Format

```
.agent/skills/<skill>/.lessons/<unix-timestamp>-<short-slug>.md
```

```markdown
---
title: One-line gist of the lesson (what the next session must know)
date: YYYY-MM-DD
---

The lesson itself: concrete, self-contained, written for a session that has
NOT seen the pass that taught it. Name the files/commands involved and the
failure it prevents.
```

- The filename timestamp is `$(date +%s)` at recording time (same scheme as
  `.changes/unreleased/`); the front-matter `date` is the human-readable day.
- One lesson per fragment. Two things learned = two fragments.
- Keep the body a few sentences to a short paragraph — a fragment is a
  gotcha, not a chapter. Anything bigger is probably a `SKILL.md` section
  and should go through consolidation (below).

## Recording a lesson

When a pass teaches you something (a tuning heuristic, a failure mode, a
step you wish you'd known), write a fragment **in the same PR** as the work
that taught it:

```sh
cat > .agent/skills/<skill>/.lessons/$(date +%s)-short-slug.md <<'EOF'
---
title: …
date: YYYY-MM-DD
---

…
EOF
```

Do **not** edit `SKILL.md` to add the lesson. The exceptions that are still
edited in place, because they are the skill's operating data rather than
narrative lessons: an instruction that is factually WRONG (fixing a bug in a
step is a bugfix, not a lesson), the `update-*` skills' mapping tables, and
`.last-updated` baselines.

## Reading lessons

```sh
node scripts/skill-lessons.mjs              # which skills have lessons, and how many
node scripts/skill-lessons.mjs <skill>      # print a skill's lessons, oldest first
node scripts/skill-lessons.mjs --check      # validate every fragment's front matter
```

Reading the skill's lessons is part of loading the skill: run the printer
before starting the kind of work the skill covers.

## Consolidation — the lifecycle pass

Fragments accumulate; left alone they rot. When the printer nudges (more
than 15 fragments) or you notice overlap while reading, run a **consolidation pass**
as its own commit (so it is reviewable and revertible, and so it can't
conflict with a work-in-progress pass):

1. **Merge near-duplicates.** Several fragments circling one rule become ONE
   fragment: new filename timestamp, `date` kept from the OLDEST source,
   body rewritten to cover all the merged cases. Delete the sources.
2. **Delete stale lessons.** A lesson obsoleted by a tooling or instruction
   change (the manual step became a command, the trap got a lint) is
   deleted, not kept for history — git remembers.
3. **Promote the load-bearing ones.** A lesson every pass re-reads and obeys
   is not a lesson anymore — it is an instruction. Fold it into the right
   place in `SKILL.md` (a rubric row, a checklist item, a step, a checker
   extension when it's mechanically checkable), then delete the fragment.
   Consolidation is the ONLY time lessons move into `SKILL.md`.

A consolidation pass is complete when every remaining fragment is distinct,
still true, and not yet important enough to be an instruction.
