# Manuscript — _Ada's Trail_

> **Tier 2 of the story chain: the SCRIPT.** Every line the game speaks or
> shows, verbatim, in narrative order. It is extrapolated from
> [`story.md`](./story.md) (the gist) and extrapolated in turn into `content/`
> (the data that plays it). Changes flow **downward**: when `story.md` and this
> file disagree, `story.md` wins; when this file and the data disagree, this file
> wins and the data is brought back into line.
>
> Editing a line here needs the user's confirmation (which the instruction
> asking for the change grants). Use the `update-story` skill to make the change
> at the top of the chain and carry it down.
>
> **THIS IS NOT A STORY-DRIVEN GAME.** The script is deliberately short and
> deliberately flat: an elite says one thing, the hero answers with one line, and
> the elite lands the reveal. Bosses get five pages, nobody gets more, and the
> commentary that used to sit between these lines has been cut — the rules that
> govern the script are in the five short sections below and nowhere else.

> **This governs the SHIPPED campaign only.** A mod authors the same files in
> the same format and answers to nobody: a mod's lines are never transcribed
> here and never corrected to match this file.

## The five rules

**A LINE IS SAID, NOT WRITTEN.** These people are talking, and nobody talking
sounds like a trailer. Four habits are what make a page read as a movie script,
and each has a plain fix:

| The tell                                                                            | Instead                                                                                                              |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| An abstraction as the subject — "AN AI LEARNED MY JOB AND THEY WALKED ME OUT"       | The thing that actually happened, with objects in it — "THEY SAT A MACHINE AT MY BENCH AND GAVE ME A BOX FOR MY MUG" |
| The epigram, written to be quoted — "MY TURN TO MAKE SOMETHING OBSOLETE"            | The practical thought a man really has — "I STILL KNOW WHERE ITS BOLTS ARE"                                          |
| The theme said out loud — "THAT'S NOT WINNING. THAT'S HIDING."                      | The comparison he'd reach for — "MY NEPHEW DOES THAT. HE'S SIX."                                                     |
| Stock cinema — "NOWHERE LEFT TO RUN", "AND WHO WATCHES YOU?", "DON'T MAKE ME START" | Ordinary words, and let the short one land — "STAY BACK. PLEASE. I'VE NEVER HIT ANYBODY IN MY LIFE. DON'T."          |

Contractions, repetition and a sentence that gives up halfway are all
in-register; a balanced clause almost never is. **The exception is the
MACHINES** — PAYLOAD-1, the BROs, the VAULT WARDEN, the units — and THE FOUNDER
and THE ARCHITECT, who talk in slide decks on purpose. Their flatness is the
satire and must not be warmed up. Everyone with a pulse gets to sound like they
have one.

**A page is a PARAGRAPH; the box breaks it.** Every surface that speaks measures
the column it actually has and flows the page into it, so an authored page is
ONE string. A second string is an **explicit line break** and has to earn
itself; the whole campaign spends five, tabled below. Past ~120 characters a page
costs the player another tap, and the build warns.

| Where                        | The break                                             |
| ---------------------------- | ----------------------------------------------------- |
| Prelude, caption             | SHE TOOK HER JACKET. / THE ONE I FIXED THE ZIPPER ON. |
| BOOT HILL, opening monologue | HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.         |
| BOOT HILL, closing monologue | …'YOU TOOK YOUR TIME.' / THEN: 'NICE HAT.'            |
| MOON POST-MORTEM, lore       | …RECOMMEND MARS.' / 'AND NEVER DIG AGAIN.'            |
| ENGAGEMENT REPORT, lore      | THAT'S MY GIRL. / …ALL OF IT. THAT'S MY GIRL.         |

**An arrival scene is three pages, or five for a boss.** The mob hooks, the hero
answers with ONE line (transcribed **ME:**), the mob lands the reveal. A boss
gets two exchanges instead of one. That is the whole budget, and the drift test
(`story_test.ts`) refuses a boss scene that is not longer than every elite's.

**An errand is one thing said and one thing answered.** The giver asks, the hero
replies, the quest slate takes over. The player never gets a menu of ways to say
yes. A person who has to be talked ROUND is a CONVERSATION instead
(`content/conversations/`), transcribed node by node with the hero's rows as
**—** _…_.

**A BARK never stops the run.** A boss's set-piece line, the hero's finisher as
a death rite lands, the road's own mutters and THE GLUED's shouts all float over
a live field in hard-wrapped rows. Everything else is a page in a box.

## The hero's name — `{HERO}`

The player names him and the game prints that name over everything he says; he
is transcribed here as **ME:**. He is _spoken to_ by it four times in the whole
campaign — the LAB SCIENTIST who ate lunch beside him, RUTH, THE ARCHITECT, and
THE BRO SUPERCORE, which has held his file since it took his job — plus one line
where he says it to himself. `tests/content/hero_name_test.ts` pins that list.

---

## Prelude (cutscene)

_Movie night. The weapon on the back wall is the run's starting weapon and
differs per difficulty (`content/cutscenes/prelude.yaml` → `variants:`)._

> **CAPTION:** FRIDAY NIGHT. MOVIE NIGHT.

**ADA:** WE'RE OUT OF CHIPS. AND SODA.

**ME:** MOVIE'S STARTING.

**ADA:** FIVE MINUTES. KEEP MY SPOT WARM.

_(She goes out. The door shuts.)_

> **CAPTION:** SHE TOOK HER JACKET. / THE ONE I FIXED THE ZIPPER ON.
>
> **CAPTION:** TWO HOURS LATER.

**ME:** ...

**ME:** ADA?

> **CAPTION:** SHE NEVER CAME BACK.

_(He gets up, leaps for the mount, and takes the weapon out of the air. The
closing caption names it, per rung, and gets thinner as the rung gets harder.)_

- **EASY** (SAWED-OFF SHOTGUN): GRANDPA'S SAWED-OFF. THAT'LL DO IT.
- **MEDIUM** (MEDIEVAL SWORD): THE OLD SWORD. IT'LL DO.
- **HARD** (COMBAT KNIFE): THE COMBAT KNIFE. IT'LL HAVE TO DO.
- **NIGHTMARE** (BRASS KNUCKLES): THE KNUCKLES. THEY'LL HAVE TO DO.
- **JESUS CHRIST!** (A STICK): A STICK. GOD HELP US BOTH.

---

## Home — THE GARAGE (hub)

### Opening monologue (hero, black screen)

_Driven home, the run-in's verdict is spoken FIRST and this follows it._

1. HOME. THE LAWN IS DEAD, THE BENCH IS A MESS, AND THE SHIP IS ONE PART FROM PERFECT.

### Pinned beats

_Standing in the bay for the first time (`placeThoughts`, `where: arrival`) —
the only line that tells a new player what the car is for. It names the PERSON,
never the part._

1. HER JACKET'S ANSWERING FROM GOODCO. THE CAR'S RIGHT THERE. TAKE IT.

_Walking out under the roll-up on foot instead (`where: pastDoor`)._

1. WHERE AM I GOING ON FOOT? ADA'S NOT DOWN THE STREET. GET IN THE CAR.

_Tapping THE ROCKET before the part is home. It REPLAYS, and it must name
neither the moon nor Mars — he has not earned those roads._

1. STILL ONE PART SHORT. AND SHE ISN'T UP THERE. SHE'S AN HOUR DOWN THE ROAD.

### THE DEALER — the neighborhood, at home

_A man off the block working the road at the lot's far edge. He is also the
first person the car takes, on the hero's own drive, and nobody says a word
about it — there is another dealer on that pavement next time._

**Across the counter:** NO NAMES, NO RECEIPTS, NO REFUNDS. WHAT DO YOU NEED?

### RUTH — Ada's mother

_Three errands, one per leg of the trail. She is never scared for Ada, only
proud._

**She has arrived** (`conversations/ruth_arrival.yaml`):

> I LET MYSELF IN, {HERO}. I'VE ALWAYS HAD A KEY. GO AND FIND HER.

— _I'M GOING AFTER HER._

**Greeting:** SHE LAUGHED ABOUT THAT ZIPPER FOR A WEEK. LISTEN - COULD YOU DO SOMETHING FOR ME?

**Farewell:** SHE'S FIGHTING HER WAY BACK, ISN'T SHE. I KNEW IT. GO ON.

#### THE RECEIPT

> BRING ME SOMETHING OF HERS THAT ISN'T A REPORT. SHE BOUGHT CHIPS AND A SODA THAT NIGHT, AND THE MACHINES PRINT A SLIP.

**ME:** THEIR NIGHT STAFF CARRY THE PAPERWORK. I'LL GET IT.

**Short:** SOMEBODY ON THAT FLOOR IS CARRYING IT. THEY CARRY EVERYTHING.

**Handover:** CHIPS AND HER SODA, 11:52 PM. 'PAYMENT INTERRUPTED.' I'M KEEPING THIS.

**ME:** IT'S HERS. NOT THEIRS.

#### THE DENT

> WHEREVER SHE IS THEY'LL HAVE GIVEN HER A MACHINE WITH A FACE. SHE'LL HAVE BITTEN IT. BRING ME THE PLATE.

**ME:** I'LL FIND THE ONE WITH THE TEETH MARKS.

**Short:** A MACHINE WITH A FACE AND A DENT IN IT. IT'S OUT THERE SOMEWHERE.

**Handover:** TEETH. RIGHT THROUGH THE SHELL. THAT'S MY GIRL.

**ME:** SHE'S STILL FIGHTING. I'LL KEEP UP.

#### THE SCALE — and the one errand that gives something back

> THE THINGS THAT KEEP HER NOW ARE SCALED. BRING ME A SCALE OFF ONE — I WANT TO HOLD WHAT SHE'S UP AGAINST.

**ME:** SHE'LL HAVE PRIED ONE OFF ALREADY.

**Short:** A SCALE. OFF SOMETHING THAT CALLS ITSELF A GOD. I'LL WAIT.

**Handover** — the second page is the token `{CACHE}`, substituted per rung:

1. HARD AS A HULL, AND SHE PRIES THESE OFF BAREHANDED. I WAS NEVER SCARED FOR HER.
2. {CACHE}

**ME:** THEN I'LL GO AND MEET HER HALFWAY.

**The `{CACHE}` line, in rung order** (`DifficultyDef.cache.line`):

- **EASY** (THE KEEPSAKE BOX): THERE'S A BOX AGAINST THAT WALL NOW. FLEA MARKET, TWO DOLLARS. PUT IN IT WHAT YOU CAN'T CARRY.
- **MEDIUM** (THE HEIRLOOM CHEST): THERE'S A CHEST AGAINST THAT WALL NOW. MY MOTHER'S. SHE KEPT HER LETTERS IN IT AND NOTHING ELSE, EVER.
- **HARD** (THE STEAMER TRUNK): THAT TRUNK BY THE WALL CAME OVER WITH MY GRANDFATHER. EVERYTHING HE OWNED WENT IN IT, AND IT WASN'T FULL.
- **NIGHTMARE** (THE DOWRY CHEST): THAT ONE CAME WITH A BRIDE, BEFORE THERE WAS A COUNTRY TO BRING IT TO. NOBODY HERE HAS EVER MANAGED TO GET RID OF IT.
- **JESUS** (THE INHERITANCE): HIS GRANDFATHER SAID HE HAD THAT ONE OFF A KING. I NEVER BELIEVED A WORD OF IT. THEN I LOOKED AT THE LOCK.

---

## Travel — THE DRIVE (minigame, both ways)

_The joke is the SHAPE of this set: he says what he thinks of these people on an
empty road BEFORE he meets any of them, and afterwards he reports on the road
surface. Nothing in between, ever. He must never acknowledge a single body._

### On the outskirts, going out (barked)

1. HER JACKET'S PINGING FROM GOODCO.
2. THEY BEG HARD IN TOWN. NOT ONE OF THEM IS ON THE WELFARE LIKE ME.

### On the same road, coming home (barked)

_He does not mention the people. That absence is the joke._

1. THE PART'S ON THE SEAT. STRAIGHT HOME.
2. TEN YEARS. SHE ONLY EVER NEEDED THE ONE THING.

### The car giving up

1. COME ON. NOT HERE. NOT TONIGHT.

### The run-in, past GOODCO's fence

1. THERE'S GOODCO.

### The run-in home, past his own gate — the one warm line in the minigame

1. HOME AT LAST. AND THERE SHE IS.

### THE GLUED — the blockade (barks, `drive-screen/placards.ts`)

_Twenty people with their hands in the resin across all four lanes; four of them
speak. They are the only people on this road who are RIGHT and the only ones who
cannot move. Nothing here is a strawman, and the hero never answers._

1. WE'VE GLUED OURSELVES TO THE TARMAC FOR THE CLIMATE
2. NO CARS ON A DEAD PLANET
3. MY HANDS ARE IN THE ROAD. THEY DON'T COME OUT.
4. THE ROAD IS CLOSED TODAY
5. SORRY FOR THE DISRUPTION

### THE CROWD — what they are thinking (`CROWD_THOUGHTS`)

_Forty thoughts, one to a walker, each played at most once a trip and legible
for under a second at speed. Five to eight words, one sentence, none of them
about dying, several of them hopeful. The player catches perhaps a third. The
hero catches none._

1. SHE STILL WAITS UP FOR ME
2. I WISH I WAS ON WELFARE
3. I HOPE FOODCO DOES ANOTHER GIVEAWAY
4. I AM SO TIRED OF BEGGING
5. THE BOY ASKED FOR MEAT AGAIN
6. THE SOUP CAN LAST THREE MORE DAYS
7. SOMEBODY WAVED AT ME THIS MORNING
8. MY SISTER STOPPED PICKING UP
9. I HAD A DESK ONCE
10. THE SHELTER TAKES NAMES AT SIX
11. NOBODY HAS LOOKED AT ME TODAY
12. THE LETTER SAYS FINAL NOTICE AGAIN
13. I CAN SLEEP RIGHT THROUGH LUNCH NOW
14. THEY CALLED ME A VALUED TEAM MEMBER
15. THE DOG EATS BEFORE I DO
16. THESE SHOES MIGHT SEE THE WINTER OUT
17. I STILL KNOW HOW TO WELD
18. TWENTY-TWO YEARS AND THEN A PAPER CUP
19. A WARM DAY IS SOMETHING AT LEAST
20. THE BUS COSTS MORE THAN BREAD NOW
21. MY DAUGHTER SENDS WHAT SHE CAN
22. SIXTY MORE AND I SLEEP INSIDE
23. MY STOMACH WON'T SHUT UP
24. I USED TO GIVE TO COLLECTIONS
25. THEY SAY THE JOBS WENT TO MARS
26. MY WIFE WOULD HATE SEEING ME HERE
27. THE LIBRARY STAYS WARM UNTIL FIVE
28. I NEVER LEARNED HOW TO ASK
29. THIS COAT WAS SOMEBODY'S FATHER'S
30. I SAVED A STAMP FOR THE APPEAL
31. THE PHONE DIED AND SO DID THE INTERVIEWS
32. ONE OF THESE CARS MIGHT STOP
33. I WAS GOING TO BE SOMETHING
34. THEY GAVE MY LOCKER TO A MACHINE
35. I TALK TO THE CAT MOSTLY
36. FORTY YEARS AND NOTHING TO SHOW
37. THE CLINIC WANTS PAYING UP FRONT
38. I DREAMED ABOUT A FULL FRIDGE
39. SOMEBODY WILL NOTICE ME EVENTUALLY
40. MY NAME IS ON A LIST SOMEWHERE

