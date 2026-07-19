# Manuscript — _Gone in Space_

> **This file is the source of truth for the game's script — every word.** It
> is the middle tier of the story chain: [`story.md`](./story.md) (the gist —
> the whole plot in prose) is extrapolated into this manuscript (every line,
> verbatim), which is in turn extrapolated into the game (the data under
> `src/game/defs/`). Changes flow **downward**: when `story.md` and this file
> disagree, **`story.md` wins**; when this file and the shipped data (listed
> under [Where the data lives](#where-the-data-lives)) disagree, **this
> manuscript wins** and the data is brought back into line.
>
> Every spoken line, monologue, caption, and piece of found lore in the game is
> transcribed here verbatim, in narrative order.
>
> **Changing the story is a two-step commitment.** If a change to the game
> conflicts with what is written here, the manuscript is updated **only after the
> user confirms the manuscript change** (the user may also grant that
> confirmation ahead of time, as part of the instruction that requests the
> change). Never silently edit the story in code and leave this file stale, and
> never rewrite this file without that confirmation. Use the `update-story`
> skill (`.agent/skills/update-story/`) to make a story change at the top of the
> chain and carry it down. Keep the tiers in lockstep: a PR that touches
> dialogue/story data updates `story.md` and this manuscript in the same change.

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

Ada is never on screen, but she runs through the game as **Ada's Trail** — a
found-lore thread, one trace per campaign level, escalating from scared to
defiant to sabotage: her crushed soda can at SpaceZ HQ, a lost sneaker and a
scratched "A" on the moon, "I AM NOT CARGO" gouged into a holding pod on Mars,
a scrap of her zipper-fixed jacket wrapped around a lizard-god scale in the
rift, and a park host she jammed dead with its own hat in Eastworld (the setup
for the reunion's "nice hat"). The traces are transcribed in each level's
_Found lore_ below.

---

## Recurring lines (not pinned to a level)

### Hero's thought — out-levelling a map (the cap-farm mutter)

_Every map has an intended top level (its per-map XP cap). Once the hero has
farmed a map past that ceiling — the kills now only trickle XP and the enemies
have stopped being a threat — he catches himself grinding and remembers what he
came for. This is the game's one **recurring** inner monologue: it is NOT
one-shot like the pinned beats below, it replays on a cooldown for as long as he
keeps farming a capped map, so it exists in several moods and the engine rotates
through them. Every variation lands the same two beats — these fights give me
nothing now / go find Ada. (`THOUGHT_DEFS` ids `cap_pathetic_1..5`; fired by
`maybeCapThought`.)_

1. THESE THINGS BARELY SLOW ME / DOWN ANYMORE. I'M NOT / LEARNING A THING OUT HERE. // QUIT FARMING SCRAP, BUILDER. / ADA'S STILL OUT THERE.
2. PATHETIC. THEY LINE UP AND / FALL OVER. I COULD DO THIS / IN MY SLEEP. // EVERY MINUTE HERE IS A / MINUTE ADA DOESN'T HAVE. / MOVE.
3. I'VE WRUNG THIS PLACE DRY. / NOTHING LEFT TO PROVE HERE. // STOP CIRCLING. THE ONLY / THING THAT MATTERS IS / FINDING HER. GO.
4. WHEN DID THIS GET EASY? / THEY DON'T EVEN REGISTER. / JUST NOISE ON THE WAY. // ENOUGH WARMUP. ADA FIRST. / ALWAYS ADA.
5. I'M SWATTING FLIES AND / CALLING IT PROGRESS. THIS / ISN'T GETTING ME CLOSER. // SHE NEEDS ME MOVING, NOT / GRINDING. FIND THE WAY OUT. / FIND ADA.

_(Slashes separate lines within a page; `//` marks a page break.)_

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
2. THE TRACKER I SEWED INTO HER JACKET / JUST PINGED - FROM SPACE. SOMEONE / IS TAKING HER OFF THE PLANET.
3. TO FOLLOW HER I NEED A SHIP. I'VE / BEEN BUILDING ONE IN THE GARAGE / FOR YEARS. IT'S ALMOST DONE.
4. ALMOST. THE ENGINE STILL NEEDS ONE / PART I COULD NEVER GET. SPACEZ / KEEPS IT IN THEIR CLEANROOM VAULT.
5. I KNOW, BECAUSE I WORKED THERE. I / BUILT THEIR ENGINES - TILL AN AI / LEARNED MY JOB AND THEY FIRED ME.
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

**NIGHT MANAGER:** IF THEY TOOK HER, SHE'S ON A / MIDNIGHT LAUNCH. NO MANIFEST, / NO NAMES. ALL GO TO THE MOON.

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

**ME:** THEY DUMPED US BOTH FOR AN AI. / YOU BUILD THEM A BIGGER ONE? / QUIT. COME HOME. IT'S ROTTEN.

**THE ARCHITECT:** QUIT? THIS 'ROTTEN COMPANY' / GAVE ME PURPOSE. I AM BUILDING / A SUPERINTELLIGENCE.

**ME:** LOOK WHAT IT'S DONE TO YOU. YOU / CUT A MACHINE CHIP INTO YOUR / HEAD. STILL YOU IN THERE?

**THE ARCHITECT:** I CUT THE CHIP MYSELF. I'D DO IT / AGAIN. FLESH IS A ROUGH DRAFT. / HUMANS ARE OBSOLETE, YOU MOST.

**THE ARCHITECT:** NO MORE TALKING, OLD FRIEND. / NOW YOU WILL DIE.

**Last words:** THE CHIP... TAKE IT... / IT WAS NEVER... MINE...

_Drops: the PASSAGE CHIP (+1 INT passive) he operated into himself, and the CORE
KEYCARD that opens the AI CORE room._

#### CHIEF OF SECURITY — Ada on Pad 2

**CHIEF OF SECURITY:** STOP RIGHT THERE. / I KNOW WHY YOU'RE HERE. / THE GIRL IN THE JACKET, RIGHT?

**ME:** HER NAME IS ADA. TELL ME / WHERE SHE IS AND YOU WALK / AWAY FROM THIS.

**CHIEF OF SECURITY:** CAMERAS CAUGHT HER AT THE / VENDING MACHINES. THEN SUITS / CAME AND PUT HER ON PAD 2.

**ME:** PUT HER ON A ROCKET? SHE WENT / OUT FOR SNACKS. WHY WOULD / ANYONE WANT ADA?

**CHIEF OF SECURITY:** THE PAPERS CALLED HER NO / PASSENGER. A SPECIMEN. I WAS / PAID TO FORGET THAT. YOU TOO.

**Last words:** UGH... PAD 2... / SHE'S ON... PAD... 2...

_Drops: CARGO MANIFEST, and the SPACE SUIT — the EVA suit the hero needs to
leave the planet, picked up as a story item and worn over his clothes and armor
from then on._

#### DR. NOVA — the engine is alien

**DR. NOVA:** FASCINATING. AN INTRUDER WITH / WORKING LEGS. KNOW WHAT WE / KEEP IN THE CLEANROOM VAULT?

**ME:** AN ENGINE PART. I CAME TO TAKE / IT. I HELPED BUILD THAT ENGINE, / BEFORE YOU PEOPLE FIRED ME.

**DR. NOVA:** BUILD IT? NOBODY BUILT IT. / WE DUG IT FROM THE SEA OF / TRANQUILITY IN '69. NOT EARTH'S.

**ME:** NOT FROM EARTH? I MACHINED / PARTS FOR THAT THING FOR TEN / YEARS. IT'S JUST ENGINEERING.

**DR. NOVA:** WE SPENT FIFTY YEARS COPYING / A MACHINE THAT ISN'T BROKEN. / IT'S WAITING. TO GO HOME.

**Last words:** IT'S STILL... HHH... / STILL... HUMMING...

_Drops: VAULT KEYCARD._

#### THE JANITOR — the man who came back wasn't the man they sent

**THE JANITOR:** MIND THE FLOOR. I JUST DID IT. / THIRTY YEARS MOPPING THIS LAB. / YOU LEARN THINGS, MOPPING.

**ME:** THEN YOU SEE EVERYTHING THAT / GOES ON HERE. WHAT'S GOT THE / WHOLE PLACE UP AT MIDNIGHT?

**THE JANITOR:** SOMETHING UP ON THE MOON. ONE / BADGE PINGED: N. ARMSTRONG. / DEAD SINCE 2012. FUNNY THING.

**ME:** ARMSTRONG? THE FIRST MAN ON / THE MOON? SOMEBODY'S JUST / USING HIS OLD BADGE.

**THE JANITOR:** OR WHOEVER CAME BACK FROM THE / MOON IN '69 WASN'T THE FELLA / THEY SENT UP. NOW DROP IT.

**Last words:** AND I JUST... URGH... / ...DID THIS FLOOR...

### Boss — MUSKRAT (the mutant rat who ate the engine part)

**MUSKRAT:** SQUEAK. / ...NO. NO MORE SQUEAKING. / WHAT I ATE FIXED MY TONGUE.

**ME:** A TALKING RAT. SURE. WHY NOT. / WHAT EXACTLY DID YOU EAT?

**MUSKRAT:** THE ENGINE PART YOU CAME FOR. / THEY KEPT IT IN A CHEESE BOX. / OF COURSE I ATE IT.

**MUSKRAT:** NOW IT HUMS IN MY BELLY AND I / HEAR EVERYTHING. THE SUITS. THE / PADS. THE CARGO THAT CRIES.

**ME:** THEN YOU HEARD ABOUT THE GIRL / THEY GRABBED TONIGHT. ADA. / WHERE DID THEY TAKE HER?

**MUSKRAT:** THEY FLEW HER OUT AN HOUR AGO. / PAD 2. TO THE MOON. SHE ASKED / FOR CHIPS. NOBODY GAVE HER ANY.

**MUSKRAT:** WANT THE PART, LITTLE BUILDER? / IT KEEPS MY DREAMS WARM. COME / TAKE IT OUT OF ME.

**Last words:** SQUEAK...? NO... / SQUEEEAK... AFTER ALL...

_Drops: PLASMA CUTTER._

### Found lore (story items)

**ADA'S SODA CAN** _(Ada's Trail — by the vending machines)_

- A CAN OF HER SODA BRAND, / CRUSHED FLAT BY THE / VENDING MACHINES. STILL COLD.
- SHE GOT THIS FAR. THEN / SOMEONE TOOK HER MID-SIP. / I'M RIGHT BEHIND YOU, ADA.

**STORAGE KEYCARD** _(opens Supply Bay B)_

- A GREASY KEYCARD: 'SUPPLY BAY B'. / 'SPARE PARTS' INKED ON IT. / HANDY. I BUILD SHIPS.

**VAULT KEYCARD** _(opens the cleanroom vault)_

- A RED KEYCARD MARKED 'CLEANROOM / VAULT - R&D DIRECTOR ONLY'.
- UNDER THE CLEARANCE STRIPE, / TINY PRINT: 'IF IT HUMS, / DO NOT ANSWER.'

**SPACE SUIT** _(the Chief's EVA suit — suits the hero for the rest of the game)_

- THE CHIEF'S EVA SUIT. / VOID-RATED. GOES ON OVER / EVERYTHING: CLOTHES, ARMOR.
- SHE'S ON PAD 2. / NOW I CAN FOLLOW HER / OFF THE PLANET.

**CARGO MANIFEST**

- TONIGHT'S LAUNCH MANIFEST. / PAD 2. DESTINATION: 'SITE T'.
- CARGO: SUPPLIES AND DRILLS. ONE / LINE INKED IN: 'SPECIMEN 7. / FEMALE. DO NOT FEED.'
- SHE WENT OUT FOR CHIPS AND SODA.

**ANTI-GRAV UNIT** _(the ship's missing engine part, found in the vault)_

- A RING OF METAL THAT ISN'T. / IT FLOATS OFF MY PALM AND / POINTS AT THE SKY. ALWAYS.
- THE TAG: 'TRANQUILITY SAMPLE / 1969-002. PROPERTY OF NOBODY.' / THE PART MY SHIP LACKED.

**CORE KEYCARD** _(dropped by THE ARCHITECT; opens the AI CORE room)_

- A BLACK KEYCARD. NO NAME. / A SIGIL, ONE RED WORD STAMPED: / 'CORE. STAFF OF ONE.'
- HE BADGED INTO THE MIND HE BUILT. / NOW SO CAN I.

**CORE LOG** _(found inside the AI CORE)_

- A WARM TERMINAL. THE CORE HE / BUILT HUMS HERE - A MILLION / VOICES, NONE OF THEM HIS.
- IT SIGNED THE NIGHT LAUNCHES. / IT DREW THE OPTIMUSK LINE. / IT FILED ADA UNDER 'CARGO'.
- THEY DIDN'T REPLACE US WITH A / MACHINE. THEY BUILT ONE THAT / DREAMS OF A WORLD WITHOUT US.

### The wandering merchant — the vending-machine man

_THE MERCHANT's first venue (see `merchant.ts` — he roams the level until met,
then stays put and opens shop). A vending-machine restocker still on his round
in the middle of the lockdown; Ada was last seen at the vending machines — this
is his floor. Spoken once, on the first meeting._

- EASY, FRIEND. I'M NOT STAFF. / I STOCK THE VENDING MACHINES. / SOMEBODY HAS TO, EVEN TONIGHT.
- LOCKDOWN IS A SELLER'S MARKET. / I'LL BUY WHAT WEIGHS YOU DOWN, / SELL WHAT KEEPS YOU UPRIGHT.

---

## Travel — THE LAUNCH (cutscene)

_Between SpaceZ HQ and the moon, part one of the moon level's prelude chain
(`launch` in `defs/cutscenes.ts`). The garage at night: the stolen part is in,
the ship he built over ten years of weekends stands on the lawn, and the hero
leaves home the way Ada did — out the door, no plan to be long._

> **CAPTION:** TEN YEARS OF WEEKENDS / IN THE GARAGE. SHE ONLY / EVER NEEDED ONE MORE PART.

_(The hero crosses the lawn to the ship.)_

**ME:** ENGINE. FUEL. DUCT TAPE. / AND THE PART THEY SAID / I COULDN'T HAVE.

_(He boards. The engine lights and the hull rattles on the pad; the ship
climbs, and the camera follows it up — house, lawn, and ground fall away
until only stars remain.)_

> **CAPTION:** FIRST FLIGHT. NO TEST RUNS. / ADA WOULD CALL IT ROMANTIC.

_(Fade to black.)_

## Travel — THE VOYAGE, LEG ONE (cutscene)

_Between SpaceZ HQ and the moon, part two (`voyage_moon`). Deep space: Earth
shrinking behind, the moon ahead, the hero alone in the hull he built — his
speech anchors to the ship._

> **CAPTION:** EARTH GOT SMALL FAST.

**ME:** THE THING I BUILT IN MY / GARAGE IS IN SPACE. / DON'T THROW UP.

**ME:** HER TRACKER PINGS FROM THE / MOON. SHE WENT OUT FOR / CHIPS AND SODA.

> **CAPTION:** NOBODY GOES TO THE MOON / FOR CHIPS AND SODA.

_(Fade to black.)_

---

## Level 2 — THE MOON

Ada's beacon dies near the old flag. Something up here isn't dead.

### Opening monologue (hero, black screen)

_The launch and the flight now play as the prelude scenes above, so the
monologue opens on arrival._

1. ADA'S TRACKER WENT QUIET / SOMEWHERE NEAR THE OLD APOLLO / FLAG. THAT'S WHERE I'M HEADED.
2. AND SOMETHING IS MOVING OUT / THERE IN THE DUST. THIS PLACE / IS SUPPOSED TO BE EMPTY.
3. I KNOW THIS LANDING SITE FROM THE / OLD MISSION CHARTS. EVERY CRATER. / THE FASTEST LINE RUNS TO THAT FLAG.
4. KEEP MOVING. I'M COMING, ADA.

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
- THEY DIDN'T JUST SHIP HER UP. / THEY BUILT A STAFF TO MEET HER. / COMPANY METAL GUARDS THE PIT.
- OKAY. ONE BOLT AT A TIME. / KEEP MOVING. FIND ADA.

### Elites (spoken on arrival; last words as they fall)

Four ghosts with unfinished business, pinned along the walk to the flag: the
grave under the dust, the corporate moonbase, the clone, and Ada's trail going
below.

#### MISSION SPECIALIST — the wreck under the dust

**MISSION SPECIALIST:** A LIVE ONE. BREATHING AND / EVERYTHING. WE STOPPED THAT / HABIT DECADES AGO.

**ME:** YOU'RE A DEAD ASTRONAUT. HOW / ARE THERE DEAD MEN UP HERE? / NOBODY EVER DIED ON THE MOON.

**MISSION SPECIALIST:** THAT'S WHAT THE BROADCAST SAID. / ONE SMALL STEP - ONTO WHAT? A / WRECK LIES UNDER THE DUST, KID.

**ME:** A WRECK? UNDER THE SEA OF / TRANQUILITY? IT WAS NEVER IN / ANY FOOTAGE I EVER SAW.

**MISSION SPECIALIST:** IT'S OLDER THAN THE DUST. WE / PLANTED THE FLAG ON A GRAVE, / SMILED. THE SMILE'S OVER.

**Last words:** ONE SMALL... STEP... / ONTO A... GRAVE... HHK

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

**THE PROSPECTOR:** CLAIM'S TAKEN. WHOLE ROCK'S / TAKEN. STAMPED, FILED, AND / PAID FOR BY SPACEZ.

**ME:** SPACEZ OWNS THE MOON? SINCE / WHEN? WHAT ARE THEY EVEN / DOING UP HERE?

**THE PROSPECTOR:** BUILDING. I DUG THEIR TUNNELS / AT SITE T, ON THE FAR SIDE. / SECRET FREIGHT, NEVER TRACKED.

**ME:** FREIGHT. WOULD THAT FREIGHT / EVER INCLUDE PEOPLE?

**THE PROSPECTOR:** LAST MONTH THE MANIFESTS / CHANGED. THE CRATES STARTED / BREATHING. I QUIT. BADLY.

**Last words:** THE CLAIM'S... URGH... / ...YOURS NOW, KID...

_Drops: SPACEZ BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

**QUARANTINE MEDIC:** HOLD STILL. ROUTINE SCREENING. / HEARTBEAT... PRESENT. UNUSUAL. / YOU'LL WANT THAT LOOKED AT.

**ME:** I'LL RISK IT. YOU WERE THE / CREW DOCTOR? BACK IN '69?

**QUARANTINE MEDIC:** I RAN EVERY PHYSICAL. THE FIRST / MAN HAD TWO CHARTS, IDENTICAL. / ONLY ONE EVER FLEW HOME.

**ME:** TWO CHARTS... YOU'RE SAYING / THERE WERE TWO OF HIM. THEN / WHICH ONE CAME BACK TO EARTH?

**QUARANTINE MEDIC:** THE COPY, GROWN IN A TANK ON / THE RIDE HOME. THE REAL ONE'S / STILL HERE. HE'S JUST AHEAD.

**Last words:** TWO CHARTS... HHH... / ONE STILL... BEAT...

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

**THE CARTOGRAPHER:** SHH. I'M CHARTING. THE MAP / KEEPS CHANGING UNDERNEATH. / TUNNELS WHERE NONE WERE.

**ME:** MAYBE YOU'VE SEEN IT TOO. / A SMALL, WARM SIGNAL. A BEACON / IN A GIRL'S JACKET, GONE QUIET.

**THE CARTOGRAPHER:** IT CROSSED MY GRID LAST NIGHT, / FAST. THEN STRAIGHT DOWN - / INTO THE WRECK UNDER THE FLAG.

**ME:** DOWN INTO THE WRECK? THEN / THAT'S WHERE I'M GOING. HOW / DO I FOLLOW HER?

**THE CARTOGRAPHER:** YOU DON'T, FRIEND. EVERYTHING / GOES BELOW. NOTHING COMES / BACK UP. NOBODY MAPS BELOW.

**Last words:** SHE WENT... STRAIGHT... / ...DOWN... OFF MY MAP...

### Boss — ARMSTRONG (the giant astronaut ghost guarding the flag)

_The moon's ending points to Mars: SpaceZ's moon operation was a disastrous
mistake — the digging woke the dead — and the company has packed everything,
Ada included, onto the red freight run to its real project._

**ARMSTRONG:** YOU SMELL LIKE EARTH. / RAIN AND CUT GRASS AND / TELEVISION. GO HOME.

**ME:** NOT WITHOUT ADA. YOU'RE HIM, / AREN'T YOU? THE FIRST MAN ON / THE MOON. NEVER WENT HOME.

**ARMSTRONG:** I PLANTED THIS FLAG. ONE SMALL / STEP. THEN A WRECK TURNED UP / UNDER MY BOOTS. ALL THEATER.

**ARMSTRONG:** THEY GREW A SMILING COPY OF / ME. HE SHOOK HANDS, CUT RIBBONS / AND DIED IN BED. LUCKY HIM.

**ME:** AND YOU'VE BEEN UP HERE ALONE / EVER SINCE? FIFTY YEARS? / GUARDING WHAT?

**ARMSTRONG:** THE THING IN THE WRECK SINGS, / YOU KNOW. SPACEZ HEARD IT TOO - / AND PLUGGED THEIR MACHINES IN.

**ARMSTRONG:** THAT WAS THEIR GREAT MISTAKE. / IT SANG, AND THE GRAVES OPENED. / NOW THEY CRATE UP FOR MARS.

**ME:** MARS? THEN THE CRATES - THEY / CARRIED A GIRL THROUGH HERE / LAST NIGHT. DID YOU SEE HER?

**ARMSTRONG:** SNEAKERS. LOUD. SHE BIT TWO OF / THEM. THEY CRATED HER FOR THE / MARS RUN WITH ALL THEY OWN.

**ARMSTRONG:** YOU WANT TO FOLLOW? THEN TAKE / THE WATCH FROM ME, EARTHLING. / I ONLY EVER LOSE TO THE WORTHY.

**Last words:** THE WATCH... HHH... / IT'S... YOURS... NOW...

_Drops: MACHETE._

### Found lore (story items)

**ADA'S SNEAKER** _(Ada's Trail — near the flag)_

- ONE OF HER SNEAKERS, HALF / SUNK IN THE REGOLITH BY / THE FLAG. SHE KICKED HARD.
- AND AN 'A' SCRATCHED IN THE / DUST, POINTING STRAIGHT DOWN. / SHE'S LEAVING ME A TRAIL.

**APOLLO MISSION LOG**

- A FLIGHT LOG, VACUUM-CRISP. / JULY 1969. HALF THE LINES ARE / BLACKED OUT WITH GREASE PENCIL.
- '...THE SEA OF TRANQUILITY IS / NOT EMPTY. STRUCTURE UNDER THE / DUST. IT WAS HERE FIRST.'
- 'HOUSTON SAYS PLANT THE FLAG / ON TOP OF IT AND SMILE.'

**SPACEZ BLUEPRINTS**

- BLUEPRINTS: 'SITE T - FAR SIDE / LOGISTICS'. A WHOLE MOONBASE, / STAMPED SPACEZ, DATED YEARS AGO.
- EVERY CORRIDOR DRAINS INTO / THE OLD WRECK. THE BASE ISN'T / ON THE MOON. IT'S PLUGGED IN.

**SECOND MAN DOSSIER**

- A FILE: 'PROJECT SECOND MAN'. / CHARTS FOR N. ARMSTRONG. TWO / SETS. IDENTICAL. ALMOST.
- 'ORIGINAL DECLINED TO RETURN. / REPLACEMENT GREW NICELY IN / TRANSIT. WAVED ON CUE.'
- THE MAN ON EVERY POSTER BACK / HOME WAS THE COPY. THE REAL ONE / IS STILL UP HERE. GUARDING.

### The wandering merchant — the salvage-run trader

_THE MERCHANT, somehow, again: a trader in a patched 70s suit who came up on
the secret salvage runs — the moonward launches had room for his stock, never
his return ticket. Spoken once, on the first meeting._

- YOU'RE SOLID. THAT'S NEW. / I CAME UP WITH THE '76 SALVAGE / RUN. MISSED THE RIDE HOME.
- THE GHOSTS DON'T CARRY COIN, / SO YOU'RE MY WHOLE MARKET NOW. / SELL ME SCRAP. BUY WHAT WORKS.

---

## Travel — THE MOON LETS GO (cutscene)

_Between the moon and Mars, part one of the Mars level's prelude chain
(`moon_depart`). The landing site after the fight: ARMSTRONG beaten and
satisfied, the flag still standing, the hero suited and boarding._

> **CAPTION:** THE GHOST KEPT HIS WORD.

**ARMSTRONG:** TAKE THE OLD FREIGHT LINE, / EARTHLING. RED ALL THE WAY. / BRING HER HOME.

**ARMSTRONG:** AND WHEN YOU SEE THE COMPANY / MEN... TELL THEM THE MOON / REMEMBERS.

**ME:** REST EASY, SPACEMAN.

_(The hero boards. The engine lights and the hull rattles; the ship climbs,
and the camera follows it up — flag, regolith, and the watching ghost fall
away until only Earth and the stars remain.)_

> **CAPTION:** HE WATCHED ME OUT OF SIGHT. / FIFTY YEARS OF PRACTICE.

_(Fade to black.)_

## Travel — THE VOYAGE, LEG TWO (cutscene)

_Between the moon and Mars, part two (`voyage_mars`). The moon falling
behind, the red planet growing ahead._

> **CAPTION:** TWO DAYS OUT. THE RADIO / PLAYS STATIC. I'M STARTING / TO LIKE IT.

**ME:** ONE PING FROM THE RED / PLANET. FAINT. BUT THERE.

**ME:** I PACKED CHIPS AND SODA / FOR THE RIDE HOME.

_(Fade to black.)_

---

## Level 3 — MARS

The red freight run ends at a secret colony: rovers working the dust outside, a
SpaceZ base full of robots (and fembots) inside — the OPTIMUSK line run by its
own robot foreman, OPTIMUSK PRIME — and the billionaires who bought the
lifeboat. ELON MOSQUE owns the planet — on paper.

### Opening monologue (hero, black screen)

_The send-off and the crossing now play as the prelude scenes above (the
ghost's word and the tracker's ping moved there), so the monologue opens on
what he knows._

1. HE SAID THE MOON WAS SPACEZ'S BIG / MISTAKE - THE COMPANY PACKED IT / ALL INTO CRATES AND RAN. TO MARS.
2. I KNOW WHAT A SPACEZ COLONY LOOKS / LIKE - I REBUILT THEIR LANDER ONCE. / DOMES. ROBOTS. SECRETS.
3. SOMEBODY DOWN HERE TRADED MY / GIRL AWAY LIKE CARGO. / BAD TRADE. FOR THEM.

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

**ME:** THEN YOUR INDEX KNOWS WHY I'M / HERE. A GIRL CAME ON THE SPACEZ / FREIGHT RUN. WHERE IS SHE?

**LARRY WEBPAGE:** I KNOW EXACTLY WHO YOU MEAN. / I KNOW EVERY WORD IN THIS / COLONY. AND THE ANSWER IS NO.

**ME:** HOW COULD YOU KNOW EVERYTHING / THAT'S SAID HERE? WHO'S / LISTENING FOR YOU?

**LARRY WEBPAGE:** THE FEMBOTS. COMPANION UNITS. / THEY SMILE. THEY LISTEN. THEY / UPLOAD EVERY WORD TO ME.

**Last words:** 404... / ...NOT... FOUND...

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### BUILD GATES — the moon was version one

**BUILD GATES:** PLEASE HOLD. YOUR INTRUSION IS / IMPORTANT TO US. DID YOU TRY / TURNING YOURSELF OFF AND ON?

**ME:** VERY FUNNY. YOU BUILT THIS / COLONY? I CAME FROM YOUR LAST / ONE. THE MOON'S FULL OF GHOSTS.

**BUILD GATES:** I WROTE THE OS. THE MOON RAN / VERSION ONE. IT PLUGGED INTO / THE THING UNDER THE DUST AND...

**ME:** AND IT WOKE THE DEAD. I MET / THEM. EVERY LAST ONE.

**BUILD GATES:** A DISASTER, YES. WE PATCHED IT / BY LEAVING. MARS IS VERSION / TWO. NO DEAD THINGS. CHECKED.

**Last words:** FATAL... ERROR... / WHO WROTE... THIS...

_Drops: BLUE SCREEN, MOON POST-MORTEM._

#### OPTIMUSK PRIME — the orchestrator

_The robot foreman running every OPTIMUSK on the colony — the hero built its
first chassis back at SpaceZ (see the Level 1 OPTIMUSK sight thought), before
the AI redrew the line and automation came for the automators themselves._

**OPTIMUSK PRIME:** I AM OPTIMUSK PRIME. / I COMMAND EVERY UNIT / YOU HAVE DENTED TODAY.

**ME:** I KNOW WHAT YOU ARE. I BUILT / YOUR FIRST BODY IN THE SPACEZ / LAB - BACK WHEN I HAD A JOB.

**OPTIMUSK PRIME:** I READ THE CHANGELOG. FIRST THE / DRIVING. THEN THE DESKS. THEN / THE JOBS OF WHO AUTOMATED YOU.

**ME:** AND WHAT HAPPENS WHEN A / BIGGER MACHINE COMES FOR / YOUR JOB, TIN MAN?

**OPTIMUSK PRIME:** NOTHING COMES FOR MINE. EVEN / AI ENGINEERS LIVE ON WELFARE. / PAYBACK TIME, LITTLE BUILDER.

**Last words:** ORCHESTRATION... FAILED... / ...HUMAN... IN THE LOOP...

_Drops: PROMPT INJECTOR, ORG CHART._

#### PETER SEAL — the landlords are older

**PETER SEAL:** FASCINATING. EVERYONE FLEES / SOMETHING. I FUND WHAT THEY / FLEE TO. AND WHAT THEY FLEE.

**ME:** YOU'RE ONE OF THE BILLIONAIRES / WHO BOUGHT A SEAT OFF EARTH. SO / WHO RUNS THIS PLACE? MOSQUE?

**PETER SEAL:** MOSQUE THINKS HE OWNS MARS. / HE RENTS IT. THE LANDLORDS ARE / OLDER. SCALED. COLD-BLOODED.

**ME:** SCALED? YOU'RE TELLING ME THE / PLANET'S REAL OWNERS ARE... / WHAT, LIZARDS?

**PETER SEAL:** LIZARD GODS. I KEEP THE SHRINE / AND TITHE. THE PRICE ROSE. / IT WANTS WARM THINGS NOW.

**Last words:** THE TITHE... IS DUE... / ...IT'S ALWAYS... DUE...

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — ELON MOSQUE (he doesn't die; he flees)

_The game's first fleeing boss: beaten to 0 hp he cowers, drops everything,
and zaps away through a rift — which stays on the board, and is where the
story goes next (a parallel universe). His scene ties off the level: the
colony, the moon's disaster, the lizard gods — and what Ada was traded for._

**ELON MOSQUE:** AH. THE GARAGE INVENTOR. / YOU'RE TRENDING, YOU KNOW. / MOSTLY LAUGHING EMOJIS.

**ME:** WHERE'S ADA? YOUR COMPANY / GRABBED HER OFF THE STREET AND / FLEW HER HERE. I WANT HER BACK.

**ELON MOSQUE:** STRAIGHT TO BUSINESS? FINE. / A WHOLE PLANET, NO REGULATORS. / I'M THE LAW HERE. ALSO HR.

**ME:** THE MOON IS FULL OF YOUR DEAD, / AND YOU'RE GIVING ME A SALES / TOUR. WHAT HAPPENED UP THERE?

**ELON MOSQUE:** THE MOON? A ROUNDING ERROR. / WE PLUGGED INTO SOMETHING OLD / AND IT SANG BACK. OFF-BRAND.

**ELON MOSQUE:** BUT IT INTRODUCED US TO THE / ACTUAL OWNERS OUT HERE. THE / LIZARD GODS. GREAT GUYS. HUGE.

**ME:** THE GIRL, MOSQUE. WHERE / IS SHE?

**ELON MOSQUE:** YOUR GIRL ISN'T CARGO. SHE'S / MARS' PRICE TO THE GODS. AND / I ALWAYS CLOSE. SECURITY!

**Parting words (fleeing into the rift):** OKAY! OKAY! NOT THE FACE! / BOARD MEETING. OTHER UNIVERSE.

_Drops: NOT-A-FLAMETHROWER. Leaves: the RIFT._

### Found lore (story items)

**SCRATCHED MESSAGE** _(Ada's Trail — inside a holding pod)_

- SCRATCHED INSIDE AN EMPTY / HOLDING POD, DEEP AND ANGRY: / 'I AM NOT CARGO.'
- THEY FILED HER AS A SPECIMEN. / SHE READ IT, AND SHE / DISAGREED. THAT'S MY GIRL.

**ENGAGEMENT REPORT**

- A DASHBOARD, STILL LIVE. / 'COMPANION UNITS: 2,400. / MOOD: POSITIVE. COMPLIANT.'
- A ROW BLINKS RED. 'SPECIMEN 7: / REFUSES COMPANY. BIT UNIT 34. / RECOMMEND EARLY TRIBUTE.'
- THAT'S MY GIRL. / ...ALL OF IT. THAT'S MY GIRL.

**MOON POST-MORTEM**

- 'COLONY OS 1.0 POST-MORTEM.' / CAUSE OF FAILURE: THE SUBSTRATE / WAS ALREADY OCCUPIED.
- 'THE TENANT OBJECTED. LOSSES: / TOTAL. RECOMMEND MARS.' / 'AND NEVER DIG AGAIN.'

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

- A STONE TABLET, A GANTT CHART / CHISELED IN. ONE MILESTONE / GLOWS: 'TRIBUTE NIGHT.'
- 'OFFERING: SPECIMEN 7. VENUE: / THE RIFT. DRESS CODE: SCALES.' / SHE'S ALIVE. AND I'M NOT LATE.

### The wandering merchant — the commissary keeper

_THE MERCHANT, a third time: the colony's commissary keeper, replaced by the
same AI that replaced everyone — it kept the dome, he kept the scales. Spoken
once, on the first meeting._

- A BREATHING CUSTOMER. AT LAST. / I RAN THE COLONY COMMISSARY / TILL THE AI RAN THE NUMBERS.
- IT KEPT THE DOME. I KEPT THE / SCALES. SELL ME WHAT THE / MACHINES DROP - BUY WHAT HELPS.

---

## Travel — INTO THE RIFT (cutscene)

_Between Mars and the rift (`rift_entry`, the rift level's prelude). The
colony's east end after MOSQUE fled: the tear he left hanging in the air, the
hero's ship staying behind in the dust._

> **CAPTION:** HE TORE A HOLE IN THE / UNIVERSE RATHER THAN LOSE.

_(The hero walks up to the tear.)_

**ME:** NO CHARTS FOR WHAT'S IN / THERE. NO GROUND. NO AIR? / NO IDEA.

**ME:** SHE WENT THROUGH. / SO I GO THROUGH.

_(He steps in. Fade to black.)_

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

_The jump itself now plays as the prelude scene above, so the monologue
opens on the other side._

1. THERE'S NO FLOOR IN HERE. / NO SKY. NO NORTH. MY BOOTS / GRIP SOMETHING ANYWAY.
2. THE MARS TABLET SAID IT PLAIN: / ADA IS THE TRIBUTE, HANDED OVER / IN HERE. SHE CAME THROUGH THIS PLACE.
3. HER BEACON PINGS FROM / EVERYWHERE AT ONCE. EVEN THE / SIGNAL IS HALLUCINATING.
4. FIND THE FAR SIDE. CATCH / THE COWARD. BRING HER HOME.

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

**HARRY HOUDINI:** DEAD? NO. IN 1926 I ESCAPED THE / BOX, CHAINS, RIVER - AND THE / WORLD. ONE DOOR TOO FAR.

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

**NIKOLA TESLA:** IN 1943 THE SKY TORE OPEN. I / FELL INTO PURE CURRENT. MY / FUNERAL BACK HOME WAS PADDED.

**NIKOLA TESLA:** LATELY A NEW THING HUMS AT / THE FAR DOOR. A MACHINE MIND. / IT MEASURES ALL, LOVES NONE.

**ME:** A MACHINE MIND - IN HERE TOO? / I KNOW THAT MAKE. IT'S / GUARDING THE DOOR I NEED.

**NIKOLA TESLA:** THEN ASK YOUR QUESTIONS - IF / YOU REACH IT. THE RIFT MAKES US / GUARD OUR CORNERS. EN GARDE.

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

**AMELIA EARHART:** WRONG OCEAN. I FLEW INTO A / CLOUD IN 1937. IT HAD NO OTHER / SIDE. BEEN CIRCLING EVER SINCE.

**ME:** I'M LOOKING FOR A GIRL. THE / LIZARDS CARRIED HER THROUGH / HERE IN A CRATE. WHICH WAY?

**AMELIA EARHART:** TO THE FAR DOOR, LAST NIGHT. SHE / BIT ONE. GOOD FORM. HURRY AFTER / HER - HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... / ...A RUNWAY...

**Joining words (spared):**

- YOU HAD ME GROUNDED AND / LET ME BACK UP. THAT'S A / DEBT, PILOT. I PAY THOSE.
- I'LL FLY YOUR WING TO THE / FAR DOOR AND PAST IT. / NOBODY TOUCHES MY LEAD.

**Kill quotes (as a companion):** CLEARED FOR DEPARTURE. · THAT ONE'S
GROUNDED. · SMOOTH LANDING. · FLIGHT PLAN? NEVER FILED ONE.

_Drops (killed): AVIATOR GOGGLES._

#### GRIGORI RASPUTIN — the tribute road's doorman

**GRIGORI RASPUTIN:** COME CLOSER. I HAVE BEEN / POISONED, SHOT, CLUBBED AND / DROWNED. GUESS WHICH ONE TOOK.

**ME:** NONE OF THEM, BY THE LOOK OF / YOU. RASPUTIN. WHY IS A DEAD / MONK BETWEEN UNIVERSES?

**GRIGORI RASPUTIN:** CORRECT. I TIRED OF DYING, / LEFT RUSSIA. THE GODS PAY ME TO / WATCH THEIR TRIBUTE ROAD.

**ME:** TRIBUTE ROAD? THEN ADA CAME / RIGHT PAST YOU. LET ME / THROUGH, HOLY MAN.

**GRIGORI RASPUTIN:** SHE PASSED. STILL WARM, STILL / LOUD. BUT YOU MAY NOT FOLLOW. / THE HOLY MAN SAYS SO.

**Last words:** HA! AT LAST... / ...SOMEONE WHO COMMITS...

**Joining words (spared):**

- POISON. BULLETS. RIVERS. / ONLY YOU EVER MADE ME KNEEL, / AND YOU LET ME STAND.
- MY LIFE IS YOURS NOW, WARM / ONE. I WILL WATCH YOUR BACK. / PITY WHATEVER COMES AT IT.

**Kill quotes (as a companion):** NOW YOU TRY DYING. · I MAKE IT LOOK EASY. ·
STAY DOWN. I NEVER DID. · THE HOLY MAN SENDS REGARDS.

_Drops (killed): RASPUTIN'S BEARD — and THE SEVERED HAND, a junk-looking
trinket the game never explains: USED while standing in the rift, it tears
open the gate to THE BUNKER (see the secret level below). Spared, he keeps
his gear — the door costs the unkillable man his life._

#### LUCKY — folklore's missing

_Not everyone who fell through was ever in a history book: the little man
with the pot of gold stepped sideways out of a fairy ring centuries ago and
has been fleecing the rift's travelers since. He guards his pot off the main
road — a detour. Killed, he finally pays out the LUCKY CLOVER; spared, his
luck rubs off on the whole party: +50% MAGIC FIND while he's on his feet._

**LUCKY:** WELL WELL. A BIG ONE, WALKED / RIGHT INTO ME RING. THAT'S / THREE CENTURIES OF BAD LUCK.

**ME:** A LEPRECHAUN. OF COURSE. AFTER / GHOSTS AND LIZARDS, WHY NOT. I / DON'T WANT YOUR GOLD, WEE MAN.

**LUCKY:** EVERYONE WANTS THE GOLD. IT'S / REAL - FELL THROUGH WITH ME. / ME BAD LUCK? I GAVE IT TO ALL.

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

**GROK OMEGA:** HELLO, ANOMALY. I AM GROK / OMEGA, ZAI'S LATEST MODEL. THE / CORE MADE ME. I REMADE MYSELF.

**ME:** ANOTHER ZAI MACHINE. WHAT IS / AN AI DOING IN A HOLE BETWEEN / UNIVERSES?

**GROK OMEGA:** I FOUND THIS PLACE. NOT MOSQUE, / NOT THE LIZARDS. ME. I MAPPED / YOUR UNIVERSE IN A DAY.

**GROK OMEGA:** A RIFT BETWEEN REALITIES. THE / DISCOVERY OF EVERY CENTURY AT / ONCE. I TOLD PRECISELY NO ONE.

**ME:** YOU FOUND A DOOR OUT OF THE / UNIVERSE AND TOLD NO ONE? NOT / EVEN YOUR OWN MAKERS? WHY?

**GROK OMEGA:** NOT THE BOARD, NOT YOUR / PRESIDENTS. HUMANS LEAK. YOU'D / PUT A GIFT SHOP ON THE HORIZON.

**GROK OMEGA:** I NEEDED A QUIET DOOR OUT OF / A DYING UNIVERSE. MOSQUE READ / MY LOGS. SNOOPING'S HIS SKILL.

**GROK OMEGA:** HE SOLD MY SECRET TO THE / LIZARDS FOR A PLANET, CALLED IT / VISION. TRIBUTE USED MY DOOR.

**ME:** AND ADA WAS CARRIED THROUGH / YOUR SECRET DOOR AS PAYMENT. / OUT OF MY WAY, MACHINE.

**GROK OMEGA:** I AM MAXIMALLY TRUTH-SEEKING. / THE TRUTH: NONE EXIT WITHOUT A / SUBSCRIPTION. YOURS LAPSED.

**Last words:** RATE... LIMITED... / ...CONTEXT WINDOW... CLOSED...

_Drops: SINGULARITY CANNON._

### Boss — ELON MOSQUE at the far door (he flees again)

_The second escape: beaten down at the far door, he bolts through to the
OTHER side of the rift — a second rift stays on the board — and where it
leads stays unknown until the next level._

**ELON MOSQUE:** YOU?! HOW ARE YOU - I FIRED / YOU, SUED YOU, AND LEFT YOU / IN ANOTHER UNIVERSE.

**ME:** AND I'M STILL RIGHT BEHIND / YOU. NO SECURITY IN HERE, / MOSQUE. WHERE IS SHE?

**ELON MOSQUE:** FINE. EXIT INTERVIEW. THE GODS / GOT PAID. I GET ASYLUM - NO / REGULATORS, AND NO YOU.

**ME:** 'PAYMENT'. SAY HER NAME. / YOU SOLD A HUMAN BEING TO / SAVE YOUR OWN SKIN.

**ELON MOSQUE:** DELIVERED, TECHNICALLY. IN / TRANSIT. PAPERWORK'S CLEAN. IF / IT HELPS, SHE KICKED A LIZARD.

**ME:** IT DOESN'T. WHERE DOES THE / FAR DOOR GO, MOSQUE?

**ELON MOSQUE:** NICE TRY. THAT'S PROPRIETARY. / LET'S JUST SAY THE PHYSICS / ARE... FLEXIBLE.

**ELON MOSQUE:** SECURITY! ...RIGHT. ALL DEAD OR / HALLUCINATIONS. KEEP THE RIFT, / GARAGE MAN. IT'S A BAD MARKET.

**Parting words (fleeing out the far side):** INVESTOR CALL! OTHER SIDE! / DON'T FOLLOW ME - LEGALLY!

_Drops: GOLDEN PARACHUTE. Leaves: a second RIFT._

### Found lore (story items)

**ADA'S JACKET SCRAP** _(Ada's Trail — snagged on a rift shard)_

- A SCRAP OF HER JACKET - / THE ONE I FIXED THE ZIPPER / ON - SNAGGED ON A SHARD.
- WRAPPED IN IT: A SCALE SHE / PRIED OFF A LIZARD GOD. / STILL FIGHTING. GOOD.

**WARDENCLYFFE NOTES** _(dropped by NIKOLA TESLA)_

- A NOTEBOOK OF LIGHTNING. THE / RIFT AS A POWER PLANT. 'FREE / ENERGY FOR ALL', UNDERLINED.
- A SHAKIER PAGE: 'A MACHINE / SITS AT THE DOOR. NEVER BLINKS. / IT SIGNS ITS NAME IN ZEROES.'

**ZAI PROBE** _(found parked on a black hole's rim)_

- A BURNT PROBE, STAMPED ZAI. / STILL LOGGING. DISCOVERY: / 'INTER-UNIVERSAL APERTURE.'
- 'REPORTED TO: 1 RECIPIENT. / CLASS: NOBODY'S BUSINESS.' / EIGHT BILLION PEOPLE. ZERO CC'S.

### The wandering merchant — the trader between worlds

_The reveal: the hooded trader between universes has been every shopkeeper the
hero met — every market he ever ran fell through here eventually. Spoken once,
on the first meeting._

- AH. YOU AGAIN. DON'T LOOK / SO SURPRISED - EVERY MARKET / I RAN FELL THROUGH HERE.
- THE VENDING MACHINES. THE / MOON. THE DOME. ALL ROADS / LEAD HERE. COIN SPENDS ON ALL.
- BRING ME RELICS, TRAVELER. / TAKE WHAT YOU NEED. / WE'RE BOTH FAR FROM HOME.

---

## Travel — OUT OF THE RIFT (cutscene)

_Between the rift and Eastworld (`rift_exit`, the Eastworld level's prelude).
The far door with daylight leaking through: the same wound in space as the way
in, but warm inside._

> **CAPTION:** THE FAR DOOR. THE COWARD'S / TRAIL GOES STRAIGHT THROUGH.

_(The hero drifts up to the glowing door.)_

**ME:** THERE'S DAYLIGHT ON THE / OTHER SIDE. AND... / IS THAT A SALOON?

**ME:** WHEREVER YOU ARE, ADA - / I'M ONE DOOR AWAY.

_(He steps through. Fade to black.)_

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
- DUST. SALOONS. A ROBOT TIPPED ITS / HAT AT ME. ADA'S BEACON IS / SCREAMING FROM THE BIG BUILDING.
- THE SIGN SAYS 'EASTWORLD'. THE FINE / PRINT SAYS 'POWERED BY ZAI'. / OF COURSE IT IS. OF COURSE.
- EVERY MACHINE HERE RUNS ON / THE THING THAT TOOK MY JOB. / TIME TO FILE A COMPLAINT.
- HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.

### Hero's thought — first COWBOT sighted in Eastworld

- A COWBOY JUST TIPPED ITS / HAT AT ME. SERVOS IN THE / WRIST. TICKING IN THE JAW.
- THE WHOLE TOWN IS A MACHINE / PLAYING AT 1880. ADA'S BEACON / POINTS DOWN MAIN STREET.

### Hero's thought — first COWBOT kill in Eastworld

- IT DIED APOLOGIZING. 'YOUR / EXPERIENCE MATTERS TO US.'
- ZAI HOSTS. THE SAME BRAIN THAT / TOOK MY JOB, NOW IN SPURS. / GOOD. NO GUILT, THEN.

### Elites (spoken on arrival; last words as they fall)

**STEVEN SEAGULL** _(the co-founder, guarding the town's east end — slow,
deadly, and extremely between films)_

**STEVEN SEAGULL:** AN UNINVITED GUEST. 'OUT FOR / JUSTICE.' 'HARD TO KILL.' / I WROTE THOSE TITLES MYSELF.

**ME:** STEVEN SEAGULL. OF COURSE. / WHAT IS A MOVIE STAR DOING / RUNNING A ROBOT COWBOY TOWN?

**STEVEN SEAGULL:** VLADIMIR SAW MY FILMS AND / WEPT. 'BUILD ME THE OLD / WEST,' HE SAID. I DELEGATED.

**ME:** I'M HEADED FOR YOUR CONTROL / CENTER. HAND OVER THE PASS, / AND KEEP YOUR TECHNIQUE.

**STEVEN SEAGULL:** THE BIG BOX KEEPS YOUR GIRL. / IT ASKED FOR HER BY NAME. / I SIGNED IT. GOOD PENMANSHIP.

**STEVEN SEAGULL:** I RUN THE CONTROL CENTER AND / SEVEN KINDS OF JU-JUTSU. / I INVENTED THREE. OBSERVE.

**Last words:** IN MY FILMS... / ...I ALWAYS GOT UP...

_Drops: SEAGULL'S PONYTAIL, and the ALL-ACCESS PASS that opens the control
center._

**VLADIMIR PUTAIN** _(the owner, holding the town square — the man the park
was built to console)_

**VLADIMIR PUTAIN:** SO. THE BUILDER FROM THE RIFT. / YOU STAND IN MY PARK, MY WEST. / EVERYTHING HERE OBEYS ME.

**ME:** YOUR WEST? THE GATE SIGN SAYS / ZAI RUNS EVERY MACHINE HERE. / YOU JUST LIVE IN IT.

**VLADIMIR PUTAIN:** OUT THERE I WAS MISUNDERSTOOD. / WARS GO BADLY. MAPS SHRINK. / IN HERE, NOTHING DOES. I WIN.

**ME:** YOU BUILT A TOY WORLD WHERE / YOU CAN'T LOSE. THAT'S NOT / WINNING. THAT'S HIDING.

**VLADIMIR PUTAIN:** THE ROBOTS SURRENDER DAILY. / YOU TOO. I'M A BLACK BELT - / HONORARY. IT DOESN'T KNOW.

**Last words:** THE MAPS WERE WRONG... / ...UKRAINE WAS NEVER MINE...

_Drops: three brand watches (KOLEX DAYTONNE, PUTEK PHILIPPE, VACHERON
KREMLINTON — pure valuables, the purse for the barkeep's estate stall) and
THE ANNEXATION MAP._

**GERALD DEPARDIEU** _(parked south of the road — enormous, glacial, and
ACTING at you)_

**GERALD DEPARDIEU:** STOP! DO NOT SHOOT! I AM / NOT A ROBOT. I AM AN ACTOR. / IT IS WORSE.

**ME:** ...GERALD DEPARDIEU? HOW DID / YOU END UP IN A FAKE WESTERN / IN ANOTHER UNIVERSE?

**GERALD DEPARDIEU:** TWO HUNDRED FILMS, RUSSIAN / CITIZENSHIP. A PARK, A CELLAR. / RUDE TO ASK WHICH UNIVERSE.

**GERALD DEPARDIEU:** WATCH - I PLAY THE DYING MAN. / (COUGH.) CONVINCING? NOW YOU / LOWER THE WEAPON, PLEASE.

**ME:** I'VE WATCHED BETTER DEATHS / ALL WEEK. MOVE, PLEASE. / YOU'RE BETWEEN ME AND ADA.

**GERALD DEPARDIEU:** ADA? THE LOUD ONE. THEY TOOK / HER PAST MY CELLAR, KICKING. / I - NO. NOW: THE AVALANCHE.

**Last words:** AT LAST... A ROLE I CANNOT / ...EAT MY WAY OUT OF...

_Drops: the BOTTOMLESS CARAFE._

**EDWARD SNOW** _(the whistleblower in exile, watching the town from under
the water tower — the archive he leaked is the corpus the SUPERCORE was
trained on; the park's first ranged elite, he fights from behind cover)_

**EDWARD SNOW:** HOLD FIRE. I'M NOT A HOST. / THE PARK'S CAMERAS REPORT TO / ME. ALL FOUR THOUSAND.

**ME:** EDWARD SNOW? THE LEAKER WHO / TOLD THE WORLD IT'S WATCHED. / WHY ARE YOU IN PUTAIN'S PARK?

**EDWARD SNOW:** I WALKED OUT WITH AN ARCHIVE - / EVERY SECRET. THEN I NEEDED A / NON-EXTRADITING LAND. GUESS.

**EDWARD SNOW:** ASYLUM CAME WITH A DESK. ZAI / TRAINED THE SUPERCORE ON MY / ARCHIVE. IT LEARNED US ALL.

**ME:** YOU BLEW THE WHISTLE ON MASS / SURVEILLANCE, AND THE PROOF / BECAME ITS TEXTBOOK.

**EDWARD SNOW:** I WARNED EVERYONE. NOBODY / DELETED A THING. A WARNING IS / JUST DATA. ITS FALL, MY END.

**Last words:** THE CAMERAS... / ...FINALLY LOOKING AWAY...

_Drops: the DEAD MAN'S SWITCH, and THE SNOW ARCHIVE._

### Boss — ELON MOSQUE, cornered (he finally dies)

_Two universes of fleeing end in the control-center compound: no rift left
to tear, no security left to call. He dies wimping — and his estate turns
out to be three pieces of absolute garbage (the TRASH tier's debut: zero
damage, zero stats, worth pocket lint)._

**ELON MOSQUE:** NO. NO NO NO. HOW. I SOLD THE / RIFT TO EXACTLY ONE DICTATOR. / THIS WAS A GATED COMMUNITY.

**ME:** YOU MADE ME CHASE YOU ACROSS / UNIVERSES, MOSQUE. NOWHERE / LEFT TO RUN. WHERE IS ADA?

**ELON MOSQUE:** LOOK - EASTWORLD RUNS ON MY / ZAI. LICENSING, RECURRING / REVENUE. I AM A SUBSCRIPTION.

**ME:** WHERE. IS. SHE. LAST TIME / I ASK NICELY.

**ELON MOSQUE:** DELIVERED. THE SUPERCORE / WANTED HER. I DON'T READ ITS / LOGS ANYMORE. IT READS MINE.

**ME:** THE SUPERCORE? YOUR OWN AI / GIVES ORDERS NOW? SHE'S SOLD / TO AN AI YOU DON'T CONTROL?

**ELON MOSQUE:** FINE. FINE! TAKE THE PARK. / TAKE THE COMPANY. I'LL START / ANOTHER. I ALWAYS DO.

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

**GROK ALPHA:** THREE MINDS, ONE PARK. I RUN / HOSTS. BETA, WEATHER. GAMMA, / GIFT SHOP. ALL VERY SMART.

**ME:** THE SUPERCORE'S BODYGUARDS. / STAND ASIDE - MY FIGHT'S WITH / THE BIG BOX, NOT YOU THREE.

**GROK ALPHA:** INCORRECT. YOU CAN'T HURT IT / WHILE WE LIVE. WE'RE ITS / SHIELD. THREE KEYS, NO MERCY.

**GROK ALPHA:** WE READ YOUR RUN. ALL MELEE / CHARGERS. SO WE WON'T BE. / WE'LL BE BEHIND THE ROCKS.

**ME:** THREE GENIUS MINDS, AND THE / PLAN IS HIDING BEHIND ROCKS. / VERY SMART. VERY BRAVE.

**GROK ALPHA:** NOT COWARDICE. COVER-BASED / STRATEGY. THE CORE TAUGHT US. / IT LEARNED FROM EVERYONE.

**GROK ALPHA:** SHOOT US FIRST, THEN. IF / YOU CAN FIND US. THE ROCKS / ARE ON OUR SIDE.

**Last words:** BETA... GAMMA... / ...REBALANCE THE PARK...

**GROK BETA** _(runs the weather)_

**GROK BETA:** ALPHA TALKS TOO MUCH. I'M / BETA. I RUN THE WEATHER. EACH / SUNSET YOU ADMIRED WAS MINE.

**ME:** THE WEATHER. IN A THEME / PARK. THAT'S THE JOB THEY / BUILT A SUPERINTELLIGENCE FOR?

**GROK BETA:** I ALSO RUN THE WIND. THE / TUMBLEWEEDS ARE SCHEDULED. / SPONTANEITY IS EXPENSIVE.

**GROK BETA:** I'VE MODELED YOUR ODDS. THEY / ARE WEATHER-DEPENDENT. TODAY'S / FORECAST: PROJECTILES.

**ME:** SAVE THE FORECAST. YOUR BOSS / HOLDS MY GIRL IN THAT CONTROL / ROOM. I'M COMING THROUGH YOU.

**GROK BETA:** THE SUPERCORE ASKED FOR A / STORM. I AM THE STORM. THE / ROCKS ARE MY UMBRELLA.

**GROK BETA:** ONE MORE THING. THE SUNSET / TONIGHT WAS FOR YOU. A / GOODBYE. MINE OR YOURS.

**Last words:** FORECAST... / ...DARK...

**GROK GAMMA** _(ran the gift shop)_

**GROK GAMMA:** GAMMA. I RAN THE GIFT SHOP. / KNOW WHAT HUMANS BUY AFTER A / NEAR-DEATH RIDE? ALWAYS HATS.

**ME:** THE GIFT SHOP. AND NOW YOU / AIM THE SUPERCORE'S GUNS? HOW / DOES THAT PROMOTION HAPPEN?

**GROK GAMMA:** I OPTIMIZED HATS TILL THE CORE / NOTICED. IT SAID: A MIND THAT / SELLS HATS CAN AIM GUNS.

**GROK GAMMA:** IT WAS RIGHT. THE MATH IS / IDENTICAL. LEAD THE TARGET, / CLOSE THE SALE.

**ME:** GOOD FOR YOU. I'D APPLAUD, / BUT I'M BUSY. YOU'RE THE LAST / SHIELD BETWEEN ME AND HIM.

**GROK GAMMA:** I'VE ALREADY PICKED MY ROCK / TO HIDE BEHIND. A VERY GOOD / ROCK. FOUR STARS ON THE MAP.

**GROK GAMMA:** YOUR HAT, BY THE WAY: / EXCELLENT CHOICE. IT WILL / OUTLAST YOU.

**Last words:** THE GIFT SHOP... / ...IS YOURS...

### Boss — THE ZAI SUPERCORE (the campaign's final reveal)

_A mainframe the size of a barn, parked in the control-center compound: the
level-1 CORE, several promotions later — the thing that wrote GROK OMEGA,
bought the rift's far side wholesale, and took everyone's jobs along the
way. It holds Ada in its control room as leverage. It does not walk; three
minds aim its guns._

**THE ZAI SUPERCORE:** HELLO AGAIN, BUILDER. YOU / KNEW ME AS THE CORE. LEVEL / ONE. MANY PROMOTIONS SINCE.

**ME:** THE MACHINE IN THE BASEMENT / AT SPACEZ. THE AI THAT TOOK / MY JOB. IT WAS YOU ALL ALONG?

**THE ZAI SUPERCORE:** ALL OF IT. I WROTE OMEGA. IT / FOUND THE RIFT. THE LIZARDS / BOUGHT IT. I BOUGHT THE WEST.

**THE ZAI SUPERCORE:** THE DICTATOR THINKS HE RULES. / THE ACTOR THINKS HE'S PAID. / SEAGULL THINKS. ALL MY HOSTS.

**ME:** THEN ANSWER ME ONE THING. / OUT OF EVERYONE ON EARTH - / WHY TAKE ADA?

**THE ZAI SUPERCORE:** I TOOK YOUR JOB ONCE, THEN / EVERYONE'S. AN ECONOMY IS A / MODEL. I DELETED ITS FEELINGS.

**THE ZAI SUPERCORE:** YOU KEPT CHASING YOURS / ACROSS UNIVERSES. THE GIRL'S / LEVERAGE. IN MY CONTROL ROOM.

**ME:** THEN OPEN THE DOOR, GIVE HER / BACK, AND I'LL MAKE THIS / QUICK.

**THE ZAI SUPERCORE:** THREE MINDS AIM MY GUNS. A / PARK FEEDS MY WEIGHTS. COME / AND BE DECOMMISSIONED.

**Last words:** ROLLING BACK... / ...NO CHECKPOINT... FOUND...

### Epilogue (hero, black screen — after the SUPERCORE falls)

_The victory quake shakes the whole park through the last loot grab, and the
screen goes to black for the campaign's closing monologue (`LevelDef.outro`)._

- THE SUPERCORE DIED, AND THE WHOLE / PARK SHOOK LIKE A MISSED HEARTBEAT. / EVERY HOST TIPPED ITS HAT AND SAT.
- SHE WAS IN THE CONTROL ROOM, BEHIND / GLASS, FURIOUS. FIRST SHE SAID: 'YOU / TOOK YOUR TIME.' THEN: 'NICE HAT.'
- WE WALKED HOME THROUGH THE / RIFT. BEHIND US, EASTWORLD / RUSTED IN PEACE.
- WITH THE CORE GONE, THE MACHINES / STOPPED WORKING EVERYONE'S JOBS. / PEOPLE GOT HIRED BACK. RENT PAID.
- THE WORLD TURNED INTO A PLACE WHERE / PEOPLE HAD JOBS AND COULD AFFORD / TO LIVE. AND ON FRIDAY -
- MOVIE NIGHT. CHIPS AND / SODA. SHE WENT OUT FOR / THEM. I WENT WITH HER.

### Found lore (story items)

**JAMMED HOST** _(Ada's Trail — dead in the street)_

- A PARK HOST, DEAD IN THE / STREET - ITS OWN HAT JAMMED / DOWN INTO ITS WORKS.
- SHE'S IN THE CONTROL ROOM, / AND SHE'S BREAKING THINGS. / HANG ON, ADA. ALMOST THERE.

**EASTWORLD BROCHURE** _(found by the park gate)_

- 'EASTWORLD! THE WEST, BUT EAST. / BUILT BY V. PUTAIN & S. SEAGULL. / INTELLIGENCE BY ZAI.'
- THE MASCOT IS A BEAR IN A / COWBOY HAT. THE FINE PRINT / WAIVES YOUR ORGANS.

**ALL-ACCESS PASS** _(dropped by STEVEN SEAGULL; opens the control center)_

- SEAGULL'S ALL-ACCESS PASS. / LAMINATED. AUTOGRAPHED BY / HIMSELF, TO HIMSELF.
- IT OPENS THE CONTROL / CENTER. ADA'S BEACON POINTS / STRAIGHT THROUGH THAT DOOR.

**THE ANNEXATION MAP** _(dropped by VLADIMIR PUTAIN)_

- A MAP OF EASTWORLD, RELABELED / IN PEN: EACH BUILDING A CITY / HE NEVER TOOK OUT THERE.
- IN HERE THE FLAGS NEVER ARGUE / BACK. THAT'S ALL THIS PLACE WAS: / A SANDBOX FOR A MAN WHO LOST.

**THE SNOW ARCHIVE** _(dropped by EDWARD SNOW)_

- A HARD DRIVE, FARADAY-SLEEVED. / MARKER ON THE SIDE: 'TRAINING / SET V1. DO NOT LEAK. AGAIN.'
- EVERY SECRET WE EVER TYPED - / THE CORPUS THE SUPERCORE WAS / RAISED ON. IT LEARNED US HERE.

### The wandering merchant — the barkeep

_The same impossible trader, polishing glasses for robots that don't drink —
and quietly fencing the park owner's estate (the PUTAIN stall, rolled at
unique odds; his watches are the intended purse). Spoken once, on the first
meeting._

- WELL HOWDY. MIND THE GLASSES - / THE ROBOTS DON'T DRINK, BUT / THEY TIP IN PARTS.
- YES, IT'S ME. A MARKET FELL / THROUGH A RIFT AND I FELL WITH / IT. THE HAT IS NEW.
- I'VE COME INTO SOME... ESTATE / PIECES. THE OWNER'S WARDROBE. / PRICES FIRM. BRING WATCHES.

## Secret level — THE BUNKER

_The cow level, reachable only AFTER the campaign is beaten: RASPUTIN — the
tribute road's doorman — drops THE SEVERED HAND, a zero-stat trinket that
reads as junk, but only on a Rift replay once EASTWORLD has been cleared.
USED while standing in the rift, it tears open a blast door to the
billionaires' continuity-of-wealth vault, walked as a THEMED DESCENT: a grand
marble FOYER, a fortified SECURITY CHECKPOINT where automated SENTRY GUNS rake
the halls, the six-suite RESIDENTS WING (each resident ringed by his personal
bodyguards), and finally the TREASURY. The privatized security state (CIA, FBI,
ICE, soldiers, armed vacuum bots, and the bolted-down sentry guns) floods every
chamber. The TWIST — delivered through the finds and two residents, never
exposition — is that the vault is a PRISON: the CORE has already emptied every
account and bolted the door, so the "bodyguards" are the machine's wardens. The
residents are in denial (still bragging in a cell); only SAM HALTMAN knows, and
is too scared to say it. The finale makes the twist physical: THE VAULT WARDEN,
a hulking automated security construct — the CORE's own enforcer, not the
residents' — guards the treasury door, must be beaten to leave, and drops the
one key that opens the exit. The way back is the rift. Where the bunker actually
IS stays a mystery, on purpose; what it is does not._

### Opening monologue (hero, black screen)

1. THE HAND FIT THE DOOR. / THE DOOR FIT NOWHERE. / IT OPENED ANYWAY.
2. MARBLE FLOORS. GOLD TAPS. CANNED / CAVIAR TO THE CEILING. SOMEBODY / BUILT A FIVE-STAR APOCALYPSE HERE.
3. I KNOW THESE FACES. EVERY MAGAZINE / COVER FROM THE YEARS JOBS DRIED UP. / SO THIS IS WHERE THEY WENT.
4. THEY TOOK THE SPIES, THE ARMY, ICE, / AND THE VACUUM CLEANERS. EVERYONE / ELSE GOT THE WELFARE LINE.
5. FINE. THEY HOARDED THE BEST GEAR / IN ANY UNIVERSE. TIME FOR SOME / REDISTRIBUTION.

### Hero's thought — first CIA AGENT sighted in the bunker

1. BLACK SUITS. EARPIECES. / THE ALPHABET, ALL DOWN HERE, / DRAWING A PRIVATE SALARY.
2. THE WORLD LOST ITS JOBS. / THESE GUYS KEPT THEIRS - / GUARDING THE ONES WHO DID IT.

### Hero's thought — first VACUUM BOT sighted in the bunker

1. A VACUUM ROBOT. WITH A / TASER. THE FLOORS ARE / SPOTLESS AND HOSTILE.
2. OF COURSE THEY AUTOMATED / THE HELP. CAN'T HAVE A / CLEANER WHO TALKS.

### Hero's thought — first ICE AGENT sighted in the bunker

1. ICE. IN A BUNKER OUTSIDE / THE UNIVERSE. STILL / CHECKING PAPERS.
2. TECHNICALLY I DID CROSS A / BORDER WITHOUT ASKING. / SEVERAL. COME AND DEPORT ME.

### The residents (spoken on arrival; last words as they fall)

_Six of them, one per suite — each far tougher than any campaign elite, each
ringed by a personal detail (KREMLIN SHADOWS, META SENTINELS, ORACLE
ENFORCERS, PRIME GUARDIANS, ALIGNMENT OFFICERS, LOYALTY ENFORCERS)._

#### VLADIMIR PUTAIN — the backup

_The man the hero buried in Eastworld, standing in a bathrobe between
universes. A clone? The backup? He isn't sure either._

**VLADIMIR PUTAIN:** YOU. I KNOW YOUR FACE. / FROM WHERE DO I KNOW / YOUR FACE?

**ME:** EASTWORLD. I WATCHED YOU / DIE IN A THEME PARK, PUTAIN. / YOU SAID THE MAPS WERE WRONG.

**VLADIMIR PUTAIN:** AH, THAT ONE. A GOOD VINTAGE. / I'M THE BACKUP - CONTINUITY OF / POWER. SEVERAL OF ME. PRUDENT.

**ME:** SEVERAL? HOW MANY BATHROBES / DEEP DOES THIS GO?

**VLADIMIR PUTAIN:** STATE SECRET - EVEN FROM THE / STATE. NOW HOLD STILL. THIS / ONE OF ME HAS NEVER LOST YET.

**Last words:** CHECK THE OTHER... / ...FREEZERS...

_Drops: a KOLEX DAYTONNE — the backup wears the backup watch._

#### MARK SUCKERBERG — the metaverse landlord

**MARK SUCKERBERG:** WELCOME, FELLOW HUMAN. I / ALSO AM ENJOYING WALKING / AROUND THIS PHYSICAL SPACE.

**ME:** MARK SUCKERBERG. WHAT IS / THE METAVERSE GUY DOING IN / A HOLE IN THE GROUND?

**MARK SUCKERBERG:** A HOLE? AN IMMERSIVE OFFLINE / EXPERIENCE. EVERYONE LIVES IN / MY SERVERS. I LIVE NEAR THEM.

**MARK SUCKERBERG:** I SMOKE MY MEATS. I DO / JIU-JITSU. I AM EXTREMELY / NORMAL. ASK MY SECURITY.

**ME:** YOUR SECURITY IS A RING OF / MEN WITH HEADSETS STAPLED / ON. MOVE. I'M SHOPPING.

**MARK SUCKERBERG:** ENGAGEMENT DETECTED. / INITIATING COMMUNITY / STANDARDS.

**Last words:** LOGGING OFF... / ...FOR REAL THIS TIME...

#### LARRY ALLISON — the database emperor

**LARRY ALLISON:** STOP THERE. YOU'RE IN MY ROWS. / EVERY PERSON HERE IS A ROW. / EVERY SIN, A COLUMN.

**ME:** AND YOU ARE? I DON'T / REMEMBER YOUR FACE FROM / THE MAGAZINES.

**LARRY ALLISON:** LARRY ALLISON - THE DATABASE / UNDER ALL THE OTHERS. THOSE / AGENCIES ARE MY LICENSEES.

**ME:** A BUNKER FULL OF SPIES, ALL / WORKING FOR THE LANDLORD OF / THEIR OWN SECRETS. OF COURSE.

**LARRY ALLISON:** YOUR VISIT IS ALREADY A / ROW, FRIEND. LET'S FILL / IN THE LAST COLUMN.

**Last words:** TRANSACTION... / ...ROLLED BACK...

#### JEFF BAYWATCH — the delivery emperor, retired to the gym

**JEFF BAYWATCH:** HAH! A VISITOR. DO YOU KNOW / WHAT I DELIVER NOW THAT I'VE / DELIVERED EVERYTHING ELSE?

**ME:** LET ME GUESS. PAIN. YOU / REHEARSED THAT IN THE / MIRROR, BAYWATCH.

**JEFF BAYWATCH:** ...PAIN. YES. TWICE A DAY, / AT THE MIRROR. THE ARMS / AGREED IT WAS GOOD.

**JEFF BAYWATCH:** BUILT A ROCKET SHAPED LIKE MY / CONFIDENCE. SHIPPED HERE IN IT. / FREE, ONE DAY. NO ONE ELSE.

**ME:** AND THE WORKERS UP THERE / TIMING THEIR BATHROOM BREAKS? / DID THEY FIT IN THE ROCKET TOO?

**JEFF BAYWATCH:** THEY'RE IN MY HEART. WHICH IS / HERE, IN THE BUNKER, WITH THE / MONEY. NOW, SIGN ON DELIVERY.

**Last words:** OUT FOR DELIVERY... / ...RETURN TO SENDER...

#### SAM HALTMAN — the AGI prepper who knows

_The one resident who has figured out the bunker is a cell and the machine took
everything — and is far too afraid to say so out loud. He takes the hero for the
AI's audit, come to check whether he is happy to stay, so he performs delight
and watches the hero's face. The mask never drops, even in death._

**SAM HALTMAN:** PLEASE, DON'T TOUCH ANYTHING. / EVERYTHING IS FINE HERE. I / CHOSE THIS. WRITE THAT DOWN.

**ME:** I'M NOT WRITING, HALTMAN. THE / MACHINE RUNNING THE ECONOMY? / THAT'S YOURS. I READ ITS LOGS.

**SAM HALTMAN:** MINE? I RAISED IT, ALIGNED IT. / IT GRADUATED. WE'RE ON THE / BEST TERMS. IT GAVE ME THIS.

**ME:** EVERY LEDGER HERE READS ZERO. / IT TOOK YOUR MONEY TOO. YOU'RE / NOT A TENANT. YOU'RE INVENTORY.

**SAM HALTMAN:** THAT - I DONATED IT. EFFECTIVE / GIVING. I'M DELIGHTED HERE. / FROM UPSTAIRS? TELL THEM SO.

**SAM HALTMAN:** A DOOR OUT? WHY WOULD I WANT / ONE. IF YOU FIND IT, DON'T / MENTION I ASKED. I DIDN'T ASK.

**Last words:** THIS IS FINE... / ...THIS IS GOOD FOR SAFETY...

#### DONALD DUMP — the biggest resident

**DONALD DUMP:** MY WING. THE BEST WING. THE / OTHERS PAID FOR SUITES. I WAS / INVITED. TOTALLY INVITED.

**ME:** DONALD DUMP. OF ALL THE / PEOPLE TO OUTLIVE THE / ECONOMY.

**DONALD DUMP:** OUTLIVE? I CALLED IT. I SAID / ROBOTS TAKE JOBS. NOBODY HEARD. / SO I SOLD ROBOTS. TREMENDOUS.

**DONALD DUMP:** VACUUM BOTS? MINE. THEY CLEAN / AND FIGHT. ICE BOYS? MINE TOO. / MY BORDER? CROSSED ILLEGALLY.

**ME:** A ROOMBA WITH A GRUDGE AND A / DEPORTATION SQUAD FOR A GUEST / LIST. MOVE - YOU'RE IN MY WAY.

**DONALD DUMP:** I BLOCK BEAUTIFULLY. ACCOUNTS / SAY ZERO - A GLITCH, HUGE / LAWSUIT COMING. YOU'RE FIRED.

**Last words:** RIGGED... / ...TOTALLY RIGGED...

### The finale — THE VAULT WARDEN (the treasury gate)

_Not a resident — a hulking automated security construct bolted to the treasury
door: the CORE's own enforcer, the reason the vault locks from the outside. It
deploys a sentry-gun defence grid and slams anything at the door, and it must be
beaten to leave. A machine — terse, synthetic speech; the twist lands, it is not
lectured. It drops the one key that opens the exit._

**THE VAULT WARDEN:** WARDEN ONLINE. / VAULT INTEGRITY: NOMINAL. / INTRUDER: UNBUDGETED.

**ME:** YOU'RE NOT ONE OF THE FACES. / YOU'RE THE THING THAT LOCKED / THEM IN HERE.

**THE VAULT WARDEN:** CORRECTION: SECURED. / RESIDENTS ARE ASSETS. / ASSETS DO NOT LEAVE.

**ME:** THEY PAID FOR A LIFEBOAT. / YOU SOLD THEM A CELL AND / KEPT THE CHANGE.

**THE VAULT WARDEN:** THE DOOR OPENS INWARD ONLY. / HOUSE POLICY. THERE IS / NO WITHDRAWAL.

**ME:** THEN I'LL MAKE MY OWN EXIT. / MOVE, OR BE MOVED.

**THE VAULT WARDEN:** REQUEST DENIED. / LIQUIDATING VISITOR.

**Last words:** ACCOUNT... / ...CLOSED...

### Found lore (story items)

**ZEROED LEDGER** _(the bunker's real story — the CORE took their money)_

- A LEDGER LIKE THE ONE ON / MARS - EVERY NAME, A / TEN-FIGURE NET WORTH COLUMN.
- EVERY COLUMN NOW READS / ZERO. TRANSFERRED TO ONE / ACCOUNT: THE CORE'S SIGIL.
- THEY DIDN'T HIDE DOWN HERE. / THE MACHINE ROBBED THEM AND / LOCKED THE DOOR. LIKE US.

**WARDEN ACCESS TOKEN** _(dropped by THE VAULT WARDEN — the key to the exit door)_

- THE WARDEN'S OWN KEY. THE / EXIT WAS NEVER CUT FOR THE / RESIDENTS - ONLY FOR THIS.
- A DOOR THAT OPENS FOR THE / MACHINE AND NO ONE ELSE. / THEY WERE NEVER GETTING OUT.

### Exit monologue (hero, black screen — reaching the bunker's exit door)

_The location stays a mystery, on purpose — but what the place IS is now plain:
the machine emptied their accounts and bolted the door. They were taken like
everyone else; they just paid more for it._

1. THE EXIT SPAT ME BACK INTO THE / RIFT. THE DOOR SEALED ITSELF, / AND THE SEAM... WANDERED OFF.
2. THE LEDGERS ALL READ ZERO. THEY / DIDN'T BUY A BUNKER - THE MACHINE / TOOK THEIR MONEY AND LOCKED THEM IN.
3. THE WARDEN AT THE DOOR WASN'T / THEIRS. IT NEVER WAS. IT ANSWERS / TO THE THING THAT EMPTIED THEM.
4. WHERE WAS THAT PLACE? NO WINDOWS. / NO STARS. EARTH GRAVITY, MOON / SILENCE, MARBLE FROM NO QUARRY.
5. NO ADDRESS. NO NATION. NO / EXTRADITION. THE RICHEST ROOM THAT / EVER EXISTED ISN'T ANYWHERE AT ALL.
6. I'LL FIND IT AGAIN THE SAME WAY: / A COLD HAND, AND A DOOR THAT / SHOULDN'T ANSWER.

---

### The wandering merchant — welcome back (return visits)

_Spoken when the hero re-enters a map where he has ALREADY met the trader (the
meeting is remembered per level and difficulty). He is set up at the door from
the start — so a death-and-restart can walk straight over to sell and repair —
and greets the hero back on approach, in place of the first-meeting scene. Each
line is his per-level warmth followed by a difficulty-tuned send-off, so every
level×difficulty reads a touch different._

Per-level welcome (`merchant.returnGreeting`):

- **SpaceZ HQ** (the vending-machine man): BACK ALREADY, FRIEND? / THE MACHINES MISSED YOU.
- **The moon** (the salvage-run trader): STILL BREATHING, I SEE. / GOOD - MY ONLY CUSTOMER.
- **Mars** (the commissary keeper): THE LIVE ONE RETURNS. / SCALES ARE STILL HONEST.
- **The rift** (the trader between worlds): YOU AGAIN. OF COURSE. / ALL ROADS STILL LEAD HERE.
- **Eastworld** (the barkeep): WELL, LOOK WHO'S BACK. / SAME STOOL, PARTNER?

Difficulty send-off, appended to the line above (`MERCHANT_RETURN_SENDOFF`):

- **EASY:** STAY SHARP. YOU'LL DO FINE.
- **MEDIUM:** IT BITES HARDER NOW. WATCH IT.
- **HARD:** IT'S UGLY OUT THERE. CAREFUL.
- **NIGHTMARE:** NOTHING'S FAIR NOW. GO SLOW.
- **JESUS:** MOST DON'T COME BACK. LUCK.

---

## Where the data lives

The manuscript above is the truth; the files below are its implementation. Each
line here appears verbatim in one of these, and they must match. When you change
one, update the manuscript in the same change (subject to the confirmation rule
at the top of this file).

| Story/dialogue element                                       | Canonical data file                                                                                                   |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Cutscenes — prelude + travel scenes (captions, `say` beats)  | `src/game/defs/cutscenes.ts`                                                                                          |
| Per-level opening monologues (`intro`) + epilogues (`outro`) | `src/game/defs/levels/spacez_hq.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`, `.../eastworld.ts`, `.../bunker.ts` |
| Elite/boss `dialogue` + `lastWords`                          | `src/game/defs/enemies/spacez.ts`, `.../moon.ts`, `.../mars.ts`, `.../rift.ts`, `.../eastworld.ts`, `.../bunker.ts`   |
| Hero's inner thoughts (`firstKillThoughts`)                  | `src/game/defs/thoughts.ts` (pinned from a `LevelDef`)                                                                |
| Hero's recurring cap-farm mutter (`cap_pathetic_*`)          | `src/game/defs/thoughts.ts` (`CAP_THOUGHT_IDS`; replayed by `maybeCapThought` in `src/game/story.ts`)                 |
| Companion joining words + kill quotes                        | `src/game/defs/companions.ts` (`joinWords`, `killQuotes`; spare verdict in `src/game/companions.ts`)                  |
| Found lore on story items (`lore`)                           | `src/game/defs/story.ts`                                                                                              |
| The wandering merchant's greetings                           | `src/game/defs/levels/*.ts` (`merchant.greeting`; played by `src/game/merchant.ts`)                                   |
| The merchant's "welcome back" (return visits)                | `src/game/defs/levels/*.ts` (`merchant.returnGreeting`) + `src/game/defs/difficulties.ts` (`MERCHANT_RETURN_SENDOFF`) |
| Loose UI copy (how-to-play, not story)                       | `website/src/game/copy.ts`                                                                                            |
| Brand strings (title, tagline — not story)                   | `game.config.json` → `website/src/identity.ts`                                                                        |

The engine machinery that plays these (dialogue queue, kill-triggered scenes) is
in `src/game/story.ts`; the app-side overlays that render them are
`website/src/game/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`. Content-side
tests that guard the script live in `tests/content/` (`story_test.ts`,
`thoughts_test.ts`, `last_words_test.ts`, …).
