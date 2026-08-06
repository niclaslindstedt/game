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
| The builders | `menus-main.ts` (front door + EXTRAS), `menus-campaign.ts` (difficulty/mission/bot-speed pickers), `menus-settings.ts` (the six settings pages + GORE), `menus-data.ts` (DATA + EXPORT), `menus-developer.ts` (DEVELOPER, PLAYGROUND, CHEATS, GALLERIES, VISUALS, BALANCE, SEED), `menus-store.ts` (coin store), `menus-mods.ts`, `menus-net.ts` (MULTIPLAYER/HOST/JOIN) |
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

## The developer menu, and the gesture that unlocks it

## Developer menu (hidden)

The title screen hides a **DEVELOPER menu** behind a gesture in TWO MOVEMENTS,
and the split is deliberate: the first is a SECRET, the second is a TEST.
**Sixteen quick taps on the sun** (`SUN_TAPS`, `TAP_WINDOW_MS` — 0.9 s between
taps — in `pwa/src/game/title-screen/use-sun-charge.ts`) no longer unlock
anything; they ARM the star. Holding it then costs something — see **THE CLICK
RACE** below — and only the race's top detonates the sun and latches
`developerUnlocked` in the persisted settings (`pwa/src/game/settings.ts`),
after which the gesture disarms.

**THE FIRST `SUN_SILENT_TAPS` (10) BUY NOTHING, AND "NOTHING" IS LITERAL.** They
are banked in a ref and touch no state at all: no charge layer is mounted, no
`.charging` class lands on the disc, `playSunCharge` is not called and the motor
is not asked for a buzz. A thumb wandering across the sky has to come away with
no evidence there is anything under it — a gesture that flickers on the second
tap is one that gets stumbled into and then hunted down. The ELEVENTH tap is the
first the sky answers.

From there the BUILD-UP is half the secret: `sunChargeIntensity` maps the taps
banked so far onto one 0..1 `--sun-charge` (registered with `@property` so it
TWEENS, which is what makes the charge swell in and ebb back out), and each
layer in `styles.css` ramps off it with its OWN threshold — tap 11 is a breath
of extra glare, and only from tap 12 does the star plainly throw fire, shake and
burn hotter; tap 15 is full fury and tap 16 arms the race. Stop tapping and the
burst lapses (silent taps included). The gesture is a plain **window
listener that hit-tests the press against the sun's rect** — not a button on the
sun: the sun is decoration the sky driver sizes and places each frame, and a
transparent target parked over it would swallow presses meant for whatever menu
row sits under it (a press on any real control is ignored outright).
`TitleBackdrop.tsx` owns the charge layers and plays the blast off its `detonate`
prop, reporting back when it's done. Every piece of the blast rests at
`opacity: 0` — they are all animation-driven, so a frame that paints one without
its animation applied would dump an opaque disc (or a white screen) over the
menu. The blast is anchored on the sun's STATIC seat (`SUN_X`/`SUN_Y` in
`title-sky.ts`, mirrored by `.sun-boom` in `styles.css` — keep the two in step)
rather than a per-frame custom property: writing one onto the shared parent
dirties the style of every node under it, sixty times a second. The detonation
does nothing else — the player then opens SETTINGS on their own,
where a **DEVELOPER** row now appears (it stays available across launches once
unlocked).

**THE CLICK RACE — the second movement, and the reason the sun is the meter.**
A tap count is a secret you can be TOLD; once told, it costs nothing, which is
exactly the wrong price for a switch that turns on level warping and the
balance knobs. So the arming tap starts a race
(`pwa/src/game/title-screen/sun-race.ts`, a pure leaf over a clock): a press at
least every `RACE_BEAT_MS` (250 ms) is ON TEMPO and banks REAL TIME into
`heldMs`; drop the beat and the bank drains at `RACE_DECAY` (1.5×) the rate it
filled. `RACE_HOLD_MS` (5 s) banked and the star lets go — the same detonation
the arming tap used to fire. Sit at empty for `RACE_LAPSE_MS` and the race
gives up, the star cools, and the gesture rearms at the tap count. Four rules:

1. **THE BANK IS FILLED BY TIME, NOT BY PRESSES.** A press is a promise about
   the next 250 ms, not a deposit — so mashing at 20 Hz buys nothing beyond
   never missing the beat, and the five seconds are five real seconds however
   hard the player hammers. Counting presses instead would make the target a
   number to game rather than a tempo to hold.
2. **THE DECAY IS ABOVE 1 ON PURPOSE.** At parity a lost beat costs exactly
   what it saves, so the race becomes an endurance test you may pause in the
   middle of. At 1.5× a slip SETS YOU BACK, which is what makes holding the
   tempo the thing being tested. (Worked example: 4 s banked, 1 s dropped
   leaves 2.5 s, so 2.5 s more are owed — not 1.5.)