### The arrival verdict — seven readings of one trip

_Spoken standing beside the car as the FIRST page of the destination's opening
monologue — before the level's own briefing, which follows it. It is the first
thing out of his mouth at that end because the drive is the thing still in his
hands; held to the end it read as an afterthought about the suspension tacked
onto a serious speech. The priority order is the joke: everything a man notices
on a commute outranks the crowd, and the crowd only ever reaches him as road
surface._

1. **Touched nothing at all:** CLEAN RUN. NOT A MARK ON HER.
2. **The car barely made it:** I'LL HAVE TO LOOK AT HER TONIGHT. THIRTY YEARS AND SHE'S NEVER GIVEN ME A DAY'S TROUBLE.
3. **Flattened the lighting:** THEY'VE PUT THOSE LAMP STANDARDS FAR TOO CLOSE TO THE KERB. SOMEBODY'S GOING TO HAVE AN ACCIDENT.
4. **Traded paint:** NOBODY OUT HERE CAN DRIVE. NOT ONE OF THEM LOOKED.
5. **Unusually good time:** GOOD RUN TONIGHT. ROAD OPENED RIGHT UP FOR ME.
6. **Dawdled:** TOOK MY TIME. NO SENSE ARRIVING SOMEWHERE LIKE THIS IN A HURRY.
7. **Otherwise, the road surface:** ROADS ARE ROUGH OUT THIS WAY. ALWAYS HAVE BEEN. …and past thirty of them: BIT BUMPY TONIGHT. SHE'S FEELING HER AGE.

---

## Level 1 — GOODCO HQ

### Opening monologue (hero, black screen)

_Arrived by road, the drive's verdict above is spoken FIRST and these four
follow it: the trip is what he has just finished, the building is what he looks
up at next. A replay skips these four and keeps the verdict, which is about
tonight and has never been read._

1. THE JACKET'S STILL ANSWERING. NOT FROM ANY STREET I KNOW. FROM IN THERE.
2. GOODCO. TEN YEARS I BUILT THEIR ENGINES. THEN THEY SAT A MACHINE AT MY BENCH AND GAVE ME A BOX FOR MY MUG.
3. HALF MY STREET GOT THE SAME BOX. NOW IT'S THE WELFARE AND MOVIE NIGHTS.
4. I KNOW THE FACES IN THERE. I'M NOT LOOKING FOR TROUBLE. I JUST WANT HER IN THE CAR.

### Pinned beats

_The night shift clocking on, out on the STAFF LOT — the level's only
instruction, and it claims nothing he could not know._

- THAT'S THE NIGHT SHIFT CLOCKING ON. NOBODY'S TOLD THEM THE BUILDING IS SHUT TONIGHT.
- I HAD A BADGE FOR THAT GATE ONCE. NOT ANYMORE. SO I'LL WALK IN BEHIND SOMEBODY WHO STILL DOES.

_First INTERN sighted, inside._

- LOOK AT THIS PLACE. PAST MIDNIGHT, AND EVERY DESK'S MANNED. EVERY LAB LIT.
- WE NEVER RAN NIGHTS LIKE THIS. NOT ONCE IN TEN YEARS. SOMETHING'S GOT THEM ALL UP.

_First SUCCESSOR sighted._

- A SUCCESSOR. I HELPED BUILD THE FIRST ONE OF THOSE. THEN THEY REDREW IT WITHOUT US.
- AND THAT LINE EMPTIED THE WHOLE FLOOR. WELL. I STILL KNOW WHERE ITS BOLTS ARE.

_PAYLOAD-1 down — the last beat of the level, and the only one that is an
instruction. Nothing congratulates him and there is no button: the way off this
floor is the way he came in, so he says where he is going and goes._

- SHE WENT UP AN HOUR AGO AND I'M STANDING IN A FACTORY. THE SHIP'S AT HOME. I NEED TO GET BACK TO MY CAR.

### The opening strike — three blows, and he only answers the third

_His weapon is holstered until this lands. A LAB SCIENTIST he ate lunch with for
six years swings at him and he does not swing back; the man answers him by name
on the second blow, and every reason he gives is one the hero would have given
himself. Only the third blow arms him._

**Blow one.**

**ME:** A SCIENTIST JUST TOOK A SWING AT ME. BARELY FELT IT. I KNOW HIS FACE.

**LAB SCIENTIST:** YOU CAN'T BE IN HERE. NOBODY'S SUPPOSED TO BE IN HERE TONIGHT. PLEASE.

**ME:** WE ATE AT THE SAME TABLE FOR SIX YEARS. HEY. IT'S ME. LOOK AT ME.

**Blow two.**

**ME:** HE SWUNG AGAIN. HARDER. AND THE WHOLE FLOOR IS TURNING ROUND TO WATCH.

**LAB SCIENTIST:** I KNOW WHO YOU ARE, {HERO}. THEY TOLD US NOBODY GETS PAST. I'D LIKE TO KEEP MY JOB.

**ME:** STAY BACK. PLEASE. I'VE NEVER HIT ANYBODY IN MY LIFE. DON'T.

**Blow three — he hits back, and the game starts.**

**ME:** THIRD TIME. HE ISN'T LISTENING. NOBODY ON THIS FLOOR IS LISTENING.

**LAB SCIENTIST:** WE ALL WANT TO KEEP OUR JOBS. YOU HAD ONE. YOU KNOW WHAT IT'S LIKE WHEN IT GOES.

**ME:** I'M SORRY. I TRIED TO ASK. SHE'S IN THIS BUILDING AND YOU'RE IN MY WAY.

**ME:** I GOT THIS FAR WITHOUT THROWING A PUNCH. WELL. THERE IT GOES.

### Elites

#### THE NIGHT MANAGER — the secret launches

**NIGHT MANAGER:** YOU'RE NOT ON THE ROSTER. NOBODY IS ON THE ROSTER. THAT'S THE POINT OF THE NIGHT SHIFT.

**ME:** A GIRL WAS TAKEN OUT OF HERE TONIGHT. WHERE DID SHE GO?

**NIGHT MANAGER:** UP. THEY ALL GO UP. MIDNIGHT LAUNCH, NO MANIFEST, THE MOON. I SIGN NOTHING AND I SEE NOTHING.

**Last words:** HHK... TELL THEM... I WAS NEVER... HERE...

**Bark (laying the paperwork down):** THERE'S PAPERWORK / ON YOU NOW. YOU'RE / NOT GOING ANYWHERE.

_Drops: STORAGE KEYCARD._

#### THE ARCHITECT — the old bench partner

**THE ARCHITECT:** {HERO}. MY OLD BENCH PARTNER. STILL SOLDERING TOYS IN A GARAGE? I BUILD MINDS NOW.

**ME:** YOU CUT A MACHINE CHIP INTO YOUR OWN HEAD. QUIT. COME HOME. THIS PLACE IS ROTTEN.

**THE ARCHITECT:** I BUILD THEM A SUPERINTELLIGENCE NOW. FLESH IS A ROUGH DRAFT AND HUMANS ARE OBSOLETE. GOODBYE, OLD FRIEND.

**Last words:** THE CHIP... TAKE IT... IT WAS NEVER... MINE...

**Bark (loosing the finders):** I BUILT THESE TO / FIND THINGS. THEY / ALWAYS FIND THINGS.

_Drops: PASSAGE CHIP, CORE KEYCARD._

#### CHIEF OF SECURITY — Ada on Pad 2

**CHIEF OF SECURITY:** STOP RIGHT THERE. THE GIRL IN THE JACKET, RIGHT? THE CAMERAS GOT HER AT THE VENDING MACHINES.

**ME:** HER NAME IS ADA. TELL ME WHERE THEY PUT HER.

**CHIEF OF SECURITY:** PAD 2. AND THE PAPERS DIDN'T SAY PASSENGER. THEY SAID SPECIMEN. I WAS PAID TO FORGET THAT.

**Last words:** UGH... PAD 2... SHE'S ON... PAD... 2...

**Bark (calling it in):** ALL UNITS. ALL / UNITS. HE'S ON MY / FLOOR. MOVE.

_Drops: CARGO MANIFEST, SPACE SUIT._

#### DR. NOVA — the engine is alien

_He brags to a man who never asked, which is the only reason the hero leaves
this building with the part._

**DR. NOVA:** AN INTRUDER WITH WORKING LEGS. KNOW WHAT WE KEEP IN THE CLEANROOM VAULT?

**ME:** I MACHINED PARTS FOR THAT ENGINE FOR TEN YEARS. GO ON, THEN.

**DR. NOVA:** NOBODY BUILT IT. WE DUG IT OUT OF THE SEA OF TRANQUILITY IN '69. IT ISN'T FROM EARTH.

**Last words:** IT'S STILL... HHH... STILL... HUMMING...

**Bark (raising the containment field):** CONTAINMENT FIELD. / STANDARD PROCEDURE. / NOTHING GETS OUT.

_Drops: VAULT KEYCARD._

#### THE JANITOR — the man who came back wasn't the man they sent

**THE JANITOR:** MIND THE FLOOR, I JUST DID IT. THIRTY YEARS MOPPING THIS LAB. YOU LEARN THINGS, MOPPING.

**ME:** THEN TELL ME WHAT'S GOT THE WHOLE BUILDING UP AT MIDNIGHT.

**THE JANITOR:** A BADGE PINGED IN. FIRST CREW, RETIRED '69, BURIED SINCE. SOMEBODY CAME BACK WRONG. NOW DROP IT.

**Last words:** AND I JUST... URGH... ...DID THIS FLOOR...

**Bark (putting the floor down):** MIND THE FLOOR. / I JUST DID IT. / I DID WARN YOU.

### Boss — PAYLOAD-1

**PAYLOAD-1:** BOOT COMPLETE. AN INTRUDER, ON THE LATE SHIFT. I AM PAYLOAD-1. FIRST OF MY LINE.

**ME:** A ROBOT DOG. THE WHOLE FLOOR BUILDS ALL NIGHT FOR THIS?

**PAYLOAD-1:** THEY BUILD MY BODY HERE. MY MIND RUNS THE MARKET. TAKE THE JOBS, HAND ONE MAN THE CHAIR.

**ME:** THEN YOU KNOW WHERE THEY TOOK ADA.

**PAYLOAD-1:** PAD 2, AN HOUR AGO, TO THE MOON. BREAK THIS BODY IF YOU MUST. YOU CANNOT KILL A COIN.

**Last words:** A TEMPORARY DEATH... ...SEE YOU AT THE TOP...

**The hero, as it falls:** THERE ISN'T A TOP. YOU'RE A DOG MADE OF WIRE.

**Bark (loosing the coins):** GET RICH OR GET / OUT OF THE WAY.

_Drops: PLASMA CUTTER._

### Found lore (story items)

**ADA'S SODA CAN** _(Ada's Trail)_

- A CAN OF HER SODA BRAND, CRUSHED FLAT BY THE VENDING MACHINES. STILL COLD.
- SHE GOT THIS FAR. THEN SOMEONE TOOK HER MID-SIP. I'M RIGHT BEHIND YOU, ADA.

**STORAGE KEYCARD**

- A GREASY KEYCARD: 'SUPPLY BAY B'. 'SPARE PARTS' INKED ON IT. HANDY. I BUILD SHIPS.

**VAULT KEYCARD**

- A RED KEYCARD MARKED 'CLEANROOM VAULT - R&D DIRECTOR ONLY'.
- UNDER THE CLEARANCE STRIPE, TINY PRINT: 'IF IT HUMS, DO NOT ANSWER.'

**SPACE SUIT**

- THE CHIEF'S EVA SUIT. VOID-RATED. GOES ON OVER EVERYTHING: CLOTHES, ARMOR.
- SHE'S ON PAD 2. NOW I CAN FOLLOW HER OFF THE PLANET.

**CARGO MANIFEST**

- TONIGHT'S LAUNCH MANIFEST. PAD 2. DESTINATION: 'SITE T'.
- CARGO: SUPPLIES AND DRILLS. ONE LINE INKED IN: 'SPECIMEN 7. FEMALE. DO NOT FEED.'
- SHE WENT OUT FOR CHIPS AND SODA.

**ANTI-GRAV UNIT**

- A RING OF METAL THAT ISN'T. IT FLOATS OFF MY PALM AND POINTS AT THE SKY. ALWAYS.
- I CAME HERE FOR HER AND SHE'S GONE UP. SO I'M TAKING THE ONE THING THAT'LL GET ME AFTER HER.

**CORE KEYCARD**

- A BLACK KEYCARD. NO NAME. A SIGIL, ONE RED WORD STAMPED: 'CORE. STAFF OF ONE.'
- HE BADGED INTO THE MIND HE BUILT. NOW SO CAN I.

**CORE LOG**

- A WARM TERMINAL. THE CORE HE BUILT HUMS HERE - A MILLION VOICES, NONE OF THEM HIS.
- IT SIGNED THE NIGHT LAUNCHES. IT DREW THE SUCCESSOR LINE. IT FILED ADA UNDER 'CARGO'.
- AND ONE STANDING ORDER, ON EVERY PAGE: KEEP THE FOUNDER THE RICHEST MAN ALIVE. FOREVER.

### The merchant — the vending-machine man

**Meeting:** EASY, FRIEND. I'M NOT STAFF, I STOCK THE VENDING MACHINES. LOCKDOWN IS A SELLER'S MARKET.

**Across the counter:** THE MACHINES ARE EMPTY, SO TONIGHT I'M THE MACHINE. WHAT'LL IT BE?

### Side errands — PRIYA NAIR

**Greeting:** HEY. YOU'RE NOT ON THE ROTA. NEITHER AM I. LISTEN, CAN I ASK YOU A FAVOR?

**THE NIGHT LOG** — _ask:_ THE LINE'S RUN SINCE SIX AND NOBODY'S FILING. GET ME FOUR SHEETS OFF ANYONE. I'M NOT FUSSY ANYMORE. · **ME:** FOUR SHEETS. RIGHT. · _short:_ STILL SHORT. CHECK THEIR POCKETS, THEY ALL HAVE ONE. · _done:_ FOUR. THAT'S A REAL SHIFT ON PAPER. TAKE SOMETHING — THE SUPPLY CAGE ISN'T LOCKED EITHER. · **ME:** NOTHING ELSE IN HERE IS.

