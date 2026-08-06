---
name: store-shots
description: "Use when regenerating the App Store / Play Store screenshot set — after resprites, an art pass, a HUD change, new powers or talents, or a rewrite of the marketing captions. Drives the real game to staged endgame moments at Apple's exact rasters, captions them in the game's own pixel font, and holds the result to a quality bar before it reaches a store listing."
---

# Store screenshots

The store screenshot set is **marketing**, not documentation. It is regenerated
whenever the game stops looking like these frames — new sprites, a redrawn HUD,
new powers or talents, a rebalance that changes what a late fight looks like.

The recipes live in
[`pwa/scripts/store-shots/recipes.mjs`](../../../pwa/scripts/store-shots/recipes.mjs)
and the output lands (gitignored) in `native/store/screenshots/<device>/`. The
listing text is a separate pipeline — see
[`native/store/README.md`](../../../native/store/README.md).

## The one rule

**STAGE THE ENDGAME, MID-FIGHT.** A freshly spawned hero on an empty floor is
what the game looks like for its first ten minutes, and it sells nothing. Every
frame should show a level-88+ build on NIGHTMARE, on a late map (the rift,
mars, boot_hill), with a named legendary in hand and something visibly happening — damage
numbers in the air, a power detonating, talent FX burning, a legendary dropping.

Corollaries, each learned the hard way:

- **No `freeze`, no `disarmed`.** The effects gallery uses both to hold an
  exhibit still; here they produce exactly the "nothing is happening"
  screenshot. These runs are LIVE.
- **No main-menu shot.** The store already shows the icon and the title.
- **Nightmare and late maps are unlock-gated**, so the harness routes through
  the DEVELOPER warp (`settings` → `settings-developer` →
  `developer-playground` → `playground-select-level` → `difficulty-<id>` →
  `level-<id>`), not the normal PLAY flow. The normal difficulty rows render *locked* and a click on one does
  nothing — the run simply never starts and every shot times out.
- **`?debug` forces the FPS meter on.** The harness hides `.game-fps` before the
  shutter; a frame-rate counter in a store screenshot reads as a debug build.

## What the six frames stage

The set is not six pretty moments — it is six DIFFERENT claims about the game,
one per frame, each staged at the moment its claim is legible:

| Recipe    | The claim                        | How it is staged                                                        |
| --------- | -------------------------------- | ----------------------------------------------------------------------- |
| `nuke`    | a power clears the room          | a full glass horde, then `__nuke()` — captured on the charred aftermath |
| `horde`   | the endgame deletes the horde    | a trained aura amid ~40 mobs priced to come apart (`GLASS_HORDE`)      |
| `talents` | passives that never switch off   | the whole magic tree at rank 5, mid-fight                              |
| `loot`    | a boss pays out                  | the boss FELLED FOR REAL, its legendaries fanned around the body        |
| `boss`    | every boss has a readable set piece | the shutter timed off the boss's own TELL, mid-beam                  |
| `powers`  | the powers stack                 | four run abilities already running                                     |

Two of them wait for the game rather than driving it — see the trigger note
below — and both are worth understanding before touching a recipe.

## A trigger can WAIT, and the clock starts when it returns

`trigger` is not only "do the thing" (`__nuke()`). It is also "wait for the
thing", and the capture clock starts when it RETURNS:

- `awaitBossTell()` waits for `enemy.mech.telegraph` — the windup pose every
  set piece opens with. `captureAtMs` is then measured from the TELL, so it is
  arithmetic (windup + however far into the cast you want) over the time scale,
  not a guess about when the boss felt like casting.
- `awaitBossKill([...uniques])` waits for `state.bossCorpse`, then lays the
  named legendaries around the BODY and stands the hero back off it.

Two traps, both paid for once:

- **`page.waitForFunction(fn, arg, options)` takes THREE arguments.** Passing
  `{timeout}` as the second hands it over as the page function's argument and
  silently leaves the wait on Playwright's 30 s default.