3. **THE SUN IS THE METER — there is no bar, no counter and no number.**
   `--sun-race` (0..1) swells the disc to ~2.7× and burns it toward white;
   `--sun-tempo` cools it back toward red as the beat slips. Both are written
   STRAIGHT ONTO the sun and the glare by the hook's own rAF loop and are NOT
   tweened by CSS: the JS already owns the curve, and a transition over a
   per-frame write would lag the disc a quarter-second behind the thumb — which
   on a 250 ms beat is the whole game. Routing them through React state would
   re-render ten flame spans and eight embers sixty times a second to move one
   number. (`--sun-charge`, which IS tweened, is the opposite case: it steps
   once per tap.)
4. **THE SCALE IS FOLDED INTO THE SHAKE'S KEYFRAMES.** An element has one
   transform, so a `scale()` in a rule beside `sun-race-shake` would REPLACE the
   shake rather than compose with it. Same trap as the charge shake above it.

The growing disc is also its own growing TARGET — the hit test measures the
sun's live rect, transform included — so the race gets kinder to the thumb
exactly as it gets harder to sustain. Under `prefers-reduced-motion` the growth
stays (it is the meter) and the buzz goes.

**THE DEVELOPER SCREEN IS AN INDEX OF DOORS, NOT A DRAWER OF TOOLS.** Flat, it
grew to twelve rows of four unrelated kinds and a developer had to READ the
column every time; the rows are now filed by WHAT KIND OF THING THEY DO, and a
new developer tool joins the page whose kind it shares rather than the bottom of
the index:

| Page | Holds |
| --- | --- |
| **PLAYGROUND** | a run: **SELECT LEVEL** (the warp picker — any difficulty and mission regardless of unlock state, skipping the intro), **BOT VIEW** (the autopilot on a real hero, then GAME SPEED + BOT SPEC), the term a run is carved on — **AUTO LEVEL STATS** (`autoLevelStats`) — and **DEBUG MODE**, the meter drawn over it |
| **CHEATS** | what a run would otherwise earn: **SEED CHARACTERS**, **GRANT 10B COINS**, and **FORCE STORE** (`storeForce`, persisted — the coin store in any build with packs granted FREE, so it is a cheat rather than a build flag; `pwa/src/game/store.ts`) |
| **BALANCE** | the runtime multiplier sliders (see below) |
| **VISUALS** | KNOCKBACK, BLOOD and GORE LINGER, plus the **CAMERA PITCH** / **CAMERA YAW** sliders that dial the whole world projection live — `docs/rendering.md` |
| **GALLERIES** | the two full-screen shelves that only LOOK: **ARSENAL** (`ArsenalScreen.tsx` — every unique/legendary by ilvl, minted via `mintUnique` and drawn through the shared `ItemCard.tsx` the inventory tooltip reuses, so the two never drift) and **EFFECTS** (the EFFECTS GALLERY — see below) |

**EVERY ROW ON THE INDEX IS A DOOR** — no switch or slider is parked among them,
which is what keeps the page (five rows and a BACK, above the help line) inside
the landscape phone it is drawn for. A new developer tool joins the page whose
KIND it shares; a sixth door is where the index stops fitting that screen, so
earning one means merging two.

**DEBUG MODE** (`debug: "on" | "off"`, persisted) shows the in-run FPS
meter (`GameScreen.tsx` `showFps`, written to the DOM by the render loop — the
first probe for performance regressions) and is the hook further developer
diagnostics wire to via `getSettings().debug`. Keep it distinct from the
`?debug` URL param (console verbosity, `window.__game` / `window.__scenario`,
and the same FPS meter forced on — see `docs/configuration.md`).

The warp is a MODE rather than a place, which is the one thing the tree cannot
carry: `SELECT LEVEL` / `BOT VIEW` set `warp` and jump to the campaign pickers,
and both the pickers' own BACK row (`menus-campaign.ts`) and Escape
(`TitleScreen.tsx`) return to PLAYGROUND — onto whichever of the two doors armed
the mode, read BEFORE the mode is cleared.

**NONE OF IT SHIPS IN THE STORE BUILD — and "does not ship" means the code is
gone, not hidden.** The reveal, the whole DEVELOPER tree, and the commit hash
beside the version in the title footer are gated on `__DEV_TOOLS__`, a
build-time literal `pwa/vite.config.ts` sets from `VITE_DEV_TOOLS` — and
`useSunCharge` tests that flag ITSELF rather than trusting its `armed` prop,
because a sun that flares under the thumb on a build with no DEVELOPER menu is a
door onto nothing. It is TRUE
everywhere a human might want the tooling — the website, the installed PWA, the
`/preview/` and `/branch/` slots, local dev, and the native `preview` and
`testflight` apps — and FALSE for exactly one build: the `production` EAS
profile, the binary uploaded to the App Store / Play Store, whose embedded site
`native/scripts/bundle-web.mjs` builds with `VITE_DEV_TOOLS=off`. Because the
flag folds to a literal, Rollup drops `menus-developer.ts` and the arsenal /
effects-gallery chunks out of that bundle entirely. So a NEW developer surface
must hang off an entry point that is already gated (a DEVELOPER row, a screen in
`buildMenu`) or take its own `__DEV_TOOLS__ &&` guard — and a new persisted
developer SETTING must be reset in `stripDeveloperState` (`settings.ts`), which
scrubs the developer-owned settings on load so a TestFlight tester's unlocked
menu, FORCE STORE, or BALANCE multipliers can't survive into the store build on
the same device.