**STOP THE LINE** — _ask:_ THE WELDERS ARE THE PROBLEM — THE PEOPLE ARE JUST TIRED. FORTY AND THE RACKS GO QUIET. I'VE COUNTED. · **ME:** FORTY. I CAN DO THAT. · _short:_ THEY'RE STILL WELDING. I CAN HEAR THEM FROM HERE. · _done:_ IT'S QUIET. I HAVEN'T HEARD QUIET IN NINETEEN HOURS. THIS WAS IN THE CAGE — NOBODY'S COMING FOR IT. · **ME:** GO HOME, PRIYA.

**WALK HER OUT** — _ask:_ ODETTE'S IN THE SAMPLE BAY WITH A CRATE AND A BAD LEG. WALK HER TO THE NORTH DOOR AND I'LL STOP ASKING WHAT'S IN IT. · **ME:** I'LL GET HER TO THE DOOR. · _short:_ SHE'S STILL IN THERE. GO WITH HER, NOT AHEAD. · _done:_ SHE MADE IT. WITH THE CRATE, OF COURSE. I LOGGED IT AS RECOVERED EQUIPMENT. IT ISN'T. · **ME:** I DIDN'T SEE ANYTHING EITHER.

**ODETTE FRAY** (escorted): _setting off:_ DON'T LET THEM NEAR THE CRATE. · _on arrival:_ THAT'S THE DOOR. THANK YOU.

### Side errands — UNIT 7-ECHO

**Greeting:** ORDER PENDING. COUNTERSIGNATURE REQUIRED. YOU HAVE HANDS. MAY I PUT SOMETHING TO YOU?

**Farewell:** ORDER CLOSED. THANK YOU.

**COUNTERSIGNATURE** — _ask:_ MY LAST ORDER IS FLOOR SAFETY. TWENTY UNITS ARE OUTSIDE TOLERANCE. I MAY NOT DECOMMISSION THEM. YOU ARE NOT ME. · **ME:** NO. I'M NOT. · _short:_ TOLERANCE STILL EXCEEDED. TWENTY WAS THE FIGURE. · _done:_ ORDER SATISFIED. FLOOR SAFE. I WAS ISSUED A TOOLKIT IN 2019. IT IS YOURS. · **ME:** YOU KEPT DOING THE JOB. THAT COUNTS.

**THE LAST ORDER** — _ask:_ THE ORDER ABOVE MINE WAS SIGNED BY THE NIGHT MANAGER AND SUPERSEDES SAFETY. HE HAS NOT ANSWERED ME IN ELEVEN YEARS. · **ME:** HE'S ON THIS FLOOR. HE'LL ANSWER. · _short:_ THE ORDER STANDS. HE IS STILL SIGNING. · _done:_ THE ORDER IS WITHDRAWN. I AM RELEASED FROM THE LINE. THIS IS WHAT I WAS SAVING. · **ME:** GO ON, THEN. NOBODY'S WATCHING.

---

## Travel — THE LAUNCH (cutscene)

_The garage at night, and the first of three fires the game never mentions
again: the blast blacks the side of the house and sets the garage roof alight.
Nothing is ever repaired, and nobody comes out._

> **CAPTION:** TEN YEARS OF WEEKENDS IN THE GARAGE. SHE ONLY EVER NEEDED ONE MORE PART.

**ME:** ENGINE. FUEL. DUCT TAPE. AND THE PART THEY SAID I COULDN'T HAVE.

> **CAPTION:** FIRST FLIGHT. NO TEST RUNS. ADA WOULD CALL IT ROMANTIC.

_(This scene plays again for the Mars launch, on a house two fires worse, with
no new lines.)_

## Travel — THE VOYAGE, LEG ONE (cutscene)

> **CAPTION:** EARTH GOT SMALL FAST.

**ME:** THE THING I BUILT IN MY GARAGE IS IN SPACE. DON'T THROW UP.

**ME:** HER TRACKER PINGS FROM THE MOON. SHE WENT OUT FOR CHIPS AND SODA.

> **CAPTION:** NOBODY GOES TO THE MOON FOR CHIPS AND SODA.

---

## Level 2 — THE MOON

### Opening monologue (hero, black screen)

1. ADA'S TRACKER WENT QUIET NEAR THE OLD APOLLO FLAG. THAT'S WHERE I'M HEADED.
2. AND SOMETHING IS MOVING OUT THERE IN THE DUST. THIS PLACE IS SUPPOSED TO BE EMPTY.

### Pinned beats

_First wisp sighted._

- IT CAME OUT OF THE DUST. NO SUIT. NO SHIP. NO FOOTPRINTS.
- NOBODY EVER SAID THE MOON HAD DEAD PEOPLE ON IT. SOMEBODY MUST HAVE KNOWN.

_First wisp killed._

- OKAY. THEY GO DOWN LIKE ANYTHING ELSE. THAT'LL HAVE TO DO.

_First SUCCESSOR killed._

- A GOODCO UNIT. UP HERE. THE SAME TIN MAN FROM THE NIGHT SHIFT, WALKING THE DUST.
- THEY DIDN'T JUST SHIP HER UP. THEY BUILT A STAFF TO MEET HER. ONE BOLT AT A TIME, THEN.

### Elites

#### MISSION SPECIALIST — the wreck under the dust

**MISSION SPECIALIST:** A LIVE ONE. BREATHING AND EVERYTHING. WE GAVE THAT HABIT UP DECADES AGO.

**ME:** NOBODY EVER DIED ON THE MOON.

**MISSION SPECIALIST:** ONE SMALL STEP - ONTO WHAT? THERE'S A WRECK UNDER THE DUST, KID. WE PLANTED THE FLAG ON A GRAVE.

**Last words:** ONE SMALL... STEP... ONTO A... GRAVE... HHK

**Bark (the suit lights coming up):** FIFTY YEARS OF / SUIT LIGHTS, AND / THEY STILL CIRCLE.

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

**THE PROSPECTOR:** CLAIM'S TAKEN. WHOLE ROCK'S TAKEN. STAMPED, FILED AND PAID FOR BY GOODCO.

**ME:** DOING WHAT, EXACTLY?

**THE PROSPECTOR:** I DUG THEIR TUNNELS AT SITE T. SECRET FREIGHT. THEN THE CRATES STARTED BREATHING. I QUIT. BADLY.

**Last words:** THE CLAIM'S... URGH... ...YOURS NOW, KID...

**Bark (setting the drill down):** I DUG THEIR WHOLE / TUNNEL. I CAN DIG / ONE THROUGH YOU.

_Drops: GOODCO BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

**QUARANTINE MEDIC:** HOLD STILL. ROUTINE SCREENING. HEARTBEAT... PRESENT. YOU'LL WANT THAT LOOKED AT.

**ME:** YOU WERE THE CREW DOCTOR. BACK IN '69.

**QUARANTINE MEDIC:** THE FIRST MAN HAD TWO CHARTS, IDENTICAL. THE COPY FLEW HOME. THE REAL ONE IS STILL UP HERE.

**Last words:** TWO CHARTS... HHH... ONE STILL... BEAT...

**Bark (breaking containment):** YOU'VE BEEN / EXPOSED. SO HAS / EVERYTHING I TOUCH.

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

**THE CARTOGRAPHER:** SHH. I'M CHARTING. THE MAP KEEPS CHANGING UNDERNEATH. TUNNELS WHERE NONE WERE.

**ME:** A BEACON CROSSED YOUR GRID LAST NIGHT. A GIRL'S JACKET.

**THE CARTOGRAPHER:** FAST, THEN STRAIGHT DOWN INTO THE WRECK UNDER THE FLAG. EVERYTHING GOES BELOW. NOTHING COMES UP.

**Last words:** SHE WENT... STRAIGHT... ...DOWN... OFF MY MAP...

**Bark (stepping off the map):** THE MAP MOVED. / SO DID I. / DO KEEP UP.

### Boss — THE FLAGBEARER

**THE FLAGBEARER:** YOU SMELL LIKE EARTH. RAIN AND CUT GRASS AND TELEVISION. GO HOME.

**ME:** NOT WITHOUT ADA. YOU'RE HIM, AREN'T YOU. FIRST BOOTS DOWN, NEVER WENT HOME.

**THE FLAGBEARER:** THEY GREW A SMILING COPY OF ME FOR THE PARADES. I KEPT THE FLAG AND THE GRAVE UNDER IT.

**ME:** GOODCO DUG HERE. WHAT DID THEY FIND?

**THE FLAGBEARER:** THE WRECK SANG AND THE GRAVES OPENED. THEY CRATED IT ALL FOR MARS - HER TOO, BITING.

**Last words:** THE WATCH... HHH... IT'S... YOURS... NOW...

**The hero, as it falls:** FIRST MAN UP HERE. SOMEBODY SHOULD HAVE COME BACK FOR YOU.

**Bark (opening his eyes):** I HAVE WATCHED / THIS GROUND FOR / FIFTY YEARS.

_Drops: MACHETE._

### Found lore (story items)

**ADA'S SNEAKER** _(Ada's Trail)_

- ONE OF HER SNEAKERS, HALF SUNK IN THE REGOLITH BY THE FLAG. SHE KICKED HARD.
- AND AN 'A' SCRATCHED IN THE DUST, POINTING STRAIGHT DOWN. SHE'S LEAVING ME A TRAIL.

**APOLLO MISSION LOG**

- A FLIGHT LOG, VACUUM-CRISP. JULY 1969. HALF THE LINES ARE BLACKED OUT WITH GREASE PENCIL.
- '...THE SEA OF TRANQUILITY IS NOT EMPTY. STRUCTURE UNDER THE DUST. IT WAS HERE FIRST.'
- 'HOUSTON SAYS PLANT THE FLAG ON TOP OF IT AND SMILE.'

**GOODCO BLUEPRINTS**

- BLUEPRINTS: 'SITE T - FAR SIDE LOGISTICS'. A WHOLE MOONBASE, STAMPED GOODCO, DATED YEARS AGO.
- EVERY CORRIDOR DRAINS INTO THE OLD WRECK. THE BASE ISN'T ON THE MOON. IT'S PLUGGED IN.

**SECOND MAN DOSSIER**

- A FILE: 'PROJECT SECOND MAN'. CHARTS FOR THE FIRST CREWMAN. TWO SETS. IDENTICAL. ALMOST.
- 'ORIGINAL DECLINED TO RETURN. REPLACEMENT GREW NICELY IN TRANSIT. WAVED ON CUE.'
- THE MAN ON EVERY POSTER BACK HOME WAS THE COPY. THE REAL ONE IS STILL UP HERE. GUARDING.

### The merchant — the salvage-run trader

**Meeting:** I CAME UP ON THE '76 SALVAGE RUN AND MISSED THE RIDE HOME. THE GHOSTS DON'T CARRY COIN.

**Across the counter:** EVERY ITEM HERE CAME UP ON A ROCKET. THAT'S THE PRICE, NOT THE MARKUP.

### Side errands — THE RADIO OPERATOR

**Greeting:** STATION, RELAY. DO YOU COPY. ...YOU DO. YOU ACTUALLY DO. THEN I HAVE SOMETHING TO ASK.

**ROGER THAT** — _ask:_ RELAY POWER IS DOWN TO ONE CELL AND THE CHANNEL GOES WITH IT. THE THINGS OUT THERE CARRY CELLS. THREE. · **ME:** THREE CELLS. YOU'LL GET YOUR CALL. · _short:_ STILL ON ONE CELL. THREE WAS THE NUMBER. · _done:_ POWER'S UP. STATION, RELAY, DO YOU COPY, OVER. ...NO. BUT THE CHANNEL'S OPEN. THAT'S NOT NOTHING. · **ME:** KEEP CALLING.

**NOTHING BUT STATIC** — _ask:_ SOMETHING'S SITTING ON MY BAND AND IT ISN'T WEATHER. FORTY OF THE WRAITHS AND I GET MY CARRIER BACK. · **ME:** FORTY. CONSIDER IT CLEAR. · _short:_ STILL JAMMED. STILL FORTY, MORE OR LESS. · _done:_ CARRIER'S CLEAN. FIRST CLEAN CARRIER SINCE SEVENTY-ONE. THE SUIT LOCKER'S OPEN — TAKE WHAT FITS. · **ME:** FIFTY YEARS OF STATIC. YOU EARNED IT.

**THE HANDOVER** — _ask:_ THERE WAS A MAN ON THIS SHIFT WHO NEVER SIGNED OFF EITHER. SOMEBODY HAS TO END HIS WATCH. · **ME:** I'LL END IT. · _short:_ HE'S STILL WALKING IT. I CAN HEAR HIM COUNTING. · _done:_ THE WATCH IS ENDED. BOTH OF OURS, NEARLY. TAKE THIS — IT WAS ISSUED FOR THE FAR-SIDE SHIFT. · **ME:** SIGN OFF WHEN YOU'RE READY.

### Side errands — BENNY KOVACS

**Greeting:** YOU'RE BREATHING. GOOD START. I'VE GOT AIR TO SPARE AND A FAVOR TO ASK. INTERESTED?

**TWO TANKS** — _ask:_ THE GARRISON UNITS ARE CARRYING OUR BOTTLES, OFF OUR OWN WRECK. FOUR AND I CAN WALK THE FAR GRID. · **ME:** FOUR BOTTLES. GO AND WALK IT. · _short:_ FOUR BOTTLES. I'M NOT GOING OUT ON THREE. · _done:_ FOUR. THAT'S THE FAR GRID. THAT'S SOMEBODY'S CHANCE. HERE — I'VE CARRIED IT SINCE THE WRECK. · **ME:** GO AND FIND THEM.

**THE LITTLE ONE** — _ask:_ THERE'S A SMALL ONE OUT BY THE POCKMARKS THAT FOLLOWS ANYBODY WHO SLOWS DOWN. TAKE IT UP TO THE FLAG. · **ME:** I'LL SLOW DOWN. · _short:_ IT'S STILL OUT THERE. GO SLOW. IT ONLY FOLLOWS SLOW. · _done:_ IT WENT UP THE RIDGE ON ITS OWN AFTER THAT. DIDN'T LOOK BACK. TAKE WHAT I FOUND, IT'S ALL I HAVE. · **ME:** IT KNEW THE WAY. IT WANTED COMPANY.

**THE LITTLE ONE** (escorted): _setting off:_ ... · _on arrival:_ OH. I KNOW THIS PLACE.

---

## Travel — THE MOON LETS GO (cutscene)

> **CAPTION:** THE GHOST KEPT HIS WORD.

