---
name: skill-reflection
description: "Use at BOTH ends of any session that loads another skill. At the START, to read that skill's accumulated lessons — filtered to the paths and concepts the task touches — before doing the work. At the END, before committing, to reflect on what the session actually learned: record new lessons, reword or delete the ones that went stale, merge the ones that now say the same thing twice, promote the ones that are true every single time into SKILL.md itself, fix instructions the session found to be WRONG, and check whether anything sitting in AGENTS.md belongs in a skill instead. Also the owner of the lesson-fragment format (title, date, scope, concepts) and of `scripts/skill-lessons.mjs`."
---

# Skill reflection

Every other skill in this repo is a playbook that gets better only if somebody
makes it better. This is that somebody. It runs **twice per session** — once
before the work, once before the commit — and it is the ONLY skill that is
allowed to rewrite another skill's `SKILL.md`.

**If a session loaded a skill, it owes that skill a reflection pass.** Loading a
playbook and learning nothing back into it is how a playbook rots: the trap you
hit at 40% through the session is the trap the next session hits too.

---

## The two halves

| When                                 | Do                                                                            |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| **OPEN** — right after loading a skill | Read its lessons, filtered to what this task touches. Costs seconds.          |
| **CLOSE** — before the commit         | Record, prune, merge, promote, correct. Same PR as the work that taught it.   |

Both halves run against **every** skill the session loaded, not just the main
one. A session that loaded `weapon-system` and `pixel-assets` owes two passes.

---

## OPEN — read before you work

```sh
node scripts/skill-lessons.mjs <skill> --list          # the index: file, title, scope, concepts
node scripts/skill-lessons.mjs <skill>                 # the full text, oldest first
```

On a big skill (`bot-improvement` has 30+), do not read all of it. **Narrow by
what the task actually touches:**

```sh
node scripts/skill-lessons.mjs bot-improvement --scope=src/game/bot
node scripts/skill-lessons.mjs weapon-system --concepts=ammo,durability
node scripts/skill-lessons.mjs --scope=content/hud            # across every skill
node scripts/skill-lessons.mjs art-improvement --files=1785624300
```

Three things about the filters, all load-bearing:

- **A lesson with no `scope` is GLOBAL** — it answers every `--scope` query,
  because it is true everywhere. That is the default and it is the honest
  default: only scope a lesson when it genuinely stops being true outside that
  path.
- **`--scope` matches as a path prefix in EITHER direction.** A lesson scoped
  `src/game/bot/` answers `--scope=src/game/bot/index.ts` and `--scope=src/`
  alike, so you never have to guess the exact granularity somebody used.
- **`--concepts` is OR within the flag, AND against the other flags.** Read the
  vocabulary with `node scripts/skill-lessons.mjs --vocab` when you don't know
  what tags exist.

Reading the lessons is part of loading the skill. Do it before the first edit,
not after the first surprise.

---

## The fragment format

```
.agent/skills/<skill>/.lessons/<unix-timestamp>-<slug>.md
```

```markdown
---
title: One-line gist of the lesson (what the next session must know)
date: YYYY-MM-DD
scope: src/game/bot/, content/bot.yaml
concepts: [nav-grid, pathfinding, stall-detection]
---

The lesson itself: concrete, self-contained, written for a session that has
NOT seen the pass that taught it. Name the files/commands involved and the
failure it prevents.
```

| Field      | Required | What it means                                                                                                                                            |
| ---------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`    | yes      | The gist in one line. Written as a CLAIM, not a topic — "Nav grid caches per level, so a new wall needs `obstaclesVersion`", never "About the nav grid".  |
| `date`     | yes      | `YYYY-MM-DD`, the day it was learned. On a merge, keep the OLDEST source's date.                                                                          |
| `scope`    | no       | Repo-relative paths (dirs or files) where the lesson applies. Comma-separated. **Omitted = global.**                                                      |
| `concepts` | no       | Lower-case kebab tags, comma-separated or `[a, b]`. What the lesson is ABOUT, so a task can find it without knowing which pass wrote it.                  |

- The filename timestamp is `$(date +%s)` at recording time (same scheme as
  `.changes/unreleased/`).
- One lesson per fragment. Two things learned = two fragments. Fragments — never
  a `SKILL.md` edit — are how a session records a lesson, because parallel
  sessions appending to one file conflict and separate fragments never do.
- Keep the body a few sentences to a short paragraph. Anything bigger is
  probably a `SKILL.md` section and belongs in the promote step below.

**Scoping honestly is what makes the filter worth having.** Scope to the
NARROWEST path where the lesson stays true — the module, the catalog directory,
the one file. A lesson scoped `src/` is a lesson that should have had no scope
at all. And a scope pointing at a path that no longer exists is the single best
staleness signal there is: `--check` reports every one.

**Concepts are what a future task would search for**, not a restatement of the
title. Reuse an existing tag over inventing a synonym — `node
scripts/skill-lessons.mjs --vocab` is the vocabulary, and two tags meaning one
thing is itself a consolidation smell.

---

## CLOSE — reflect before you commit

Run this for every skill the session loaded, as the last thing before the
commit. It is five questions, in this order.

### 1. What did this session learn? → record it

A gotcha, a heuristic, a failure mode, a step you wish you'd known, a tuning
number that worked. Write it in the **same PR** as the work that taught it:

```sh
cat > .agent/skills/<skill>/.lessons/$(date +%s)-short-slug.md <<'EOF'
---
title: …
date: YYYY-MM-DD
scope: …
concepts: [ …, … ]
---

