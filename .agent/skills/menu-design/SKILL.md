---
name: menu-design
description: "Use when changing the TITLE MENU — adding, removing, renaming, reordering or re-wording a menu screen or row, hiding a row on some builds, adding a settings toggle/slider/tick-box/keybinding row, changing a page heading or breadcrumb, wiring a new screen's BACK/Escape, or fixing menu layout and alignment. The tree is CONTENT (`content/mainmenu.yaml`) and the behaviour is code (`menus-*.ts`); this skill is the map of that seam, the widget vocabulary, the compiler's refusals, and the verify loop."
---

# Changing the title menu

**The menu tree is content, not code.** Every screen the title menu can be on,
the order of its rows, each row's LABEL, ICON and HELP line, and which row opens
which child screen live in ONE authored file — `content/mainmenu.yaml` — compiled
by `make levels` into the gitignored `pwa/src/generated/menu.ts`. What a row
*does*, and whether this build offers it at all, lives in the `menus-*.ts`
builder that owns its screen. **The two meet on the row's `id`, and nothing is
written twice.**

Before this split, the order lived in one array, the labels in another, the page
headings in a `switch` in a third, and every BACK row carried a hardcoded cursor
INDEX into the screen above it — so inserting one settings row silently landed
three other screens' back rows on the wrong thing. Anything that feels like it
wants a second list of screen ids is almost certainly derivable from the tree;
derive it.

**Before starting, read past lessons:**
`node scripts/skill-lessons.mjs menu-design`.

This skill covers the TITLE menu (the front door and everything under it). The
in-run menus are separate surfaces — `pwa/src/game/overlays/PauseOverlay.tsx`
and friends — and none of them reads the tree.

## Where everything lives

| Piece | File |
| --- | --- |
| **The tree** (screens, row order, labels, icons, help, `opens`) | `content/mainmenu.yaml` — the one source of truth |
| Compiled output | `pwa/src/generated/menu.ts` — **gitignored, regenerated on every build**; never edit or commit |
| Pipeline | loader `scripts/menu-data/load-yaml.mjs` → schema `scripts/asset-tools/menu-schema.mjs` → generator `scripts/generate-menu.mjs`; run it with `make levels` (or `make assets`) |
| Reading the tree | `pwa/src/game/title-screen/menu-tree.ts` — `screenDef`, `rowDef`, `rowHelp`, `rowAria`, `parentOf`, `screenHeading`, `SETTINGS_TREE`. The ONE way to ask the tree anything |
| Row shape + shared factories | `pwa/src/game/title-screen/menu-model.ts` — `MenuEntry`, `MenuScreen` (the hand-written screen union), `MenuContext`, `assembleRows`, `actionRow`, `navRow`, `backRow`, `onOffRow`, `sliderRow`, `volumeRow` |
| Screen → builder dispatch | `pwa/src/game/title-screen/menus.ts` (`buildMenu`, `headingFor`) |
| The builders | `menus-main.ts` (front door + EXTRAS), `menus-campaign.ts` (difficulty/mission/bot-speed pickers), `menus-settings.ts` (the six settings pages + GORE), `menus-data.ts` (DATA + EXPORT), `menus-developer.ts` (DEVELOPER, VISUALS, BALANCE, SEED), `menus-store.ts` (coin store), `menus-mods.ts`, `menus-net.ts` (MULTIPLAYER/HOST/JOIN) |
| Async state a builder must be HANDED | `use-mods.ts`, `use-sessions.ts`, `use-coin-store.ts`, `use-cloud-save.ts`, `use-character-transfer.ts` |
| Rendering | `title-screen/MenuList.tsx` (rows, cursor, controls), `MenuHeading.tsx` (title + trail + rule), `TitleScreen.tsx` (orchestration, keyboard, cursor, overflow) |
| Layout hooks | `title-screen/use-title-layout.ts` — `useHelpWrapRem`, `useMenuOverflow` |
| Widgets | `@ui/lib/PixelSlider.tsx`, `PixelToggle.tsx`, `PixelCheckbox.tsx`, `PixelText.tsx`, `PixelShinyText.tsx` |
| Styles | `pwa/src/styles.css` — `.menu-item`, `.menu-label`, `.menu-icon`, `.menu-cursor`, `.menu-item-control`, `.menu-item-blurb`, `.menu-item-subtitle`, `.menu-help`, `.title-menu.settings-menu`, `.title-header.sub`, `.title-plate` |
| Row icons | `content/sprites/icons/icon_menu_*.yaml` — authored like any sprite (see the `pixel-assets` skill) |
| Test | `tests/content/menu_tree_test.ts` — builds EVERY screen for real |
| Screenshots | `pwa/scripts/ui-shots.mjs` (see the `ui-review` skill) |

