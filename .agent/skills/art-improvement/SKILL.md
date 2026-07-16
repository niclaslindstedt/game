---
name: art-improvement
description: "Use when hunting down and replacing the WORST art in the game. Drives the audit funnel: numbered contact sheets per level (or of the item catalog), shortlist the worst 30 → 20 → 10, study the finalists with their variants, sketch 5 manuscript-grounded concepts per candidate, refine the pick with 2 more, install the winners and pose each stageable one in the running game via a frozen test scenario, then present a numbered before/after sheet the user votes on — the PR ships only the liked candidates."
---

# Improving the Game's Worst Art

A structured pass that finds the weakest sprites in the shipped game and
replaces them — grounded in the story, judged with eyes on rendered pixels
at every step, and gated by the user's vote before anything ships. This
skill layers a *selection and approval workflow* on top of the
[`pixel-assets`](../pixel-assets/SKILL.md) skill; load that one too — its
palette rules, iteration cycle, and quality checklist govern every redraw
here. Judge every redraw against the [art style guide](../../../docs/art-style.md)
— the game's feel, the shared look, and the design best practices are the bar a
replacement has to clear. Also load [`test-scenario`](../test-scenario/SKILL.md): stageable
winners get an **in-game pose check** (Phase 4 step 7) — the scenario
engine freezes the redraw in the running game, over its real ground, at
the phone viewport, before it is committed.

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
render from the sprite YAML grids — the same source `make assets` reads —
into `website/assets-preview/audit/` (gitignored). Every cell is numbered
and legend-listed, so a shortlist round is "look at the sheet, write down
numbers".

| Command                     | Step it serves                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------- |
| `levels`                    | List level ids to iterate                                                                                  |
| `level <id>`                | Survey: one numbered sheet of ALL main art in that level, over that level's own ground tile                |
| `items`                     | Survey: numbered sheet(s) of the whole item catalog (paginated `_pN` past 64 entries)                      |
| `equipped [name...]`        | Survey/funnel: weapons & gear drawn ON the hero — whole catalog (no args) or a named shortlist (icons or def ids) |
| `sheet <name...>`           | Funnel rounds: a numbered sheet of exactly the named sprites (30 → 20 → 10)                                |
| `variants <name...>`        | Finalist study: each name expanded to all frames, wound stages, rock footprints, worn overlays             |
| `snapshot <name...>`        | Preserve the CURRENT renders as "before" PNGs — run BEFORE touching any grid                               |
| `concepts <module.mjs>`     | Render a concept scratch module (current sprite first, then each concept, numbered)                        |
| `before-after <name...>`    | The final review sheet: numbered BEFORE\|AFTER pairs from the snapshots vs the current grids               |
| `names <regex>`             | Grep atlas sprite names when unsure what a thing is called                                                 |
| `palette <family\|sprite>`  | List the char → color map a redraw draws with (`*` = family-local) — run before sketching a concept module |

Flags: `--out <png>`, `--scale <n>`, `--cols <n>`, `--chunk <n>`. Names
accept the base (`wraith`) or an exact key (`wraith_0`). The survey/shortlist
sheets render small by default — pass `--scale 12` (or higher) when judging
internal anatomy, not just silhouette.

## Phase 1 — Survey: build the long list

Before anything else, read the lessons from past passes — `node
scripts/skill-lessons.mjs art-improvement` — so known stumbles (fresh-art
churn, the wound-visibility lint, sheet blind spots) are avoided up front.
They live as fragments in [`.lessons/`](./.lessons/) next to this file.

1. Run `make assets` first so grids, atlas, and warnings are current; note
   any contrast/orphan warnings — they are pre-scored offenders.
2. `levels` mode: for each id from `art-audit.mjs levels`, generate
   `level <id>` and **Read every sheet**. `items` mode: generate `items`
   and Read every page, **then generate `equipped` and Read it** — the same
   weapons and gear drawn on the hero (held/worn), since a weapon or armor
   icon that reads fine as a loose square can sit wrong once equipped (bad
   grip angle, wrong scale on the body, colors clashing with the suit).
   (The hero appears on every level sheet — judge him once.)
3. Judge each numbered cell against the **worst-art rubric** below. Keep a
   running table — `sprite name | where seen | defects | severity 1–5` —
   in sprite names, never bare numbers (numbers restart per sheet/page).
4. Collect the **worst 30** by severity. Tie-break toward sprites the
   player sees most (common minions, the level-1 catalog, ground tiles
   beat one-off decor).