- **Ground items are scooped by walking over them.** A hero left standing where
  he landed the finisher has the whole fan in his pockets within a second, and
  the frame becomes empty floor under a stack of pickup toasts.

## The loop: sweep, look, narrow, lock

**Never guess a capture delay.** A screenshot of a 200 ms explosion is luck —
the nuke's shockwave, swept at full speed, peaks at 15 ms and is gone by 30.
Two scripts split the job:

| Script                 | Job                                                                    |
| ---------------------- | ---------------------------------------------------------------------- |
| `store-shot-sweep.mjs` | Reproduces a recipe at a matrix of delays and contact-sheets them       |
| `store-shots.mjs`      | Reproduces each recipe at its locked-in `captureAtMs`                   |

Both drive the same recipes (`pwa/scripts/store-shots/recipes.mjs`), so a
recipe is tuned in one place — and the sweep **re-stages the run for every
sample**, so what it does per frame is exactly what the capture does. That
costs a walk through the menus per sample (a couple of minutes for a full
schedule) and it is not optional: sampling one run instead drifts the shutter
SECONDS past the schedule, because a full-raster screenshot costs the better
part of a second and every sample pays for the ones before it. Asked for
0/30/60/90…900 ms, the old loop fired at 0/2377/3218…8025 ms and labelled the
frames with the numbers it had been asked for.

```sh
npm install --no-save playwright && npx playwright install chromium
cd pwa && npx vite --port 5199 &

# 1. COARSE — where in the first couple of seconds does this look good?
make store-sweep ARGS="--shot nuke"

# 2. LOOK at pwa/assets-preview/store-sweep/nuke/sheet.png. Tall sheets need
#    splitting to be readable:
node -e "import('sharp').then(async s=>{const p='pwa/assets-preview/store-sweep/nuke/sheet.png';
  const m=await s.default(p).metadata();
  await s.default(p).extract({left:0,top:0,width:m.width,height:Math.floor(m.height/2)})
    .resize(560).png().toFile('/tmp/a.png')})"

# 3. FINE — nine frames in a tight window around the winner
make store-sweep ARGS="--shot nuke --around 90 --span 120"

# 4. LOCK — write the winning delay into that recipe's `captureAtMs`
make store-shots
```

Sheets label every frame with its delay in the game's pixel font, so picking a
winner is reading a number off the sheet.

## Two clocks — the thing that will fool you

- **Canvas / world FX** (shockwaves, embers, slash cones, muzzle flashes, damage
  numbers) run on the SIM clock, so `window.__timeScale(f)` stretches them.
- **Full-screen CSS overlays** (`createNukeFx`'s flash/fire/smoke, the level-up
  bloom) are DOM animations on WALL-CLOCK time and are NOT slowed.

The practical consequence, learned the expensive way: the nuke recipe was first
shot at full speed and sampled at 180–520 ms, which produced a frame with
nothing in it but charred skeletons — the entire detonation had already
finished. Slowing the sim to 0.25× stretched the ring, the fire columns and the
damage numbers into a forgiving 60–130 ms window. **If a swept effect seems
absent, you are almost certainly sampling past it — sweep from 0 ms first.**
(0 ms on that recipe is a full white-out; the flash is real, just instant.)

## Surrounding the hero

`spawns` entries are rings placed around the hero after `place`, and the counts
can go high — the scenario system is routinely used to stage 60-mob worst-case
hordes. Use the `surround()` helper rather than hand-writing bands:

```js
spawns: [
  ...surround("voidling", 34),                        // 32..150, 3 bands
  ...surround("graviton", 16, { from: 48, to: 165 }),
]
```

One wide `{minDistance, maxDistance}` entry scatters its whole count randomly
across that band, which **clumps** — the horde lands in one arc and the frame
reads as a crowd off to the side. `surround()` splits the count into concentric
bands, weighting the outer ones more (they cover more area), so the hero is
evenly hemmed in.