## The two halves, and which one your change belongs to

**In the YAML** (shape): a screen existing at all, its `title`/`trailName`/
`trail`/`tone`/`form`/`surface`/`parent`/`home`/`scroll`/`notice`/`dev`; a row's
`id`/`label`/`icon`/`help`/`opens`; the ORDER of rows.

**In the builder** (behaviour): what the row's `action` does; whether this build
offers it (`null` from `assembleRows`); computed help/`value`/`subtitle`; the
control it carries (toggle, slider, tick-box, binding, reorder); rows that come
from a CATALOG rather than from the tree.

Rows built from a catalog — the difficulty ladder, the mission list, the
rebindable actions, the balance knobs, the roster, the installed mods, the coin
packs — are concatenated around the `assembleRows` call. The screen then authors
only its own fixed rows (a RESET, a START), in the place they sit, and the
alternates that stand in for an empty list (LOADING, NO MODS INSTALLED, NO
HEROES YET) sit where the list would have been so exactly one is ever on screen.

## Recipes

### Add a row to an existing screen

1. Author it in `content/mainmenu.yaml` under that screen's `rows:`, in the
   place it belongs. Uppercase label; `icon:` only if the screen's rows wear
   icons and this one is a DESTINATION; `help:` in the present tense.
2. Add its `id` to the builder's `assembleRows` map — an `actionRow`, `navRow`,
   `onOffRow`, `sliderRow`, or `null` for a build that has no answer.
3. `make levels && make test`.

A row id the builder never mentions **throws** (`menu row "x.y" has no
builder`). That is deliberate: "deliberately absent on this build" and "renamed
on one side only" must not look alike.

### Hide a row on some builds

Return `null` from the builder for that id. Never a greyed-out row unless the
grey is genuinely informative — see **Absent beats greyed** below. Nothing else
needs to change: `assembleRows` filters it, `backRow` re-homes by ROW ID against
the parent's list as built right now, so every cursor landing shifts with it.

### Add a whole screen

1. Add the id to the `MenuScreen` union in `menu-model.ts` (hand-written so a
   typo in `setScreen` is a type error) **and** to the `UNION` list in
   `tests/content/menu_tree_test.ts` — the test compares the two rather than
   trusting either.
2. Author the screen in `content/mainmenu.yaml` with a `parent:` (the chain must
   reach `main`) and a row on the parent that `opens:` it — that opener is also
   where BACK lands, so most screens never write a `home:`.
3. Write `buildXMenu(ctx)` in the owning `menus-*.ts`, ending with
   `backRow(ctx, "<screen>")`, and dispatch it in `menus.ts`.
4. A developer-only screen carries `dev: true` AND its dispatch is guarded by
   `__DEV_TOOLS__` so Rollup folds it out of the store build.

### Add a settings row

Pick the widget by MEANING, not by convenience:

| Widget | Use for | Factory |
| --- | --- | --- |
| **Switch** (`PixelToggle`) | a straight on/off setting | `onOffRow(ctx, screen, id, key)` — key must be in `OnOffKey` |
| **Slider** (`PixelSlider`) | a 0..1 or scaled amount | `sliderRow` / `volumeRow` |
| **Tick-box** (`PixelCheckbox`) | picking one of MANY (the EXPORT roster picker) | a `check:` on the entry |
| **Cycled label** | two-plus modes that are NOT enabled/disabled (STEERING, POWERUPS, QUICK BARS) | `value:` on the entry |
| **Binding** | a rebindable key | `binding:` on the entry |