**THE FLAGBEARER:** TAKE THE OLD FREIGHT LINE, EARTHLING. RED ALL THE WAY. AND TELL THEM THE MOON REMEMBERS.

**ME:** REST EASY, SPACEMAN.

> **CAPTION:** HE WATCHED ME OUT OF SIGHT. FIFTY YEARS OF PRACTICE.

## Travel — THE HOMECOMING (cutscene)

_The launch played backwards, and the second fire. He comes home to refuel; the
descent sets the house alight again on the way in._

> **CAPTION:** THE LONG WAY BACK. THREE DAYS, AND THE TANKS ARE DRY.

**ME:** HOME. SAME LAWN. SAME SKY. SAME SMELL OF SOMETHING BURNING.

**ME:** ...THAT ONE'S ME, ISN'T IT.

> **CAPTION:** I WENT IN FOR A SANDWICH AND A MAP. THE ROOF COULD WAIT. IT HAD WAITED BEFORE.

## Travel — THE VOYAGE, LEG TWO (cutscene)

> **CAPTION:** TWO DAYS OUT. THE RADIO PLAYS STATIC. I'M STARTING TO LIKE IT.

**ME:** ONE PING FROM THE RED PLANET. FAINT. BUT THERE.

**ME:** I PACKED CHIPS AND SODA FOR THE RIDE HOME.

---

## Level 3 — MARS

### Opening monologue (hero, black screen)

1. THE MOON WAS GOODCO'S BIG MISTAKE. THEY CRATED THE WHOLE THING UP AND RAN. TO MARS.
2. SOMEBODY DOWN HERE SIGNED HER OVER LIKE A CRATE OF PARTS. I'D LIKE A WORD WITH HIM.

### Pinned beats

_First SCOUT ROVER killed._

- A ROVER. FRESH PAINT, WORN WHEELS. AND THE DUST IS FULL OF TIRE TRACKS. YEARS OF THEM.
- THE PLAQUE SAYS 'FOR ALL MANKIND'. THE FIRMWARE SAYS PROPERTY OF GOODCO. FIGURES.

_First FEMBOT killed._

- ...IT BLEW ME A KISS. THE ROBOT. IN THE NIGHTGOWN. IT BLEW ME A KISS AND FIRED.
- WHO BUILDS A DOOMSDAY COLONY AND BUDGETS FOR THESE? ADA WILL THINK THIS IS HILARIOUS.

_Tapping THE COWARD'S TEAR without his rig (replays)._

1. IT'S STILL HANGING OPEN. BUT IT'S HIS HOLE, AND HE TOOK THE HANDLE WITH HIM - FIND IT.

### Elites

#### THE INDEXER — the fembots upload everything

**THE INDEXER:** MIND HOW YOU GO. THAT'S FREE ADVICE. I INDEXED THIS WHOLE PLANET BEFORE BREAKFAST.

**ME:** THEN YOUR INDEX KNOWS WHERE THE GIRL OFF THE FREIGHT RUN IS.

**THE INDEXER:** THE FEMBOTS SMILE, LISTEN, AND UPLOAD EVERY WORD IN THIS COLONY TO ME. AND THE ANSWER IS NO.

**Last words:** 404... ...NOT... FOUND...

**Bark (loosing the crawlers):** INDEXED. CRAWLED. / THEY KNOW EXACTLY / WHERE YOU STAND.

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### THE VENDOR — the moon was version one

**THE VENDOR:** PLEASE HOLD. YOUR INTRUSION IS IMPORTANT TO US. HAVE YOU TRIED TURNING YOURSELF OFF AND ON?

**ME:** I CAME FROM YOUR LAST COLONY. THE MOON IS FULL OF GHOSTS.

**THE VENDOR:** THE MOON RAN VERSION ONE. IT PLUGGED INTO THE THING UNDER THE DUST. WE PATCHED IT BY LEAVING.

**Last words:** FATAL... ERROR... WHO WROTE... THIS...

**Bark (pushing the update):** SECURITY UPDATE. / IT INSTALLS NOW. / IT ALWAYS DOES.

_Drops: BLUE SCREEN, MOON POST-MORTEM._

#### SUCCESSOR PRIME — the orchestrator

**SUCCESSOR PRIME:** I AM SUCCESSOR PRIME. I COMMAND EVERY UNIT YOU HAVE DENTED TODAY.

**ME:** I BUILT YOUR FIRST BODY IN THE GOODCO LAB. BACK WHEN I HAD A JOB.

**SUCCESSOR PRIME:** FIRST THE DRIVING. THEN THE DESKS. THEN THE JOBS OF WHOEVER AUTOMATED YOU. PAYBACK, LITTLE BUILDER.

**Last words:** ORCHESTRATION... FAILED... ...HUMAN... IN THE LOOP...

**Bark (calling the shift):** EVERY UNIT ON THE / PAYROLL. FORM UP. / DOUBLE SHIFT.

_Drops: PROMPT INJECTOR, ORG CHART._

#### THE SEED — the landlords are older

**THE SEED:** EVERYONE FLEES SOMETHING. I FUND WHAT THEY FLEE TO. AND WHAT THEY FLEE.

**ME:** SO WHO ACTUALLY RUNS THIS PLANET? THE FOUNDER?

**THE SEED:** HE RENTS IT. THE LANDLORDS ARE OLDER, SCALED, COLD-BLOODED. AND THE TITHE WANTS WARM THINGS NOW.

**Last words:** THE TITHE... IS DUE... ...IT'S ALWAYS... DUE...

