# Configuration

## In-game settings

The main menu's **SETTINGS** screen holds the player-facing configuration,
persisted on-device in `localStorage` under `<storagePrefix>:settings`
(`pwa/src/game/settings.ts`). The `<storagePrefix>` is the `storagePrefix`
field of the identity config (`game.config.json`) — this game ships it as its
own namespace, and a sequel changes it there once.

**SETTINGS is six pages and a hidden one** — GAMEPLAY (what the game does for
you), CONTROLS (how you tell it what to do), INTERFACE (what the HUD draws over
the field), GORE (how much of a mess a kill makes), AUDIO (how loud), DATA
(where your heroes live), and DEVELOPER. The split is the one players already
know from every other game they own, so nobody has to learn THIS game's filing
system. Three of the pages can be absent outright: CONTROLS when every row on it
would be hidden (a touch device with no vibration motor), GORE when the DEVICE
forbids mature content (`nsfwAllowed()`, `pwa/src/app/device-policy.ts` — a
parental control the game still offered to defeat would not be one), and VOICE
CHAT — a seventh page, offered only where the build carries the `voice`
capability, which is why most players never see it.

| Setting                                   | Values                                                       | Default                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gameplay → Auto-equip                     | equip on pickup / keep in bag                                | keep in bag (finds bank to the bag and glow when they beat what's worn; on wears a stronger find on the spot)                                                                                                                                                                                                                                                       |
| Gameplay → Powerups                       | use on pickup / use manually (tap a slot, click, E, or 1-3)  | use manually                                                                                                                                                                                                                                                                                                                                                        |
| Gameplay → Swipe bars                     | on / off (touch-only row)                                    | off (on hides the fixed corner docks; a swipe in from the left, right or bottom screen edge opens both bars — larger icons — centred where the swipe landed, so one-handed players summon them to their thumb; pressing a slot spends it and the bar folds away)                                                                                                    |
| Gameplay → Quick draw                     | bag order / best first                                       | bag order (a weapon sits in the same place in the switcher as in the backpack; BEST FIRST leads with the hardest hitter for your hero, ranked by the dps each weapon would really do with your stats)                                                                                                                                                               |
| Gameplay → Dialogue                       | on / off                                                     | on (arrivals, thoughts and lore play in-world)                                                                                                                                                                                                                                                                                                                      |
| Gameplay → Cutscenes                      | on / off                                                     | on (the prelude scenes play before a level)                                                                                                                                                                                                                                                                                                                         |
| Gameplay → Minigames                      | on / off                                                     | on (the playable interludes — today the DRIVE between the garage and GOODCO, in both directions. Off makes the trip the straight cut it used to be. A minigame pays no loot and no XP and cannot cost a run, so this is not a difficulty row; a party skips them whatever it says, because a drive seats one person. It does NOT gate the ARCADE SHELF — see below) |
| Gameplay → Death scenes                   | on / off                                                     | on (bosses die on their knees and the hero's own death gets a send-off; off goes straight to the splash)                                                                                                                                                                                                                                                            |
| Controls → Steering                       | follow cursor / aim & shoot / gamepad (desktop-only row)     | aim & shoot on a fine pointer (WASD walks, the pointer aims, the left button is the trigger). FOLLOW CURSOR chases the cursor and never aims with it; GAMEPAD walks on the left stick, analogue, with the strike button as the trigger. Touch always steers by holding and dragging and never sees the row                                                          |
| Controls → Auto-fire                      | on / off (desktop-only, shown in AIM & SHOOT and GAMEPAD)    | on (the character fires on its own; off holds every blow until the trigger — the left mouse button, or the pad's strike button — is held)                                                                                                                                                                                                                           |
| Controls → Keys                           | WASD move / mouse only (desktop-only row)                    | WASD move on fine pointers (in AIM & SHOOT and GAMEPAD the row is greyed out and locked at WASD MOVE — both modes always walk by keyboard; hidden on touch)                                                                                                                                                                                                         |
| Controls → Vibration                      | on / off (only where a buzz can land)                        | on (hits scaled to hp lost, the hero's death, menu presses, the dialogue crawl)                                                                                                                                                                                                                                                                                     |
| Controls → Key bindings                   | rebind every desktop key/mouse control (Quake-style submenu) | the shipped scheme (below); RESET TO DEFAULTS restores it                                                                                                                                                                                                                                                                                                           |
| Interface → Health bars                   | on / off                                                     | on (a tiny hp bar rides every wounded mob; bosses and elites always show theirs)                                                                                                                                                                                                                                                                                    |
| Interface → XP on kill                    | on / off                                                     | on (floating "+N XP" text on kills)                                                                                                                                                                                                                                                                                                                                 |
| Interface → Item cards                    | NORMAL / MAGIC / RARE / SET / UNIQUE / LEGENDARY / ARTIFACT  | NORMAL (the LOWEST rarity that still pops a framed loot card; quieter finds drop to the corner feed instead, which is what cuts card noise in a loot flood)                                                                                                                                                                                                         |
| Interface → Minimap                       | follow / whole level                                         | whole level                                                                                                                                                                                                                                                                                                                                                         |
| Interface → Quick bars                    | lower left / lower right                                     | lower left (which bottom corner the big powerup dock sits in; the consumable dock mirrors into the other one in landscape)                                                                                                                                                                                                                                          |
| Gore → Human / Ghost / Robotic / Cosmic   | on / off, one switch per gore FAMILY                         | on each ("is this too much" is not one question: a player who does not want to watch a PERSON come apart is not asking a rover to stop throwing sparks)                                                                                                                                                                                                             |
| Gore → Cleaves / Gibs                     | on / off                                                     | on each (a blade far past what a body holds cuts it in two; a huge blunt blow bursts it. They cross every family — a machine cut in two is still a body cut in two)                                                                                                                                                                                                 |
| Gore → Bloody hero / Bootprints           | on / off (LOCKED while HUMAN GORE is off)                    | on each (what sprays back stays on the worn gear, and the boots track it out onto clean ground). Both are blood's own art in blood's own colours, so both are shown locked rather than hidden when HUMAN GORE is off                                                                                                                                                |
| Gore → Reset all                          | one action                                                   | puts every kind of gore back the way the game shipped                                                                                                                                                                                                                                                                                                               |
| Audio → Mute                              | on / off                                                     | off (silences all audio while the MUSIC and SOUND FX sliders keep their levels, so unmuting restores the exact mix)                                                                                                                                                                                                                                                 |
| Audio → Music                             | 0–100% drag slider                                           | 80%                                                                                                                                                                                                                                                                                                                                                                 |
| Audio → Sound FX                          | 0–100% drag slider                                           | 100%                                                                                                                                                                                                                                                                                                                                                                |
| Voice chat → Voice                        | off / push to talk / open mic (voice-capable builds only)    | push to talk (the row cycles in order of increasing exposure, so nobody lands on "always transmitting" by pressing it once; the microphone is opened only inside a session and nothing leaves the machine until the talk key is held — `T` by default, rebound with every other key under CONTROLS → KEY BINDINGS)                                                  |
| Voice chat → Their voices                 | 0–100% drag slider                                           | 100% (its own level, deliberately outside the MUTE switch above: muting the game silences blasters and music, not the people you are playing with)                                                                                                                                                                                                                  |
| Voice chat → Your microphone              | 0×–2× drag slider                                            | 1× (the device's own level, which the platform's auto gain has already set; the readout is a multiplier because the range goes both ways around it. Applied before the signal is encoded, so the bar on the HUD predicts what the party hears)                                                                                                                      |
| Voice chat → Open mic gate                | 0–100% drag slider (locked outside OPEN MIC)                 | 6% (a little above an ordinary room's noise floor. Transmitting is held for 350 ms past the last loud frame, so a sentence survives the gaps between its words)                                                                                                                                                                                                     |
| Developer → Playground → Debug mode       | on / off                                                     | off (shows the in-run FPS meter; row hidden until unlocked)                                                                                                                                                                                                                                                                                                         |
| Developer → Playground → Auto level stats | on / off                                                     | off (opt-in free per-level base-stat growth; the row is hidden until unlocked)                                                                                                                                                                                                                                                                                      |
| Developer → Playground → Bot view speed   | 1× / 2× / 4× / 8× fast-forward (the GAME SPEED step)         | 1× (real time; the step after difficulty + level in BOT VIEW — runs more game-loop steps per frame so the autopilot blitzes a level; row hidden until unlocked)                                                                                                                                                                                                     |
| Developer → Cheats → Force store          | on / off                                                     | off (surfaces the coin store in any build with packs granted FREE — no payment provider outside production store builds; row hidden until unlocked)                                                                                                                                                                                                                 |
| Developer → Cheats → Seed characters      | mint melee/ranged/magic heroes at LV 34/56/70/99             | none (a manual action — each press banks specimens into the roster; the row is hidden until unlocked)                                                                                                                                                                                                                                                               |
| Developer → Balance                       | twenty-two multiplier sliders, 0×–100× (exponential)         | 1× each — except the HERO SPEED / MOB SPEED pair, which ships at 0.8× (a RESET ALL row restores the lot)                                                                                                                                                                                                                                                            |

The MINIGAMES switch above governs the interludes a RUN hands you. It does not
gate the **ARCADE SHELF** — the main menu's MINIGAMES screen, which a beaten
campaign earns and whose own DIFFICULTY row (persisted as `minigameDifficulty`,
shipped at `medium`) picks the rung a cabinet is played on, out of the rungs
the campaign has actually been beaten on.

**None of the DEVELOPER rows below — nor the gesture that reveals them, nor the
commit hash in the title footer — exist in a build uploaded to a STORE**: the
App Store, Play Store or Steam, each of which is its shell's `production`
profile. (On the `/preview/` and `/branch/` slots that hash is also a
LINK, opening the exact commit the build was cut from; everywhere else it is
the plain text it has always been — see `docs/architecture.md` → Deployment
topology.) They ship everywhere else: the website, the installed PWA, the
`/preview/` and `/branch/` slots, local dev, the native `preview` and
`testflight` apps, and every non-production desktop bundle. The switch is the
build flag `VITE_DEV_TOOLS` (below), and
because it compiles to a literal the store build does not contain the developer
code at all rather than merely hiding it. Such a build also resets these
settings on load, so a latched unlock, FORCE STORE, or a set of BALANCE
multipliers left by a TestFlight install on the same device cannot carry over.

A hidden **DEVELOPER** row unlocks at the bottom of SETTINGS after the title
screen's Easter egg is found, and the gesture is in **two movements**
(`pwa/src/game/title-screen/use-sun-charge.ts`, `sun-race.ts`):

1. **Sixteen quick taps on the sun** in the title sky — each within ~0.9 s of
   the last, or the charge lapses. **The first ten buy nothing at all** (no
   glare, no sound, no buzz), so the secret cannot be stumbled into; the
   eleventh wakes the star, and the build-up hardens tap by tap. The sixteenth
   does not detonate it — it ARMS it.
2. **The click race.** Hold the sun at tempo — a press every 250 ms — and the
   bank fills in real time; miss the beat and it drains half again as fast.
   **Five banked seconds** and the star lets go. The sun GROWS with the bank and
   shrinks as it drains, so the meter is the star itself: no bar, no counter.

The detonation latches `developerUnlocked` (persisted, so the row then survives
launches) and does nothing else — the player opens SETTINGS themselves to find
the new row. The whole gesture is gated on `__DEV_TOOLS__`, so in a store build
the listener, the race loop and the frame paint are compiled out rather than
merely unreachable.

**The developer screen is an INDEX of five category pages, and every row on it
is a door** — which is what keeps it inside a landscape phone's screen. The row
you want is found by what KIND of thing it does rather than by reading a column
of a dozen unrelated tools:

- **PLAYGROUND** — the next run. **SELECT LEVEL** (the warp picker — pick any
  difficulty and mission regardless of unlock state, skipping the intro), **BOT
  VIEW** (hand any level to the autopilot with a real hero, then pick a GAME
  SPEED and a BOT SPEC), **MINIGAMES** (the arcade shelf with its lock off:
  every cabinet on every rung, where the player's own MINIGAMES screen offers
  only what a beaten campaign earned), the one term a run is built on — **AUTO
  LEVEL STATS** (read when a level is BUILT, so a change lands on the next run
  rather than one in progress) — and **DEBUG MODE**, the one thing drawn OVER a
  run.
- **CHEATS** — what a run would otherwise have to earn: **SEED CHARACTERS**,
  **GRANT 10B COINS**, and **FORCE STORE** (which belongs here rather than among
  the build flags because the packs it surfaces are granted free).
- **BALANCE** — the runtime multiplier sliders (below).
- **VISUALS** — the game-feel sliders, the camera, and the three washes the
  finished frame is presented through (below).
- **GALLERIES** — the two full-screen shelves that only look: **ARSENAL** (every
  hand-authored unique/legendary item, ordered by item level and drawn with the
  same icon + item card the in-game inventory uses — steer the scrollable list
  with the pointer or the arrow keys, ESC backs out) and **EFFECTS** (the effects
  gallery — every visual effect the game draws, staged fullscreen over a real run
  and looping, one per screen; see the `?effects` URL parameter below).

**DEBUG MODE** shows a small FPS meter at
the bottom of the screen during runs (the frame rate the render loop actually
achieves — the first probe for performance regressions); the `?debug` URL
parameter below forces the same meter on and additionally controls console
verbosity. **AUTO LEVEL STATS** turns the automatic per-level base-stat growth on
or off — on also brings the horde's compensating hp scaling in lockstep (both
derive from the same rule), and off leaves only chosen points and gear to push
the hero ahead of the curve.

**The map generator has no controls at all**, because it is neither optional nor
tunable: every mission's map is carved fresh at the start of each run from the
mission's own blueprint (`content/maps/<id>.yaml`), at the ONE size that
blueprint prices. The chambers, the walls between them, the horde in each of
them, the caches and — the point of the whole thing — the boss's hiding place
are all rolled from the run's seed. No intended route is generated, so the "go
this way" guidance arrow stays silent and the fog-of-war minimap is the only
record of where you have been: the boss has to be hunted down rather than walked
to. The story is untouched by any of it: a mission carries its own name, intro,
cutscenes, loot pools, merchant, hazards and thought pins, so however THE MOON is
carved it is still the moon.

The developer screen holds a **BALANCE** subpage: a set of runtime
multipliers over the engine's shipped tuning (`engine/game/tuning.ts`, applied via
`setBalanceTuning`; the catalog is `BALANCE_KNOBS` in
`pwa/src/game/balance-knobs.ts`) for probing the game's balance without
rebuilding — XP GAIN (leveling pace), LEVEL SLOWDOWN (how much longer a level
takes per difficulty tier — 25%/tier shipped), ENDGAME WALL (how hard the curve
walls up past level 70 — 5%/level shipped), DEATH PENALTY (the share of the
current level's XP a softcore hero loses on death — 10% shipped, 0× turns it
off), REST XP (the XP swing from a mob's level against yours — bonus above,
grey below), MOB ARMOR (the physical damage the horde shrugs off; magic ignores
it), TALENT POWER (the passive talents' always-on
stat bonuses and offensive proc rates — talent SHAPE like reach and target
counts stays fixed), KNOCKBACK (how far the rare knockback
weapons shove a struck mob back), MOB HP, MOB DAMAGE, TEMPO (how fast
everything on foot moves — hero and horde together, so every chase ratio the
fights were tuned on holds and only the game's pace changes), HERO SPEED and
MOB SPEED (the same two sides on their own, so the pair can be broken apart —
a fast hero in a slow world is `TEMPO 1.5` with `MOB SPEED 0.5`), STAMINA DRAIN
(how fast running spends the sprint pool — 0× makes running free), HORDE SIZE (the wave
spawner's floor and cap), DROP RATE, GEAR SHARE (the equipment slice of the
drop ladder), GEAR QUALITY (magic/rare tier odds), UNIQUE DROPS, REPAIR DROPS
(the repair-kit slice), MENACE GAIN, and CLEAR GATE (how far you must
out-clear the horde's spawn rate before the menace meter heats). Each row is a slider — drag it, tap the track, or steer it with the
left/right arrow keys — spanning **0× (system off) to 100×** the engine's
authored value, where **1× is that value** (which is the shipped tuning for
every row but HERO SPEED and MOB SPEED, the pair that carries the world's own
pace at 0.8×). The track is exponential: its four quarters
cover 0→1, 1→2, 2→10, then 10→100, so the useful low end gets most of the
travel. Values persist with the settings, and a **RESET ALL** row restores the
shipped tuning across the board.

The **VISUALS** subpage holds the game-feel sliders — **KNOCKBACK** (how far an
overkill flings the body), **BLOOD** (how much a wound sprays and how red the
floor gets; 0× is the clean look for a screenshot) and **GORE LINGER** (how many
seconds the pieces of a body lie where they landed) — and under them THE CAMERA,
the world projection dialled live (`docs/rendering.md`):

- **CAMERA PITCH** — how far the camera leans over the floor. 100% looks
  straight down and the game is the top-down scroller it always was; lower and
  the ground rakes away while the bodies keep their height. Shipped at 75%.
- **CAMERA YAW** — how far the camera stands round from square-on, the half
  people mean by "isometric". 0° (shipped) keeps the floor tiles rectangles;
  45° turns them into diamonds. It is the only camera knob the simulation is
  told about: a body drawn standing up covers a strip of floor running along
  whichever bearing comes out horizontal, so the car's collision chain turns
  with it and stays under the car you can see (`docs/rendering.md`).
- **ANTI-ALIASING** — whether the art the yaw TURNS is smoothed as it is baked
  through the projection. Off (the default) is nearest-neighbour, which keeps
  every pixel the artist drew and, on a turned floor, breaks each tile seam into
  a dotted staircase. On bakes the ground supersampled and averages it down, so
  those seams come out as clean diagonals at the cost of a little of the floor's
  crispness and a few extra hundred milliseconds of bake at level start. It does
  nothing at all while CAMERA YAW is 0 — square-on there is no staircase to
  smooth — so it is a switch about the turned camera above it, not a general
  video setting.
- **STANDING WALLS** — whether a `plane: wall` piece is EXTRUDED off its
  footprint (the one projected slice stacked a hero's height up the screen, cap
  on top) or lies down with the floor as a plain tile, the way every wall in the
  game did before the extrusion existed. On is the default and the shipped look.
  The extrusion earns itself under a YAW, where a flat panel stops reading as a
  wall at all and a lab's partitions become a slightly darker path across the
  floor; square-on the floor grid is still rectangles and the flat panel already
  read as a wall, so the faces are a look to have an opinion about. Unlike
  ANTI-ALIASING it is NOT folded together with the yaw — it means "I do not want
  the faces", so sweeping the camera round to compare the two looks leaves the
  answer where the developer put it.

Under the camera sit the three washes laid over the FINISHED frame
(`pwa/src/game/render/postfx.ts`, and `docs/rendering.md` for the mechanism).
Each is a drag track reading as a percentage **of the shipped look**, so all
three read `100%` out of the box and 0 is a true OFF ("COLOR GRADE 100%" says
"as the game is made" where "1.00×" says nothing). The raw amounts and each
track's top end live in `postfx.ts`:

- **COLOR GRADE** — a little more contrast, colour and the faintest cool cast
  over the whole picture.
- **VIGNETTE** — how far the corners fall off into the dark. It is also a
  readability tool (the hero is always centre-screen), which is why it is kept
  modest: a heavy vignette in a game about being surrounded hides the things
  surrounding you.
- **DEPTH HAZE** — aerial perspective, the floor losing contrast as it rakes off
  toward the top of the screen. Scaled by the live CAMERA PITCH, since a camera
  looking straight down has no horizon to fade toward.

They are developer knobs rather than player ones because all three are CSS — a
`filter` on the canvas and two gradients on one overlay — so none of them costs a
frame, and there is no phone budget for a player to win back by turning one off.
A BLOOM knob used to sit beside them and did cost a full-frame canvas pass; it
was removed outright rather than demoted (`docs/rendering.md` carries why).

All of them persist (`cameraPitch`, `cameraYaw`, `cameraAntialias`, `colorGrade`,
`vignette`, `depthHaze`) and, like every developer setting, are stripped from a
store build — so a store build always plays the shipped look.

CHEATS holds a **SEED CHARACTERS** subpage — a shortcut that
mints ready-to-play heroes straight into the roster so a developer can jump into
late-game content without grinding a build out. It offers **SEED ALL** (the
whole matrix) plus one row per power tier — **NIGHTMARE (LV 34)**, **JESUS
(LV 56)**, **POST-JESUS (LV 70)**, and **ENDGAME (LV 99)** — each of which banks
three softcore specimens: a **melee**, a **ranged**, and a **magic** hero built
at that level. Each seed carries a lane-optimized stat spread (melee → STRENGTH,
ranged → DEXTERITY, magic → INTELLIGENCE), level-appropriate rerolled gear whose
armor material follows the lane (heavy STR plate/mail, DEX leather, INT cloth), a
class-correct weapon, and a stock of consumables; the seed's deep lane stat also
banks a pile of unspent talent points to pour into that tree on first load. A
seed is stamped as having beaten every difficulty up to its tier, so its
level picker is open; re-seeding a tier refreshes its specimens rather than
piling up duplicates. The heroes appear under **LOAD GAME**.

Desktop keyboard controls (when **Keys** is set to WASD): the shipped scheme
(`pwa/src/game/keybindings.ts`) is **WASD** steer, **Shift** walks, **Space**
jumps, **Q** opens the weapon switcher (then **1-4** equip a weapon —
**Gameplay → Quick Draw** decides whether those slots follow your **bag order**
(the default) or lead with the **best first** for your hero; the number on each
slot follows the same choice), **E** spends the oldest powerup, **C**
uses a medkit, **X** drinks a stamina potion, and **V** spends a repair kit from
the consumable dock, **I** toggles the bag, **M** the level map, **Y** the
achievement shelf (where World of Warcraft puts it), **G** tears a seam home,
**P** pauses, and the held **Tab** shows the scores in a session while **T** is
push to talk. **1/2/3** also fire the powerup dock slots (a fixed contextual
range). The SCREENSHOT key is the one default that depends on WHERE the game is
running: **F12** inside a store shell (Steam's own screenshot key, which the
overlay hooks as well), **Enter** in a browser or PWA, because a page is not
allowed to swallow F12.
Every one of those controls is **rebindable in Controls → Key Bindings** — a
Quake-style list (action label left, bound key far right): choose a row, then
press the keyboard key or mouse button to bind it (a rebind steals the key off
whatever action held it; **Escape** cancels and is never bindable). Bindings are
stored by physical key code, so WASD stays put under any keyboard layout, and
persist with the settings; **Reset to Defaults** restores the shipped scheme.
**Escape** pauses/resumes the run and closes overlays no matter what else is
bound.

**At the wheel the same four keys are the car's**, and they are pedals rather
than a direction on screen: **D** accelerates, **A** slows down and then backs
up, **W** turns left (up the screen) and **S** turns right (down) — on the way
out of the garage, on the way home, and whichever way the wagon is facing. (The
arrow keys drive too, while they are bound to nothing else.) A **thumb or a
mouse still pushes**: dragging the way the car is pointing is the accelerator,
against it the brake, across it the wheel. How far you drag is **how hard you
are on that pedal**, not a speed to settle at — a small drag toward the nose
gathers speed gently and a big one hard, and no amount of it ever slows the car
down; a small drag against the nose feathers the brake and a big one stamps on
it. Letting go of everything holds the speed rather than stopping — braking is
something you ask for.

**The handbrake is the other hand**: a **second thumb** pressed anywhere on the
picture while you are steering, or **Space** (the JUMP bind — a man in a car
cannot jump, so the key is free at a wheel and follows the bind if you move it).
It is the fastest way this wagon stops by a wide margin, it overrules the
throttle for as long as it is held, and it throws the car's weight onto its nose
— on the road it leaves two black lines and a cloud of tyre smoke behind it.

On touch, tapping the on-screen clock / foe counter in the HUD pauses
too. The run also auto-pauses when the tab or app loses focus (which also stops
the music and every sound, rather than grinding on behind whatever you switched
to); clicking the
screen or pressing the pause key / **Escape** again resumes. During a cutscene,
intro, or dialogue, **Space** or **Enter** turns the page (the first press
finishes the letter crawl, the next advances) and **Escape** skips the whole
scene.

Progress belongs to **characters** — named, persistent heroes
(`pwa/src/game/characters.ts`), stored under `<storagePrefix>:characters`
with the active one at `<storagePrefix>:active-character`. The app opens on the
title menu, whose front door leads with **NEW GAME** and — once the roster holds
a hero at all, and absent until then — **LOAD GAME**. NEW
GAME opens the roster straight on the create form (name the hero and choose
**HARDCORE** at creation — the choice belongs to the character, not a global
setting); LOAD GAME opens the hero list to pick a saved hero (or retire the
fallen). A freshly created hero, or one who has beaten their current difficulty,
drops into the difficulty ladder to pick a lane or step up a rung; a hero
mid-campaign skips the ladder and resumes at the **beginning of their current
level** on the difficulty they are already on (no difficulty picker —
`resumeTargetFor`). A character owns ONE evolving build (the
engine `Loadout` — level,
stats, gear, inventory, coins, abilities, companions) that carries whole into
every difficulty and level, so higher difficulties are met with the gear earned
on the lower ones. It also remembers which difficulties it has BEATEN and which
levels it has CLEARED — pure progress bookmarks that gate two things: the
difficulty ladder (the three parallel starting lanes — easy/medium/hard — are
all open from the start; NIGHTMARE unlocks once any one is beaten, JESUS once
NIGHTMARE is; locked rungs show greyed out), and a difficulty runs as a linear
campaign until it is beaten, after which its level picker opens for free replays
(the grind-for-gear endgame). **HARDCORE is permadeath**: a hardcore hero that
dies is retired for good (kept in the roster as fallen, never played again), and
its death splash offers only MENU. A softcore death costs no progress — the
run's build is banked on death just as on victory, so the hero keeps the levels,
stats and items earned it and can RETRY the level (from that kept build) or exit
to MENU; only the level-clear bookmarks wait for an actual victory. High scores
are a **hardcore-only, whole-campaign** affair: a hardcore hero's foes felled,
survival time and highest menace stage are summed across every map of a
difficulty's campaign and banked per difficulty under
`<storagePrefix>:campaign-scores` (`pwa/src/game/highscores.ts`) when the
campaign is beaten (**SURVIVED**) or the hero falls partway through it
(**FELL**, its totals including the fatal run). Softcore heroes never score.
Survival time is the **combat clock** (`stats.combatMs`), which only ticks while
a fight is live — a foe on the field, or within a two-second tail of the last
kill — so a cleared field can't be milked for time (the HUD run timer shows this
clock, not the wall clock). The menu's HIGH SCORES board ranks the campaigns
four ways (mobs killed, survival time, kills-per-minute, peak menace) and opens
any campaign into a full breakdown. The DRIVE keeps its own board beside them
(`<storagePrefix>:drive-scores`, initials at `<storagePrefix>:drive-initials`).
A run's opening plays unless GAMEPLAY → CUTSCENES is off, or the hero has
already FINISHED that level on that difficulty — a run that died or was
abandoned partway still owes its story (dismiss with the top-right SKIP
button).
An in-progress run is parked to storage too, under `<storagePrefix>:current-run`
(`pwa/src/game/saved-run.ts`), so the menu's **RESUME** button survives a
page reload — the one an app update forces included — instead of vanishing with
the wiped memory. It is **written while the run is being played** rather than
only on the way out to the menu (`pwa/src/game/game-screen/autosave.ts`): at
most every five seconds, and only when the run has actually moved (a kill, a
pickup, coins, XP, a story item); a ding, a boss going down or an errand turned
in is written sooner; and backgrounding the app writes immediately, which is
what covers a phone killing the game from the app switcher without running any
unload handler. The snapshot is dropped once the run is resumed, abandoned
(victory/defeat MENU), resolved (the hero falls, or the level is cleared —
whose outcome the character carries from there), or replaced by a fresh game,
and a snapshot written by an incompatible older build is discarded rather than
resumed. The demo, BOT VIEW and a joined session park nothing. Clearing site
data resets all of it; the `?cutscene=<id>` workbench replays any scene
regardless, and `?level=<id>` reaches any level regardless of unlock state.

A hero can be carried between devices from **SETTINGS → DATA**: **EXPORT
CHARACTER** opens a picker over the whole roster where you tick one or many
heroes (not just the current game) and download each as a small signed `.zip`
(a `character.json` save plus a `manifest.json`), and **IMPORT CHARACTER** opens
a file picker to load one back into the roster as a fresh copy
(`pwa/src/game/character-transfer.ts`). The archive is signed with an
HMAC-SHA256 key (`VITE_CHARACTER_SIGNING_KEY`, below), so a hand-edited save
fails to re-import — an anti-cheat speed bump, not a wall, since the key ships
in the bundle.

File transfer is **web-only**. In the App Store / Play Store app both rows are
gone, and **SETTINGS → DATA** offers **CLOUD SAVE** alone: the app mints
platform achievements off a hero's progress, so a roster that can be handed
between accounts as files would make a Game Center board a claim about nobody.
Cloud save moves a roster between the player's own devices without leaving
their account (see `docs/architecture.md`).

Everything else configurable concerns the build and the development
environment.

## Environment variables

**`VITE_BASE`** — read by `pwa/vite.config.ts`. The deploy-slot base path: `/`
(production), `/preview/` (staging), `/branch/` (branch slot). Defaults to `/`
for local dev and the CI quality gates. Drives asset URLs, the service-worker
scope, the per-slot robots meta, and the precache cache id.

**`GITHUB_SHA`** — read by `pwa/vite.config.ts`. Marks the build as a CI one,
which is all it is read for: the build label shown in the update toast,
published in `version.json` and stamped into `sw.js` is the commit ACTUALLY
built (`git rev-parse HEAD` in the checkout), and so is the title screen's hash.
The env sha is only the fallback for a CI tree with no git dir; off CI the label
is a build timestamp. The distinction is load-bearing for the root slot, which
is rebuilt from its release TAG on every deploy while `GITHUB_SHA` names
whatever `main` commit triggered the run — stamping that moved the worker's
bytes on pushes that changed nothing it serves, prompting installed apps to
apply a no-op update.

**`VITE_DEV_TOOLS`** — read by `pwa/vite.config.ts` (build-time). Set to `off`
to build the site WITHOUT the developer tooling: the hidden sun reveal (sixteen
taps to arm — the first ten answered by nothing at all — then the click race),
the whole DEVELOPER menu tree behind it (the PLAYGROUND warps and run terms, the
CHEATS, the BALANCE and VISUALS knobs, the GALLERIES + the `?effects` deep link,
DEBUG MODE), and the commit hash beside the version in the title footer. Any
developer state a previous install persisted is reset on load too. Anything else
(unset included) keeps them, so web, PWA, the preview/branch slots, local dev,
and TestFlight all have the tooling. All three shells' `bundle-web.mjs` set it,
each on its own `production` profile — the build uploaded to a store
(`GIS_BUILD_PROFILE` names the profile for the two desktop trees, the EAS
profile for `native/`); every other profile keeps the tooling, so a preview
build behaves exactly like the website. It is a build-time literal
(`__DEV_TOOLS__`), so an `off` build drops the tooling's code rather than hiding
it.

**`VITE_SHELL_BUILD`** — read by `pwa/vite.config.ts` (build-time). Set to `on`
when the site being built is going INSIDE a store shell rather than onto the
web. It does one thing: `index.html` ships without the prerendered boot shell
(`stripBootShell` in `pwa/pwa-plugin.ts`), leaving `<div id="root"></div>` and
the brand background until the studio card mounts. That markup is SEO —
crawlable copy and the no-JS fallback — and a compiled build has neither a
crawler nor a browser with JS off, so all it did there was flash an SEO document
between the platform splash lifting and the card. Set by all three shells'
`bundle-web.mjs` on EVERY profile, unlike `VITE_DEV_TOOLS` above, which only
`production` turns off — this is about the medium, not the audience. `/privacy/`
and `/contact/` are untouched (both app stores require them, and they are
derived from `index.html` before the strip runs); so is every web and
deploy-slot build, which is what `pwa/scripts/check-seo.mjs` measures.

**`PLAYWRIGHT_CHROMIUM`** — read by every Playwright-driven script in
`pwa/scripts/`. Path to a Chromium binary for the harnesses that drive a real
browser — the playtest loop, the store/UI/town shot recipes, the cutscene,
weapon-swing, talent, nuke and level-up previews, the sky verifier, and the
library build (which PHOTOGRAPHS the in-game item card rather than redrawing
it). Normally unset — `npx playwright install chromium` puts the browser where
Playwright expects it, and every CI job that builds does exactly that. Set it
only in a sandbox whose preinstalled browsers do not match the installed
Playwright's expected build, where the launch otherwise fails with an
"Executable doesn't exist" error.

**`VITE_CHARACTER_SIGNING_KEY`** — read by `pwa/src/game/character-transfer.ts`.
HMAC-SHA256 key that signs exported character archives so a hand-edited save
fails to re-import (an anti-cheat speed bump, not a wall — the key ships in the
bundle). Optional: `.github/workflows/pages.yml` maps the
`CHARACTER_SIGNING_KEY` deploy secret onto it; an empty/unset secret falls back
to the committed default key. Set the secret to rotate the key.

**`SUPPORT_EMAIL`** — read by `pwa/vite.config.ts` (build-time). The support
address the contact page and the privacy policy print, and the one App Store
Connect lists as the app's support contact. Kept in the `SUPPORT_EMAIL` repo
VARIABLE rather than the source so it can change without a commit and isn't
sitting in a public tree for scrapers. A build without it prints a visible
placeholder rather than a dead link.

**`COMMUNITY_URL`** — read by `pwa/vite.config.ts` (build-time). Where EXTRAS ->
COMMUNITY sends a player: the chat server the players keep. Kept in the
`COMMUNITY_URL` repo VARIABLE rather than the source because chat invites expire
and a leaked one gets spammed, so it has to be rotatable without a commit. A
build without it does not offer the row at all — unlike the support address, a
destination is better absent than dead. Both store shells hand the link to the
player's own browser rather than steering the game window onto it.

**`EXPO_PUBLIC_STORE_PAYMENTS`** — read by `native/src/store-purchases.ts`
(build-time). Set to `required` to make the native coin store charge real money
through StoreKit / Play Billing. Only the `production` EAS build profile sets it
(`native/eas.json`); every other build — local dev, simulator, preview, and the
store-signed `testflight` profile — price-tags packs `FREE` and grants them
without a pay sheet. See `pwa/src/game/store.ts`.

**`EXPO_PUBLIC_CLOUD_SAVE`** — read by `native/app.config.js` (build-time). Set
to `off` to build the native app WITHOUT the iCloud key-value and Game Center
entitlements. Cloud save then reports itself unavailable and the game stays
device-local. For local builds signed by an Apple ID whose App ID has neither
capability enabled — an entitlement the App ID doesn't carry fails code signing.
Store builds must leave it unset. See `native/README.md`.

**`GIS_ASC_HOST`** — read by `scripts/game-center-push.mjs`. Points the Game
Center push at a stand-in for App Store Connect instead of
`api.appstoreconnect.apple.com`. Testing only — it exists so the read → plan →
write path is exercisable end to end (`tests/game_center_push_apply_test.ts`)
rather than only up to the first socket.

**`STEAM_WEB_API_KEY`** — read by `scripts/steam-achievements-portal.mjs`. The
Steamworks **publisher** Web API key (Steamworks → Users & Permissions → Manage
Groups → your group → Create Web API Key), used by `make
store-steam-achievements ARGS="--verify"` to read the app's achievement schema
back and name every id the partner site is missing or holds mistyped. Read-only,
and needed only for the verify — printing the worksheet touches no network. A
personal Web API key authenticates and still cannot see an unreleased app (a
bodyless 403). See `electron/RELEASING.md` §1.4.

**`GIS_STEAM_API_HOST`** — read by `scripts/steam-achievements-portal.mjs`.
Points the achievement verify at a stand-in for Valve instead of
`api.steampowered.com`. Testing only — the twin of `GIS_ASC_HOST`, so the read →
compare → verdict path is exercisable end to end
(`tests/steam_achievements_verify_test.ts`).

### The desktop shells' own environment

**Five capabilities are decided when a desktop binary is PACKAGED** — they
belong to the build, not to the machine that runs it. **One vocabulary drives
both shells**, so `electron/` bakes them into a packaged manifest and `tauri/`
into the machine code (`tauri/src-tauri/src/stamp.rs`), and the four packaging
targets read the same names:

| Make variable        | Env var                  | What the build carries                         |
| -------------------- | ------------------------ | ---------------------------------------------- |
| `ENABLE_MULTIPLAYER` | `GIS_ENABLE_MULTIPLAYER` | Sessions, the server browser, the direct door  |
| `ENABLE_MODS`        | `GIS_ENABLE_MODS`        | The Workshop and the local mod folder          |
| `ENABLE_UPNP`        | `GIS_ENABLE_UPNP`        | May ask the router to forward the bound port   |
| `ENABLE_VOICE`       | `GIS_ENABLE_VOICE`       | Voice chat in a session — opens the microphone |
| `ENABLE_LICENSED`    | `GIS_ENABLE_LICENSED`    | Sessions it hosts may admit players at all     |

`make desktop-steam` / `make desktop-tauri-steam` default all five to `1` (the
depot build); `make desktop-dist` / `make desktop-tauri-dist` default all five
to `0` (a plain download), and both pairs let a variable override the default —
`make desktop-dist ENABLE_MODS=1`. **VOICE is off in a plain download on
purpose rather than by omission**, and it needs `ENABLE_MULTIPLAYER` (voice
travels inside a session; the shell refuses the pairing rather than granting a
microphone nothing can talk into). **Unset means off in a packaged target; a
build from sources with no switches at all keeps everything**, so a checkout is
always the whole game. `GIS_STAMP_CAPABILITIES=1` is what makes the stamp
happen at all, `GIS_PACKAGE_PROFILE=standalone` marks the plain download, and
`PLATFORM=win|mac|linux` picks one target instead of this machine for the two
Electron ones. `GIS_STEAM_APP_ID` must be the real app id for a store build —
`tauri/scripts/package.mjs` refuses a build still pointed at Valve's Spacewar
test app (480) unless passed `--allow-placeholder`.

At RUNTIME both shells read the same handful: `GIS_STEAM=off` (don't talk to
Steam at all — how most local shell work happens), `GIS_STEAM_OVERLAY=1|0`
(force "was this started by Steam", which decides the overlay's surface),
`GIS_GAME_URL` (load a remote URL instead of the bundled site, e.g. the
`/preview/` slot), `GIS_VERBOSE=1` (keep the informational log in a packaged
build) and, Tauri only, `GIS_WEBROOT` (serve the site from elsewhere without
rebuilding). The native shell's peer of `GIS_GAME_URL` is
`EXPO_PUBLIC_GAME_URL`. Each shell's README is the detail:
**`electron/README.md`**, **`tauri/README.md`**, **`native/README.md`**.

## URL parameters

**`?debug`** — Enables debug-level console output (`engine/output.ts`,
OSS_GAME_SPEC §19.3). All levels are always captured in the in-memory buffer
regardless; the flag only controls console verbosity. Additionally exposes the
live engine state as `window.__game`, the scenario hook as
`window.__scenario(spec)`, and two animation-tuning hooks —
`window.__swing({kind, weaponClass, t})` pins the field hero's held weapon at a
fixed fraction `t` (0..1) of its swing arc (`null` clears it; for a melee swing,
an optional `arc`/`range` also draws the matching slash pinned at the same
fraction), `window.__timeScale(f)` scales the whole simulation clock so a fast
animation runs at `f`× speed (`1` restores real time), `window.__speed(f)`
FAST-FORWARDS the whole run to `f`× real time (the opposite lever — it runs more
fixed steps per frame rather than scaling the step size, so it stays
deterministic; clamped to `[1, 16]`, `1` restores real time),
`window.__talent(id, rank)` trains the named passive talent to `rank` (default
its max) on the live run so its always-on FX can be eyeballed without leveling
into it (rank 0 untrains it; pair with `__scenario` for a horde and
`__timeScale` to slow it), and `window.__nuke()` sets off a real screen-clearing
NUKE at the hero without the rare pickup (for eyeballing the detonation FX — the
canvas shockwave/embers/scorch, the full-screen CSS flash/light/fire/smoke
overlay, and the caught mobs burning up into their own smoking remains; pair
with `__scenario` to stage a horde and `__timeScale` to slow it), and
`window.__levelup()` plays the whole level-up SPECTACLE at the hero without
actually leveling (the light shockwave that hurls the horde back, the
world-anchored burst + shockwave rings + sparkle-stars, the full-screen
flash/bloom/god-rays/pillar overlay, the golden burn, and the fanfare — no stat
points, so the chooser modal never opens; the whole show is sized to the hero's
level, from a 20% glow at level 2 to the full detonation at the cap, so pair
with `__scenario` to stage a level (and a horde) and `__timeScale` to slow it) —
all wired in `pwa/src/game/game-screen/run-setup.ts`, so DevTools, the playtest
harness (`pwa/scripts/playtest.mjs`), the weapon-swing preview
(`pwa/scripts/weapon-swing.mjs`), the talent preview
(`pwa/scripts/talent-preview.mjs`), the nuke preview
(`pwa/scripts/nuke-preview.mjs`), and the level-up preview
(`pwa/scripts/levelup-preview.mjs`) can inspect and re-shape real runs. On the
TITLE screen it also exposes `window.__mods(bundles)`, which installs mod
bundles into the next run without a mods folder
(`pwa/src/game/TitleScreen.tsx`). It also forces the in-run FPS meter on (the
DEVELOPER menu's DEBUG MODE setting shows the same meter).

**`?bot=<strategy>`** — Hands the run to the engine autopilot
(`engine/game/bot/index.ts`): the bot skips any prelude cutscene, dismisses the
intro, steers, jumps, and spends level-up points itself. Strategies (the
positioning posture): `aggro` (close and hold tight, tolerate a denser ring
before bailing), `balanced`/`survivor` (the adaptive edge-hug), `flee` (hold
far, disengage early), plus the simpler `idle`, `rush`, `kite`, `boss`. Unknown
names are ignored (normal input applies). Used by the playtest harness (usually
combined with `?debug`) and the seed for an AI-controlled second player.

**`?speed=<n>`** — FAST-FORWARDS the run: the app simulates `n`× as many fixed
game-loop steps per animation frame, so the whole run advances `n`× as fast (a
`?bot=` playtest clears a level in a fraction of the wall-clock time). It runs
MORE steps at the same step size — never bigger steps — so a fast-forwarded run
is deterministic and identical to a real-time one, just quicker (contrast the
slow-motion `?debug` `window.__timeScale`, which scales the step SIZE). Clamped
to `[1, 16]`; `1` (or absent/invalid) is real time. Overrides the developer BOT
VIEW fast-forward (DEVELOPER → PLAYGROUND → BOT VIEW → GAME SPEED, a 1×/2×/4×/8×
step) for the run. Mainly for the playtest harness (`pwa/scripts/playtest.mjs
--speed <n>`); with `?debug`, `window.__speed(n)` retunes it live. Wired in
`pwa/src/lib/game-loop.ts` (`speed`) and `pwa/src/game/GameScreen.tsx`.

**`?botProfile=<build>`** — The bot's stat-distribution BUILD — how it spends
level-up points (see `engine/game/builds.ts`): `meta` (default; the level-band
STRATEGY — melee early, magic mid–high, then melee again at the level cap where
the pure-damage/armor-pierce artifacts drop), `melee`, `ranged`, `magic` (focus
one weapon lane; each still banks INTELLIGENCE for the reach/AoE-cleave/crit
that helps every class), `balanced` (spread reasonably across every stat, no
pinned lane), or `auto` (the emergent lane from what it has invested in).
Through the stat-aware auto-equip the build also decides the weapon and gear.
Only meaningful alongside `?bot=`. Unknown names fall back to `meta`.

**`?noachievements`** — Developer/store-capture mode that keeps a staged run
from recording achievements, opening the achievement shelf, or showing
achievement toasts. It is ignored when developer tooling is compiled out.
Screenshot recipes enable it by default and may opt out only when achievement UI
is intentionally being shown.

**`?level=<id>`** — Dev override that starts runs on a specific catalog level
(`engine/game/defs/levels/` — this game's campaign ids in story order:
`goodco_hq`, `moon`, `mars`, `the_rift`, `boot_hill` — plus the two off-campaign
venues, the hub `garage` and the secret `the_bunker`, normally reached only
through its rift gate) instead of the level picked in the menu's level-select
screen. It bypasses the campaign unlock gate, so it reaches any level regardless
of saved progress. A mid-campaign jump with no banked loadout starts with the
engine's derived stand-in (`deriveArrivalLoadout`) — roughly what clearing the
earlier levels would have banked — so testing later levels stays realistic.
Unknown ids are ignored (the menu selection applies). Normal play uses the
level-select screen; `?level=` is for testing a specific level directly.

**`?daylight=<0..1>`** — Pins how much DAYLIGHT the run stands in — `0` is the
deep of the night, `1` broad daylight, and anything between is a point on the
dusk/dawn ramp. Only a venue that stands under a sky reads it (`sky:` on the
mission — today that is the GARAGE alone), so it does nothing at all on the
moon, on Mars or in the rift. Without it the app reads the machine's own clock,
except on the visit that plays a venue's opening, which is the story's own
night. It is the developer handle for looking at the hub at an hour that is not
now — a screenshot, a lighting pass, a `?bot=` playtest of the lamps — and it
travels as a session parameter, so a hosted game puts the whole party in the
same night (`pwa/src/game/time-of-day.ts`, `engine/game/daylight.ts`).

**`?seed=<n>`** — Pins the run's layout seed (a positive integer) so retries and
bug reports lay the level out identically. Absent or invalid, the seed derives
from the clock. See the debug-game skill.

**`?scenario=<json>`** — Dev/test override that mutates a fresh run into an
exact situation (`applyScenario`, `engine/game/scenario.ts` — see the
`test-scenario` skill): teleport the hero (`"place":"boss"`,
`"place":"merchant"`, or `{x,y}`), set hp/stamina/level/stats/coins, swap or
strip the weapon and worn gear, bank powerups, stock the consumable dock
(`medkits` per-quality counts, `staminaPotions`, `repairKits`), train talents
(`talents`, id → rank), clear the field, silence the wave spawner, spawn rings
of extra mobs around the player at a minimum distance (optionally pre-wounded
via `hpFrac`, to pose battle-damage sprite stages), wound the level's own boss
to a fraction of its bar (`bossHpFrac` — the one body a scenario cannot place,
so a battle-worn boss, a two-phase fight already in its second phase, or a boss
posed for the killing blow can be staged directly), lay ground items out around
the hero (`drops`: loose pickups, equipment/unique/ability/story ids), `freeze`
the world's actors for a stable screenshot (enemies/merchant/companions hold
still; the hero stays playable — pair with `disarmed`), start powerups ALREADY
RUNNING (`runAbilities` — the orbit circling, the stasis field slowing, the
magnet pulling, as opposed to `abilities`, which only banks them in the dock),
and the three DISPLAY-CASE switches that hold a staged situation up for as long
as it is looked at: `reveal` (lift the fog off the whole map, so nothing staged
past the hero's reveal radius comes out dark or culled), `muteDialogue` (silence
the in-world scenes, so a staged elite's arrival can't park the run in the
`dialogue` phase and freeze the simulation), and `noVictory` (a staged field
with no boss left on it reads as a cleared objective and would otherwise end the
level mid-pose). The value is URL-encoded JSON, e.g.
`?scenario={"place":"boss","hp":2,"weapon":null,"spawns":[{"enemy":"ghost","count":60,"minDistance":60}]}`.
Applies once at run start (not to resumed or checkpointed runs); by default it
also skips the opening. Invalid JSON is ignored with a warning. Combine with
`?level=`, `?seed=` (the spawn ring draws on the run's seeded rng, so repros are
exact), `?bot=`, and `?debug`.

**`?cutscene=<id>`** — Opens the cutscene workbench instead of the game: plays
one scene from the catalog (authored in `content/cutscenes/<id>.yaml`) with
TAP/SKIP/REPLAY controls, for iterating on scene authoring. With `?debug`,
exposes the live scene as `window.__cutscene` for the preview harness
(`pwa/scripts/cutscene-preview.mjs`). Pair with `&tags=a,b` to hand the scene
the run tags its conditional dressing answers to (`CutsceneProp.needs` /
`until`) — `&tags=cleared:moon` plays the launch with the house it left behind
last time.

**`?effects[=<id>]`** — Opens the developer EFFECTS GALLERY instead of the game
(`pwa/src/game/effects-gallery/`): every visual effect the game ships, each
staged as a real fullscreen game situation and replayed on a loop — the nuke
over a horde, the ding at the level cap, every signature blade and shot, every
talent's always-on FX, the world's own hazards. Browse with the side buttons /
←→ (↑↓ jump a whole shelf), search the catalog at the top, tap the field (or
press `Enter`) to run the show again, `S` (or the SPEED chip) to step the
diorama down through `1X / 1/2X / 1/4X / 1/8X` slow motion — it scales SIM time,
so the effect and the loop's own rhythm stretch together and a 200 ms burst can
actually be judged — and `H` to hide the gallery's chrome for a clean look. The
last shelf is **DRIVE** — the minigame's own collisions (a body clipped on the
wing and one taken square, trading paint, a crunch into the back of a van, a
panel bending, the bumper going, the engine dying, and the ride at 120 with no
collision in it at all), each hosted by a real `DriveState` rather than a run,
with the camera holding where the hit landed so the gore, the sparks and the
smoke can be watched rather than driven past. `=<id>` opens straight on one
exhibit (the ids are the catalog's — see `effects-catalog.ts` and
`drive-exhibits.ts`); with `?debug`, the live diorama is exposed as
`window.__gallery`. `&speed=<1\|0.5\|0.25\|0.125>` opens at that slow motion,
and `&caster=<enemy id>` restages the ELITE exhibits in that mob's own hands
(what `pwa/scripts/elite-abilities.mjs` drives). The same deep link drives the
contact-sheet script (`pwa/scripts/effects-gallery.mjs`), whose `--strip N` /
`--speed` flags shoot a filmstrip across an effect's whole life and composite
the run into a single `sheet.png`. Also reachable from SETTINGS → DEVELOPER →
GALLERIES → EFFECTS.

**`?drive[=home]`** — Opens the DRIVE on its own instead of the game
(`pwa/src/game/drive-screen/DriveWorkbench.tsx`) — the minigame without the
five-minute walk to the garage it otherwise sits behind. `?drive` is the trip
out, `?drive=home` the way back; `&difficulty=<rung>` picks the ladder rung the
road is driven on (the one thing about it that cannot be judged from a single
drive), `&seed=<n>` pins the stretch of road, `&gore=off` knocks bodies aside
instead of bursting them, `&stage=body\|traffic\|both` plants a collision right
in front of the bumper so a spark, a sound or a shake can be looked at twice,
`&bot=1` hands the wheel to the engine's own auto-driver
(`engine/game/drive/driver.ts`) so a screenshot or a long look does not need a
hand on the keyboard (an auto-driven leg arrives silently — the HIGH-SCORE board
is never raised for one, and never banks its initials), `&course=<px>` brings
the finish line forward on the same knob the attract loop uses, which is how the
arrival beat and the high-score board are reached without driving a full minute
of road first, and `&city=<px>` moves the town's own gate (0 opens the leg
inside the town). With `?debug`, the live `DriveState` is exposed as
`window.__drive` — the road's own `window.__game`, and how a staged collision
(park a moped in the hero's lane, hand a car three rungs of damage, empty a
saloon's seats) is set up from DevTools rather than waited for. Arriving rolls
straight into the next lap on a fresh seed; ESC leaves. Developer tooling,
folded out of a store build with the gallery. For the road measured rather than
watched, `make drive-bench` drives N seeds a rung with the same driver and
reports arrival rate, trip time, bodies and ending wear.

**`?skytest`** — Planetarium test view of the title screen: strips the menu
chrome (logo, menu, footer) so the sun-lit, rotating globes of all eight planets
(and the Moon) can be inspected on a bare sky. Pair with `window.__skyFreeze`
(0..1 pins the master orbital loop) and `window.__skyState` /
`window.__skyLabels` (`pwa/src/game/title-sky.ts`). `__skyState.bodies` carries
each body's screen centre, scale, depth and the 3D light vector it was shaded
with; `window.__skyZoom(z)` drives the camera (the wheel/pinch/drag version is
the DEVELOPER → VISUALS → SKY CAMERA switch); the correctness harness
`pwa/scripts/verify-sky.mjs` reads the same hooks, and
`node pwa/scripts/planet-maps.mjs` renders the surface maps themselves.

**`?splash` / `?nosplash`** — Force the opening STUDIO CARD on, or off
(`pwa/src/game/SplashScreen.tsx`). A plain launch — which is every shell, and
every player — shows it: the publisher's name over the menu's own sky while the
sprite atlas, the planet shader and the backdrop's nine surface bakes are done
UNDERNEATH it, so the title menu is finished by the time the card lifts. It
clears on any key, button, click or tap after one second, and on its own at
three — but never before the load is done, however long that takes. `?debug`,
`?bot=` and `?skytest` suppress it, because a harness driving the app must not
lose three seconds and its first click to a card; `?splash` overrides that (it
is how the card itself is screenshotted), and `?nosplash` is the plain opt-out
for everyone else.

**`?net=off`** — Forces the LOCAL run driver, so a run simulates in this
renderer instead of in a session process
(`pwa/src/game/game-screen/run-driver.ts`). The session path is the one thing in
multiplayer that cannot be proved from a test — it needs a forked process and a
packaged shell — so a player who hits a bad session has a way back into their
game that does not involve a new build.

**`?voice=<url>`** — Streams an audio FILE into voice chat instead of opening
the microphone (`pwa/src/game/net/voice/file.ts`). A .wav, .mp3 or anything else
the browser decodes, resampled and mixed to mono for you, looping by default. It
is a `VoiceProvider` like the microphone, so what reaches the wire is exactly
what a real microphone would have put there — which is what makes it an
instrument rather than a parallel path. Developer tooling; folded out of a store
build. Pair it with `window.__voiceTap()` on the LISTENING machine to record
what arrived, and `window.__voiceWav(seat)` to write it out.

## Gameplay tuning

All balance knobs — level size, player/enemy speed and hp, weapon cooldown
and range, item heals, spawn counts — live in one place:
[`engine/game/config/`](../engine/game/config/), one module per system behind an
`index.ts` barrel. They are compile-time constants by design; tuning happens
by editing those modules and playtesting
(see the `playtest` skill). The difficulty ladder's multipliers live in
[`engine/game/defs/difficulties.ts`](../engine/game/defs/difficulties.ts) —
MEDIUM is the exact 1.0 baseline the levels are tuned at.

**Mercy drops** ease the fight without making it un-losable: a packed screen
(20+ mobs) starts dropping screen-nuke bombs, low
health or worn-down gear makes medkits, armor pieces, and repair kits rain
harder, and a hero stranded with a bone-dry sprint pool (stamina at exactly 0,
not merely low) is thrown STAMINA POTIONS — a per-kill chance that ramps with the
time spent winded up to 15% on EASY, tapering down the ladder to zero on
JESUS. Medkits, stamina potions, and repair kits no longer fire on contact:
touching one banks it into the **consumable dock** (a medkit slot, a stamina
slot, and a repair slot above the powerups), stacked 5 deep — medkits per
quality — and the hero spends them on his own call (tap the slot, or **C** /
**X** / **V** on desktop), medkits biggest-heal-first, never wasting one at a
full bar. The drop ladder reads that state back, as an **appetite** on each
consumable's slice — SUPPLY times NEED. _Supply_ fades the slice as the pouch
fills (`CONSUMABLES.appetiteStart`) down to a thin floor
(`CONSUMABLES.appetiteFloor`) on a full stack: a pickup the stack refuses is
one the hero walks over for the rest of the run, but a kit lying on the
GROUND is still a strategic asset — the free top-up that makes diving a pack
worth it, the drink banked against a sprint burst — so the rain thins to bait
rather than stopping. _Need_ leans it back up in proportion to how far the
pool that kind refills has drained (`CONSUMABLES.appetiteNeedBonus`): simply
not being at full health, full stamina, or full durability finds you a little
more of the matching kit, on every rung, long before the mercy ropes below
start throwing you anything. (Ammunition carries the same appetite shape in
`AMMO`, `engine/game/config/ammo.ts`.) So the rain follows what you SPEND
rather than
what you hoard, and what you are SHORT of rather than a flat table; a maxed
pouch hands most of its share back to the ladder's tail (and, from a crate,
to gear or the other consumable) instead of littering the field. A repair kit mends the WHOLE arsenal at once — the held weapon and
every weapon in the bag — and a weapon worn down to zero durability is no longer
destroyed: it falls into the bag as a broken, unequippable spare (the hero draws
the best remaining weapon, or is left bare-handed with none), waiting
for a repair kit to wake it. Spending one restores the weapons it booted from
the hand in the order they were shed, so the hero's main blade comes back to
hand. Each signal keeps at most ONE rope on the ground: while the
rescue it answers with (a medkit, repair kit, drink, screen-nuke, or armor
piece) already lies un-collected within `MERCY.rescueRadius` of the hero, that
signal holds fire — picking it up (or leaving it behind out of view) re-arms
the rope. The ramp _shapes_ (where each signal starts and maxes) are the
`MERCY` block in `engine/game/config/loot.ts`; each rung's _strength_ is its
`mercy` object in `difficulties.ts` (`MercyTuning`), tapering geometrically
down the ladder
(~×0.4 per rung: EASY full, MEDIUM lighter, HARD a whisper, NIGHTMARE a
ghost, JESUS absolute zero — death is always on the table up there). Every mercy rope makes a dramatic entrance: rather than blinking
onto the ground, a guardian ANGEL flies it in from above, cradles it, and
releases it over the spot the mob died — the whole descent inside
`MERCY.angelDeliverMs` (under two seconds), during which the gift is airborne
and can't be grabbed (the magnet leaves it alone too).

## The dedicated server

Steam builds host a session from inside the game, and the same server runs from
a terminal for a group that would rather not keep somebody's game open (see
[`docs/multiplayer.md`](multiplayer.md)). It reads a JSON config file, and most
fields have a command-line twin; **flags win over the file**.

```sh
npm run server:start                          # defaults
npm run server:start -- --port 27015          # …on a chosen port
npm run server:start -- server.config.json    # …from a file
```

| Field                      | Flag           | Default  | What it is                                                                                                                                                                                                           |
| -------------------------- | -------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`                    | `--level`      | `moon`   | The mission to run.                                                                                                                                                                                                  |
| `difficulty`               | `--difficulty` | `medium` | `easy` … `jesus`.                                                                                                                                                                                                    |
| `seed`                     | `--seed`       | rolled   | The run's seed. A rolled one is PRINTED — a run nobody can reproduce is a bug report nobody can act on.                                                                                                              |
| `port`                     | `--port`       | 27015    | The UDP port to TRY. What was BOUND is what gets printed, and the two are not the same thing.                                                                                                                        |
| `maxPlayers`               | `--players`    | 8        | Seats. Capped at the wire's own `MAX_CLIENTS` (8).                                                                                                                                                                   |
| `bots`                     | `--bots`       | 0        | Seats filled with AUTOPILOT heroes, 1–8. Each is an ordinary client and yields its seat when a person joins.                                                                                                         |
| `password`                 | `--password`   | none     | A speed bump between the people invited and everybody else, never a wall.                                                                                                                                            |
| `licensed`                 | `--licensed`   | false    | **The operator's licence CLAIM, and without it this server refuses every join.** A declaration, not a check — the store build carries it in its packaging.                                                           |
| `noPortMap`                | `--no-portmap` | false    | Never ask the router to forward the bound port. For a box whose ports are already forwarded, or a LAN.                                                                                                               |
| —                          | `--verbose`    | off      | A detailed status line every second. (`--debug` is reserved by Electron itself.)                                                                                                                                     |
| `mods`                     | —              | none     | Mod ids in load order. A joiner whose list differs is refused by name.                                                                                                                                               |
| `statusEverySec`           | —              | 30       | Console status interval. 0 turns it off.                                                                                                                                                                             |
| `allowUnlicensedTransport` | —              | false    | The repo's own escape for its suites and the soak fleet. **Dead in a packaged binary** (`server/licence.ts` folds it to `false` for the ship target), because a config file is a thing a determined player can edit. |

There are deliberately **no balance knobs here**. A dedicated server runs the
game; it does not retune it, and a host that could would be a host whose clears
mean something different from everybody else's. Note also that a run on one is a
PARTY run and banks no leaderboard record, for the same reason every co-op run
does: whoever operates the machine controls the simulation.

## Repository pins

| File                          | Pins                                                                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.nvmrc`                      | Node 24 — both local (`nvm use`) and the CI workflows (`node-version-file`) resolve this single file (§10.5). `desktop-electron.yml` is the one that still pins `node-version: 24` inline. |
| `package.json` `engines.node` | `>=24`, so npm warns on a stale local Node.                                                                                                                                                |

## Release configuration

No repository secret is needed to build or install: every dependency comes
from the public npm registry, so `npm ci` works with no token at all.

No `RELEASE_TOKEN` is needed: `release.yml` is dispatched manually and
chains into `pages.yml` via `workflow_call` inside the same run, so the
default `GITHUB_TOKEN` suffices end to end.
