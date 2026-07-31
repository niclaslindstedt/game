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
  `developer-select-level` → `difficulty-<id>` → `level-<id>`), not the normal
  PLAY flow. The normal difficulty rows render *locked* and a click on one does
  nothing — the run simply never starts and every shot times out.
- **`?debug` forces the FPS meter on.** The harness hides `.game-fps` before the
  shutter; a frame-rate counter in a store screenshot reads as a debug build.

## The loop: sweep, look, narrow, lock

**Never guess a capture delay.** A screenshot of a 200 ms explosion is luck —
the nuke's shockwave, swept at full speed, peaks at 15 ms and is gone by 30.
Two scripts split the job:

| Script                    | Job                                                       |
| ------------------------- | --------------------------------------------------------- |
| `store-shot-sweep.mjs`    | Samples ONE staged run at a matrix of delays, contact-sheets them |
| `store-shots.mjs`         | Reproduces each recipe at its locked-in `captureAtMs`     |

Both drive the same recipes (`pwa/scripts/store-shots/recipes.mjs`), so a
recipe is tuned in one place.

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

## When the timing isn't the problem

If a recipe looks weak at EVERY sampled delay, stop sweeping — the staging is
wrong. Both original bunker shots swept weak across their whole timeline: a pale
pink floor with mobs scattered to the edges. Moving them to **mars** (red) and
**boot_hill** (gold desert) fixed what no capture delay could, and gave the set
palette variety besides. Check, in order: is the floor dark or washed out, is
the horde dense and close, is the hero's build actually doing something.

## When you are done

Re-shoot **both** devices (`make store-shots` with no `--only`), confirm
`12 captured, 0 failed`, and look at the set as a set — the six frames should
not all be the same purple field. Screenshots are uploaded by hand in App Store
Connect; `eas metadata:push` handles text only.