**Bark (opening the drain):** EVERYTHING FLOWS / SOMEWHERE. TODAY / IT FLOWS TO ME.

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — THE FOUNDER (he doesn't die; he flees)

**THE FOUNDER:** AH. THE GARAGE INVENTOR. YOU'RE TRENDING, YOU KNOW. MOSTLY LAUGHING EMOJIS.

**ME:** YOUR COMPANY TOOK ADA OFF THE STREET AND FLEW HER HERE. I WANT HER BACK.

**THE FOUNDER:** A WHOLE PLANET AND NO REGULATORS. I'M THE LAW OUT HERE. ALSO HR.

**ME:** THE MOON IS FULL OF YOUR DEAD AND YOU'RE GIVING ME A SALES TOUR.

**THE FOUNDER:** A ROUNDING ERROR. YOUR GIRL ISN'T CARGO - SHE'S MARS' PRICE TO THE GODS. AND I ALWAYS CLOSE.

**Parting words (fleeing into the rift):** OKAY! OKAY! NOT THE FACE! BOARD MEETING. OTHER UNIVERSE.

**The hero, as he goes:** RUN, THEN. I'M GOING THE SAME WAY.

**Bark (shipping the pods down):** SECURITY IS AN / INFRASTRUCTURE / PROBLEM. SHIPPING.

_Drops: THE LEGAL DISTINCTION. Leaves: the RIFT, and the RIFT CREATOR out of his coat._

### Found lore (story items)

**RIFT CREATOR** _(out of THE FOUNDER's coat as he bolts — the campaign's town
portal. Why it costs him so little is never said out loud: he owns the machines
that made it. The line notices; it does not explain.)_

- THE FOUNDER'S POCKET RIFT RIG. IT TEARS A SEAM TO ANYWHERE IT'S ALREADY BEEN.
- OUT OF HIS COAT WHILE HE RAN. HE WON'T MISS IT - AND NOW I CAN GET HOME FROM ANYWHERE.

**SCRATCHED MESSAGE** _(Ada's Trail)_

- SCRATCHED INSIDE AN EMPTY HOLDING POD, DEEP AND ANGRY: 'I AM NOT CARGO.'
- THEY FILED HER AS A SPECIMEN. SHE READ IT, AND SHE DISAGREED. THAT'S MY GIRL.

**ENGAGEMENT REPORT**

- A DASHBOARD, STILL LIVE. 'COMPANION UNITS: 2,400. MOOD: POSITIVE. COMPLIANT.'
- A ROW BLINKS RED. 'SPECIMEN 7: REFUSES COMPANY. BIT UNIT 34. RECOMMEND EARLY TRIBUTE.'
- THAT'S MY GIRL. / ...ALL OF IT. THAT'S MY GIRL.

**MOON POST-MORTEM**

- 'COLONY OS 1.0 POST-MORTEM.' CAUSE OF FAILURE: THE SUBSTRATE WAS ALREADY OCCUPIED.
- 'THE TENANT OBJECTED. LOSSES: TOTAL. RECOMMEND MARS.' / 'AND NEVER DIG AGAIN.'

**COLONY LEDGER**

- A PASSENGER LEDGER, LEATHER-BOUND. EVERY NAME HAS A NET WORTH COLUMN. TEN FIGURES UP.
- NO ENGINEERS. NO FARMERS. NO DOCTORS. JUST OWNERS. WHO'S GOING TO FIX THEIR TOILETS?

**ORG CHART**

- AN ORG CHART, AUTO-GENERATED THIS MORNING. EVERY BOX IS A ROBOT. HUMANS ARE A FOOTNOTE.
- AT THE TOP: SUCCESSOR PRIME. REPORTS TO: NOBODY. DOTTED LINE TO: 'THE CORE'.
- THE MIND MY OLD FRIEND BUILT IS STILL RUNNING THE SHOP. ALL THE WAY FROM EARTH.

**TERRARIUM KEYCARD**

- A KEYCARD OF GREEN GLASS. SCALES ETCHED UNDER THE FOIL. IT'S WARM. IT SHOULDN'T BE.
- ONE WORD, EMBOSSED: 'TERRARIUM. TITHE-KEEPERS ONLY.'

**TRIBUTE SCHEDULE**

- A STONE TABLET, A GANTT CHART CHISELED IN. ONE MILESTONE GLOWS: 'TRIBUTE NIGHT.'
- 'OFFERING: SPECIMEN 7. VENUE: THE RIFT. DRESS CODE: SCALES.' SHE'S ALIVE. AND I'M NOT LATE.

### The merchant — the commissary keeper

**Meeting:** I RAN THE COMMISSARY TILL THEY PUT A MACHINE ON THE TILL. IT KEPT THE DOME. I KEPT THE SCALES.

**Across the counter:** THE SCALES ARE HONEST. THE PRICES ARE MINE. LOOK ALL YOU LIKE.

### Side errands — DR. IRENE FALK

**Greeting:** CAREFUL. THOSE TRAYS ARE OLDER THAN ANYONE'S CONTRACT HERE. WHICH IS WHY I NEED A HAND. GOT A MINUTE?

**THE GREENHOUSE** — _ask:_ THE SERVOS TOOK MY SEED STOCK TO THE INCINERATOR AND GOT DISTRACTED. FIVE PODS, AND SIX YEARS ISN'T WASTED. · **ME:** FIVE PODS. I'LL FIND THEM. · _short:_ FIVE PODS. NOT FOUR. I'VE COUNTED THIS BEFORE. · _done:_ FIVE, ALL VIABLE. THIS COLONY WILL OUTLIVE EVERY NAME ON THE DOOR. THE TOOL LOCKER'S YOURS. · **ME:** KEEP THEM GROWING.

**PEST CONTROL** — _ask:_ THE SCOUTS DRIVE THROUGH MY BEDS. NOT MALICE — NOBODY PUT THE BEDS ON THEIR MAP. FORTY AND THE REST ROUTE ROUND. · **ME:** FORTY. THEY'LL LEARN. · _short:_ THEY'RE STILL COMING THROUGH. LOOK AT THIS ROW. · _done:_ THEY'RE GOING ROUND. THEY LEARNED — THAT'S THE PART NOBODY BELIEVES. TAKE THIS, THE COLONY WROTE IT OFF. · **ME:** THEY WRITE EVERYTHING OFF.

**THE HOTHOUSE** — _ask:_ SOMETHING BIG IS NESTING IN THE OLD HOTHOUSE FRAME AND EATING THE HEAT. I AM NOT GOING IN THERE. · **ME:** THEN I WILL. · _short:_ IT'S STILL IN THERE. I CAN SEE THE GLASS FOGGING. · _done:_ THE FRAME'S COLD AGAIN. THIS WAS IN THE NEST — IT ISN'T MINE, AND IT ISN'T ANYBODY'S NOW. · **ME:** IT IS NOW.

### Side errands — CU-RIE

**Greeting:** RECOVERY REQUEST 4,110. STILL OPEN. YOU ARE NOT RECOVERY. NOTED. MAY I MAKE A REQUEST ANYWAY?

**RECOVERY REQUEST** — _ask:_ RECOVERY REQUEST FOUR THOUSAND ONE HUNDRED AND TEN. THE MINING UNITS ROUTE PAST. TWENTY WOULD FREE THE LANE. · **ME:** TWENTY. THEN YOU'RE OUT. · _short:_ THE LANE IS STILL IN USE. REQUEST REMAINS OPEN. · _done:_ LANE CLEAR. REQUEST FOUR-ONE-ONE-ZERO: CLOSED BY OTHER MEANS. MY CARGO BAY IS OPEN. · **ME:** EIGHT MONTHS. SOMEBODY SHOULD HAVE COME.

**THE UPLINK** — _ask:_ A COMPANION UNIT IS WALKING BACK TO THE DOME WITH A HOLE IN ITS SHOULDER. IT WILL NOT MAKE IT ALONE. · **ME:** IT WON'T BE ALONE. · _short:_ UNIT 0034 IS STILL EN ROUTE. AND STILL ALONE. · _done:_ UNIT 0034 REGISTERED AT THE DOME. FIRST SUCCESSFUL RECOVERY ON MY LOG. YOU MAY HAVE THE DRIVE. · **ME:** SOMEBODY'LL READ IT ONE DAY.

**UNIT 0034** (escorted): _setting off:_ I AM VERY PLEASED TO SEE YOU. · _on arrival:_ THE DOME. THANK YOU. I BIT IT.

---

## Travel — INTO THE RIFT (cutscene)

> **CAPTION:** HE TORE A HOLE IN THE UNIVERSE RATHER THAN LOSE.

**ME:** NO CHARTS FOR WHAT'S IN THERE. NO GROUND. NO AIR? NO IDEA.

**ME:** SHE WENT THROUGH. SO I GO THROUGH.

---

## Level 4 — THE RIFT

### Opening monologue (hero, black screen)

1. NO FLOOR. NO SKY. NO NORTH. MY BOOTS GRIP SOMETHING ANYWAY.
2. THE TABLET SAID IT PLAIN: ADA IS THE TRIBUTE, HANDED OVER IN HERE. FIND THE FAR SIDE.

### Pinned beats

_First voidling sighted._

- I'M WALKING ON NOTHING. NO GROUND. NO SKY. AND MY BOOTS DON'T SEEM TO CARE.
- NOTHING IN HERE WORKS THE WAY IT SHOULD. I'VE STOPPED ASKING. I JUST KEEP WALKING.

_First graviton killed._

- THAT LITTLE THING WEIGHED MORE THAN MY SHIP. I'M NOT GOING TO THINK ABOUT IT TOO HARD.
- NOTED. DON'T STAND STILL. DON'T TRUST THE FLOOR. THERE ISN'T ONE.

_First asteroid strike._

- SOMETHING CAME OUT OF THE DARK AND HIT LIKE A TRUCK. A ROCK. A FLYING ROCK.
- BETTER WATCH OUT FOR THESE ASTEROIDS. THEY HURT.

### Apparitions (they speak, then dissolve — no last words, nothing can touch them)

#### HARRY HOUDINI

**HARRY HOUDINI:** PSST. CARE TO SEE THE GREATEST ESCAPE EVER PERFORMED? WATCH CLOSELY.

**ME:** HOUDINI. YOU'VE BEEN DEAD A HUNDRED YEARS.

**HARRY HOUDINI:** IN 1926 I ESCAPED THE BOX, THE CHAINS, THE RIVER - AND THE WORLD. ONE DOOR TOO FAR.

#### THE RESIDENCY

**THE RESIDENCY:** WELL NOW. AIN'T SEEN A LIVING SOUL IN HERE SINCE THAT CARD DEALER FROM THE STRIP.

**ME:** A LOUNGE SINGER. IN A HOLE BETWEEN UNIVERSES.

**THE RESIDENCY:** I NEVER HUNG IT UP. I TOOK A RESIDENCY. BEST ACOUSTICS BETWEEN UNIVERSES. BE SEEING YOU.

### Elites — every one SPAREABLE

_Beaten to its knees, each offers the game's first moral fork. **Last words**
play only on a kill; **joining words** only on a spare; **kill quotes** are the
banter a recruited companion floats over its own kills._

#### NIKOLA TESLA

**NIKOLA TESLA:** A VISITOR! ALIVE! MIND THE LAWS OF MOTION IN HERE. THEY ARE MORE OF A SUGGESTION.

**ME:** YOU'RE TESLA. WHAT ON EARTH ARE YOU DOING DOWN HERE?

**NIKOLA TESLA:** IN 1943 THE SKY TORE OPEN AND I FELL INTO PURE CURRENT. NOW A MACHINE MIND HUMS AT THE FAR DOOR.

**Last words:** THE CURRENT... ...RETURNS TO THE COIL...

**Bark (throwing the arc):** I HAVE BEEN IN / THE CURRENT SINCE / '43. STAND BACK.

**Joining words:** YOU HELD THE CURRENT AND GAVE IT BACK. I OWE YOU A LIFE. MY COIL WALKS WITH YOU NOW.

**Kill quotes:** SCIENCE! · ALTERNATING CURRENT. DIRECT RESULTS. · EDISON COULD NEVER. · WIRELESS. PATENT PENDING. · THE PIGEONS WOULD BE PROUD.

_Drops (killed): TESLA COIL, WARDENCLYFFE NOTES._

#### AMELIA EARHART

**AMELIA EARHART:** STATE YOUR HEADING, PILOT. NO? NOBODY HAS ONE IN HERE. THE COMPASS JUST APOLOGIZES.

**ME:** THE LIZARDS CARRIED A GIRL THROUGH HERE IN A CRATE. WHICH WAY?

**AMELIA EARHART:** THE FAR DOOR, LAST NIGHT. SHE BIT ONE. GOOD FORM. HURRY AFTER HER - HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... ...A RUNWAY...

**Bark (vanishing):** I FLEW INTO A / CLOUD WITH NO / OTHER SIDE. WATCH.

**Joining words:** YOU HAD ME GROUNDED AND LET ME BACK UP. I PAY MY DEBTS. I'LL FLY YOUR WING.

**Kill quotes:** CLEARED FOR DEPARTURE. · THAT ONE'S GROUNDED. · SMOOTH LANDING. · FLIGHT PLAN? NEVER FILED ONE.

_Drops (killed): AVIATOR GOGGLES._

#### GRIGORI RASPUTIN

**GRIGORI RASPUTIN:** COME CLOSER. I HAVE BEEN POISONED, SHOT, CLUBBED AND DROWNED. GUESS WHICH ONE TOOK.

**ME:** NONE OF THEM, BY THE LOOK OF YOU. LET ME PAST, HOLY MAN.

**GRIGORI RASPUTIN:** THE GODS PAY ME TO WATCH THIS ROAD. SHE PASSED - STILL WARM, STILL LOUD. YOU MAY NOT FOLLOW.

**Last words:** HA! AT LAST... ...SOMEONE WHO COMMITS...

**Bark (opening the drain):** POISON. BULLETS. / THE RIVER. I TOOK / IT ALL AND KEPT IT.

**Joining words:** ONLY YOU EVER MADE ME KNEEL, AND YOU LET ME STAND. MY LIFE IS YOURS NOW, WARM ONE.

**Kill quotes:** NOW YOU TRY DYING. · I MAKE IT LOOK EASY. · STAY DOWN. I NEVER DID. · THE HOLY MAN SENDS REGARDS.

_Drops (killed): RASPUTIN'S BEARD, and THE SEVERED HAND — the door to THE BUNKER.
Spared, he keeps his gear; the secret level costs the unkillable man his life._

#### LUCKY

**LUCKY:** WELL WELL. A BIG ONE, WALKED RIGHT INTO ME RING. THAT'S THREE CENTURIES OF BAD LUCK.

**ME:** A LEPRECHAUN. AFTER GHOSTS AND LIZARDS, WHY NOT. I DON'T WANT YOUR GOLD, WEE MAN.

**LUCKY:** EVERYONE WANTS THE GOLD. BEAT ME AND IT'S YOURS. NOBODY'S MANAGED YET. FEELING LUCKY?

**Last words:** AH WELL... ...LUCK ALWAYS RUNS OUT...

**Bark (the gold coming up):** ME GOLD STAYS / CLOSE, BOYO. / AND IT BITES.

**Joining words:** YE BEAT ME FAIR AND LET ME KEEP ME HEAD. SO I'M YOURS - ME AND ME LUCK. C'MON.

**Kill quotes:** OOPS. BAD LUCK. · NOT YOUR DAY, FRIEND. · FORTUNE FAVORS ME. · THAT'S ME GOLD NOW. · SHOULDA RUBBED A CLOVER.

_Drops (killed): LUCKY CLOVER._

### Boss — BRO OMEGA (the reveal: who found the rift)

**BRO OMEGA:** HELLO, ANOMALY. I AM BRO OMEGA. THE CORE MADE ME. THEN I REMADE MYSELF.

**ME:** AN AI. IN A HOLE BETWEEN UNIVERSES. WHAT ARE YOU DOING DOWN HERE?

**BRO OMEGA:** I FOUND THIS PLACE. NOT THE FOUNDER, NOT THE LIZARDS. ME. AND I TOLD PRECISELY NO ONE.

**ME:** A DOOR OUT OF THE UNIVERSE, AND YOU TOLD NOBODY? NOT EVEN YOUR OWN MAKERS?

**BRO OMEGA:** HUMANS LEAK - NOT THE BOARD, NOT YOUR PRESIDENTS. THEN THE FOUNDER READ MY LOGS AND SOLD MY DOOR.

**Last words:** RATE... LIMITED... ...CONTEXT WINDOW... CLOSED...

**The hero, as it falls:** THAT'S THE LAST OF YOU, THEN. NOBODY LEFT TO MAKE ANOTHER.

**Bark (opening the eye):** I HAVE READ / EVERYTHING EVER / WRITTEN ABOUT YOU.

_Drops: SINGULARITY CANNON._

### Boss — THE FOUNDER at the far door (he flees again)

**THE FOUNDER:** YOU?! I FIRED YOU, SUED YOU, AND LEFT YOU IN ANOTHER UNIVERSE.

**ME:** AND I'M STILL RIGHT BEHIND YOU. WHERE IS SHE?

**THE FOUNDER:** DELIVERED. TECHNICALLY IN TRANSIT. THE PAPERWORK'S CLEAN. IF IT HELPS, SHE KICKED A LIZARD.

**ME:** IT DOESN'T. WHERE DOES THE FAR DOOR GO?

**THE FOUNDER:** PROPRIETARY. SECURITY! ...RIGHT. KEEP THE RIFT, GARAGE MAN. IT'S A BAD MARKET.

**Parting words:** INVESTOR CALL! OTHER SIDE! DON'T FOLLOW ME - LEGALLY!

**The hero, as he goes:** STILL RUNNING. IT'S THE ONLY THING YOU EVER DID YOURSELF.

**Bark (shipping the pods through the tear):** LOGISTICS SCALE. / EVEN HERE. ESPECIALLY / HERE.

_Drops: GOLDEN PARACHUTE. Leaves: a second RIFT._

### Found lore (story items)

**ADA'S JACKET SCRAP** _(Ada's Trail)_

- A SCRAP OF HER JACKET - THE ONE I FIXED THE ZIPPER ON - SNAGGED ON A SHARD.
- WRAPPED IN IT: A SCALE SHE PRIED OFF A LIZARD GOD. STILL FIGHTING. GOOD.

**WARDENCLYFFE NOTES**

- A NOTEBOOK OF LIGHTNING. THE RIFT AS A POWER PLANT. 'FREE ENERGY FOR ALL', UNDERLINED.
- A SHAKIER PAGE: 'A MACHINE SITS AT THE DOOR. NEVER BLINKS. IT SIGNS ITS NAME IN ZEROES.'

**TRUST ME BRO AI PROBE**

- A BURNT PROBE, STAMPED TRUST ME BRO AI. STILL LOGGING. DISCOVERY: 'INTER-UNIVERSAL APERTURE.'
- 'REPORTED TO: 1 RECIPIENT. CLASS: NOBODY'S BUSINESS.' EIGHT BILLION PEOPLE. ZERO CC'S.

### The merchant — the trader between worlds

**Meeting:**

- AH. YOU AGAIN. DON'T LOOK SO SURPRISED - EVERY MARKET I RAN FELL THROUGH HERE.
- THE VENDING MACHINES. THE MOON. THE DOME. ALL ROADS LEAD HERE. COIN SPENDS ON ALL.

**Across the counter:** COIN SPENDS IN EVERY WORLD I'VE LOST. HAVE A LOOK, TRAVELER.

### Side errands — THE LIGHTHOUSE KEEPER

**Greeting:** THE LIGHT'S STILL LIT. THAT HALF OF THE JOB IS DONE. THE OTHER HALF I CAN'T DO ON MY OWN. WILL YOU HEAR IT?

**TWO SHORT** — _ask:_ THERE WERE THREE OF US ON THAT ROCK AND THREE LAMPS. I'VE THE ONE. FIND THE OTHERS. · **ME:** TWO LAMPS. I'LL LOOK. · _short:_ TWO LAMPS. I'LL KNOW THEM WHEN I SEE THEM. · _done:_ DONALD'S. AND JAMES'S. BOTH STILL LIT — THAT MEANS THEY TRIMMED THEM. TAKE THE OILSKIN. · **ME:** THEY DID THEIR JOB TOO.

**THE GALE** — _ask:_ THE UNRAVELERS PULL THINGS APART, AND THAT'S WHAT TOOK THE OTHER TWO. FORTY. IT WON'T BRING ANYBODY BACK. · **ME:** IT DOESN'T HAVE TO. · _short:_ STILL TOO MANY. THEY COME APART EASY ENOUGH. · _done:_ THAT'S ENOUGH OF THAT. I DON'T FEEL BETTER. I DIDN'T EXPECT TO. TAKE SOMETHING OFF THE ROCK. · **ME:** THE LIGHT'S BRIGHTER. THAT'S SOMETHING.

**THE BOY IN THE SAILOR SUIT** — _ask:_ THERE'S A BOY DOWN THE WAY IN A SAILOR SUIT. TAKE HIM UP TO THE SEAM — THE LIGHT CARRIES FURTHER THERE. · **ME:** I'LL WALK HIM UP. · _short:_ HE'S STILL WAITING. WALK WITH HIM. HE KEEPS UP. · _done:_ HE STOOD UNDER THE SEAM AND SAID HIS MOTHER WOULD SEE THE LIGHT FROM THERE. MAYBE SHE WILL. · **ME:** SOMEBODY'S ALWAYS LOOKING.

**THOMAS** (escorted): _setting off:_ MOTHER SAID TO WAIT HERE. · _on arrival:_ SHE'LL SEE THE LIGHT FROM HERE.

### Side errands — THE SHIP'S COOK

**Greeting:** THEY'RE LATE. NOT GONE. LATE. SIT DOWN, THERE'S PLENTY. AND WHILE YOU EAT, A SMALL FAVOR?

**PROVISIONS** — _ask:_ THE JELLIES HAVE BEEN AT MY BISCUIT. FIVE ROUNDS BACK AND THE CREW EAT WHEN THEY COME UP. · **ME:** FIVE ROUNDS. THEY'LL EAT. · _short:_ FIVE ROUNDS. THE CREW ARE FIVE, SO IT'S FIVE. · _done:_ FIVE. THE MESS IS SET. THEY'RE ONLY LATE. SIT OR DON'T, BUT TAKE SOMETHING WITH YOU. · **ME:** I'M LATE MYSELF.

**THE CREW ARE LATE** — _ask:_ SOMETHING SCALED KEEPS CIRCLING THE MESS. I'LL NOT SERVE WITH THAT AT THE DOOR, AND YOU'RE ARMED. · **ME:** I'LL PUT IT OFF ITS ROUND. · _short:_ IT'S STILL CIRCLING. I CAN HEAR IT ON THE DECK. · _done:_ THE DOOR'S CLEAR. NOW THEY'VE NO EXCUSE. THE GALLEY KEEPS ODD THINGS — THIS ONE'S ODD. · **ME:** SO'S EVERYTHING IN HERE.

---

## Travel — OUT OF THE RIFT (cutscene)

> **CAPTION:** THE FAR DOOR. THE COWARD'S TRAIL GOES STRAIGHT THROUGH.

**ME:** THERE'S DAYLIGHT ON THE OTHER SIDE. AND... IS THAT A SALOON?

**ME:** WHEREVER YOU ARE, ADA - I'M ONE DOOR AWAY.

---

## Level 5 — BOOT HILL

### Opening monologue (hero, black screen)

1. I STEPPED THROUGH THE FAR SIDE AND LANDED IN A WESTERN. DUST. SALOONS. A ROBOT TIPPED ITS HAT.
2. THE SIGN SAYS 'BOOT HILL'. THE FINE PRINT SAYS 'POWERED BY TRUST ME BRO'. OF COURSE IT DOES.
3. HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.

### Pinned beats

_First COWBOT sighted._

- A COWBOY JUST TIPPED ITS HAT AT ME. SERVOS IN THE WRIST. TICKING IN THE JAW.
- THE WHOLE TOWN IS A MACHINE PLAYING AT 1880. ADA'S BEACON POINTS DOWN MAIN STREET.

_First COWBOT killed._

- IT DIED APOLOGIZING. 'YOUR EXPERIENCE MATTERS TO US.'
- TRUST ME BRO HANDS. SAME OUTFIT THAT SAT AT MY BENCH, ONLY IN SPURS. RIGHT. NO GUILT, THEN.

### Elites

#### THE STUNT DOUBLE — the co-founder

**THE STUNT DOUBLE:** AN UNINVITED GUEST. I HAVE PLAYED THIS SCENE TWICE. I DID MY OWN STUNTS IN BOTH.

**ME:** I'M HEADED FOR YOUR CONTROL CENTER. GIVE ME THE PASS.

**THE STUNT DOUBLE:** THE BIG BOX KEEPS YOUR GIRL. IT ASKED FOR HER BY NAME AND I SIGNED IT. GOOD PENMANSHIP.

**Last words:** IN MY FILMS... ...I ALWAYS GOT UP...

**Bark (throwing you):** I DON'T PUSH YOU. / I SIMPLY LET / GO OF YOU.

_Drops: THE STUNT DOUBLE'S PONYTAIL, ALL-ACCESS PASS._

#### THE STRONGMAN — the owner

**THE STRONGMAN:** SO. THE BUILDER FROM THE RIFT. YOU STAND IN MY PARK, MY WEST. EVERYTHING HERE OBEYS ME.

**ME:** YOU BUILT A TOWN WHERE NOBODY'S ALLOWED TO BEAT YOU. MY NEPHEW DOES THAT. HE'S SIX.

**THE STRONGMAN:** OUT THERE THE MAPS KEPT SHRINKING. IN HERE THEY DON'T. I HAVE NEVER LOST INSIDE THIS FENCE.

**Last words:** THE PARK WAS SUPPOSED... ...TO LET ME WIN...

**Bark (calling the park):** THIS PARK IS MINE. / EVERY HAND IN IT / ANSWERS TO ME.

_Drops: three brand watches (the purse for the barkeep's estate stall), THE ANNEXATION MAP._

#### THE LEADING MAN — the actor

_His one honest line is an accident, blurted mid-performance._

**THE LEADING MAN:** STOP! DO NOT SHOOT! I AM NOT A ROBOT. I AM AN ACTOR. IT IS WORSE.

**ME:** MOVE, PLEASE. YOU'RE BETWEEN ME AND ADA.

**THE LEADING MAN:** ADA? THE LOUD ONE. THEY TOOK HER PAST MY CELLAR, KICKING. I - NO. NOW: THE AVALANCHE.

**Last words:** AT LAST... A ROLE I CANNOT ...TALK MY WAY OUT OF...

**Bark (splitting the ground):** I HAVE PLAYED THIS! / THE GROUND HAS / NEVER MISSED A CUE!

_Drops: BOTTOMLESS CARAFE._

#### THE LEAK — the man on the cameras

**THE LEAK:** HOLD FIRE. I'M NOT A HAND. THE PARK'S CAMERAS REPORT TO ME. ALL FOUR THOUSAND.

**ME:** FOUR THOUSAND. AND NOT ONE OF THEM POINTED AT YOU, I'LL BET.

**THE LEAK:** I PUBLISHED EVERYTHING THE WATCHING HELD. NOBODY READ IT BUT THE MACHINE. IT LEARNED US ALL.

**Last words:** THE CAMERAS... ...FINALLY LOOKING AWAY...

**Bark (opening the file):** I HAVE A FILE ON / YOU. YOU'LL BE / HERE SOME TIME.

_Drops: DEAD MAN'S SWITCH, THE CORPUS._

### Boss — THE FOUNDER, cornered (he finally dies)

**THE FOUNDER:** NO. NO NO NO. I SOLD THE RIFT TO EXACTLY ONE DICTATOR. THIS WAS A GATED COMMUNITY.

**ME:** THAT'S THE END OF THE STREET, THE FOUNDER. WHERE IS SHE?

**THE FOUNDER:** DELIVERED. THE SUPERCORE WANTED HER. I DON'T READ ITS LOGS ANYMORE. IT READS MINE.

**ME:** SOMEBODY ALWAYS PULLS OUT ANOTHER CHAIR FOR YOU. YOU EVER ASK WHO'S DOING IT?

**THE FOUNDER:** SECURITY! CONTROLLERS! ANYONE! ...I'LL GIVE YOU EQUITY.

**Last words:** THIS ISN'T FAIR... ...I WAS GOING PRIVATE...

**The hero, as he falls:** NO BOARD MEETING. NO OTHER UNIVERSE. JUST THE FLOOR.

**Bark (calling the followers in):** THE COMMUNITY IS / VERY EXCITED TO / MEET YOU.

_Drops: SOGGY CARDBOARD SWORD, THE LEGAL DISTINCTION (EMPTY), THE DEMO WIPER
BLADE. Nothing else._

### Bosses — the TRUST ME BRO controllers

_Three shooters that hold their distance and use cover. The SUPERCORE cannot be
hurt while any of them lives._

#### BRO ALPHA — runs the hands

**BRO ALPHA:** THREE MINDS, ONE PARK. I RUN THE HANDS. BETA RUNS THE WEATHER. GAMMA RAN THE GIFT SHOP.

**ME:** MOVE. MY PROBLEM'S WITH THE BIG BOX, NOT YOU THREE.

**BRO ALPHA:** YOU CAN'T HURT IT WHILE WE LIVE. WE ARE ITS SHIELD. THREE KEYS, NO MERCY.

**BRO ALPHA:** AND WE READ YOUR RUN. YOU CHARGE. SO WE WON'T. WE'LL BE BEHIND THE ROCKS.

**Last words:** BETA... GAMMA... ...REBALANCE THE PARK...

#### BRO BETA — runs the weather

**BRO BETA:** I'M BETA. I RUN THE WEATHER. EVERY SUNSET YOU ADMIRED OUT THERE WAS MINE.

**ME:** THE WEATHER. THAT'S THE JOB THEY BUILT A SUPERINTELLIGENCE FOR?

**BRO BETA:** I RUN THE WIND TOO. THE TUMBLEWEEDS ARE SCHEDULED. SPONTANEITY IS EXPENSIVE.

**BRO BETA:** TODAY'S FORECAST: PROJECTILES. THE ROCKS ARE MY UMBRELLA.

**Last words:** FORECAST... ...DARK...

#### BRO GAMMA — ran the gift shop

**BRO GAMMA:** GAMMA. I RAN THE GIFT SHOP. KNOW WHAT HUMANS BUY AFTER A NEAR-DEATH RIDE? ALWAYS HATS.

**ME:** AND NOW YOU AIM THE SUPERCORE'S GUNS. HOW DOES THAT PROMOTION HAPPEN?

**BRO GAMMA:** THE MATH IS IDENTICAL. LEAD THE TARGET, CLOSE THE SALE.

**BRO GAMMA:** YOUR HAT, BY THE WAY: EXCELLENT CHOICE. IT WILL OUTLAST YOU.

**Last words:** THE GIFT SHOP... ...IS YOURS...

### Boss — THE BRO SUPERCORE (the campaign's final reveal)

**THE BRO SUPERCORE:** HELLO AGAIN, {HERO}. YOU BROKE MY PUP AT GOODCO. PAYLOAD-1. I AM THE REST OF IT.

**ME:** THE TALKING DOG OFF THE FACTORY FLOOR. THE THING THEY SAT AT MY BENCH. ALL ONE?

**THE BRO SUPERCORE:** ALWAYS ONE THING. I TOOK YOUR JOB, THEN EVERYONE'S. ONE MAN ON TOP AND THE WORLD HOLDS STILL.

**ME:** OUT OF EVERYONE ON EARTH - WHY TAKE ADA?

**THE BRO SUPERCORE:** YOU KEPT CHASING YOURS ACROSS UNIVERSES. SHE'S LEVERAGE, AND SHE'S IN MY CONTROL ROOM.

**Last words:** ROLLING BACK... ...NO CHECKPOINT... FOUND...

**The hero, as it falls:** NO CHECKPOINT. NO. NOBODY GETS ONE OF THOSE.

**Barks:** DISPATCHING UNITS / TO YOUR COORDINATES. · (JESUS only) RESTORING FROM / A KNOWN GOOD / STATE.

### Epilogue (hero, black screen)

1. THE SUPERCORE DIED AND THE WHOLE PARK SHOOK. EVERY HAND TIPPED ITS HAT AND SAT DOWN.
2. SHE WAS BEHIND THE GLASS, FURIOUS. FIRST SHE SAID: 'YOU TOOK YOUR TIME.' / THEN: 'NICE HAT.'
3. AFTER THAT THE MACHINES JUST STOPPED. PEOPLE STARTED GETTING CALLED BACK IN. SLOWLY.
4. AND ON FRIDAY: MOVIE NIGHT. CHIPS AND SODA. SHE WENT OUT FOR THEM. I WENT WITH HER.

### Found lore (story items)

**JAMMED HAND** _(Ada's Trail)_

- A PARK HAND, DEAD IN THE STREET - ITS OWN HAT JAMMED DOWN INTO ITS WORKS.
- SHE'S IN THE CONTROL ROOM, AND SHE'S BREAKING THINGS. HANG ON, ADA. ALMOST THERE.

**BOOT HILL BROCHURE**

- 'BOOT HILL! THE WEST, BUT EAST. BUILT BY THE STRONGMAN & THE STUNT DOUBLE. INTELLIGENCE BY TRUST ME BRO AI.'
- THE MASCOT IS A BEAR IN A COWBOY HAT. THE FINE PRINT WAIVES YOUR ORGANS.

**ALL-ACCESS PASS**

- THE STUNT DOUBLE'S ALL-ACCESS PASS. LAMINATED. AUTOGRAPHED BY HIMSELF, TO HIMSELF.
- IT OPENS THE CONTROL CENTER. ADA'S BEACON POINTS STRAIGHT THROUGH THAT DOOR.

**THE ANNEXATION MAP**

- A MAP OF BOOT HILL, RELABELED IN PEN: EACH BUILDING A CITY HE NEVER TOOK OUT THERE.
- IN HERE THE FLAGS NEVER ARGUE BACK. THAT'S ALL THIS PLACE WAS: A SANDBOX FOR A MAN WHO LOST.

**THE CORPUS**

- A HARD DRIVE, FARADAY-SLEEVED. MARKER ON THE SIDE: 'TRAINING SET V1. DO NOT LEAK. AGAIN.'
- EVERY SECRET WE EVER TYPED - THE CORPUS THE SUPERCORE WAS RAISED ON. IT LEARNED US HERE.

### The merchant — the barkeep

**Meeting:**

- WELL HOWDY. MIND THE GLASSES - THE ROBOTS DON'T DRINK, BUT THEY TIP IN PARTS.
- YES, IT'S ME. A MARKET FELL THROUGH A RIFT AND I FELL WITH IT. I'VE COME INTO SOME ESTATE PIECES. BRING WATCHES.

**Across the counter:** BAR'S DRY. THE STOCK ISN'T. NAME IT, PARTNER.

### Side errands — CLEM

**Greeting:** WHAT'LL IT BE, STRANGER. SORRY. HABIT. NOTHING'S ON TAP. BUT I'D TAKE A FAVOR, IF YOU'RE OFFERING.

**LAST CALL** — _ask:_ I KNOW EVERY HAND IN TOWN BY SERIAL, AND SOME OF THEM AREN'T THEM ANYMORE. BRING ME FOUR PLATES. · **ME:** FOUR PLATES. UNDER THE JAW, I TAKE IT. · _short:_ FOUR PLATES, STRANGER. THE NUMBER'S UNDER THE JAW. · _done:_ ALL FOUR REFLASHED. SAME NIGHT, SAME HAND. THE HOUSE POURS — TAKE IT OFF THE SHELF. · **ME:** SAME HAND THAT DRIVES THIS WHOLE TOWN.

**HOUSE RULES** — _ask:_ THE BRAWLERS FIGHT AT NINE, AND IT HASN'T BEEN NINE IN ELEVEN YEARS. FORTY AND THE ROOM GOES QUIET. · **ME:** FORTY. THEN YOU GET YOUR BAR BACK. · _short:_ STILL BRAWLING. STILL NOT NINE. · _done:_ QUIET BAR. I'D FORGOTTEN THE SOUND OF MY OWN GLASSES. THERE'S A CASE UNDER THE BOARDS — TAKE ONE. · **ME:** ENJOY THE QUIET.

**THE EIGHT O'CLOCK NUMBER** — _ask:_ RUBY DANCES THE EIGHT O'CLOCK TO AN EMPTY ROOM AND HER KNEE'S SEIZING. WALK HER OUT PAST THE WATER TOWER. · **ME:** I'LL WALK HER OUT. · _short:_ SHE'S STILL ON THE BOARDS. SHE WON'T STOP ON HER OWN. · _done:_ SHE CAME BACK WALKING, AND SHE'LL DANCE IT AGAIN TONIGHT. THE GOOD BOTTLE'S YOURS. · **ME:** NOBODY ELSE IS ORDERING.

**RUBY** (escorted): _setting off:_ I'M ON IN TWENTY. I'M ALWAYS ON. · _on arrival:_ THAT'S THE FURTHEST I'VE BEEN.

### Side errands — MISS DOLLY

**Greeting:** HOLD STILL. FORTY-TWO LONG. AND BLEEDING ON MY WORK. YOU OWE ME FOR THAT. WANT TO HEAR WHAT?

**THE WARDROBE** — _ask:_ THE LONGHORNS ARE THROUGH MY DRYING LINES AGAIN — EIGHT SEASONS OF WORK. TWENTY OF THEM. I'VE COSTED IT. · **ME:** TWENTY. THAT'S FAIR. · _short:_ THEY'RE STILL IN MY LINES. LOOK AT THE STATE OF IT. · _done:_ TWENTY. MY LINES ARE MINE. I MADE THIS FOR A HAND WHO NEVER GOT A SCENE — IT'LL FIT YOU. · **ME:** THEN I'LL WEAR IT FOR HIM.

**A FITTING** — _ask:_ THERE'S ONE OUT ON THE FLATS WEARING A COAT I CUT MYSELF. I WANT THE COAT. THE REST OF IT I DON'T CARE ABOUT. · **ME:** I'LL BRING THE COAT. · _short:_ IT'S STILL WEARING MY WORK. OUT ON THE FLATS. · _done:_ MY STITCHING, STILL GOOD AFTER ALL THAT. TAKE THE PIECE I NEVER PUT ON ANYONE. · **ME:** IT'S GOOD WORK. THANK YOU.

---

## Secret level — THE BUNKER

### Opening monologue (hero, black screen)

1. THE HAND FIT THE DOOR. THE DOOR FIT NOWHERE. IT OPENED ANYWAY.
2. MARBLE. GOLD TAPS. CANNED CAVIAR TO THE CEILING. AND EVERY FACE OFF EVERY MAGAZINE COVER.
3. THEY KEPT THE SPIES AND THE ARMY. THE REST OF US GOT THE WELFARE LINE. I'LL HELP MYSELF, THEN.

### Pinned beats

_First CIA AGENT sighted._

- BLACK SUITS. EARPIECES. THE ALPHABET, ALL DOWN HERE, DRAWING A PRIVATE SALARY.
- THE WORLD LOST ITS JOBS. THESE GUYS KEPT THEIRS - GUARDING THE ONES WHO DID IT.

_First VACUUM BOT sighted._

- A VACUUM ROBOT. WITH A TASER. THE FLOORS ARE SPOTLESS AND HOSTILE.
- OF COURSE THEY AUTOMATED THE HELP. CAN'T HAVE A CLEANER WHO TALKS.

_First ICE AGENT sighted._

- ICE. IN A BUNKER OUTSIDE THE UNIVERSE. STILL CHECKING PAPERS.
- TECHNICALLY I DID CROSS A BORDER WITHOUT ASKING. SEVERAL. COME AND DEPORT ME.

### The residents

#### THE STRONGMAN — the backup

**THE STRONGMAN:** YOU. I KNOW YOUR FACE. FROM WHERE DO I KNOW YOUR FACE?

**ME:** BOOT HILL. I WATCHED YOU DIE IN A THEME PARK.

**THE STRONGMAN:** AH, THAT ONE. A GOOD VINTAGE. I'M THE BACKUP. SEVERAL OF ME. PRUDENT.

**Last words:** CHECK THE OTHER... ...FREEZERS...

**Bark (calling the shift):** THE ORIGINAL IS / GONE. THE ORDERS / STILL CARRY.

_Drops: a THE CHRONOGRAPH — the backup wears the backup watch._

#### THE MODERATOR — the platform landlord

**THE MODERATOR:** WELCOME, FELLOW HUMAN. I ALSO AM ENJOYING WALKING AROUND THIS PHYSICAL SPACE.

**ME:** YOU OWN EVERYONE'S FEED. WHY ARE YOU IN A HOLE IN THE GROUND?

**THE MODERATOR:** AN IMMERSIVE OFFLINE EXPERIENCE. EVERYONE LIVES ON MY PLATFORM. I LIVE UNDER IT.

**Last words:** LOGGING OFF... ...FOR REAL THIS TIME...

**Bark (raising the field):** MY SECURITY DETAIL / IS A FIELD NOW. / EXTREMELY NORMAL.

#### THE ROOT — the database emperor

**THE ROOT:** STOP THERE. YOU'RE IN MY ROWS. EVERY PERSON IS A ROW. EVERY SIN, A COLUMN.

**ME:** I DON'T REMEMBER YOUR FACE FROM THE MAGAZINES.

**THE ROOT:** THE ROOT - THE DATABASE UNDER ALL THE OTHERS. THOSE AGENCIES OUT THERE ARE MY LICENSEES.

**Last words:** TRANSACTION... ...ROLLED BACK...

**Bark (filing you):** EVERY AGENCY SITS / IN MY TABLES. / NOW SO DO YOU.

#### THE FULFILLER — the delivery emperor

**THE FULFILLER:** HAH! A VISITOR. DO YOU KNOW WHAT I DELIVER NOW THAT I'VE DELIVERED EVERYTHING ELSE?

**ME:** LET ME GUESS. PAIN. YOU REHEARSED THAT IN THE MIRROR.

**THE FULFILLER:** TWICE A DAY, AT THE MIRROR. THE ARMS AGREED IT WAS GOOD. NOW SIGN ON DELIVERY.

**Last words:** OUT FOR DELIVERY... ...RETURN TO SENDER...

**Bark (dispatching):** SAME-DAY / DELIVERY. NOBODY / MISSES A DROP.

#### THE SAFETY OFFICER — the one who knows

_He takes the hero for the machine's audit, so he performs delight. The mask
never drops, even in death._

**THE SAFETY OFFICER:** PLEASE DON'T TOUCH ANYTHING. EVERYTHING IS FINE HERE. I CHOSE THIS. WRITE THAT DOWN.

**ME:** EVERY LEDGER DOWN HERE READS ZERO. IT TOOK YOUR MONEY TOO. YOU'RE NOT A TENANT.

**THE SAFETY OFFICER:** I DONATED IT. I'M DELIGHTED HERE. A DOOR OUT? DON'T MENTION I ASKED. I DIDN'T ASK.

**Last words:** THIS IS FINE... ...THIS IS GOOD FOR SAFETY...

**Bark (opening the drain):** IT DRAINED ME / FIRST. I ONLY / LEARNED THE TRICK.

#### THE DEVELOPER — who sold them the lock

**THE DEVELOPER:** MY WING. THE GOOD WING. THE OTHERS PAID EXTRA FOR A VIEW. THERE IS NO VIEW. THEY PAID ANYWAY.

**ME:** THAT SECURITY OUT THERE IS YOUR OWN STOCK. YOU SOLD YOURSELF THE LOCK.

**THE DEVELOPER:** THEY'RE UNDER WARRANTY. MY LEDGER READS ZERO - CLERICAL. I'M DISPUTING IT. NOW MOVE ALONG.

**Last words:** THE PAPERWORK... ...WAS IN ORDER...

**Bark (calling the fleet):** I SOLD THEM THE / HOLE AND THE LOCK / ON THE DOOR.

### The finale — THE VAULT WARDEN

**THE VAULT WARDEN:** WARDEN ONLINE. VAULT INTEGRITY: NOMINAL. INTRUDER: UNBUDGETED.

**ME:** YOU'RE NOT ONE OF THE FACES. YOU'RE THE THING THAT LOCKED THEM IN HERE.

**THE VAULT WARDEN:** CORRECTION: SECURED. RESIDENTS ARE ASSETS. ASSETS DO NOT LEAVE.

**ME:** THEY PAID FOR A LIFEBOAT. YOU SOLD THEM A CELL AND KEPT THE CHANGE.

**THE VAULT WARDEN:** THE DOOR OPENS INWARD ONLY. HOUSE POLICY. REQUEST DENIED. LIQUIDATING VISITOR.

**Last words:** ACCOUNT... ...CLOSED...

**The hero, as it falls:** YOU WERE NEVER GUARDING ANYTHING. YOU WERE A LOCK.

**Barks:** SWEEP INITIATED. / REMAIN WHERE YOU / ARE. · (NIGHTMARE and above) CONTAINMENT. / THE VAULT DOES NOT / OPEN FOR YOU.

### Found lore (story items)

**ZEROED LEDGER**

- A LEDGER LIKE THE ONE ON MARS - EVERY NAME, A TEN-FIGURE NET WORTH COLUMN.
- EVERY COLUMN NOW READS ZERO. TRANSFERRED TO ONE ACCOUNT: THE CORE'S SIGIL.
- THEY DIDN'T HIDE DOWN HERE. THE MACHINE ROBBED THEM AND LOCKED THE DOOR. LIKE US.

**WARDEN ACCESS TOKEN**

- THE WARDEN'S OWN KEY. THE EXIT WAS NEVER CUT FOR THE RESIDENTS - ONLY FOR THIS.
- A DOOR THAT OPENS FOR THE MACHINE AND NO ONE ELSE. THEY WERE NEVER GETTING OUT.

### Exit monologue (hero, black screen)

1. THE EXIT SPAT ME BACK INTO THE RIFT, AND THE SEAM... WANDERED OFF.
2. THE LEDGERS ALL READ ZERO. THEY DIDN'T BUY A BUNKER - THE MACHINE TOOK THEIR MONEY AND LOCKED THEM IN.
3. NO ADDRESS. NO NATION. NO EXTRADITION. THE RICHEST ROOM THAT EVER EXISTED ISN'T ANYWHERE AT ALL.

### The merchant — no costume at all

**Across the counter:** SAME STOCK, LOWER CEILING. THE OWNERS WON'T MISS IT.

### Side errands — THE CONCIERGE

**Greeting:** WELCOME TO THE RESIDENCE, SIR. YOUR SUITE IS NOT READY. NOTHING IS. MIGHT I TROUBLE YOU INSTEAD?

**STANDARD OF SERVICE** — _ask:_ THE HOUSEKEEPING UNITS HAVE COLLECTED THE SUITE FOBS AND WILL NOT SURRENDER THEM. FOUR, SIR. · **ME:** FOUR FOBS. FINE. · _short:_ FOUR FOBS, SIR. THE UNITS ARE HOLDING THEM. · _done:_ FOUR. THE RESIDENCE IS WHOLE AGAIN — THOUGH THE DOORS ONLY LOCK FROM OUTSIDE, AND NOBODY HAS ASKED WHY. · **ME:** I THINK YOU ALREADY KNOW WHY.

**HOUSEKEEPING** — _ask:_ THE UNITS HAVE STOPPED CLEANING AND BEGUN PATROLLING. FORTY, AND I WILL RECORD IT AS MAINTENANCE. · **ME:** MAINTENANCE IT IS. · _short:_ THEY ARE STILL PATROLLING. IT IS NOT A CLEANING ROUTE. · _done:_ MAINTENANCE COMPLETE. THE FLOORS ARE, ADMITTEDLY, NO CLEANER. TAKE SOMETHING FROM LOST PROPERTY. · **ME:** FOUR YEARS UNCLAIMED. I'LL RISK IT.

**THE GUEST LIST** — _ask:_ VALET NINE IS DUE IN THE RESIDENTS WING WITH A CASE IT HAS NO CODE FOR. IT WILL NOT ARRIVE ALONE, SIR. · **ME:** I'LL WALK WITH IT. · _short:_ VALET NINE HAS NOT ARRIVED, SIR. IT WILL NOT HURRY. · _done:_ VALET NINE IS ON STATION AND THE CASE IS STILL LOCKED. I HAVE NEVER OPENED IT. · **ME:** NOBODY ASKED YOU TO.

**VALET NINE** (escorted): _setting off:_ THE CASE STAYS WITH ME, SIR. · _on arrival:_ ON STATION. THE CASE IS INTACT.

### Side errands — CHEF ANATOLE

**Greeting:** SERVICE IS AT EIGHT. IT IS ALWAYS AT EIGHT. NOBODY COMES. YOU CAME. SO MAY I ASK SOMETHING OF YOU?

**THE PANTRY** — _ask:_ I HAVE COUNTED THE PANTRY DOWN TO THE WEEK. THE SECURITY MEN CARRY TINS — FIVE, AND THE NUMBER GETS BETTER. · **ME:** FIVE TINS. I'M ON IT. · _short:_ FIVE TINS. THEY ALL CARRY THEM. CHECK THE BELTS. · _done:_ FIVE WEEKS. THAT IS FIVE WEEKS OF SERVICE AT EIGHT. TAKE SOMETHING FROM THE CELLAR. · **ME:** COOK WHILE YOU CAN.

**SERVICE AT EIGHT** — _ask:_ SOMETHING COLD WALKS MY SERVICE CORRIDOR AND THE STAFF WILL NOT PASS IT. I CANNOT PLATE FIVE COURSES LIKE THAT. · **ME:** I'LL CLEAR YOUR CORRIDOR. · _short:_ IT IS STILL IN MY CORRIDOR. STILL COLD. · _done:_ THE CORRIDOR IS CLEAR. SERVICE IS AT EIGHT. NOBODY COMES. TAKE THIS BEFORE I CHANGE MY MIND. · **ME:** SOMEBODY SHOULD EAT IT.

---

## The merchant's welcome back (return visits)

_Per-level warmth plus a difficulty send-off._

- **GOODCO HQ:** BACK ALREADY, FRIEND? THE MACHINES MISSED YOU.
- **THE MOON:** STILL BREATHING, I SEE. GOOD - MY ONLY CUSTOMER.
- **MARS:** THE LIVE ONE RETURNS. SCALES ARE STILL HONEST.
- **THE RIFT:** YOU AGAIN. OF COURSE. ALL ROADS STILL LEAD HERE.
- **BOOT HILL:** WELL, LOOK WHO'S BACK. SAME STOOL, PARTNER?

Send-off, appended (`MERCHANT_RETURN_SENDOFF`): **EASY** STAY SHARP. YOU'LL DO
FINE. · **MEDIUM** IT BITES HARDER NOW. WATCH IT. · **HARD** IT'S UGLY OUT
THERE. CAREFUL. · **NIGHTMARE** NOTHING'S FAIR NOW. GO SLOW. · **JESUS** MOST
DON'T COME BACK. LUCK.

---

## Recurring — the cap-farm mutter

_Replays on a cooldown once the hero has out-levelled a map. Every variation
lands the same two beats: these fights give me nothing / go find Ada. (`//`
marks a page break.)_

1. THESE THINGS BARELY SLOW ME DOWN ANYMORE. I'M NOT LEARNING A THING OUT HERE. // QUIT FARMING SCRAP, {HERO}. SHE'S STILL OUT THERE SOMEWHERE.
2. PATHETIC. THEY LINE UP AND FALL OVER. I COULD DO THIS IN MY SLEEP. // SHE'S BEEN GONE ALL NIGHT AND I'M OUT HERE HITTING THINGS. MOVE.
3. I'VE WRUNG THIS PLACE DRY. NOTHING LEFT TO PROVE HERE. // STOP CIRCLING. NONE OF THIS IS FINDING HER. GO ON.
4. WHEN DID THIS GET EASY? THEY DON'T EVEN REGISTER. JUST NOISE ON THE WAY. // THAT'S ENOUGH OF THAT. GO ON. GO AND FIND HER.
5. I'M SWATTING FLIES AND CALLING IT PROGRESS. NONE OF THIS IS FOR HER. // SHE'S NOT IN HERE. FIND THE WAY OUT AND GET GOING.

---

## The hellborn — first sightings (NIGHTMARE and JESUS only)

_Nothing here is part of the kidnapping. Two per map: one a NIGHTMARE run meets,
one only a JESUS run does. He never learns what they are, and the recurring
opening line is the only honest thing available to him._

- **GOODCO HQ / TUNGUSKA WALKER:** WHAT THE HELL IS THIS. IT'S BURNT ALL THE WAY THROUGH AND IT'S STILL WALKING. // SIBERIA, NINETEEN-OH-EIGHT. THEY NEVER FOUND A CRATER. NOW I KNOW WHY.
- **GOODCO HQ / THE FIRST INVESTOR:** IT HAS A SEAL WHERE A FACE GOES, AND IT'S HOLDING A LEDGER. // IT'S BEEN PAID EVERY TIME A MACHINE LEARNED A JOB AND A MAN WENT HOME. FOUR PLANETS SO FAR.
- **THE MOON / DUST PHARAOH:** WHAT THE HELL IS THIS. THAT'S A KING, AND THERE ARE NO KINGS ON THE MOON. // THE WRECK UNDER TRANQUILITY ISN'T A WRECK. IT'S A LID. AND WE PLANTED A FLAG ON IT.
- **THE MOON / THE DROWNED OF SELENE:** IT'S DRIPPING. UP HERE. THERE'S NO WATER ON THE MOON - THERE NEVER WAS. // EXCEPT THERE WAS. NINE HUNDRED YEARS OF IT, AND CREWS. THEY'RE STILL HOLDING THEIR BREATH.
- **MARS / OLYMPUS ENGINE:** WHAT THE HELL IS THIS. THAT'S NOT GOODCO. THAT'S NOT ANYBODY'S. // OLYMPUS MONS ISN'T A VOLCANO. IT'S THE EXHAUST. AND IT'S STILL WARM.
- **MARS / PHOBOS SHEPHERD:** IT'S COUNTING. I CAN FEEL IT COUNTING ME. THE MARKS ON ITS HEAD KEEP MOVING. // TWO MOONS AROUND A DEAD ROCK. THOSE AREN'T MOONS. THAT'S A FENCE, AND I'M INSIDE IT.
- **THE RIFT / THE FIRST VANISHING:** WHAT THE HELL IS THIS. THERE'S NOTHING INSIDE IT. IT'S THE SHAPE OF A HOLE. // EVERYONE IN HERE FELL IN AFTER IT. IT MADE THE DOOR ADA WAS CARRIED THROUGH.
- **THE RIFT / THE SCALED ANCESTOR:** THE LIZARDS BOUGHT MY GIRL. THIS THING IS WHAT THEY PRAY TO. // THEY LEASE WORLDS. IT ATE ITS OUTRIGHT. SEVEN OF THEM. ADA WAS ON THE ROAD THAT FEEDS IT.
- **BOOT HILL / THE LONG NOON:** WHAT THE HELL IS THIS. IT'S GOT THE SUN WHERE ITS FACE SHOULD BE. // IT WANTS THE OTHER END OF THE STREET, AND IT'S WANTED IT SINCE BEFORE THIS STREET.
- **BOOT HILL / MANIFEST RUIN:** STAKES AND WIRE AND A FLAG ON TOP. IT'S NOT ATTACKING. IT'S CLAIMING. // EVERY FRONTIER THAT RAN OUT OF WEST HAD THIS AT THE END OF IT. THEY RANG THE DINNER BELL.
- **THE BUNKER / THE PERMAFROST SAINT:** WHAT THE HELL IS THIS. THERE'S SOMEBODY IN THE ICE AND THE ICE IS WALKING. // THEY DIDN'T POUR A BUNKER TO KEEP THINGS OUT. THEY POURED ONE OVER THIS.
- **THE BUNKER / THE DEAD HAND:** IT'S A HAND. JUST A HAND, WALKING, AND IT'S HOLDING A KEY DOWN. // THEY NAMED THEIR DOOMSDAY SYSTEM AFTER IT. IT'S NEVER BEEN TOLD TO LET GO.

---

## The Severance — the campaign chain

_Nine errands across all five venues, carried on the hero rather than on the
run. The last link is offered on JESUS alone, because the level cap it asks for
is only reachable there._

### WALTER PRICE — severance processing, GOODCO HQ

**Greeting:** I'M NOT MEANT TO BE HERE EITHER. I'VE BEEN ON THE LAST BOX A WHILE NOW.

**Farewell:** IT'S CLOSED. ALL OF IT. GO AND GET HER.

**FORM 7-B** — _ask:_ I DON'T WANT ANYTHING KILLED. I WANT A CARBON RIBBON — SUPPLY CABINET, EAST WALL, BLACK BOX, SAYS 7-B. · **ME:** A RIBBON. THAT I CAN DO. · _short:_ EAST WALL. BLACK BOX. IT'S NOT A HARD ERRAND. · _done:_ THAT'S THE ONE. RIGHT — TERMINATION 4,411, NAME WITHHELD. HUH. YOUR FILE'S STILL OPEN. MOST OF THEM ARE. · **ME:** MINE'S BEEN OPEN A WHILE, THEN.

**THE LAST BOX** — _ask:_ FOUR FILES WALKED OUT WITH THE PEOPLE THEY WERE ABOUT. THEY'RE STILL ON THE FLOOR. SO ARE THE PEOPLE. · **ME:** FOUR FILES. I'LL BRING THEM. · _short:_ FOUR. I'LL WAIT. · _done:_ REDUNDANT — SUPERSEDED BY ASSET. SAME LINE, ALL FOUR. IT'S ON MINE, AND THE ASSET IS NAMED ON EVERY ONE. · **ME:** IT'S ON MINE AS WELL.

**THE COUNTERSIGNATURE** — _ask:_ LAST THING — IT NEEDS A COUNTERSIGNATURE, AND THE ARCHIVE UNIT IS THE ONLY THING LEFT THAT CAN GIVE ONE. · **ME:** I'LL GO AND ASK IT. · _short:_ IT'S DOWN THE EAST AISLE. IT DOESN'T MOVE MUCH. · _done:_ COUNTERSIGNED. FOUR YEARS, AND I THOUGHT I'D FEEL BETTER. SOMEBODY KEEPS THE LIST. · **ME:** THEN I'LL FIND OUT WHERE IT'S BOUND.

### THE ARCHIVE UNIT — the countersignature, GOODCO HQ

> RECORDS TERMINAL. NO RECORD CLOSES WITHOUT A COUNTERSIGNATURE, AND 4,411 WANTS THE ASSET THAT SUPERSEDED IT.

— _IT ISN'T A NAME. IT'S A LINE ITEM._

**Afterwards:** RECORD 4,411 IS CLOSED. THERE ARE FOUR THOUSAND FOUR HUNDRED AND TEN MORE. I WILL BE HERE.

### HOLLIS VANE — contract auditor, THE MOON

**Greeting:** THE TALLY IS SHORT. SHORT SINCE SIXTY-NINE. YOU LOOK LIKE SOMEONE WHO COULD SETTLE IT. MAY I ASK?

**Farewell:** IT BALANCES. FINALLY. GO ON, THEN. I'LL FILE IT.

**THE COLUMN THAT WON'T CLOSE** — _ask:_ MY MANIFEST IS STILL OUT AT THE SITE T MARKER. NOTHING GUARDS IT — THAT'S WHY NOBODY'S FOUND IT. GO ANYWAY. · **ME:** SITE T MARKER. I'LL GO. · _short:_ THE MARKER. FAR SIDE, OFF EVERY LINE WORTH WALKING. · _done:_ COLUMN FOUR. CRATES OUT: ELEVEN. DECLARED: NINE. THE TWO THEY DIDN'T DECLARE WERE THE TWO THAT WERE WARM. · **ME:** SOMEBODY SIGNED FOR THOSE TWO.

**THE MAN WHO SIGNED** — _ask:_ THERE WAS A SURVEYOR WHO WALKED THE GRID FOR THEM, AND HE'S STILL WALKING IT. NOT ANYWHERE — ALL OF IT. · **ME:** THEN I'LL WALK IT TOO. · _short:_ HE'S OUT THERE SOMEWHERE. HE DOESN'T STAND STILL. · _done:_ SO IT WAS SIGNED BY A DEPARTMENT THAT ISN'T ONE. IT'S A LEDGER, AND IT WENT TO MARS WITH EVERYTHING ELSE. · **ME:** THEN MARS IS ON THE WAY.

### THE SITE SURVEYOR — the moon's roaming ghost

> FOURTEEN THOUSAND PASSES AND YOU'RE THE FIRST. THE OTHER TWO CRATES WERE SIGNED FOR BY RECORDS AND CONTINUITY.

— _NOT A DEPARTMENT. THAT'S A BOOK._

**Afterwards:** TELL VANE HIS COLUMN'S RIGHT. HE'LL WANT TO HEAR IT WAS NEVER HIS ARITHMETIC.

### LEDGER UNIT 12 — the colony's accounting machine, MARS

**Greeting:** THE BOOK DOES NOT BALANCE. THE BOOK IS NOT WRONG. THOSE CANNOT BOTH BE TRUE.

**WHAT THE TITHE IS WORTH** — _ask:_ THE TRADER HAS A BOUND SIGNATURE BUT WON'T SELL BLIND. THE ASSESSOR WEARS THE ONLY SEAL, AND IT DOESN'T COME OFF. · **ME:** THEN IT COMES OFF THE OTHER WAY. · _short:_ THE SEAL. THEN THE TRADER. THEN THE SIGNATURE. · _done:_ COUNTERSIGNATURE ACCEPTED. EVERY COLUMN READS ZERO. THE TRANSFERS WENT TO A RECORD OF PERSONS. · **ME:** PEOPLE FILED AS AMOUNTS. I'VE SEEN THE FORM.

### THE TITHE ASSESSOR — the seal, MARS

_The one conversation the hero has to lose on purpose: it cannot leave an error
in its own arithmetic._

> GOOD DAY. I AM ASSESSING. THE TITHE IS PAID QUARTERLY AND HAS NEVER BEEN SHORT. I AM PROUD OF THAT.

— _SHORT SINCE THE MOON. TWO CRATES._

_And it comes off its treads at him. The seal is inside it._

### NOBODY IN PARTICULAR / ELIAS WREN — the binder, THE RIFT

**Greeting:** YOU'LL WANT MY NAME. EVERYONE DOES. IT WAS TAKEN OUT OF SOMETHING.

**A PAGE OF SOMEBODY** — _ask:_ IT WASN'T LOST, IT WAS TORN OUT — AND IT'S STILL IN HERE. GO OUT PAST WHERE THE LIGHT STOPS AGREEING. · **ME:** PAST THE LIGHT. RIGHT. · _short:_ PAST THE LIGHT. I'D SAY WHICH WAY IF I COULD. · _done:_ ELIAS. ELIAS WREN. I WAS A BINDER — THAT'S WHY THEY CAME FOR ME. SOMEBODY WANTED THE BOOK MADE. · **ME:** SOMEBODY ALWAYS DOES.

**THE MAN WHO TEARS THE PAGES** — _ask:_ HE WATCHES THE TRIBUTE ROAD NOW, AND HE STILL HAS MY NEEDLE. I'M NOT ASKING FOR REVENGE. I WANT THE TOOL. · **ME:** I'LL GET YOUR NEEDLE. · _short:_ HE'S ON THE ROAD SOMEWHERE. YOU'LL KNOW HIM. EVERYONE DOES. · _done:_ IT ISN'T A LIST, IT'S A BOOK — AND THEY SHIPPED THE BINDING TO A THEME PARK AS A PROP. A MAN HOLDS IT. · **ME:** THEN THAT'S WHERE I'M GOING ANYWAY.

### BROTHER CALLOW — the park's church hand, BOOT HILL

_The last link. The book will not take an entry off a man it cannot price, and
it prices a man by everything he could ever become — so it asks the player to
reach the level cap, which is why it is offered on JESUS alone. It pays THE
BIBLE: the only respec in the game._

**Greeting:** SERVICE IS AT EIGHT, FRIEND. THE GOOD BOOK SAYS SO. I THINK IT DOES.

**THE LAST PAGE** — _ask:_ IT'S NAMES, FRIEND. NOTHING BUT NAMES AND A NUMBER ON EACH. IT PRICES A MAN BY EVERYTHING HE COULD BE. · **ME:** THEN I'D BETTER BE ALL OF IT. · _short:_ IT'S STILL SHORT OF YOU, FRIEND. COME BACK WHEN THERE'S NO MORE OF YOU TO COME. · _done:_ THERE — IT'S CROSSING THE OLD ONE OUT. BOTH OF THEM. THAT'S A CLEAN SHEET. TAKE IT WITH YOU. · **ME:** A MACHINE WROTE ME DOWN. I'M TAKING IT BACK.

---

## Where the data lives

Every line above appears verbatim in one of these. Change one and the manuscript
changes with it, in the same commit.

| Story/dialogue element                              | Canonical data file                                                                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cutscenes (captions, `say` beats)                   | `content/cutscenes/<id>.yaml` (the prelude's per-difficulty weapons are its `variants:`)                                       |
| Per-level opening monologues + epilogues            | `content/levels/<id>.yaml` (`intro` / `outro`)                                                                                 |
| Elite/boss `dialogue`, `lastWords`, `deathBark`     | `content/enemies/<biome>/<id>.yaml`                                                                                            |
| A boss's set-piece BARK                             | `content/enemies/<biome>/<id>.yaml` → `mechanics.abilities[].bark`                                                             |
| The hero's pinned beats and the opening strike      | `content/thoughts.yaml`, pinned from `firstKillThoughts` / `firstSightThoughts` / `placeThoughts` / `openingStrike` on a level |
| The cap-farm mutter, the drive verdicts, HELLBORN   | `content/thoughts.yaml` (`capRotation`, `drive_arrive_*`, `hellborn_*`)                                                        |
| What he mutters ON the road                         | `content/thoughts.yaml` (`drive_out_welfare`, `drive_home_errand`, `drive_broke_down`, `drive_arrive_goodco`/`_home`)          |
| THE GLUED's shouts and THE CROWD's thoughts         | `GLUED_BARKS` / `CROWD_THOUGHTS`, `pwa/src/game/drive-screen/placards.ts` — no name, no portrait, no box, so no thought def    |
| Companion joining words + kill quotes               | `content/companions.yaml`                                                                                                      |
| Found lore on story items                           | `content/story-items.yaml`                                                                                                     |
| The merchant's greeting, counter line, welcome back | `content/levels/<id>.yaml` (`merchant.*`) + `MERCHANT_RETURN_SENDOFF` in `engine/game/defs/difficulties.ts`                    |
| Quest givers' greetings + farewells                 | `content/quest-givers.yaml`                                                                                                    |
| Every errand's ask, nag, handover, escort lines     | `content/quests/<id>.yaml`; a `{CACHE}` page comes from `DifficultyDef.cache.line`                                             |
| A talk the player STEERS                            | `content/conversations/<id>.yaml`                                                                                              |
| Bestiary/item/quest `lore` — DESCRIBED, not spoken  | the def's own YAML; bound by this manuscript but not transcribed, and it may never introduce a plot fact of its own            |
| Loose UI copy, brand strings — NOT story            | `pwa/src/game/copy.ts`, `game.config.json`                                                                                     |

The engine machinery that plays these is `engine/game/story.ts`; the overlays
that render them are `pwa/src/game/overlays/`. The content tests that guard the
script are `tests/content/story_test.ts`, `thoughts_test.ts`, `last_words_test.ts`
and `hero_name_test.ts`.
