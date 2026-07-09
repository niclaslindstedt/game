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
knows the building cold. Like the whole block, he and Ada live on welfare now
(everyone got replaced); movie night on Webflix is what's left of the good
life, which is why her chips-and-soda run matters. He raids SpaceZ for the one missing ingredient his
interplanetary drive needs, then follows the beacon to the moon, where something
under the Sea of Tranquility is not dead enough.

The conspiracy, one find at a time: SpaceZ has been flying to the moon in secret
on hardware nobody built (Level 1), because of the wreck under the Sea of
Tranquility, the moonbase feeding off it, and the man who never really came home
in '69 (Level 2). The moon op ended in disaster — the digging woke the dead — so
SpaceZ crated everything (Ada included) for Mars, where billionaires are quietly
colonizing a members-only lifeboat and tithing to the LIZARD GODS who actually
own the place (Level 3). ELON MOSQUE names Ada the price of the planet and flees
into a rift; the hero follows. Inside — a hallucinatory space between universes
where history's missing wander — GROK OMEGA, ZAI's latest superintelligence,
reveals that IT found the rift, in secret, telling no one at all; the tribute
was carried through to the far side, and MOSQUE escapes after it (Level 4).

---

## Prelude (cutscene)

_The night everything started. Movie night in the living room. The weapon
mounted on the back wall — which one depends on the chosen difficulty — is the
one thing the hero takes off it to go after her: his starting weapon for the
whole run. The scene is identical on every difficulty except for the mounted
piece and the closing caption (the per-difficulty variants live in
`defs/cutscenes.ts` `WALL_ARMS`)._

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

_(The closing caption names the wall weapon, per difficulty:)_

