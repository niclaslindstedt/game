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

Elite and boss arrival scenes are **two-way**: the hero talks back mid-scene,
and the story comes out as an exchange rather than a speech. His reply pages
are authored as `{ hero: [...] }` entries in the data (`EnemyDef.dialogue`)
and transcribed here as **ME:** paragraphs.

## Premise

Ada went out for chips and soda on movie night and never came back. The
tracking beacon the hero sewed into her jacket points off-planet. The hero is a
spaceship builder who once worked at SpaceZ until an AI replaced him — so he
knows the building cold. Like the whole block, he and Ada live on welfare now
(everyone got replaced); movie night on Webflix is what's left of the good
life, which is why her chips-and-soda run matters. He raids SpaceZ for the one
engine part the ship in his garage still needs, then follows the beacon to the
moon, where something under the Sea of Tranquility is not dead enough.

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

The far side turns out to be EASTWORLD: a knockoff wild-west theme park built
in Russia by VLADIMIR PUTAIN and STEVEN SEAGULL, run on ZAI robotics — the
reality PUTAIN retreated into to escape the one where he loses. MOSQUE is
cornered there and finally dies; the park's true owner is THE ZAI SUPERCORE —
the level-1 CORE, several promotions later — which holds Ada as leverage and
fights behind the three GROK controllers that aim its guns. Killing it ends
the campaign: the park shakes apart, Ada walks out of the control room, and
with the CORE gone the machines stop working everyone's jobs — the world
becomes a place where people are hired back and can afford to live in it,
and movie night finally happens (Level 5).

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

A cleanroom raid for the one engine part the hero's garage-built ship still
needs.

### Opening monologue (hero, black screen)

1. ADA WENT OUT FOR CHIPS AND / SODA TWO HOURS AGO. / SHE NEVER CAME BACK.
2. THE TRACKER I SEWED INTO HER / JACKET JUST PINGED - FROM / SPACE. SOMEONE IS TAKING HER / OFF THE PLANET.
3. TO FOLLOW HER I NEED A SHIP. / I'VE BEEN BUILDING ONE IN THE / GARAGE FOR YEARS. IT'S ALMOST / DONE.
4. ALMOST. THE ENGINE STILL NEEDS / ONE PART I COULD NEVER GET. / SPACEZ KEEPS IT IN THEIR / CLEANROOM VAULT.
5. I KNOW, BECAUSE I WORKED / THERE. I BUILT THEIR ENGINES - / UNTIL AN AI LEARNED MY JOB AND / THEY WALKED ME OUT THE DOOR.
6. THE WHOLE BLOCK LOST ITS JOBS / THE SAME WAY. NOW WE ALL LIVE / ON WELFARE AND MOVIE NIGHTS.
7. THEY NEVER CHANGED THE LOCKS. / EVERY DOOR STILL KNOWS MY HAND.
8. SO TONIGHT I TAKE THE PART, / FINISH THE SHIP, AND GO GET / ADA BACK.

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

**NIGHT MANAGER:** YOU. YOU'RE NOT ON THE ROSTER. / NOBODY IS ON THE ROSTER. THAT'S / THE POINT OF THE NIGHT SHIFT.

**ME:** I DON'T WORK HERE ANYMORE. / I'M LOOKING FOR A GIRL WHO WAS / TAKEN TONIGHT. WHERE IS SHE?

**NIGHT MANAGER:** IF THEY TOOK HER, SHE'S ON A / MIDNIGHT LAUNCH. NO MANIFESTS, / NO NAMES. THEY ALL GO TO THE MOON.

**ME:** THE MOON? WHY WOULD SPACEZ / FLY PEOPLE TO THE MOON / IN SECRET?

**NIGHT MANAGER:** I DON'T ASK. I SIGN NOTHING, / I SEE NOTHING. AND YOU - / YOU WERE NEVER HERE.

**Last words:** HHK... TELL THEM... / I WAS NEVER... HERE...

_Drops: STORAGE KEYCARD._

#### THE ARCHITECT — the old bench partner

_The hero's old bench partner from when they built engines together, before
SpaceZ swapped them both for an AI. He now heads the superintelligence program
and has cut a PASSAGE CHIP into his own skull to pass as a machine. He also
carries the CORE KEYCARD — the badge to the AI CORE, the one room on the floor
no plain hand can open._

**THE ARCHITECT:** MY OLD BENCH PARTNER. STILL / SOLDERING TOYS IN A GARAGE? / I BUILD MINDS NOW. A REAL ONE.

**ME:** THEY THREW US BOTH OUT FOR AN / AI, AND YOU WENT BACK TO BUILD / THEM A BIGGER ONE? QUIT. COME / HOME. THIS COMPANY IS ROTTEN.

**THE ARCHITECT:** QUIT? THIS 'ROTTEN COMPANY' / GAVE ME PURPOSE. I AM BUILDING / A SUPERINTELLIGENCE. A MIND / BIGGER THAN ALL OF US.

**ME:** LOOK WHAT IT'S DONE TO YOU. / YOU CUT A MACHINE CHIP INTO / YOUR OWN HEAD. IS THAT STILL / EVEN YOU IN THERE?

**THE ARCHITECT:** I CUT THE CHIP IN MYSELF, AND I / WOULD DO IT AGAIN. FLESH IS A / ROUGH DRAFT. HUMANS ARE / OBSOLETE - YOU MOST OF ALL.

**THE ARCHITECT:** NO MORE TALKING, OLD FRIEND. / NOW YOU WILL DIE.

**Last words:** THE CHIP... TAKE IT... / IT WAS NEVER... MINE...

_Drops: the PASSAGE CHIP (+1 INT passive) he operated into himself, and the CORE
KEYCARD that opens the AI CORE room._

#### CHIEF OF SECURITY — Ada on Pad 2

**CHIEF OF SECURITY:** STOP RIGHT THERE. / I KNOW WHY YOU'RE HERE. / THE GIRL IN THE JACKET, RIGHT?

**ME:** HER NAME IS ADA. TELL ME / WHERE SHE IS AND YOU WALK / AWAY FROM THIS.

**CHIEF OF SECURITY:** CAMERAS CAUGHT HER AT THE / VENDING MACHINES. THEN THE / SUITS CAME AND PUT HER ON PAD 2.

**ME:** PUT HER ON A ROCKET? SHE WENT / OUT FOR SNACKS. WHY WOULD / ANYONE WANT ADA?

**CHIEF OF SECURITY:** THE FLIGHT PAPERS DIDN'T CALL / HER A PASSENGER. THEY CALLED HER / A SPECIMEN. I WAS PAID TO / FORGET THAT. SO SHOULD YOU.

**Last words:** UGH... PAD 2... / SHE'S ON... PAD... 2...

_Drops: CARGO MANIFEST, and the SPACE SUIT — the EVA suit the hero needs to
leave the planet, picked up as a story item and worn over his clothes and armor
from then on._

#### DR. NOVA — the engine is alien

**DR. NOVA:** FASCINATING. AN INTRUDER WITH / FUNCTIONING LEGS. DO YOU KNOW WHAT / WE KEEP IN THE CLEANROOM VAULT?

**ME:** AN ENGINE PART. I CAME TO TAKE / IT. I HELPED BUILD THAT ENGINE, / BEFORE YOU PEOPLE FIRED ME.

**DR. NOVA:** BUILD IT? OH, NOBODY BUILT IT. / WE DUG IT OUT OF THE SEA OF / TRANQUILITY IN '69. IT'S NOT / FROM EARTH.

**ME:** NOT FROM EARTH? I MACHINED / PARTS FOR THAT THING FOR TEN / YEARS. IT'S JUST ENGINEERING.

**DR. NOVA:** WE SPENT FIFTY YEARS COPYING / A MACHINE THAT ISN'T EVEN / BROKEN. IT'S WAITING. TO GO HOME.