A switch implies enabled/disabled — do not use one for a mode pair. The arrows
steer the focused row's control (`←`/`→`); `TitleScreen`'s `onKeyDown` already
knows every control kind, so a new one has to be taught there.

An engine-affecting setting also needs its `set*` applied from `settings.ts` on
load, and a **developer** setting must be scrubbed in `stripDeveloperState` so
it cannot survive into a store build on the same device.

### Re-word a row

Edit the YAML. A row's `help:` describes the state the setting is IN — never
both states in one line. Use a map of state → line (`on`/`off`, a steering mode,
a map size) and pass `{ state }` from the builder; `onOffRow` does it for you.
A row whose help is COMPUTED (a live cloud state, how many mods are on, a
level's clear status) carries none in the tree and words itself in the builder
via `{ help }`.

## The rules that are load-bearing

**ABSENT BEATS GREYED ON THE FRONT DOOR.** A dead row owes the player a line
explaining its grey, and on a centred column that line is a second, longer row
of text hanging off the middle — it reads as the menu being ragged rather than
as the row being disabled. So a row with nothing to offer yet is simply not
there (LOAD GAME before any hero exists; HIGH SCORES before a hardcore campaign;
LOST & FOUND before the AUTO PILOT has thrown anything away; QUIT off the
desktop). Grey it only where the grey itself teaches something the player can
act on — a locked LEVEL row in a ladder they can see the shape of, a mod that
failed to compile with its error as the blurb.

**NO SUBTITLES OR BLURBS ON THE FRONT DOOR.** The `main` screen's rows are a
centred column of verbs; a second line under one of them breaks the block. Off
the settings tree a blurb renders INLINE under its row, which is right for a
difficulty tagline or a level's status and wrong for the front door. Keep
`main` rows to a label and an icon.

**THE SETTINGS TREE IS A STABLE FORM.** Screens with `form: settings` render
fixed-width (`.title-menu.settings-menu`) so a changing value can't resize the
block and shove the right-aligned controls, and every row's help is hoisted OUT
of the row to ONE bottom line (`.menu-help`, reserved height) so flipping a
switch can't reflow the list. `SETTINGS_TREE` is DERIVED from `form`, so a new
settings page joins by being authored — never by being remembered in a list.

**THE HIERARCHY IS DERIVED, TWICE.** A screen's `parent` is where BACK *and*
Escape go (`TitleScreen` reads the same `parentOf`, so the two cannot drift —
they had, and Escape from three settings pages walked out to the front door).
`home` is the row of the parent the cursor lands on, defaulting to the parent row
that `opens` this screen. The breadcrumb (`SETTINGS » CONTROLS`) is the chain of
parent names, built at compile time. Never pass an index to `backRow` except on
the handful of screens whose parent's rows come from a catalog — the compiler
makes those declare `home: dynamic`.

**A MOD MAY NOT SHIP A `mainmenu.yaml`, and that is security.** The tree decides
which screens EXIST, so a mod that could rewrite it could hand itself the hidden
DEVELOPER tree (level warp, balance multipliers, free coins) on a shipped store
build. `scripts/menu-data/load-yaml.mjs` takes no directory (the one loader that
doesn't) and `mod/tools/build.mjs` REFUSES such a mod rather than ignoring it.

**THE 170 KB CRITICAL-PATH BUDGET.** The title menu is the app's STARTUP path.
A menu screen may import `@game/menu` and the import-free `@game/wire/*` leaves
— never `@game/core` or `pwa/src/game/net/`. `pwa/scripts/check-seo.mjs`
measures it; when it trips, find what reached back through `@game/core` (or make
that screen lazy). Do not raise the number.

**`__DEV_TOOLS__` MEANS THE CODE IS GONE, NOT HIDDEN.** It is a build-time
literal, so `if (__DEV_TOOLS__ && screen === "developer")` lets Rollup drop
`menus-developer.ts` out of the store bundle entirely. A new developer surface
hangs off an already-gated entry point or takes its own `__DEV_TOOLS__ &&`
guard.

**ICONS ARE TOUCH-ONLY AND BELONG TO DESTINATIONS.** A mouse keeps the wisp
cursor; a phone hovers nothing, so a row's own bobbing icon is what makes it
look pressable (the swap is pure CSS — `(any-pointer: fine)`). Carry an icon on
NAVIGATION rows, never on a switch or slider: an icon beside every setting is
noise, an icon beside every destination is a map. Two rows on ONE screen may not
wear the same emblem. Rows without an icon still reserve the slot, so labels
stay aligned.

**AMBER IS THE SELECTION'S ALONE.** The highlighted row's amber label and glow
mean "this is the row you're on". A heading `tone` colours the trail and the
rule, not the rows; `shiny` strikes a label out of metal (the STORE row, coin
packs) and must not breathe an amber glow.

**GAMEPAD NAVIGATION IS FREE.** `@ui/lib/gamepad-keys.ts` dispatches synthetic
arrow/Enter/Escape `keydown` events on `window`, mounted once in `App.tsx`. A
new menu surface is navigable by pad automatically as long as it listens on
`window` — never teach a menu to read a pad.

## What the compiler refuses

`make levels` fails on any of these, so most menu mistakes never reach a test:

- a parent chain that loops, or a screen with no `parent` that isn't `main`
- a `home:` naming a row that isn't in the parent; zero or several rows opening
  the same screen with no `home:` to disambiguate
- a row that `opens` a screen whose `parent` is somebody else — BACK would not
  come back
- a plain screen hanging under a `dev: true` one (it would survive into the
  store build)
- a label or help line using a glyph the pixel font has no cell for (it would
  render as a silent `?` — add the glyph to `GLYPHS` in
  `scripts/asset-tools/font.mjs` and rerun `make assets` rather than
  substituting a character)
- a label that isn't upper-case, or longer than 20 chars (it shoves the control
  off a landscape phone); a help line past 64 chars (48 inline)
- an `icon:` the sprite atlas has no answer for, or two rows on one screen
  wearing the same one
- a row id of `back` (BACK is appended from the tree), a duplicate row id, an
  unknown screen or row field, a non-kebab-case id
- a `surface:` screen that also declares `form:` or authors rows

It WARNS (doesn't fail) when a destination row on an icon-wearing screen has no
icon.

What the compiler CANNOT see is the other half of the seam — that every authored
row has a builder. `tests/content/menu_tree_test.ts` closes it by building every
screen for real, and pins the front door's row order.

## The verify loop

```sh
make levels          # recompile the tree (or `make assets`)
make test            # menu_tree_test builds every screen for real
make lint            # zero warnings
```

Then **LOOK at it** — a menu change is a layout change, and the tests cannot see
alignment:

```sh
cd pwa && npx vite --port 5199 &
npm install --no-save playwright        # once per session, not a repo dep
node pwa/scripts/ui-shots.mjs --only land,port,sep   # or the full sweep
```

`ui-shots.mjs` drives the real app to every screen at the nine reference
viewports (see the `ui-review` skill for the quality bar). For a one-off check,
a tiny Playwright script against `http://localhost:5199/` is fine — the
reference viewport is the **landscape phone (844×390)**, and the small-phone
floor (375×667) is where a long label or a wrapped help line breaks first.

**A row's visibility usually depends on state the screenshot doesn't have.**
Seed it before loading: the roster lives at `<storagePrefix>:characters` and the
settings at `<storagePrefix>:settings` (the prefix is `game.config.json`'s
`storagePrefix`). Capture BOTH states — the build that has the row and the build
that doesn't.

## Documentation the change owes

- A user-visible menu change needs a changeset fragment in
  `.changes/unreleased/` (CI's `changeset` job enforces it).
- A row's wording, a page name, or the tree's shape: `docs/architecture.md` and
  `docs/configuration.md` describe the menu in prose — check for a stale
  sentence naming the row you moved.
- `AGENTS.md`'s **THE TITLE MENU IS CONTENT** section is the architectural
  summary; update it when a RULE changes, not when a row does.
- Menu labels and help lines are UI copy, not story — they answer to no
  manuscript chain. A menu row that quotes a character does; load `update-story`
  for that.
