# Manuscript — _Gone in Space_

> **This file is the single source of truth for the game's story and dialogue.**
>
> Every spoken line, monologue, caption, and piece of found lore in the game is
> transcribed here verbatim, in narrative order. When the shipped content (the
> data files listed under [Where the data lives](#where-the-data-lives)) and
> this manuscript disagree, **this manuscript wins** — the data is wrong and must
> be brought back into line.
>
> **Changing the story is a two-step commitment.** If a change to the game
> conflicts with what is written here, the manuscript is updated **only after the
> user confirms the manuscript change** (the user may also grant that
> confirmation ahead of time, as part of the instruction that requests the
> change). Never silently edit the story in code and leave this file stale, and
> never rewrite this file without that confirmation. Keep the two in lockstep: a
> PR that touches dialogue/story data updates this manuscript in the same change.

This document sits beside [`game-content.md`](./game-content.md) (the content
walkthrough — systems, levels, roster) and captures only the _words_: the
script. A sequel replaces this file wholesale.

## Premise

Ada went out for chips and soda on movie night and never came back. The
tracking beacon the hero sewed into her jacket points off-planet. The hero is a
spaceship builder who once worked at SpaceZ until an AI replaced him — so he
knows the building cold. He raids SpaceZ for the one missing ingredient his
interplanetary drive needs, then follows the beacon to the moon, where something
under the Sea of Tranquility is not dead enough.

The conspiracy, one find at a time: SpaceZ has been flying to the moon in secret
on hardware nobody built (Level 1), because of the wreck under the Sea of
Tranquility, the moonbase feeding off it, and the man who never really came home
in '69 (Level 2).

---

## Prelude (cutscene)

_The night everything started. Movie night in the living room. The crude sword
mounted on the back wall is the one thing the hero takes off it to go after her —
his starting weapon on the moon._

> **CAPTION:** FRIDAY NIGHT. MOVIE NIGHT.

**ADA:** WE'RE OUT OF CHIPS. / AND SODA.

**ME:** MOVIE'S STARTING.

**ADA:** FIVE MINUTES. / KEEP MY SPOT WARM.

_(Ada crosses to the door and exits.)_

> **CAPTION:** SHE TOOK HER JACKET. / THE ONE I FIXED THE ZIPPER ON.
>
> **CAPTION:** TWO HOURS LATER.

**ME:** ...

**ME:** ADA?

> **CAPTION:** SHE NEVER CAME BACK.
>
> **CAPTION:** THE OLD SWORD OFF THE WALL. / IT'S WHAT I BRING TO SAVE HER.

_(Fade to black.)_

---

## Level 1 — SPACEZ HQ

A cleanroom raid for the interplanetary drive's one missing ingredient.

### Opening monologue (hero, black screen)

1. ADA WENT OUT FOR CHIPS AND SODA. / SHE NEVER CAME BACK.
2. THE BEACON I SEWED INTO HER JACKET / POINTS STRAIGHT OFF-PLANET.
3. SO I'M BUILDING A SHIP. / THE DRIVE NEEDS ONE INGREDIENT.
4. SPACEZ KEEPS IT IN THE CLEANROOM. / I USED TO KEEP IT THERE MYSELF.
5. I DESIGNED HALF THESE ENGINES. / THEN THEY REPLACED ME WITH AN AI.
6. SO I KNOW EVERY DOOR AND KEYCARD. / THEY SHOULD'VE CHANGED THE LOCKS.
7. THE INGREDIENT'S IN THE VAULT. / WE DO THIS THE HARD WAY.

### Elites (spoken on arrival; last words as they fall)

The five staffers who know too much, pinned along the route so the plot unspools
in walking order.

#### THE NIGHT MANAGER — the secret launches

- YOU. YOU'RE NOT ON THE ROSTER. / NOBODY IS ON THE ROSTER. THAT'S / THE WHOLE POINT OF THE NIGHT SHIFT.
- THE LAUNCHES YOU DON'T HEAR ABOUT / LEAVE AFTER MIDNIGHT. NO MANIFESTS. / NO NAMES. MOONWARD. ALWAYS MOONWARD.
- I SIGN NOTHING. I SEE NOTHING. / AND YOU - YOU WERE NEVER HERE.

**Last words:** HHK... TELL THEM... / I WAS NEVER... HERE...

_Drops: STORAGE KEYCARD._

#### THE ARCHITECT — the old bench partner

_The hero's old bench partner from when they built engines together, before
SpaceZ swapped them both for an AI. He now heads the superintelligence program
and has cut a PASSAGE CHIP into his own skull to pass as a machine._

- MY OLD BENCH PARTNER. STILL / SOLDERING TOYS IN A GARAGE? / I BUILD MINDS NOW. A REAL ONE.
- QUIT? YOU CAME HERE TO TELL ME / TO QUIT? THIS 'EVIL COMPANY' GAVE / ME PURPOSE. A SUPERINTELLIGENCE.
- I CUT THE CHIP IN MYSELF. FLESH / IS A ROUGH DRAFT. HUMANS ARE / OBSOLETE - YOU MOST OF ALL.
- NO MORE TALKING, OLD FRIEND. / NOW YOU WILL DIE.

**Last words:** THE CHIP... TAKE IT... / IT WAS NEVER... MINE...

_Drops: the PASSAGE CHIP (+1 INT passive) he operated into himself._

#### CHIEF OF SECURITY — Ada on Pad 2

- STOP RIGHT THERE. / I KNOW WHY YOU'RE HERE. / THE GIRL IN THE JACKET, RIGHT?
- CAMERAS CAUGHT HER AT THE VENDING / MACHINES. THEN THE SUITS CAME AND / THE FOOTAGE WENT TO PAD 2.
- THE MANIFEST DIDN'T SAY PASSENGER. / IT SAID SPECIMEN. NOW FORGET IT - / LIKE I WAS PAID TO.

**Last words:** UGH... PAD 2... / SHE'S ON... PAD... 2...

_Drops: CARGO MANIFEST, and the EVA space suit (forced epic) the hero needs to
leave the planet._

#### DR. NOVA — the drive is alien

- FASCINATING. AN INTRUDER WITH / FUNCTIONING LEGS. DO YOU KNOW WHAT / WE KEEP IN THE CLEANROOM VAULT?
- THE DRIVE EVERYONE CALLS OURS - / WE DIDN'T BUILD IT. WE DUG IT OUT / OF THE SEA OF TRANQUILITY IN '69.
- FIFTY YEARS REVERSE-ENGINEERING / A MACHINE THAT ISN'T BROKEN. / IT'S JUST WAITING TO GO HOME.

**Last words:** IT'S STILL... HHH... / STILL... HUMMING...

_Drops: VAULT KEYCARD._

#### THE JANITOR — the man who came back wasn't the man they sent

- MIND THE FLOOR. I JUST DID IT. / THIRTY YEARS I'VE MOPPED THIS LAB. / YOU LEARN THINGS, MOPPING.
- LAST TUESDAY A BADGE PINGED IN: / N. ARMSTRONG. FUNNY THING, THAT. / MAN'S BEEN DEAD SINCE 2012.
- WHOEVER CAME BACK FROM THAT MOON / IN '69... IT WASN'T THE FELLA / THEY SENT UP. NOW DROP THE WEAPON.

**Last words:** AND I JUST... URGH... / ...DID THIS FLOOR...

### Boss — MUSKRAT (the mutant rat who ate the ingredient)

- SQUEAK. / ...NO. NO MORE SQUEAKING. / THE THING I ATE FIXED MY TONGUE.
- THE INGREDIENT YOU CAME FOR? / THEY KEPT IT IN A CHEESE-COLORED / BOX. OF COURSE I ATE IT.
- NOW IT HUMS IN MY BELLY AND I / HEAR EVERYTHING. THE SUITS. THE / PADS. THE CARGO THAT CRIES.
- THEY FLEW YOUR GIRL OUT TONIGHT. / PAD 2. MOONWARD. SHE ASKED FOR / CHIPS. NOBODY GAVE HER ANY.
- YOU WANT THE CORE, LITTLE BUILDER? / IT'S KEEPING MY DREAMS SO WARM. / COME TAKE IT OUT OF ME.

**Last words:** SQUEAK...? NO... / SQUEEEAK... AFTER ALL...

_Drops: PLASMA CUTTER._

### Found lore (story items)

**STORAGE KEYCARD** _(opens Supply Bay B)_

- A GREASY KEYCARD. 'SUPPLY BAY B'. / SOMEONE WROTE 'SPARE PARTS' ON IT / IN MARKER. HANDY. I BUILD SHIPS.

**VAULT KEYCARD** _(opens the cleanroom vault)_

- A RED KEYCARD MARKED 'CLEANROOM / VAULT - R&D DIRECTOR ONLY'.
- UNDER THE CLEARANCE STRIPE, TINY / PRINT: 'IF IT HUMS, DO NOT ANSWER.'

**CARGO MANIFEST**

- TONIGHT'S LAUNCH MANIFEST. / PAD 2. DESTINATION: 'SITE T'.
- CARGO: SUPPLIES, REGOLITH DRILLS, / AND ONE LINE ADDED BY HAND - / 'SPECIMEN 7. FEMALE. DO NOT FEED.'
- SHE WENT OUT FOR CHIPS AND SODA.

**ANTI-GRAV UNIT** _(the drive's missing ingredient, found in the vault)_

- A RING OF METAL THAT ISN'T METAL. / IT FLOATS AN INCH OFF MY PALM / AND POINTS AT THE SKY. ALWAYS.
- THE TAG READS 'TRANQUILITY SAMPLE / 1969-002. PROPERTY OF NOBODY.' / THIS IS WHAT MY DRIVE WAS MISSING.

---

## Level 2 — THE MOON

Ada's beacon dies near the old flag. Something up here isn't dead.

### Opening monologue (hero, black screen)

1. THE RAT COUGHED UP THE INGREDIENT. / THE SHIP FLEW. HERE WE ARE.
2. ADA'S BEACON DIES NEAR THE FLAG. / SOMETHING UP HERE ISN'T DEAD.
3. I DREW THE LANDER THAT BROUGHT THE / LAST CREW HOME - BEFORE THE AI / REDREW IT WITHOUT ME.
4. SO I KNOW THIS SITE COLD. / EVERY CRATER. THE FAST LINE / STRAIGHT TO THAT FLAG.
5. STAY ON THE DUST. KEEP MOVING. / I'M COMING, ADA.

### Hero's thought — first OPTIMUS kill on the moon

_Fires once, the first time the hero downs an OPTIMUS here (in his own voice)._

- A SPACEZ UNIT. UP HERE. / SAME TIN MAN FROM THE NIGHT / SHIFT, WALKING THE DUST.
- THEY DIDN'T JUST SHIP HER / MOONWARD. THEY BUILT A STAFF / TO MEET HER. COMPANY METAL, / GUARDING WHATEVER'S DOWN THERE.
- OKAY. ONE BOLT AT A TIME. / KEEP MOVING. FIND ADA.

### Elites (spoken on arrival; last words as they fall)

Four ghosts with unfinished business, pinned along the walk to the flag: the
grave under the dust, the corporate moonbase, the clone, and Ada's trail going
below.

#### MISSION SPECIALIST — the wreck under the dust

- A LIVE ONE. BREATHING AND / EVERYTHING. WE STOPPED THAT / HABIT DECADES AGO.
- THE BROADCAST SAID ONE SMALL STEP. / IT DIDN'T SAY ONTO WHAT. THERE WAS / A WRECK UNDER THE DUST, KID.
- OLDER THAN THE DUST. WE PLANTED / THE FLAG ON A GRAVE AND SMILED / FOR THE CAMERA. SMILE'S OVER.

**Last words:** ONE SMALL... STEP... / ONTO A... GRAVE... HHK

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

- CLAIM'S TAKEN. WHOLE ROCK'S / TAKEN. STAMPED, FILED, AND / PAID FOR BY SPACEZ.
- I DUG THEIR TUNNELS AT SITE T. / FAR SIDE. YEARS OF FREIGHT RUNS / NOBODY DOWN THERE EVER TRACKED.
- THEN LAST MONTH THE CARGO / MANIFESTS CHANGED. THE CRATES / STARTED BREATHING. I QUIT. BADLY.

**Last words:** THE CLAIM'S... URGH... / ...YOURS NOW, KID...

_Drops: SPACEZ BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

- HOLD STILL. ROUTINE SCREENING. / HEARTBEAT... PRESENT. UNUSUAL. / YOU'LL WANT THAT LOOKED AT.
- I RAN THE CREW PHYSICALS IN '69. / TWO CHARTS FOR THE FIRST MAN. / ONLY ONE OF THEM EVER FLEW HOME.
- THE ONE WHO WAVED AT THE PARADES / GREW IN A TANK ON THE RIDE BACK. / THE REAL ONE? STILL ON SHIFT. / YOU'RE WALKING TOWARD HIM.

**Last words:** TWO CHARTS... HHH... / ONE STILL... BEAT...

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

- SHH. I'M CHARTING. THE MAP / KEEPS CHANGING UNDERNEATH. / TUNNELS WHERE NO TUNNELS WERE.
- A SIGNAL CROSSED MY GRID LAST / NIGHT. SMALL. WARM. A JACKET / BEACON, MOVING FAST - THEN DOWN.
- STRAIGHT DOWN. INTO THE WRECK / UNDER THE FLAG. THEY ALL GO / BELOW, FRIEND. NOBODY MAPS BELOW.

**Last words:** SHE WENT... STRAIGHT... / ...DOWN... OFF MY MAP...

### Boss — ARMSTRONG (the giant astronaut ghost guarding the flag)

- YOU SMELL LIKE EARTH. / RAIN AND CUT GRASS AND / TELEVISION. GO HOME.
- I PLANTED THIS FLAG. ONE SMALL / STEP. THEN THEY FOUND THE WRECK / UNDER MY BOOTS AND EVERYTHING / AFTER THAT WAS THEATER.
- THEY GREW A SMILING ME ON THE / RIDE HOME. HE SHOOK THE HANDS. / HE CUT THE RIBBONS. HE DIED IN / A BED. LUCKY HIM.
- I STAYED. SOMEBODY HAD TO STAND / WATCH OVER THE THING DOWN THERE. / IT SINGS, YOU KNOW. THE COMPANY / MEN DANCE TO IT NOW.
- THEY CARRIED A GIRL PAST ME LAST / NIGHT. SNEAKERS. LOUD. SHE BIT / TWO OF THEM. THEY TOOK HER BELOW, / TO THE SINGING THING.
- YOU WANT TO FOLLOW? THEN TAKE / THE WATCH FROM ME, EARTHLING. / I ONLY EVER LOSE TO THE WORTHY.

**Last words:** THE WATCH... HHH... / IT'S... YOURS... NOW...

_Drops: MACHETE._

### Found lore (story items)

**APOLLO MISSION LOG**

- A FLIGHT LOG, VACUUM-CRISP. / JULY 1969. HALF THE LINES ARE / BLACKED OUT WITH GREASE PENCIL.
- '...THE SEA OF TRANQUILITY IS / NOT EMPTY. STRUCTURE UNDER THE / DUST. IT WAS HERE FIRST.'
- 'HOUSTON SAYS PLANT THE FLAG / ON TOP OF IT AND SMILE.'

**SPACEZ BLUEPRINTS**

- BLUEPRINTS: 'SITE T - FAR SIDE / LOGISTICS'. A WHOLE MOONBASE, / STAMPED SPACEZ, DATED YEARS AGO.
- EVERY CORRIDOR DRAINS DOWNWARD, / INTO THE OLD WRECK. THE BASE ISN'T / BUILT ON THE MOON. IT'S PLUGGED IN.

**SECOND MAN DOSSIER**

- A FILE: 'PROJECT SECOND MAN'. / MEDICAL CHARTS FOR N. ARMSTRONG. / TWO SETS. IDENTICAL. ALMOST.
- 'ORIGINAL DECLINED TO RETURN. / REPLACEMENT GREW NICELY IN / TRANSIT. WAVED ON CUE.'
- THE MAN ON EVERY POSTER BACK / HOME WAS THE COPY. THE REAL ONE / IS STILL UP HERE. GUARDING.

---

## Where the data lives

The manuscript above is the truth; the files below are its implementation. Each
line here appears verbatim in one of these, and they must match. When you change
one, update the manuscript in the same change (subject to the confirmation rule
at the top of this file).

| Story/dialogue element                      | Canonical data file                                       |
| ------------------------------------------- | --------------------------------------------------------- |
| Prelude cutscene (captions, `say` beats)    | `src/game/defs/cutscenes.ts`                              |
| Per-level opening monologues (`intro`)      | `src/game/defs/levels/spacez_hq.ts`, `.../levels/moon.ts` |
| Elite/boss `dialogue` + `lastWords`         | `src/game/defs/enemies/spacez.ts`, `.../enemies/moon.ts`  |
| Hero's inner thoughts (`firstKillThoughts`) | `src/game/defs/thoughts.ts` (pinned from a `LevelDef`)    |
| Found lore on story items (`lore`)          | `src/game/defs/story.ts`                                  |
| Loose UI copy (how-to-play, not story)      | `website/src/game/copy.ts`                                |
| Brand strings (title, tagline — not story)  | `game.config.json` → `website/src/identity.ts`            |

The engine machinery that plays these (dialogue queue, kill-triggered scenes) is
in `src/game/story.ts`; the app-side overlays that render them are
`website/src/game/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`. Content-side
tests that guard the script live in `tests/content/` (`story_test.ts`,
`thoughts_test.ts`, `last_words_test.ts`, …).
