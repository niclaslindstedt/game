# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Released sections below are **generated at release time from the changeset
fragments** in `.changes/unreleased/` — add a fragment per user-visible change
(see `AGENTS.md` → "Changelog fragments"), and the release workflow collates
them into a dated section here. Do not hand-edit the released sections.

## [Unreleased]

## [1.0.0] - 2026-07-29

### Added

- **"Level 4: THE RIFT"** — A fourth level — the hallucinatory rift between universes: black holes that drag you (and devour the horde), asteroid rain to dodge or jump, floaty between-universe gravity, dialogue-only apparitions of history's missing (Houdini, the King) alongside fightable legends (Tesla, Earhart, Rasputin), the GROK OMEGA boss reveal, and Elon Mosque escaping again out the far side.
- **"Companions: the SPARE-or-KILL verdict"** — Beat one of the rift's fightable legends and choose their fate: KILL for the loot, or SPARE them to recruit a companion who thanks you with a life debt, follows you in formation, fights with their signature weapon, wears gear from your bag (weapon, helmet, chest — Diablo-2 style, via their clickable portrait under your avatar), floats kill-quote banter over the fray, goes down-but-never-dies, and rides your loadout into the next level. A new legend joins the roster: LUCKY, folklore's missing leprechaun — kill him for the LUCKY CLOVER or spare him for a party-wide +50% MAGIC FIND aura.
- **Import and export characters** — **SETTINGS → DATA → EXPORT / IMPORT CHARACTER** carry heroes between devices: EXPORT opens a picker over the whole roster where you tick one or many heroes and download each as a small signed `.zip` (an HMAC-SHA256 signature over the save makes casual tampering fail), and IMPORT loads one back through a file picker — bringing its level, gear, and campaign progress across.
- **Golden arrow XP float** — Picking up a golden XP arrow now floats the XP it granted as rising blue "+N XP"
  combat text above the hero's head, mirroring the popup a slain foe drips (honors
  the same `xpFloat` display setting).
- **Pack kills fuse into one big shaking XP pop** — Wiping out a knot of enemies with a single attack now merges their XP into one
  oversized "+N XP" float that jolts like a crit — bigger and shakier the more
  foes fall (20 mobs pop at 2x, 30 at 3x) — and fires a proportionally stronger
  vibration; unlocking an achievement now buzzes too.
- **Per-map XP level caps** — Every level × difficulty pair now has a hero-level ceiling: XP earned on that map halves per level across the approach to the cap and stops entirely at it, so re-running an outgrown easy map still rains loot but never levels you past its cap. Caps are sized above where a first campaign pass naturally lands (easy tops at 10–22 across its maps, JESUS runs to the global cap), so the story never starves — only the rerun grind hits the wall.
- **Headless campaign simulator** — A balance-measurement simulator (`scripts/simulate-run.mjs`, engine module `src/sim/simulate.ts`) that plays whole levels or whole campaigns (easy → JESUS across every map) through the real engine with the autopilot, auto-equip, and loadout carry-over, and reports hero level/hp/dps progression, per-mob hp/level/contact damage, drops, weapon swaps, deaths, and the XP the per-map caps withheld — plus the `simulate-run` agent skill that drives it.
- **Mercy drops arrive by angel** — Mercy drops now make a dramatic entrance: instead of blinking onto the ground, a guardian angel swoops down from above cradling the rescue and releases it over the spot the mob died — the whole descent landing in under two seconds, during which the gift is airborne and can't be grabbed.
- **Employee stampedes on SpaceZ HQ** — SpaceZ HQ now has an "asteroid"-style hazard: herds of five panicked employees (three sprite variants) charge across the aisles right-to-left at great speed with a dust cloud boiling off their back, trampling and killing any minions in their lane and knocking any elite/boss aside. A grounded hero caught by a herd loses a difficulty-scaled chunk of his max health (10% on easy up to 40% on JESUS) and is knocked down for two seconds — jump over the wall or step out of its lane to avoid it. The autopilot hops incoming herds on its own.
- **THE BUNKER — a secret cow level** — A hidden farm level behind a ritual the game never explains: RASPUTIN drops a
  junk-looking SEVERED HAND — USE it in the rift (item-card USE row, or a
  desktop right-click) and a blast door tears open into the billionaires'
  bunker, six far-tougher parody residents with personal bodyguard details,
  CIA/FBI/ICE/military/vacuum-bot hordes, every world-drop relic at sweetened
  odds, no boss, and an exit that walks you back to the rift wondering where
  the place could possibly have been.
- **Placed mob packs** — Levels can now place PACKS — fixed clusters of monsters pinned around the map
  that sleep until the hero walks near them, then boil up around their anchor and
  give chase; wiping a pack out clears that patch of ground. Each pack authors a
  mob type and count (a base count auto-scaled per difficulty, or hand-authored
  per rung for exact control), so maps can be designed to be cleared by MOVING
  through them rather than farmed from a standstill — on a clear-all level every
  pack must be reached and wiped to win. An ambush sting marks a pack waking and
  an "AREA CLEARED" cue chimes when one falls.
- **Weapon attribute requirements** — Weapons now demand an attribute to wield, forcing a build to pick a lane: melee needs STRENGTH, ranged DEXTERITY, magic INTELLIGENCE. A find the hero is too weak for banks (and the tooltip paints the requirement red) until he invests the points, just as an under-level find waits for the level. The requirement is derived from each weapon's level requirement — never authored per item — and it scales with the AUTO LEVEL STATS developer flag so the chosen investment a weapon asks for stays the same whether WoW-style auto-attributes are on or off, keeping the whole arsenal calibrated without re-tuning.
- **Rebindable key bindings** — A Quake-style **KEY BINDINGS** submenu under SETTINGS → CONTROLS lets you rebind every desktop control — steering, walk, jump, the weapon menu, bag, map, pause, and the consumable dock — by choosing a row and pressing the keyboard key or mouse button to bind it. Bindings are stored by physical key code (so WASD holds under any layout), a rebind steals the key off whatever action held it, and RESET TO DEFAULTS restores the shipped scheme.
- **Achievement detail cards** — Tapping a badge in the ACHIEVEMENTS browser now opens a detail card showing when it was earned and which hero was playing when it dropped — docked beside the list on wide viewports (like the ARSENAL) and popped up as a modal on phones. Dragging to scroll the list on touch no longer highlights every badge the finger passes over.
- **Signature slash effects for unique weapons** — Unique weapons now carry their own WEAPON SWING signature — a themed slash crescent (colored core, glow, elemental particles, and afterimages) plus a matching gore burst on the hero's hits, so a named blade like Excalibur, Mjölnir, or Muramasa feels distinctly more powerful than a plain one.
- **Signature effects for ranged and magic weapons** — Ranged and magic weapons now carry their own WEAPON SWING signature — a themed muzzle flash or cast bloom at the gun barrel / wand tip, plus a matching glow trail riding the hero's round or bolt in flight — so a named weapon like Pyrelight (fire), Pale Rider (death), or Deadstar (cosmic) feels as distinct as the melee uniques do.
- **Mute dialogue button** — In-world dialogue now carries a MUTE button — a struck-through speech bubble at the top-right of the scene — that silences every elite/boss line, last words, inner monologue, story-item lore, and merchant greeting for the rest of the level. Cutscenes keep their existing SKIP button, and a new level starts unmuted.
- **Dialogue and cutscene toggles** — SETTINGS → DISPLAY gains two switches — DIALOGUE and CUTSCENES — that turn off the in-world spoken scenes (arrivals, last words, thoughts, lore, the merchant greeting) and the prelude cutscenes that open a level, respectively.
- **Cloth / leather / mail / plate armor** — Armor now comes in four materials, each with its own lane. CLOTH leans magic (INTELLIGENCE) and any build can wear it; LEATHER leans ranged (DEXTERITY) and asks a little STRENGTH; MAIL and PLATE lean melee (STRENGTH), protect far more, and demand a LOT of STRENGTH to heft — so only a bruiser can stand in the horde in heavy armor and live. PLATE, the heaviest, drops only on NIGHTMARE and above. A piece's material biases which stats its bonuses roll, and every armor find shows its material and STRENGTH requirement on its card. Uniques, legendaries, and artifacts inherit their material from their base, and the heavy (mail/plate) named pieces are geared toward melee stats.
- **Mana and spells** — Casting joins the game: INTELLIGENCE now sizes a MANA pool and unlocks a spell every 10 points (25 in all — single-target, area, and defensive), cast from a HUD spell bar (tap to cast, long-press to reassign a slot) and echoed by a "SPELL UNLOCKED" reveal each milestone. A blue-gatorade MANA POTION drops and refills the pool, docked beside the medkit. Every spell ships a themed pixel icon and an element-tinted cast effect. (Saved runs from before this release cannot be resumed — the hero grew a mana pool and a spell bar.)
- **Meteor strikes** — Asteroids now fall from the sky and DETONATE on the surface: a firming ground shadow telegraphs each impact near the hero, then the blast vaporizes weak mobs at its lethal core, flings surviving enemies and the hero outward to the sides, takes a difficulty-scaled bite of the hero's hp scaled by how near the centre he stood, and leaves a fading crater. Rocks rain in from every angle, the autopilot reads the telegraph and steps off the mark, and the moon now draws a gentle meteor rain on top of the rift's.
- **Mars sand storms** — Small, animated sand storms now roll across MARS. A churning dust gust drifts in from off-screen every so often and sweeps the hero's surroundings — walk clear and it's harmless, but stand in its path and it flattens you: a bite of damage and a KNOCKOUT that leaves you lying prone on the dirt for two seconds, unable to move, attack, or cast, while the storm passes over you and fades away.
- **Simulator stuck-cancellation + map highlights** — The headless simulator now books a penalty with world coordinates every time the autopilot stops making progress (wedged on geometry, or loitering in one spot without landing damage), cancels the run when the penalty crosses a limit, and prints the clustered STUCK AREAS with a ready-made command to highlight those coordinates on the map-layout render.
- **Powerup dock reordering, and running slots can be dropped** — The powerup dock supports reordering (a `moveItem` input; running powers travel with their countdown), and a slot whose power is already running can now be dropped — the effect runs out its clock while the slot frees for new loot immediately.
- **Buzz on damage, death, and menu presses** — Phones with a vibration motor now buzz when the hero takes a hit — scaled to the share of the health bar the blow cost, from a faint flick for a graze to a heavy two-beat jolt for a near-fatal hit — and play the hardest rumble of all when the hero dies. Pressing a title-menu row taps too. Kills no longer buzz, so a busy field stays quiet.
- **HOW TO PLAY teaches thirteen more things** — The self-playing HOW TO PLAY demo now teaches the rest of the game, not just the basics: catching your breath by standing still, switching weapons (played as the two presses a player makes — the switcher opens, then the weapon is tapped ~40 ms later), spending a talent point, opening the pack, mending a worn weapon, gearing a recruited ally, pausing, opening the map, hiring the AUTO PILOT, smashing crates, trading at the merchant, mercy drops, and the RAMPAGE meter — each tooltip anchored on the control or the spot on the field it names, and spaced out so a rough stretch never turns the demo into a slideshow.
- **Cloud save — your heroes and coins follow you between devices** — In the **iOS app**, your whole roster, your undistributed coin bank, and the hardcore high-score board now live in **iCloud** instead of on one device — sign in on a second iPhone or iPad and everything is simply there, with **Game Center** naming the player. Coin packs are bought with real money, so the bank is built to be impossible to lose in a merge: buy on one device and distribute on another, offline, in any order, and every coin is accounted for exactly once. Syncing happens on its own (at launch, when you switch apps, and right after a purchase), and **SETTINGS → DATA → CLOUD SAVE** shows the state and syncs on demand.
- **The library — a bestiary of every monster** — A reference site now ships alongside the game at `/library/`: a page for each of the 104 monsters with what it fields on every difficulty, where it spawns, what it drops and its mechanics, plus its dialogue and last words behind a spoiler cover you have to click. Every page is generated from the same content the game itself is built from — and its derived numbers come from calling the game's own code — so it is rebuilt with each release and cannot fall out of step. The pages carry no JavaScript and never load the game, so they open instantly.
- **Game Center leaderboards** — The app now ranks you against every other player on five Game Center leaderboards — the hardest blow you have ever landed, your lifetime kill count, the fastest killing you can sustain for ten straight minutes of combat, and the longest survival and biggest slaughter of a hardcore JESUS campaign — reachable from HIGH SCORES → WORLD RANKINGS, which opens Game Center's own board.
- **Boss ability catalog — ARMSTRONG's laser eyes and planted flag** — Bosses now carry named abilities from a catalog instead of permuting the same
  four moves: ARMSTRONG opens his eyes and sweeps a beam that leaves the regolith
  burning, and on NIGHTMARE and above drives his flag back into the grave to call
  the dead up out of it. Every ability telegraphs with the boss's own cast-pose
  sprite rather than a strobing ring, and the ground slam, the enrage turn and the
  summon — which had no visual at all — now land in dust and light.
- **Every boss gets a signature move** — DOGE-1 fires a fan of coins that ricochet off the walls and salts the floor with
  bait that looks exactly like loot; ELON MOSQUE stops summoning and starts
  SHIPPING, calling drop pods down on marks around you that burst and pop open —
  and on nightmare, calling his followers in at a dead run. THE ZAI SUPERCORE
  dispatches units to your coordinates, GROK OMEGA and THE VAULT WARDEN sweep the
  floor with a beam, and the Mosque you meet in the rift no longer wears the same
  clothes he wore on Mars.
- **The last two boss moves, and a cast pose on every boss** — THE ZAI SUPERCORE now restores itself from a repair node you can see and break,
  and THE VAULT WARDEN drops blast shutters around you with exactly one way out.
  Every boss in the game now strikes its own authored pose while winding up, so
  what tells you a set-piece move is coming is the character rather than a marker
  on the floor.
- **Buy coins from the AUTO PILOT picker** — The AUTO PILOT speed picker gained a STORE button beside CANCEL (app-store builds, or any build with the developer FORCE STORE switch on): it opens the coin packs without leaving the run, and a purchase goes straight into the hero's purse so an unaffordable ride can be funded on the spot.
- **Set-piece boss and elite mechanics** — Elites and bosses now fight with telegraphed mechanics — shoulder-charges, ground slams you can jump, enrage turns, summoned reinforcements, and boss phases that change the fight at hp breakpoints — and on HARD and up the horde gets smarter too: minions flank instead of forming a straight line, and shooters lead a running target.
- **Simple weapons and time-limited abilities** — Six unnamed Diablo-style base weapons (pipe, hammer, pistol, rifle, star wand, void wand) join the moon's drop pool, and monsters now drop time-limited ability pickups: orbiting fire orbs, a storm cell striking nearby ghosts, and a stasis field that slows the pack.
- **Tap-to-equip** — Tap a bag or worn item a second time to equip/unequip it (no drag needed on touch), landing a metallic twin sword-clash sound and a firm double-buzz on the phone.
- **Main menu with difficulty select** — A Doom-style splash main menu (starfield, logo, keyboard navigation) where NEW GAME leads to a difficulty ladder — EASY, MEDIUM, HARD, NIGHTMARE, and JESUS CHRIST! Harder settings spawn bigger, tougher hordes but drop loot more often and unlock epic/legendary gear.
- **Chiptune soundtrack and NES-style sound effects** — Original chiptune background music (a haunting title theme and a driving moon-run theme, synthesized in code — no audio files) plus a reworked NES-palette sound set with new menu, inventory, equip, and medkit sounds.
- **Carried ability items and configurable controls** — Ability pickups are now carried and used on demand — click, two-finger tap, E, or the HUD USE button (touch devices pop them instantly by default). On desktop the character now follows the cursor with no button held; a new SETTINGS menu (controls, music and sound volumes) tunes all of it.
- **Weapon durability and instant auto-equip** — Dropped weapons wear out per attack: when one breaks it is trashed and the best weapon left in the bag (highest DPS with durability remaining) is equipped automatically — the starting sidearm never breaks. Picking up equipment better than what you wear now equips it instantly.
- **Active powerup cooldown timers** — Using a powerup now lights it up in a highlighted slot just above the dock with a WoW-style radial cooldown overlay that unwinds as the ability runs out, plus a whole-second countdown, so its remaining duration is visible at a glance.
- **Repair kits** — A repair-kit pickup restores the equipped weapon's durability to full; with nothing to repair it stays on the ground for later. ARMSTRONG always drops one.
- **Stackable powerups** — Powerups that stack now run several copies at once — activating a second STORM CELL doubles the lightning strikes and a second FIRE ORBS densens the ring — while powerups whose effect can't stack (the MAGNET) refuse to re-enable while a copy is already running, keeping the spare pickup banked for later instead of wasting it.
- **Solid obstacles on the moonscape** — Boulders and low rocks now block movement. Low rocks can be jumped over — but ghosts can't jump, so a rock line the horde must flow around becomes a tactical shield. Tall boulders stop everyone, airborne or not.
- **Screen-clearing NUKE pickup** — A rare banked pickup that detonates a blast dealing 200% of the average on-screen monster health to everything it catches — no monster exempt. The low average against a horde wipes the rank and file outright, while the far heavier elites and bosses are only chunked (and the blow can crit, so a lucky bomb bites deeper). Save it for the flood. Like all ground drops it never despawns, so it can be left where it fell and collected when needed.
- **Item magnet ability** — A new timed ability pickup that vacuums nearby drops toward the player; its pull radius grows with INTELLECT.
- **Bag items compare against your equipped gear** — Hovering or tapping a weapon or item in the bag now shows a green/red `(+N)` delta next to every stat that differs from the piece you have equipped, so an upgrade or downgrade reads at a glance.
- **Toggle for auto-equip on pickup** — A new SETTINGS → CONTROLS option turns off auto-equipping picked-up gear: with it off, every find banks to the bag for you to equip by hand. The inventory AUTO-EQUIP button and the on-break weapon swap still work.
- **One-tap SCRAP button in the bag** — The inventory's BAG header gains a SCRAP button that clears every piece the hero has outgrown in one tap — loot that is worse than what's worn in its slot — while sparing keepers: upgrades, side-grades, empty-slot fills, passive trinkets, and unique/legendary trophies. The button shows how many pieces would be culled and stays disabled when the bag is already clean.
- **LEVEL 1 - SPACEZ HQ** — The story's first level: raid SpaceZ headquarters for the interplanetary
  drive ingredient, fighting the night shift — interns, lab scientists,
  propulsion engineers, security guards, and hazmat techs — through walled
  offices and lab corridors to MUSKRAT, the mutant rat who ate it, nesting
  under the prototype rocket. Ships office-grade weapons (stapler, keyboard,
  mop, fire extinguisher, taser, laser pointer, beaker), the LAB COAT and ID
  BADGE gear, the guaranteed early SECURITY BATON, the GOLDEN STAPLER
  all-clear trophy, and MUSKRAT's PLASMA CUTTER.
- **Movie-night prelude cutscene** — Runs now open on a short scene: movie night, Ada leaves for chips and soda,
  and never comes back. Tap advances a beat, SKIP jumps to the level intro.
  Built on a new data-driven cutscene system (scenes are beat timelines in
  `src/game/defs/cutscenes.ts`) with a `?cutscene=<id>` authoring workbench
  and a headless storyboard-screenshot harness for iterating on scenes.
- **Level and seed URL params** — `?level=<id>` starts runs on any catalog level and `?seed=<n>` pins the
  run's layout, for playtesting and reproducible bug reports.