…
EOF
```

Be honest about **what went wrong AND what went right**. A pass that found the
right approach on the third try owes a lesson naming the first two — the next
session skips them. A pass where the skill's own steps worked exactly as
written owes nothing; silence is a legitimate outcome.

### 2. Did the skill tell you something WRONG? → fix `SKILL.md` in place

A command that no longer exists, a path that moved, a step that has been
automated, a claim the session disproved. **That is a bug in the playbook, not a
lesson** — fix the line where it stands. Never leave a fragment saying "step 4
is wrong" next to a step 4 that is still wrong.

### 3. Has a lesson gone stale? → delete it

A lesson obsoleted by a tooling or instruction change — the manual step became a
command, the trap got a lint, the file it warned about is gone — is **deleted,
not archived**. Git remembers. `node scripts/skill-lessons.mjs --check` names
every lesson whose `scope` points at a vanished path; those are the obvious
ones, but a lesson can rot without its paths moving, so read the ones your task
touched with the session's fresh knowledge.

### 4. Do two lessons say the same thing? → merge them

Several fragments circling one rule become ONE fragment: **new filename
timestamp, `date` kept from the OLDEST source, `scope` and `concepts` unioned**,
body rewritten to cover every merged case. Delete the sources. Near-duplicate
concepts (`nav`/`nav-grid`, `sfx`/`sound`) get merged in the same pass.

### 5. Is a lesson true EVERY time? → promote it into `SKILL.md`

**This is the most valuable half of the pass.** A lesson that every run of the
skill re-reads and obeys is not a lesson anymore — it is an instruction, and
leaving it in `.lessons/` means every future session pays to rediscover that it
matters. The test is literal: **would this apply in 100% of this skill's runs?**
If yes, it belongs in the skill's own text.

Promote it to the right place — a step in the workflow, a row in a rubric, a
checklist item, a refusal in the checker when it is mechanically checkable —
then **delete the fragment**. A promoted lesson lives in exactly one place.

A lesson that applies in most-but-not-all runs stays a fragment, and gets a
`scope` that says where it applies. That is what `scope` is for.

**Reflection is the ONLY time lesson content moves into a `SKILL.md`.**

---

## The sixth question — does this belong in AGENTS.md at all?

`AGENTS.md` is read at the start of **every** session, whatever the task. That
makes it the most expensive text in the repo, and it is under constant pressure
to grow: every rule learned the hard way wants to live there.

**AGENTS.md is a ROUTER, not a manual.** A rule earns its place there only if it
is true for essentially every task, or if a session would trip over it before it
knew which skill to load. Everything else belongs in the skill that owns the
subject, with AGENTS.md keeping at most a one-line pointer.

When a session touched `AGENTS.md`, or noticed a section it never used, ask:

| The content is…                                                        | Where it goes                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------ |
| A rule only a certain KIND of task needs                               | that task's skill; AGENTS.md keeps a pointer row       |
| A procedure with steps, commands or a checklist                        | a skill — AGENTS.md holds no procedures                |
| A trap that bites BEFORE a skill is loaded (an import direction, a budget) | stays in AGENTS.md                                  |
| A pointer table (which doc, which skill, where new code goes)          | stays in AGENTS.md — that IS the router                |
| Already stated in a skill                                              | delete the AGENTS.md copy, keep the pointer            |

**Move it into an EXISTING skill wherever one fits.** A new skill is its own
overhead — the router grows a row, and a session has to know to load it. Only
create one when no existing skill owns the subject.

Two rules on the move itself: the pointer left behind must name the skill by
name (`load the \`commit\` skill`), so the router still routes; and the moved
text must not be duplicated — a rule in two places drifts, and then neither is
trustworthy.

---

## The consolidation sweep

Everything above is per-session and cheap. When `skill-lessons.mjs` nudges (more
than 15 fragments on one skill), run the same five questions across the skill's
WHOLE lesson set rather than only the ones the session touched:

```sh
node scripts/skill-lessons.mjs <skill> --list      # scan every title/scope/concept at once
node scripts/skill-lessons.mjs --vocab             # find synonym tags to merge
node scripts/skill-lessons.mjs --check             # find scopes pointing at vanished paths
```

Make it **its own commit** — separate from any work in progress, so it is
reviewable, revertible, and cannot conflict with a half-finished pass.

A sweep is complete when every remaining fragment is distinct, still true,
correctly scoped, and not yet important enough to be an instruction.

---

## Checklist

- [ ] OPEN: read each loaded skill's lessons, narrowed by `--scope`/`--concepts`
- [ ] CLOSE: a fragment for anything this session learned (with `scope` + `concepts`)
- [ ] CLOSE: anything the skill said that was WRONG, fixed in `SKILL.md` in place
- [ ] CLOSE: stale lessons deleted, near-duplicates merged
- [ ] CLOSE: anything true in 100% of runs promoted into `SKILL.md`, fragment deleted
- [ ] CLOSE: `node scripts/skill-lessons.mjs --check` clean
- [ ] CLOSE: nothing was appended to `AGENTS.md` that a skill should own
- [ ] A consolidation sweep, if a skill is over the nudge — as its own commit
