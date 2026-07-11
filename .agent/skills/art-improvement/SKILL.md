---
name: art-improvement
description: "Use when hunting down and replacing the WORST art in the game. Drives the audit funnel: numbered contact sheets per level (or of the item catalog), shortlist the worst 30 → 20 → 10, study the finalists with their variants, sketch 5 manuscript-grounded concepts per candidate, refine the pick with 2 more, install the winners, then present a numbered before/after sheet the user votes on — the PR ships only the liked candidates."
---

# Improving the Game's Worst Art

A structured pass that finds the weakest sprites in the shipped game and
replaces them — grounded in the story, judged with eyes on rendered pixels
at every step, and gated by the user's vote before anything ships. This
skill layers a *selection and approval workflow* on top of the
[`pixel-assets`](../pixel-assets/SKILL.md) skill; load that one too — its
palette rules, iteration cycle, and quality checklist govern every redraw
here.

**Two modes — run exactly one per pass:**

- **`levels`** — the world's art, level by level: enemies, tiles,
  landmarks, obstacles, walls, decor, the merchant. What the player sees
  on the field.
- **`items`** — the item catalog: weapon/gear/ability/story icons and
  ground pickups. What the player sees in the inventory and drop rain.

Main sprites only: the funnel judges base frames — battle-damage variants
are generated from them and follow automatically (they only reappear in
the finalists' study sheets and in verification).

## The helper: `art-audit.mjs`

Every step has a command (`node website/scripts/art-audit.mjs …`). Sheets
render from the sprite-data grids — the same source `make assets` reads —
into `website/assets-preview/audit/` (gitignored). Every cell is numbered
and legend-listed, so a shortlist round is "look at the sheet, write down
numbers".

| Command                     | Step it serves                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `levels`                    | List level ids to iterate                                                                                  |
| `level <id>`                | Survey: one numbered sheet of ALL main art in that level, over that level's own ground tile                |
| `items`                     | Survey: numbered sheet(s) of the whole item catalog (paginated `_pN` past 64 entries)                      |
| `sheet <name...>`           | Funnel rounds: a numbered sheet of exactly the named sprites (30 → 20 → 10)                                |
| `variants <name...>`        | Finalist study: each name expanded to all frames, wound stages, rock footprints, worn overlays             |
| `snapshot <name...>`        | Preserve the CURRENT renders as "before" PNGs — run BEFORE touching any grid                               |
| `concepts <module.mjs>`     | Render a concept scratch module (current sprite first, then each concept, numbered)                        |
| `before-after <name...>`    | The final review sheet: numbered BEFORE\|AFTER pairs from the snapshots vs the current grids               |
| `names <regex>`             | Grep atlas sprite names when unsure what a thing is called                                                 |

Flags: `--out <png>`, `--scale <n>`, `--cols <n>`, `--chunk <n>`. Names
accept the base (`wraith`) or an exact key (`wraith_0`).

## Phase 1 — Survey: build the long list

1. Run `make assets` first so grids, atlas, and warnings are current; note
   any contrast/orphan warnings — they are pre-scored offenders.
2. `levels` mode: for each id from `art-audit.mjs levels`, generate
   `level <id>` and **Read every sheet**. `items` mode: generate `items`
   and Read every page. (The hero appears on every level sheet — judge
   him once.)
3. Judge each numbered cell against the **worst-art rubric** below. Keep a
   running table — `sprite name | where seen | defects | severity 1–5` —
   in sprite names, never bare numbers (numbers restart per sheet/page).
4. Collect the **worst 30** by severity. Tie-break toward sprites the
   player sees most (common minions, the level-1 catalog, ground tiles
   beat one-off decor).

### The worst-art rubric

Score a sprite down for each defect that shows **in the rendered sheet**,
not from memory:

- **Unreadable silhouette** — at 1x you cannot tell what it is.
- **Blob syndrome** — no internal anatomy; a filled outline with eyes.
- **Ground camouflage** — separates poorly from its level's ground tile.
- **Palette mud** — too many near-identical shades; no ramp discipline.
- **Pillow shading / no light** — shaded from all sides, or dead flat
  where its family neighbors carry top-left light.
- **Noise** — orphan pixels, dithering soup, ragged edges.
- **Scale/hierarchy lies** — an elite that reads smaller or quieter than
  a minion; a boss without visual weight; decor louder than threats.
- **Style drift** — outline weight, saturation, or detail density unlike
  the rest of its family.
- **Story mismatch** — doesn't look like what the manuscript and its def
  say it is (a "prospector" with no mining kit).
- **Placeholder energy** — flat rectangles, single-color shapes, obvious
  first drafts.

## Phase 2 — Funnel: 30 → 20 → 10

1. `sheet <the 30 names>` → Read it → re-judge side by side (worst art is
   relative: a sprite that looked passable alone can sink next to
   stronger peers) → keep the worst **20**.
2. `sheet <the 20 names>` → Read → keep the worst **10**.
3. Write the final list of 10 with a one-line defect statement each —
   these become the redesign briefs. Number them 1–10 now; this order is
   used for everything that follows, including the final vote.

## Phase 3 — Study the finalists, then snapshot

1. `variants <the 10 names>` → Read: see each candidate with its walk
   frames, wound stages, footprint sizes, and worn overlays — the redraw
   must serve all of them (wounds regenerate automatically; check the
   base reads through them).
2. **`snapshot <the 10 names>` — mandatory, BEFORE any grid is edited.**
   The before/after sheet is built from these PNGs; there is no other
   "before". (If a snapshot was missed, recover the old grid from git
   history before editing further.)

## Phase 4 — Redesign each candidate (× 10)

For each candidate, in the numbered order:

1. **Ground it in the manuscript.** `docs/manuscript.md` is the story's
   source of truth: read what this thing IS — its dialogue, the level
   intro that names it, its lore page, its role in the scene. Check its
   def too (`ENEMY_DEFS` role/gore, the level's `foes` label, an item's
   name and blurb). Write a 1–2 sentence **design brief**: what the
   sprite must communicate, straight from the fiction. Art must serve the
   manuscript — if a redesign would contradict it, redesign differently
   or ask the user; never edit the manuscript for an art pass.
2. **Sketch 5 concepts** in a scratch module in the session scratchpad
   (never under `website/`):

   ```js
   // concepts-wraith.mjs
   export default {
     base: "wraith", // anchors palette scope, ground tile, size reference
     palette: {}, // optional extra chars for this sketch round only
     sprites: { concept_a: ["…16 rows…"], concept_b: [], /* … 5 total */ },
   };
   ```

   Make the five genuinely different answers to the brief (pose, anatomy,
   bulk, read), not one drawing five times. Follow the pixel-assets rules:
   silhouette first, family palette ramps, 2–5 colors plus outline,
   top-left light, correct size class for its role.
3. **Render and pick**: `concepts <module>` → Read the sheet (the current
   sprite renders first for comparison) → judge each concept against the
   brief and the rubric → pick the strongest **one**.
4. **Refine**: make **2 more variations** of the pick (push what works,
   fix what doesn't) → render the pick + both refinements together →
   choose the best of the 3.
5. **Install the winner** in its family module under
   `website/scripts/sprite-data/` (both walk frames for animated sprites
   — redraw `_1` to match, don't leave a mismatched old frame; new chars
   go in the FAMILY palette; check `wounds` overrides still apply).
6. **Verify**: `make assets` (heed every warning), then Read the family
   sheet and the `@8x` preview per the pixel-assets checklist, and
   `variants <name>` to confirm frames, wounds, and overlays still read.
7. **Commit this candidate alone** — grid change + regenerated
   `atlas.png`/`atlas.json` together, conventional message, e.g.
   `feat(assets): redraw wraith with a torn-shroud silhouette`. One commit
   per candidate is what makes Phase 6's per-candidate revert trivial.

## Phase 5 — The before/after vote

1. With all 10 committed: `before-after <the 10 names in order>` → Read
   it yourself first (a swap that looks wrong here goes back to Phase 4).
2. Send the sheet to the user and ask which candidates should ship,
   referring to them by their numbers. Use `AskUserQuestion`
   (multi-select; batch the 10 across questions — options are capped at
   4 per question) or a plain "reply with the numbers to keep". Do not
   proceed without an answer — the vote is the point of the sheet.

## Phase 6 — Ship what the user liked

1. `git revert` the commits of every candidate the user did NOT pick
   (this is why each got its own commit), then `make assets` and commit
   the regenerated atlas if the reverts left it stale.
2. `make test && make lint && make fmt-check` — `tests/content/` sprite
   suites and the wound lint must pass.
3. Push and open ONE PR (see the `commit` skill) titled for the pass,
   e.g. `feat(assets): redraw the 7 worst-reading sprites` — the
   before/after numbers the user picked go in the PR body. Art-only
   passes need a changeset fragment (`.changes/unreleased/`, type
   `Changed`) since sprites are user-visible.

## Craft notes — what "better" means here

- **Silhouette is the unit of communication.** A survivors-screen mob is
  seen for half a second at 16×16; the outline must carry the read. Test
  by squinting at the 1x row, not admiring the 8x.
- **Hierarchy is game design, not decoration.** Threat level must sort
  visually: bosses heaviest, elites louder than minions, pickups inviting,
  decor quiet. An audit that fixes ten sprites but flattens hierarchy has
  made the game worse.
- **Contrast is safety-critical.** The player dodges what they can see;
  a mob that melts into the regolith is a difficulty bug wearing an art
  bug's clothes. Judge every field sprite over its own level ground —
  that's why the level sheets render there.
- **Color is a budget.** Ramps from the family palette, few and far
  apart in value; one accent hue for the focal point (eyes, wound, core)
  buys more than five new shades.
- **Icons read in the grid.** Item icons live in an inventory grid and
  the drop rain — a strong local silhouette and one identifying prop
  (barrel, blade, cross) beat miniature realism at 12×12.
- **The fiction is the tiebreaker.** When two concepts read equally well,
  the manuscript decides: the one that looks more like the story wins.

## Skill self-improvement

When a funnel round or the user's vote reveals a defect class this skill's
rubric missed (or a helper-command gap that forced manual work), add it to
the rubric or extend `art-audit.mjs` in the same PR, so the next pass
catches it in Phase 1.