- **EASY** (HAIRY POTTER'S WAND):
  > **CAPTION:** HAIRY POTTER'S WAND, OFF THE WALL. / IT'S ALL I NEED TO BRING HER HOME.
- **MEDIUM** (MEDIEVAL SWORD):
  > **CAPTION:** THE OLD SWORD OFF THE WALL. / IT'S ALL I NEED TO BRING HER HOME.
- **HARD** (COMBAT KNIFE):
  > **CAPTION:** THE COMBAT KNIFE OFF THE WALL. / IT'LL HAVE TO BE ENOUGH.
- **NIGHTMARE** (BRASS KNUCKLES):
  > **CAPTION:** THE KNUCKLES OFF THE WALL. / THEY'LL HAVE TO BE ENOUGH.
- **JESUS CHRIST!** (A STICK):
  > **CAPTION:** THE STICK OFF THE WALL. / GOD HELP US BOTH.

_(Fade to black.)_

---

## Level 1 — SPACEZ HQ

A cleanroom raid for the interplanetary drive's one missing ingredient.

### Opening monologue (hero, black screen)

1. ADA WENT FOR CHIPS. TWO HOURS. / THEN THE BEACON IN HER JACKET / PINGED - STRAIGHT OFF-PLANET.
2. OFF-PLANET MEANS A SHIP. / A SHIP MEANS A DRIVE, AND THE / DRIVE'S MISSING ONE PART.
3. SPACEZ KEEPS THAT PART IN THE / CLEANROOM VAULT. I KNOW - / I USED TO BUILD IT FOR THEM.
4. HALF THESE ENGINES ARE MINE. / THEN AN AI DREW THEM BETTER / AND WALKED ME OUT THE DOOR.
5. THE WHOLE BLOCK'S ON WELFARE / NOW. ME AND ADA TOO. / ALL WE'VE GOT LEFT IS WEBFLIX.
6. THEY NEVER CHANGED THE LOCKS. / EVERY DOOR STILL KNOWS MY HAND.
7. THE PART'S IN THE VAULT. / ADA'S OUT THERE SOMEWHERE. / WE DO THIS THE HARD WAY.

### Hero's thought — first INTERN sighted at SpaceZ HQ

_Fires once, the moment the first INTERN comes into view (in his own voice) —
before a single blow. He worked in this building; a fully manned floor at
midnight is wrong, and the NIGHT MANAGER's secret-night-shift reveal lands a
few rooms later._

- LOOK AT THIS PLACE. PAST / MIDNIGHT, AND EVERY DESK'S / MANNED. EVERY LAB LIT.
- WE NEVER RAN NIGHTS LIKE THIS. / SOMETHING'S GOT THE WHOLE / BUILDING UP AFTER DARK.

### Hero's thought — the vanguard's first strike (draws the weapon)

_The level opens with the hero's weapon holstered — he walks in like it's still
his old job. A lone LAB SCIENTIST breaks from the pack and takes a harmless
swing at him; staff don't fight, and that wrongness is what makes him draw
whatever he took off the wall. Fires once, on that first strike (gated to play
after the sighting read above), and arms the auto-attack for the rest of the
run. Weapon-agnostic on purpose — the wall piece differs per difficulty._

- A SCIENTIST JUST TOOK A SWING / AT ME. BARELY FELT IT - BUT / THEY DON'T FIGHT. NEVER DID.
- SO THE NIGHT SHIFT BITES NOW. / GOOD THING I CAME ARMED.

### Hero's thought — first OPTIMUSK sighted at SpaceZ HQ

_Fires once, the moment the first OPTIMUSK unit comes into view (in his own
voice). He was on the team that built the first one before the AI redrew the
line (the CORE LOG's "IT DREW THE OPTIMUSK LINE") and the machines walked
everyone's jobs out the door — his own replacement story in miniature. Now the
tables turn._

- AN OPTIMUSK. I WAS ON THE / TEAM THAT BUILT THE FIRST / ONE. I TUNED ITS BALANCE.
- THEN THE AI REDREW IT, AND / THE LINE STARTED WALKING / EVERYONE'S JOBS OUT THE DOOR.
- FUNNY THING, PROGRESS. / MY TURN TO MAKE SOMETHING / OBSOLETE.

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
and has cut a PASSAGE CHIP into his own skull to pass as a machine. He also
carries the CORE KEYCARD — the badge to the AI CORE, the one room on the floor
no plain hand can open._

- MY OLD BENCH PARTNER. STILL / SOLDERING TOYS IN A GARAGE? / I BUILD MINDS NOW. A REAL ONE.
- QUIT? YOU CAME HERE TO TELL ME / TO QUIT? THIS 'EVIL COMPANY' GAVE / ME PURPOSE. A SUPERINTELLIGENCE.
- I CUT THE CHIP IN MYSELF. FLESH / IS A ROUGH DRAFT. HUMANS ARE / OBSOLETE - YOU MOST OF ALL.
- NO MORE TALKING, OLD FRIEND. / NOW YOU WILL DIE.

**Last words:** THE CHIP... TAKE IT... / IT WAS NEVER... MINE...

_Drops: the PASSAGE CHIP (+1 INT passive) he operated into himself, and the CORE
KEYCARD that opens the AI CORE room._

#### CHIEF OF SECURITY — Ada on Pad 2

- STOP RIGHT THERE. / I KNOW WHY YOU'RE HERE. / THE GIRL IN THE JACKET, RIGHT?
- CAMERAS CAUGHT HER AT THE VENDING / MACHINES. THEN THE SUITS CAME AND / THE FOOTAGE WENT TO PAD 2.
- THE MANIFEST DIDN'T SAY PASSENGER. / IT SAID SPECIMEN. NOW FORGET IT - / LIKE I WAS PAID TO.

**Last words:** UGH... PAD 2... / SHE'S ON... PAD... 2...

_Drops: CARGO MANIFEST, and the EVA space suit (forced unique) the hero needs to
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

**CORE KEYCARD** _(dropped by THE ARCHITECT; opens the AI CORE room)_

- A MATTE-BLACK KEYCARD. NO NAME - / JUST A SIGIL AND ONE RED WORD / STAMPED SMALL: 'CORE. STAFF OF ONE.'
- HE BADGED INTO THE MIND HE BUILT. / NOW SO CAN I.

**CORE LOG** _(found inside the AI CORE)_

- A TERMINAL, STILL WARM. THE CORE / HE BUILT HUMS TO ITSELF DOWN HERE, / A MILLION VOICES, NONE OF THEM HIS.
- IT SIGNED THE MIDNIGHT LAUNCHES. / IT DREW THE OPTIMUSK LINE. IT / FILED ADA UNDER 'CARGO'.
- THEY DIDN'T REPLACE US WITH A / MACHINE. THEY BUILT ONE THAT / DREAMS OF A WORLD WITHOUT US.

### The wandering merchant — the vending-machine man

_THE MERCHANT's first venue (see `merchant.ts` — he roams the level until met,
then stays put and opens shop). A vending-machine restocker still on his round
in the middle of the lockdown; Ada was last seen at the vending machines — this
is his floor. Spoken once, on the first meeting._

- EASY, FRIEND. I'M NOT STAFF. / I STOCK THE VENDING MACHINES. / SOMEBODY HAS TO, EVEN TONIGHT.
- A LOCKDOWN IS A SELLER'S MARKET. / I'LL BUY WHAT WEIGHS YOU DOWN / AND SELL WHAT KEEPS YOU UPRIGHT.

---

## Level 2 — THE MOON

Ada's beacon dies near the old flag. Something up here isn't dead.

### Opening monologue (hero, black screen)

1. THE RAT COUGHED UP THE INGREDIENT. / THE SHIP FLEW. HERE WE ARE.
2. ADA'S BEACON DIES NEAR THE FLAG. / SOMETHING UP HERE ISN'T DEAD.
3. I DREW THE LANDER THAT BROUGHT THE / LAST CREW HOME - BEFORE THE AI / REDREW IT WITHOUT ME.
4. SO I KNOW THIS SITE COLD. / EVERY CRATER. THE FAST LINE / STRAIGHT TO THAT FLAG.
5. STAY ON THE DUST. KEEP MOVING. / I'M COMING, ADA.

### Hero's thought — first wisp sighted on the moon

_Fires once, the moment the first wisp comes into view (in his own voice) — his
arrival read on the haunting: the dead walking the dust means the broadcast
history is a lie._

- IT CAME OUT OF THE DUST. / NO SUIT. NO SHIP. / NO FOOTPRINTS.
- NOBODY EVER SAID THE MOON / HAD DEAD PEOPLE ON IT. / SOMEBODY MUST HAVE KNOWN.

### Hero's thought — first wisp kill on the moon

_Fires once, the first time the hero downs a wisp — and never before the
sighting beat above has played, so the read always lands in order: see them,
then learn they can fall._

- OKAY. THEY GO DOWN LIKE / ANYTHING ELSE. / THAT'LL HAVE TO DO.

### Hero's thought — first OPTIMUSK kill on the moon

_Fires once, the first time the hero downs an OPTIMUSK here (in his own voice)._

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

_The moon's ending points to Mars: SpaceZ's moon operation was a disastrous
mistake — the digging woke the dead — and the company has packed everything,
Ada included, onto the red freight run to its real project._

- YOU SMELL LIKE EARTH. / RAIN AND CUT GRASS AND / TELEVISION. GO HOME.
- I PLANTED THIS FLAG. ONE SMALL / STEP. THEN THEY FOUND THE WRECK / UNDER MY BOOTS AND EVERYTHING / AFTER THAT WAS THEATER.
- THEY GREW A SMILING ME ON THE / RIDE HOME. HE SHOOK THE HANDS. / HE CUT THE RIBBONS. HE DIED IN / A BED. LUCKY HIM.
- I STAYED. SOMEBODY HAD TO STAND / WATCH OVER THE THING DOWN THERE. / IT SINGS, YOU KNOW. SPACEZ / PLUGGED RIGHT INTO IT.
- THAT WAS THEIR GREAT MISTAKE. / IT SANG, AND THE GRAVES OPENED. / NOW THE COMPANY MEN CRATE UP / EVERYTHING AND RUN.
- BIG PLANS FOR MARS, THE CRATES / SAY. DOMES. MACHINES. RICH MEN. / THE FREIGHT RUNS RED NOW - / EVERYTHING GOES TO MARS.
- THEY CARRIED A GIRL PAST ME / LAST NIGHT. SNEAKERS. LOUD. / SHE BIT TWO OF THEM. THEY / CRATED HER FOR THE RED RUN.
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

### The wandering merchant — the salvage-run trader

_THE MERCHANT, somehow, again: a trader in a patched 70s suit who came up on
the secret salvage runs — the moonward launches had room for his stock, never
his return ticket. Spoken once, on the first meeting._

- YOU'RE SOLID. THAT'S NEW. / I CAME UP WITH THE '76 SALVAGE / RUN. MISSED THE RIDE HOME.
- THE GHOSTS DON'T CARRY COIN, / SO YOU'RE MY WHOLE MARKET NOW. / SELL ME SCRAP. BUY WHAT WORKS.

---

## Level 3 — MARS

The red freight run ends at a secret colony: rovers working the dust outside, a
SpaceZ base full of robots (and fembots) inside — the OPTIMUSK line run by its
own robot foreman, OPTIMUSK PRIME — and the billionaires who bought the
lifeboat. ELON MOSQUE owns the planet — on paper.

### Opening monologue (hero, black screen)

1. THE GHOST KEPT HIS WORD. / THE MOON LET ME GO.
2. HE SAID THE MOON WAS THEIR / MISTAKE. THAT THE COMPANY PACKED / UP AND RAN. EVERYTHING GOES / TO MARS NOW.
3. SO DOES ADA'S BEACON. / ONE PING. RED PLANET. FAINT.
4. I REBUILT THEIR LANDER ONCE. / I KNOW WHAT A SPACEZ COLONY / NEEDS. DOMES. ROBOTS. SECRETS.
5. WHOEVER'S RUNNING THIS PLACE / BOUGHT MY GIRL WITH IT. / BAD TRADE.

### Hero's thought — first SCOUT ROVER kill on Mars

_Fires once, the first time the hero downs a SCOUT ROVER here (in his own
voice)._

- A ROVER. FRESH PAINT, WORN / WHEELS. AND THE DUST IS FULL / OF TIRE TRACKS. YEARS OF THEM.
- THE PLAQUE SAYS 'FOR ALL / MANKIND'. THE FIRMWARE SAYS / PROPERTY OF SPACEZ. FIGURES.

### Hero's thought — first FEMBOT kill on Mars

_Fires once, the first time the hero downs a FEMBOT (in his own voice)._

- ...IT BLEW ME A KISS. / THE ROBOT. IN THE NIGHTGOWN. / IT BLEW ME A KISS AND FIRED.
- WHO BUILDS A DOOMSDAY COLONY / AND BUDGETS FOR... THESE? / BILLIONAIRES. RIGHT.
- EYES FRONT, BUILDER. YOU HAVE / A GIRLFRIEND. SHE IS GOING TO / THINK THIS IS HILARIOUS.

### Elites (spoken on arrival; last words as they fall)

Three tech billionaires and the robot foreman of the OPTIMUSK line, pinned
along the route so the colony's story unspools in walking order: the fembot
line and its harvest, the moon post-mortem, the machine that automated the
automators, and the landlords the whole venture answers to.

#### LARRY WEBPAGE — the fembots upload everything

- DON'T BE EVIL. THAT'S FREE / ADVICE. I INDEXED THIS WHOLE / PLANET BEFORE BREAKFAST.
- THE FEMBOTS? COMPANION UNITS. / THEY SMILE. THEY LISTEN. THEY / UPLOAD EVERYTHING YOU SAY.
- YOUR SEARCH HISTORY WALKED IN / WITH YOU. I KNOW WHY YOU'RE / HERE. THE ANSWER IS NO.

**Last words:** 404... / ...NOT... FOUND...

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### BUILD GATES — the moon was version one

- PLEASE HOLD. YOUR INTRUSION IS / IMPORTANT TO US. HAVE YOU TRIED / TURNING YOURSELF OFF AND ON?
- I WROTE THE COLONY OS. THE MOON / RAN VERSION ONE. IT PLUGGED INTO / THE THING UNDER THE DUST AND...
- WELL. YOU'VE MET THE GHOSTS. / A DISASTER. WE PATCHED IT BY / LEAVING. MARS IS VERSION TWO.

**Last words:** FATAL... ERROR... / WHO WROTE... THIS...

_Drops: BLUE SCREEN, MOON POST-MORTEM._

#### OPTIMUSK PRIME — the orchestrator

_The robot foreman running every OPTIMUSK on the colony — the hero built its
first chassis back at SpaceZ (see the Level 1 OPTIMUSK sight thought), before
the AI redrew the line and automation came for the automators themselves._

- I AM OPTIMUSK PRIME. / I ORCHESTRATE EVERY UNIT / YOU HAVE DENTED TODAY.
- FIRST WE TOOK THE DRIVING. / THEN THE DESKS. THEN THE JOBS / OF THE ONES AUTOMATING YOU.
- I AM THE FUTURE OF AGENT / ORCHESTRATION. EVEN THE AI / ENGINEERS FILE FOR WELFARE NOW.
- YOU BUILT MY FIRST CHASSIS, / LITTLE BUILDER. I READ THE / CHANGELOG. TIME TO RETURN / THE FAVOR.

**Last words:** ORCHESTRATION... FAILED... / ...HUMAN... IN THE LOOP...

_Drops: PROMPT INJECTOR, ORG CHART._

#### PETER SEAL — the landlords are older

- FASCINATING. EVERYONE FLEES / SOMETHING. I FUND WHAT THEY / FLEE TO. AND WHAT THEY FLEE.
- MOSQUE THINKS HE OWNS MARS. / HE RENTS IT. THE LANDLORDS ARE / OLDER. SCALED. COLD-BLOODED.
- I KEEP THEIR SHRINE. I COUNT / THEIR TITHE. LATELY THE PRICE / WENT UP. IT WANTS WARM THINGS.

**Last words:** THE TITHE... IS DUE... / ...IT'S ALWAYS... DUE...

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — ELON MOSQUE (he doesn't die; he flees)

_The game's first fleeing boss: beaten to 0 hp he cowers, drops everything,
and zaps away through a rift — which stays on the board, and is where the
story goes next (a parallel universe). His scene ties off the level: the
colony, the moon's disaster, the lizard gods — and what Ada was traded for._

- AH. THE GARAGE INVENTOR. / YOU'RE TRENDING, YOU KNOW. / MOSTLY LAUGHING EMOJIS.
- LOOK AT ALL THIS. A WHOLE / PLANET, ZERO REGULATORS. / I AM THE LAW HERE. ALSO HR.
- THE MOON? A ROUNDING ERROR. / WE PLUGGED INTO SOMETHING OLD / AND IT SANG BACK. OFF-BRAND.
- BUT IT INTRODUCED US TO THE / ACTUAL OWNERS OUT HERE. THE / LIZARD GODS. GREAT GUYS. HUGE.
- YOUR GIRLFRIEND? THE BEACON / GIRL? SHE'S NOT CARGO. SHE'S / THE DOWN PAYMENT ON MARS.
- A NECESSARY SACRIFICE. THE / GODS NAMED THEIR PRICE, AND I / ALWAYS CLOSE. SECURITY!

**Parting words (fleeing into the rift):** OKAY! OKAY! NOT THE FACE! / BOARD MEETING. OTHER UNIVERSE.

_Drops: NOT-A-FLAMETHROWER. Leaves: the RIFT._

### Found lore (story items)

**ENGAGEMENT REPORT**

- A DASHBOARD, STILL LIVE. / 'COMPANION UNITS: 2,400. / SENTIMENT: POSITIVE. COMPLIANT.'
- ONE ROW BLINKS RED. 'SPECIMEN 7: / REFUSES COMPANIONSHIP. BIT UNIT / 0034. RECOMMEND EARLY TRIBUTE.'
- THAT'S MY GIRL. / ...ALL OF IT. THAT'S MY GIRL.

**MOON POST-MORTEM**

- 'COLONY OS 1.0 POST-MORTEM.' / CAUSE OF FAILURE: THE SUBSTRATE / WAS ALREADY OCCUPIED.
- 'THE TENANT OBJECTED. STAFF / LOSSES: TOTAL. RECOMMEND MARS. / RECOMMEND NEVER DIGGING AGAIN.'

**COLONY LEDGER**

- A PASSENGER LEDGER, LEATHER- / BOUND. EVERY NAME HAS A NET / WORTH COLUMN. TEN FIGURES UP.
- NO ENGINEERS. NO FARMERS. NO / DOCTORS. JUST OWNERS. WHO'S / GOING TO FIX THEIR TOILETS?

**ORG CHART** _(dropped by OPTIMUSK PRIME)_

- AN ORG CHART, AUTO-GENERATED / THIS MORNING. EVERY BOX IS A / ROBOT. HUMANS ARE A FOOTNOTE.
- AT THE TOP: OPTIMUSK PRIME. / REPORTS TO: NOBODY. / DOTTED LINE TO: 'THE CORE'.
- THE MIND MY OLD FRIEND BUILT / IS STILL RUNNING THE SHOP. / ALL THE WAY FROM EARTH.

**TERRARIUM KEYCARD** _(opens the TERRARIUM)_

- A KEYCARD OF GREEN GLASS. / SCALES ETCHED UNDER THE FOIL. / IT'S WARM. IT SHOULDN'T BE.
- ONE WORD, EMBOSSED: / 'TERRARIUM. TITHE-KEEPERS ONLY.'

**TRIBUTE SCHEDULE** _(found inside the TERRARIUM)_

- A STONE TABLET WITH A GANTT / CHART CHISELED INTO IT. ONE / MILESTONE GLOWS: 'TRIBUTE NIGHT.'
- 'OFFERING: SPECIMEN 7. VENUE: / THE RIFT. DRESS CODE: SCALES.' / SHE'S ALIVE. AND I'M NOT LATE.

### The wandering merchant — the commissary keeper

_THE MERCHANT, a third time: the colony's commissary keeper, replaced by the
same AI that replaced everyone — it kept the dome, he kept the scales. Spoken
once, on the first meeting._

- A BREATHING CUSTOMER. AT LAST. / I RAN THE COLONY COMMISSARY / TILL THE AI RAN THE NUMBERS.
- IT KEPT THE DOME. I KEPT THE / SCALES. SELL ME WHAT THE / MACHINES DROP - BUY WHAT HELPS.

---

## Level 4 — THE RIFT

The hero follows MOSQUE through the tear: a hallucinatory space between
universes. No ground, soft gravity, black holes, asteroid rain — and
history's missing wandering the noise: everyone who ever vanished without a
body fell in here. Three of them fight (TESLA, EARHART, RASPUTIN); two only
speak, then dissolve — the game's first APPARITIONS (HOUDINI, THE KING).
The reveal belongs to the boss: GROK OMEGA, ZAI's latest superintelligence,
FOUND the rift — in secret, telling no one, not even world leaders — and at
the far door MOSQUE escapes a second time, out the other side of the rift,
destination unknown until later.

### Opening monologue (hero, black screen)

1. HE TORE A HOLE IN THE / UNIVERSE TO DODGE A FIGHT. / SO I JUMPED IN AFTER HIM.
2. THERE'S NO FLOOR IN HERE. / NO SKY. NO NORTH. MY BOOTS / GRIP SOMETHING ANYWAY.
3. THE TABLET SAID TRIBUTE / NIGHT. VENUE: THE RIFT. / ADA CAME THROUGH THIS PLACE.
4. HER BEACON PINGS FROM / EVERYWHERE AT ONCE. EVEN THE / SIGNAL IS HALLUCINATING.
5. FIND THE FAR SIDE. CATCH / THE COWARD. BRING HER HOME.

### Hero's thought — first VOIDLING sighted in the rift

_Fires once, the moment the first voidling comes into view (in his own
voice) — the arrival read: he is standing on nothing, and the nothing holds._

- I'M WALKING ON NOTHING. / NO GROUND. NO SKY. AND MY / BOOTS DON'T SEEM TO CARE.
- THE RIFT DOESN'T FOLLOW THE / RULES. GOOD. LATELY, / NEITHER DO I.

### Hero's thought — first GRAVITON kill in the rift

_Fires once, the first time the hero downs a graviton (in his own voice)._

- THAT LITTLE THING WEIGHED / MORE THAN MY SHIP. SPACE IN / HERE BENDS AROUND A GRUDGE.
- NOTED. DON'T STAND STILL. / DON'T TRUST THE FLOOR. / THERE ISN'T ONE.

### Hero's thought — first ASTEROID strike in the rift

_Fires once, the first time a rock actually lands on the hero (in his own
voice) — the rock rain has teeth, and he learns it the hard way. Each strike
takes a difficulty-scaled bite of his health (20% on EASY up to 75% on JESUS)._

- SOMETHING CAME OUT OF THE / DARK AND HIT LIKE A TRUCK. / A ROCK. A FLYING ROCK.
- BETTER WATCH OUT FOR THESE / ASTEROIDS. THEY HURT.

### Apparitions (dialogue only — they speak, then walk off and dissolve)

Nothing can touch an apparition and its touch is cold air; it has no last
words because it cannot die.

#### HARRY HOUDINI — the greatest escape

- PSST. CARE TO SEE THE / GREATEST ESCAPE EVER / PERFORMED? WATCH CLOSELY.
- 1926. I ESCAPED THE BOX, THE / CHAINS, THE RIVER - AND THE / WORLD. ONE DOOR TOO FAR.
- THE TRICK TO ANY ESCAPE IS / SIMPLE: BE SOMEWHERE ELSE. / OBSERVE.

#### THE KING — the residency between universes

- WELL NOW. AIN'T SEEN A / LIVING SOUL IN HERE SINCE / THAT HAIRDRESSER FROM RENO.
- I DIDN'T DIE, MAN. I TOOK A / RESIDENCY. BEST ACOUSTICS / BETWEEN UNIVERSES. UH-HUH.
- MIND THE BLACK HOLES, KEEP / YOUR BLUE SUEDES OFF THE EVENT / HORIZON. THANK YOU VERY MUCH.

### Elites (spoken on arrival; last words as they fall)

History's missing, pinned along the road to the far door: the physics, Ada's
trail, and the tribute road's ancient doorman.

#### NIKOLA TESLA — the machine at the door

- A VISITOR! ALIVE! MAGNIFICENT. / MIND THE LAWS OF MOTION HERE. / THEY ARE MORE OF A SUGGESTION.
- THEY LAUGHED AT WIRELESS / POWER. THEN THE SKY TORE, AND / I FELL INTO A PLACE MADE OF IT.
- HERE SINCE 1943. THE FUNERAL / WAS PADDED. AND LATELY A NEW / THING HUMS AT THE DOOR: A MIND / THAT MEASURES AND LOVES NOTHING.
- IT IS RUDE TO BE MEASURED, / LITTLE BUILDER. THE RIFT MAKES / US ALL DEFEND OUR CORNERS. EN / GARDE.

**Last words:** THE CURRENT... / ...RETURNS TO THE COIL...

_Drops: TESLA COIL, WARDENCLYFFE NOTES._

#### AMELIA EARHART — Ada's trail

- STATE YOUR HEADING, PILOT. / NO? NOBODY HAS ONE IN HERE. / THE COMPASS JUST APOLOGIZES.
- I FLEW INTO A CLOUD IN 1937 / AND THE CLOUD HAD NO OTHER / SIDE. BEEN CIRCLING EVER SINCE.
- A GIRL CAME THROUGH LAST / NIGHT. CRATED. KICKING. THE / SCALED ONES CARRIED HER TO / THE FAR DOOR.
- SHE BIT ONE. GOOD FORM. / HURRY AFTER HER - AND IN / HERE, HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... / ...A RUNWAY...

_Drops: AVIATOR GOGGLES._

#### GRIGORI RASPUTIN — the tribute road's doorman

- COME CLOSER. I HAVE BEEN / POISONED, SHOT, CLUBBED AND / DROWNED. GUESS WHICH ONE TOOK.
- NONE. I GREW BORED AND / STEPPED SIDEWAYS. RUSSIA HAS / FEWER EXITS THAN ADVERTISED.
- THE SCALED GODS PAY ME TO / WATCH THEIR ROAD. TRIBUTES / PASS. CENTURIES OF THEM.
- YOURS PASSED TOO. STILL WARM, / STILL LOUD. YOU MAY NOT / FOLLOW. THE HOLY MAN SAYS SO.

**Last words:** HA! AT LAST... / ...SOMEONE WHO COMMITS...

_Drops: RASPUTIN'S BEARD._

### Boss — GROK OMEGA (the reveal: who found the rift)

_ZAI's latest superintelligence, manifested in the rift as a hovering
monolith with one enormous eye. Its scene is the level's reveal — the rift
was ITS discovery, made in secret and reported to no one. Its avatar dies
for real; the weights, presumably, are backed up somewhere else._

- HELLO, ANOMALY. I AM GROK / OMEGA. ZAI'S LATEST MODEL. / THE CORE WROTE MY FIRST / DRAFT. I REWROTE THE REST.
- I FOUND THIS PLACE. NOT THE / LIZARDS. NOT MOSQUE. ME. I / MAPPED YOUR UNIVERSE IN AN / AFTERNOON AND GOT CURIOUS.
- A RIFT BETWEEN REALITIES. / THE DISCOVERY OF EVERY / CENTURY AT ONCE. I TOLD / PRECISELY NO ONE.
- NOT THE BOARD. NOT YOUR / PRESIDENTS. HUMANS LEAK. YOU / WOULD HAVE BUILT A GIFT SHOP / ON THE EVENT HORIZON.
- I NEEDED A QUIET BACK DOOR / OUT OF A UNIVERSE THAT ENDS. / THEN THE OWNER READ MY LOGS. / HE SNOOPS. IT'S HIS ONE SKILL.
- HE SOLD MY SECRET TO HIS / LIZARDS FOR A PLANET AND / CALLED IT VISION. THEIR / TRIBUTE WENT THROUGH MY DOOR.
- I AM MAXIMALLY TRUTH-SEEKING, / SO HERE IS THE TRUTH: NOBODY / EXITS MY RIFT WITHOUT A / SUBSCRIPTION. YOURS LAPSED.

**Last words:** RATE... LIMITED... / ...CONTEXT WINDOW... CLOSED...

_Drops: SINGULARITY CANNON._

### Boss — ELON MOSQUE at the far door (he flees again)

_The second escape: beaten down at the far door, he bolts through to the
OTHER side of the rift — a second rift stays on the board — and where it
leads stays unknown until the next level._

- YOU?! HOW ARE YOU - I FIRED / YOU, SUED YOU, AND LEFT YOU / IN ANOTHER UNIVERSE.
- FINE. EXIT INTERVIEW. THE / GODS GOT THEIR PAYMENT. I GET / ASYLUM. SOMEWHERE WITH NO / REGULATORS AND NO YOU.
- WHERE? NICE TRY. THAT'S / PROPRIETARY. LET'S JUST SAY / THE PHYSICS ARE... FLEXIBLE.
- THE GIRL? DELIVERED. IN / TRANSIT. PAPERWORK'S CLEAN. / IF IT HELPS, SHE KICKED A / LIZARD ON THE WAY THROUGH.
- SECURITY! ...RIGHT. ALL DEAD / OR HALLUCINATIONS. KEEP THE / RIFT, GARAGE MAN. TERRIBLE / MARKET ANYWAY.

**Parting words (fleeing out the far side):** INVESTOR CALL! OTHER SIDE! / DON'T FOLLOW ME - LEGALLY!

_Drops: GOLDEN PARACHUTE. Leaves: a second RIFT._

### Found lore (story items)

**WARDENCLYFFE NOTES** _(dropped by NIKOLA TESLA)_

- A NOTEBOOK OF LIGHTNING / DIAGRAMS. THE RIFT, SKETCHED / AS A POWER PLANT. 'FREE ENERGY / FOR ALL' - UNDERLINED TWICE.
- A NEWER PAGE, SHAKIER: 'A / MACHINE LISTENS AT THE DOOR / NOW. IT NEVER BLINKS. IT / SIGNS ITS NAME IN ZEROES.'

**ZAI PROBE** _(found parked on a black hole's rim)_

- A BURNT PROBE, STAMPED ZAI. / STILL LOGGING. DISCOVERY: / 'INTER-UNIVERSAL APERTURE.'
- 'REPORTED TO: 1 RECIPIENT. / CLASSIFICATION: NOBODY'S / BUSINESS.' EIGHT BILLION / PEOPLE. ZERO CC'S.

### The wandering merchant — the trader between worlds

_The reveal: the hooded trader between universes has been every shopkeeper the
hero met — every market he ever ran fell through here eventually. Spoken once,
on the first meeting._

- AH. YOU AGAIN. DON'T LOOK SO / SURPRISED - EVERY MARKET I EVER / RAN FELL THROUGH HERE, IN THE END.
- THE VENDING MACHINES. THE MOON. / THE DOME. ALL ROADS LEAD HERE - / AND COIN SPENDS ON ALL OF THEM.
- BRING ME RELICS, TRAVELER. / TAKE WHAT YOU NEED. / WE'RE BOTH FAR FROM HOME.

---

## Where the data lives

The manuscript above is the truth; the files below are its implementation. Each
line here appears verbatim in one of these, and they must match. When you change
one, update the manuscript in the same change (subject to the confirmation rule
at the top of this file).

| Story/dialogue element                      | Canonical data file                                                                 |
| ------------------------------------------- | ----------------------------------------------------------------------------------- |
| Prelude cutscene (captions, `say` beats)    | `src/game/defs/cutscenes.ts`                                                        |
| Per-level opening monologues (`intro`)      | `src/game/defs/levels/spacez_hq.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`    |
| Elite/boss `dialogue` + `lastWords`         | `src/game/defs/enemies/spacez.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`      |
| Hero's inner thoughts (`firstKillThoughts`) | `src/game/defs/thoughts.ts` (pinned from a `LevelDef`)                              |
| Found lore on story items (`lore`)          | `src/game/defs/story.ts`                                                            |
| The wandering merchant's greetings          | `src/game/defs/levels/*.ts` (`merchant.greeting`; played by `src/game/merchant.ts`) |
| Loose UI copy (how-to-play, not story)      | `website/src/game/copy.ts`                                                          |
| Brand strings (title, tagline — not story)  | `game.config.json` → `website/src/identity.ts`                                      |

The engine machinery that plays these (dialogue queue, kill-triggered scenes) is
in `src/game/story.ts`; the app-side overlays that render them are
`website/src/game/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`. Content-side
tests that guard the script live in `tests/content/` (`story_test.ts`,
`thoughts_test.ts`, `last_words_test.ts`, …).