The **EFFECTS GALLERY** (`pwa/src/game/effects-gallery/`, also reachable at
`?effects[=<id>]`) is the FX iteration loop's front door: every visual effect the
game ships, one per screen, each staged as a REAL fullscreen game situation and
replayed on a loop — browse with the side buttons / ←→ (↑↓ jump a whole shelf),
narrow the catalog with the search box, a tap on the field (or `Enter`) runs the
show again, **`S` (or the SPEED chip) steps the diorama down through `1X` →
`1/8X` SLOW MOTION** (it scales SIM time, so the effect and the loop's own
show/replay rhythm stretch together — the only way to judge a burst that is over
in a fifth of a second), `H` hides the gallery's chrome for a clean look. Nothing is parked
in the middle of the frame — an effect detonates on the hero, so a button there
would be watched through. Two rules keep it honest. **The staging is the
engine's own scenario system**: an exhibit is a `ScenarioSpec` (the display-case
fields `reveal` / `muteDialogue` / `noVictory` / `runAbilities` exist for it), so
adding one is data, not a harness. **The firing goes through the engine EVENT
stream**: an exhibit pushes the same `GameEvent` a real fight would and the run's
own consumers (`applyEventFx`, the full-screen CSS bursts, the sfx bus) draw it —
so an exhibit can never drift from what ships, the way the ARSENAL reads items
through the in-game `ItemCard`. The MELEE, SHOTS and TALENTS shelves are
GENERATED from `weapon-fx.ts` and the talent catalog (`weapon-exhibits.ts`,
`talent-exhibits.ts`), so a new signature weapon or talent appears in the gallery
on the next build; `tests/content/effects_gallery_test.ts` fails the build when
one doesn't, when an exhibit's icon is missing from the atlas, or when it stages
an id that no longer exists. `pwa/scripts/effects-gallery.mjs` drives the same
deep link (`?effects=<id>&speed=…`) to write a numbered contact sheet of the
whole catalog: `--strip N` spreads N frames evenly across an exhibit's own show
(a filmstrip of the WHOLE effect rather than two moments of it), `--speed`
shoots it in slow motion, and every run composites into a single `sheet.png` —
a row per exhibit, frames left to right — which is what a review actually
reads.

The **BALANCE** subpage holds ~10 runtime balance multipliers (leveling pace,
mob strength, loot percentages, …) so the game's balance can be probed without
editing `src/game/config/` and rebuilding. The engine side is
`src/game/tuning.ts` (`setBalanceTuning`, neutral 1 defaults — except the world's
shipped PACE, which the HERO SPEED / MOB SPEED pair carries at 0.8 so TEMPO stays
a free lever at 1 — values clamped to
`[0, 100]`); each knob is applied at the ONE read site that owns its rule
(`grantXp`, `weaponDamageFor`, `spawnEnemy`, the drop ladder, `rollTier`,
`menaceSensitivity`, …), so it moves every surface of that rule together. Each
row is a **slider** (drag, tap the track, or steer with ←/→) spanning **0×
(system off) to 100×** the engine's authored value, where **1× is that value** —
never a percentage. The track is exponential: its four quarters cover 0→1, 1→2, 2→10,
10→100, so the useful low end gets most of the travel. The mapping
(`sliderToBalance`/`balanceToSlider`), the snap grid, the `×` readout, and the
knob catalog (labels, blurbs) live in `pwa/src/game/balance-knobs.ts`; the
drag track is the shared `@ui/lib/PixelSlider.tsx`. The values persist in the
settings (`balance` in `settings.ts`, applied on load like the other engine
flags) and a RESET ALL row restores the shipped 1× tuning. Keep the page around
ten knobs — one lever per system, not a config editor.

**Settings controls share three reusable pixel widgets** (generic React/UI, in
`pwa/src/lib/`, imported via `@ui/lib/*` for eventual extraction to

The DEVELOPER page's own inventory (what each row does) is
`docs/configuration.md`; the BALANCE knobs as a MEASURING instrument are the
`simulate-run` skill's `--balance`.

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
- `AGENTS.md`'s router and `docs/architecture.md` carry the architectural
  summary; update it when a RULE changes, not when a row does.
- Menu labels and help lines are UI copy, not story — they answer to no
  manuscript chain. A menu row that quotes a character does; load `update-story`
  for that.