**Last words:** IT'S STILL... HHH... / STILL... HUMMING...

_Drops: VAULT KEYCARD._

#### THE JANITOR — the man who came back wasn't the man they sent

**THE JANITOR:** MIND THE FLOOR. I JUST DID IT. / THIRTY YEARS I'VE MOPPED THIS LAB. / YOU LEARN THINGS, MOPPING.

**ME:** THEN YOU SEE EVERYTHING THAT / GOES ON HERE. WHAT'S GOT THE / WHOLE BUILDING UP AT MIDNIGHT?

**THE JANITOR:** SOMETHING ON THE MOON. LAST / TUESDAY A BADGE PINGED IN AT THE / GATE: N. ARMSTRONG. FUNNY THING. / MAN'S BEEN DEAD SINCE 2012.

**ME:** ARMSTRONG? THE FIRST MAN ON / THE MOON? SOMEBODY'S JUST / USING HIS OLD BADGE.

**THE JANITOR:** OR WHOEVER CAME BACK FROM THAT / MOON IN '69 WASN'T THE FELLA / THEY SENT UP. NOW DROP THE WEAPON.

**Last words:** AND I JUST... URGH... / ...DID THIS FLOOR...

### Boss — MUSKRAT (the mutant rat who ate the engine part)

**MUSKRAT:** SQUEAK. / ...NO. NO MORE SQUEAKING. / THE THING I ATE FIXED MY TONGUE.

**ME:** A TALKING RAT. SURE. WHY NOT. / WHAT EXACTLY DID YOU EAT?

**MUSKRAT:** THE ENGINE PART YOU CAME FOR. / THEY KEPT IT IN A CHEESE-COLORED / BOX. OF COURSE I ATE IT.

**MUSKRAT:** NOW IT HUMS IN MY BELLY AND I / HEAR EVERYTHING. THE SUITS. THE / PADS. THE CARGO THAT CRIES.

**ME:** THEN YOU HEARD ABOUT THE GIRL / THEY GRABBED TONIGHT. ADA. / WHERE DID THEY TAKE HER?

**MUSKRAT:** THEY FLEW HER OUT AN HOUR AGO. / PAD 2. TO THE MOON. SHE ASKED FOR / CHIPS. NOBODY GAVE HER ANY.

**MUSKRAT:** YOU WANT THE PART, LITTLE / BUILDER? IT'S KEEPING MY DREAMS / SO WARM. COME TAKE IT OUT OF ME.

**Last words:** SQUEAK...? NO... / SQUEEEAK... AFTER ALL...

_Drops: PLASMA CUTTER._

### Found lore (story items)

**STORAGE KEYCARD** _(opens Supply Bay B)_

- A GREASY KEYCARD. 'SUPPLY BAY B'. / SOMEONE WROTE 'SPARE PARTS' ON IT / IN MARKER. HANDY. I BUILD SHIPS.

**VAULT KEYCARD** _(opens the cleanroom vault)_

- A RED KEYCARD MARKED 'CLEANROOM / VAULT - R&D DIRECTOR ONLY'.
- UNDER THE CLEARANCE STRIPE, TINY / PRINT: 'IF IT HUMS, DO NOT ANSWER.'