5. **Cut recently-redrawn art — never re-improve fresh work.** Before the
   list is locked, check what was touched in the last few passes:
   `git log -n 30 --oneline -- website/scripts/sprites/<family>/`
   (levels) or `.../icons.mjs` (items), and `git blame -- <file>` on a
   candidate's grid lines when unsure. A sprite whose grid was rewritten in a
   recent art pass is **not weak art — it's fresh art**, and its sprite YAML
   comment usually says so out loud (an elaborate, just-finished rationale like
   _"drawn bulkier on an 18px canvas so it looms over the 16px staff"_ or
   _"drawn on a bigger 20×20 canvas… reads as a heavy machine, not an
   appliance"_ is a redesign someone shipped, not a placeholder). Drop every
   such sprite from the long list and leave it alone. Redoing art this skill —
   or a teammate — just improved is churn, not improvement: it burns the pass,
   re-litigates settled pixels, and reliably loses the before/after vote. When
   in doubt, treat "was this touched recently?" as a hard gate, not a
   tie-break.

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
- **Equipped misfit** _(weapons/gear only — judge on the `equipped` sheet)_ —
  reads fine as a loose inventory square but wrong ON the hero: the grip sits
  off the hand or the blade/barrel points the wrong way, it's mis-scaled
  against the 16px body, or its colors clash with the suit.

## Phase 2 — Funnel: 30 → 20 → 10

1. `sheet <the 30 names>` → Read it → re-judge side by side (worst art is
   relative: a sprite that looked passable alone can sink next to
   stronger peers) → keep the worst **20**.
2. `sheet <the 20 names>` → Read → keep the worst **10**.
3. Write the final list of 10 with a one-line defect statement each —
   these become the redesign briefs. Number them 1–10 now; this order is
   used for everything that follows, including the final vote.

Whenever a shortlist round holds weapons or armor (`items` mode), pair the
`sheet` with `equipped <the same names>` and Read both — a weapon/gear
candidate is judged BOTH as its inventory square and on the hero, since the
equipped look is what the player mostly sees.

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

   A concept can also be bootstrapped from a genAI image instead of drawn by
   hand: `sprite-author.mjs prompt <base>` synthesizes the image prompt from the
   sprite's fields, and `analyze <image>` traces the returned image into a grid
   (the pixel-assets skill). Either way the brief above still governs, and the
   grid is refined against it before it competes in the vote.

   **Compute grids in JS for anything prop-heavy or multi-frame** (a mob
   holding a tool, a machine with panels, both walk frames) — hand-aligning
   fixed-width ASCII is where off-by-one errors creep in. The concept module
   runs as real JavaScript, so sketch with helpers and export the joined
   rows; `concepts` validates every grid's width, so a mistake fails loudly
   instead of rendering skewed:

   ```js
   const W = 16;
   const blank = () => Array.from({ length: 16 }, () => Array(W).fill("."));
   const from = (rows) => rows.map((r) => r.split("")); // start from a base grid
   const put = (g, r, c, ch) => { if (g[r] && c >= 0 && c < W) g[r][c] = ch; };
   const hline = (g, r, c0, c1, ch) => { for (let c=c0;c<=c1;c++) put(g,r,c,ch); };
   const box = (g, r0,r1,c0,c1, fill, out="O") => {           // outlined rect
     for (let r=r0;r<=r1;r++) for (let c=c0;c<=c1;c++)
       put(g,r,c, (r===r0||r===r1||c===c0||c===c1) ? out : fill);
   };
   const done = (g) => g.map((row) => row.join(""));
   // build a base once, stamp each concept's props onto a clone, export done()
   ```
3. **Render and pick**: `concepts <module>` → Read the sheet (the current
   sprite renders first for comparison) → judge each concept against the
   brief and the rubric → pick the strongest **one**.
4. **Refine**: make **2 more variations** of the pick (push what works,
   fix what doesn't) → render the pick + both refinements together →
   choose the best of the 3.
5. **Install the winner** in its family module under
   `website/scripts/sprites/` (both walk frames for animated sprites
   — redraw `_1` to match, don't leave a mismatched old frame; new chars
   go in the FAMILY palette; check `wounds` overrides still apply). For a
   computed grid (above), generate BOTH frames from the one base — the `_1`
   frame is usually just the leg stride shifted — and preview them together
   in one last concept sheet to check the walk cycle reads before you paste.
   Then print the joined rows (a tiny `console.log` builder) and paste them
   in; nothing hand-retypes the winning grid.
6. **Verify on the sheets**: `make assets` (heed every warning), then Read
   the family sheet and the `@8x` preview per the pixel-assets checklist,
   and `variants <name>` to confirm frames, wounds, and overlays still read.
   For a redrawn weapon or armor icon, also `equipped <name>` and confirm
   the new icon still reads held/worn on the hero (the `worn_<id>` overlay
   regenerates from the icon on `make assets`, so a re-themed icon re-themes
   the equipped look automatically — check it landed).
7. **Verify in the game — when the asset is stageable.** Audit sheets
   render sprites at rest on a swatch; the game renders them in a lit,
   moving, cluttered scene at the phone viewport. If the candidate has a
   row in the staging table below, pose it with the scenario engine (see
   the test-scenario skill) and Read the screenshot before committing:

   ```sh
   node website/scripts/playtest.mjs --strategy idle --seed 42 --level <id> \
     --scenario '<spec from the table>' --timeout 10
   ```

   Every pose spec starts from the same still-life base —
   `{"clearEnemies":true,"stopWaves":true,"freeze":true,"disarmed":true}`
   (nothing moves, nothing fights, the exhibit stands where placed) — plus:

   | Candidate               | Add to the spec                                                                                                                                                  |
   | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | Enemy (minion/elite)    | `"spawns":[{"enemy":"<id>","at":{...}},{"enemy":"<id>","at":{...},"hpFrac":0.4},{"enemy":"<id>","at":{...},"hpFrac":0.2}]` — fresh, hurt, and wrecked in one row |
   | Boss                    | `"place":"boss"` — the level's own boss survives `clearEnemies`, so the base still-life stages it as-is; pose its wound stages with extra `spawns` copies at `hpFrac` 0.4 / 0.2 / 0.05                                              |
   | The merchant            | `"place":"merchant"` — posed a step outside his discovery radius, stall art over this biome's ground                                                            |
   | Weapon/gear on the hero | `"weapon":"<id>"` / `"gear":{"<slot>":"<id>"}` — the paper doll wears it on the field (the field hero always shows his held weapon)                     |
   | Item/pickup icon        | `"drops":[{"item":"<id>","tier":"rare"}, …]` — the icon in the real drop rain; loose kinds, equipment ids, `UNIQUE_DEFS` ids, abilities, story items all work    |
   | Tile / decor / obstacle / landmark | **Not stageable** — placed at level creation. Judge on the level sheet, then wander the level with the playtest bot (`--strategy survivor`) and screenshot |

   Judge the shot with the same rubric: silhouette at 1x, separation from
   the real ground, hierarchy against the hero standing next to it. A
   redraw that passed the sheets but melts into the running game goes back
   to step 4, not into a commit. For an animated redesign, follow with a
   short *unfrozen* run (drop `freeze`) to see the walk cycle in motion.
8. **Commit this candidate alone** — just the sprite YAML grid change
   (the atlas is gitignored and rebuilt on every build, so there is nothing
   binary to commit alongside it), conventional message, e.g.
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
   (this is why each got its own commit). The atlas is gitignored and
   rebuilt on every build, so there is no regenerated binary to re-commit
   after the reverts.
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
  made the game worse. **Size is the bluntest hierarchy lever** — the
  renderer draws every mob at its own grid size (nothing clamps a minion to
  16²), so a tanky mob can simply live on a bigger canvas (20², 22²) to loom
  over the crowd. Reach for a bigger grid before you fight to cram menace
  into 16²; the atlas, wound generator, and audit sheets all handle mixed
  sizes already (elites are 24², bosses 48²). Keep `radius` (the hitbox) a
  deliberate, separate decision — a bigger look doesn't have to change
  collision or balance.
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

**Every pass leaves this skill sharper than it found it.** When something in
the funnel makes you stumble — a defect class the rubric missed, a step whose
instructions were wrong or ambiguous, a thing you had to do by hand that a
command could have done, a fact you wish you'd known in Phase 1 — fix the
cause *here*, in the same PR as the art, before you finish:

- **Missed a defect class?** Add it to the worst-art rubric (Phase 1).
- **Did something manual a command could do?** Extend `art-audit.mjs` (a new
  subcommand, or a new field in an existing legend) and add it to the helper
  table. Keep the script's usage text, header comment, and that table in sync.
- **A step read wrong, ambiguous, or incomplete?** Rewrite it in place.
- **Learned a gotcha that would have saved time up front?** Record it as a
  lesson fragment — `.lessons/$(date +%s)-short-slug.md` with `title:`/`date:`
  front matter and the lesson in the body (format in
  [`../LESSONS.md`](../LESSONS.md)) — so the next session reads it at the top
  of Phase 1 and skips the stumble. Never append lessons to this file:
  parallel passes editing one SKILL.md is what causes merge conflicts; one
  fragment per lesson never collides.

Keep the log tight — when `node scripts/skill-lessons.mjs art-improvement`
nudges (more than 15 fragments), or a lesson has gone obsolete (a manual step turned
into a command, an instruction got fixed), run the consolidation pass from
`../LESSONS.md` as its own commit: merge near-duplicate fragments, delete the
stale ones, and promote the load-bearing ones into the rubric, the steps, or
`art-audit.mjs` above. Consolidation is the only time lesson content moves
into this file.