- **Mouse aim and pixel cursors** — On desktop the mouse pointer adds an aim dimension: the character still fights autonomously, but when foes stand in several directions the one the cursor points at takes priority, and the pointer becomes a 16-bit crosshair reticle over the play field. The main menu's pointer is now a pixel-art Mickey-style gloved hand.
- **Unique story mobs, dialogue scenes, and locked rooms** — Every level now fields 3-4 unique named mobs that rush into view and reveal the plot in tap-through dialogue scenes (bosses got longer stare-down scenes of their own); killing one drops a signature weapon plus story items — keycards that open locked rooms and documents that unravel the SPACEZ moon conspiracy.
- **Hit feedback** — Landed hits now spray blood (or ectoplasm, for ghosts), float rising damage numbers off the victim's head, and critical hits slam a shaking gold number while the victim blinks; text selection is disabled so mobile taps never highlight the UI.
- **Visible battle damage and boss last stands** — Mobs now wear their wounds: every enemy swaps to a damaged sprite at half hp, elites and bosses look heavily wrecked below a quarter, and a boss under 10% hp enters a blinking last stand where its hits land 1.5× harder.
- **Story mob last words** — Elite and boss mobs now gasp a short dying line through the dialogue box as they fall — with a somber cue — and story-item pickups are framed with a "STORY ITEM ACQUIRED" banner so a plot find reads clearly as a message about what you just picked up.
- **The space suit is loot now** — At SpaceZ HQ the hero starts in his living-room clothes and only becomes the astronaut once he loots the EVA SPACE SUIT — an epic drop from the Chief of Security — which both armors him and swaps his sprite for the rest of the game.
- **Pickup feed** — Loot and powerups now announce themselves in a WoW-style feed in the lower-right corner ("PICKED UP X"): lines stack newest-at-the-bottom and each fades on its own ten-second timer.
- **Inventory upgrade hints** — Holding or hovering a bag item now previews it in the character sheet, showing how each stat would change with a green "(+3)" or red "(-3)" delta so upgrades read at a glance.
- **Injectable def registry** — The engine exposes a `registerDefs` hook that swaps the active content catalogs (levels, enemies, equipment, abilities, difficulties, story items, cutscenes), letting the engine test suites run against synthetic fixtures independent of any shipped game content.
- **Campaign level select and NEXT LEVEL** — NEW GAME now leads to a level-select screen (unlocked as you clear each level, per difficulty), and clearing a level offers NEXT LEVEL on the victory splash so you can play the campaign straight through instead of only reaching level 2 via a dev URL.
- **Per-level music** — Each level now plays its own theme — SpaceZ HQ gets a tense new "LOCKDOWN" infiltration track while the moon keeps "REGOLITH RIDE" — instead of one track for every level.
- **Medium-rung world relics and the first legendary** — Six new hand-authored world-drop relics land on the MEDIUM rung — DEADSPRINT (SpaceZ HQ), MARECREST (the Moon), REDWIND (Mars), and the Rift's WISHBANE and GORGONSCALE — plus MJÖLNIR, the game's first LEGENDARY item, minted one rarity rung above every unique with the orange card and densest pickup blaze; farmed by returning for boss runs once MEDIUM is beaten.
- **Weapon hit effects** — Every weapon now shows its own hit: melee weapons sweep a slash arc toward their target, guns flash a muzzle burst, wands bloom a cast burst, and thrown/fired shots draw their real per-weapon sprite (staples, taser arcs, beaker vials, flares) instead of a generic bolt. (How the stats scale a weapon's reach, cadence, and AoE is covered by the stat overhaul in this release.)
- **Melee weapons cleave a cone** — Melee weapons now strike in an area shaped by how they swing: a blade cleaves every monster inside a wide cone in front of it in a single swing, while reach weapons (the MOP, the WET FLOOR SIGN halberd) thrust a narrow cone that skewers the line far down their long reach instead of sweeping sideways. The on-screen slash now reflects each weapon's actual cone.
- **Letter-by-letter dialogue and briefings** — Dialogue boxes and level-intro briefings now print one character at a time with a quiet 16-bit letter-print blip, holding a dramatic beat on ellipses, full stops, and dashes so a briefing or a dying elite's last words land with the timing they were written for; a tap finishes the crawl (in dialogue the next tap then turns the page), and reduced-motion readers get the whole page at once.
- **In-HUD weapon switcher** — The HUD weapon icon is now a prominent bordered slot tinted by class (yellow melee, red ranged, purple magic); tap it to expand a switcher of your other carried weapons — ordered by damage, each showing its stat-scaled damage — and tap one to equip it on the spot. Weapon info in the inventory now shows the damage a weapon deals in your hands (stats and affixes folded in) with a `+x` bonus hint, matching how combat and auto-equip already rank weapons.
- **Guaranteed opening drops** — Every run now hands over a scripted opening loot cadence in its first minute — a weapon on the second kill (before the first level-up, so the opening stat choice is informed by it), then an ability powerup and a golden XP arrow — so new players learn that kills drop upgrades right away instead of waiting on the random drop rain.
- **WASD desktop controls and hotkeys** — Desktop players can now steer with WASD/arrow keys (run by default, hold Shift to walk, no key stands still, Space jumps) — a binary run/walk control mode toggled under SETTINGS ▸ CONTROLS. Keys 1/2/3 fire the powerup dock slots, and Q opens the weapon switcher where 1-4 equip the listed weapons. On-screen key caps hint the bindings when keyboard controls are on.
- **Rare (yellow) loot, item discarding, and a richer item card** — Yellow **RARE** weapons and gear now drop — a tier above magic that rolls two affixes (including stat and life rolls on weapons), turning up on the moon and from elites and bosses, never the level-1 rank and file. Epic and legendary rolls widen to three and four affixes to match. Magic+ items are named Diablo-style from their affixes ("CRUEL PIPE OF THE FOX") instead of a flat "MAGIC" prefix, and the inventory item card now shows the item's icon, a rarity-colored name, per-attribute colors on each magic property, and attack speed as plain seconds between hits. Drag a bag item out of the panel and drop it on the ground to destroy it for good.
- **Menace — the horde escalates when you overpower it** — Overkilling monsters (dumping far more damage than their remaining hp into the killing blow) and keeping up a fast kill pace now bank **menace**, a meter that answers a runaway-strong player and bleeds off when you ease up. As it climbs it **lures** a denser, bigger crowd onto you (and every overkill drags nearby foes in at once), **evolves** freshly-spawned minions into tougher versions worth more XP and better loot, and — folded in with your own level — scales elite mobs and bosses to your power when they engage, so the set-piece fights stop melting. A RAMPAGE gauge on the HUD, a pulsing aura on evolved mobs, and an escalation cue mark the heat rising.
- **Discard powerups by dragging** — Drag a banked powerup out of its lower-corner dock slot to trash it in a poof of smoke — a fast way to clear a slot for fresh loot when your hands are full (a plain tap still spends the powerup).
- **OPTIMUSK robots on SPACEZ HQ** — SPACEZ HQ now fields OPTIMUSK units — humanoid robots that replace some of the human night shift: tougher, harder-hitting regular monsters (they throw sparks, not blood, when struck) that reward the extra effort with a much richer drop roll than the staff around them.
- **Pause screen** — Press P (desktop) to pause the game and its music together on a dedicated pause screen; clicking anywhere or pressing P again resumes. The run also auto-pauses whenever the tab or app loses focus (switching tab, backgrounding on a phone), and quitting to the menu from the pause screen now asks for confirmation first since it ends the run.
- **High scores** — Your best survival time on each difficulty is saved on-device and shown on the end-of-run screen for the difficulty you just played, flagging a NEW RECORD when you beat it.
- **High-score board in the main menu** — The main menu gains a HIGH SCORES board that lists your top runs on each difficulty, ranked by survival time or by kills-per-minute — swipe left/right (or arrow keys) to change difficulty and up/down to switch the ranking.
- **Armor and stamina** — Suits now grant an armor pool (green/yellow/red grades) that soaks a share of every physical hit before it reaches HP, shown as its own HUD bar; a new stamina pool lets you run at full speed until it drains and refills while you ease off, and the level-up HEALTH stat is now STAMINA that deepens the pool and quickens its recovery.
- **Rocks, craters, and OPTIMUSK on the moon** — The moon now scatters solid moonrock slabs (that block sight, shots, and a nuke's blast) and jumpable craters you can leap but not cross, and SpaceZ's OPTIMUSK robots garrison it — with the hero's own inner monologue the first time you take one down.
- **Haptic feedback in dialogue** — Phones with a vibration motor now tick gently under each letter of the dialogue typewriter crawl, so a line is felt as it types. Toggle it under SETTINGS → CONTROLS; it is silently inert on iOS in a browser, which has no web Vibration API (the native app drives it through the Taptic Engine).
- **Dodge — sidestep a blow entirely** — Heroes can now DODGE an enemy's hit outright, taking no damage or armor loss at all. Every hero starts with a small innate chance; **DEXTERITY** sharpens it and **LUCK** nudges it up marginally. A dodged blow floats a "DODGE" tag with a clean whiff, and the inventory stat panel shows your current dodge chance.
- **THE ARCHITECT and the PASSAGE CHIP** — A fifth elite joins SpaceZ HQ: THE ARCHITECT, the hero's old bench partner brainwashed into building the company's superintelligence. He rushes into view for a confrontation — the hero begs him to quit the evil company, he answers that humans are obsolete and "now you will die" — then fights and drops the PASSAGE CHIP he cut into his own skull, a new passive trinket that grants +1 INTELLIGENCE while it merely rides in the bag.
- **High-score session detail** — Each high-score run now banks its full end-of-run session, and tapping a board entry opens a card with the whole story — time, kills, level reached, XP, shots fired, damage dealt and taken, and items — so a big kill count can be weighed against what it cost.
- **Sun-glare title Easter egg** — A lone sun now slowly arcs across the main-menu sky every few minutes, lifting the moon from a dark new moon through its phases to a fully lit full moon with a warm glare wash before setting again.
- **The AI CORE room** — THE ARCHITECT now drops a CORE KEYCARD that unlocks a new locked AI CORE room in SPACEZ HQ, where the superintelligence he built keeps its logs.
- **DPS on item cards** — Weapon tooltips now lead with a **DPS** figure — the honest "how hard does this hit over time" number that folds per-hit damage, attack speed, and crit chance into one, so a slow heavy weapon and a quick light one can be compared at a glance.
- **"Level 3: MARS"** — The campaign continues to Mars: a secret SpaceZ colony where rovers work the red dust outside and robots and fembots staff the base inside — three tech-billionaire elites (LARRY WEBPAGE, BUILD GATES, PETER SEAL), a locked lizard shrine, a new desert-western theme ("RED DUST"), and ELON MOSQUE, the first boss who doesn't die: he cowers, reveals what Ada was traded for, and flees through a rift. ARMSTRONG's moon ending now points the way (the moon was SpaceZ's disastrous mistake), and the OPTIMUS robots are now called OPTIMUSK.
- **Progress carries between levels** — Your hero now carries through the campaign: clearing a level banks your level, stats, equipment, bag, and pocketed powerups, and the next level starts with all of it — arrive on Mars with whatever you finished the moon holding. Dev jumps to a later level with nothing banked start with a realistic derived loadout instead, so playtesting stays honest.
- **Level-up stat glyphs** — The LEVEL UP! chooser now shows a pixel glyph for each stat — a heart, a flexed arm, a target, a wizard hat, a lightning bolt, and a four-leaf clover — on both the buttons and the info panel.
- **Story manuscript** — Add `docs/manuscript.md`, a single source-of-truth transcript of all story and dialogue that the shipped content must match.
- **Long-press the moon to warp to any level** — Hold the moon on the title screen for seven seconds to open a warp picker that lists every level regardless of progress; choosing one drops straight into play, skipping the prelude and intro monologue, so you can try other levels without finishing the current campaign.
- **More inner monologues** — Two new first-kill inner monologues: the hero's surprise at a fully staffed SpaceZ HQ at midnight ("good thing I brought the sword") on the first intern kill, and his arrival read on the moon's haunting on the first wisp kill.
- **OPTIMUSK sight monologue** — Seeing the first OPTIMUSK at SpaceZ HQ now plays a new inner monologue: the hero helped build the first unit before the AI redrew the line and it took everyone's jobs — now the tables turn.
- **OPTIMUSK PRIME** — Mars gains a fourth elite: OPTIMUSK PRIME, the robot foreman orchestrating the OPTIMUSK line — the future of agent orchestration, coming for the AI engineers' jobs too. Drops the PROMPT INJECTOR and the ORG CHART.
- **The sword draws on the first strike** — SpaceZ HQ now opens with the hero's sword holstered — the auto-attack sits out until a lone scientist breaks from the pack and takes a harmless first swing at him, which draws the blade ("good thing I brought the sword") and turns combat on.
- **The wall arsenal — a starting weapon per difficulty** — The weapon on the hero's living-room wall now depends on the chosen difficulty — HAIRY POTTER'S WAND (easy), MEDIEVAL SWORD (medium), COMBAT KNIFE (hard), BRASS KNUCKLES (nightmare), A STICK (JESUS CHRIST!) — and the prelude cutscene always shows the exact piece the run starts with.
- **Level tokens** — Clearing a level mints a one-shot LEVEL TOKEN you can spend on the title menu to unlock that same level at a higher difficulty ahead of the campaign there — a fast lane into the harder rungs' richer loot, spent once and gone.
- **Enemies dodge and blows miss — DEXTERITY is your hit rate** — Your weapon blows can now come to nothing two ways: the hero's own **MISS** or the foe's **DODGE**, each floating a tag off the target with a dry whiff. **DEXTERITY** is your hit rate — every point trims both the miss chance and every enemy's dodge chance, so a nimble build rarely whiffs and is rarely sidestepped. A new **HIT** readout on the inventory stat panel shows your current accuracy, and nimble monsters carry a higher dodge chance. Conjured abilities (orbit, storm, nuke) always connect.
- **Level-reached and mobs-killed high-score rankings** — The HIGH SCORES board now ranks runs two more ways — most mobs killed and highest player level reached — alongside longest survival and best kills-per-minute, so a slaughter or a deep run tops the board on its own terms.
- **Level token respec** — Spending a LEVEL TOKEN now opens a Diablo-style respec on arrival — the carried build is refunded into a pool and every stat point is re-placed from scratch before the fight.
- **Full-bag pickup feedback** — Walking over loot you can't carry now floats a "BAG FULL" thought over the hero and pulses the inventory button, nudging you to open the bag and make room instead of silently leaving the piece on the ground.
- **Hardcore mode & forever keepsakes** — Unique and legendary items never break, and ones carried through a beaten difficulty are kept forever, following you into every run; the new HARDCORE setting puts them back on the table — dying burns the keepsake stash, banked unique/legendary pieces, and your level tokens.
- **Resume a run from the menu** — Exiting to the main menu now keeps the run paused in memory: a CONTINUE entry drops you straight back where you left off, so you can duck out to change the volume without losing progress — and the pause screen's MENU button no longer asks for confirmation.
- **Pickup card and carry gauge** — Bagging a weapon or item now pops a framed pickup card — its icon and rarity-tinted name behind a sparkling border — and the hero carries a running count of free bag slots over his head that turns red the moment the pack is full.
- **Tap the clock to pause** — Tapping the run clock / foe counter in the HUD now pauses the game, the same freeze as pressing P or Escape — a thumb-reachable pause for touch play.
- **Level map** — A MAP button in the upper HUD (M on desktop) pauses the run over a Warcraft-style fog-of-war level map: terrain shows where you have walked, the rest stays dark, and pins mark where story items and unique/legendary loot were found and where elites and bosses fell.
- **Wandering merchant & coin economy** — Every level now has a wandering merchant — met out in the field, he settles down, pins the map, and opens a shop where loot sells for coins (scaled by item level, tier, and metal/precious material) and powerups and gambled weapons can be bought back.
- **Hidden developer menu** — The title moon's long-press Easter egg now reveals a hidden DEVELOPER row in SETTINGS (level select plus a debug-mode toggle) instead of jumping straight into the level warp picker — the detonation only unlocks the row, and you open SETTINGS to use it.
- **Tap-to-equip pickup cards with rarity reveals** — The item pickup card is now interactive and shows off a find: it stays up longer, tells you at a glance whether a piece is an EQUIPPED upgrade or a bagged one worth wearing (with a green UPGRADE badge), and can be tapped to equip a bagged find on the spot. It also glimmers with a sweeping sheen, and magic, rare, unique, and legendary finds get an escalating reveal flourish — a rarity bloom, starburst rays, sparkles, and flames for the top tiers — the way an epic card turns over in Hearthstone.
- **Item quality ranks and Exceptional/Elite base tiers** — Every plain (non-magical) weapon and armor drop now rolls a make quality (BROKEN → CRUDE → NORMAL → SUPERIOR → PERFECT) that scales its damage, armor, durability, and sell value — higher-level monsters drop better-made pieces — and every pool base ships Exceptional and Elite versions (same look, new names, higher stats and level requirements up to 100), so new bases keep dropping all campaign.
- **A full magic weapon ladder** — Added a second magic weapon to every level pool — the MICROWAVE EMITTER, PULSAR ROD, GRAVITON MAW, and EMBER WAND (each with EXCEPTIONAL and ELITE grades) — so a wand build now finds a steady stream of upgrades from level 1 to 100, matching the melee and ranged ladders.
- **Floating XP on kills** — A slain foe now flows its XP reward upward as rising blue combat text, WoW-style.
- **Inventory auto-equip and icon buttons** — The inventory bag header gains a one-tap **AUTO-EQUIP** button (crossed-swords icon) that wears the best wearable piece the bag holds in every slot at once, folding the hero's build into the weapon pick (a STRENGTH hero lands a melee weapon, an INTELLECT hero a wand) while respecting level gates and leaving passive trinkets in the bag; it disables when the loadout is already optimal. The former SCRAP button becomes a **DROP-ALL** trash-can icon, and both buttons show the count they would act on.
- **Mobs fall and die** — Slain mobs now keel over: a minion tips flat to the ground with a little hop, lies there a beat, then blinks out and vanishes after two seconds, while the rarer elites and bosses keel over and stay down for the rest of the level. Dead bodies never walk or animate — they just topple once and lie still.
- **Equipment shows on the hero** — Worn armor and the held weapon now actually show on the character — in-game
  and on the HUD/inventory portraits: every armor piece gets a generated on-body
  overlay (helmet/cap/visor/mask, chest, legs, boots) colored from its icon, and
  the equipped weapon rides in the hero's hand.
- **Level-up ding celebration** — Leveling up is now a moment: the hero burns in a golden pillar of light with a
  triumphant fanfare (WoW-style) for a second before the stat chooser opens, each
  level automatically grows core stats (stamina, strength, dexterity) by amounts
  that scale with the level — announced in gold in the pickup feed — and the
  horde's toughness rides the same curve so the free growth never turns mobs into
  one-hit kills.
- **Player floats in the rift** — In THE RIFT the hero now bobs with a slow hover while grounded, selling the floorless free-fall between universes.
- **Energy drink pickup** — The horde now drops ENERGY DRINKS that reset your sprint pool to full on touch, and a hero stranded with a bone-dry stamina bar (empty, not merely low) is thrown them as a mercy drop whose per-kill chance ramps the longer you stay winded — up to 15% on EASY and 10% on MEDIUM (zero from HARD up).
- **Base stat gains in the level-up picker** — The level-up stat chooser now shows the automatic base growth each stat gained this level as a green "+N" beside its value, so the ding's free gains are visible alongside the point being spent.
- **Persistent characters** — Name and grow persistent heroes that live on across every difficulty and level, carrying their whole build; HARDCORE (permadeath) is chosen at creation, difficulties unlock in order, and beating one opens its levels for free replay — replacing the old level-token system (existing on-device progress is reset).
- **Keyboard stat picking** — The level-up stat chooser can now be driven from the keyboard: the arrow keys and WASD move a highlight across the stats (up/down and left/right both navigate the grid), and Enter or Space spends a point on the highlighted one.
- **Quality-graded pickup badge** — The pickup card now dresses a find by BOTH of its axes: within the plain regular tier the make quality drives the look — a broken piece gets a dull, cracked, dashed frame, a crude one stays dim, superior glows and perfect really shines — while magic/rare/unique escalate the halo, sparkles, and flames, and a legendary is revealed in a shockwave explosion with every effect turned to eleven.
- **Unique items (groundwork)** — The unique-item system lands: hand-authored named drops with fixed bonuses on a base type, a small ±10% roll on the base damage/armor (so a better-rolled copy is worth chasing), minted unbreakable, and gated to their own item level. First set authored (GROK OMEGA's five, e.g. THE JAILBREAK, THE PANOPTICON). Boss drops wire up next.
- **Boss-specific unique items** — Every boss now drops hand-authored named UNIQUES — 35 in all, a full
  weapon-and-armor set plus a bag and a charm per difficulty — gated to their
  home rung and rolled at ~5%×(mlvl/ilvl), the grind-for-gear endgame.
- **Merchant SELL ALL** — The merchant screen gains a SELL ALL button (a three-coin mark) that empties
  the whole bag across the counter in one tap, the buy/sell buttons now show a
  coin icon beside the amount, and a selected bag item's highlight border is no
  longer clipped at the top.
- **World-drop relics (boss-run loot)** — Five level-locked UNIQUE relics that drop out in the world — not from one fixed
  boss, but from any enemy on their home level, at role-scaled odds (a trash
  minion is a long-shot, an elite far likelier, the boss a fat 10% single kill).
  A whole EASY floor clear amasses to roughly a 30% chance, so grinding works but
  a fast boss run is the efficient farm. The table stays shut until the hero
  out-levels a first campaign pass, so the relics are chased by RETURNING for boss
  runs once EASY is beaten: THE FIRST DRAFT (SpaceZ HQ), THE PALE COVENANT (the
  Moon), DUSTBORN (Mars), and — the Rift being a tear in history — EXCALIBUR and
  THE TRINITY SHARD.
- **Inventory access during elite/boss encounters** — The hero's avatar button now shows top-left while an elite or boss delivers its arrival speech, so the inventory can be opened mid-scene to equip a fitting weapon before the fight.
- **Achievements** — An account-wide achievements system: ~100 badges for clearing missions and difficulties, kill and loot ladders (magic/rare/unique counts, every unique its own badge), recruiting companions, hero levels, run counts and combat feats — with a gold unlock banner and chime, a pulsing HUD star while new badges wait, and a browsable achievements shelf with live progress from the title menu or mid-run.
- **Wardrobe & damage achievements** — New achievement shelves: WARDROBE badges for equipping each gear slot the first time, filling every slot at once, and wearing full outfits of all-magic, all-rare, and all-unique quality — plus COMBAT damage ladders for the hardest single hit (50 to 5,000), the biggest one-strike burst from nukes, sweeps, and volleys (100 to 25,000), and lifetime damage dealt (10K to 50M), with thresholds grounded in the game's real damage model.
- **Uniques for every build on easy and medium** — Four new world-drop uniques round out build coverage: DEADSTAR (Moon, easy magic), PALE RIDER (Eastworld, easy ranged), and Eastworld's two medium melee relics HERDBREAKER and THE LAST ROUNDUP — Eastworld now has farmable uniques of its own.
- **EDWARD SNOW** — Eastworld fields a fourth elite: EDWARD SNOW, the whistleblower in exile whose leaked archive is what the ZAI SUPERCORE was trained on — the game's first ranged elite, fighting from behind cover and dropping the DEAD MAN'S SWITCH charm and THE SNOW ARCHIVE.
- **Developer BALANCE menu** — The hidden DEVELOPER settings gain a BALANCE subpage with ten runtime multipliers — XP gain, hero damage, mob hp/damage, horde size, drop rate, gear share/quality, unique drops, and menace gain — cycling 25%–400% with a RESET ALL row, persisted across launches.
- **Test scenarios & FPS meter** — A developer `?scenario=` URL parameter (engine `applyScenario`) stages a run into an exact situation — hero position, vitals, gear, cleared field, spawned mob rings — for bug repros and performance probes, and the DEVELOPER menu's DEBUG MODE toggle now shows an in-run FPS meter (also forced on by `?debug`).
- **Experimental WEAPON SWING developer flag** — The hidden DEVELOPER menu gains an opt-in **WEAPON SWING** toggle (off by
  default): it animates the field hero's held weapon on each attack — a blade
  winds back and whips through its slash arc, a gun recoils with the muzzle
  rising, a wand thrusts up on the cast — pivoting the weapon in step with the
  swing/muzzle effect so it reads as the weapon actually being used. It needs
  CHARACTER WEAPON on to have anything to swing.
- **Travel cutscenes between levels** — Every level now opens on a travel cutscene: the garage launch and the flight to the moon, ARMSTRONG's send-off and the crossing to Mars, walking into the rift MOSQUE tore open, and stepping out of the far door into Eastworld's daylight.
- **Forever spells, procs & sure strike** — Unique and legendary items can now grant permanent powers: forever spells (circling flame, stormcall, stasis field) that run while the piece is worn — scaling with rank and firing faster and harder with INTELLIGENCE — plus lightning and nova procs on-hit, on-kill, and when-struck (the D2 cast-when-struck), and SURE STRIKE (the weapon never whiffs). A legendary's drop odds now follow its power as a power law: the stronger the item, the (much) rarer the find.
- **Hard-rung uniques & THE INEVITABLE** — Five new named items complete per-spec coverage on HARD: OATHBRAND (melee blade), LONGWATCH (marksman rifle), HUNTSMAN'S COWL, COLOSSUS PLATE, and the rung's legendary THE INEVITABLE — the pistol that has never missed, crackling with on-hit lightning. All drop as level-locked world relics on hard, farmed like the earlier rungs' batches.
- **Nightmare-rung uniques & three legendaries** — Twelve new named items give NIGHTMARE a second full unique set per spec: HORDEBANE, GRAVEMAKER, DRAGON'S BREATH, PYRELIGHT, STORMLASH and four spec-leaning armor relics, plus three legendaries with forever powers — THE RECKONING (never whiffs, answers every blow taken with lightning, takes its price in blood), SKYBREAKER (on-hit lightning), and SUNWREATH (permanent circling flame).
- **JESUS pre-99 uniques & six legendaries** — Twenty-two named items give JESUS a third full unique set per spec (ilvls 67–96): eight weapons from WORLDSPLITTER to MAELSTROM, seven armor relics, the PILGRIM STAR charm — and six legendaries built on the forever powers: KINGSBANE, THE LONG SILENCE, STARFALL, THE STILLWARD (a legendary stasis shell), WINDGRAVE, and EMBERHEART (forever circling fire on a charm, for any build).
- **Rare & unique mobs** — Every level now laces in Diablo-style rare and unique special monsters — tougher, meaner, worth far richer loot, marked by a blue (rare) or gold (unique) aura — with their own recolored sprites.
- **Mob health bars** — A SETTINGS → DISPLAY toggle (on by default) draws a tiny hp bar over every wounded regular mob; bosses and elites already showed theirs.
- **ARTIFACT item tier** — A new ARTIFACT rarity above legendary — the super-epic, level-99 endgame chase — with its own searing red card color, the densest pickup reveal, an achievement badge, and unbreakable/keepsake treatment like every named drop.
- **Companions mend between fights** — Recruited companions now **regenerate health while out of combat** — once the field around the hero is quiet for a moment, a hurt ally knits back up over a few seconds instead of limping the rest of the level with no way to recover short of being beaten all the way down. A live foe in the hero's engagement bubble, or a blow taken, keeps a companion "in combat" and holds the regen off.
- **Ada's Trail & the bunker's prison twist** — Ada now leaves an escalating found-lore trace on every campaign level (Ada's Trail), the secret bunker is revealed as a prison the CORE has already emptied — its guards are wardens and SAM HALTMAN knows but is too afraid to say — and the bunker key (RASPUTIN's SEVERED HAND) now drops only after EASTWORLD is cleared.
- **Artifact roster** — Twenty-four ARTIFACT-tier relics of legend (DURENDAL, GRAM, RUYI JINGU,
  DRAUPNIR, CORNUCOPIA, …) now drop at the level-99 endgame, spanning a vast
  power ladder whose rarity follows its power — the apex pieces are hundreds of
  times rarer than the commonest.
- **Gilded name font for top-tier items** — Unique, legendary, and artifact items now spell their NAME on the display card
  in a new struck-gold "relic" font — gold, orange, and light-gold metal that
  grows richer up the ladder (unique polished gold, legendary gilt with an orange
  shadow, artifact molten with white-hot glints).
- **Analytic progression simulator** — A paper-playthrough balance tool (`scripts/progression-sim.mjs`, engine side `src/sim/analytic.ts`) that uses the real kill funnel to farm every mob a level fields — the horde, its elites, rolled rare/unique visitors, and its boss — across the whole campaign to level 99, snapshotting the hero's full stat block every N kills and rendering a self-contained HTML progression graph.
- **Endgame gap-fill uniques (60→99)** — Twelve new world-drop uniques (ilvl 79–99) fill the 60→99 chase window where the roster ran thin: four charms and three bags — the slots that had no relic in the endgame before the artifacts — plus a head, two chest, a legs, and a feet piece. All drop on the JESUS rungs, farmed in the same rift → the bunker loop, roughly tripling the plain-unique variety at the level cap without changing the calibrated ~1-unique-per-run rate.
- **Repair your kit at the merchant** — The wandering merchant now mends your whole kit — the worn weapon and armor plus every breakable piece in the bag — for coins in one tap, priced higher for gear of higher required level, rarer tier, and finer make.
- **The merchant remembers you** — Once you've met a map's merchant, he's set up at the door on every later visit to that map and difficulty — so a death-and-restart can walk straight over to sell and repair — and greets you back with a line tuned to the level and the difficulty.
- **Kept items survive balance changes** — Item drops you keep now stay exactly as they dropped, even after a later build rebalances or removes their base — a found weapon or gear is never nerfed or lost out from under you, and only NEW drops feel a loot change. Each drop is minted with a frozen snapshot of its stats, so kept inventory, banked loadouts, keepsakes, and a resumed run all carry through catalog edits unchanged.
- **Overkill sends mobs flying** — Overpowered kills now punt the mob's corpse flying away from the hero, tumbling
  through an arc before it lands — the harder the overkill, the further it sails,
  so a legendary one-shot launches a minion clear to the edge of the screen. A
  DEVELOPER → KNOCKBACK slider scales the fling live, from bodies dropping in
  place (0×) through the shipped feel (1×) up to absurd off-screen flight.
- **"Level 5: EASTWORLD"** — The campaign finale — the rift's far side is EASTWORLD, a knockoff wild-west theme park built by Vladimir Putain and Steven Seagull and run on ZAI robotics: a tight frontier town of building-sized houses, robot cowboy hosts, celebrity elites (Seagull, Putain and his sellable brand watches, Gerald Depardieu), Elon Mosque finally dying (dropping the new zero-stat TRASH tier), a merchant stall that fences Putain's estate at unique odds, and THE ZAI SUPERCORE boss — shielded by three cover-taking GROK controllers that shoot back — whose death quakes the park and plays the campaign's black-screen epilogue.
- **Developer flags for auto level stats and character weapon** — The hidden DEVELOPER menu gains two opt-in feature toggles (both off by
  default): **AUTO LEVEL STATS** turns the automatic per-level base-stat growth on
  or off (on also brings the horde's compensating hp scaling in lockstep, so the
  balance stays whole), and **CHARACTER WEAPON** shows or hides the held weapon on
  the field hero sprite (the worn armor always shows, and the HUD avatar stays
  armed either way). Both persist across launches.
- **Display settings with an XP-popups toggle** — SETTINGS gains a **DISPLAY** page for on-screen presentation preferences. Its
  first option, **XP ON KILL**, toggles the floating blue "+N XP" text that rises
  off a corpse on each kill — on by default, off for a cleaner field.
- **Arsenal viewer** — The hidden DEVELOPER menu gains a **VIEW ARSENAL** entry — a scrollable gallery of every unique and legendary item, ordered by item level and navigable with the pointer or the keyboard arrows. Each piece is drawn with the same icon and item card the in-game inventory uses, so the gallery always matches how the item reads in play.
- **Weapon knockback** — A handful of rare named weapons now carry KNOCKBACK: their landing melee or ranged blow shoves the struck survivor straight back, away from the hero, so kiting the horde is easier (elites take half the push, bosses none). It is a scarce signature — most weapons never push at all — found on a few uniques (REDWIND, GRAVEMAKER, WORLDSPLITTER), the legendary MJÖLNIR, and the artifacts GRAM and SHARANGA; magic weapons never knock back. The developer BALANCE › KNOCKBACK knob scales or disables the shove.
- **STAY after clearing a level** — Felling a level's boss now opens a bare LEVEL CLEAR menu — NEXT LEVEL, RESTART, or STAY. STAY drops you back onto the cleared field to keep farming loot and mopping up stragglers; tap the boss's corpse when you're ready to bring the menu back.
- **Boss set items (green)** — Each of the five campaign bosses now drops a coherent GREEN SET — a four-piece armor kit themed to one weapon class (melee first, then ranged, then magic across the campaign) that grants escalating SET BONUSES as you wear more pieces, capped by a signature power at the full set (a granted spell, a retaliation proc, or never-miss). On top of its set, every boss also drops one on-theme signature UNIQUE weapon of its class. Farm a boss on the endgame rungs to complete its set; the item card shows the set, your collection progress, and which bonuses are live.
- **Companions level up and grow their powers** — Companions now earn their OWN levels from their OWN kills — decoupled from the
  hero and carried across every level AND difficulty via the loadout, so the party
  levels up forever. Each companion's signature power grows a rank at a time:
  Tesla's coil learns to chain lightning, Amelia's blunderbuss packs more pellets,
  Rasputin's frost nova widens and bites harder, and Lucky's magic-find aura
  swells. A companion beaten down in the middle of a swarm now STAYS down until
  the field clears — or the hero speaks to the wandering merchant, who stands the
  whole party back up at full health (in hardcore too).
- **Native iOS/Android app** — A native App Store / Play Store build of the game, wrapping the deployed PWA in a full-screen WebView (in `native/`) so it looks and plays exactly like the website, with the game's vibration feedback now driven by the device's Taptic Engine and audio that plays through the iOS silent switch.
- **Breakable loot crates** — Crates are now smashable: the hero's weapon breaks them open for guaranteed loot — mostly health and stamina, sometimes gear, with a unique likelier than a regular kill — and the box keels over and bursts into splinters, leaving just the loot.
- **Scenario art staging** — Test scenarios (`?scenario=`) can now stage art judgements, not just bug repros: `freeze` poses the world's actors for a stable screenshot (the hero stays playable), `spawns[].hpFrac` places pre-wounded mobs to show battle-damage stages, `drops` lays ground pickups (loose kinds, equipment at a chosen tier, named uniques, powerups, story items) around the hero, and `place: "merchant"` teleports to the trader's stall.
- **Stackable medkits & stamina potions** — Medkits and stamina potions no longer fire the instant you touch them — they now stack into a new **consumable dock** above the powerup slots (a medkit slot and a stamina slot), five deep, with medkits stacking per quality (LIGHT/MEDKIT/LARGE/SUPERIOR, each with its own graphic) and the slot showing the best grade you hold. Tap a slot — or press **Z** to heal and **X** to drink on desktop (both rebindable in SETTINGS → CONTROLS) — to spend one when you need it; a medkit uses your biggest heal first and neither is wasted at a full bar. The dock (and the powerup slots) now carry a padded tap area so the small pickups are easy to hit on a phone.
- **Fog of war** — The level now has Warcraft-style fog of war: ground you've uncovered stays fully clear, ground you've never seen is solid black, and the frontier between them is a soft dithered transition band — and mobs standing out in that band (or the dark beyond it) stay hidden until they step onto ground you can see. The map uncovers as a circle sweeping the path you walk.
- **Level design systems** — Levels can now shape their feel with safe zones (a breather where the horde can't reach), dead zones (a quiet pocket rewarding a detour with a chest and a lone elite), pacing curves that build and release the horde's pressure, treasure chests, and placed merchant spots.
- **Bot combat profiles & postures** — The autopilot gains weapon-lane PROFILES (melee/ranged/magic — each build now
  banks intelligence for the AoE/reach/crit that helps every class) and three
  positioning STRATEGIES (aggro/balanced/flee); the simulation harness can sweep
  the whole matrix (`--strategy all --profile all`) to compare playstyles.
- **Per-class balance analysis** — The balance tooling can now sweep every stat-distribution build — `--class melee|ranged|magic|balanced` on the campaign simulator and the progression grapher (with `--class all` overlaying all four on one comparison graph) — so a spec can be checked for being overpowered and each build tuned to lead during its own stretch of the game.
- **Artifacts make melee the endgame king** — Every worn artifact-tier relic now multiplies a melee weapon's damage, so a bruiser who commits to the level-99 artifact chase reclaims the top of the endgame from the casters — a full set of relics puts melee clearly on top, while a mage in artifact armour gets nothing (it rewards actually swinging the legend).
- **Developer seed characters** — The hidden DEVELOPER menu gains a SEED CHARACTERS page that mints ready-to-play melee, ranged, and magic heroes at the NIGHTMARE (LV 34), JESUS (LV 56), POST-JESUS (LV 70), and ENDGAME (LV 99) tiers, each with a lane-optimized stat spread and level-appropriate gear.
- **Intended-path navigation, guidance arrow, and area captions** — Levels can author an intended `path` (a waypoint route from spawn to the
  objective): the autopilot follows it so it rounds walls instead of wedging, a
  blinking "go this way" arrow points the player along it once the area is clear,
  and walking into a named zone flashes its label as an area caption.
- **Melee arts & ranged techniques** — Spells now come in three CLASSES chosen by your dominant stat: STRENGTH unlocks 25 melee ARTS (cleaves, slams, war cries), DEXTERITY unlocks 25 ranged TECHNIQUES (volleys, trick shots, rapid fire), and INTELLIGENCE keeps the 25 magic SPELLS — one power per 10 points, all mana-fuelled. You only ever see your own class's list, and the spell bar stays hidden until you've actually unlocked a power.
- **XP bar kill heat** — Killing mobs now flashes only the freshly-earned slice of the XP bar a brighter blue; chained kills keep it lit, and it fades back into the resting fill about a second after the streak ends.
- **Guidance-arrow beacon ping** — The "go this way" guidance arrow now emits a soft sonar ping in step with each blink, a gentle audio nudge onward while the path ahead is clear.
- **BOT VIEW developer mode** — The hidden DEVELOPER menu gains BOT VIEW — pick a difficulty and mission and watch the autopilot play it with a realistic leveled, rolled-gear hero, its current decision printed over its head.
- **Bot fast-forward** — DEVELOPER → BOT VIEW now has a GAME SPEED step (after picking difficulty and level) that fast-forwards the autopilot run up to 8× — it runs more game-loop steps per frame, so it blitzes a level deterministically for a quick read (also driveable headlessly via `?speed=` / `playtest.mjs --speed`).
- **Spinning hay balls in EASTWORLD** — EASTWORLD's main street now has rolling hay balls: golden bales bounce and spin in from the east, and a bale that catches the hero costs a very slight bit of health and shoves him back down the street — step out of its lane or jump it to shake it off.
- **Pause menu while watching BOT VIEW** — While watching the autopilot play (DEVELOPER → BOT VIEW), tapping the survival timer or pressing P now opens the pause menu so you can quit to the main menu; the bot no longer instantly clears a pause you opened by hand.
- **Stampede approach rumble** — The SpaceZ HQ employee stampede is now heard before it is seen — a low rumble of feet fades up over the last moment of the countdown and swells as the wall charges in, peaking as it passes, so the herd never arrives on a silent floor.
- **Stampede approach-dust telegraph** — A SpaceZ HQ employee stampede is now SEEN coming as well as heard: a line of dust kicks up along the exact lane the wall will charge down a beat before the runners appear, so you know which band to clear. The warning is longer on the gentle difficulties and a mere blink on the hardest (1.5× the lead on easy down to 0.4× on JESUS).
- **Confirm before destroying an item** — Dragging a bag piece or an equipped item off the inventory panel now raises a confirmation dialog — showing the item at risk — instead of trashing it on release, so loot can no longer be lost to a slip of the drag.
- **Item card stat-lift hints** — Weapon cards now show, in blue, how much the hero's build lifts each line over the weapon's printed base — written as the base number plus a bare `+N` (no parentheses) so the two visibly sum: DAMAGE (the class attribute's lift), SPEED (the time the speed stat shaves off), and a new melee `HITS N +N` line showing the base cleave plus the extra foes INTELLIGENCE adds. `HITS` (melee) and the `PIERCES`/`PELLETS` projectile line (ranged) are mutually exclusive.
- **BOT VIEW spec picker** — DEVELOPER → BOT VIEW gains a BOT SPEC pick on the GAME SPEED step: choose whether the showcased autopilot is a MELEE, RANGED, or MAGIC hero — each mints a generated arrival hero in that weapon/gear lane, spends its level-ups on that stat lane, and fights at the matching distance (blades close in, guns hold the pack off, spells keep a mid range).
- **Bot view steering feedback** — BOT VIEW now visualizes the autopilot's controls — a lower-right virtual dpad that smoothly mirrors the bot's steering, plus white rippling "tap" bursts wherever it clicks (jumping, and firing powerup / consumable / spell buttons).
- **Auto pilot** — The pause menu can now hand your hero to the game's own bot for 100 coins per
  game-second — it fights, loots, auto-equips, restarts on death, and flies the
  campaign (rift runs and bunker detours included) at 1×–16× speed while a HUD
  strip tracks the purse, the burn rate, and the special loot it finds. Engaged
  on a level you've already beaten, it farms that level on repeat instead of
  advancing.
- **How-to-play loot and damage tips** — The HOW TO PLAY demo now teaches two more lessons: walking over loot picks it up (shown on the first scoop) and mobs hurt on contact (shown the first time the hero takes a hit).
- **Minimap follow view** — A new SETTINGS → DISPLAY → MINIMAP option lets the HUD minimap hover a close-up over the hero instead of fitting the whole level — drawn at a higher terrain resolution so the ground sprites read clearly.
- **Coin store** — The native app's title menu gains a STORE where coin packs (1M-10B coins, funding the autopilot) can be bought for real money; purchases land in an undistributed bank the player hands out to heroes of their choice via a slider, with the remainder staying banked for later.
- **Free store in test builds** — The coin store only charges real money in production store builds - dev, preview, and TestFlight builds grant packs FREE through the same flow, and a DEVELOPER menu FORCE STORE switch surfaces the free store in any browser build.
- **Autopilot pocket arsenal** — The autoplay bot now banks its best ranged and one magic weapon in the bag and swaps its held weapon to whatever maximizes damage each moment — the blade when a body stands in blade reach, the pocket shot while closing in, kiting, fetching loot, or airborne mid-jump (where a melee blade can't swing at all), with a single-target round preferred when a boss is near — never touching worn gear, carrying the attack cooldown across swaps so juggling mints no free shots, and keeping the bag sorted like the powerup dock: pockets in the first two slots, then the loot ordered by preciousness.
- **Sound mute switch** — SETTINGS → SOUND now has a MUTE switch that silences all audio at once while the
  MUSIC and SOUND FX sliders keep their values, so unmuting restores your exact
  mix instead of forcing you to drag a slider to 0% and lose your levels.
- **Coin store buy confirmation** — Tapping a coin pack in the STORE now opens a BUY confirmation screen before anything is spent, so an accidental press can't purchase (or, in free builds, bank) coins on its own.
- **Simulator death tracking** — The balance simulator now books every death with its cause and map
  coordinates, offers a mortal mode that restarts the level on death (with an
  abort after a configurable death limit), and the map layout renderer draws
  the clustered death areas so too-hard spots can be judged by visual
  inspection.
- **Achievements page filters and completion bar** — The achievements page now has ALL / UNLOCKED / LOCKED filters to focus on what you have earned or what is left to chase, plus a completion bar under the title that fills to your unlocked percentage and toggles to points earned on tap; the achievement detail card was enlarged with a double-size icon and bigger text.
- **Item pickup card rarity filter** — A new SETTINGS → DISPLAY → ITEM CARDS preference sets the lowest rarity that pops a framed loot card on pickup (NORMAL through ARTIFACT); finds below the chosen tier drop quietly to the lower-corner pickup feed instead, cutting card noise in a loot flood.
- **Breakable loot props & more chests** — Scenery can now be smashed for loot on every map — vending machines cough up drinks, wine racks a vintage, barrels, wagons, desks, gold pallets and space junk their own themed, chance-based spills — plus extra reward chests on all six maps and supply crates on the moon.
- **Passive talent trees** — Every 10 points a hero puts into STRENGTH, DEXTERITY, or INTELLIGENCE now earns a talent point in that stat's tree, spent through a full-tree picker at level-up on always-on passive talents (up to rank 5 each) — a WoW-style Warlord / Windrunner / Archon spread that grows alongside a build: melee crit and enrage, ranged crit, dodge and move speed, flat damage reduction, a deeper health pool, and a magic ward. Spent points are permanent and lock a floor under their earning stat during a respec; adopted veterans convert their existing stat investment into a pile of picks on load.
- **Always-on magic talents** — The INTELLIGENCE tree gains its first always-on conjurations: ORBITING FLAMES rings the hero with fire that burns what it touches, and STORM CALL hurls lightning at the nearest foe on its own — both hands-free, scaling with rank and INTELLIGENCE, and stacking on top of any legendary that already grants the same power. A deep-INT hero can now stand in the horde and let the spells do the killing.
- **The Archon's full arsenal** — The INTELLIGENCE tree fills out into a hands-free killing engine: SEEKER ORBS hunt the horde and burst on impact, an IMMOLATION AURA scorches everything that closes on you, and an ARCANE SINGULARITY drags the swarm into a crushing vortex — all always on and scaling with rank and INTELLIGENCE. Two defensive talents close the tree: FROST NOVA freezes the foes around you solid the instant you're struck, and ARCANE RETRIBUTION turns a growing share of every blow back on its owner. A deep-INT hero can now stand in the middle of the horde and let the spells do all the work.
- **The Warlord and Windrunner fill out** — The STRENGTH and DEXTERITY talent trees round out with active-feeling procs. Melee gains CLEAVING ECHO (swings sometimes cleave extra foes), TWIN STRIKE (blows sometimes land twice), PARRY (turn a blow fully aside, and at mastery riposte it), and SEISMIC LANDING (jump touchdowns slam the ground for AoE and knockback). Ranged gains PIERCING SHOT (shots punch through a line of foes), CONCUSSIVE ROUNDS (shots knock foes back), CRIPPLING SHOT (shots slow foes to a hobble), VOLLEY (a pull sometimes looses a spread of extra rounds), SPRING HEELS (jump higher and farther, cheaper at mastery), and EVASION's rank-5 dart-away speed burst. Every one scales with rank and is always on — no mana, no cooldown.
- **Talent power balance dial** — The hidden DEVELOPER → BALANCE screen gains a TALENT POWER slider that scales the passive talents' always-on stat bonuses and offensive proc rates (0× turns them off, up to 100×) so their strength can be probed at runtime without a rebuild.
- **AUTO PILOT progress scoreboard** — The AUTO PILOT LOOT screen now opens on a scoreboard of the ride's whole haul — levels climbed, stat and talent points earned, clears, deaths, and coins burned — laid out as an aligned grid of colour-coded tiles above the loot list.
- **A dramatic death scene** — When the hero falls, the run now plays a dramatic death scene before the YOU
  DIED modal: the horde stops attacking and rings the fallen hero, more mobs
  wander in from the screen edges to fill the field, the corpse lies bleeding in a
  spreading, flowing pool of blood, and clouds roll in over the field — then the
  defeat splash rises. Tap anywhere to skip straight to the modal.
- **LOST & FOUND — buy back what the AUTO PILOT threw away** — A paid AUTO PILOT ride now banks the loot it sheds to keep its bag workable
  (anything magic or better) and a new title-screen LOST & FOUND screen sells it
  back for coins — 10 million for a magic find up to 2 billion for an artifact —
  until the next ride starts, when whatever went unbought is trashed for good.
- **Effects gallery** — The hidden DEVELOPER menu gains VIEW EFFECTS: every visual effect the game
  draws — each staged as a real fullscreen game situation and replayed on a loop —
  browsed one per screen with a search box, side buttons and swipe.
- **Scenario display-case controls** — Test scenarios can hold a staged situation up for as long as it is looked at:
  `reveal` lifts the fog off the whole map, `muteDialogue` keeps a staged speaker's
  scene from parking the run, `noVictory` stops a cleared field from ending the
  level, and `runAbilities` starts powerups already running.
- **Hellgates and the hellborn** — On NIGHTMARE and JESUS, going on a rampage now tears open HELLGATES laced across
  every map, letting through map-unique HELLBORN — elite-sized historic horrors
  from across universes and planets — that pour harder and faster the deeper the
  meter runs, drop far richer gear the higher the rampage climbs, and stop the run
  for the hero's own read on them the first time one steps out of a tear.
- **Talent icons** — Every passive talent now has its own pixel icon, drawn on a slate plate at the
  head of its row in the level-up talent picker.
- **Quick-draw order** — The weapon switcher (and the 1-4 hotkeys) can now list your weapons the way your BACKPACK does — the same weapon in the same place on both screens, the new default — or lead with the best one for your hero's stats; pick yours under SETTINGS → CONTROLS → QUICK DRAW.
- **Two new powerups every map** — Every map past SPACEZ HQ now introduces TWO new powerups and keeps everything
  the earlier maps taught, so the dock's vocabulary grows the whole campaign: ION
  WAKE and BLAST SHIELD at the launch pad, MOONFALL and PALE SHROUD on the moon,
  DUST DEVIL and REACTOR SURGE on Mars, EVENT HORIZON and THE UNMAKING in the
  rift, DEAD MAN'S HAND and IRON STAMPEDE in Eastworld, and CONTINUITY PROTOCOL
  and SENTRY GRID in the secret bunker.
- **Slow motion in the effects gallery** — The developer EFFECTS GALLERY can now play any effect at 1/2, 1/4 or 1/8 speed
  (the SPEED chip, the `S` key, or `?effects=<id>&speed=0.25`), so a burst that is
  over in a fifth of a second can actually be watched.
- **Windows, macOS and Linux desktop app** — The game now ships as a desktop app for Windows, macOS and Linux (`electron/`), built for Steam: it bundles the whole game inside itself and plays offline exactly like the website, in a real window that remembers its size and fullscreen state. Steam Cloud carries your roster, coin bank and hardcore scores between machines, your earned badges mirror onto your Steam profile, and the Steam overlay works. The coin store does not exist there — the desktop game is bought once instead, and the AUTO PILOT purse is funded by selling loot to the merchant exactly as it is on the web.
- **Last call before the auto pilot trashes the vault** — Engaging a new AUTO PILOT ride while the LOST & FOUND still holds something now asks first — naming what would be binned and offering a buy-back from inside the run — instead of emptying the vault silently.
- **App Store submission pipeline** — A privacy policy at `/privacy`, a compiled-and-validated App Store listing
  (`native/store/listing.yaml` → `make store-metadata`), and a screenshot harness
  that captures the real game at Apple's exact rasters with captions in the
  game's own pixel font (`make store-shots`).
- **A contact and support page** — `/contact` gives players one address to reach a human about a bug, a purchase,
  or their saved heroes — and satisfies the support URL App Store Connect
  requires. The address is supplied by the `SUPPORT_EMAIL` repo variable rather
  than hardcoded.
- **Install prompts and search results now show the real game** — The web manifest carries install-prompt screenshots — real frames of a live fight, captured from the running game by `make screenshots` — so Chrome shows the richer install prompt instead of the plain one. The game's structured data gained its genres and those same screenshots, the privacy and support pages describe themselves to search engines instead of carrying nothing, and Lighthouse's SEO score became a hard CI gate rather than a warning.
- **An arsenal and a mission guide in the library** — The library at `/library/` now carries a page for every item and every mission
  alongside the bestiary: what each item does (the figures the in-game card shows,
  its make-quality table, and the exceptional and elite versions it upgrades into),
  what every venue fields on each difficulty, and — behind spoiler covers — each
  mission's map, drawn with the game's own sprites.
- **The whole story, in the library** — The library at `/library/` now carries the story: a chapter per mission plus one
  for the things a rampage lets in, each holding the plot, the cutscenes that play
  on the way in, the arrival monologue, every named figure's scene and last words,
  and the found lore — in the game's own words rather than a retelling of them.
  It is all spoilers, so it is all behind covers, with one switch at the top of a
  chapter that lifts them at once; and every game name in the prose links to that
  monster, item or venue's own page. The App Store listing now points its homepage
  link at the library.
- **Back to game** — Every library page now leads with a sticky BACK TO GAME button, so the installed
  app and the native build — which have no browser back button — have a way out of
  the reference site.
- **The front page says what the game is** — Below the boot console the home page now explains what kind of game this is,
  lists the campaign's venues straight from the level catalog, describes the
  one-finger controls, and answers the six questions people ask before playing
  anything — is it free, does it need installing, does it work offline, does it
  need an account, what does it run on, does progress save.
- **Rings and amulets** — The hero now wears an amulet and TWO rings. Rings start dropping on NIGHTMARE
  and amulets on JESUS, so the jewellery slots open up as the ladder is climbed —
  eleven new bases plus three named relics (BRISINGAMEN, THE HELD NOTE, THE LAST
  SHIFT), and DRAUPNIR and the star rings now sit on a finger where they belong.
  He also sets out wearing an ENGAGEMENT BAND worth +1 LUCK. The old CHARM slot is
  gone: charms are TRINKETS now and pay out from the BAG, so carrying one is what
  makes it work and bag space is what it costs. A saved hero's worn charm moves
  into his bag on load.
- **Generated maps** — A hidden DEVELOPER setting that carves every mission's map fresh at the start of
  each run — chambers, walls, the horde, the caches and the boss's hiding place all
  rolled from the mission's own blueprint — so the boss has to be hunted down
  instead of walked to, at your choice of three map sizes.
- **Junk drifting overhead in the rift** — The tear between universes is now full of everything that ever went missing —
  socks, keys, a suitcase, somebody's biplane — some of it drifting overhead
  between you and the sky, out of focus and sliding past faster than the ground
  does, so the rift finally reads as a place with somewhere above it.
- **Walk, float and jump animations** — Everything on the field now carries itself: bodies on legs stand upright and rise
  into a brief tip over each step, one lean per step and faster the faster they
  actually move — ghosts and other legless monsters hover over a shadow instead,
  and a jump gets a takeoff stretch, a landing squash, and a puff of dust and
  gravel in the colour of the ground it was kicked off.
- **Blood that scales with the blow, on a floor that remembers it** — Every landed blow now sprays blood in proportion to the damage it did — priced
  in the victim's own healthbars, so a nick freckles and a blow that opens a mob
  up throws a wound, drops and a hanging haze — and what lands SOAKS INTO THE
  FLOOR: the ground the fight was had on visibly reddens, pools and dries where
  the bodies fell, catches the light while it is wet, and stays that way for the
  rest of the level. Turn it off with SETTINGS → DISPLAY → EXTRA GORE.
- **Gamepad steering, and a third zoom tier for big monitors** — The game can now be played with a controller: pick GAMEPAD under SETTINGS → CONTROLS → STEERING and the left stick walks — push it further to run — with the strike button swinging your weapon. It works everywhere the game does, on the website, in the desktop app and on a phone or tablet with a controller paired. Big monitors also get their own zoom tier, so a 1440p screen no longer shows nearly three times as much of the map as the phone the game is balanced around.
- **Play the whole game with a controller** — A gamepad now drives every menu in the game, not just the run: the title screen and its settings, the pause menu, your inventory and the shop, the level-up and talent choosers, the vault, the achievement shelf and the high-score board. The stick or d-pad moves, A chooses, B and START back out — so a controller is enough from launch to quit, with no keyboard or mouse needed.
- **Steam screenshots and a store preflight that covers both storefronts** — `make store-preflight` now checks the Steam store page too — the app and depot
  ids (including Valve's shared test app), the achievement manifest, the capsule
  art at Valve's exact dimensions, and the five required screenshots — and the
  screenshot harness gained a real 1920×1080 Steam raster, so the desktop set is
  generated rather than hand-grabbed. The library's pages can now link a published
  Steam page alongside the App Store listing (`steamUrl` in `game.config.json`).
- **Parental controls in iOS Settings** — The app's own page in iOS Settings now carries two switches, both on by default:
  MATURE CONTENT removes the blood and makes the screen-clearing bomb knock enemies
  down like any other hit instead of burning them to skeletons, and COIN STORE
  removes the store from the game entirely.
- **Menu icons on touch** — On touch devices the title menu's wisp cursor — which had nothing to hover and
  just lingered on the last row tapped — is replaced by a hovering pixel icon
  beside every navigation row (main menu, PLAY, the SETTINGS index and BACK), each
  drawn in its label's own color — grey until the row is selected, then amber — so
  the rows read as something to press; a mouse or trackpad keeps the wisp as
  before.
- **Game Center achievements** — In the iOS app the badges you earn now also appear in your Game Center profile,
  and the ACHIEVEMENTS shelf offers a GAME CENTER row that opens the system board.
- **The balance sim reports how often stamina runs dry** — `simulate-run` now prints a STAMINA table — dry-outs and their per-minute rate,
  the share of the run spent at zero, the share the empty-pool regen lockout was
  armed, the "on fumes" share, mean fill, the longest dry spell, drinks
  swallowed, and the run/walk/stand pace breakdown — and a new DEVELOPER →
  BALANCE knob (STAMINA DRAIN) scales the run drain so a candidate rate can be
  swept without a rebuild.
- **Eastworld, rebuilt — and the way to the boss is now a lift** — Generated maps end somewhere the floor plan does not reach: the boss holds a sealed room in a band of its own with no corridor to it at all, and the only way in is an ELEVATOR pad standing out in the map, so the last thing to find is the way to the boss rather than the boss — eastworld's ZAI CONTROL ROOM is buried under the country, and the bunker's vault is under its floor. Generated eastworld is now open western country: mostly hardpan and lone houses out on the flats, fenced grazing range with cattle in it, homesteads with gardens, chickens and pigs, and exactly ONE town, laid out as a proper main street with frontages facing each other across the lane. Named elites now LIVE somewhere — a house on the street that looks like any other frontage until the hero walks up and the door bangs open — and levels can carry ambient wildlife that mills about and is neither a threat nor a target.

### Changed

- **16-bit soundtrack and SFX** — The soundtrack and sound effects moved from an 8-bit NES palette to a 16-bit SNES-style sound: both themes are rearranged as ~2-minute multi-section scores (verse/chorus/breakdown arrangements in per-track score files) played by an upgraded sequencer with instrument patches, detuned chorus voices, vibrato, stereo pan, filtered drum kits, and a shared echo bus, and every sound effect gained layered 16-bit detail.
- **Armor revamp** — Armor is now worn in four body slots (head, chest, legs, feet) with flat armor
  points that reduce physical damage against the attacker's level, D2/WoW-style;
  pieces wear out per hit taken and go inactive until repaired, every level drops
  its own themed wardrobe (33 new pieces), harder difficulties roll deeper item
  levels, the hero starts in street clothes, and the space suit is now a story
  item worn over everything rather than equipment.
- **Two-way story dialogue** — Elite and boss scenes are now conversations — the hero talks back mid-scene
  (his own face and name in the dialogue box) — and the whole script was
  rewritten in plainer language, including a clearer opening monologue.
- **Golden arrow XP hits like a crit** — The "+N XP" a golden arrow floats now pops at double size and jolts in place
  like a critical hit before it floats up — an arrow is a whole slice of the level
  bar, so it lands like the crit it basically is.
- **Larger item-hover stats** — Item hover tooltips now render their stat lines at a larger, easier-to-read size.
- **Pack-kill XP merge is easier to trigger** — The merged pack-kill XP float now fuses kills that sit up to a body-width apart
  (not only bodies literally overlapping), so a wide blast over a loosely packed
  horde reliably pops one big number instead of a smear of separate drips.
- **Autopilot global pathfinding** — The autopilot now plans real A* routes across the whole level (a coarse walkability grid built from the walls and rock, in the new `pathfind.ts`) instead of only sliding along the walls it can see ahead, so it threads the ridge gaps and walled pockets to reach any chest, elite, or the boss on its own. On top of it, the bot automatically sweeps to every reachable off-path chest before committing to the boss, abandoning any cache it genuinely can't make headway toward so a run never deadlocks. The headless simulator now reports how many of a level's chests the runner actually cracked open — a reachability check that flags a cache walled off from the natural sweep.
- **Diminishing returns on stats** — Every stat now saturates past a soft cap (linear to 40 effective points, flattening toward ~90): auto level gains, chosen points, and gear stats all run through the same curve, and the horde's compensating hp scale mirrors it — so the mid-game hero stops compounding into a god while weapons and armor keep scaling with item level, and each new level leans a little harder on gear rather than free stats.
- **Scaling percentage bonuses capped at 2%** — The scaling `+% stat` / `+% max hp` bonuses on named uniques are capped at 2% per item (down from 3%), clamped at mint whatever the catalog says; weapon `+% damage` and armor are exempt. Affected uniques' item levels were re-authored to the ilvl model's new computed values.
- **Level-up shows the level reached** — The LEVEL UP! chooser now shows which level you just reached, and the (i) info toggle moved to the modal's top-right corner (now a proper dotted lowercase "i") so it no longer reads as part of the level.
- **Tighter horde clumping** — Enemies now overlap more when they pack together (the pairwise separation
  squeeze doubled from 20% to 50%), so a kited horde bunches into one tight
  cluster you can lure onto itself and finish off with a high-intelligence AoE
  weapon.
- **Powerups no longer trigger menace** — The screen-nuke bomb and the damage powerups (fire orbs, storm cell) no longer heat the escalation meter: their damage and kills are still booked for the run stats but held out of the menace rolling DPS/kill-rate, the overkill jolt, the dinner-bell lure, and the evolution ratchet. Clearing the screen with a consumable no longer escalates the horde the player never out-fought by hand — menace still answers only the hero's own weapon.
- **Heal key moved to C** — The default desktop heal key (uses a medkit from the consumable dock) is now **C** instead of **Z** — easier to reach from the WASD hand. Still rebindable in Settings → Controls.
- **Tighter landscape HUD** — The horizontal (landscape) HUD is more compact: the weapon and its durability bar now sit to the right of the HP and stamina bars, the MAP and ACHIEVEMENTS buttons move to the left of the run clock, and the powerup dock slots shrink to roughly 1.5× their portrait size. Portrait mode is unchanged.
- **Developer balance sliders** — The developer BALANCE page now drives each knob with an exponential slider (drag, tap, or ←/→) spanning 0× (system off) to 100× the shipped tuning — where 1× is baseline — replacing the preset 25%–400% percentage steps; the track's four quarters cover 0→1, 1→2, 2→10, and 10→100 so the useful low end gets most of the travel.
- **Settings sliders and ON/OFF switches** — The SOUND music and SFX volumes are now drag sliders (reusing the BALANCE track) instead of quarter-step cycles, and every straight ON/OFF setting (DEBUG MODE, AUTO LEVEL STATS, CHARACTER WEAPON, WEAPON SWING, VIBRATION, XP ON KILL) shows a right-aligned pixel switch — the same amber track and blocky knob as the slider, snapped to its two ends — that you flip by clicking or steering with ←/→.
- **PLAY submenu — NEW GAME / LOAD GAME** — The title menu's PLAY entry now opens a submenu: **NEW GAME** mints a fresh hero, **LOAD GAME** picks (or retires) a saved one. CONTINUE was renamed **RESUME** (shown only when a run is parked), and the standalone CHARACTERS entry is gone — the two PLAY paths make that choice explicit. Achievements can no longer be opened from the in-run HUD (the gold star and its Y shortcut were removed); browse them from the main menu's ACHIEVEMENTS shelf, which is where the account-wide badges belong.
- **Cleaner settings rows** — The SETTINGS rows now read as a setting name on the left and its value lined up down the right edge (no more `LABEL: VALUE`), every row shows its help subtitle at all times in a dim gray with a little more breathing room between rows, and the KEY BINDINGS row only appears on devices with a keyboard to rebind.
- **Orbital solar-system title menu** — The title backdrop's arcing sun is replaced by a static sun with Earth, Mars, and the Moon orbiting it, each lit from the sun's real direction.
- **LOAD GAME lists heroes only** — The LOAD GAME roster no longer shows the "+ NEW CHARACTER" slot — minting a hero lives on the title menu's NEW GAME entry — and PLAY → LOAD GAME now dims out entirely when there are no saved heroes to load.
- **Weapon swing from the shoulder** — The developer WEAPON SWING animation now pivots the field hero's held weapon about the shoulder instead of the grip, so the whole arm sweeps and the weapon rides the end of a stretched-out arm rather than twisting at the wrist.
- **Soft per-map level caps** — Each map's level cap is now a soft slope instead of a wall: XP keeps decaying
  reverse-exponentially past the cap down to a glacial ~1/100 trickle it reaches
  about two levels over the cap, so an outgrown map crawls the hero a little
  further at an ever-slower pace but never slams shut — the only hard level
  ceiling is the global max.
- **The horde eases off at bosses on EASY and MEDIUM** — On the two gentlest rungs the swarm now **loses its legs the moment you engage an elite or boss** — drop to **10% chase speed on EASY, 50% on MEDIUM** — so you can push past the pile-on and just run to the set piece instead of being dog-piled at it. The mercy only kicks in once the encounter has actually started (the elite/boss is awake, wounded, or you've stepped inside its aggro range), so an idle player away from a set piece is still overrun as before. HARD and up give no ground.
- **Gentler melee AoE cone, capped at a half circle** — INTELLIGENCE now widens a melee weapon's AoE cone gently and saturates it at a half circle (a 180° sweep) instead of a full one, so reaching that cap takes a deep-endgame INT investment and a swing always leaves a back arc uncovered; the developer WEAPON SWING animation's slash now renders on the blade itself and widens with the cone.
- **Autopilot fights melee up close and saves its jumps** — The autopilot now plays a melee loadout the way a melee loadout wants to be
  played: it presses in to swinging range and grinds the pack from there —
  holding within the blade's actual reach and giving ground only when a body
  crowds inside the bite — instead of fleeing to the ranged standoff (beyond
  where a short blade lands) and darting in for one hit at a time. It also stops
  draining its stamina on needless hops: jumps are now saved for breaking a
  genuine surround, and even then only spent when a body is about to bite and
  enough of the pool is in reserve to stay sprint-capable; telegraphed slams and
  charges are side-stepped on foot.
- **BOT VIEW shows one steady thought** — The developer BOT VIEW overlay now resolves the autopilot's raw per-tick decision into a single overarching thought instead of strobing between neighbouring branches: a hero dancing at a pack's edge reads as one "SKIRMISH" rather than flickering "KITE" / "GIVE GROUND", a hazard dodge or emergency bail preempts and is held briefly so it stays legible, and otherwise the most-sustained recent intent wins.
- **Dialogue trimmed to fit a portrait phone** — Every dialogue turn, hero thought, story-item lore page, level intro/outro, and merchant greeting was tightened so each page fits within a small portrait phone's dialogue box (at most three lines) without scrolling — conversations now go back and forth in short beats instead of overflowing, and monologue pages fill the box rather than trailing dead space.
- **Menace only heats while you out-clear the horde** — The menace meter's rolling heat now fires through a CLEARANCE GATE: sustained damage and kill-rate output only escalate the horde while you are actually thinning it — clearing minions faster than they spawn (over a ~5s window) by more than a threshold margin. A strong SLOW weapon that pumps damage into a screen that keeps filling no longer rampages, and walking away from a crowd never counts as clearing (kills, not on-screen count, are the signal). A new DEVELOPER → BALANCE knob, CLEAR GATE (`menaceClearance`), tunes how far you must out-clear spawns before menace heats (1× = 10%).
- **Autopilot holds back and reacts to damage** — The autopilot now plays melee with more self-preservation: it holds a few more
  pixels off the pack, treats taking a hit as a signal to give a little ground
  (a brief flinch back after every bite), and — once its health drops below half
  — spends a jump to escape a body about to bite rather than trading blow for
  blow. It kills about as much as before but takes roughly two-thirds less damage.
- **Companions keep up with a moving hero** — Companions now prioritise staying WITH you as you range across the map over stopping to trade shots: while you move they hold formation instead of peeling off after a mob (they still fire one already in reach), and a companion you outrun to the edge of the screen drops the fight entirely and moves with you until you stop.
- **3D orbital main menu** — The title backdrop wheels Mercury, Venus, Earth (with a smaller Moon) and Mars around the sun on tilted 3D orbits — each planet shrinks and slips behind the sun at the far side of its loop, then swells back on the near side — and its asteroids fly a perspective path toward the camera instead of drifting flat across.
- **Larger, more legible merchant shop** — The merchant shop is redesigned for phones: the text is bigger and easier to read (stall prices, purse, and the merchant name and section headers all read at a comfortable size), coin prices are vertically centered against their coin icon, and the bottom action row gathers SELL JUNK, SELL ALL, a wrench REPAIR icon, and CLOSE.
- **A longer, Diablo-style grind — per-tier slowdown and an endgame wall** — Reworked leveling so each difficulty tier is a level ceiling the hero lands under, not a target, and the deeper tiers take longer and longer. A full clear (no deaths) now leaves the hero around 33/35/36 on the easy/medium/hard lanes, ~51 after nightmare, and ~69 after jesus — each under that tier's XP cap (40 / 58 / 70). Two new, runtime-tunable knobs drive the "harder = slower" feel: **LEVEL SLOWDOWN** makes every level cost 25% more per difficulty tier above the bottom lanes (compounding — nightmare ×1.25, jesus ×1.5625), and the **ENDGAME WALL** steepens the curve 5% per level past 70 so the climb to 99 becomes a real grind. Both are on the DEVELOPER › BALANCE page. The per-map XP caps, golden-arrow caps, and world-drop level gates were re-sized off the new full-clear landings.
- **Mob-level caps, WoW-style level-difference XP, and mob armor** — The horde's monster level is now hard-capped into a per-difficulty band — easy 1–34, medium 2–36, hard 3–38, nightmare 38–56, jesus 58+ — so a tier's mobs never scale past its ceiling nor drop below its floor. The floor makes a freshly-arrived nightmare or jesus hero fight mobs a touch above his level; the ceiling stops mobs scaling once he out-levels a tier. On top of that, kill XP now swings with the mob's level versus the hero's, like WoW: a mob above the hero pays a bonus, a mob below pays a shrinking penalty down to zero at the "grey" level, and a same-level mob is unchanged. Together they make an over-levelled farm run meet stuck, XP-poor (and lower-tier-loot) mobs, and give the low end of the hard tiers a catch-up bonus. Mobs also gain ARMOR that shrugs off a share of PHYSICAL damage (melee/ranged) while MAGIC ignores it. The reduction rises STEADILY with the mob's level — a ramp from ~0% at level 1 to 35% at level 99, so armor keeps pace with hp and damage instead of fading — plus a flat per-difficulty bonus stacked on top (0% easy, 2% medium, 5% hard, 10% nightmare, 15% jesus), so a jesus mob tops out at 50% reduction at the level cap and each difficulty jump feels harder. Armor nudges the endgame toward magic builds and lays the groundwork for an armor-piercing item stat. The XP swing and armor are both tunable at runtime on the DEVELOPER › BALANCE page (REST XP, MOB ARMOR).
- **Enemies hide behind cover** — Enemies fully hidden behind walls, boulders, and rocks are no longer drawn — the horde now stays out of sight behind cover the hero cannot see through (a mob only peeking out from an edge still shows), and pops back into view the moment it steps clear.
- **Realistic 3D title-menu planets** — The title backdrop renders every world as a real rotating, sun-lit globe: a per-pixel canvas sphere shader with a procedural surface texture, correct waxing/waning phases and a soft terminator computed from each body's true 3D position relative to the sun, atmospheric limb glow on the worlds with air, real axial tilt, and rotation and orbital speeds scaled from each planet's true period (Venus turns retrograde; the Moon is tidally locked). The orbits also fan out at their own inclinations so the system reads in 3D rather than as one flat line, and a new `?skytest` URL parameter opens a bare planetarium view of the sky for inspection.
- **Live minimap HUD hub** — The upper-right map icon is now a live World-of-Warcraft-style minimap: the actual fog-of-war level in a rounded frame, still tappable to open the full map. The survival timer sits centered on top (and also pauses the run), RAMPAGE fills and reddens as a gauge around the frame instead of the old row of pips, and a strip below the map carries the rampage stage on the left and the kill tally ("N kills") on the right.
- **WoW-style portrait HUD** — The upper-left HUD was rebuilt as a compact WoW-style unit: a framed hero-bust portrait (torso and above) with the level tucked on its lower-left corner, the health (red), mana (blue), and stamina (white) bars merged into one color-coded plate beside it, a themed sci-fi frame behind the portrait and bars, the held weapon floating below the portrait with its durability shown as a ring around the icon, and the bag moved onto the minimap corner as a pouch showing the free-slot count. The XP bar now hugs the very top edge, and the vitals animate smoothly.
- **Thinner blue XP strip** — The top XP strip is now a thin blue bar (matching the stamina sliver's height) and sits a few pixels closer under the iOS notch / Dynamic Island.
- **Bag pouch beside the weapon** — The bag pouch moved from the minimap corner to sit directly right of the weapon circle below the portrait, matched to the same size.
- **Moon reforged into ridges and basins** — THE MOON is rebuilt around discovery: three long rock ridges with offset pass-gaps carve the open regolith into basins the hero weaves through on an authored path from the lander to ARMSTRONG, the finite ridge-gap spawners ramp wisps → ghosts → wraiths → OPTIMUSK, and two off-path detour pockets (the CRASHED LANDER and THE THIRTEENTH GRAVE) each hide a chest guarded by a pinned rare/unique, with a STILL POINT merchant nook before the boss.
- **Autopilot dodges sand storms** — The autopilot now reads incoming MARS sand storms and sidesteps out of their path before they can sweep over it — off the drift line to the open side, even on an otherwise-clear field — rather than idling into a two-second knockout.
- **Autopilot hunts elites and never loiters** — The autoplay bot now treats the map's elite mobs and boss as objectives — once leveled for them (one level below parity) it rushes each named foe it has a rough fix on before committing to the boss — marches on the nearest enemy after five fightless seconds instead of loitering, accepts a pinned GPS waypoint (`setBotWaypoint`), and no longer wedges itself chasing ground drops that lie behind walls.
- **3D orbital title backdrop by default** — The orbiting 3D solar-system title backdrop is now the shipped default, and the old arcing-sun sky (with its DEVELOPER "ORBITAL MENU" toggle) has been removed.
- **Autopilot plays powerups by value** — The autopilot now ranks the powerup catalog (nuke > storm > orbit > stasis > magnet) and plays each pickup for what it's worth: the nuke waits for a real crowd, combat powers fire on a decent fight, the cheap stasis/magnet are spent eagerly, and low-value pickups are burned to keep a dock slot cycling free for stronger finds — the nuke is never wasted on shelf space. The merchant routine buys powerups in the same value order.
- **Walking now recovers stamina** — A walk pace (keyboard walk / a gentle drag) is now a breather on the move: the sprint pool regains at half the standstill rate instead of draining, so you can catch your breath without stopping — standing still is still the fastest refill, and the empty-pool lockout still applies.
- **Autopilot paces itself and curates its powerup dock** — The autopilot now walks to recover stamina on quiet ground and only opens up to a run once the pool is rested (~70%+); it saves the nuke for a genuinely overwhelming flood (~20+ mobs inside the blast), fires stasis when cornered (winded, under half health, a pack hunting), drops a lesser powerup to make room when a better one lies in reach (a running slot is freed for free), and keeps its dock sorted in its own priority order so you can see how it ranks what it carries.
- **Autopilot treats stamina as fight fuel** — The autopilot now sprints freely in the open while keeping a tunable ~20% reserve (walking it back at the floor), and tops up before fights instead of pacing everywhere: a pack spotted ahead is engaged at a full pool — it walks the approach when the walk regen still refills before contact, or plants a breather and lets the mobs cover the ground when it can't.
- **Sharper hero artwork** — Improved the main character's EVA suit with clearer helmet, shoulder, chest-panel, and boot details.
- **Autopilot's stamina caution scales with how well the run is going** — The autopilot's stamina reserve floor now slides with a bravery read — how hard its blows hit the local health bars, how fast it has been shredding them over the last minute, and the medkits, stamina potions, and powerups in its pockets: a naked rookie paces cautiously at ~35%, a kitted-out shredder digs to ~10% and engages spotted packs at ~70% instead of demanding a full pool.
- **Smarter autopilot looting and jumping** — The autopilot no longer chases pickups its pockets can't hold (a full
  medkit/potion/repair-kit stack turned the pickup away and left him standing on
  it), spends jumps sparingly (an escape hop now needs a genuine surround or a
  landed hit while bleeding, spaced out by a cooldown, and the repair-kit detour
  no longer hops the whole way), treats golden XP arrows as top-priority pickups
  while they still pay level-bar XP, and reliably cracks every chest — lockers in
  walled side-rooms now route correctly, are pressed to through a crowded
  doorway, get one retry before the boss, and the boss fight no longer starts
  while a chest errand is still open. The balance simulator reports a new
  `jumps`/`j/min` column tracking takeoffs per run.
- **Autopilot tops off from surplus supplies and plays golden arrows strategically** — With a medkit/stamina-potion/repair-kit stack already full and the same kind
  lying underfoot (or inside a running magnet's pull), the autopilot now spends
  one — only when health, stamina, or gear durability actually has room — so the
  walked-over pickup refills the stack; the switch fires only in passing, on a
  10-second cooldown, and never diverts the march. The bot also learns from
  experience how much of the XP bar a golden arrow pays (in 5% steps) and treats
  a nearby arrow that would trigger a level-up — a free full heal — as a
  strategic medkit: it holds its kits, grabs the arrow when bleeding, and fights
  a little braver with one in reach.
- **Autopilot bravery floors retuned from a knob sweep** — A 3×3 simulation sweep over the autopilot's bravery floors picked the winning pair: the timid reserve floor drops from 35% to 25% and the brave floor stays at 10% — the measured best on deaths (4 across five runs, none above 2), kills (the grid maximum), and wins.
- **A glimmering coin store** — The STORE row on the title menu now glimmers — a spinning gold coin and a sweeping specular glint mark it out of the plain menu column — and the coin store itself became a treasure vault: a warm golden backdrop with a rainbow arc, a pot-of-gold glow, and 3D coins spinning as they rain down, each pack row wearing a coin that fattens with its size, and a celebratory coin burst pours on every purchase.
- **Settings help describes the current setting** — Every help line in the settings now describes only the state the setting is actually in, instead of packing both into one wrapping line — AUTO-EQUIP reads "STRONGER FINDS GO ON THE MOMENT YOU GRAB THEM" when it's on and "STRONGER FINDS WAIT IN THE BAG UNTIL YOU WEAR THEM" when it's off, and the same goes for every other switch and cycled value.
- **Calmer STORE menu row** — The title menu's STORE row lost its spinning coin, sweeping glint, and
  subtitle — it now wears just a soft amber glow so it still catches the eye
  without flashing.
- **Settings help wraps inside the screen edges** — The settings help line now wraps at 80% of the screen width instead of running wall to wall on a portrait phone, and a wrapped tail centres under the line above it.
- **Coins with real depth, calmer store rows** — The COIN STORE's coins are now minted cylinders — two struck faces a
  thickness apart with a milled rim between them — so a turning coin shows its
  edge instead of flattening to a pulsing ellipse; the purchase rows lost their
  sweeping left-to-right glint, and each row's coin now turns at its own rate
  and angle rather than in lockstep.
- **Store labels struck out of gold** — The main-menu STORE row and every coin-pack row now wear their shine IN the
  text: the label is bevelled like struck metal and a specular highlight sweeps
  through the letters themselves, instead of a band of light passing over the
  row.
- **The drop rain notices what you're carrying and what you're short of** — Medkits, repair kits and energy drinks now drop against your actual state
  instead of a flat rate: the more of a kind you already carry the rarer it
  gets — thinning to a trickle on a full pouch, never stopping, so a kit on
  the ground is still bait worth diving a pack for — and the further your
  health, sprint pool or gear durability has fallen, the more of it you find.
  Medkits also drop about half as often at baseline and energy drinks twice
  as often, so stamina is a resource you actually find.
- **HOW TO PLAY callouts read bigger and land on the beat** — The demo's teaching callouts are drawn a size up and wrap at a share of the screen instead of running off it, the consumable lesson is taught the beat before the item is swallowed (so the slot still holds it), the stat-chooser lesson names the occasion and sits above the stat being picked rather than across it, and a new lesson teaches what a level-up is worth: it fills the bars and hurls the horde clear.
- **The world moves a fifth faster** — The hero runs at 67.2 world px/s rather than 56 — 3.4 body-lengths a second,
  about six seconds to cross a phone screen instead of seven and a half — and a
  winded hero now jogs at 0.7 of that rather than wading at half. The whole horde
  was sped up by the same 1.2 so every chase the fights were tuned on plays out as
  before; what changed is the game's tempo, not who wins a footrace. Three new
  DEVELOPER → BALANCE sliders — TEMPO, HERO SPEED and MOB SPEED — turn the same
  dials at runtime, together or one side at a time.
- **A real horde-density ladder** — Each difficulty now fields — and stands — far more of the horde: the crowd on
  screen climbs 50% / 100% / 150% / 200% / 300% from EASY to JESUS instead of
  sitting almost flat across the ladder, and the sidearm hits twice as hard so an
  empty holster is survivable. Leveling pace is unchanged.
- **Campaign leveling lands at 60 again** — Retuned the leveling pace so a full campaign across all five difficulties ends at level 60 (it had drifted to 54), re-read every map's golden-arrow cap off the new curve, and re-aligned the HARD world-drop gate.
- **Coherent item power model** — Weapons now grow damage with item level like armor always did, make quality reaches superior/perfect within the real campaign, affix values roll in ilvl-gated generations with authored ceilings instead of scaling without bound, and each difficulty now drops strictly better loot than the one below it.
- **Live drop pools on every rung** — Later maps now keep dropping every earlier stage's weapon and gear bases, elite-grade work starts appearing from nightmare instead of only the endgame, the opening map has wearable level-1 clothes, and medium pays a small drop-volume bonus — so every stretch of the campaign has fresh upgrades in its drop window.
- **Mercy tapers instead of vanishing** — The mercy system now tapers geometrically down the difficulty ladder — hard keeps a whisper of help and nightmare a ghost, instead of everything vanishing in one step after medium (JESUS stays absolute zero) — and medkits heal a fifth of your grown health bar instead of a flat 35 that faded into noise.
- **Powerups, medkits, and dings scale with the campaign** — Powerup damage now grows with your level exactly as the horde's healthbars do (and INTELLIGENCE deepens it, widening the stasis field too), medkits come in D2-style tiers — light, standard, large, superior — with bigger kits dropping off deeper content, and level-ups grant more stat points the higher you climb (one extra per ten levels).
- **Slower, denser horde pacing** — The player and starting blaster are slower, monsters crawl but always converge with a dozen-plus on screen (and walking stirs more awake), the character no longer shoots at off-screen ghosts, jump shots leave from the player's height, MOON'S BLADE is guaranteed within the first 100 kills, and drops flow more freely.
- **The game is now "Gone in Space"** — The game has a name and a story-first identity: Gone in Space — survive the search for your lost love. Title screen, PWA manifest, and social previews all follow.
- **Compact modal close buttons** — The inventory, map, and shop panels no longer end with a huge full-width CLOSE bar; the dismiss button is now a compact control parked in the panel's bottom-right corner.
- **Queued pickup cards** — Bag-gear pickup cards now queue and show one at a time instead of the newest replacing whatever was on screen, so a burst of loot no longer flash-hides earlier finds — each piece gets its own turn. Ordinary cards show for half as long while a backlog waits behind them so the queue drains quickly, while a better find (an upgrade at or above the worn piece for its slot) lingers longer for a proper look and a chance to tap-to-equip.
- **Golden arrows now grant XP** — The golden arrow pickup no longer sharpens the held weapon — it grants XP worth a fixed share (25%) of the current level threshold, so arrows keep triggering level-ups at any level instead of fading into noise.
- **Level-ups restore full health** — Reaching a new level now heals the player back to full HP.
- **FF6-style windows, a bag slot, and a roomier character modal** — Every dialogue box and modal now wears a subtle FF6-style window skin — a rounded "pipe" frame over a dark-grey gradient — matching the HUD, and dialogue lines no longer overlap. The character modal tucks the stat sheet behind the portrait (hover or tap it) so a bigger bag grid of smaller cells owns the screen, and a new **BAG** equip slot holds a **BAG** item that adds two inventory cells (the first of a family). The level-up info panel wraps to fit a vertical phone and closes when you tap outside it.
- **Map modal pins are pixel icons** — The level map now heads its modal with the treasure-map chart and marks the run's story with pixel-icon pins instead of colored dots — a teal "you are here" pin, a story dossier, a loot gem, an elite star, a boss skull, and a merchant coin — mirrored in the legend, drawn above the fog at a legible size regardless of how zoomed-out the level is.
- **The hero starts with the crude sword, not the blaster** — The default starting weapon is now the CRUDE SWORD — the melee blade that hangs on the wall in the prelude and the one thing the hero takes off it to go save Ada. It hits 20 damage, strikes a single foe per swing until INTELLIGENCE earns it a cleave, and — unlike the old sidearm — carries durability and wears out, so the run's first job is to scavenge something better. The BLASTER is now a weapon you find on the moon rather than the loadout you land with, and it remains the unbreakable fallback when a weapon shatters with an empty bag.
- **Drop the rare-loot map pin** — The level map no longer pins rare-loot finds — the RARE LOOT marker and its legend entry are gone (story, elite, boss, and merchant pins remain), and the modal's level-name title is now vertically centered on the treasure-map chart icon.
- **Cutscene dialogue waits for your tap** — Cutscene text now floats over the bottom of the scene instead of pushing the stage up, and each line holds until you tap before the story continues — Final Fantasy style.
- **Touch controls reworked** — Touching the screen now anchors a virtual joystick under your finger — drag in any direction to walk that way, release to stop; subtle arrows show the directions and a tap (including a second finger while steering) jumps.
- **New bloody-moon app logo** — The app icon, favicon, and social-preview card now show a blood-red moon dripping onto the void — matching the game's lunar survival theme — replacing the old ship-and-radar mark.
- **Loot glows and hovers** — Dropped loot now floats with a gentle bob and a warm glow halo, so pickups stand out from static ground decor at a glance.
- **Sprite atlas loading** — All in-game sprites now ship as a single atlas texture fetched and decoded once instead of ~200 individual images, shrinking the download, the offline precache, and load time.
- **Walls hide you, ghosts don't care** — Monsters no longer aggro through walls the player can't jump over — waking on proximity needs line of sight, ghostly moon mobs excepted: they sense (and drift) straight through stone, including the new boulder ridge walls raised across the moonscape. Packs also squeeze 20% tighter, so a kited horde bunches into one clump.
- **Slower, throttled walk** — The hero walks about 30% slower, and his pace now scales with how far the dpad thumb (or desktop cursor) is pushed from center — a gentle nudge creeps, a full push runs.
- **Level-agnostic difficulty taglines** — The difficulty menu taglines now describe the difficulty itself rather than the moon, so they read correctly on every level of the campaign.
- **Powerup dock and HUD redesign** — Carried ability pickups now bank into three big, thumb-sized powerup slots in a bottom corner (oldest on the left, filling rightward) — tap a slot to spend exactly that powerup and the rest slide down, so you choose the moment each power fires. The HUD was reworked for mobile-first play: a full-width XP strip with a level badge, always-visible HP and weapon-durability widgets, a centered run clock and foe counter, and the hero avatar (top right) as the inventory button in place of the old BAG button. Items default to manual use everywhere, and a new SETTINGS → CONTROLS toggle mirrors the powerup dock to the lower-right corner.
- **Slower base fire rate and a denser opening** — Ranged and magic weapons — the starting blaster most of all — now fire noticeably slower out of the box, and SpaceZ HQ opens with a thick crowd of staff packed around the spawn instead of a sparse trickle, so standing still no longer clears the horde for free. A build wins the fire rate back by investing in attack speed (see the stat overhaul in this release). On MEDIUM a stationary player is overrun within about 20 seconds on both levels, and sooner on higher difficulties.
- **Finds bank to the bag by default and upgrades glow** — Auto-equip is now off out of the box: picked-up gear banks to the bag instead of being worn on the spot, and any bag piece that beats what you have equipped glows gold in the inventory to draw your eye. Turn auto-equip back on under SETTINGS → CONTROLS to wear stronger finds automatically.
- **Accurate level-up stat descriptions** — The level-up chooser now describes what each stat really does, and a new (i) button opens a panel with the full per-stat breakdown for when the short blurbs aren't enough.
- **Fewer powerup drops** — Ability powerups drop less often and the overall loot rain is a touch lighter, so the field no longer buries the first level in pickups. Powerups can be set to fire the moment they are picked up under SETTINGS ▸ CONTROLS.
- **2× scaling on desktop** — Large screens now render the whole game at 2× the mobile baseline — the world zoom and the DOM UI (HUD, menus, and pixel text) scale together — so the phone-tuned interface stays legible on desktop instead of shrinking into the background.
- **Stat overhaul — clearer roles for STR / DEX / INT** — Each stat now owns a distinct axis instead of every combat stat scaling one weapon class. **STRENGTH** raises the damage of all physical weapons (melee AND ranged) and widens the carry bag (each point adds a slot on top of the new 3-slot floor). **DEXTERITY** speeds up attacks for all physical weapons (melee AND ranged). **INTELLIGENCE** powers magic weapons (their damage and speed), lengthens every weapon's range, and widens the melee AoE cone — a bigger swing area that cleaves more of the crowd — plus the magnet's pull. SPEED, LUCK, and HEALTH are unchanged.
- **Unified top-left vitals unit** — The hero avatar has moved to the top-left and now shares one framed panel with the HP bar, the weapon slot, and the durability bar — matching the bordered clock/foe unit in the center — so the run's vitals read as a single cluster instead of scattered corners.
- **Melee cleave now hits two foes until INT widens it** — A melee swing no longer strikes every monster in its cone — it lands on the two nearest by default, and each point of INTELLIGENCE raises that cap by one. Widening the cone still lets a swing _reach_ more of the crowd; INT is now what lets it actually _cleave_ them, so a wide STRENGTH sword stops clearing the whole horde for free.
- **Slower base weapon cadence — earn the fire rate with DEX / INT** — Every weapon now swings and fires more deliberately at zero speed-stat, so a fresh character is no longer a turret. Investing in the weapon's speed stat — DEXTERITY for physical weapons, INTELLIGENCE for magic — buys the fire rate back, making an attack-speed build feel earned rather than automatic.
- **Looted weapons hit for half** — Every **looted** weapon now deals **50% less** damage, so a scavenged basic weapon is a measured edge rather than an instant horde-melting power spike. Your starting sidearm — the tuned baseline the difficulty ladder is calibrated on — keeps its full damage, so the opening fight feels the same while picked-up gear no longer trivializes the run.
- **RAMPAGE runs ten stages and tracks your output** — The menace/RAMPAGE meter now climbs to **ten stages** (was five) and heats from your **rolling damage-per-second and kill rate** rather than a flat per-kill tick — the harder and faster you are actually clearing, the faster it escalates, and an overpowered **overkill** still jolts it on the spot. The extra headroom means a player who keeps pushing their output climbs into stages the old meter never reached, where the lured, evolved horde stacks into a wall.
- **Inventory UI redesign** — Compact Diablo-style item slots, a character portrait above the equipment slots, and WoW-style item tooltips that appear on hover (desktop) or tap (touch) in place of the fixed item viewer.
- **Rampage only fires when you're genuinely overpowered, and scales with difficulty** — Retuned the **menace** (RAMPAGE) meter so it reads how _overpowered_ you are rather than raw combat output. Overkill now counts in **healthbars wasted** (damage past the mob's max hp, relative to it) instead of absolute points, so fair, level-appropriate kills barely register while one-shotting a mob for several times its health escalates fast. An **early-game warmup** damps the meter until you've leveled up a few times, so a fresh hero can no longer trip a rampage in the opening levels. Each difficulty now sets how touchy the meter is: **EASY** barely reacts (a rampage is practically impossible even for a maxed build), **MEDIUM** answers only a truly dominant run, and each harder rung is more sensitive up to **JESUS CHRIST!**, where a handful of kills is enough.
- **Same-weapon pickups refresh durability** — Picking up a copy of the weapon you already wield now switches to it when it has more durability left, banking your worn copy as a spare instead of leaving the fresh one on the ground.
- **Level select unlocks after beating a difficulty** — New players are walked straight through the story: choosing a difficulty drops you into the next unbeaten level rather than a level picker. The mission select only opens once you have cleared the whole campaign at that difficulty, so it becomes a replay menu.
- **Cutscenes always play** — Story cutscenes now play at the start of every run instead of only the first time, with a SKIP button in the top-right corner to dismiss them.
- **Same-weapon pickup on a full bag replaces your weapon** — Grabbing a fresher copy of the weapon you already wield always swaps it in now: with room in the bag the worn copy is kept as a spare, and with a full bag the worn copy drops to the ground — just like dropping your current weapon to pick up the new one.
- **Sprite-styled update prompt** — The "a new version is ready" prompt is now a sprite-based panel — pixel font, the upgrade sprite, and chunky pixel buttons — so it matches the game instead of the framework's plain system-font toast.
- **Broader update prompt with side arrow** — The "a new version is ready" prompt now places the upgrade arrow to the left of the text in both portrait and landscape, and the portrait panel is broadened so the copy and buttons breathe.
- **Powerups read as electric-blue** — Powerup pickups now glow blue on the ground and in the dock, the banked-powerup slots have an electric-blue background, activating a powerup plays a bright power-up flourish, and the storm powerup's icon is a proper lightning bolt.
- **Livelier high-score controls** — The high-score board's difficulty and ranking are now tappable labels that
  cycle on click (the chevron/▲▼ arrows are gone), the ranking type is larger,
  both drift gently to read as live controls, and asteroids occasionally streak
  across the title backdrop.
- **Powerup dock and stamina tuning** — The banked-powerup slots now sit on a darker blue and shrink to half size on portrait phones so they stop crowding the screen, and stamina drains ~25% slower so a run lasts longer before the winded half-speed jog.
- **Kill counter shake** — The status bar now shows just the kill count (the total mob count is gone), and the tally shakes on each kill — harder when several mobs are downed within a second.
- **Intro dialogue redesign** — Each level now opens on the hero's monologue — a black-screen dialogue with the hero standing above the box, crawling in letter by letter — then flashes the level name alone before dropping into the run; the prelude cutscene's lines crawl in the same way, both carry a SKIP button, and skipping the prelude skips the monologue too.
- **Repair kits mend armor, discard equipped gear** — Repair kits now top up a worn suit's plating to full alongside the weapon's durability, and an equipped suit or charm can be discarded by dragging it out of the character sheet onto the ground.
- **Pickup feed contrast** — The lower-right pickup feed now reads cleanly on the bright floor (a dark outline behind each line), and the "PICKED UP" prefix is always neutral — only the item name is colored, and only for special items (magic/rare/… gear and plot pieces); ordinary loot stays neutral.
- **Lab-rat reveal moved to the MUSKRAT meeting** — The intro no longer spoils that the drive ingredient was eaten; MUSKRAT now owns that reveal when you meet him.
- **Crits scale off DEX / INT; STAMINA now grows max HP** — Critical hits now ride the stat that matches the weapon: **DEXTERITY** lands crits for physical weapons (melee & ranged) and **INTELLIGENCE** for magic, while **LUCK** only nudges crit up marginally (a quarter of a primary point) on top. **STAMINA** now also raises max HP alongside the sprint pool, so a hardy hero is a sturdier one. The CRUDE SWORD is now the weakest weapon — a shorter reach and tighter cone — and any weapon you pick up is a strict upgrade over it; INTELLIGENCE grows the sword's reach, cone, and cleave count as before.
- **Gentler speed scaling and a true-to-hit AoE cone** — The weapon SPEED stat (DEX for melee/ranged, INT for magic) now quickens attacks about half as fast (+2% cadence per point instead of +4%), so pumping it sweetens fire rate rather than dominating a build. Melee swings now draw the exact area they strike — a filled cone from the player out to the weapon's true reach spanning its full arc — so the slash effect matches the hit geometry instead of a thin rim line.
- **The crude sword swings slower** — The starting CRUDE SWORD is now a slower, heavier swing — the unbalanced wall blade is harder to bring back around, leaning on DEXTERITY (or a real weapon) to earn the tempo back.
- **The horde scales to your level** — Regular enemies now toughen as you level up — more health (and, since kill XP tracks health, more XP), and richer loot to match — so leftover levels no longer turn the swarm into a walkover. This is a steady progression floor on top of the existing menace system, which still answers a moment-to-moment rampage with an evolved, lured crowd.
- **STRENGTH hits harder, but weighs you down** — **STRENGTH** now raises physical (melee & ranged) damage more steeply than INTELLIGENCE raises magic damage — raw firepower is STR's one payoff, so a bruiser out-hits a mage per point. In exchange, every point of muscle **slows your walk** a little (floored so a pure-STR build still moves), so STRENGTH and SPEED now pull against each other instead of stacking for free.
- **White stamina bar** — The HUD stamina bar is now white instead of cyan/blue.
- **SpaceZ monologue on sight** — The hero's SpaceZ HQ inner monologue about the fully staffed night shift now plays the moment he first sees an intern, instead of after his first intern kill.
- **Moon haunting monologue in two beats** — The moon's haunting monologue is split into two ordered beats: the hero reacts the moment he first sees a wisp, and again when he downs his first one.
- **Welfare-era intro beat** — The SpaceZ HQ opening monologue now notes the hero and Ada are on welfare like everyone else replaced by AI — but at least there's Webflix.
- **Snappier SpaceZ HQ opening** — Reworked the SpaceZ HQ opening for flow and pace: a tighter, less repetitive intro monologue and first inner monologue, and the movie-night prelude now sits the couple side by side on the sofa watching the TV before Ada heads out.
- **The difficulty ladder turns every knob** — Difficulties now differ across the whole run, not just monster counts: a stat head-start on EASY, flatter mob counts with a RELATIVE monster level per rung (EASY fields mobs three levels under you, JESUS two above — the gap never closes), thinner medkit/armor/powerup drops and richer rare/epic/legendary rolls up the ladder, a faster stamina burn, fading dodge/hit rates, and a rampage meter that triggers easier, cools slower, and hits harder on the top rungs.
- **Asteroids bite by difficulty** — Asteroid strikes in THE RIFT now take a difficulty-scaled bite of the hero's health — 20% on EASY up to 75% on JESUS — and the first rock to land pauses for a new inner monologue warning him to watch out for them.
- **Twinkling title stars** — The main-menu starfield now has a few stars that blink on their own out-of-sync cycles, so the sky feels alive instead of static.
- **Diablo-style weapon & loot rework** — Loot is now Diablo-shaped: every level introduces five themed base weapons with level requirements (earthly arms at SpaceZ HQ, 70s hardware on the moon, AI-forged weapons on Mars, historic and fantasy arms in the rift — including shotgun spreads, piercing rails, homing darts, and chain lightning), item tiers unlock by monster level (magic 5, rare 10, unique 15, legendary 25), drops carry an item level that sizes their magic bonuses, and bosses pledge per-tier drops that can exceed 100%.
- **Visual-novel dialogue box and richer scene controls** — The "tap to continue" hint is gone from cutscenes, level intros, and in-world dialogue, and the in-world dialogue box is now a visual-novel layout — the speaker's face fills a full-height portrait panel beside the line, within the box's existing footprint. On desktop, **Space** or **Enter** turns the page through any scene (the first press finishes the letter crawl, the next advances), and **Escape** now both skips a running scene and pauses/resumes the live run alongside **P**.
- **Weapon damage rebalanced to a level budget** — Every weapon's damage now follows an effective-DPS budget set by its level requirement, so upgrades genuinely upgrade: AoE weapons spread the budget across their targets (cone cleavers hit up to 4, the gravity maul slams all 5 around you, pellets/pierce/chain count the same way) and crit damage now scales with cadence — quick blades crit light (x1.6) while slow heavy hitters crit like trucks (x2.5).
- **Mercy drops on easy and medium** — Easy and medium now throw a struggling player a rope: a packed screen (20+ mobs) starts dropping screen-nuke bombs — up to 5% per kill on easy, 3% on medium — and as your health drains or your weapon nears breaking, medkits, plated armor, and repair kits rain harder. Hard and up get none of this help, so the fight stays as lethal as ever.
- **Empty-slot count on the avatar** — The bag indicator now shows how many empty slots remain on the HUD avatar badge — turning red when the bag is full — instead of counting carried items there and floating a separate number over the hero.
- **Compact big numbers** — Huge run totals (XP, damage) and floating damage numbers now show as compact badges like `2.93M` or `1.2B` instead of raw scientific notation such as `2.925…E+48`.
- **Smoother gameplay at horde scale** — Large hordes, loot-covered floors, and obstacle-dense levels no longer drop the frame rate: the simulation now uses spatial indexes for projectile hits and obstacle collision, and the renderer pre-bakes the ground layer and item glows instead of recomposing them every frame.
- **Menu cursor in cutscenes** — Cutscenes now show the main menu's 16-bit glove pointer on desktop instead of the plain pointer.
- **Main-menu version in the pixel font** — The version and build label in the main-menu corner now renders in the in-game pixel font (a new middle-dot glyph was added to the font atlas) so it matches the rest of the menu instead of the browser's default font.
- **Treasure-map MAP button** — The HUD's MAP button is now a pirate treasure-map icon (torn parchment, dashed trail, red X) sitting directly below the run clock and matching its width.
- **Larger UI subtitles** — Doubled the size of the small subtitle, caption, and hint text across menus and overlays (the title tagline, pause hint, menu descriptions, level-up/respec blurbs, map legend, and in-game hints) so it's legible on a phone.
- **Pickup badge in thumb reach** — The tap-to-equip pickup card now appears in the lower part of the screen, below the hero, so it is easy to reach and tap on a phone.
- **Weapons hit for a damage range** — Every weapon now rolls its damage inside a band around its average instead of landing a fixed number (a weapon written at 10 hits for ~8–12, and crits scale off the rolled value), with wild pieces like the BLUNDERBUSS and SINGULARITY CANNON swinging much wider and precision tools staying tight.
- **Compact weapon damage** — Weapon DPS, DAMAGE, and the character sheet's DMG now use the same compact abbreviations (12.4K, 1.2M) as XP, matching the floating damage numbers.
- **Crit hit shake** — Critical-hit damage numbers now jolt once left-right-center instead of shaking continuously.
- **RETRY resumes at the start of the action** — RETRY after a death now drops the hero back into the moment combat began — past the prelude cutscene, the intro monologue, and the scripted opening strike — instead of replaying the whole opening each time.
- **Powerups count down in their dock slot** — An activated powerup now holds its dock slot and counts down in place with its stopwatch overlay instead of jumping to a separate strip; the slot only frees and the rest shift down once the power lapses, so the dock stays full — and no new powerup can be picked up — while a power runs.
- **Hero's dialogue portrait shows his gear** — The hero's in-world thought bubbles now show his full paper-doll avatar — worn
  armor and held weapon — matching the HUD and inventory portraits, instead of a
  bare-bodied face.
- **Slower leveling curve, level cap 99** — Reworked the XP curve so leveling is paced in kills-per-level — a quick first ding, then a smooth taper — so gear stays relevant instead of being outleveled in a day. Playing through all five difficulties lands you around level 60, leaving the climb to the new level cap of 99 as the grind endgame.
- **Title menu first, hero select after PLAY** — The game now opens on the title menu instead of the character roster — PLAY opens hero select (pick or create) only when needed, then drops straight into the difficulty ladder.
- **Softcore death keeps your progress** — Dying in softcore now keeps the levels, stats and items you earned — you just restart the level or exit to the menu. Only hardcore death retires the hero for good.
- **Legendary drops start on Hard** — Legendary items now begin dropping at monster level 40 (the Hard difficulty band) instead of mid-Normal, making them a rarer late-game find — groundwork for the coming boss-specific unique items, which can carry a small scaling stat bonus (e.g. +3% strength) that grows with your hero.
- **Readable pickup badge text** — The pickup badge shows the item name at full size again and enlarges its status line (UPGRADE / EQUIPPED / TAP TO EQUIP) to match, so both read clearly.
- **Deep kills drop stronger bases** — Loot now scales its base with where you kill it: a monster more than 15 levels above a base item retires it from the drop pool, so high-level fights stop dropping weak low-tier bases (a low base with affixes on it is still a weak item). Early game is unchanged — the whole pool still drops until you outlevel it.
- **Pickup badge wraps long names** — Long item names on the pickup badge now wrap onto multiple lines and the badge grows taller to fit, instead of stretching wide and running to the card's edge.
- **Golden arrows taper and thin out on harder difficulties** — Golden XP arrows now pay a shrinking share of the level bar as the hero climbs (a full quarter-level early, a thin sliver near the cap) and drop more seldom up the difficulty ladder — never on JESUS — so free levels fuel the onboarding without racing the whole campaign; the leveling-curve calculator now folds the arrow faucet into its pacing model.
- **Retune the leveling curve so the campaign lands at ~level 60** — Raised the kills-per-level base now that golden arrows are counted in the pacing model, so a full playthrough across all five difficulties leaves the hero around level 60 (leaving the rest as the grind-to-cap endgame) instead of overshooting toward 68.
- **Stronger unique item bases** — Re-based the named uniques so each sits on a grade-appropriate base (equip
  level ~20 below its item level), giving high-level uniques the armor and
  damage their tier deserves.
- **Unique item levels now follow a defined power model** — Every unique's `ilvl` is now derived from its base level plus the ilvl-worth of its fixed bonuses (priced off the live combat constants), so drop odds and power reflect a piece's real strength; four intentional scaling "keeper" uniques are marked as such.
- **Varied asteroid speeds on the title screen** — Title-screen asteroids now cross at randomized speeds — from a lazy drift up to a quick streak, rerolled each fly-by — so the menu backdrop feels more natural.
- **DATA submenu for character transfer** — EXPORT and IMPORT CHARACTER moved out of the top-level SETTINGS list into a new SETTINGS → DATA submenu, keeping the settings menu short.
- **Faster initial load** — The playable game screen and the engine renderer it pulls in now load on demand once a run begins, instead of shipping in the entry chunk — shrinking the critical-path JavaScript the browser must fetch and parse before the title menu appears.
- **Merchant shows full item stats** — The merchant's detail bar now shows the selected item's full stat card — icon, name, DPS, damage, and affixes with upgrade/downgrade deltas versus your equipped gear — instead of a bare name, and the sell button drops the redundant "SELL" word.
- **Sound submenu and menu polish** — Music and sound-fx volume now live together in their own **SOUND** submenu
  under SETTINGS instead of two loose rows. On narrow / portrait screens a long
  menu blurb wraps to a second line rather than shoving the menu (and its
  selection cursor) off the edge, and the developer ARSENAL viewer gives its
  item list and detail card fixed heights so the card no longer resizes as you
  switch items, with the BACK button dropped to the bottom for more room.
- **Steady merchant window** — The merchant window now holds one stable size instead of growing and shrinking as you select different items, and long item names in the detail card wrap cleanly (stacking the card above a full-width deal button in portrait) instead of clipping.
- **Warp picker now selects difficulty too** — The developer menu's SELECT LEVEL warp picker now walks through the difficulty ladder first, letting you pick any difficulty — even locked ones — before choosing a mission, so you can drop into any level at any difficulty regardless of unlock progress.
- **Full UI pass over every screen and modal** — Every screen, modal, and popup got a fit-and-finish pass: the end-of-run
  splash, title sub-menus, and HOW TO PLAY no longer clip on landscape phones
  (tall content scrolls, the stats fold into a two-column window); the
  achievements, arsenal, update prompt, hero-creation form, and help pane now
  wear the same FF6-style window skin as the rest of the game; the level-up
  info breakdown folds to two columns in landscape; and small-but-essential
  labels (shop headers, EQUIPPED/STATS, CLOSE buttons) are larger and readable.
- **Inventory tooltips** — Inspecting a bag item now also raises the worn piece's full stat card (marked EQUIPPED, with its icon beside the name), and tooltips never cover the item icon that raised them, so the equip tap stays visible.
- **Item cards reworked, unique finds shine** — Unique and legendary items now glow in the inventory, shop, and arsenal grids and on their item cards, and every magic-or-better card names its quality tier at the foot. Item cards also got tighter: the weapon-class line is now a glyph beside the name (sword/reticle/spark), the item level moved to the lower right, and the REQUIRES LEVEL line color-codes how current the piece is (red above you, yellow current, green recent, grey outgrown).
- **SpaceZ HQ art pass** — Redrew the six weakest-reading SpaceZ HQ sprites: OPTIMUSK (a bigger heavy robot), THE JANITOR (mop and bucket), THE ARCHITECT (a legible half-machine), the office desk, the vending machine, and the HAZMAT TECH (a bulky suited tank).
- **Golden arrows are a rarer catch-up drop** — Golden XP arrows now drop about once every fifty kills (down from ~one in twenty-four) and act as a catch-up faucet: they pay a share of your next level only while you're under-levelled for the map, then go cold — a handful of kills' worth — once you reach the level a normal run of that map and difficulty leaves you at, so grinding old ground can no longer over-level you.
- **Slot glyphs on item cards** — Item cards now show what a piece IS as a pixel glyph in the lower-right corner beside the item level — a weapon's class (sword/reticle/spark) or a gear piece's slot (helmet, vest, pants, boot, clover charm, satchel) — replacing the "HEAD ARMOR"-style headline row and the glyph's old spot beside the name.
- **SpaceZ HQ wall & door art** — Redrew SpaceZ HQ's wall and locked-door tiles: the flat wall block is now a recessed steel lab panel with a bevel and corner bolts, and the locked door is a sealed blast door with a bold red maglock.
- **Eastworld art pass** — Redrew the five weakest-reading Eastworld sprites: the cowbot, saloon brawler and tin outlaw hosts now read as distinct robot cowboys (greeter, bruiser, masked gunslinger), the longhorn is a looming iron-steer heavy on a bigger canvas, and the park gate is a legible signed EASTWORLD billboard instead of a plank table.
- **Sharper Mars sprites** — Redrew the four weakest-reading Mars sprites: the MINING ROVER now looms as a tracked drill rig instead of reading like fodder, the SCOUT ROVER reads as a clean camera-on-wheels, the FEMBOT is an uncanny kiss-blowing android in a nightgown, and the TERRARIUM shrine is a carved lizard-god idol with its gold tithe.
- **The Rift's worst-reading sprites redrawn** — Redrew the five weakest-reading sprites in THE RIFT: the graviton now looms as a heavy collapsed star (it is the tankiest minion), the unraveler reads as a chromatic-aberration glitch, the voidling as hungry dark with too many eyes, Harry Houdini as a chained top-hatted escape artist, and Nikola Tesla wreathed in lightning.
- **Moon art** — Redrew the moon obstacles and two elites: the moonrock slabs now read as chiselled lunar stone, THE PROSPECTOR wears a headlamped hard hat and carries a pickaxe, and THE CARTOGRAPHER holds a survey chart.
- **Clearer item & weapon icons** — Redrew three weak-reading inventory icons: Seagull's ponytail (now a tied,
  swept ponytail), the lucky charm (a gem amulet instead of a bare crescent),
  and the railgun (a heavy twin-rail cannon instead of a striped stick).
- **Camping stops the horde; the map never goes empty** — Holding the same ground now starves the spawner after a grace period — the horde stops coming and a slow trickle arrives from the objective's direction to lure you onward — while boss levels keep a thin endless straggler stream flowing once the wave budget is spent, so the map never feels dead.
- **The rampage never takes a break** — The menace evolution stage is uncapped and ratchets permanently: a horde whose current crop keeps getting one-shot evolves to the next stage (one per round) and never devolves, on every difficulty — easy just takes smaller steps. Evolved (malice) mobs now pay more XP but roll worse loot tiers.
- **Overkill pays less; mobs level to your gear** — A killing blow beyond a mob's full health pays proportionally less XP and loot (2x the bar earns half, 3x a third), and the horde's level now follows your power — character level or total equipped item level, whichever is higher — so farming mobs far beneath you is no fun on purpose.
- **Mob level answers real weapon damage** — The horde's level now also tracks the equipped weapon's calculated per-blow
  damage (stats, damage% affixes, quality, and crits included), so an absurd
  damage roll meets tougher, better-paying mobs instead of one-shotting a crowd
  priced only by character level and gear ilvl.
- **Weapon switcher ordered by item level** — The Q weapon menu and the 1-4 hotkeys now list carried weapons by item level
  (highest first, ties broken by dps), so "1" always picks your top-ilvl weapon.
- **Loot gates key to character level only** — The monster level that gates drops (bases, tiers, item level) now keys to
  the character level alone: over-budget weapons and twink gear toughen the
  horde and pay more XP, but never sweeten the loot — one hot find can't roll
  itself an even better successor.
- **Cleaner item cards** — Item cards now line the weapon icon up with one row of the name, colour stat titles white with light-grey values, seat the item level more evenly at the card foot, and show the icon on every item card — not just equipped ones.
- **SpaceZ HQ art pass** — Redrew five weak-reading SpaceZ HQ sprites: DR. NOVA (a hooded cleanroom vault-keeper cradling the alien engine core, now distinct from the lab-scientist minion), the INTERN (a lanyard ID badge), the PROPULSION ENGINEER (a readable hi-vis vest and hard hat), the LAB SCIENTIST (a structured lab coat), and the cargo CRATE (a sealed crate with corner brackets and a rocket stencil).
- **Moon art** — Redrew the five weakest remaining moon-level sprites: the WRAITH is now a hooded red-eyed specter, the impact craters are shadowed bowls instead of hollow rings, the WISP is a rising dust-spirit, and the QUARANTINE MEDIC wears a surgical mask.
- **Tighter enemy contact hitboxes** — Enemies must now press genuinely into the hero before their touch does damage — the contact reach is pulled in a little under the bodies' touching distance — so a last-instant sidestep is a clean escape rather than a graze that still connects, making heroic escapes more possible.
- **Redraw the three worst-reading Mars sprites** — ELON MOSQUE now reads as a smug tech-billionaire (aviator shades and a gold dollar sign instead of a chevron that mimicked the hero's logo), the SERVO UNIT reads as a clear tread-based service robot, and PETER SEAL reads as the pale, unblinking, cold-blooded lizard-tithe-keeper.
- **The Rift's aviator, mad monk, and star jelly redrawn** — Redrew three of THE RIFT's weakest-reading sprites: AMELIA EARHART now reads as a WWII aviator (leather flight cap, brass goggle lenses, sheepskin collar, streaming scarf) instead of a generic figure, GRIGORI RASPUTIN looms as a heavy hooded mad-monk with burning eyes, a grey beard, and a gold Orthodox cross that separates from the void ground, and the STAR JELLY gains a glowing star core and flowing gradient tentacles.
- **Elites and bosses give a real chunk of a level** — Elite and boss kills now pay XP as a SHARE OF THE HERO'S CURRENT LEVEL BAR (elites ~12%, bosses ~20%) instead of a small hp-proportional lump, so a set-piece kill visibly lurches the XP bar the same noticeable amount on every map and difficulty — and because the reward reads the live level, it can't go stale as the hero out-levels a map, while the per-map XP cap still fades it to nothing on outgrown replays so boss farming never over-levels.
- **Diablo 2 loot system** — Loot now resolves in two Diablo 2 stages — a weighted TreasureClass base pick (with an explicit NoDrop gate and per-base drop weights) and a rarity roll whose per-tier odds climb with depth and scale with Magic Find (reusing LUCK and the companion aura, with diminishing returns on the top tiers); named uniques and legendaries fold into that roll by their own per-item weight, the loot gates key off the hero's earned level (the difficulty's mob-level offset no longer decides which tiers drop, so EASY drops richer relative to its mobs), and elites and bosses now drop world relics during the normal campaign.
- **Softer menu scrolling** — The title menu and its sub-pages now fade rows in and out at the top and bottom scroll edges instead of clipping them in with a hard line.
- **Reworked named-item drop economy + ARTIFACT tier** — Uniques, legendaries, and the new ARTIFACT tier now drop through one global rarity roll tuned as a real chase: a rift → bunker farm run yields about one unique and one legendary per ten runs, and drops scale with your level (a level-99 farm pays out only high-item-level gear, never the campaign's low-level relics). Legendaries and artifacts drop from HARD up, gated by each item's required level so cap-level pieces need a cap-level hero, and the bunker is the best farm at 2× the rate. Artifacts are the super-epic level-99 endgame chase, rarer still.
- **Medkits heal a share of your bar, and drop far more often** — Medkits now heal a **percentage of your max HP** instead of a fixed number, so a kit stays a real top-up at every level rather than decaying into a scratch: **LIGHT mends 30%**, MEDKIT 50%, LARGE 75%, and a SUPERIOR is a full heal. Medkits also drop **much more often** — healing is meant to be a reliable resource you find and spend deliberately, not a lucky crutch — with the deeper kits still gated to deeper content and the low-health mercy boost layered on top.
- **Crit damage scales with your class stat** — Critical hits now hit for a flat ×2 (physical) or ×1.5 (magic) base with no per-weapon crit stat — STRENGTH deepens melee crits and INTELLIGENCE deepens magic crits, and a magic single-target crit bursts a small INT-scaled AoE blob, so magic builds finally pull their weight.
- **Parallel starting difficulties** — Easy, medium, and hard are now parallel starting lanes — all open from the first launch, over the same missions and hero-level band, differing only in how much help each gives. Beating any one opens nightmare, then jesus, cutting the campaign to the level cap from five playthroughs to three; leveling is retuned (about twice as fast through the campaign band) so the critical path still lands the hero near level 60. Boss and world uniques for the three lanes are merged into one shared bottom-tier pool per boss/level, so whichever lane you play can drop any of them.
- **Bombs no longer beget bombs** — A nuke blast's kills can no longer drop another nuke, and only one nuke can sit in the powerup dock at a time — a second pickup stays on the ground and the merchant refuses the sale.
- **D2-style rarity item-level ladder** — Item power now sits a rarity-scaled margin above the level where it drops, D2-style: rolled MAGIC finds roll a hair over the loot level (+0-2) and RARE a clear step over (+3-5); every bottom-tier boss and world UNIQUE is re-pitched to about ten levels over where you now reach its level — so early drops land as level-appropriate upgrades you grow into, instead of dropping too weak or barely at all — and the named LEGENDARIES are normalized to about twenty levels over their equip requirement, keeping their signature procs and spells. SENTINEL'S GREAVES, which outgrew the bottom tier, moves to the nightmare rung.
- **Hardcore campaign high scores** — High scores are now hardcore-only and span a whole campaign — foes felled, survival time and peak menace summed across every map of a difficulty and banked when the campaign is beaten (SURVIVED) or the hero falls (FELL); the survival clock only ticks while a fight is live (a foe on the field, or within two seconds of the last kill), so a cleared field can't be milked for time.
- **LOAD drops straight into your current level** — Loading a hero mid-campaign no longer stops at the difficulty picker — it resumes at the beginning of their current level on the difficulty they are already on. The difficulty ladder now appears only for a fresh hero (to pick a starting lane) or one who has beaten their difficulty (to step up a rung).
- **Arsenal shows the in-game item card** — The developer ARSENAL viewer now inspects each piece through the very card the
  in-game inventory raises — full-size stats, no arsenal-only layout and no
  compare hints. Vertical phones show only the list and pop the card up on tap;
  wide screens dock it beside the list.
- **Artifacts are a strict level-99 chase** — Artifacts now require character level `min(99, ilvl)` — level 99 for the whole roster — to equip, and the artifact tier drops ONLY once the hero reaches the level cap (99, reached only on JESUS), so a relic falls exactly where it can be worn.
- **Level-scaled stat cap** — Stats now cap on a ceiling that RISES with level (the raw a full spec would reach, all chosen points in one stat) up to a hard cap of 250, instead of the old fixed diminishing soft cap — so one stat can truly dominate the endgame and gear that lifts your main stat keeps paying off. Chosen points are linear up to the cap (the chooser won't let you place past it); gear pushes further on a gentle diminishing tail. Crit, dodge, and armor reduction now saturate toward sub-100% ceilings so a 250-high stat can't reach a degenerate certainty, and rolled affixes gained two endgame generations (ilvl 70/88). Auto-stat growth is now off by engine default (matching the shipped app), and the analytic progression sim reports the mob-side read (TTK, blows-to-kill, survivability, and the sustained menace stage).
- **Capped maps trickle XP instead of stopping it** — Farming a map past its intended level now pays a small, never-zero XP trickle rather than stopping cold at the cap, and the hero mutters a recurring inner monologue — "these enemies are pathetic, I should hurry and find Ada" — in several rotating variations while he over-farms.
- **Menace works at endgame — mobs lag-follow hero damage** — The horde now tracks only a fifth (`MENACE.damageLevelTracking`, 0.2) of the hero's weapon-output excess over their character level, instead of matching it 1:1. A full match pinned time-to-kill flat and stopped a strong build from ever OVERKILLING — which starved the menace (RAMPAGE) evolution ratchet, so the endgame never actually ramped. Now a geared hero pulls ahead of the base horde hp and the ratchet climbs (a level-99 spec reaches menace stage ~5 in seconds of slaughter, and better gear pushes it higher). A new **MOB DMG TRACK** developer-balance knob (`mobDamageTracking`) tunes it at runtime: 0 decouples toughness from weapon output entirely (maximum rampage), higher chases the hero's dps harder.
- **One mercy rescue at a time** — Mercy drops no longer pile up: while the rescue a distress signal already threw (a medkit, repair kit, energy drink, screen-nuke, or plated suit) lies un-collected within view, that signal holds fire instead of raining more — picking it up or leaving it behind re-arms the rope.
- **Only one NUKE ever drops at a time** — A nuke never drops while you already hold one in the powerup bar, nor while an un-collected nuke still sits on screen. Once the waiting nuke drifts off screen (and none is docked), it is swept away so a fresh one can drop where the fight now is.
- **Repair kits drop more often** — Weapon repair kits now turn up more often in the drop rain, so a good weapon is easier to keep alive through a run before it wears out and strands you on the sidearm.
- **Static damage numbers** — Damage numbers now stay pinned on the victim instead of floating up — only XP rises. Crits still slam in gold and shaking, and now grow with how hard they hit (a glancing crit swells 1.5×, a top-of-band slam 3×) instead of a flat 2×.
- **Independent AoE damage rolls** — A melee swing that cleaves a crowd now rolls each struck foe's damage on its own, so an area hit lands a spread of numbers instead of stamping one figure across everyone.
- **Replays skip story you've already seen** — Dying and retrying a level no longer replays its opening: the prelude cutscene, the hero's intro monologue, and the pinned inner monologues (the SpaceZ scientist, the Mars rover, and the rest) are each shown only once per difficulty, so a die-and-retry loop drops straight into the action. Powerups no longer survive a softcore death — a RETRY starts the level with an empty powerup dock instead of a hoarded stack.
- **Leveling rebalanced for Eastworld** — Slowed the XP curve to absorb Eastworld's extra roster, so a full campaign
  across all five difficulties again ends around level 60 (instead of
  overshooting toward 72), and re-sized the world-drop level gates to sit a few
  levels above each difficulty's new first-pass end.
- **Redesigned the LOAD GAME and NEW GAME menus** — The hero roster is now a column of framed SAVE SLOTS — each with a dressed-hero
  portrait built from that hero's own gear, their level, standing, difficulty
  progress pips, and a HARDCORE / FALLEN badge — instead of plain text rows. The
  NEW GAME create form draws the hero name in the game's pixel font and the
  HARDCORE choice now highlights on hover so it reads as clickable.
- **Slower title-screen asteroids** — Title-screen asteroids no longer streak by at up to 4× speed — the fly-by spread is capped at a gentle 1.5× so they stay easy to follow by eye.
- **Menace peaks per difficulty** — The rampage meter now tops out per difficulty — evolution peaks at stage 3 on EASY, 5 on MEDIUM, 10 on HARD and 100 on NIGHTMARE, while JESUS stays uncapped — so a gentle rung's horde stops toughening once its ceiling is reached instead of evolving without limit.
- **Held weapon shown & swung by default** — The field hero now always shows his held weapon and animates it on every
  attack — a blade whips through its slash, a gun recoils, a wand thrusts on the
  cast — retiring the developer CHARACTER WEAPON and WEAPON SWING toggles.
- **Make quality is now a value range** — Every plain weapon/armor drop now rolls a specific base-value multiplier inside its make quality's band (BROKEN → CRUDE → NORMAL → SUPERIOR → PERFECT), so two SUPERIOR copies of a base swing differently and the bands overlap between neighbours — a good CRUDE can out-swing a poor NORMAL. Unique and legendary items keep their static, hand-authored properties (no rolled affixes or suffixes); only their base damage/armor varies by the standing ±band.
- **RASPUTIN pulses a frost nova, and spared companions stop respawning** — **GRIGORI RASPUTIN is a menace again.** Spared into the party, the unkillable mystic now pulses a **FROST NOVA** — a chilling ring that bursts around him on a cadence, damaging every foe caught in it and **slowing them to a crawl** — turning a plain axeman into the party's crowd-control anchor (the ring rings icy blue, and his companion card reads FROST NOVA). Companion novas are a new `CompanionDef.nova` any recruit can carry.
  
  **A companion you spared no longer re-spawns as an enemy.** Once one of history's missing walks the campaign at the hero's side, its enemy twin is held off the board — you no longer re-fight your own ally on a rift replay — until that companion is gone from the party.
- **Stamina now scales with your pace** — The sprint pool's drain now scales with how fast you move rather than a flat run/walk switch: a bare creep barely dips it, a flat-out sprint burns the full drain, and everything between eases smoothly across — so an analogue touch or mouse push spends the pool in proportion to its pace. Moving always spends stamina; the pool refills only while you stand still.
- **Jumping costs stamina** — Each jump now spends a slice of the sprint pool (10% of max stamina per takeoff), and bottoming the pool out with a run or a jump freezes stamina regen for two seconds — so the hero can't tap-run or tap-jump on fumes and must walk it off to recover.
- **Jumping is a pure dodge** — A jump is now purely a dodge: while airborne you float above the field and can neither swing a melee weapon at the horde nor pick up loot off the ground until you land, and the RIFT's black holes fight the hop — jump near one and you drift toward the core and don't rise as high (ranged and magic still fire from the air).
- **Mob levels, XP, and loot rescaled** — Monsters now spawn at a random per-mob level (−3…+2 around the difficulty
  baseline), mob health and level key to the hero's CHARACTER level alone
  (gear and weapon damage no longer toughen the horde), kill XP is proportional
  to the mob's LEVEL rather than its hp (with a rarity XP multiplier so
  rare/unique/elite/boss kills pay far more), and plain minions drop named-tier
  loot at a fraction of the odds a rare/unique/elite/boss carries — so the
  special fights, not trash farming, are the source of chase gear.
- **Black holes devour the reckless** — The Rift's black holes now drag loose loot in from about a screen away — a
  crawl from the edges, quickening toward the core — hoarding it on the event
  horizon, and getting stuck in a hole's core is instant death. Dashing in for
  the rim loot is a real gamble now. Every hole is pinned on the level map.
- **Level caps no longer bite on a first clear** — Per-map level caps now sit a safe margin above where a single full clear leaves the hero, so killing everything on a map once never reaches that map's cap — the cap only throttles replays; medium and hard also carry two extra levels of farm headroom over easy.
- **Mobs get tougher over the game (geometric hp curve)** — Rank-and-file mob health now scales GEOMETRICALLY with monster level
  (`MENACE.mobHpGrowthPerLevel`, plateauing past a knee) instead of a gentle
  linear ramp, so hits-to-kill RISE across the campaign — a couple of blows early
  climbing toward ~10 by level 60 — rather than collapsing into one-shots as the
  hero out-damages the horde. This kills the "rampage meter pinned at its cap even
  on EASY" problem at its root: the meter only ratchets when the hero genuinely
  one-shots the crop, which no longer happens by default. Kill XP keeps its own
  level-priced ramp, so leveling pace is unchanged, and because the curve is keyed
  to the mob's LEVEL (not the hero's gear) a good unique/legendary still DIPS
  hits-to-kill below the curve. Named drops stay a bounded upgrade (under ~2.5×,
  never 10×, sub-level-99). Tune and verify with the new
  `scripts/mob-hp-curve.mjs` (its `--no-unique`/`--no-legendary`/`--no-sets`/
  `--no-artifact` flags read the hero on normal magic/rare gear).
- **Toned down the strongest low-level named weapons** — Moderated the outsized power of five rare low-level named weapons (HERDBREAKER, THE LAST ROUNDUP, OATHBRAND, THE JAILBREAK, RIFTMAW) by trimming their oversized bonus-damage so they read as strong-but-fair rare finds rather than tier-breaking anomalies.
- **Level-up reveal freeze** — The level-up chooser now pops in with a short reveal and stays inert for a
  beat — the stat buttons dim and an "arming" bar fills — so a stray tap held
  over from steering can no longer spend a stat point by accident.
- **Sharper suited hero sprite** — The suited field hero now reads more clearly on the moon: darker, cooler suit
  shadow and boots separate him from the grey regolith, a life-support chest
  unit frames the red indicator light, broader shoulders sell the stocky build,
  and the visor's lower edge glows amber as intended.
- **SPACEZ HQ onboarding pass** — The first level now builds and releases: a gentle opening tempo, a mid-floor
  swell, a calm merchant "pit stop" by the prototype rocket before MUSKRAT, and a
  guaranteed chest in each of the three corner vaults to reward exploring off the
  line.
- **Tame the magic mid/late DPS runaway** — Magic weapons now quicken with INTELLIGENCE at a discounted rate, so a deep-INT caster no longer out-scales the melee and ranged lanes by ~5× in the late game — INT was double-dipping (scaling damage AND cadence on the same points). Magic still leads its stretch of the game, just no longer by a blowout.
- **Repair kits stack in the dock and mend your whole arsenal** — Weapon repair kits no longer fire the instant you touch them — they now stack into the **consumable dock** (a third slot beside medkits and stamina), five deep, spent on your own call by tapping the slot or pressing **V** on desktop (rebindable in SETTINGS → CONTROLS). Spending one mends your **whole arsenal at once**: the weapon in hand and every weapon in the bag. And a weapon worn down to zero durability is no longer destroyed — it falls into your bag as a broken, unequippable spare (the hero draws the best remaining weapon instead of defaulting to the starter sidearm), waiting for a repair kit to wake it. Repairing brings the weapons a break booted from your hand back into rotation in the order they were shed, so your main blade returns to hand.
- **FAIL-NOT is a real ranged apex** — The rarest ranged relic, FAIL-NOT, spent its whole power budget on utility (never-miss, a spark proc, dexterity) with no raw damage — so the top of the ranged artifact ladder hit softest of the three. It now carries a heavy damage bonus, making it the marksman's boss-killer apex (the ranged answer to DURENDAL) so a ranged endgame has a weapon worth chasing.
- **Class balance by mechanics, not a multiplier** — Replaced the artifact damage-multiplier hack with real, emergent class mechanics: crit damage is now a class trait (ranged crits hardest, magic softest — deepened by DEXTERITY, hard-capped so a mage never out-crits a bruiser) shown as no per-item number, and the physical lanes gain ARMOR PIERCING (ranged more than melee, and stackable from `armorPen` affixes on uniques/legendaries) so they punch through the armored late game that magic bypasses — the class pecking order now emerges from crit-vs-armor rather than a knob.
- **SPACEZ HQ grocery-store aisles + detour lockers** — The first level's sales floor is now laid out like a grocery store — a
  serpentine of shelf aisles herds the hero across the whole floor — with two
  off-path detour lockers to reward exploring a dead-end: the STOCK ROOM and the
  BREAK ROOM, the latter guarded by the EMPLOYEE OF THE MONTH. A new SpaceZ
  "locker" sprite replaces the placeholder chest, and lockers now spill a
  Diablo-2 haul (an 80% marquee item, a chance at a second, plus guaranteed
  supplies).
- **Tune the class arc — melee sunders the endgame** — Tuned the mechanic-based class balance so the arc emerges: crit gaps are gentle (ranged crits hardest as a flavour edge, not a blowout), MELEE is now the armor-piercing lane (highest baseline plus the strongest `armorPen` relics on WORLDSPLITTER, NIGHTFALL, KINGSBANE, THE RECKONING) so a decked-out bruiser fully negates the 50%-armored endgame and reclaims the top, while ranged keeps its single-target crit crown and magic its AoE/spell + armor-bypass identity. The analytic sim now reports a horde-effective DPS (crit × AoE × armor) so class comparisons weigh all three at once.
- **Faster level-up chooser** — The level-up stat chooser now unlocks after 1 second instead of 2, so you can pick a stat sooner.
- **Finite spawn points replace the endless wave** — A level's horde can now be authored as SPAWN POINTS — placed points that arm as
  the hero approaches, emit their mob count over time, drain empty, and can chain
  to a follow-up — instead of a bottomless wave. Each point can also stand a
  cluster of mobs already lingering around it. A map built this way can actually be
  CLEARED and, in a maze, traversed. Spawn points and mobs no longer aggro across
  walls (line-of-sight gated). SpaceZ HQ is rebuilt on this model.
- **Per-difficulty mob levels and a tuned campaign ladder** — Below JESUS, a mob's level is now HARD-CODED per difficulty in the level spec
  (tracking the hero's intended level on each map) instead of floating off the
  player's level, so each map's difficulty is a designed number. A per-difficulty
  XP bonus lands the campaign on its intended ladder — a full clear leaves the hero
  at ~34 / 36 / 38 (easy / medium / hard), then a short grind to 40 unlocks
  NIGHTMARE (40 → 56), whose clear unlocks JESUS. JESUS stays player-relative.
- **Filled guidance arrow** — The "go this way" guidance arrow is now a clean filled amber arrowhead instead of a jagged stack of bars.
- **Spawn points hold steady pressure instead of dumping a pile** — Each spawn point now caps how many of its own members stand at once (`maxAlive`, ~15 on every map) and only emits while the hero is in trigger range — it drips a replacement per kill for steady local pressure and pauses when he walks away, instead of streaming its whole queue onto the field at once.
- **Uncluttered landscape HUD** — In landscape the bottom HUD docks now split across both corners — the powerup (and spell) buttons in the chosen corner, the consumable items in the opposite one — and the buttons are smaller, so neither stack crowds the middle of the field. Portrait is unchanged.
- **Spawn points replace members that chase you off** — A spawn point's alive cap now counts only the members still inside its zone — one that gives chase and drifts out is treated as gone, so the point drips a replacement to keep pressure where you are instead of thinning out as its mobs follow you away.
- **Spells cast once per press, with a queue and global cooldown** — Casting a spell now fires it exactly ONCE per press instead of leaving it "on" until mana ran out; pressing several spells queues them to fire in order (draining while mana lasts, then waiting for regen), and every cast shares a global cooldown so you cannot chain-fire two spells instantly.
- **Native app bundles the game on-device** — The native app now ships the whole game inside it and serves it from a local HTTP server, so it runs fully offline and self-contained; it disables the service worker and the in-app update toast and updates through the app store instead. The website and installed PWA are unchanged — they keep the service worker and update prompt.
- **Fewer spawn points active at once** — Finite spawn points now light only a few at a time — the ones closest to the hero and in clear line of sight — scaling with difficulty (easy 2, medium 3, hard 4, nightmare 5, JESUS uncapped), so a maze keeps the pressure where you stand instead of igniting every spawner around you.
- **Every campaign map is a finite, clearable horde** — Moon, Mars, Eastworld, and The Rift are converted from the endless wave stream to
  placed SPAWN POINTS (like SpaceZ HQ) — each map's horde is now a finite count the
  hero can actually clear on the way to the boss. The autopilot also FARMS the
  spawn points up to the level it needs to beat the boss, then RUSHES it instead of
  draining every point (a tunable boss-engage margin).
- **The moon reforged into a full serpentine sweep** — THE MOON now weaves down-up-down through four basins past both off-path detour caches, and the autopilot rounds scattered rocks and explores the map's fog before committing to the boss.
- **The autopilot pokes designed detours before the boss** — The engine autopilot no longer string-pulls straight past a waypoint that dips off the route toward an off-path cache while unexplored fog remains there, so a botted / BOT VIEW run sweeps more of a level's detours instead of beelining the objective.
- **Mute dialogue during autoplay** — The autoplay bot (DEVELOPER → BOT VIEW and the `?bot=` playtests) now runs with
  the in-world dialogue muted, so arrival scenes, last words, thoughts, lore,
  companion joins and the merchant greeting no longer freeze and flash through
  the run while the bot steers.
- **The Moon rebalanced** — THE MOON's difficulty now ramps evenly from the lander to the flag — the horde starts gentle and grows tougher toward ARMSTRONG — and the spawn knots are thinned so a level-appropriate hero clears them on the move instead of getting pinned.
- **Moon reachable, SpaceZ leveling** — Retuned THE MOON so its boss is actually reachable — thinned the finite spawn knots, dropped the con ramp and ARMSTRONG's engage level onto the hero's real arrival band, pulled the tanky OPTIMUSK out of the mid basins, and moved the boss surge onto the approach so the climax is winnable instead of a wall; and widened SPACEZ HQ's spawn caps so an engaged player levels up before MUSKRAT.
- **Autopilot circle-strafes bosses** — The autopilot now circle-strafes a boss it holds at weapon range instead of
  standing still, so a moving hero slips the incoming fire a planted one would eat
  while its auto-aimed weapon keeps hitting.
- **Difficulty ramps named in one ladder file** — Per-difficulty mob levels and boss hp are no longer copied into every level file — a spawn point or boss now names a neutral, ordered RAMP (`meek`→`monstrous` waves, `endgame`/`apex` bosses) defined once in `ladder.yaml` relative to each map's start/end level, so the whole campaign's difficulty is tuned from one place; the change also normalizes a handful of hand-tuned outliers (mostly ±1–2 mob levels and rounded boss hp on the higher difficulties).
- **Bot plays a level-band strategy and stocks repair kits** — The autopilot now defaults to a `meta` build strategy — melee early, magic mid–high, and melee again at the level cap where the pure-damage/armor-pierce artifacts drop — instead of an even spread, and it detours to grab a repair kit (then spends it) when its weapon is wearing out.
- **Mars redesign** — MARS is rebuilt as a two-act desert→colony assault: an explicit serpentine
  route with a con that ramps west→east, the western desert populated as a real
  first act, the elites re-ordered so the path no longer zig-zags, a breather +
  merchant at the airlock, and the SE TERRARIUM turned into a reachable optional
  keycard detour. ELON MOSQUE now flees into the rift at a quarter health instead
  of needing a grind to zero, so the boss fight reliably resolves.
- **Bot explores directionally before the boss** — The autopilot now eagerly DISCOVERS the map before the boss — sweeping its own
  side, then the middle, via a spawn→boss axis read — up to a coverage target
  (~55%, leaving the boss's side dark until the approach), and engages the boss at
  level parity rather than under-levelled. All tunable in `bot.yaml`
  (`exploreReach`, `exploreBands`, `exploreTargetFrac`, `bossEngageMargin`).
- **Auto-equip prefers the hero's committed weapon lane** — The stat-aware auto-equip now favours a weapon of the lane the hero has committed to (his deepest attribute) by a set margin, so a marginally higher-DPS off-lane find can no longer yank a speccing hero off his blade (or his gun) and thrash his build — while a genuinely stronger off-lane upgrade, or a hero stranded on an off-lane starter, still swaps as before.
- **The Rift redesign** — THE RIFT is reshaped into a left-to-right dread march: black holes flank a
  winding corridor (denser toward the deep end), the horde and the wandering
  ghosts spread across the whole route with a con that climbs to a graviton crush,
  and a merchant EYE plus a black-hole-guarded chest EDDY punctuate the road.
- **Eastworld rebuilt as a Main Street town gauntlet** — EASTWORLD is redesigned into a claustrophobic frontier-town gauntlet: a new cast
  of hand-drawn western buildings (saloon, church, bank, hotel, general store,
  sheriff's office, livery barn) line both sides of a tight Main Street that
  funnels the hero west→east, the horde spawns are spread the whole way with a
  con that climbs to the compound, and a saloon breather and corral chest sit off
  the lane. Levels can now place solid box-collider buildings, and the map
  visualizer draws them.
- **The Bunker, redesigned** — The secret BUNKER level is rebuilt as a themed descent — a marble foyer, an
  automated security checkpoint, the six-resident suites wing, and a treasury
  climax guarded by THE VAULT WARDEN, a new finale boss that gates the exit and
  deploys a grid of new SENTRY GUN emplacements.
- **Autopilot jumps sparingly to save stamina** — The autopilot now reserves jumps for when it is genuinely surrounded — a pack on one side is outrun on foot instead of hopped over — so it keeps its sprint pool full and doesn't wind itself into a jog while escaping.
- **Spec-aware pickup upgrades** — The pickup card's UPGRADE marker (and the inventory upgrade glow) now weighs a
  find's +STAT rolls by the stats your build has actually invested in, so an
  off-spec piece no longer flashes UPGRADE — a caster's +INTELLECT find reads as
  the upgrade a +STRENGTH one doesn't, and the tag's ▲ arrow now renders (it was a
  missing font glyph). Only an actual upgrade offers TAP TO EQUIP; a non-upgrade
  card is no longer interactive — it lets a hold steer straight through it (the
  virtual dpad) and a quick tap over it flicks it away, so a lesser find never
  blocks play in the thumb zone.
- **Spawn points summon the horde in from off-screen** — Finite spawn points no longer pop mobs onto the screen: a summoned mob now appears just off-screen and runs in at a sprint, dropping to its normal pace only once it crosses a circle around the hero as wide as the shorter viewport dimension — and, once a wave is at its cap, refills each kill after a respawn delay that shortens with difficulty, with proximity to the level's boss, and as the campaign progresses.
- **Level-up timer sits beside the caption** — The level-up reveal timer now fills to the right of the CHOOSE A STAT caption instead of on its own row below it.
- **Slower employee stampedes** — Halved the SpaceZ HQ employee stampede's charge speed, giving the hero more time to read the incoming herd and hop or step out of its lane.
- **SpaceZ HQ is a spaceship assembly line, bossed by DOGE-1** — Level 1 is rebuilt as a working spaceship factory — three readable floor zones
  (offices, assembly deck, launch bay), conveyor assembly lines running down each
  build bay, welder-bot ASSEMBLER mobs, and a memecoin-robot boss, DOGE-1,
  replacing MUSKRAT. Doge is seeded here as the machine that keeps one man rich and
  revealed as the campaign's true power in the finale. Adds a `propLines` engine
  primitive for structured, aligned prop placement (conveyors, workstation rows).
- **SpaceZ stampedes are rarer and easier to hop** — The SpaceZ HQ employee stampede now charges in far less often (roughly a third as frequently), the runners are half their old size, and the herd's collision band is a thin vertical line — so a well-timed jump clears the wall cleanly instead of the old wide slab that was nearly impossible to hop.
- **Stampedes knock minions out instead of killing them** — A SpaceZ HQ employee stampede now BOWLS the minions in its lane over — flinging them aside and knocking them out for a few seconds — instead of killing them outright, so a herd no longer thins the horde as it passes (and still can't be farmed).
- **A gentler early game** — The first level eases up so a new player almost never dies learning the ropes:
  EASY thins the crowd (fewer bodies, fewer on screen at once, and the hero slips
  more blows), the SPACEZ HQ opening knot is capped lower so the starter weapon can
  hold the line, and the scripted opening loot now follows a real curve — survive on
  the starter, earn the SECURITY BATON's crowd-clearing AoE around ten kills, then
  SMART GLASSES (+1 INT) to widen that cleave around twenty. The employee stampedes
  hold off until you are halfway to DOGE-1, and the SECURITY BATON hits a touch
  harder.
- **"SpaceZ HQ: a gentler onboarding"** — Rebalanced the opening level so the back half past the NIGHT MANAGER is no longer a wall. EASY now opens on a FIRE EXTINGUISHER — a short-range cone spray that clears a whole pack — instead of the single-target wand, and every rung's starter holds far longer before it wears out (so a fresh player is never stranded on the feeble sidearm mid-floor). The scripted drops carry the run: the SECURITY BATON hits harder, a 9MM PISTOL and a repair kit are handed over for the back half, and the NIGHT MANAGER's EXECUTIVE PUTTER is now a real single-target blade (was a downgrade that auto-equipped over your weapon) with DOGE-1's PLASMA CUTTER trophy kept clearly above it. The assembly floor's tougher staff — engineers, assemblers, guards, hazmat techs and OPTIMUSK units — all pack less health.
- **"Melee AoE weapons re-priced from measured data"** — The damage-budget model used to assume a melee cone hits 4 foes at once (a full sweep 5). A new calibration harness that arms the autopilot with probe weapons of every cone angle and records how many foes each swing actually reaches (25,000+ real swings across the campaign) found the truth is ~1.2 at a narrow thrust rising to only ~1.85 at a full sweep — a blade's reach simply can't touch four bodies at once. Weapon strength is now priced against that measured curve instead of the old guess, which fixes a class of wide "cleaver" weapons (the machete, gravity maul, executioner's axe, and their kin) that were quietly a third of their level's power. They now hit as hard as their level's other blades, so choosing a big sweeping weapon is no longer a trap.
- **"STRENGTH now governs melee reach"** — A melee weapon's reach is now STRENGTH's to lengthen, not INTELLIGENCE's — so a bruiser out-reaches the horde on his own stat instead of being pulled toward Intelligence for it. INT keeps the cone's BREADTH (how wide the swing sweeps) and how many foes it strikes, so the two split cleanly: STRENGTH is the DEPTH of the thrust, INTELLIGENCE the width and body-count of the cleave. A STR bruiser lunges deep and narrow; an INT-melee build sweeps wide and hits many; a hybrid gets both. Ranged and magic reach still ride Intelligence.
- **"Ranged AoE: pierce is the real thing, spreads are a mirage"** — Measured what ranged shots actually hit (a new calibration over 55,000 real volleys) and found the damage-budget model badly over-credited two shapes: a shotgun **spread** credited its full pellet count reaches only ~1.8 distinct foes (its pellets overlap on one body in the open field), and **pierce/chain** were credited their whole line when they thread ~0.5 / ~0.7 foes each. The pricing now matches reality. And because piercing is the _reliable_ ranged crowd-clear — a shot that threads a line of foes regardless of how they're clustered — most of the high-tier non-spread ranged weapons now **pierce**: the surplus carbine, pulsar rod, plasma peacemaker, ember wand, graviton maw, and the longbow (which threads two bodies), so their legendary and artifact forms punch through crowds instead of picking off one target at a time. The railgun and maglev repeater, quietly under-damaged under the old pierce credit, hit harder to match.
- **Labelled inventory tools** — The AUTO-EQUIP and DROP TRASH buttons in the inventory now show a text caption above their icon so it's clear what each does.
- **Reach-aware melee weapon balance** — Melee weapons are now priced for the crowd their swing actually threads: a
  calibrated swept-area model folds STRENGTH-driven reach (the dominant lever)
  into the damage budget, so a high-level long blade cleaves more foes and
  carries a proportionally lighter per-hit blow, while single-target melee stays
  viable via a capped target credit.
- **WoW-style item cards** — Item cards were reworked to read like a WoW tooltip: the rarity is shown by the item name's color instead of a spelled-out "MAGIC ITEM" label, the item level is promoted to a gold line under the name, and an attribute requirement (strength/dexterity/intellect) is shown only when the hero doesn't meet it. Requirements now sit at the foot — the required level bottom-left with the slot/class icon beside it, and durability moved directly above them. Weapon cards lead with damage then DPS (now shown to one decimal), drop the range line, and no longer print the parenthetical base-comparison numbers.
- **In-game boot screen** — The prerendered landing/no-JS shell now reads as the game booting — the title
  screen's starfield sky and in-game teal title — instead of a plain document,
  while keeping the descriptive copy fully readable for search crawlers.
- **Autopilot fights within weapon reach** — The autopilot now derives its hold distance from the equipped weapon's actual reach — closing in to a range it can hit from instead of skirmishing out of range, holding still in the sweet spot rather than shuffling constantly, and pressing closer with spread/cone weapons to catch a whole pack.
- **How-to-play demo reads as human** — The HOW TO PLAY demo hero no longer strobes his facing left↔right as the
  autopilot orbits — he holds a heading, slides up/down or stands, and turns only
  on a real, sustained move; each teaching tooltip now freezes the action for a
  beat so it can be read; and the menu's "WATCH A DEMO RUN…" subtitle is dropped.
- **HOW TO PLAY plays itself** — HOW TO PLAY now launches a self-playing demo — the autopilot plays a real level (a melee hero on MEDIUM at normal speed) while one-time tooltips pop wherever it taps, teaching each control (steer, jump, powerups, items) the first time it uses one. Tap anywhere to bring up an exit-to-menu confirm; the developer BOT VIEW still exits through its pause menu.
- **AIM & SHOOT mouse mode** — The hold-to-steer mouse mode is now AIM & SHOOT — WASD walks, the pointer aims, and the left button is the trigger, with a new desktop-only AUTO-FIRE toggle (on by default) that keeps the character firing on its own; the mouse-scheme settings rows (MOUSE, AUTO-FIRE, KEYS) are now hidden on touch devices like KEY BINDINGS already was.
- **Smarter autopilot** — The autopilot now plays the whole loop like a person: it keeps a bag slot open by dropping the cheapest outgrown junk (hoarding the valuable finds to sell), walks its loot to the merchant to sell, buy upgrades and powerups, and mend its kit, aims its weapon where it deals the most damage (densest cluster for cones and spreads, finishing blows for single shots), keeps an escape route open while fighting a pack, and kites overwhelming packs backward toward cleared ground — unless a banked nuke lets it play daring.
- **Show VIBRATION only where it can buzz** — The SETTINGS → CONTROLS → VIBRATION toggle now appears only on devices that can actually produce a buzz — a touch phone or tablet whose browser has the Web Vibration API (Android in a browser or an installed PWA), or the native app's Taptic bridge. It's hidden on desktop (the API exists but there's no motor) and on all of iOS (no Vibration API at all), where it was a dead switch.
- **HOW TO PLAY slower stat allocation** — The HOW TO PLAY demo now spends each banked level-up point on a full ~2-second beat — as long as a teaching tooltip lingers — so a newcomer can follow every point landing instead of watching the stats drain in a blur.
- **SpaceZ HQ working floor** — The SpaceZ assembly floor now feels staffed and alive: the conveyor belts roll
  (five scrolling belt frames), assembly workers stand stationed in pairs beside
  every belt line, WoW-style patrols walk the floor while dormant (the NIGHT
  MANAGER pacing his aisle, the CHIEF and JANITOR on their beats, an errand
  intern, a guard, and roaming OPTIMUSK units sweeping the bays), and the whole
  night shift potters around its post ("at work" idle stroll) until the hero
  walks into a roughly screen-sized aggro range instead of locking on from
  across the map. Alarm sentries raise the floor: a woken patrol or foreman
  activates its bay's spawn point, which pours an answering squad at the hero
  for a short window even if he dodged the point itself.
- **Autopilot paces itself when winded** — The autopilot now drops to a walk when its sprint pool runs below 10%, banking a burst of full sprint for any foe that closes in instead of grinding the pool bone-dry on quiet stretches.
- **Autopilot HUD** — The AUTO PILOT speed and STOP buttons are half their old size, and the gold monitor spells the purse out in full (no compact "20B") so the per-tick drain reads as the number counting down — the red burn-rate badge is gone.
- **Autopilot panel buttons** — The autopilot panel's controls are now a big round speed button and a square stop-icon button, with the panel text sized up to match the coin readout.
- **HOW TO PLAY tap dismisses the tip first** — In the HOW TO PLAY demo, tapping the screen while a teaching tooltip is showing now just dismisses that tooltip and keeps the demo playing; the "keep watching" exit confirm only comes up on a tap with no tooltip on screen.
- **Bigger pause target** — Pausing now catches the whole upper-right corner of the HUD — the top of the minimap and the space above the timer clock — instead of only the tiny clock plate, so it's far easier to hit.
- **Smarter autopilot navigation** — The autopilot now follows the on-screen guidance arrow down the authored path, traces a blocking wall toward its visible end instead of oscillating against it, and no longer misreads a slow hero's steady march as being stuck.
- **Autopilot spell mastery** — The autopilot now plays its cast spells like a mana-thrifty caster: it keeps the
  spell bar re-slotted onto the strongest unlocked powers as it levels, and only
  spends mana where it converts — the best damage cast per point of mana
  (overkill- and crowd-aware), heals without overhealing (and held as the medkit
  backup), the martial buff only to open a real fight, and wards/slows only under
  genuine pressure.
- **Game authoring sources and tools moved to the repository root** — Authored sprites, enemies, levels, and tuning now live under root `content/`, while their generators and analyzers live under root `scripts/` alongside a one-command contribution workflow.
- **Hide HIGH SCORES until a hardcore campaign is banked** — The title menu's HIGH SCORES row now appears only once a hardcore hero has played a campaign to its end (SURVIVED or FELL) — since high scores are hardcore-only, a player who has only run softcore heroes no longer sees a row that opens an empty board.
- **Steadier settings menus** — Settings screens no longer reflow when you change an option — the EXPORT
  checkboxes stay pinned at the right and centred on both hero lines, and each
  row's help text now sits on a single fixed line at the foot of the page instead
  of shifting the rows as it changes.
- **Difficulty balance** — Rebalanced the difficulty ladder so every rung levels to its intended finish: leveling costs grow more gently at high level, each difficulty's XP bonus was retuned (nightmare no longer stalls ten levels under its maps — its late-campaign walls and unreachable bosses are gone), the moon/mars mob bands were lifted out of grey-XP territory, and nightmare EASTWORLD's band was eased so a normally-paced hero isn't fighting mobs ten levels over his head.
- **Repaced leveling curve** — Leveling is repaced across the whole game on a hand-authored curve (`content/leveling.yaml`): both the XP and the kills needed for the next level rise steadily from level 1 (~70 kills) to the cap — no level is ever cheaper than the one before — with the climb steepening hard past level 70 toward ~1000 kills at 98, and mob XP now compounds 8% per mob level. A full playthrough of a bottom difficulty lands around level 34/36/38 (easy/medium/hard), just under the nightmare unlock at 40, and nightmare lands just under the JESUS unlock. Golden XP arrows drop more rarely (~one per 75 kills at medium) and pay 15% of the level bar (down from 25%).
- **Auto pilot speed picker** — Enabling AUTO PILOT now opens a speed-multiplier picker (1× / 2× / 4× / 8× /
  16×) that prices each rung at the moment you turn it on — its coins-per-game-
  second and how much game time your purse buys, with unaffordable rungs greyed
  out — instead of showing a single cost line on the pause screen. The pause
  screen itself is retuned into a tidy, icon-led card.
- **Leveling lands on the ladder** — The XP curve is repaced so a full clear of every difficulty lands the hero on the campaign ladder's intended finish level (easy ~32, medium ~34, hard ~38, nightmare ~56, JESUS ~69) instead of overshooting by up to six levels.
- The level-up CHOOSE A STAT caption and its arming bar are now left aligned and span the full row together, the bar filling the space to the right of the caption.
- **Predictable leveling pace** — Every XP faucet is now mob-priced — elites pay ×5 and bosses ×10 their own mob-level XP and golden arrows a flat 5 mob-kills' worth (all authored in leveling.yaml) instead of shares of the level bar — and the level curve is retuned so kills-per-level starts at ~20 and compounds ~4.5% per level, keeping the endgame wall past 70.
- **The gentle-rung horde mercy keys off engaging a boss, not standing near one** — On EASY and MEDIUM the swarm now eases off only once you actually **trade blows** with an elite or boss — you wound it or it lands a hit on you — instead of the moment you step inside its aggro radius. Mere proximity no longer slows the horde, so you can't farm the area next to a set piece at crawl speed without committing to the fight.
- **Larger achievement filter buttons** — The ALL / UNLOCKED / LOCKED filter buttons on the Achievements screen are now larger and easier to tap.
- **Developer VISUALS submenu** — The developer KNOCKBACK slider moves into a new DEVELOPER › VISUALS subpage (a home for game-feel effect knobs), and every settings slider — KNOCKBACK, the BALANCE knobs, and the SOUND volumes — now spans the full width of its menu so the track lines up with the other rows instead of stopping short.
- **Clearer control labels** — Renamed the CONTROLS powerup-corner setting to QUICK BARS and turned GEAR into an AUTO-EQUIP on/off switch.
- **A spectacular screen-nuke detonation** — The screen-clearing NUKE now detonates with a full-blown blast — a blinding double-flash, an expanding light bloom and god-rays, a white-hot fireball cooling through orange to red, licking flames, and billowing smoke over world-anchored shockwave rings, embers, and a scorched crater — and every monster it catches burns up in fire and is left as a smoking, charred skeleton.
- **Strict stamina paces** — Stamina is now a strict three-pace ladder: any RUNNING pace burns the full drain rate, a WALK (half speed) regains only a 0.1x trickle, and STANDING still refills at the full rate — and an emptied pool now demands 2 seconds of uninterrupted standstill before regen resumes (any movement restarts the wait), so managing the sprint pool really matters.
- **Autopilot stamina doctrine** — The autopilot now treats stamina as survival fuel: it runs only under real urgency (a foe closing, a dodge, an emergency escape, the boss fight) or with the pool above ~70%, walks every calmer reposition below that, and plants to catch its breath before the pool ever empties — so it never pays the empty-pool standstill lockout.
- **Smoother horde-scale combat** — Cut per-tick and per-frame hot-path costs at horde scale: derived hero stats,
  armor, crits, and procs are memoized on the loadout instead of re-walking the
  gear per blow and per mob; stasis slows resolve once per tick; line-of-sight
  sweeps walk only the grid cells on the sightline; orbit orbs, homing shots,
  chain lightning, and the autopilot's aim pick no longer scan the whole horde.
- **Lightning strike and nuke feel** — Storm strikes now crack down as a jagged, forked lightning bolt that lights up the ground around the point, sparks a fan of hot fire embers where it earths, and jolts the camera — plus a sharp haptic buzz. The screen-clearing nuke now hammers the view with a hard camera kick and a heavy rumble.
- **Golden arrows are priced to the mob that dropped them** — Golden XP arrows now pay a few kills' worth of the mob that shed them rather than always the hero's own level, so an arrow dropped by an outgrown map's low-level horde is worth only that mob's little (a grey mob's arrow trickles to nothing) instead of a full at-level ding — grinding old ground can no longer over-level you.
- **A beaten starting tier opens the level picker on its sibling lanes** — Picking easy, medium, or hard on a hero who has already beaten any one of those three lanes now opens the mission picker (they share one tier) instead of marching through the campaign from the first level again, so grinding the last levels up to the nightmare gate goes through the level selector.
- **Faster simulation and autopilot** — The headless campaign simulator and the in-game autopilot run markedly faster (a full easy campaign simulates ~2.5× quicker) with byte-identical results: the bot's per-tick economy reads (weapon scoring, bag discipline, merchant errands) now memoize off the hero-loadout memo instead of re-walking the bag several times a tick, the enemy/projectile catalogs and instances share one object shape so the tick's hot loops stop hitting megamorphic property lookups, and world-distance math drops the slower overflow-safe path — all behavior-preserving.
- **Auto Pilot affordability call-out** — The Auto Pilot speed picker now shows a clear "CAN'T AFFORD AUTO PILOT — SELL GEAR TO EARN COINS" message when the purse can't fund any rung, and its CANCEL button is a larger full-width footer button.
- **Dying costs XP** — A softcore hero now forfeits 10% of the current level's XP bar when he dies (never de-leveling), so a run isn't consequence-free; the toll is shown on the defeat splash and is tunable via the new DEVELOPER › BALANCE "DEATH PENALTY" knob (0× turns it off).
- **Level-up light explosion** — Leveling up now detonates a blinding explosion of light: the horde is hurled back on a shockwave (knocked back, never harmed), the screen floods with a holy-gold flash, god-rays, and a pillar of light rising off the hero, and the LEVEL UP! chooser rises out of the fading glare — all under a grander triumphant fanfare and a heavier celebratory haptic.
- **Level-up effect scales with the level** — The level-up celebration no longer shakes the camera — the light carries the
  ding on its own — and the whole spectacle is now sized to the level reached: a
  modest 20% glow for the first ding, growing with the climb to the full,
  blinding detonation on the last level before the cap.
- **A still camera and a slow push-in for the death scene** — The camera no longer shakes when the hero falls — it holds dead still and
  creeps slowly in on the body across the whole death scene, so the last thing
  a run shows is the fallen hero, close, under the gathering cloud.
- **A softer nuke camera shake** — The screen-clearing nuke rocks the view with a thump instead of a half-second
  hammering — the old shake was violent enough on a phone to read as the device
  dropping frames.
- **The AUTO PILOT raises the difficulty when it beats the game** — Beating a campaign on AUTO PILOT now steps the ride up to the next unlocked
  difficulty and starts its campaign, instead of farming the beaten rung's rift
  forever; a ride pinned to a level for farming still stays where it was put.
- **Main menu order** — The title menu now reads RESUME, PLAY, HIGH SCORES, ACHIEVEMENTS, HOW TO PLAY,
  STORE, SETTINGS — SETTINGS drops to the bottom so the rows about playing come
  first.
- **Softer death shake** — The camera jolt when the hero dies is now a soft nudge instead of the game's hardest shake, so you can actually watch the hero fall.
- **The coin vault's gold, restacked** — The COIN STORE's coins were reworked: every pack row now shows its haul STACKED like poker chips — a handful for a million up to a bank of tall columns for ten billion, each coin small, flat and with a real thickness — and highlighting a row stirs the pile, whipping coins off the top of each column to turn over in the air and drop back. The falling coins behind them tumble on three axes at their own rates instead of flipping sideways in unison, fall along curved paths at varied speeds and depths, and are lit as polished metal (a hard specular, an anisotropic sheen, a shaded milled edge) rather than glowing.
- **Watchable weapon switch in the how-to-play demo** — The demo hero's weapon switch now holds the quick-draw switcher open for 120 ms between opening it and picking the weapon, so you can actually see which weapon he reaches for instead of the panel blinking past in a couple of frames.
- **The autopilot picks its weapon by the fight** — The autopilot now reads the fight before it draws: it hauls a single-target round for bosses and a spread for packs, keeps the spare its own build would actually swing, never trades away the reach it needs to hold a pack off, and swaps mid-jump so a hop over a mob pack lands with the crowd gun already in hand.
- **The menu row you're on glows** — The amber glow that sat on the STORE row forever now marks the highlighted menu
  row instead, and on touch a row lights while you hold it rather than staying lit
  after the tap — only a settings control with help text keeps the highlight.
- **Pixel (i) toggle and a satchel for the AUTO PILOT loot** — The level-up / respec (i) help toggle is a pixel octagon chip like the rest of
  the UI instead of a soft round badge, and inverts to the dark chassis while the
  breakdown is open. The AUTO PILOT panel drops its "LOOT n" text row for a
  matching satchel chip beside the speed rung and STOP — the same button, now
  obviously one.
- **Every powerup effect and icon redrawn** — The powerups now look like the powers they are: the fire orbs ride comet tails,
  the stasis field is a dome of stopped time, the magnet ropes the loot it has
  hold of, and a running power treats the whole frame — the PALE SHROUD drains
  its colour, REACTOR SURGE runs its edges hot, an EVENT HORIZON bends its corners
  in. Their pickup icons were redrawn to match.
- **Lost & found reads at arm's length** — The LOST & FOUND now sets every line under its heading at the item names' size, wears a coin on each price (and spells COINS out on the purse and the reclaim button), and drops the redundant subtitle from the title menu's row.
- **Menu sub-screens lead with their name** — Every title-menu sub-screen now opens with a proper page header — a large, bright title over a breadcrumb trail and a fading rule — instead of a purple line set smaller than the rows beneath it, and a soft wash keeps the drifting planets and the sun from cutting through the text.
- **The game loads less than half as much before the menu appears** — The startup path no longer downloads the simulation: the engine gained a menu-side entry point (`@game/menu`) carrying the catalogs and the saved-hero math but nothing that simulates, the compiled level and item catalogs are split into menu-facing and run-facing halves, the LOST & FOUND, the developer ARSENAL, the cutscene workbench, the soundtrack and the in-run sound banks load on demand, and the critical-path budget dropped from a temporary 1000 KB to Google's 170 KB compressed — with the real figure now 150 KB gzipped, down from 310 KB.
- **Developer tooling stays out of the App Store build** — The hidden seven-tap sun reveal, the DEVELOPER menu behind it, and the commit
  hash beside the version in the title footer now ship in every build EXCEPT the
  one uploaded to the App Store / Play Store — web, PWA, preview and branch
  slots, local builds and TestFlight all keep them.
- **The library points at the App Store, not at the browser** — The library's pages no longer end on "play free in your browser". The one call
  to action they carry is the App Store build — the same game plus haptics, Game
  Center and heroes that follow you between devices — and it stays invisible until
  there is a store page to link, so nothing on the site advertises a dead URL.
- **Faster first paint and more ways into the library** — The boot screen now paints immediately instead of waiting on the app's
  stylesheet, and it points at each of the library's four sections by name
  rather than at the library's front door alone; the privacy and support pages,
  which previously carried no links at all, now lead back to the game and the
  library too.
- **Weapon numbers mean what they say** — A weapon's damage and attack speed are now exactly the numbers on its card: the hidden halving that cut every looted weapon to half its listed damage is gone, weapons no longer gain damage from item level, and the global cadence penalty that made every weapon swing slower than it read is gone too. What made a rarer weapon hit harder is now a stat you can read — **+X% ENHANCED DAMAGE**, rolled inside a band that climbs with the tier (magic +10–50% up to artifact +250–700%) and frozen on the piece, so two copies of the same artifact are worth comparing and a perfect one is worth farming for. Monster health carries the difficulty instead, so a monster still takes about the same number of hits to kill as before.
- **Mob health is a ladder now** — Each difficulty carries its own MOB-HEALTH multiplier (`mobHp` in
  `content/ladder.yaml`), so a harder rung is a genuine STEP in how much killing
  a mob takes rather than only fielding monsters a couple of levels higher.
  NIGHTMARE lands as the jump it always should have been. The per-level health
  curve was eased alongside it (a normally-geared hero was needing 17 blows to
  fell a plain minion deep in nightmare); a trash mob now dies in about five
  blows through easy → hard, and nightmare climbs to roughly seven.
- **The balance simulator's matrix sweep runs in parallel** — `scripts/simulate-run.mjs --class all` (and any `--strategy`/`--class` matrix)
  now simulates its specs across worker threads instead of one after another —
  each spec is an independent campaign, so the reports and their order are
  identical to a sequential sweep, roughly twice as fast on a four-core machine.
  `--jobs N` sets the width and `--jobs 1` restores the sequential run. The new
  `make sim-bench` measures the headless simulator itself, and the obstacle
  line-of-sight query and the autopilot's threat scan — the two hottest reads in
  a simulated tick — no longer allocate on their hot paths.
- **Cloud save is the store app's only hero transfer** — EXPORT / IMPORT CHARACTER are now web-only — the App Store / Play Store app's
  SETTINGS → DATA offers CLOUD SAVE alone, so a hero's progress (and the platform
  achievements it will earn) can only travel between that player's own devices.
- **Kill knockback scales with the blow** — A killing blow now throws the body in proportion to how hard it hit for the
  health it had to get through: a crit sends a mob twice as far as the plain blow
  beside it, and a mob with a big healthbar for the damage dealt is heavier and
  barely rocks. One-shotting something always knocks it away — a mob killed for
  exactly its full bar gets the smallest real launch instead of just keeling over
  — three healthbars in one blow clear the screen, and everything between rides
  the same slope. Past that there is no ceiling: the throw keeps growing with the
  blow, so a monstrous one-shot still visibly outflies a merely huge one.
- **A bloodied floor that looks spilled, and overkill that never stops escalating** — The blood a fight leaves on the ground no longer reads as red squares — a pool
  now overhangs its own tiles, fills in only where it is properly surrounded, and
  frays into the clean floor with authored edge art. And a vastly overpowered blow
  now keeps escalating without limit: the same body's worth of blood, thrown
  harder, atomized finer, torn into flying chunks and burst rather than merely cut,
  so a high-level hero carving through low-level mobs looks like it should.
- **A softcore death is now a screen about going again** — The YOU DIED splash is two screens now. A softcore hero never reaches the
  high-score board, so their splash drops the run sheet it used to print — the
  combat clock, peak menace, damage dealt and taken, items, XP gained, all of it
  the hardcore board's own columns — and answers the three questions a player
  about to retry actually has: who killed them, what the death cost (the XP toll,
  or plainly nothing), and how close the mission came. TRY AGAIN then takes the
  screen, says the level restarts from the top with the build the death kept, and
  answers a keypress; MENU is demoted beneath it. A hardcore death still prints
  the full scorecard, because for that hero it is one.
- **LOST & FOUND buys back from the item's own row** — The LOST & FOUND's buy-back now unfolds directly beneath the item you pick — price, confirmation and all — instead of sitting in a footer button that never named which of the listed pieces it would spend on, and a tapped item's blown-up icon no longer shows the screen behind it through its plate.
- **Auto pilot keeps your spec your own** — The paid AUTO PILOT ride now hands back every stat and talent point its bot spent when you stop it, so skipping content with coins never quietly decides your build — you place the earned points yourself, and a hero starting a run with unspent points is greeted with the stat chooser (then the talent picker), paused, until they are placed.
- **Findable in search, and a real picture on every library page** — The site now leads with what the game IS rather than what happens in it — the
  page title and search snippet name the genre, the platform and the price, while
  the title screen keeps its own words — and every library page carries a
  breadcrumb trail, a social card of its own subject, and a picture of that
  subject's in-game card standing on the level it comes from.
- **No auto pilot for hardcore heroes** — The paid AUTO PILOT ride is no longer offered to hardcore characters — a hardcore death is permanent, so an unattended bot could permakill the run. Hardcore heroes are always flown by hand; softcore heroes still get the pause-menu ride.
- **Readable achievement conditions** — Doubled the small text on the ACHIEVEMENTS shelf — each badge's condition line,
  the completion readout, the per-category count and the progress tally now render
  at the same size as the rest of the panel instead of half it.
- **Tap the sun seven times to unlock the DEVELOPER menu** — The hidden DEVELOPER menu now unlocks by tapping the title screen's **sun**
  seven times in quick succession, and the sun is what detonates. The build-up is
  a secret in itself: the first tap does nothing at all, the second is a breath of
  extra glare, and from the third the star visibly starts throwing flares and
  licking fire, shaking harder and burning hotter with every tap — until the
  seventh blows it apart in a full supernova (an implosion, a blinding white-out,
  a fireball, racing shockwave rings and flung debris, with the screen shaking
  under it). Stop tapping and the whole thing quietly ebbs away. Collapses to a
  brief flash under prefers-reduced-motion.
- **Effects gallery chrome** — The developer effects gallery's BACK button now stands as tall as the search box
  beside it, and the centre PLAY button is gone — the field's tap (or Enter) still
  replays the show, and nothing sits over the effect any more.
- **The autopilot digs in to recover an empty pool** — The autopilot now judges a breather by the CLOCK instead of a distance ring —
  it plants when nothing can reach it in time, stands off a slow body that could
  never punish the stop, and tops the pool off on genuinely empty ground; run
  bone-dry, it does the arithmetic on the 2-second standstill lockout and, when
  the race is winnable, pays it off in one committed stand before walking the
  pool back up.
- **Stamina is a build decision, not a movement tax** — The sprint pool no longer taxes ordinary running: a fresh hero used to be able
  to sustain only a 45–55% run duty cycle against a map that demands more like
  80%, which left him at ZERO stamina for 41% of the opening level with regen
  locked out for 72% of it, drinking a stamina potion every thirty seconds just
  to keep moving. Running now costs a third of what it did, and what the pool
  funds is a BURST — jumps, and a drink saved for a sprint you choose to spend.
  
  What the pool costs is now a DIFFICULTY LADDER: each rung prices how fast a run
  spends it, how many seconds a standstill breather takes, and how long a hero who
  ran dry must stand dead still before recovering — so one dry-out costs 6.5
  seconds on easy and 14.5 on JESUS. The three are tuned to one target: a build
  spending about a fifth of its points on STAMINA rides comfortably, one spending
  none runs dry, and the higher you climb the more that costs. On hard, a build
  that skips STAMINA entirely now runs dry 13–16 times a map and spends a third of
  one at zero, while a build that invests never runs dry at all.
- **STAMINA is a stat worth buying** — The sprint pool now visibly works instead of riding full: a campaign's mean
  fill sits near 70% for the shipped builds, so the pool is something you spend
  and stop to recover at every stage of a run rather than a bar that quietly
  tops itself up. Running spends it faster, and a STAMINA point's drain
  reduction is much shallower — at the old slope a late-game hero divided his
  drain by nearly five ON TOP of trebling his pool, so the stat stopped mattering
  exactly when he had the most of it; now investment lengthens the sprint through
  the POOL and keeps paying the whole way down.
  
  The RANGED build banks an eighth of its points in STAMINA like melee and
  balanced do, taken from its third INTELLIGENCE beat (never from DEXTERITY, so
  its equip gates keep clearing). It was the one build that banked nothing, which
  under the difficulty ladder left it running dry 13–16 times a map on hard and
  spending a third of one at zero stamina.
- **The bestiary opens on the critters, not on the bosses** — The library's bestiary index and its front-door rack now list each venue's rank
  and file in the open and keep the named elites and the boss waiting behind them
  under a spoiler cover (one switch at the top lifts them all), and a monster whose
  name it shares with another now says which one it is wherever that name travels
  alone — so the three ELON MOSQUEs read as MARS, THE RIFT and EASTWORLD in a rack
  or a drop line instead of three identical rows.

### Fixed

- **How-to-play demo & melee standoff polish** — The HOW TO PLAY demo no longer leaves the "TAP A STAT TO RAISE IT" tooltip hanging over the field after the level-up modal closes, the stat the autopilot picks now lights up as it taps so you can see its choices, and the melee autopilot holds its body just clear of a foe's grasp — swinging from weapon reach instead of grinding a few pixels inside the pack and trading a hit for every blow.
- The bunker's database emperor now goes by his real fake name: LARRY ALLISON
  (formerly JERRY).
- **Muzzle flash fires at the weapon when shooting behind** — The field hero's muzzle flash and cast bloom (developer WEAPON SWING) now fire at the weapon's barrel/tip on his facing side even when he auto-attacks a foe behind him, instead of flashing off his back along the shot's aim.
- **Companions no longer trigger RAMPAGE** — A companion's damage and kills are now kept out of the menace meter — the RAMPAGE escalation answers an overpowered hero, so a party carrying the fight (like a powerup's screen-nuke) no longer heats the meter, jolts the overkill lure, or advances the evolution ratchet. Their kills still book into the run stats and pay the hero XP as before.
- **HOW TO PLAY tooltip arrow stays visible over yellow** — The little pointer arrow beneath a HOW TO PLAY tooltip now has a dark outline,
  so it no longer disappears when it sits over yellow content underneath it (such
  as the stat-allocation numbers it points at).
- **HUD clears the iOS notch** — The top HUD (XP strip, hero portrait unit, and minimap) now clears the iOS notch / Dynamic Island by honoring the top safe-area inset, instead of hiding behind it; displays without an inset keep the XP strip flush to the top edge.
- **Autopilot holds its ground for the opening strike** — The autopilot no longer flees the scripted "draw your weapon" opening at SpaceZ HQ. While holstered the hero used to kite the lone vanguard, backpedalling the whole pack across the floor into the far wall for several seconds before the harmless first swing ever landed; he now stands his ground once he's at the standoff and takes the scripted hit, arming roughly three times faster.
- **iOS PWA audio recovery** — Sound no longer stays dead after switching away from the app on iOS. An
  AudioContext interrupted by an app switch, incoming call, or screen lock now
  re-resumes on the player's next touch anywhere — previously it only recovered
  via the pause menu, and stayed silent when the interruption happened during a
  cutscene, level-up, merchant, or the title screen.
- **Autopilot stops hopping across open ground** — The autopilot no longer jumps while marching a quiet field (jumps stay reserved for stampedes and surrounded/bleeding break-outs), and no longer drinks stamina potions with no enemy near — the pool is jogged off for free instead of burning supplies on travel.
- **Autopilot no longer wedges on walls** — The autopilot now escapes geometry like a human: when stuck it commits to an open heading and traces the obstacle's contour instead of rotating blindly, its A* route replans when a wall cuts off the next waypoint, and loot grabs steer around shelves — eliminating the wall-pocket livelocks that froze botted runs.
- **How-to-play tooltip caret** — The HOW TO PLAY teaching tooltip's caret now attaches to the callout box like a chat-bubble tail instead of floating detached below it.
- **DIALOGUE off silences the hero's monologues too** — Turning the DIALOGUE display setting off now also skips the level's opening monologue and its post-victory epilogue, not just the in-world scenes and inner thoughts — a muted run opens on the level-name card and ends on the victory splash with no story text.
- **AIM & SHOOT holds fire with nothing to hit** — In the desktop AIM & SHOOT control mode, holding the manual trigger no longer smashes a breakable crate when no enemy is in weapon reach — the pull stays inert until a mob is actually within range, so resting the button between fights never burns the weapon on boxes. Autonomous auto-attack (touch, bots, auto-fire) still cracks lone crates open as before.
- **iOS PWA zombie audio context** — Sound now recovers even when iOS hands back an AudioContext that claims to be
  running while its clock and output are dead after an app switch — the game
  detects the frozen clock, forces the audio session to re-activate, and as a
  last resort rebuilds the audio engine on the next touch, so it no longer takes
  a lucky second app-switch to get the sound back.
- The power-unlocked modal's school/mana line and flavor blurb now render at the same readable text size as the achievement card's detail rows.
- **Talent picker text wrapping** — Talent descriptions in the talent-earned modal now wrap to fit their row instead of overflowing off both edges, and each blurb is left-aligned under its talent name — most visible on a narrow portrait phone.
- **Death scene no longer skipped by held keys** — The YOU DIED modal no longer appears the instant the hero falls: only a
  click/tap skips the death scene (a hand resting on WASD or the walk modifier
  used to skip it via key repeats), and the first second of the tableau is
  unskippable so the press that was steering when he died can't dismiss it by
  accident.
- **HOW TO PLAY callouts point at the right thing** — The crate lesson now fires on the blow that actually smashes the box (the read-freeze holds the break at its first frame, so the crate is still standing under the callout and bursts the moment play resumes), the powerup lesson points at the copy that just went off rather than an older stacked one, and every callout anchored on a HUD control now sits beside that control instead of on top of it — so the caret is visible pointing at the powerup, item, or slot being used.
- **The page no longer scrolls under a modal in a browser** — Dragging on a modal in a phone browser could pull the whole game down out of frame — the level-up chooser slid off the screen behind the browser's own pull-to-refresh spinner — because the drag reached the document instead of stopping at the modal; the document is now locked against scrolling for every game surface, and every in-game scroll box keeps its overscroll to itself.
- **Sprinting costs ground covered, not ground attempted** — A hero held up by geometry no longer pays a full sprint for a step the wall
  took back, so a walk into a doorway no longer leaves him winded at half speed
  for the rest of the map — most visible on generated maps, which carry several
  times the wall segments of a hand-drawn one and no path arrow to thread them.
- **Fair contact damage across the campaign** — Elite and boss contact damage no longer multiplies by the auto-stat curve (deep-campaign set pieces were landing one-shot blows twenty times their catalog number), regular mobs now gain a gentle +3%/level contact ramp so the late horde threatens instead of tickling, and the NIGHTMARE→JESUS difficulty step is bridged (nightmare up, jesus down) so the ladder climbs without a cliff.
- The level-up stat chooser now fits landscape phone screens (a 3×2 grid instead of six stacked buttons), and tall overlays scroll instead of clipping.
- **Auto-equip no longer swaps to weak spread weapons** — Auto-equip credited a ranged spread weapon (a shotgun's pellets, pierce, or chain) its full theoretical target count, so a pump shotgun with a quarter of your weapon's per-target damage could displace it on a paper tie. Spread weapons are now scored on the fraction of that potential they realistically land, so auto-equip keeps a reliable single-target weapon unless the spread gun genuinely out-budgets it.
- **Prelude couch seating** — The hero and Ada now sit up on the couch cushions and face the TV during the movie-night prelude, and the couch and TV sit closer together — previously the pair slumped at floor level facing away from the set.
- **Remove the stale "hits up to" line from melee weapons** — Melee weapons no longer show a misleading per-weapon "HITS UP TO N" line — how many foes a swing cleaves is set by INTELLIGENCE, not the weapon; ranged PELLETS/PIERCES/CHAINS lines (the weapon's own physics) are unchanged.
- **Center the map title on its icon** — The level-map modal's title now sits vertically centered on the treasure-map chart icon instead of riding high beside it (the blanket overlay-canvas rule was overriding the header's centering).
- **No more shooting through walls** — Shots now collide with walls and other tall obstacles, and the character no longer targets monsters it has no line of fire to.
- Sound no longer stays muted after switching apps and returning to the game on iOS (the audio engine now resumes automatically when the app comes back to the foreground).
- The inventory now fits the screen in both portrait and landscape — equipment, stats, and bag reflow per orientation instead of cutting off the bag and stats.
- **Reliable intro tune and update prompt at startup** — The title theme now starts reliably at app launch — the audio context is created only from a real user gesture instead of being pre-created when the menu reads the audio clock, which some browsers refuse to resume. The "a new version is ready" prompt now also appears when an updated service worker was already waiting when the page loaded, not only when one becomes ready while the tab is open.
- **Home-screen app title** — The installed PWA's iOS home-screen title now shows the game's name instead of the placeholder "Game", and all brand identity (title, tagline, domain) is centralized in one config so it stays consistent across the shell, manifest, and social cards.
- **No selection loupe on double-tap** — Double-tapping the game on iOS (routine, since a tap jumps) no longer pops the text-selection magnifier/loupe over the screen; the canvas now suppresses the touch selection gesture while pointer steering keeps working.
- **Solid update toast** — The "new version ready" update toast now paints on a solid surface instead of rendering transparent, by giving the framework UI color tokens on-brand defaults.
- **Legible HUD clock and foe counter** — The centered run clock and foe counter now sit on a semi-transparent dark panel (matching the XP badge and inventory avatar), so they stay readable against bright floor tiles instead of washing out.
- **Update toast shows full version** — The "a new version is ready" toast now shows the full version (`v0.1.0 · abc1234`), matching the title-screen footer, instead of just the bare commit SHA.
- **Snappier desktop cursor steering** — Cursor-follow steering no longer needs twice the mouse travel to sprint on desktop — the sprint threshold now ignores the desktop 2× zoom, so the character reaches full speed after the same on-screen cursor distance as on phones.
- **Steady foe counter** — The in-game foe counter (e.g. "STAFF") no longer flickers as waves spawn; it now counts kills monotonically instead of deriving from the live enemy count.
- **Hero avatar no longer vanishes in portrait** — On a narrow (portrait) mobile viewport the framed hero avatar in the top-left HUD collapsed to zero width and disappeared; it now holds its size and stays visible, matching the landscape layout.
- **Portrait HUD overlap** — On a phone held vertically the run clock and staff counter now sit in the top-right corner instead of overlapping the left vitals panel.
- **Compact update prompt in landscape** — The "a new version is ready" prompt now keeps its buttons on one row to the right of the text in landscape instead of wrapping them underneath, so the panel no longer grows taller than it needs to when there is horizontal room to spare.
- **Inventory tooltip placement** — The item tooltip no longer flies to the top-left corner the first time you inspect a different-sized item (e.g. a weapon right after a suit); it now lands beside the slot on the first press.
- **Physically-correct title moon lighting** — The main-menu sun Easter egg now lights the moon from the sun's true on-screen direction — the lit limb points at the sun in any orientation (portrait or landscape), not just left/right — and the moon only fills to full once the sun has set behind the sky, staying near-black while the sun is up.
- **Pickup feed wrapping** — Long pickup names (e.g. "JAGGED STAR WAND OF DEADLINESS") now word-wrap into an upward-growing column capped to a container that clears the powerup dock, instead of sprawling across the bottom edge and overlapping the dock slots — with separate width caps tuned for portrait and landscape.
- **Armor no longer reads 0 on a suit picked up off the ground** — A suit auto-equipped straight off the ground now fills its armor plating immediately, instead of showing an empty armor bar until you re-equipped it from the bag.
- **Inner-monologue portrait matches the hero** — The hero's inner-monologue portrait now shows whatever he's actually wearing, so his SpaceZ HQ thoughts no longer flash the EVA-suit portrait before he's found the suit.
- **The opening scientist stops at the hero** — The lone SpaceZ HQ scientist that rushes the disarmed hero no longer clips into him and shoves him around — it now stops the instant it's next to him to land its harmless first swing, then folds back into the pack at normal mob speed once the blade is drawn.
- **Audio clipping** — Sound no longer clips when many sounds play at once: all voices now sum
  through a master limiter, and duplicate simultaneous event sounds (e.g. one
  blow killing several enemies) play once instead of stacking.
- **CONTINUE survives app updates** — Your in-progress run is now saved to the browser so exiting to the menu and then applying an app update (which reloads the page) keeps the CONTINUE button instead of dropping the run.
- **Modal text wraps instead of overflowing** — Long, data-driven strings — an affix-built weapon name like CRUEL EXECUTIONER'S AXE OF DEADLINESS, and any over-long dialogue, cutscene, intro, or pickup line — now wrap onto extra lines inside their box instead of spilling off the edge.
- **iOS edge-to-edge** — The game now fills the entire screen on iOS (Safari 26 and the installed PWA) instead of leaving a black dead band over the home-indicator / address-bar area.
- **iOS edge-to-edge** — Fixed the installed iOS app still reserving a black band over the home-indicator area by giving the page roots the fixed viewport height iOS requires for safe-area extension.
- **Dialogue fits vertical mobile** — Long in-world dialogue now wraps to the box's real width instead of running off the edge on a portrait phone, and a tap scrolls through any speech too tall to show at once.
- **Airborne attack graphics** — Swing arcs and muzzle flashes fired mid-jump now originate from the hero in the air instead of from the ground beneath him.
- **Steady vitals panel** — The HP/ST readouts now sit in a fixed-width slot, so the vitals panel no longer widens and narrows as the numbers change digit count (e.g. stamina 100 vs 85).
- **Main menu no longer scrolls** — The title screen (main menu) could be scrolled vertically; it is now locked in place so the menu stays fixed on screen.
- **SpaceZ HQ opening beat can't be stalled** — The scripted vanguard at SpaceZ HQ now draws the hero's blade and fires the opening dialogue when it closes to within range, rather than only on contact — so circling the rusher can no longer stall the intro indefinitely.
- **Steady title-menu descriptions** — Menu descriptions no longer shift the whole difficulty list on hover: each option's blurb row now reserves its space, so labels stay put instead of jumping as you move between EASY, MEDIUM, and the other rungs.
- **SpaceZ HQ opening strike lands on contact** — The vanguard scientist now reaches the hero before its first swing draws his
  weapon: the "a scientist took a swing at me" beat fires when the scientist is on
  top of him, not half a screen away, and the rusher outruns a fleeing hero so it
  can't stall.
- **Mouse-follow steering on desktop** — Restore cursor-follow (mouse-follow) steering on desktop: WASD/arrow keys now only take over while a movement key is held, so holding the cursor where you want the hero to go works again alongside the keyboard.
- **SpaceZ intro reads in order** — The opening VANGUARD scientist at SpaceZ HQ now holds at its post until the hero's "look at this place" arrival monologue has played, then breaks from the pack to rush and strike — so the scene reads monologue-first instead of the scientist reaching (and sitting glued to) the hero before his first read, which could stall the disarmed opening.
- **Intro monologue text overlap** — The level intro monologue's lines no longer print on top of each other — each line now stacks in its own row, so the hero's opening briefing stays readable on narrow (portrait) and landscape screens alike.
- Long achievement names now wrap inside the unlock banner (which grows taller to fit) instead of spilling past its gold frame.
- **Custom cursor on the character screen** — The 16-bit glove pointer now shows on the SELECT/NEW HERO screen, which
  previously fell back to the default arrow because its cursor value was invalid CSS.
- **Level picker no longer scrolls when it fits** — The developer SELECT LEVEL / mission list only scrolls when the ladder is too tall for the viewport, so the short shipped list no longer shows a needless scrollbar or clips its top row.
- **iPad UI scaling** — The title logo no longer clips off both screen edges on iPad-sized tablets
  (the desktop logo gate now accounts for the 2× large-screen UI scale), and
  the end-of-run buttons wrap instead of overflowing on narrow 2×-scaled
  tablet screens.
- **Level-up chooser shows only the points you spent** — The level-up and respec stat choosers now display only the stat points you
  personally spent, starting every character at zero. Previously the number next
  to each stat was the full effective stat — folding in the difficulty
  head-start, the automatic per-level growth, and gear bonuses — so a fresh ding
  looked like it already had points allocated you never picked.
- **Easy-mode opener no longer starves on loot** — Fixed EASY's opening map dropping far fewer items than MEDIUM: the auto-equip
  ranking over-valued a light cone weapon's cleave, so HQ's scripted SECURITY
  BATON downgraded the EASY hero off his ranged wand starter and collapsed his
  kill rate — and drops are rolled per kill. The melee AoE score is now damped
  (crediting a cone 2.5 targets and a full sweep 3.5, like ranged spread), and the
  SECURITY BATON's per-hit damage is raised so it is a respectable opener rather
  than the weakest weapon in the game.
- **Magnet respects bag space** — The item magnet now only reels in gear the hero can keep — a find that neither auto-equips nor fits the bag is left on the ground instead of piling up uncollectable at his feet.
- **Autoplay uses medkits and stamina potions** — The autoplay bot decided to heal and re-caffeinate but the app was dropping those inputs on the floor, so a botted run hoarded every kit it picked up. Autoplay now actually **spends medkits when its health drops and stamina potions when it runs dry**, matching how it pops powerups on sight.
- **NEW GAME form stays centred above the mobile keyboard** — The hero-creation screen now pins itself to the visual viewport, so the form
  stays centred in the space above the on-screen keyboard on iOS instead of
  hiding behind it. The screen is titled NEW GAME and the name field is labelled
  HERO NAME.
- **Taller settings lists on portrait screens** — Long settings lists (the DEVELOPER balance knobs, a full level ladder) now
  reach further down the screen on portrait devices instead of being capped mid-screen with a large empty band below.
- **Sound no longer stops intermittently** — Music and sound effects no longer stay silent after the browser or OS
  suspends the audio engine (an audio-device change, a background tab, or an
  iOS interruption). The engine now nudges the audio context back to life on
  its own every scheduler tick instead of waiting for a user gesture, so sound
  reliably recovers rather than requiring a lucky menu tap.
- **NEW HERO modal slides in, wraps, and cancels to the menu** — The NEW HERO create modal now slides up into view when opened, the HARDCORE
  description wraps to fit the box instead of running off a narrow phone, and
  CANCEL from PLAY → NEW GAME returns to the main menu (only the roster's "+ NEW
  CHARACTER" cancels back to the roster).
- **The bomb finally saves you** — Setting off a screen-nuke now clears a breather: the horde holds off for a moment instead of instantly repopulating the screen edges, and the blast cools the menace heat back to its baseline so the pack that returns is no denser or tougher than before — the panic button helps you escape instead of dooming the run.
- **Overkill knockback** — Kill knockback now reads the killing blow against the mob's starting HP: a body flies away in the direction it was struck and tumbles once per full extra health bar of overkill (2× starting HP spins once, 3× twice), instead of a distance-derived spin count that felt random.
- **Launch scene house grounded** — The house in the LAUNCH rocket cutscene now rests flush on the ground instead of floating a few pixels above it, closing the dark gap that showed between the house and the lawn.
- **Party no longer strands the hero disarmed** — At SpaceZ HQ the hero draws his blade even when his companions (or a conjured power) cut down the scripted vanguard before it reaches him — previously that left the hero disarmed for the whole level, unable to attack while his party fought on.
- **Cap-farm mutter yields to an evolved horde** — The hero's recurring "these enemies are pathetic" cap-farm thought now stays silent once menace has evolved the horde past stage 10, where the mobs are demonstrably no longer pathetic.
- **Achievement banner no longer blocks steering** — The achievement-unlock banner is now fully non-interactive so a touch under it always reaches the virtual dpad — on iOS its icon and text no longer swallow the steering tap.
- **Scroll the merchant's bag with a large carry** — The merchant shop's bag now scrolls to its last row on touch devices — a very large bag no longer hides its lower rows with no way to reach them.
- **Combined item stat rows** — Item cards now sum an armor piece's base bonus and its rolled affixes into one row per stat (MAX HP, CRIT, ARMOR, and each flat +STAT), instead of listing the same stat twice, and no longer print a redundant `(+N)` comparison chip that merely restates the value when the equipped piece has none of that stat.
- **Running always drains stamina now** — Movement below a full sprint could refill the sprint pool instead of spending it, so running, pausing for a moment, and running again regenerated stamina the instant you pushed off — the stick's lower range sat on the recovering side of the curve. Moving now always spends stamina in proportion to your pace, and the pool refills only while you stand still.
- **Roster NEXT standing follows the unlock graph** — The LOAD GAME roster card's "NEXT: …" standing now follows the OR-gated difficulty unlock graph instead of a flat five-rung count: beating any starting lane (easy, medium, or hard) points at NIGHTMARE, and beating NIGHTMARE points at JESUS CHRIST! — no longer suggesting an easier lane the hero already skipped past.
- **Bomb no longer floods the horde back in one frame** — After a screen-nuke's calm ends, the cleared swarm now walks back in gradually instead of the whole near-floor snapping onto the player at once.
- **No duplicate boss corpse after a level clear** — Felling a level's boss no longer draws a second, phantom boss body over the real corpse when you STAY on the cleared field — the pulsing amber tap-target ring now marks the boss's own fallen body, which was already lying there.
- **Fog of war clears again after resuming a run** — Resuming a parked run (e.g. after an app update reloads the page) no longer freezes the fog of war — the thawed exploration grid is rebuilt as a typed array so the fog renderers keep clearing as the hero moves.
- **Autopilot fights at weapon range instead of diving into the pack** — The autoplay bot no longer charges into the middle of the horde. During a scripted disarmed opening it holds at the pack's edge and lets the vanguard come to it (rather than burying itself unarmed), and once armed a ranged loadout holds near its weapon reach and thins the crowd from a distance while pushing the objective, instead of hugging the front line. New positioning knobs live in `bot.yaml` (per-level overridable).
- **Jumping needs stamina** — The hero can no longer hop with an empty (or near-empty) sprint pool — a jump now requires enough stamina to cover its takeoff cost, so a winded hero must walk it off instead of tap-jumping on fumes.
- **Steady level-up modal height** — The level-up chooser no longer shrinks when the reveal timer runs out — the arming bar's slot stays reserved so the stat buttons don't jump the instant they become clickable.
- **Right-size the update toast on desktop** — The "a new version is ready" prompt no longer balloons to twice its size on large screens — it now renders at the phone baseline so it sits neatly at the bottom of the menu instead of dominating it.
- **BOT VIEW plays the scripted opening and pauses on app-switch** — DEVELOPER → BOT VIEW no longer soft-locks a level with a scripted opening strike (SpaceZ HQ): a leveled arrival hero whose difficulty read-ledger already holds the "draw your weapon" beat now still arms when the vanguard reaches him, instead of standing holstered while the pack piles up around him. Switching away from a watched BOT VIEW run now pauses it (and keeps it paused) instead of playing on in the background.
- **Native app rotates to portrait** — The iOS/Android app no longer locks to landscape — it now follows the device orientation, so holding the phone upright switches the game to its portrait layout just like the website does.
- **Demo starts SpaceZ with the difficulty's start loot** — The HOW TO PLAY demo (and developer BOT VIEW) no longer opens the first mission with a leveled kit of randomly rolled gear — on the campaign's opening map a starting lane now begins from a fresh rookie's difficulty start loot, exactly as a new player would.
- **HOW TO PLAY tooltips + level-up demo** — HOW TO PLAY teaching tooltips no longer clip off the screen edge on larger viewports (the callout now slides back on-screen while its caret keeps pointing at the control). The demo also plays the level-up chooser at a watchable pace — the modal reveals, a tooltip teaches stat allocation, and each banked point is spent one visible tap at a time.
- **Loading screen font** — The "Loading…" screen shown on reload now renders in the pixel menu font instead of a plain system font, so it reads as one screen with the title menu it hands off to.
- **Auto pilot HUD moved out of the notch** — The AUTO PILOT controls no longer hide behind the phone's status bar / Dynamic Island — they now sit in a compact rounded panel under the minimap with STOP and speed buttons, plus a live gold-coin drain monitor beneath it.
- **iOS name entry** — On iOS the keyboard no longer shows the helper bar that ate a third of the screen, and the HERO NAME field stays centred in the space above the keyboard instead of hiding behind it.
- **Native app black screen** — The native app now picks up a freshly bundled site on every rebuild (the packed webroot re-extracts whenever its content changes, and the WebView no longer serves stale cached pages), and a game that fails to load shows a RELOAD screen instead of going silently black.
- **Autopilot stamina discipline** — The autopilot no longer bounce-hops across the field when working around an
  obstacle (its unstick escape now walks, hopping only when a body pins it or it
  is walled in), and a winded hero now stops to catch his breath on a quiet field
  — standing until the sprint pool starts refilling, then walking until it is
  back at the reserve — instead of jogging around on an empty pool forever.
- **Purposeful autopilot jumps** — The autoplay bot no longer wastes stamina on jumps that go nowhere: every jump is now committed to a purpose before takeoff — fleeing a pack down an open lane or (ranged/magic only, since a melee blade can't swing mid-air) repositioning over a contact — steered at its committed landing ground for the whole flight, and refused entirely when a wall blocks the lane so it would only rise in place.
- **Broken weapons no longer desync your health and stamina bars** — A weapon that granted bonus STAMINA (and the health/sprint pools it deepens) left those pools sized to it even after it broke out of your hand, so a drink or heal could top off to a stale maximum until the next level-up or stat spend re-derived them. Breaking a weapon now re-derives the pools immediately, exactly like equipping or unequipping one.
- **AUTO PILOT keeps a bag slot open** — AUTO PILOT (and BOT VIEW) now trim the bag back to one free cell AFTER each simulation step instead of before it, so the "keep one slot open" discipline actually holds at rest — the reserved cell was being refilled by the same step's pickup, leaving a watched auto-run riding a full bag.
- **No AUTO PILOT row while watching a bot** — The pause screen no longer offers the coin-metered AUTO PILOT row when the run is already being played by a bot (BOT VIEW), where the self-play option makes no sense.
- **Malice escalation is judged once per attack** — Rampage/malice no longer escalates once per body: all kills from one attack — a shotgun volley's pellets, a melee cleave, one cast's burst — now bank a single menace judgment, so multi-kill weapons no longer send the meter (and the evolution ratchet) off the scale on the first hits.
- **Tidier coin-store BUY confirmation** — The coin-store BUY confirmation no longer shows a redundant subtitle that wrapped to two lines on portrait phones; free grants drop it entirely and paid buys keep a short charge confirmation.
- **Settings menu portrait fix + tidier subtitles** — Fixed the BOT VIEW game-speed screen overflowing on portrait phones (its values
  were pushed off the right edge), and pruned redundant menu subtitles — the warp
  and BOT VIEW pickers no longer repeat the same line on every row, and the
  SETTINGS list drops its self-evident row descriptions.
- **Horde-scale performance** — Heavy scenes no longer tank the framerate: the fog of war and minimap now repaint only what changed instead of every pixel every frame, and the horde tick skips the sight checks and catalog lookups the dormant crowd never needed.
- **Level-up timer bar** — Restore the level-up chooser's arming timer bar, which had collapsed to zero
  width after it moved to the shared pixel-bar component.
- Vertically centre the coin, stopwatch, and speed-bolt icons against their
  numbers in the AUTO PILOT speed picker — the overlay's blanket canvas rule
  had been top-pinning the PURSE and column values so they rode high of their
  icons.
- **The autopilot respects black holes** — The autopilot now bolts clear of a gravity well before the pull can drag it into the core, and stops chasing loot or chests parked inside a well's no-go ring — it no longer feeds itself to the rift's black holes.
- **Merchant stalls stocking unique gear no longer crash the autopilot** — The autopilot's merchant recovery no longer crashes when a stall's stock includes a unique armor piece (it scored every stall entry as a weapon).
- **JESUS set pieces are killable again** — JESUS pinned elites and bosses now anchor their health to the authored nightmare bar (times a JESUS premium) instead of falling through to the minion per-level hp curve, which had inflated them to 30k-320k hp — 10-30 minute fights no build could sustain.
- **The autopilot finishes the boss fights it starts** — The autopilot now stays locked on a boss once the fight has started instead of drifting back to the swarm between exchanges, stops farming spawners on JESUS (where the horde levels in lockstep and farming never closes the gap), and hunts a map's elites once the run is committed to the endgame - so keycard quest chains like Eastworld's compound door run even when the hero is under-leveled.
- **Autopilot and combat-HUD performance** — Big fights run roughly twice as fast with the AUTO PILOT driving: the bot now scans the horde once per tick instead of re-sorting it for every decision, the HUD stops re-rendering on every regen tick, hit resolution no longer allocates per blow, and off-screen effects skip their draw calls.
- **Autopilot reads the minimap** — The autopilot no longer gets lost at a long wall whose end is off-screen: its wall-end sense now sees everything already uncovered from the fog of war (the minimap's memory), and when no end is known anywhere it traces the wall toward the nearest fog to go find it instead of standing still or circling.
- **Smooth stamina bar** — The HUD stamina bar now updates every frame (the render loop writes it straight to the DOM), so the sprint pool drains and refills glass-smooth instead of stepping.
- **Level-up holds behind a spell unlock** — When the last stat point placed unlocks a new power, the run now stays paused
  behind the "SPELL UNLOCKED" reward until it's dismissed — previously the
  level-up modal closed and play resumed the instant the point landed, letting
  the hero fight (and die) unattended while the player read the new spell.
- **Talent-era copy and tooling** — The level-up stat panel now describes the passive talent trees each offensive stat feeds instead of the removed mana pool and cast-spell unlocks, and SPIRIT reads as the out-of-combat health-regen stat. The consumable dock and its controls no longer mention the retired mana potion.
- **Store-bought coins spendable on the first run** — Store-bought coins held by a brand-new hero (shown as their PURSE on the coin-store screen) are now funded into the run at start, so AUTO PILOT can actually spend them before the hero's first level clear — instead of reading 0 / "CAN'T AFFORD" while the menu shows a full purse.
- **Autopilot no longer stalls circling the moon basins** — The autopilot could get pinned in a walled basin (notably THE MOON), backpedalling away from the horde in a quarter-circle arc that never drained the knot or advanced through the ridge gaps. A healthy ranged/magic hero on a path level now KITES FORWARD instead — repositioning toward the objective with a net-forward heading when a body pushes inside its hold band — so it clears the finite spawn knots on the move and threads the serpentine to the boss.
- **Autopilot fast-forward no longer stalls to 1 FPS** — At high fast-forward speeds (the 16x AUTO PILOT rung and BOT VIEW), the frame rate could collapse to ~1 FPS once the autopilot started sizing up objectives sealed behind a gate or wall: each unreachable pathfinding query flooded the entire nav grid before giving up, many times per frame. The pathfinder now rejects an unreachable goal in constant time via precomputed nav-grid connectivity, so the run stays smooth at any speed.
- **One level-up flash** — The level-up chooser no longer flares its own golden bloom behind the box, so the ding reads as a single celebration instead of appearing to fire twice.
- **The autopilot stops jittering back and forth** — The autopilot no longer strobes left/right/up/down when two of its reads
  disagree: once it picks a direction it keeps it for half a second before it may
  turn around, and if it wants to reverse sooner it stands still and waits instead
  of twitching in place — which also lets it catch its breath. Ordinary turns,
  course corrections, stopping, and every reflex dodge are as quick as ever.
- **The autopilot wears the upgrades it finds** — AUTO PILOT (and the developer BOT VIEW) now equips the stronger armor, charms
  and bags it picks up instead of hauling them in a full bag — it no longer obeys
  the human's AUTO-EQUIP setting, which ships off — and a hero holding a blade
  with a better gun banked finally draws it.
- **The death scene no longer plays behind a wall of frozen numbers** — The fight's damage numbers, crits, XP pops, health bars and shots in flight now
  fade away the moment the hero falls, instead of hanging frozen over his body for
  the whole death tableau — so his last moments are actually watchable.
- **The pickup card no longer blocks touch steering** — A tap-to-equip upgrade card parks in the lower centre of the screen — exactly
  where a thumb anchors the virtual dpad — and used to swallow the press, leaving
  the hero unsteerable for the card's whole time on screen. A hold now steers
  straight through it while a quick tap still equips the find.
- **The autopilot throws away the WORST loot, not a keeper it can't part with** — The autopilot's bag discipline now sheds strictly by rarity — it never throws a
  unique away to make room for a magic, an artifact is no longer treated as
  ordinary loot, and a bag holding nothing but treasure sheds its least precious
  piece instead of staying full and refusing every drop for the rest of the ride.
- **LOAD GAME screen fit and finish** — The hero roster is centred properly (the scrollbar gutter no longer pushes every save slot off-centre), a slot can no longer be squeezed until the hero's name is shaved off the top of the card, a tall phone held upright shows more of the roster, and the roster now leaves through the same BACK row every other menu uses — full-size label, with its arrow icon on touch. PLAY's NEW GAME and LOAD GAME rows dropped the subtitles that only restated their labels, and EXPORT / IMPORT CHARACTER gained icons of their own.
- **Title screen frame rate** — The title screen no longer recomputes the style of every element on screen sixty times a second: the moon's live orbital centre, which only the detonation overlay reads, was being written as an inherited custom property onto the shared parent of the whole screen. On the coin store — the busiest title surface — this alone cost most of the frame rate.
- **The bag pouch no longer covers the weapon switcher** — Opening the weapon switcher used to leave the bag pouch drawn over its first slot — hiding that weapon and swallowing the tap meant for it; the pouch now stands aside while the switcher is open and drops back the moment it closes.
- **The native app plays offline again** — The native shell streamed the live website instead of serving the copy bundled
  inside it, because `app.config.js` always set `extra.gameUrl` — which
  `src/config.ts` treats as "skip the local server". Store builds now run fully
  offline from the embedded game as designed.
- **Modals line up, read clearly, and look like one family** — Every modal now centres its title, subtitle and footer buttons instead of
  pinning them to the left rail; the AUTO PILOT picker's column headers, its
  session scoreboard captions and the LOST & FOUND's expiry warning are readable
  on a phone; the companion screen is a modal sized to its own content with every
  slot labelled instead of a mostly-empty bar; and the level map and talent picker
  no longer run off the bottom of a landscape phone.
- **A broken frame no longer freezes the run** — A single unhandled error inside the game loop used to unschedule it for good —
  the world froze mid-frame while the page stayed alive around it (the music
  played on, queued pickup cards kept popping, buttons still answered), which
  read as an inexplicable hang rather than a crash. Each frame's simulation and
  drawing are now caught separately and the next frame is always scheduled, so
  the run plays on and the failure is written to the log instead of taking the
  game down with it.
- **The sitemap now reports when each page really changed** — Every URL in `sitemap.xml` carried the build's own timestamp, so a privacy policy nobody had touched claimed a fresh modification date on every deploy — the pattern search engines use to decide the whole `lastmod` field is untrustworthy and ignore it. Each entry now derives its date from the last commit that touched the page's sources, and the SEO check fails the build on a `lastmod` that is malformed or in the future, or on a listed URL the build doesn't emit.
- **The bottom of the screen on mobile Safari** — On iOS Safari the game shell was sized to the viewport as it would be with the browser toolbars retracted, so everything anchored to the bottom edge — the powerup dock, the achievement toast, the dialogue box, the version footer — hung below the visible screen with only its top edge showing, the achievements and arsenal windows dropped their lower half (BACK row included) off the bottom, and the title menu could be scrolled; the shell now tracks the viewport that is actually visible, while installed app builds keep painting edge to edge.
- **iOS autocomplete on the hero name** — Tapping an iOS keyboard suggestion while naming a new hero now fills the field
  with the suggested name instead of inserting a lone space.
- **Loot history scrolls vertically only** — The AUTO PILOT loot history no longer scrolls sideways — a long affix-built item
  name wraps onto a second line instead of running off the box.
- **The library is reachable by search engines** — The title screen's LIBRARY row is now a real link, and the sitemap lists the
  game's own screenshots and every mission map, so the reference pages and the
  game's pictures can actually be found.
- **The library scrolls in the app** — In the iOS app the library's pages could not be scrolled past the first screen
  — the game's no-scroll viewport rule was being applied to them too.
- **Library reads right on a phone** — Library pages no longer scroll sideways on a narrow screen — the section nav
  takes that scroll inside its own box — every stat figure is set in the game's
  pixel font rather than the system sans, and the pages no longer explain where
  their own numbers come from.
- **Library search results and internal links** — The library's meta descriptions now read grammatically ("is an artifact", "is a
  charm", "is footwear" rather than "a artifact", "a a charm", "a footwear"), every
  page carries a unique title and description, a named relic's BUILT ON link
  reaches the page its base is written up on instead of a 404, each base page lists
  the relics built on its whole grade ladder, and the footer links the privacy and
  support pages.
- **The released library keeps its own pictures** — After a release, the deploy built every slot's library pictures once and shared
  them, so the released site would have shown the art and link previews generated
  from `main` beside its own release's numbers and prose. Each slot now gets the
  pictures belonging to the content it was actually built from, and a picture set
  whose generation failed part-way is no longer mistaken for a finished one.
- **The autopilot stops planning routes through walls** — The autopilot's nav grid now promises a route a BODY can walk rather than a chain of spots it could stand in, so the hero no longer grinds against a wall his own plan pointed him through — and on a generated map he searches out the elevator to a sealed boss room instead of pressing the dead rock it sits behind.
- **Blood on the floor no longer looks like it is bubbling** — The wet sheen that travelled across soaked ground read as the blood simmering
  rather than glistening, so it is gone — blood that has settled on the floor now
  holds perfectly still.
- **The library is reachable without a trailing slash** — Visiting `/library` in an installed or previously-visited browser opened the
  game instead of the reference site — the service worker's navigation denylist
  only recognised the trailing-slash form, so it answered the bare URL with the
  cached app shell.
- **Achievements filter spacing** — The ACHIEVEMENTS shelf now keeps a steady band of space under the ALL /
  UNLOCKED / LOCKED pills, so the badge list no longer scrolls up against them.
- **Achievements window fits the screen** — The ACHIEVEMENTS shelf no longer runs off the bottom of the screen on tall viewports — the window is capped to the visible area so it sits with the same gap above and below, and its badge list absorbs the difference by scrolling.
- **Minimap frame, pause target, and AUTO PILOT coins** — The HUD minimap now draws ONE rounded corner instead of two mismatched ones (its
  frame's radius was fixed in px while the rampage gauge scaled with the screen),
  the PAUSE tap target reaches twice as far down the map so aiming at the clock no
  longer expands the map mid-fight, and the AUTO PILOT scoreboard separates the
  ride's takings from its price — COINS now counts what the flight EARNED, with a
  `COST:` line under the heading for what it billed. Every coin readout in the game
  is abbreviated to at most four glyphs (`8,650`, `10.5K`, `10.5M`).
- **Effects gallery top bar** — The developer effects gallery's BACK button and search box now sit on the field
  as one row: the search box wears the same hard drop shadow the pixel button
  does, so the two blocks line up flush at both edges.
- **Modals cover the run** — Full-screen modals — the AUTO PILOT loot history above all, the one the world
  keeps running behind — no longer have the nuke's fireball, the level-up burst, a
  powerup aura or a room's AREA CAPTION painted across them.
- **AREA CLEARED is an announcement, not a pickup** — Wiping out a pack now flashes "AREA CLEARED" across the middle of the field
  instead of filing it in the lower-corner loot feed as "PICKED UP AREA CLEARED";
  the merchant, repair, companion and auto-pilot notices drop the same stray
  "PICKED UP" lead-in.
- **Generated maps carry a real horde again** — A run on a GENERATED MAP now reads its own carved level instead of the mission's
  hand-drawn one, and its spawn points stand as thick as the authored campaign's —
  so the map is full of monsters, the lair elites come out of their doors, and the
  guidance arrow stays silent the way the feature intends.
- **The opening beat plays on a generated map** — A generated map no longer walls the horde off the spot the hero lands on, and it
  stands the mission's opening crowd around him — so the scripted first blow that
  draws his blade actually reaches him instead of leaving him holstered.
- **The autopilot can navigate a generated map** — The autopilot now uses its route planner, wall sense and wedge escape on any map
  with walls in it — not only on maps that author an intended path — so it stops
  grinding itself into the walls of a carved mission.

### Removed

- **SPEED stat removed** — The SPEED attribute is gone: the walk is now the base pace bent only by STRENGTH (and sprint buffs), so DEXTERITY becomes the mobility attribute. The level-up chooser and respec drop the SPEED row, the "OF THE HARE" affix retires, and gear/sets that granted SPEED now grant DEXTERITY. Veterans carried over from an older save get their spent SPEED points refunded as fresh picks to re-spend.
- **Cast spells and mana** — Retire the tap-to-cast spell system and the mana pool it ran on — the hero now
  fights with his weapon and always-on passive talents. The HUD spell bar, the
  mana bar, mana potions (the blue gatorade), and their low-mana mercy drops are
  gone. Adopted characters keep their stats and convert their old spell
  investment into talent points.
- **The SPIRIT stat** — Retire SPIRIT and the slow out-of-combat health trickle it drove — with mana
  gone it bought too little to compete with the other attributes, so the level-up
  chooser now offers five stats (STAMINA, STRENGTH, DEXTERITY, INTELLECT, LUCK)
  and gear no longer rolls "+SPIRIT" or names a find OF THE WHALE. Points a hero
  banked in SPIRIT come back as unspent picks the next time they carry a build
  into a level; a run parked mid-level from an older build can't be resumed.