## Staging a horde that comes APART

Gibs are not a setting. `overkill.ts` prices dismemberment on the health the
killing blow spent PAST zero in the victim's own bar (four tenths gibs, a
quarter cleaves), so the way to stage a massacre is to stage the situation that
earns one — and `spawns.hpMult` is the lever, because it shrinks the bar the
blow is measured against.

**But the number is a PACE, not a lethality.** At `hpMult: 0.03` every sampled
delay from zero onward showed the same thing: the entire ring already down, a
flat grey carpet of remains, nothing left standing to kill. Past a point more
overkill buys no more spectacle and costs the only thing that makes the frame
read as a fight. `GLASS_HORDE` is set where the horde dies over a couple of
seconds instead of in one tick.

**And count the horde DOWN, not up.** Every landed blow floats its own damage
number, so a build striking thirty bodies at once at endgame damage stacks
thirty five-digit figures into a solid slab across the top of the frame with the
fight underneath it. Seventy-four mobs plus the full magic tree was unreadable
at every delay; ~40 mobs and only the CLOSE half of the tree
(`CLOSE_MAGIC_TALENTS`) fills the same floor and leaves the numbers legible.

## SAFE MODE — a set with the gore switched off

`--safe` (both scripts) shoots the same recipes with the game's own umbrella
gate shut: it stamps `window.__GIS_POLICY__ = { nsfw: false }` before the page
loads, which is exactly what the native shell does when a guardian turns MATURE
CONTENT off. Use it for a storefront, rating board or press kit that will not
take blood.

- **Never write a second, "clean" set of recipes.** A hand-kept safe staging
  drifts from the real one and ends up advertising a game that does not exist.
  The gate is asked where each effect is DECIDED, so the same staging at the
  same instant simply comes out without the mess.
- **A new mature feature needs nothing here** — that is what the umbrella is
  for (see the `gore-system` skill).
- **Tune each mode on a sheet shot in that mode.** `store-shot-sweep.mjs
  --safe` exists because the delays do not always transfer: what a burst of
  gibs was covering can be bare floor once the gate is shut, and the damage
  numbers a gore cloud was hiding come back to the front.
- The mode is a property of the whole SET. The output directory records which
  one it was shot in, and a run in the other mode clears it rather than
  half-replacing it — four bloody frames and two clean ones is the one listing
  nobody asked for.

## When the timing isn't the problem

If a recipe looks weak at EVERY sampled delay, stop sweeping — the staging is
wrong. Both original bunker shots swept weak across their whole timeline: a pale
pink floor with mobs scattered to the edges. Moving them to **mars** (red) and
**boot_hill** (gold desert) fixed what no capture delay could, and gave the set
palette variety besides. Check, in order: is the floor dark or washed out, is
the horde dense and close, is the hero's build actually doing something.

**A set piece is chosen for how it PHOTOGRAPHS, not for how good the fight is.**
The boss frame was first staged on THE FOUNDER's airstrike, which is four pods
falling over a second and a half: every sample was either markers on the floor
or a cloud of smoke with the hero somewhere inside it. THE FLAGBEARER's sweeping
beam is one unmistakable object across the middle of the picture, and it reads
at every delay in its sweep. Prefer a single large continuous object over
anything that resolves as an area effect.

**And the venue can be chosen by its BOSS rather than its floor.** The `loot`
frame needs a boss that dies where it stands and does it alone: mars's and the
rift's own bosses `flees` at a sliver and leave no body, and boot_hill's dies
escorted by four more bosses that kill the hero before he lands the finisher
(`clearEnemies` keeps every boss, on purpose). GOODCO HQ's PAYLOAD-1 stands by
itself.

## When you are done

Re-shoot **every** device (`make store-shots` with no `--only`), confirm
`18 captured, 0 failed`, and look at the set as a set — the six frames should
not all be the same purple field. Screenshots are uploaded by hand in App Store
Connect; `eas metadata:push` handles text only.