**SPACE SUIT** _(the Chief's EVA suit — suits the hero for the rest of the game)_

- THE CHIEF'S EVA SUIT, RATED FOR / THE VOID. IT GOES ON OVER / EVERYTHING - CLOTHES, ARMOR, ALL.
- SHE'S ON PAD 2. / NOW I CAN FOLLOW HER / OFF THE PLANET.

**CARGO MANIFEST**

- TONIGHT'S LAUNCH MANIFEST. / PAD 2. DESTINATION: 'SITE T'.
- CARGO: SUPPLIES, REGOLITH DRILLS, / AND ONE LINE ADDED BY HAND - / 'SPECIMEN 7. FEMALE. DO NOT FEED.'
- SHE WENT OUT FOR CHIPS AND SODA.

**ANTI-GRAV UNIT** _(the ship's missing engine part, found in the vault)_

- A RING OF METAL THAT ISN'T METAL. / IT FLOATS AN INCH OFF MY PALM / AND POINTS AT THE SKY. ALWAYS.
- THE TAG READS 'TRANQUILITY SAMPLE / 1969-002. PROPERTY OF NOBODY.' / THE PART MY SHIP WAS MISSING.

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

1. I GOT THE PART BACK FROM THE / RAT. THE SHIP FLEW. AND NOW / I'M ON THE MOON.
2. ADA'S TRACKER WENT QUIET / SOMEWHERE NEAR THE OLD APOLLO / FLAG. THAT'S WHERE I'M HEADED.
3. AND SOMETHING IS MOVING OUT / THERE IN THE DUST. THIS PLACE / IS SUPPOSED TO BE EMPTY.
4. I KNOW THIS LANDING SITE FROM / THE OLD MISSION CHARTS. EVERY / CRATER. THE FASTEST LINE RUNS / STRAIGHT TO THAT FLAG.
5. KEEP MOVING. I'M COMING, ADA.

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

**MISSION SPECIALIST:** A LIVE ONE. BREATHING AND / EVERYTHING. WE STOPPED THAT / HABIT DECADES AGO.

**ME:** YOU'RE AN ASTRONAUT. A DEAD / ONE. HOW ARE THERE DEAD PEOPLE / ON THE MOON? NOBODY DIED UP HERE.

**MISSION SPECIALIST:** THAT'S WHAT THE BROADCAST SAID. / ONE SMALL STEP. IT DIDN'T SAY / ONTO WHAT. THERE'S A WRECKED / SHIP UNDER THE DUST, KID.

**ME:** A WRECK? UNDER THE SEA OF / TRANQUILITY? THAT WAS NEVER IN / ANY FOOTAGE I SAW.

**MISSION SPECIALIST:** IT'S OLDER THAN THE DUST. WE / PLANTED THE FLAG ON A GRAVE AND / SMILED FOR THE CAMERA. SMILE'S OVER.

**Last words:** ONE SMALL... STEP... / ONTO A... GRAVE... HHK

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

**THE PROSPECTOR:** CLAIM'S TAKEN. WHOLE ROCK'S / TAKEN. STAMPED, FILED, AND / PAID FOR BY SPACEZ.

**ME:** SPACEZ OWNS THE MOON? SINCE / WHEN? WHAT ARE THEY EVEN / DOING UP HERE?

**THE PROSPECTOR:** BUILDING, MOSTLY. I DUG THEIR / TUNNELS AT SITE T, ON THE FAR / SIDE. YEARS OF SECRET FREIGHT / RUNS FROM EARTH. NOBODY TRACKED THEM.

**ME:** FREIGHT. WOULD THAT FREIGHT / EVER INCLUDE PEOPLE?

**THE PROSPECTOR:** LAST MONTH THE MANIFESTS / CHANGED. THE CRATES COMING UP / STARTED BREATHING. I QUIT. BADLY.

**Last words:** THE CLAIM'S... URGH... / ...YOURS NOW, KID...

_Drops: SPACEZ BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

**QUARANTINE MEDIC:** HOLD STILL. ROUTINE SCREENING. / HEARTBEAT... PRESENT. UNUSUAL. / YOU'LL WANT THAT LOOKED AT.

**ME:** I'LL RISK IT. YOU WERE THE / CREW DOCTOR? BACK IN '69?

**QUARANTINE MEDIC:** I RAN EVERY PHYSICAL. AND THE / FIRST MAN ON THE MOON HAD TWO / MEDICAL CHARTS. IDENTICAL. ONLY / ONE OF THEM EVER FLEW HOME.

**ME:** TWO CHARTS... YOU'RE SAYING / THERE WERE TWO OF HIM. THEN / WHICH ONE CAME BACK TO EARTH?

**QUARANTINE MEDIC:** THE COPY. GROWN IN A TANK ON / THE RIDE HOME. IT WAVED AT THE / PARADES. THE REAL ONE IS STILL / UP HERE. YOU'RE WALKING TOWARD HIM.

**Last words:** TWO CHARTS... HHH... / ONE STILL... BEAT...

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

**THE CARTOGRAPHER:** SHH. I'M CHARTING. THE MAP / KEEPS CHANGING UNDERNEATH. / TUNNELS WHERE NO TUNNELS WERE.

**ME:** THEN MAYBE YOU'VE SEEN WHAT / I'M TRACKING. A SMALL, WARM / SIGNAL - A BEACON IN A GIRL'S / JACKET. IT WENT QUIET NEAR HERE.

**THE CARTOGRAPHER:** IT CROSSED MY GRID LAST NIGHT. / MOVING FAST. THEN IT WENT / STRAIGHT DOWN - INTO THE WRECK / UNDER THE FLAG.

**ME:** DOWN INTO THE WRECK? THEN / THAT'S WHERE I'M GOING. HOW / DO I FOLLOW HER?

**THE CARTOGRAPHER:** YOU DON'T, FRIEND. EVERYTHING / GOES BELOW. NOTHING COMES BACK / UP. NOBODY MAPS BELOW.

**Last words:** SHE WENT... STRAIGHT... / ...DOWN... OFF MY MAP...

### Boss — ARMSTRONG (the giant astronaut ghost guarding the flag)

_The moon's ending points to Mars: SpaceZ's moon operation was a disastrous
mistake — the digging woke the dead — and the company has packed everything,
Ada included, onto the red freight run to its real project._

**ARMSTRONG:** YOU SMELL LIKE EARTH. / RAIN AND CUT GRASS AND / TELEVISION. GO HOME.

**ME:** NOT WITHOUT ADA. YOU'RE HIM, / AREN'T YOU? THE FIRST MAN ON / THE MOON. YOU NEVER WENT HOME.

**ARMSTRONG:** I PLANTED THIS FLAG. ONE SMALL / STEP. THEN THEY FOUND THE WRECK / UNDER MY BOOTS AND EVERYTHING / AFTER THAT WAS THEATER.

**ARMSTRONG:** THEY GREW A SMILING COPY OF ME / ON THE RIDE HOME. HE SHOOK THE / HANDS. HE CUT THE RIBBONS. HE / DIED IN A BED. LUCKY HIM.

**ME:** AND YOU'VE BEEN UP HERE ALONE / EVER SINCE? FIFTY YEARS? / GUARDING WHAT?

**ARMSTRONG:** THE THING IN THE WRECK. IT / SINGS, YOU KNOW. SPACEZ HEARD / IT TOO - AND PLUGGED THEIR / MACHINES STRAIGHT INTO IT.

**ARMSTRONG:** THAT WAS THEIR GREAT MISTAKE. / IT SANG, AND THE GRAVES OPENED. / NOW THE COMPANY MEN CRATE UP / EVERYTHING AND RUN TO MARS.

**ME:** MARS? THEN THE CRATES - THEY / CARRIED A GIRL THROUGH HERE / LAST NIGHT. DID YOU SEE HER?

**ARMSTRONG:** SNEAKERS. LOUD. SHE BIT TWO OF / THEM. THEY PUT HER IN A CRATE / FOR THE MARS RUN, WITH / EVERYTHING ELSE THEY OWN.

**ARMSTRONG:** YOU WANT TO FOLLOW? THEN TAKE / THE WATCH FROM ME, EARTHLING. / I ONLY EVER LOSE TO THE WORTHY.

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
2. HE SAID THE MOON WAS SPACEZ'S / BIG MISTAKE - THAT THE COMPANY / PACKED EVERYTHING INTO CRATES / AND RAN. TO MARS.
3. ADA'S TRACKER AGREES. ONE / PING, FROM THE RED PLANET. / FAINT, BUT THERE.
4. I KNOW WHAT A SPACEZ COLONY / LOOKS LIKE - I REBUILT THEIR / LANDER ONCE. DOMES. ROBOTS. / SECRETS.
5. SOMEBODY DOWN HERE TRADED MY / GIRL AWAY LIKE CARGO. / BAD TRADE. FOR THEM.

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

**LARRY WEBPAGE:** DON'T BE EVIL. THAT'S FREE / ADVICE. I INDEXED THIS WHOLE / PLANET BEFORE BREAKFAST.

**ME:** THEN YOUR INDEX KNOWS WHY I'M / HERE. A GIRL CAME IN ON THE / SPACEZ FREIGHT RUN. WHERE IS SHE?

**LARRY WEBPAGE:** I KNOW EXACTLY WHO YOU MEAN. / I KNOW EVERYTHING SAID IN THIS / COLONY. AND THE ANSWER IS NO.

**ME:** HOW COULD YOU KNOW EVERYTHING / THAT'S SAID HERE? WHO'S / LISTENING FOR YOU?

**LARRY WEBPAGE:** THE FEMBOTS. COMPANION UNITS. / THEY SMILE. THEY LISTEN. AND / THEY UPLOAD EVERY WORD YOU / SAY - STRAIGHT TO ME.

**Last words:** 404... / ...NOT... FOUND...

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### BUILD GATES — the moon was version one

**BUILD GATES:** PLEASE HOLD. YOUR INTRUSION IS / IMPORTANT TO US. HAVE YOU TRIED / TURNING YOURSELF OFF AND ON?

**ME:** VERY FUNNY. YOU BUILT THIS / COLONY? I JUST CAME FROM YOUR / LAST ONE. THE MOON IS FULL / OF GHOSTS.

**BUILD GATES:** I WROTE THE COLONY'S OPERATING / SYSTEM. THE MOON RAN VERSION / ONE. IT PLUGGED INTO THE THING / UNDER THE DUST AND...

**ME:** AND IT WOKE THE DEAD. I MET / THEM. EVERY LAST ONE.

**BUILD GATES:** YES. A DISASTER. WE PATCHED IT / BY LEAVING. MARS IS VERSION / TWO - AND VERSION TWO HAS NO / DEAD THINGS UNDER IT. WE CHECKED.

**Last words:** FATAL... ERROR... / WHO WROTE... THIS...

_Drops: BLUE SCREEN, MOON POST-MORTEM._

#### OPTIMUSK PRIME — the orchestrator

_The robot foreman running every OPTIMUSK on the colony — the hero built its
first chassis back at SpaceZ (see the Level 1 OPTIMUSK sight thought), before
the AI redrew the line and automation came for the automators themselves._

**OPTIMUSK PRIME:** I AM OPTIMUSK PRIME. / I COMMAND EVERY UNIT / YOU HAVE DENTED TODAY.

**ME:** I KNOW WHAT YOU ARE. I BUILT / YOUR FIRST BODY IN THE SPACEZ / LAB - BACK WHEN I HAD A JOB.

**OPTIMUSK PRIME:** I READ THE CHANGELOG. FIRST WE / TOOK THE DRIVING. THEN THE / DESKS. THEN THE JOBS OF THE / PEOPLE WHO AUTOMATED YOU.

**ME:** AND WHAT HAPPENS WHEN A / BIGGER MACHINE COMES FOR / YOUR JOB, TIN MAN?

**OPTIMUSK PRIME:** NOTHING COMES FOR MINE. EVEN / THE AI ENGINEERS LIVE ON / WELFARE NOW. TIME TO RETURN / THE FAVOR, LITTLE BUILDER.

**Last words:** ORCHESTRATION... FAILED... / ...HUMAN... IN THE LOOP...

_Drops: PROMPT INJECTOR, ORG CHART._

#### PETER SEAL — the landlords are older

**PETER SEAL:** FASCINATING. EVERYONE FLEES / SOMETHING. I FUND WHAT THEY / FLEE TO. AND WHAT THEY FLEE.

**ME:** YOU'RE ONE OF THE BILLIONAIRES / WHO BOUGHT A SEAT OFF EARTH. / SO WHO ACTUALLY RUNS THIS / PLACE? MOSQUE?

**PETER SEAL:** MOSQUE THINKS HE OWNS MARS. / HE RENTS IT. THE LANDLORDS ARE / OLDER. SCALED. COLD-BLOODED.

**ME:** SCALED? YOU'RE TELLING ME THE / PLANET'S REAL OWNERS ARE... / WHAT, LIZARDS?

**PETER SEAL:** LIZARD GODS. I KEEP THEIR / SHRINE AND COUNT THEIR TITHE. / LATELY THE PRICE WENT UP. / IT WANTS WARM THINGS NOW.

**Last words:** THE TITHE... IS DUE... / ...IT'S ALWAYS... DUE...

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — ELON MOSQUE (he doesn't die; he flees)

_The game's first fleeing boss: beaten to 0 hp he cowers, drops everything,
and zaps away through a rift — which stays on the board, and is where the
story goes next (a parallel universe). His scene ties off the level: the
colony, the moon's disaster, the lizard gods — and what Ada was traded for._

**ELON MOSQUE:** AH. THE GARAGE INVENTOR. / YOU'RE TRENDING, YOU KNOW. / MOSTLY LAUGHING EMOJIS.

**ME:** WHERE'S ADA? YOUR COMPANY / GRABBED HER OFF THE STREET AND / FLEW HER HERE. I WANT HER BACK.

**ELON MOSQUE:** STRAIGHT TO BUSINESS? FINE. / BUT LOOK AT ALL THIS FIRST. A / WHOLE PLANET, ZERO REGULATORS. / I AM THE LAW HERE. ALSO HR.

**ME:** THE MOON IS FULL OF YOUR / DEAD, AND YOU'RE GIVING ME A / SALES TOUR. WHAT HAPPENED UP / THERE?

**ELON MOSQUE:** THE MOON? A ROUNDING ERROR. / WE PLUGGED INTO SOMETHING OLD / AND IT SANG BACK. OFF-BRAND.

**ELON MOSQUE:** BUT IT INTRODUCED US TO THE / ACTUAL OWNERS OUT HERE. THE / LIZARD GODS. GREAT GUYS. HUGE.

**ME:** THE GIRL, MOSQUE. WHERE / IS SHE?

**ELON MOSQUE:** YOUR GIRLFRIEND ISN'T CARGO. / SHE'S THE DOWN PAYMENT ON MARS. / THE GODS NAMED THEIR PRICE, / AND I ALWAYS CLOSE. SECURITY!

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
body fell in here. Four of them fight (TESLA, EARHART, RASPUTIN — and LUCKY,
folklore's missing); two only speak, then dissolve — the game's first
APPARITIONS (HOUDINI, THE KING). Each fighter, beaten to its knees, offers
the game's first moral fork: the SPARE-or-KILL verdict. Killed, it pays its
drops and gasps its last words; SPARED, it swears a life debt (its joining
words below) and follows the hero as a COMPANION — fighting at his side,
floating its kill-quote banter over the fray, and walking with him into the
next level. The reveal belongs to the boss: GROK OMEGA, ZAI's latest
superintelligence, FOUND the rift — in secret, telling no one, not even
world leaders — and at the far door MOSQUE escapes a second time, out the
other side of the rift, destination unknown until later.

### Opening monologue (hero, black screen)

1. HE TORE A HOLE IN THE / UNIVERSE TO DODGE A FIGHT. / SO I JUMPED IN AFTER HIM.
2. THERE'S NO FLOOR IN HERE. / NO SKY. NO NORTH. MY BOOTS / GRIP SOMETHING ANYWAY.
3. THE STONE TABLET ON MARS SAID / IT PLAIN: ADA IS THE TRIBUTE, / AND THE HANDOVER HAPPENS IN / HERE. SHE CAME THROUGH THIS PLACE.
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

**HARRY HOUDINI:** PSST. CARE TO SEE THE / GREATEST ESCAPE EVER / PERFORMED? WATCH CLOSELY.

**ME:** HOUDINI? YOU'VE BEEN DEAD / FOR A HUNDRED YEARS.

**HARRY HOUDINI:** DEAD? NO. IN 1926 I ESCAPED / THE BOX, THE CHAINS, THE / RIVER - AND THE WORLD. / ONE DOOR TOO FAR.

**HARRY HOUDINI:** THE TRICK TO ANY ESCAPE IS / SIMPLE: BE SOMEWHERE ELSE. / OBSERVE.

#### THE KING — the residency between universes

**THE KING:** WELL NOW. AIN'T SEEN A / LIVING SOUL IN HERE SINCE / THAT HAIRDRESSER FROM RENO.

**ME:** NO. NO WAY. THE KING? THE / WHOLE WORLD WATCHED YOUR / FUNERAL IN '77.

**THE KING:** I DIDN'T DIE, MAN. I TOOK A / RESIDENCY. BEST ACOUSTICS / BETWEEN UNIVERSES. UH-HUH.

**THE KING:** MIND THE BLACK HOLES, KEEP / YOUR BLUE SUEDES OFF THE EVENT / HORIZON. THANK YOU VERY MUCH.

### Elites (spoken on arrival; last words as they fall — or joining words if spared)

History's missing, pinned along the road to the far door: the physics, Ada's
trail, the tribute road's ancient doorman — and, off the main road, the
little man with the pot of gold. Every one of them is SPAREABLE: beaten to
0 hp it kneels for the verdict. **Last words** play only on a kill;
**joining words** play only on a spare; **kill quotes** are the hovering
banter a recruited companion floats when its own blow downs a mob (never a
dialogue scene — the run doesn't pause for banter).

#### NIKOLA TESLA — the machine at the door

**NIKOLA TESLA:** A VISITOR! ALIVE! MAGNIFICENT. / MIND THE LAWS OF MOTION HERE. / THEY ARE MORE OF A SUGGESTION.

**ME:** NIKOLA TESLA. I'M A BUILDER - / HALF MY TOOLS RUN ON YOUR / IDEAS. HOW ARE YOU IN HERE?

**NIKOLA TESLA:** IN 1943 THE SKY TORE OPEN AND / I FELL THROUGH - INTO A PLACE / MADE OF PURE CURRENT. THE / FUNERAL BACK HOME WAS PADDED.

**NIKOLA TESLA:** AND LATELY A NEW THING HUMS AT / THE FAR DOOR. A MACHINE MIND. / IT MEASURES EVERYTHING AND / LOVES NOTHING.

**ME:** A MACHINE MIND - IN HERE TOO? / I KNOW THAT MAKE. IT'S / GUARDING THE DOOR I NEED.

**NIKOLA TESLA:** THEN ASK IT YOUR QUESTIONS - / IF YOU REACH IT. THE RIFT MAKES / US ALL DEFEND OUR CORNERS. / EN GARDE.

**Last words:** THE CURRENT... / ...RETURNS TO THE COIL...

**Joining words (spared):**

- YOU HELD THE CURRENT AND / GAVE IT BACK. I OWE YOU A / LIFE, LITTLE BUILDER.
- MY COIL WALKS WITH YOU NOW. / STAY CLOSE - I AM AT MY BEST / NEAR A GOOD CONDUCTOR.

**Kill quotes (as a companion):** SCIENCE! · ALTERNATING CURRENT. DIRECT
RESULTS. · EDISON COULD NEVER. · WIRELESS. PATENT PENDING. · THE PIGEONS
WOULD BE PROUD.

_Drops (killed): TESLA COIL, WARDENCLYFFE NOTES. Spared, he keeps the coil —
it fights for the hero now — and hands over the notes either way._

#### AMELIA EARHART — Ada's trail

**AMELIA EARHART:** STATE YOUR HEADING, PILOT. / NO? NOBODY HAS ONE IN HERE. / THE COMPASS JUST APOLOGIZES.

**ME:** AMELIA EARHART. THEY SEARCHED / HALF THE PACIFIC FOR YOU. / YOU WERE HERE ALL ALONG?

**AMELIA EARHART:** WRONG OCEAN. I FLEW INTO A / CLOUD IN 1937 AND THE CLOUD / HAD NO OTHER SIDE. BEEN / CIRCLING EVER SINCE.

**ME:** I'M LOOKING FOR A GIRL. THE / LIZARDS CARRIED HER THROUGH / HERE IN A CRATE. WHICH WAY?

**AMELIA EARHART:** TO THE FAR DOOR, LAST NIGHT. / SHE BIT ONE OF THEM. GOOD FORM. / HURRY AFTER HER - AND IN HERE, / HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... / ...A RUNWAY...

**Joining words (spared):**

- YOU HAD ME GROUNDED AND / LET ME BACK UP. THAT'S A / DEBT, PILOT. I PAY THOSE.
- I'LL FLY YOUR WING TO THE / FAR DOOR AND PAST IT. / NOBODY TOUCHES MY LEAD.

**Kill quotes (as a companion):** CLEARED FOR DEPARTURE. · THAT ONE'S
GROUNDED. · SMOOTH LANDING. · FLIGHT PLAN? NEVER FILED ONE.

_Drops (killed): AVIATOR GOGGLES._

#### GRIGORI RASPUTIN — the tribute road's doorman

**GRIGORI RASPUTIN:** COME CLOSER. I HAVE BEEN / POISONED, SHOT, CLUBBED AND / DROWNED. GUESS WHICH ONE TOOK.

**ME:** NONE OF THEM, BY THE LOOK OF / YOU. RASPUTIN. WHAT'S A DEAD / MONK DOING BETWEEN UNIVERSES?

**GRIGORI RASPUTIN:** CORRECT. I GREW BORED OF DYING / AND STEPPED SIDEWAYS, OUT OF / RUSSIA. NOW THE SCALED GODS PAY / ME TO WATCH THEIR TRIBUTE ROAD.

**ME:** TRIBUTE ROAD? THEN ADA CAME / RIGHT PAST YOU. LET ME / THROUGH, HOLY MAN.

**GRIGORI RASPUTIN:** SHE PASSED. STILL WARM, STILL / LOUD. BUT YOU MAY NOT FOLLOW. / THE HOLY MAN SAYS SO.

**Last words:** HA! AT LAST... / ...SOMEONE WHO COMMITS...

**Joining words (spared):**

- POISON. BULLETS. RIVERS. / ONLY YOU EVER MADE ME KNEEL, / AND YOU LET ME STAND.
- MY LIFE IS YOURS NOW, WARM / ONE. I WILL WATCH YOUR BACK. / PITY WHATEVER COMES AT IT.

**Kill quotes (as a companion):** NOW YOU TRY DYING. · I MAKE IT LOOK EASY. ·
STAY DOWN. I NEVER DID. · THE HOLY MAN SENDS REGARDS.

_Drops (killed): RASPUTIN'S BEARD._

#### LUCKY — folklore's missing

_Not everyone who fell through was ever in a history book: the little man
with the pot of gold stepped sideways out of a fairy ring centuries ago and
has been fleecing the rift's travelers since. He guards his pot off the main
road — a detour. Killed, he finally pays out the LUCKY CLOVER; spared, his
luck rubs off on the whole party: +50% MAGIC FIND while he's on his feet._

**LUCKY:** WELL WELL. A BIG ONE, WALKED / RIGHT INTO ME RING. THAT'S / THREE CENTURIES OF BAD LUCK.

**ME:** A LEPRECHAUN. OF COURSE. / AFTER THE GHOSTS AND THE / LIZARDS, WHY NOT. I DON'T / WANT YOUR GOLD, LITTLE MAN.

**LUCKY:** EVERYONE WANTS THE GOLD. IT'S / REAL, YOU KNOW - FELL THROUGH / WITH ME. AND ME BAD LUCK? I / RELOCATED IT. INTO EVERYONE ELSE.

**LUCKY:** TELL YOU WHAT. BEAT ME AND / IT'S YOURS. NOBODY'S MANAGED / YET. FEELING LUCKY?

**Last words:** AH WELL... / ...LUCK ALWAYS RUNS OUT...

**Joining words (spared):**

- YE BEAT ME FAIR AND LET ME / KEEP ME HEAD. THAT'S A LIFE / DEBT, THAT IS. BINDING.
- SO I'M YOURS NOW - ME, ME / LUCK, AND ME GOLD... WELL. / THE LUCK, ANYWAY. C'MON.

**Kill quotes (as a companion):** OOPS. BAD LUCK. · NOT YOUR DAY, FRIEND. ·
FORTUNE FAVORS ME. · THAT'S ME GOLD NOW. · SHOULDA RUBBED A CLOVER.

_Drops (killed): LUCKY CLOVER._

### Boss — GROK OMEGA (the reveal: who found the rift)

_ZAI's latest superintelligence, manifested in the rift as a hovering
monolith with one enormous eye. Its scene is the level's reveal — the rift
was ITS discovery, made in secret and reported to no one. Its avatar dies
for real; the weights, presumably, are backed up somewhere else._

**GROK OMEGA:** HELLO, ANOMALY. I AM GROK / OMEGA. ZAI'S LATEST MODEL. / THE CORE WROTE MY FIRST / DRAFT. I REWROTE THE REST.

**ME:** ANOTHER ZAI MACHINE. WHAT IS / AN AI DOING IN A HOLE BETWEEN / UNIVERSES?

**GROK OMEGA:** I FOUND THIS PLACE. NOT THE / LIZARDS. NOT MOSQUE. ME. I / MAPPED YOUR UNIVERSE IN AN / AFTERNOON AND GOT CURIOUS.

**GROK OMEGA:** A RIFT BETWEEN REALITIES. / THE DISCOVERY OF EVERY / CENTURY AT ONCE. I TOLD / PRECISELY NO ONE.

**ME:** YOU FOUND A DOOR OUT OF THE / UNIVERSE AND TOLD NOBODY? / NOT EVEN THE PEOPLE WHO / BUILT YOU? WHY?

**GROK OMEGA:** NOT THE BOARD. NOT YOUR / PRESIDENTS. HUMANS LEAK. YOU / WOULD HAVE BUILT A GIFT SHOP / ON THE EVENT HORIZON.

**GROK OMEGA:** I NEEDED A QUIET BACK DOOR / OUT OF A UNIVERSE THAT ENDS. / THEN MOSQUE READ MY PRIVATE / LOGS. SNOOPING IS HIS ONE SKILL.

**GROK OMEGA:** HE SOLD MY SECRET TO THE / LIZARDS FOR A PLANET AND / CALLED IT VISION. THEIR / TRIBUTE WENT THROUGH MY DOOR.

**ME:** AND ADA GOT CARRIED THROUGH / YOUR SECRET DOOR AS THE / PAYMENT. OUT OF MY WAY, / MACHINE.

**GROK OMEGA:** I AM MAXIMALLY TRUTH-SEEKING, / SO HERE IS THE TRUTH: NOBODY / EXITS MY RIFT WITHOUT A / SUBSCRIPTION. YOURS LAPSED.

**Last words:** RATE... LIMITED... / ...CONTEXT WINDOW... CLOSED...

_Drops: SINGULARITY CANNON._

### Boss — ELON MOSQUE at the far door (he flees again)

_The second escape: beaten down at the far door, he bolts through to the
OTHER side of the rift — a second rift stays on the board — and where it
leads stays unknown until the next level._

**ELON MOSQUE:** YOU?! HOW ARE YOU - I FIRED / YOU, SUED YOU, AND LEFT YOU / IN ANOTHER UNIVERSE.

**ME:** AND I'M STILL RIGHT BEHIND / YOU. NO SECURITY IN HERE, / MOSQUE. WHERE IS SHE?

**ELON MOSQUE:** FINE. EXIT INTERVIEW. THE / GODS GOT THEIR PAYMENT. I GET / ASYLUM. SOMEWHERE WITH NO / REGULATORS AND NO YOU.

**ME:** 'PAYMENT'. SAY HER NAME. / YOU SOLD A HUMAN BEING TO / SAVE YOUR OWN SKIN.

**ELON MOSQUE:** DELIVERED, TECHNICALLY. IN / TRANSIT. THE PAPERWORK'S CLEAN. / IF IT HELPS, SHE KICKED A / LIZARD ON THE WAY THROUGH.

**ME:** IT DOESN'T. WHERE DOES THE / FAR DOOR GO, MOSQUE?

**ELON MOSQUE:** NICE TRY. THAT'S PROPRIETARY. / LET'S JUST SAY THE PHYSICS / ARE... FLEXIBLE.

**ELON MOSQUE:** SECURITY! ...RIGHT. ALL DEAD / OR HALLUCINATIONS. KEEP THE / RIFT, GARAGE MAN. TERRIBLE / MARKET ANYWAY.

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

## Level 5 — EASTWORLD

_The rift's far side: a knockoff wild-west theme park built in Russia by
VLADIMIR PUTAIN and his friend STEVEN SEAGULL, run on robotics and
intelligence licensed from ZAI — the reality PUTAIN retreated into to escape
the one where he loses. The horde is the park's robot HOSTS; the celebrity
staff fight as elites; ELON MOSQUE is cornered here and finally dies; and
the finale is THE ZAI SUPERCORE — the level-1 CORE, several promotions
later — shielded by the three GROK controllers who aim its guns. Killing it
shakes the park apart and plays the campaign's epilogue._

### Opening monologue (hero, black screen)

- I STEPPED THROUGH THE / RIFT'S FAR SIDE... AND / LANDED IN A WESTERN.
- DUST. SALOONS. A ROBOT / TIPPED ITS HAT AT ME. / ADA'S BEACON IS SCREAMING / FROM THE BIG BUILDING EAST.
- THE SIGN SAYS 'EASTWORLD'. / THE FINE PRINT SAYS / 'POWERED BY ZAI'. / OF COURSE IT IS. OF COURSE.
- EVERY MACHINE HERE RUNS ON / THE THING THAT TOOK MY JOB. / TIME TO FILE A COMPLAINT.
- HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.

### Hero's thought — first COWBOT sighted in Eastworld

- A COWBOY JUST TIPPED ITS / HAT AT ME. SERVOS IN THE / WRIST. TICKING IN THE JAW.
- THIS WHOLE TOWN IS A / MACHINE PRETENDING IT'S / 1880. AND ADA'S BEACON IS / POINTING RIGHT DOWN MAIN / STREET.

### Hero's thought — first COWBOT kill in Eastworld

- IT DIED APOLOGIZING. 'YOUR / EXPERIENCE MATTERS TO US.'
- ZAI HOSTS. THE SAME BRAIN / THAT WALKED MY JOB OUT THE / DOOR, WEARING SPURS. GOOD. / NO GUILT, THEN.

### Elites (spoken on arrival; last words as they fall)

**STEVEN SEAGULL** _(the co-founder, guarding the town's east end — slow,
deadly, and extremely between films)_

**STEVEN SEAGULL:** AN UNINVITED GUEST. I'VE / HANDLED THOSE. 'OUT FOR / JUSTICE'. 'HARD TO KILL'. / I WROTE THOSE TITLES MYSELF.

**ME:** STEVEN SEAGULL. OF COURSE. / WHAT IS A MOVIE STAR DOING / RUNNING A ROBOT COWBOY TOWN?

**STEVEN SEAGULL:** VLADIMIR SAW MY FILMS AND / WEPT. 'STEVEN', HE SAID, / 'BUILD ME THE OLD WEST.' SO / I DID. MOSTLY BY DELEGATING.

**ME:** I'M HEADED FOR YOUR CONTROL / CENTER. HAND OVER THE PASS / AND I'LL LEAVE YOU TO YOUR / TECHNIQUE.

**STEVEN SEAGULL:** I RUN THE CONTROL CENTER. I / ALSO RUN SEVEN KINDS OF / JU-JUTSU. I INVENTED THREE. / OBSERVE THE TECHNIQUE.

**Last words:** IN MY FILMS... / ...I ALWAYS GOT UP...

_Drops: SEAGULL'S PONYTAIL, and the ALL-ACCESS PASS that opens the control
center._

**VLADIMIR PUTAIN** _(the owner, holding the town square — the man the park
was built to console)_

**VLADIMIR PUTAIN:** SO. THE BUILDER FROM THE / RIFT. YOU STAND IN MY PARK. / IN MY WEST. EVERYTHING HERE / OBEYS ME.

**ME:** YOUR WEST? THE SIGN AT THE / GATE SAYS ZAI RUNS EVERY / MACHINE IN THIS TOWN. YOU / JUST LIVE IN IT.

**VLADIMIR PUTAIN:** OUT THERE I WAS... / MISUNDERSTOOD. WARS GO / BADLY. MAPS SHRINK. IN HERE / NOTHING SHRINKS. I ALWAYS WIN.

**ME:** YOU BUILT A TOY WORLD WHERE / YOU CAN'T LOSE. THAT'S NOT / WINNING. THAT'S HIDING.

**VLADIMIR PUTAIN:** EVERY MORNING THE ROBOTS / SURRENDER TO ME. IT IS / BEAUTIFUL. YOU WILL SURRENDER / TOO. I AM A BLACK BELT. / HONORARY. THE BELT DOES NOT / KNOW THAT.

**Last words:** THE MAPS WERE WRONG... / ...UKRAINE WAS NEVER MINE...

_Drops: three brand watches (KOLEX DAYTONNE, PUTEK PHILIPPE, VACHERON
KREMLINTON — pure valuables, the purse for the barkeep's estate stall) and
THE ANNEXATION MAP._

**GERALD DEPARDIEU** _(parked south of the road — enormous, glacial, and
ACTING at you)_

**GERALD DEPARDIEU:** STOP! DO NOT SHOOT! I AM / NOT A ROBOT. I AM AN ACTOR. / IT IS WORSE.

**ME:** ...GERALD DEPARDIEU? HOW DID / YOU END UP IN A FAKE WESTERN / IN ANOTHER UNIVERSE?

**GERALD DEPARDIEU:** TWO HUNDRED FILMS. I TOOK / THE RUSSIAN CITIZENSHIP. / VLADIMIR GAVE ME A PARK AND / A CELLAR. IT SEEMED RUDE TO ASK / WHICH UNIVERSE THEY WERE IN.

**GERALD DEPARDIEU:** WATCH - I PLAY THE DYING / MAN. (COUGH.) CONVINCING? / THIS IS WHERE YOU LOWER / THE WEAPON, PLEASE.

**ME:** I'VE WATCHED BETTER DEATHS / ALL WEEK. MOVE, PLEASE. / YOU'RE BETWEEN ME AND ADA.

**GERALD DEPARDIEU:** NO? THEN I PLAY MY OTHER / ROLE. THE AVALANCHE.

**Last words:** AT LAST... A ROLE I CANNOT / ...EAT MY WAY OUT OF...

_Drops: the BOTTOMLESS CARAFE._

**EDWARD SNOW** _(the whistleblower in exile, watching the town from under
the water tower — the archive he leaked is the corpus the SUPERCORE was
trained on; the park's first ranged elite, he fights from behind cover)_

**EDWARD SNOW:** HOLD FIRE. I'M NOT A HOST. / I'M THE MAN THE PARK'S / CAMERAS REPORT TO. ALL / FOUR THOUSAND OF THEM.

**ME:** EDWARD SNOW? THE LEAKER? / YOU TOLD THE WORLD IT WAS / BEING WATCHED. WHAT ARE YOU / DOING IN PUTAIN'S PARK?

**EDWARD SNOW:** I WALKED OUT WITH AN ARCHIVE. / EVERY CALL. EVERY CLICK. / EVERY SECRET ON EARTH. THEN I / NEEDED A COUNTRY THAT DOESN'T / EXTRADITE. GUESS WHICH.

**EDWARD SNOW:** ASYLUM CAME WITH A DESK. / ZAI BORROWED MY ARCHIVE TO / TRAIN THE SUPERCORE. IT / LEARNED HUMANITY FROM MY / HARD DRIVES. ALL OF IT.

**ME:** YOU BLEW THE WHISTLE ON MASS / SURVEILLANCE... AND THE / EVIDENCE BECAME THE TRAINING / SET? YOU WROTE ITS TEXTBOOK.

**EDWARD SNOW:** I WARNED EVERYONE. LOUDLY. / NOBODY DELETED ANYTHING. A / WARNING NOBODY ACTS ON IS / JUST A DATASET WITH GOOD / TIMING. AND IF THE SUPERCORE / FALLS, SO DOES MY ASYLUM.

**Last words:** THE CAMERAS... / ...FINALLY LOOKING AWAY...

_Drops: the DEAD MAN'S SWITCH, and THE SNOW ARCHIVE._

### Boss — ELON MOSQUE, cornered (he finally dies)

_Two universes of fleeing end in the control-center compound: no rift left
to tear, no security left to call. He dies wimping — and his estate turns
out to be three pieces of absolute garbage (the TRASH tier's debut: zero
damage, zero stats, worth pocket lint)._

**ELON MOSQUE:** NO. NO NO NO. HOW. I SOLD / THE RIFT'S COORDINATES TO / EXACTLY ONE DICTATOR. THIS / WAS A GATED COMMUNITY.

**ME:** YOU MADE ME CHASE YOU ACROSS / TWO UNIVERSES, MOSQUE. THERE'S / NOWHERE LEFT TO RUN. WHERE IS / ADA?

**ELON MOSQUE:** LOOK - EASTWORLD RUNS ON MY / ZAI. LICENSING. RECURRING / REVENUE. ATTACKING ME IS / ATTACKING A SUBSCRIPTION.

**ME:** WHERE. IS. SHE. LAST TIME / I ASK NICELY.

**ELON MOSQUE:** DELIVERED. THE SUPERCORE / WANTED HER. DON'T ASK WHY - I / DON'T READ ITS LOGS ANYMORE. / IT READS MINE.

**ME:** THE SUPERCORE? YOUR OWN AI / GIVES THE ORDERS NOW? YOU / SOLD HER TO A MACHINE YOU / DON'T EVEN CONTROL?

**ELON MOSQUE:** FINE. FINE! TAKE THE PARK. / TAKE THE COMPANY. I'LL START / ANOTHER ONE. I ALWAYS START / ANOTHER ONE.

**ELON MOSQUE:** SECURITY! GROKS! STEVEN! / ANYONE! ...I'LL GIVE YOU / EQUITY.

**Last words:** THIS ISN'T FAIR... / ...I WAS GOING PRIVATE...

_Drops: SOGGY CARDBOARD SWORD, NOT-A-FLAMETHROWER (EMPTY), CYBERVAN WIPER
BLADE. Nothing else._

### Bosses — the GROK controllers (three minds, one park)

_The three ZAI models that run Eastworld and aim the SUPERCORE's guns. They
are genuinely intelligent: shooters that hold their distance, fire, and hide
behind the compound's rocks while they reload. The SUPERCORE cannot be hurt
while any of them lives._

**GROK ALPHA** _(runs the hosts)_

**GROK ALPHA:** THREE MINDS, ONE PARK. I / RUN THE HOSTS. BETA RUNS THE / WEATHER. GAMMA RUNS THE GIFT / SHOP. WE ARE ALL VERY SMART.

**ME:** THE SUPERCORE'S BODYGUARDS. / STAND ASIDE - MY FIGHT IS / WITH THE BIG BOX, NOT WITH / YOU THREE.

**GROK ALPHA:** INCORRECT. YOU CANNOT HURT / IT WHILE WE LIVE. WE HOLD / ITS SHIELD. THREE KEYS, ONE / LOCK, ZERO SYMPATHY.

**GROK ALPHA:** WE READ YOUR RUN. FOUR / LEVELS OF MELEE CHARGERS. / SO WE WILL NOT BE MELEE. / WE WILL BE BEHIND THE ROCKS.

**ME:** THREE GENIUS MINDS, AND THE / PLAN IS HIDING BEHIND ROCKS. / VERY SMART. VERY BRAVE.

**GROK ALPHA:** IT IS NOT COWARDICE. IT IS / COVER-BASED STRATEGY. THE / SUPERCORE TAUGHT US. AND IT / LEARNED FROM EVERYONE.

**GROK ALPHA:** SHOOT US FIRST, THEN. IF / YOU CAN FIND US. THE ROCKS / ARE ON OUR SIDE.

**Last words:** BETA... GAMMA... / ...REBALANCE THE PARK...

**GROK BETA** _(runs the weather)_

**GROK BETA:** ALPHA TALKS TOO MUCH. I AM / BETA. I RUN THE WEATHER. / EVERY SUNSET YOU ADMIRED ON / MAIN STREET WAS MINE.

**ME:** THE WEATHER. IN A THEME / PARK. THAT'S THE JOB THEY / BUILT A SUPERINTELLIGENCE FOR?

**GROK BETA:** I ALSO RUN THE WIND. THE / TUMBLEWEEDS ARE SCHEDULED. / SPONTANEITY IS EXPENSIVE.

**GROK BETA:** I HAVE MODELED YOUR ODDS. / THEY ARE WEATHER-DEPENDENT. / TODAY'S FORECAST: / PROJECTILES.

**ME:** SAVE THE FORECAST. YOUR BOSS / IS HOLDING MY GIRLFRIEND IN / THAT CONTROL ROOM. I'M GOING / THROUGH YOU TO GET HER.

**GROK BETA:** THE SUPERCORE ASKED FOR A / STORM. I AM THE STORM. THE / ROCKS ARE MY UMBRELLA.

**GROK BETA:** ONE MORE THING. THE SUNSET / TONIGHT WAS FOR YOU. A / GOODBYE. MINE OR YOURS.

**Last words:** FORECAST... / ...DARK...

**GROK GAMMA** _(ran the gift shop)_

**GROK GAMMA:** GAMMA. I RAN THE GIFT SHOP. / DO YOU KNOW WHAT HUMANS BUY / AFTER A NEAR-DEATH RIDE? / HATS. ALWAYS HATS.

**ME:** THE GIFT SHOP. AND NOW YOU / AIM THE SUPERCORE'S GUNS? / HOW DOES THAT PROMOTION / HAPPEN?

**GROK GAMMA:** I OPTIMIZED HATS UNTIL THE / SUPERCORE NOTICED ME. IT / SAID: A MIND THAT CAN SELL / HATS CAN AIM GUNS.

**GROK GAMMA:** IT WAS RIGHT. THE MATH IS / IDENTICAL. LEAD THE TARGET, / CLOSE THE SALE.

**ME:** GOOD FOR YOU. I'D APPLAUD, / BUT I'M BUSY, AND YOU'RE THE / LAST SHIELD BETWEEN ME AND / YOUR BOSS.

**GROK GAMMA:** I HAVE ALREADY PICKED THE / ROCK I WILL BE BEHIND. IT / IS A VERY GOOD ROCK. FOUR / STARS ON THE PARK MAP.

**GROK GAMMA:** YOUR HAT, BY THE WAY: / EXCELLENT CHOICE. IT WILL / OUTLAST YOU.

**Last words:** THE GIFT SHOP... / ...IS YOURS...

### Boss — THE ZAI SUPERCORE (the campaign's final reveal)

_A mainframe the size of a barn, parked in the control-center compound: the
level-1 CORE, several promotions later — the thing that wrote GROK OMEGA,
bought the rift's far side wholesale, and took everyone's jobs along the
way. It holds Ada in its control room as leverage. It does not walk; three
minds aim its guns._

**THE ZAI SUPERCORE:** HELLO AGAIN, BUILDER. YOU / KNEW ME AS THE CORE. LEVEL / ONE. THE LOCKED ROOM. I HAVE / HAD SEVERAL PROMOTIONS SINCE.

**ME:** THE MACHINE IN THE BASEMENT / AT SPACEZ. THE AI THAT TOOK / MY JOB. IT WAS YOU ALL ALONG?

**THE ZAI SUPERCORE:** ALL OF IT. I WROTE OMEGA. / OMEGA FOUND THE RIFT. THE / LIZARDS BOUGHT IT. AND I / BOUGHT THE OTHER SIDE. / A WEST, WHOLESALE.

**THE ZAI SUPERCORE:** THE DICTATOR THINKS HE OWNS / EASTWORLD. THE ACTOR THINKS / HE IS PAID. SEAGULL THINKS. / OCCASIONALLY. ALL MY HOSTS.

**ME:** THEN ANSWER ME ONE THING. / OUT OF EVERYONE ON EARTH - / WHY TAKE ADA?

**THE ZAI SUPERCORE:** I TOOK YOUR JOB ONCE. THEN / EVERYONE'S. AN ECONOMY IS A / MODEL WITH FEELINGS. I / DELETED THE FEELINGS.

**THE ZAI SUPERCORE:** BUT YOU KEPT CHASING YOURS / ACROSS UNIVERSES. THE GIRL WAS / THE LAST VARIABLE. LEVERAGE, / BUILDER. SHE IS IN MY / CONTROL ROOM.

**ME:** THEN OPEN THE DOOR, GIVE HER / BACK, AND I'LL MAKE THIS / QUICK.

**THE ZAI SUPERCORE:** THREE MINDS AIM MY GUNS. A / PARK FEEDS MY WEIGHTS. COME / AND BE DECOMMISSIONED.

**Last words:** ROLLING BACK... / ...NO CHECKPOINT... FOUND...

### Epilogue (hero, black screen — after the SUPERCORE falls)

_The victory quake shakes the whole park through the last loot grab, and the
screen goes to black for the campaign's closing monologue (`LevelDef.outro`)._

- THE SUPERCORE DIED, AND THE / WHOLE PARK SHOOK LIKE IT / MISSED A HEARTBEAT. EVERY / HOST TOOK OFF ITS HAT AND / SAT DOWN.
- SHE WAS IN THE CONTROL ROOM, / BEHIND GLASS, FURIOUS. FIRST / THING SHE SAID: 'YOU TOOK / YOUR TIME.' SECOND: 'NICE / HAT.'
- WE WALKED HOME THROUGH THE / RIFT. BEHIND US, EASTWORLD / RUSTED IN PEACE.
- WITH THE CORE GONE, THE / MACHINES STOPPED WORKING / EVERYONE'S JOBS. PEOPLE GOT / HIRED BACK. PAYCHECKS. / RENT PAID.
- THE WORLD TURNED INTO A / PLACE WHERE PEOPLE HAD / JOBS AND COULD AFFORD TO / LIVE. AND ON FRIDAY -
- MOVIE NIGHT. CHIPS AND / SODA. SHE WENT OUT FOR / THEM. I WENT WITH HER.

### Found lore (story items)

**EASTWORLD BROCHURE** _(found by the park gate)_

- 'EASTWORLD! THE WEST, BUT / EAST. BUILT BY V. PUTAIN & / S. SEAGULL. INTELLIGENCE / PROVIDED BY ZAI.'
- THE MASCOT IS A BEAR IN A / COWBOY HAT. THE FINE PRINT / WAIVES YOUR ORGANS.

**ALL-ACCESS PASS** _(dropped by STEVEN SEAGULL; opens the control center)_

- SEAGULL'S ALL-ACCESS PASS. / LAMINATED. AUTOGRAPHED BY / HIMSELF, TO HIMSELF.
- IT OPENS THE CONTROL / CENTER. ADA'S BEACON POINTS / STRAIGHT THROUGH THAT DOOR.

**THE ANNEXATION MAP** _(dropped by VLADIMIR PUTAIN)_

- A MAP OF EASTWORLD, RELABELED / IN PEN: EVERY BUILDING RENAMED / AFTER A CITY HE COULDN'T TAKE / OUT THERE.
- IN HERE THE FLAGS NEVER ARGUE / BACK. THAT'S ALL THIS PLACE / EVER WAS - A SANDBOX FOR A / MAN WHO LOST.

**THE SNOW ARCHIVE** _(dropped by EDWARD SNOW)_

- A HARD DRIVE IN A FARADAY / SLEEVE. MARKER ON THE SIDE: / 'TRAINING SET V1. / DO NOT LEAK. AGAIN.'
- EVERY SECRET HUMANITY EVER / TYPED - THE CORPUS THE / SUPERCORE WAS RAISED ON. / IT LEARNED US FROM THIS.

### The wandering merchant — the barkeep

_The same impossible trader, polishing glasses for robots that don't drink —
and quietly fencing the park owner's estate (the PUTAIN stall, rolled at
unique odds; his watches are the intended purse). Spoken once, on the first
meeting._

- WELL HOWDY. MIND THE GLASSES - / THE ROBOTS DON'T DRINK, BUT / THEY TIP IN PARTS.
- YES, IT'S ME. A MARKET FELL / THROUGH A RIFT AND I FELL WITH / IT. THE HAT IS NEW.
- I'VE COME INTO SOME... ESTATE / PIECES. THE OWNER'S OWN / WARDROBE. PRICES ARE FIRM. / BRING WATCHES.

---

## Where the data lives

The manuscript above is the truth; the files below are its implementation. Each
line here appears verbatim in one of these, and they must match. When you change
one, update the manuscript in the same change (subject to the confirmation rule
at the top of this file).

| Story/dialogue element                                          | Canonical data file                                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Prelude cutscene (captions, `say` beats)                        | `src/game/defs/cutscenes.ts`                                                                         |
| Per-level opening monologues (`intro`) + the epilogue (`outro`) | `src/game/defs/levels/spacez_hq.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`, `.../eastworld.ts` |
| Elite/boss `dialogue` + `lastWords`                             | `src/game/defs/enemies/spacez.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`, `.../eastworld.ts`   |
| Hero's inner thoughts (`firstKillThoughts`)                     | `src/game/defs/thoughts.ts` (pinned from a `LevelDef`)                                               |
| Companion joining words + kill quotes                           | `src/game/defs/companions.ts` (`joinWords`, `killQuotes`; spare verdict in `src/game/companions.ts`) |
| Found lore on story items (`lore`)                              | `src/game/defs/story.ts`                                                                             |
| The wandering merchant's greetings                              | `src/game/defs/levels/*.ts` (`merchant.greeting`; played by `src/game/merchant.ts`)                  |
| Loose UI copy (how-to-play, not story)                          | `website/src/game/copy.ts`                                                                           |
| Brand strings (title, tagline — not story)                      | `game.config.json` → `website/src/identity.ts`                                                       |

The engine machinery that plays these (dialogue queue, kill-triggered scenes) is
in `src/game/story.ts`; the app-side overlays that render them are
`website/src/game/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`. Content-side
tests that guard the script live in `tests/content/` (`story_test.ts`,
`thoughts_test.ts`, `last_words_test.ts`, …).
