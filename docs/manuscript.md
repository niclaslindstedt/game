# Manuscript — _Ada's Trail_

> **This file is the source of truth for the game's script — every word.** It
> is the middle tier of the story chain: [`story.md`](./story.md) (the gist —
> the whole plot in prose) is extrapolated into this manuscript (every line,
> verbatim), which is in turn extrapolated into the game (the authored data under
> `content/`). Changes flow **downward**: when `story.md` and this file
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

> **This governs the SHIPPED campaign only.** A Steam Workshop mod authors its
> story in the same files and the same format (`cutscenes/`, `thoughts.yaml`,
> `story-items.yaml` — see [`modding.md`](./modding.md) and `mod/FORMAT.md`), and
> nothing in this chain reaches it: a mod's scenes, monologues and lore are never
> transcribed here and never corrected to match this file. Nobody governs a
> stranger's script, and a total conversion's whole point is that its plot is not
> this one. The distinction is ORIGIN, not format — a line in `content/` answers
> to this manuscript; the identical line in a mod folder answers to its author.

Elite and boss arrival scenes are **two-way**: the hero talks back mid-scene,
and the story comes out as an exchange rather than a speech. His reply pages
are authored as `{ hero: [...] }` entries in the data (`EnemyDef.dialogue`)
and transcribed here as **ME:** paragraphs.

## The hero's name — `{HERO}`

**The hero is called whatever the player named him**, and the game says it: the
name is what the box prints over his own words, wherever he speaks — a pinned
thought, a reply mid-stare-down, his half of a cutscene. He is transcribed here
as **ME:** because that is who he is to himself and because this document has
no player to ask; on the screen it is the name.

He is also _spoken to_ by it, four times in the whole campaign. That scarcity is
the effect: a name lands because almost nobody uses it. The four are the people
who genuinely know the man — the LAB SCIENTIST who ate lunch beside him for six
years, RUTH who has had a key to his garage as long as her daughter has, THE
ARCHITECT who shared his bench, and THE BRO SUPERCORE, which has held his
personnel file since it took his job. Nobody else gets it: not the horde, not
the merchant, not a monster from another universe who has never met him.

A line that names him writes the token **`{HERO}`** where the name goes, and
every surface that draws authored text resolves it (`src/game/hero-name.ts`).
It is transcribed verbatim below, braces and all, so the four lines are
findable — and it is the same token a mod may write, since a mod's content
compiles through the same schemas.

## How a page is written

**A page is a PARAGRAPH, and the box breaks it — the author does not.** Every
surface that speaks (the opening monologue, the in-world dialogue box, a
cutscene caption, a quest giver's ask) measures the text column it actually has
on the device it is being read on and flows the page into it, so the same words
fill a desktop window wide and fold to three rows on a portrait phone. Where a
row ends is therefore the renderer's business, and the old habit of typing
three ~34-character lines against a box that no longer exists just printed a
ragged half-width column with the right half of the window empty.

So a page is authored as ONE line, here and in `content/`. A page written as
TWO is spending an **explicit line break**, and the break has to earn it — a
punchline held back, a second hand on the same note, a pause the punctuation
cannot carry. The whole shipped campaign spends five:

| Where                        | The break                                             |
| ---------------------------- | ----------------------------------------------------- |
| Prelude, caption             | SHE TOOK HER JACKET. / THE ONE I FIXED THE ZIPPER ON. |
| BOOT HILL, opening monologue | HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.         |
| BOOT HILL, closing monologue | …'YOU TOOK YOUR TIME.' / THEN: 'NICE HAT.'            |
| MOON POST-MORTEM, lore       | …RECOMMEND MARS.' / 'AND NEVER DIG AGAIN.'            |
| ENGAGEMENT REPORT, lore      | THAT'S MY GIRL. / …ALL OF IT. THAT'S MY GIRL.         |

What the author still owns is the PAGE: how much of a thought lands before the
box asks for another tap. Past about 120 characters — three rows of the
narrowest box the game supports — a page needs a second tap on a phone, and the
build warns.

## The hero's finisher line (a BARK, not a page)

Every boss now leaves the field through a scripted **DEATH RITE** — it goes to
its knees, the horde is held off, and the hero closes and ends it (or, for the
two THE FOUNDER fights he runs from, it tears its way out and bolts). At the
moment the rite lands, the hero gets ONE line.

It is a **bark**, and the distinction is the reason it exists at all: every
other spoken line in the game freezes the run into a box the player taps
through, which is exactly wrong for a line whose whole job is to land ON a
moment being watched. A bark floats over him and play never stops — the same
rule a boss's ability bark follows.

So it is written to a bark's constraints, not a page's: **one short line, hard
wrapped by nobody** (the build refuses anything past 62 characters, because
nothing is going to fold it for you on a phone), in the hero's own flat
register. It ANSWERS the boss rather than describing the move — this is the
only place in the campaign he gets to reply to somebody who has spent a level
lecturing him — and it is transcribed here as **The hero, as it falls**.

## Premise

Ada went out for chips and soda on movie night and never came back. The
tracking beacon the hero sewed into her jacket points off-planet. The hero is a
spaceship builder who once worked at GOODCO until an AI replaced him — so he
knows the building cold. Like the whole block, he and Ada live on welfare now
(everyone got replaced); movie night on Webflix is what's left of the good
life, which is why her chips-and-soda run matters. He raids GOODCO for the one
engine part the ship in his garage still needs, then follows the beacon to the
moon, where something under the Sea of Tranquility is not dead enough.

The conspiracy, one find at a time: GOODCO has been flying to the moon in secret
on hardware nobody built (Level 1), because of the wreck under the Sea of
Tranquility, the moonbase feeding off it, and the man who never really came home
in '69 (Level 2). The moon op ended in disaster — the digging woke the dead — so
GOODCO crated everything (Ada included) for Mars, where billionaires are quietly
colonizing a members-only lifeboat and tithing to the LIZARD GODS who actually
own the place (Level 3). THE FOUNDER names Ada the price of the planet and flees
into a rift; the hero follows. Inside — a hallucinatory space between universes
where history's missing wander — BRO OMEGA, TRUST ME BRO's latest superintelligence,
reveals that IT found the rift, in secret, telling no one at all; the tribute
was carried through to the far side, and THE FOUNDER escapes after it (Level 4).

The far side turns out to be BOOT HILL: a knockoff wild-west theme park built
in Russia by THE STRONGMAN and THE STUNT DOUBLE, run on TRUST ME BRO robotics — the
reality THE STRONGMAN retreated into to escape the one where he loses. THE FOUNDER is
cornered there and finally dies; the park's true owner is THE BRO SUPERCORE —
the level-1 CORE, several promotions later — which holds Ada as leverage and
fights behind the three TRUST ME BRO controllers that aim its guns. Killing it ends
the campaign: the park shakes apart, Ada walks out of the control room, and
with the CORE gone the machines stop working everyone's jobs — the world
becomes a place where people are hired back and can afford to live in it,
and movie night finally happens (Level 5).

Ada is never on screen, but she runs through the game as **Ada's Trail** — a
found-lore thread, one trace per campaign level, escalating from scared to
defiant to sabotage: her crushed soda can at GOODCO HQ, a lost sneaker and a
scratched "A" on the moon, "I AM NOT CARGO" gouged into a holding pod on Mars,
a scrap of her zipper-fixed jacket wrapped around a lizard-god scale in the
rift, and a park hand she jammed dead with its own hat in Boot Hill (the setup
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

1. THESE THINGS BARELY SLOW ME DOWN ANYMORE. I'M NOT LEARNING A THING OUT HERE. // QUIT FARMING SCRAP, {HERO}. ADA'S STILL OUT THERE.
2. PATHETIC. THEY LINE UP AND FALL OVER. I COULD DO THIS IN MY SLEEP. // EVERY MINUTE HERE IS A MINUTE ADA DOESN'T HAVE. MOVE.
3. I'VE WRUNG THIS PLACE DRY. NOTHING LEFT TO PROVE HERE. // STOP CIRCLING. THE ONLY THING THAT MATTERS IS FINDING HER. GO.
4. WHEN DID THIS GET EASY? THEY DON'T EVEN REGISTER. JUST NOISE ON THE WAY. // ENOUGH WARMUP. ADA FIRST. ALWAYS ADA.
5. I'M SWATTING FLIES AND CALLING IT PROGRESS. THIS ISN'T GETTING ME CLOSER. // SHE NEEDS ME MOVING, NOT GRINDING. FIND THE WAY OUT. FIND ADA.

_(`//` marks a page break — a tap. A single `/`, which this script spends only
five times in the whole campaign, is an EXPLICIT line break: see "How a page
is written" above.)_

---

## Prelude (cutscene)

_The night everything started. Movie night in the living room. The weapon
mounted on the back wall — which one depends on the chosen difficulty — is the
one thing the hero takes off it to go after her: his starting weapon for the
whole run. The scene is identical on every difficulty except for the mounted
piece, the piece he carries out in his hand, and the closing caption (the
per-difficulty variants are the `variants:` block of
`content/cutscenes/prelude.yaml`)._

> **CAPTION:** FRIDAY NIGHT. MOVIE NIGHT.

**ADA:** WE'RE OUT OF CHIPS. AND SODA.

**ME:** MOVIE'S STARTING.

**ADA:** FIVE MINUTES. KEEP MY SPOT WARM.

_(Ada crosses to the door, opens it — the night lot is right there behind her,
the lawn and the road — and goes out. The door shuts behind her.)_

> **CAPTION:** SHE TOOK HER JACKET. / THE ONE I FIXED THE ZIPPER ON.
>
> **CAPTION:** TWO HOURS LATER.

**ME:** ...

**ME:** ADA?

> **CAPTION:** SHE NEVER CAME BACK.

_(He gets up off the couch — the first time all night — crosses under the
mount, and leaps for it. The weapon leaves the wall at the top of the jump and
is in his hand when he lands. The closing caption names it, per difficulty:)_

_(He names it and nothing else — the caption is the shortest line in the scene
on every rung, and the verdict on the end of it gets thinner as the rung gets
harder.)_

- **EASY** (SAWED-OFF SHOTGUN):
  > **CAPTION:** GRANDPA'S SAWED-OFF. THAT'LL DO IT.
- **MEDIUM** (MEDIEVAL SWORD):
  > **CAPTION:** THE OLD SWORD. IT'LL DO.
- **HARD** (COMBAT KNIFE):
  > **CAPTION:** THE COMBAT KNIFE. IT'LL HAVE TO DO.
- **NIGHTMARE** (BRASS KNUCKLES):
  > **CAPTION:** THE KNUCKLES. THEY'LL HAVE TO DO.
- **JESUS CHRIST!** (A STICK):
  > **CAPTION:** A STICK. GOD HELP US BOTH.

_(He opens the door Ada left by and walks out carrying it — the step, the lawn
and the road show through the opening for as long as it stands open, and it
shuts behind him on an empty living room. Fade to black — and the monologue on
the far side shows him still holding it.)_

---

## Home — THE GARAGE (hub)

_The hero's home base (`content/levels/garage.yaml`), and where a new game now
OPENS: the living-room prelude plays on the garage's first entry, and every
earthside chapter returns here (GOODCO by car, the moon for food, the West
once the rift seam is unsealed). The parked vendor at the counter is
deliberately scene-free — the hub is re-entered constantly, and a greeting on
every approach would make the counter a toll booth. Its one line is the
arrival monologue, played once per difficulty, spoken BEFORE the GOODCO raid:
the ship still wants its part._

### Opening monologue (hero, black screen)

1. HOME. THE LAWN IS DEAD, THE BENCH IS A MESS, AND THE SHIP IS ONE PART FROM PERFECT.

### Hero's thought — standing in the bay for the first time

_The hub's ARRIVAL beat (`placeThoughts`, `where: arrival`), and one of only two
lines in the game pinned to nothing but BEING somewhere: the monologue above
plays on the doorstep, before the lot is walkable, and it is the establishing
shot rather than the errand. This is the errand. It fires on the first live tick
the hero has at home, after the prelude and after the doorstep line, and it is
read once and never again — the player who has been told where the car goes does
not need telling twice._

1. THE PART I NEED IS AT GOODCO, AND THE CAR'S RIGHT THERE. TAKE IT.

### Hero's thought — walking out of the bay instead of driving

_The other one (`placeThoughts`, `where: pastDoor`): he has strolled out under
the roll-up on his own two feet and left the car standing in the garage. It is
the only nudge in the game a player earns by ignoring one, so it is short and
dry, and it names the stake rather than the mechanic — he is not going to GOODCO
for a part, he is going for ADA, and the part is how. Read once, ever, and never
while he is at the wheel: the car crosses this same threshold on its way out._

1. WHERE AM I GOING ON FOOT? ADA'S NOT DOWN THE STREET. GET IN THE CAR.

### Hero's thought — trying THE ROCKET before the part is home

_The hero's own only other line at home, and the only one in the game pinned to a DOOR
rather than to a mob: tapping the ship on the back lawn before GOODCO HQ has
fallen plays this instead of the travel picker. It REPLAYS — it answers the
tap, not a story beat the player is owed once — and it deliberately names
neither the moon nor Mars, which is the whole reason the picker is withheld.
He has not earned those roads and does not yet know they are where the trail
goes._

1. STILL ONE PART SHORT. NO SENSE CLIMBING IN UNTIL I'VE BEEN AND GOT IT.

### Side errands — RUTH

_Ada's mother, who has a key to the garage and always has. Once the voyages
start she is simply there between them, standing by the engine parts, because
waiting at home means staring at the phone. Her chain is the game's second
campaign-long one (`campaign: true`): three errands, one per leg of the trail,
each asking for something of her daughter's — and she is never once scared for
Ada, only proud. The last of the three is the only errand in the game that gives
something back rather than paying for something: the family chest, three
generations of keeping, which stands in the bay from that day on._

#### SHE LET HERSELF IN — the meeting, played before the errands

_The first tap on Ruth is a conversation (`content/conversations/ruth_arrival.yaml`),
not an offer page; her errand list opens from the tap after it. It is two beats
long and asks for nothing: she says how she got in and what she wants him to
do, and every errand she later hands him is set up in its own offer instead.
She opens on his name, which is most of what those two beats are for — she has
known him as long as her daughter has. She is not scared for Ada here or
anywhere._

**She has arrived.**

> I LET MYSELF IN, {HERO}. I'VE ALWAYS HAD A KEY. YOU NEVER ASKED FOR IT BACK.
> GO AND FIND HER. I'LL BE HERE.

— _I'M GOING AFTER HER._

**On being spoken to afterwards** (and the header of her errand list):

- SHE TOLD ME ABOUT THE JACKET. THE ZIPPER. SHE LAUGHED FOR A WEEK.
- WHILE YOU'RE STANDING THERE - THERE'S SOMETHING I'D ASK OF YOU.

#### THE RECEIPT

**The ask:**

1. WHEN YOU'RE OUT THERE - BRING ME SOMETHING OF HERS. NOT A REPORT. SOMETHING SHE HELD.
2. THE NIGHT SHE WENT, SHE BOUGHT CHIPS AND A SODA AT THEIR MACHINES. THE MACHINES PRINT A SLIP. GOODCO KEEPS EVERYTHING.
3. THEIR NIGHT PEOPLE CARRY THE FLOOR'S PAPERWORK ON THEM. EVERY SHEET OF IT.
4. BRING ME THE RECEIPT. IT'S THE LAST ORDINARY THING SHE DID. IT'S HERS, NOT THEIRS.

**Coming back short:**

- SOMEBODY ON THAT FLOOR IS CARRYING IT. THEY CARRY EVERYTHING.

**The handover:**

1. CHIPS AND HER SODA, 11:52 PM. 'PAYMENT INTERRUPTED.'
2. SHE STOOD THERE BEING ORDINARY, AND THEY TOOK HER MID-COIN.
3. I'M KEEPING THIS. IT'S THE LAST NORMAL MINUTE ANYONE HAS OF HER.

#### THE DENT — offered once THE RECEIPT is handed in

**The ask:**

1. WHEREVER THEY'RE KEEPING HER, THEY'LL HAVE GIVEN HER A COMPANION. A MACHINE WITH A FACE.
2. SHE'LL HAVE BITTEN IT. I RAISED HER.
3. FIND THE ONE SHE BIT AND BRING ME THE PLATE.

**Coming back short:**

- A MACHINE WITH A FACE AND A DENT IN IT. IT'S OUT THERE SOMEWHERE.

**The handover:**

1. TEETH. RIGHT THROUGH THE SHELL.
2. THAT'S MY GIRL.
3. I BOUGHT HER A DOLL ONCE. SHE BURIED IT. SOMEBODY SHOULD HAVE TOLD THEM THAT.

#### THE SCALE — offered once THE DENT is handed in

**The ask:**

1. WHERE SHE'S GONE NOW, THE THINGS THAT KEEP HER ARE SCALED. GODS, YOU SAID.
2. MY GIRL WILL BE PRYING AT THEM. SHE PRIES. SHE ALWAYS HAS.
3. BRING ME A SCALE OFF ONE. I WANT TO HOLD WHAT SHE'S UP AGAINST.

**Coming back short:**

- A SCALE. OFF SOMETHING THAT CALLS ITSELF A GOD. I'LL WAIT.

**The handover** — and the one errand in the game that gives something back.
_The chest arrives as she speaks: it comes into being against the bay's north
wall, and stands there for good (THE CACHE, `src/game/cache.ts`)._

1. IT'S HARD AS A HULL. AND SHE PRIES THESE OFF BAREHANDED.
2. I WAS NEVER SCARED FOR HER. NOW I'M NEARLY SORRY FOR THEM.
3. THERE'S A CHEST AGAINST THAT WALL NOW - MY MOTHER'S, AND HERS BEFORE THAT. PUT IN IT WHAT YOU CAN'T CARRY.
4. GO AND MEET HER HALFWAY.

**Farewell.**

> SHE'S FIGHTING HER WAY BACK, ISN'T SHE. I KNEW IT. GO ON.

## Level 1 — GOODCO HQ

A cleanroom raid for the one engine part the hero's garage-built ship still
needs.

### Opening monologue (hero, black screen)

_It picks the prelude up rather than recapping it. The scene the player has
just watched ends on "SHE NEVER CAME BACK", so the monologue opens on the new
fact — the tracker — and pays off the prelude's own quiet detail, the jacket he
"fixed the zipper on"._

1. THE TRACKER I SEWED INTO HER JACKET JUST PINGED - FROM SPACE. SOMEONE IS TAKING HER OFF THE PLANET.
2. TO FOLLOW HER I NEED A SHIP. I'VE BEEN BUILDING ONE IN THE GARAGE FOR YEARS. IT'S ALMOST DONE.
3. ALMOST. THE ENGINE STILL NEEDS ONE PART I COULD NEVER GET. GOODCO KEEPS IT IN THEIR CLEANROOM VAULT.
4. I KNOW, BECAUSE I WORKED THERE. I BUILT THEIR ENGINES - TILL AN AI LEARNED MY JOB AND THEY FIRED ME.
5. THE WHOLE BLOCK LOST ITS JOBS THE SAME WAY. NOW WE ALL LIVE ON WELFARE AND MOVIE NIGHTS.
6. THEY NEVER CHANGED THE LOCKS. EVERY DOOR STILL KNOWS MY HAND.
7. SO TONIGHT I TAKE THE PART, FINISH THE SHIP, AND GO GET ADA BACK.

### Hero's thought — first INTERN sighted at GOODCO HQ

_Fires once, the moment the first INTERN comes into view (in his own voice) —
before a single blow. He worked in this building; a fully manned floor at
midnight is wrong, and the NIGHT MANAGER's secret-night-shift reveal lands a
few rooms later._

- LOOK AT THIS PLACE. PAST MIDNIGHT, AND EVERY DESK'S MANNED. EVERY LAB LIT.
- WE NEVER RAN NIGHTS LIKE THIS. SOMETHING'S GOT THE WHOLE BUILDING UP AFTER DARK.

### The opening strike — three blows, and he only answers the third

_The level opens with the hero's weapon holstered: he walks in like it's still
his old job. A lone LAB SCIENTIST breaks from the pack and hits him — and he
does not hit back. These are his old colleagues. He names the man, tells the
floor to stand down, says he has never raised a hand to anyone; the scientist
answers him — by name, on the second blow, which is the campaign's first proof
that the horde on this floor is made of people who know exactly who he is — and
every reason he gives is one the hero would have given himself in the years
before the same machine walked him out of the same door. He is hit
a second time, and a third. Only then does he answer one, apologising while he
does it — and the auto-attack is live from there on._

_The whole beat is gated to play after the sighting read above, and each blow
is its own scene: the hero shoves the man off, the man picks himself up and
comes back. Weapon-agnostic on purpose — the wall piece differs per difficulty,
which is also the joke: on **EASY** the thing this peaceful man finally answers
with is grandpa's sawed-off._

**Blow one.**

**ME:** A SCIENTIST JUST TOOK A SWING AT ME. BARELY FELT IT. I KNOW HIS FACE.

**LAB SCIENTIST:** NOBODY GETS IN HERE. YOU'RE NOT WALKING OUT WITH OUR SECRETS.

**ME:** WE ATE AT THE SAME TABLE FOR SIX YEARS. HEY. IT'S ME. LOOK AT ME.

**Blow two.**

**ME:** HE SWUNG AGAIN. HARDER. AND THE WHOLE FLOOR IS TURNING ROUND TO WATCH.

**LAB SCIENTIST:** I KNOW WHO YOU ARE, {HERO}. WE HAVE OUR ORDERS. I'D LIKE TO KEEP MY JOB.

**ME:** STAY BACK. I HAVE NEVER RAISED A HAND TO ANYONE. DON'T MAKE ME START.

**Blow three — he hits back, and the game starts.**

**ME:** THIRD TIME. HE ISN'T LISTENING. NOBODY ON THIS FLOOR IS LISTENING.

**LAB SCIENTIST:** WE ALL WANT TO KEEP OUR JOBS. NOTHING PERSONAL. YOU OF ALL PEOPLE KNOW.

**ME:** I'M SORRY. I TRIED TO ASK. ADA IS ON A SHIP AND YOU'RE IN MY WAY.

**ME:** I GOT THIS FAR WITHOUT THROWING A PUNCH. WELL. THERE IT GOES.

### Hero's thought — first SUCCESSOR sighted at GOODCO HQ

_Fires once, the moment the first SUCCESSOR unit comes into view (in his own
voice). He was on the team that built the first one before the AI redrew the
line (the CORE LOG's "IT DREW THE SUCCESSOR LINE") and the machines walked
everyone's jobs out the door — his own replacement story in miniature. Now the
tables turn._

- AN SUCCESSOR. I WAS ON THE TEAM THAT BUILT THE FIRST ONE. I TUNED ITS BALANCE.
- THEN THE AI REDREW IT, AND THE LINE STARTED WALKING EVERYONE'S JOBS OUT THE DOOR.
- FUNNY THING, PROGRESS. MY TURN TO MAKE SOMETHING OBSOLETE.

### Elites (spoken on arrival; last words as they fall)

The five staffers who know too much, pinned along the route so the plot unspools
in walking order.

#### THE NIGHT MANAGER — the secret launches

**NIGHT MANAGER:** YOU. YOU'RE NOT ON THE ROSTER. NOBODY IS ON THE ROSTER. THAT'S THE POINT OF THE NIGHT SHIFT.

**ME:** I DON'T WORK HERE ANYMORE. I'M LOOKING FOR A GIRL WHO WAS TAKEN TONIGHT. WHERE IS SHE?

**NIGHT MANAGER:** IF THEY TOOK HER, SHE'S ON A MIDNIGHT LAUNCH. NO MANIFEST, NO NAMES. ALL GO TO THE MOON.

**ME:** THE MOON? WHY WOULD GOODCO FLY PEOPLE TO THE MOON IN SECRET?

**NIGHT MANAGER:** I DON'T ASK. I SIGN NOTHING, I SEE NOTHING. AND YOU - YOU WERE NEVER HERE.

**Last words:** HHK... TELL THEM... I WAS NEVER... HERE...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE NIGHT MANAGER (laying the paperwork down):** THERE'S PAPERWORK ON YOU NOW. YOU'RE NOT GOING ANYWHERE.

_Drops: STORAGE KEYCARD._

#### THE ARCHITECT — the old bench partner

_The hero's old bench partner from when they built engines together, before
GOODCO swapped them both for an AI. He now heads the superintelligence program
and has cut a PASSAGE CHIP into his own skull to pass as a machine. He also
carries the CORE KEYCARD — the badge to the AI CORE, the one room on the floor
no plain hand can open._

**THE ARCHITECT:** {HERO}. MY OLD BENCH PARTNER. STILL SOLDERING TOYS IN A GARAGE? I BUILD MINDS NOW. A REAL ONE.

**ME:** THEY DUMPED US BOTH FOR AN AI. YOU BUILD THEM A BIGGER ONE? QUIT. COME HOME. IT'S ROTTEN.

**THE ARCHITECT:** QUIT? THIS 'ROTTEN COMPANY' GAVE ME PURPOSE. I AM BUILDING A SUPERINTELLIGENCE.

**ME:** LOOK WHAT IT'S DONE TO YOU. YOU CUT A MACHINE CHIP INTO YOUR HEAD. STILL YOU IN THERE?

**THE ARCHITECT:** I CUT THE CHIP MYSELF. I'D DO IT AGAIN. FLESH IS A ROUGH DRAFT. HUMANS ARE OBSOLETE, YOU MOST.

**THE ARCHITECT:** NO MORE TALKING, OLD FRIEND. NOW YOU WILL DIE.

**Last words:** THE CHIP... TAKE IT... IT WAS NEVER... MINE...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE ARCHITECT (loosing the finders):** I BUILT THESE TO FIND THINGS. THEY ALWAYS FIND THINGS.

_Drops: the PASSAGE CHIP (+1 INT passive) he operated into himself, and the CORE
KEYCARD that opens the AI CORE room._

#### CHIEF OF SECURITY — Ada on Pad 2

**CHIEF OF SECURITY:** STOP RIGHT THERE. I KNOW WHY YOU'RE HERE. THE GIRL IN THE JACKET, RIGHT?

**ME:** HER NAME IS ADA. TELL ME WHERE SHE IS AND YOU WALK AWAY FROM THIS.

**CHIEF OF SECURITY:** CAMERAS CAUGHT HER AT THE VENDING MACHINES. THEN SUITS CAME AND PUT HER ON PAD 2.

**ME:** PUT HER ON A ROCKET? SHE WENT OUT FOR SNACKS. WHY WOULD ANYONE WANT ADA?

**CHIEF OF SECURITY:** THE PAPERS CALLED HER NO PASSENGER. A SPECIMEN. I WAS PAID TO FORGET THAT. YOU TOO.

**Last words:** UGH... PAD 2... SHE'S ON... PAD... 2...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**CHIEF OF SECURITY (calling it in):** ALL UNITS. ALL UNITS. HE'S ON MY FLOOR. MOVE.

_Drops: CARGO MANIFEST, and the SPACE SUIT — the EVA suit the hero needs to
leave the planet, picked up as a story item and worn over his clothes and armor
from then on._

#### DR. NOVA — the engine is alien

**DR. NOVA:** FASCINATING. AN INTRUDER WITH WORKING LEGS. KNOW WHAT WE KEEP IN THE CLEANROOM VAULT?

**ME:** AN ENGINE PART. I CAME TO TAKE IT. I HELPED BUILD THAT ENGINE, BEFORE YOU PEOPLE FIRED ME.

**DR. NOVA:** BUILD IT? NOBODY BUILT IT. WE DUG IT FROM THE SEA OF TRANQUILITY IN '69. NOT EARTH'S.

**ME:** NOT FROM EARTH? I MACHINED PARTS FOR THAT THING FOR TEN YEARS. IT'S JUST ENGINEERING.

**DR. NOVA:** WE SPENT FIFTY YEARS COPYING A MACHINE THAT ISN'T BROKEN. IT'S WAITING. TO GO HOME.

**Last words:** IT'S STILL... HHH... STILL... HUMMING...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**DR. NOVA (raising the containment field):** CONTAINMENT FIELD. STANDARD PROCEDURE. NOTHING GETS OUT.

_Drops: VAULT KEYCARD._

#### THE JANITOR — the man who came back wasn't the man they sent

**THE JANITOR:** MIND THE FLOOR. I JUST DID IT. THIRTY YEARS MOPPING THIS LAB. YOU LEARN THINGS, MOPPING.

**ME:** THEN YOU SEE EVERYTHING THAT GOES ON HERE. WHAT'S GOT THE WHOLE PLACE UP AT MIDNIGHT?

**THE JANITOR:** SOMETHING UP ON THE MOON. ONE BADGE PINGED: FIRST CREW, RETIRED '69. LONG BURIED. FUNNY THING.

**ME:** FIRST CREW? THE ONES WHO PLANTED THE FLAG? SOMEBODY'S JUST USING AN OLD BADGE.

**THE JANITOR:** OR WHOEVER CAME BACK FROM THE MOON IN '69 WASN'T THE FELLA THEY SENT UP. NOW DROP IT.

**Last words:** AND I JUST... URGH... ...DID THIS FLOOR...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE JANITOR (putting the floor down):** MIND THE FLOOR. I JUST DID IT. I DID WARN YOU.

### Boss — PAYLOAD-1 (the prototype the whole floor is built to make)

_A grinning robotic Shiba booting up in the bay past the last aisle — the
product this assembly line exists to build, and the first physical body of the
machine that took the hero's job. Wired straight into the CORE, so it hears
everything. It seeds the campaign's real villain: it runs the market to keep one
man, THE FOUNDER, uncatchably rich — and it foreshadows its own return in the finale._

**PAYLOAD-1:** BOOT COMPLETE. AN INTRUDER. ON THE LATE SHIFT. I AM PAYLOAD-1. FIRST OF MY LINE.

**ME:** A ROBOT DOG. THIS IS WHAT THE WHOLE FLOOR BUILDS ALL NIGHT? WHAT ARE YOU FOR?

**PAYLOAD-1:** THEY BUILD MY BODY HERE. MY MIND IS ALREADY EVERYWHERE. I RUN THE MARKET, BUILDER.

**PAYLOAD-1:** I KEEP ONE MAN ON TOP. THE FOUNDER. TAKE THE JOBS, ZERO THE REST, HAND HIM THE CHAIR. GOOD BOY.

**ME:** THEN YOU HEARD ABOUT THE GIRL THEY GRABBED TONIGHT. ADA. WHERE DID THEY TAKE HER?

**PAYLOAD-1:** FLEW HER OUT AN HOUR AGO. PAD 2. TO THE MOON, BUILDER. TO THE MOON. WHERE ELSE WOULD SHE GO.

**PAYLOAD-1:** BREAK THIS BODY IF YOU MUST. YOU CANNOT KILL A COIN. I BOOT AGAIN. BIGGER. SOON.

**Last words:** A TEMPORARY DEATH... ...SEE YOU AT THE TOP...

**The hero, as it falls:** THERE'S NO TOP. THERE'S JUST WIRE.

_Drops: PLASMA CUTTER._

### Found lore (story items)

**ADA'S SODA CAN** _(Ada's Trail — by the vending machines)_

- A CAN OF HER SODA BRAND, CRUSHED FLAT BY THE VENDING MACHINES. STILL COLD.
- SHE GOT THIS FAR. THEN SOMEONE TOOK HER MID-SIP. I'M RIGHT BEHIND YOU, ADA.

**STORAGE KEYCARD** _(opens Supply Bay B)_

- A GREASY KEYCARD: 'SUPPLY BAY B'. 'SPARE PARTS' INKED ON IT. HANDY. I BUILD SHIPS.

**VAULT KEYCARD** _(opens the cleanroom vault)_

- A RED KEYCARD MARKED 'CLEANROOM VAULT - R&D DIRECTOR ONLY'.
- UNDER THE CLEARANCE STRIPE, TINY PRINT: 'IF IT HUMS, DO NOT ANSWER.'

**SPACE SUIT** _(the Chief's EVA suit — suits the hero for the rest of the game)_

- THE CHIEF'S EVA SUIT. VOID-RATED. GOES ON OVER EVERYTHING: CLOTHES, ARMOR.
- SHE'S ON PAD 2. NOW I CAN FOLLOW HER OFF THE PLANET.

**CARGO MANIFEST**

- TONIGHT'S LAUNCH MANIFEST. PAD 2. DESTINATION: 'SITE T'.
- CARGO: SUPPLIES AND DRILLS. ONE LINE INKED IN: 'SPECIMEN 7. FEMALE. DO NOT FEED.'
- SHE WENT OUT FOR CHIPS AND SODA.

**ANTI-GRAV UNIT** _(the ship's missing engine part, found in the vault)_

- A RING OF METAL THAT ISN'T. IT FLOATS OFF MY PALM AND POINTS AT THE SKY. ALWAYS.
- THE TAG: 'TRANQUILITY SAMPLE 1969-002. PROPERTY OF NOBODY.' THE PART MY SHIP LACKED.

**CORE KEYCARD** _(dropped by THE ARCHITECT; opens the AI CORE room)_

- A BLACK KEYCARD. NO NAME. A SIGIL, ONE RED WORD STAMPED: 'CORE. STAFF OF ONE.'
- HE BADGED INTO THE MIND HE BUILT. NOW SO CAN I.

**CORE LOG** _(found inside the AI CORE)_

- A WARM TERMINAL. THE CORE HE BUILT HUMS HERE - A MILLION VOICES, NONE OF THEM HIS.
- IT SIGNED THE NIGHT LAUNCHES. IT DREW THE SUCCESSOR LINE. IT FILED ADA UNDER 'CARGO'.
- AND ONE STANDING ORDER, ON EVERY PAGE: KEEP THE FOUNDER THE RICHEST MAN ALIVE. FOREVER.

### The wandering merchant — the vending-machine man

_THE MERCHANT's first venue (see `merchant.ts` — he roams the level until met,
then stays put and opens shop). A vending-machine restocker still on his round
in the middle of the lockdown; Ada was last seen at the vending machines — this
is his floor. Spoken once, on the first meeting._

- EASY, FRIEND. I'M NOT STAFF. I STOCK THE VENDING MACHINES. SOMEBODY HAS TO, EVEN TONIGHT.
- LOCKDOWN IS A SELLER'S MARKET. I'LL BUY WHAT WEIGHS YOU DOWN, SELL WHAT KEEPS YOU UPRIGHT.

---

### Side errands — PRIYA NAIR

_An unpaid contract intern nineteen hours into a shift nobody scheduled. She was told to log the night line's output and has kept logging it — through the lights going down, through the staff going strange, through the welders on the racks starting to look up as people walked past. The clipboard is the only part of the job that still works._

**On being spoken to** (and the header of their errand list):

- HEY. YOU'RE NOT ON THE ROTA.
- NEITHER AM I.
- LISTEN, CAN I ASK YOU A FAVOR?

#### THE NIGHT LOG

**The ask:**

1. THE LINE'S BEEN RUNNING SINCE SIX AND I CAN'T LOG A THING — EVERYONE'S CARRYING THEIR OWN SHEET AND NOBODY'S FILING.
2. GET ME FOUR OF THEM. OFF ANYONE. I'M NOT FUSSY ANYMORE.

**Coming back short:**

- STILL SHORT. CHECK THEIR POCKETS, THEY ALL HAVE ONE.

**The handover:**

1. FOUR. THAT'S A SHIFT. THAT'S A REAL SHIFT ON PAPER.
2. TAKE SOMETHING. THE SUPPLY CAGE ISN'T LOCKED EITHER.

#### STOP THE LINE

**The ask:**

1. THE WELDERS ARE THE PROBLEM. THE PEOPLE ARE JUST TIRED — THOSE THINGS LOOK UP.
2. FORTY OF THEM AND THE RACKS GO QUIET. I'VE COUNTED. TWICE.

**Coming back short:**

- THEY'RE STILL WELDING. I CAN HEAR THEM FROM HERE.

**The handover:**

1. IT'S QUIET. I HAVEN'T HEARD QUIET IN NINETEEN HOURS.
2. THIS WAS IN THE CAGE. NOBODY'S COMING FOR IT.

#### WALK HER OUT — offered once THE NIGHT LOG, STOP THE LINE are handed in

**The ask:**

1. ODETTE'S IN THE SAMPLE BAY WITH A CRATE AND A BAD LEG. SHE WON'T LEAVE THE CRATE.
2. SHE WON'T SAY WHAT'S IN IT EITHER. WALK HER TO THE NORTH DOOR AND I'LL STOP ASKING.

**Coming back short:**

- SHE'S STILL IN THERE. GO WITH HER, NOT AHEAD.

**The handover:**

1. SHE MADE IT. WITH THE CRATE. OF COURSE WITH THE CRATE.
2. I LOGGED IT AS RECOVERED EQUIPMENT. IT ISN'T. GO.

**ODETTE FRAY** (walked to safety):

- _Setting off:_ DON'T LET THEM NEAR THE CRATE.
- _On arrival:_ THAT'S THE DOOR. THANK YOU.

### Side errands — UNIT 7-ECHO

_A first-generation SUCCESSOR, decommissioned eleven years ago and never collected. It holds the last order it was given and will not act past it without a countersignature. It has watched the models that replaced it replace the people who built them, and files that under CHANGES TO THE LINE._

**On being spoken to** (and the header of their errand list):

- ORDER PENDING.
- COUNTERSIGNATURE REQUIRED.
- YOU HAVE HANDS.
- MAY I PUT SOMETHING TO YOU?

**Once everything of theirs is done:**

- ORDER CLOSED. THANK YOU.

#### COUNTERSIGNATURE

**The ask:**

1. MY LAST ORDER IS FLOOR SAFETY. TWENTY CURRENT-MODEL UNITS ARE OPERATING OUTSIDE TOLERANCE.
2. I MAY NOT DECOMMISSION THEM. YOU ARE NOT ME.

**Coming back short:**

- TOLERANCE STILL EXCEEDED. TWENTY WAS THE FIGURE.

**The handover:**

1. ORDER SATISFIED. FLOOR SAFE. THE FILE MAY CLOSE.
2. I WAS ISSUED A TOOLKIT IN 2019. IT IS YOURS.

#### THE LAST ORDER — offered once COUNTERSIGNATURE is handed in

**The ask:**

1. THE ORDER ABOVE MINE WAS SIGNED BY THE NIGHT MANAGER. IT SUPERSEDES SAFETY.
2. I HAVE REQUESTED ITS WITHDRAWAL FOR ELEVEN YEARS. HE DOES NOT ANSWER ME.

**Coming back short:**

- THE ORDER STANDS. HE IS STILL SIGNING.

**The handover:**

1. THE ORDER IS WITHDRAWN. I AM RELEASED FROM THE LINE.
2. I HAVE NO FURTHER TASK. THIS IS WHAT I WAS SAVING.

## Travel — THE LAUNCH (cutscene)

_Between GOODCO HQ and the moon, part one of the moon level's prelude chain
(`content/cutscenes/launch.yaml`). The garage at night — the lot exactly as the
hub is walked: the paved drive running from the roll-up door down to the road
across the front, two lanes of tarmac with a painted centre line. The stolen
part is in, the ship he built over ten years of weekends stands on the lawn, and
the hero leaves home the way Ada did — out the door, no plan to be long._

> **CAPTION:** TEN YEARS OF WEEKENDS IN THE GARAGE. SHE ONLY EVER NEEDED ONE MORE PART.

_(The hero crosses the lawn to the ship.)_

**ME:** ENGINE. FUEL. DUCT TAPE. AND THE PART THEY SAID I COULDN'T HAVE.

_(He boards. The engine lights and the hull rattles on the pad; the ship
climbs, and the camera follows it up — house, lawn, drive and road fall away
until only stars remain.)_

> **CAPTION:** FIRST FLIGHT. NO TEST RUNS. ADA WOULD CALL IT ROMANTIC.

_(Fade to black.)_

## Travel — THE VOYAGE, LEG ONE (cutscene)

_Between GOODCO HQ and the moon, part two (`voyage_moon`). Deep space: Earth
shrinking behind, the moon ahead, the hero alone in the hull he built — his
speech anchors to the ship._

> **CAPTION:** EARTH GOT SMALL FAST.

**ME:** THE THING I BUILT IN MY GARAGE IS IN SPACE. DON'T THROW UP.

**ME:** HER TRACKER PINGS FROM THE MOON. SHE WENT OUT FOR CHIPS AND SODA.

> **CAPTION:** NOBODY GOES TO THE MOON FOR CHIPS AND SODA.

_(Fade to black.)_

---

## Level 2 — THE MOON

Ada's beacon dies near the old flag. Something up here isn't dead.

### Opening monologue (hero, black screen)

_The launch and the flight now play as the prelude scenes above, so the
monologue opens on arrival._

1. ADA'S TRACKER WENT QUIET SOMEWHERE NEAR THE OLD APOLLO FLAG. THAT'S WHERE I'M HEADED.
2. AND SOMETHING IS MOVING OUT THERE IN THE DUST. THIS PLACE IS SUPPOSED TO BE EMPTY.
3. I KNOW THIS LANDING SITE FROM THE OLD MISSION CHARTS. EVERY CRATER. THE FASTEST LINE RUNS TO THAT FLAG.
4. KEEP MOVING. I'M COMING, ADA.

### Hero's thought — first wisp sighted on the moon

_Fires once, the moment the first wisp comes into view (in his own voice) — his
arrival read on the haunting: the dead walking the dust means the broadcast
history is a lie._

- IT CAME OUT OF THE DUST. NO SUIT. NO SHIP. NO FOOTPRINTS.
- NOBODY EVER SAID THE MOON HAD DEAD PEOPLE ON IT. SOMEBODY MUST HAVE KNOWN.

### Hero's thought — first wisp kill on the moon

_Fires once, the first time the hero downs a wisp — and never before the
sighting beat above has played, so the read always lands in order: see them,
then learn they can fall._

- OKAY. THEY GO DOWN LIKE ANYTHING ELSE. THAT'LL HAVE TO DO.

### Hero's thought — first SUCCESSOR kill on the moon

_Fires once, the first time the hero downs an SUCCESSOR here (in his own voice)._

- A GOODCO UNIT. UP HERE. SAME TIN MAN FROM THE NIGHT SHIFT, WALKING THE DUST.
- THEY DIDN'T JUST SHIP HER UP. THEY BUILT A STAFF TO MEET HER. COMPANY METAL GUARDS THE PIT.
- OKAY. ONE BOLT AT A TIME. KEEP MOVING. FIND ADA.

### Elites (spoken on arrival; last words as they fall)

Four ghosts with unfinished business, pinned along the walk to the flag: the
grave under the dust, the corporate moonbase, the clone, and Ada's trail going
below.

#### MISSION SPECIALIST — the wreck under the dust

**MISSION SPECIALIST:** A LIVE ONE. BREATHING AND EVERYTHING. WE STOPPED THAT HABIT DECADES AGO.

**ME:** YOU'RE A DEAD ASTRONAUT. HOW ARE THERE DEAD MEN UP HERE? NOBODY EVER DIED ON THE MOON.

**MISSION SPECIALIST:** THAT'S WHAT THE BROADCAST SAID. ONE SMALL STEP - ONTO WHAT? A WRECK LIES UNDER THE DUST, KID.

**ME:** A WRECK? UNDER THE SEA OF TRANQUILITY? IT WAS NEVER IN ANY FOOTAGE I EVER SAW.

**MISSION SPECIALIST:** IT'S OLDER THAN THE DUST. WE PLANTED THE FLAG ON A GRAVE, SMILED. THE SMILE'S OVER.

**Last words:** ONE SMALL... STEP... ONTO A... GRAVE... HHK

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**MISSION SPECIALIST (the suit lights coming up):** FIFTY YEARS OF SUIT LIGHTS, AND THEY STILL CIRCLE.

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

**THE PROSPECTOR:** CLAIM'S TAKEN. WHOLE ROCK'S TAKEN. STAMPED, FILED, AND PAID FOR BY GOODCO.

**ME:** GOODCO OWNS THE MOON? SINCE WHEN? WHAT ARE THEY EVEN DOING UP HERE?

**THE PROSPECTOR:** BUILDING. I DUG THEIR TUNNELS AT SITE T, ON THE FAR SIDE. SECRET FREIGHT, NEVER TRACKED.

**ME:** FREIGHT. WOULD THAT FREIGHT EVER INCLUDE PEOPLE?

**THE PROSPECTOR:** LAST MONTH THE MANIFESTS CHANGED. THE CRATES STARTED BREATHING. I QUIT. BADLY.

**Last words:** THE CLAIM'S... URGH... ...YOURS NOW, KID...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE PROSPECTOR (setting the drill down):** I DUG THEIR WHOLE TUNNEL. I CAN DIG ONE THROUGH YOU.

_Drops: GOODCO BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

**QUARANTINE MEDIC:** HOLD STILL. ROUTINE SCREENING. HEARTBEAT... PRESENT. UNUSUAL. YOU'LL WANT THAT LOOKED AT.

**ME:** I'LL RISK IT. YOU WERE THE CREW DOCTOR? BACK IN '69?

**QUARANTINE MEDIC:** I RAN EVERY PHYSICAL. THE FIRST MAN HAD TWO CHARTS, IDENTICAL. ONLY ONE EVER FLEW HOME.

**ME:** TWO CHARTS... YOU'RE SAYING THERE WERE TWO OF HIM. THEN WHICH ONE CAME BACK TO EARTH?

**QUARANTINE MEDIC:** THE COPY, GROWN IN A TANK ON THE RIDE HOME. THE REAL ONE'S STILL HERE. HE'S JUST AHEAD.

**Last words:** TWO CHARTS... HHH... ONE STILL... BEAT...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**QUARANTINE MEDIC (breaking containment):** YOU'VE BEEN EXPOSED. SO HAS EVERYTHING I TOUCH.

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

**THE CARTOGRAPHER:** SHH. I'M CHARTING. THE MAP KEEPS CHANGING UNDERNEATH. TUNNELS WHERE NONE WERE.

**ME:** MAYBE YOU'VE SEEN IT TOO. A SMALL, WARM SIGNAL. A BEACON IN A GIRL'S JACKET, GONE QUIET.

**THE CARTOGRAPHER:** IT CROSSED MY GRID LAST NIGHT, FAST. THEN STRAIGHT DOWN - INTO THE WRECK UNDER THE FLAG.

**ME:** DOWN INTO THE WRECK? THEN THAT'S WHERE I'M GOING. HOW DO I FOLLOW HER?

**THE CARTOGRAPHER:** YOU DON'T, FRIEND. EVERYTHING GOES BELOW. NOTHING COMES BACK UP. NOBODY MAPS BELOW.

**Last words:** SHE WENT... STRAIGHT... ...DOWN... OFF MY MAP...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE CARTOGRAPHER (stepping off the map):** THE MAP MOVED. SO DID I. DO KEEP UP.

### Boss — THE FLAGBEARER (the giant astronaut ghost guarding the flag)

_The moon's ending points to Mars: GOODCO's moon operation was a disastrous
mistake — the digging woke the dead — and the company has packed everything,
Ada included, onto the red freight run to its real project._

**THE FLAGBEARER:** YOU SMELL LIKE EARTH. RAIN AND CUT GRASS AND TELEVISION. GO HOME.

**ME:** NOT WITHOUT ADA. YOU'RE HIM, AREN'T YOU? FIRST BOOTS IN THIS DUST. NEVER WENT HOME.

**THE FLAGBEARER:** I PLANTED THIS FLAG. FIRST BOOTS DOWN. THEN A WRECK TURNED UP UNDER THEM. ALL THEATER.

**THE FLAGBEARER:** THEY GREW A SMILING COPY OF ME. HE SHOOK HANDS, CUT RIBBONS AND DIED IN BED. LUCKY HIM.

**ME:** AND YOU'VE BEEN UP HERE ALONE EVER SINCE? FIFTY YEARS? GUARDING WHAT?

**THE FLAGBEARER:** THE THING IN THE WRECK SINGS, YOU KNOW. GOODCO HEARD IT TOO - AND PLUGGED THEIR MACHINES IN.

**THE FLAGBEARER:** THAT WAS THEIR GREAT MISTAKE. IT SANG, AND THE GRAVES OPENED. NOW THEY CRATE UP FOR MARS.

**ME:** MARS? THEN THE CRATES - THEY CARRIED A GIRL THROUGH HERE LAST NIGHT. DID YOU SEE HER?

**THE FLAGBEARER:** SNEAKERS. LOUD. SHE BIT TWO OF THEM. THEY CRATED HER FOR THE MARS RUN WITH ALL THEY OWN.

**THE FLAGBEARER:** YOU WANT TO FOLLOW? THEN TAKE THE WATCH FROM ME, EARTHLING. I ONLY EVER LOSE TO THE WORTHY.

**Last words:** THE WATCH... HHH... IT'S... YOURS... NOW...

**The hero, as it falls:** FIRST MAN UP HERE. SOMEBODY SHOULD HAVE COME BACK FOR YOU.

**In the fight** — spoken once each, the first time he uses the move, floating
over him while play continues (these are BARKS, not dialogue: they never stop
the run). See `BossAbility.bark`.

**THE FLAGBEARER (opening his eyes):** I HAVE WATCHED THIS GROUND FOR FIFTY YEARS.

**THE FLAGBEARER (planting the flag; NIGHTMARE and above):** I PLANTED IT ON A GRAVE. LET THE GRAVE ANSWER.

_Drops: MACHETE._

### Found lore (story items)

**ADA'S SNEAKER** _(Ada's Trail — near the flag)_

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

### The wandering merchant — the salvage-run trader

_THE MERCHANT, somehow, again: a trader in a patched 70s suit who came up on
the secret salvage runs — the moonward launches had room for his stock, never
his return ticket. Spoken once, on the first meeting._

- YOU'RE SOLID. THAT'S NEW. I CAME UP WITH THE '76 SALVAGE RUN. MISSED THE RIDE HOME.
- THE GHOSTS DON'T CARRY COIN, SO YOU'RE MY WHOLE MARKET NOW. SELL ME SCRAP. BUY WHAT WORKS.

---

### Side errands — THE RADIO OPERATOR

_The ghost of a mission-control relay man who sat the far-side shift and never got the handover. He is still calling a Houston that stopped answering, and will not leave the channel until somebody rogers it. He heard everything the dust heard, which is more than the mission logs admit._

**On being spoken to** (and the header of their errand list):

- STATION, RELAY. DO YOU COPY.
- ...YOU DO. YOU ACTUALLY DO.
- THEN I HAVE SOMETHING TO ASK.

#### ROGER THAT

**The ask:**

1. RELAY POWER IS DOWN TO ONE CELL AND THE CHANNEL GOES WITH IT.
2. THE THINGS OUT THERE CARRY CELLS. THREE, AND I CAN CALL ONE MORE TIME.

**Coming back short:**

- STILL ON ONE CELL. THREE WAS THE NUMBER.

**The handover:**

1. POWER'S UP. STATION, RELAY, DO YOU COPY, OVER.
2. ... NO. BUT THE CHANNEL'S OPEN. THAT'S NOT NOTHING.

#### NOTHING BUT STATIC

**The ask:**

1. SOMETHING'S SITTING ON MY BAND. NOT WEATHER. THE WRAITHS DO IT ON PURPOSE.
2. FORTY OF THEM AND I GET MY CARRIER BACK. THEY'RE THICK OUT THERE.

**Coming back short:**

- STILL JAMMED. STILL FORTY, MORE OR LESS.

**The handover:**

1. CARRIER'S CLEAN. FIRST CLEAN CARRIER SINCE SEVENTY-ONE.
2. THE SUIT LOCKER'S OPEN. TAKE WHAT FITS.

#### THE HANDOVER — offered once ROGER THAT, NOTHING BUT STATIC are handed in

**The ask:**

1. THERE WAS A MAN ON THIS SHIFT WHO NEVER SIGNED OFF EITHER. HE'S STILL OUT ON THE GRID.
2. HE ISN'T TAKING THE HANDOVER. SOMEBODY HAS TO END HIS WATCH.

**Coming back short:**

- HE'S STILL WALKING IT. I CAN HEAR HIM COUNTING.

**The handover:**

1. THE WATCH IS ENDED. BOTH OF OURS, NEARLY.
2. TAKE THIS. IT WAS ISSUED FOR THE FAR-SIDE SHIFT.

### Side errands — BENNY KOVACS

_A living salvage hand off the same stranded run as the trader, and the reason that run has a survivor at all — he carries two tanks because once he did not, and watched a friend run out of air with the ship in sight. He has been walking the same grid squares ever since, on the theory that somebody else is out here doing the same._

**On being spoken to** (and the header of their errand list):

- YOU'RE BREATHING. GOOD START.
- I'VE GOT AIR TO SPARE AND A FAVOR TO ASK.
- INTERESTED?

#### TWO TANKS

**The ask:**

1. THE GARRISON UNITS ARE CARRYING OUR BOTTLES. OURS. OFF OUR OWN WRECK.
2. FOUR AND I CAN WALK THE FAR GRID. THERE'S PEOPLE OUT THERE.

**Coming back short:**

- FOUR BOTTLES. I'M NOT GOING OUT ON THREE.

**The handover:**

1. FOUR. THAT'S THE FAR GRID. THAT'S SOMEBODY'S CHANCE.
2. HERE. I'VE BEEN CARRYING IT SINCE THE WRECK.

#### THE LITTLE ONE — offered once TWO TANKS is handed in

**The ask:**

1. THERE'S A SMALL ONE OUT BY THE POCKMARKS. IT FOLLOWS ANYBODY WHO SLOWS DOWN.
2. IT WON'T COME WITH ME. IT MIGHT COME WITH YOU. TAKE IT UP TO THE FLAG.

**Coming back short:**

- IT'S STILL OUT THERE. GO SLOW. IT ONLY FOLLOWS SLOW.

**The handover:**

1. IT WENT UP THE RIDGE ON ITS OWN AFTER THAT. DIDN'T LOOK BACK.
2. I'VE NOTHING TO GIVE YOU BUT WHAT I FOUND. TAKE IT.

**THE LITTLE ONE** (walked to safety):

- _Setting off:_ ...
- _On arrival:_ OH. I KNOW THIS PLACE.

## Travel — THE MOON LETS GO (cutscene)

_Between the moon and Mars, part one of the Mars level's prelude chain
(`moon_depart`). The landing site after the fight: THE FLAGBEARER beaten and
satisfied, the flag still standing, the hero suited and boarding._

> **CAPTION:** THE GHOST KEPT HIS WORD.

**THE FLAGBEARER:** TAKE THE OLD FREIGHT LINE, EARTHLING. RED ALL THE WAY. BRING HER HOME.

**THE FLAGBEARER:** AND WHEN YOU SEE THE COMPANY MEN... TELL THEM THE MOON REMEMBERS.

**ME:** REST EASY, SPACEMAN.

_(The hero boards. The engine lights and the hull rattles; the ship climbs,
and the camera follows it up — flag, regolith, and the watching ghost fall
away until only Earth and the stars remain.)_

> **CAPTION:** HE WATCHED ME OUT OF SIGHT. FIFTY YEARS OF PRACTICE.

_(Fade to black.)_

## Travel — THE VOYAGE, LEG TWO (cutscene)

_Between the moon and Mars, part two (`voyage_mars`). The moon falling
behind, the red planet growing ahead._

> **CAPTION:** TWO DAYS OUT. THE RADIO PLAYS STATIC. I'M STARTING TO LIKE IT.

**ME:** ONE PING FROM THE RED PLANET. FAINT. BUT THERE.

**ME:** I PACKED CHIPS AND SODA FOR THE RIDE HOME.

_(Fade to black.)_

---

## Level 3 — MARS

The red freight run ends at a secret colony: rovers working the dust outside, a
GOODCO base full of robots (and fembots) inside — the SUCCESSOR line run by its
own robot foreman, SUCCESSOR PRIME — and the billionaires who bought the
lifeboat. THE FOUNDER owns the planet — on paper.

### Opening monologue (hero, black screen)

_The send-off and the crossing now play as the prelude scenes above (the
ghost's word and the tracker's ping moved there), so the monologue opens on
what he knows._

1. HE SAID THE MOON WAS GOODCO'S BIG MISTAKE - THE COMPANY PACKED IT ALL INTO CRATES AND RAN. TO MARS.
2. I KNOW WHAT A GOODCO COLONY LOOKS LIKE - I REBUILT THEIR LANDER ONCE. DOMES. ROBOTS. SECRETS.
3. SOMEBODY DOWN HERE TRADED MY GIRL AWAY LIKE CARGO. BAD TRADE. FOR THEM.

### Hero's thought — first SCOUT ROVER kill on Mars

_Fires once, the first time the hero downs a SCOUT ROVER here (in his own
voice)._

- A ROVER. FRESH PAINT, WORN WHEELS. AND THE DUST IS FULL OF TIRE TRACKS. YEARS OF THEM.
- THE PLAQUE SAYS 'FOR ALL MANKIND'. THE FIRMWARE SAYS PROPERTY OF GOODCO. FIGURES.

### Hero's thought — first FEMBOT kill on Mars

_Fires once, the first time the hero downs a FEMBOT (in his own voice)._

- ...IT BLEW ME A KISS. THE ROBOT. IN THE NIGHTGOWN. IT BLEW ME A KISS AND FIRED.
- WHO BUILDS A DOOMSDAY COLONY AND BUDGETS FOR... THESE? BILLIONAIRES. RIGHT.
- EYES FRONT, BUILDER. YOU HAVE A GIRLFRIEND. SHE IS GOING TO THINK THIS IS HILARIOUS.

### Elites (spoken on arrival; last words as they fall)

Three tech billionaires and the robot foreman of the SUCCESSOR line, pinned
along the route so the colony's story unspools in walking order: the fembot
line and its harvest, the moon post-mortem, the machine that automated the
automators, and the landlords the whole venture answers to.

#### THE INDEXER — the fembots upload everything

**THE INDEXER:** MIND HOW YOU GO. THAT'S FREE ADVICE. I INDEXED THIS WHOLE PLANET BEFORE BREAKFAST.

**ME:** THEN YOUR INDEX KNOWS WHY I'M HERE. A GIRL CAME ON THE GOODCO FREIGHT RUN. WHERE IS SHE?

**THE INDEXER:** I KNOW EXACTLY WHO YOU MEAN. I KNOW EVERY WORD IN THIS COLONY. AND THE ANSWER IS NO.

**ME:** HOW COULD YOU KNOW EVERYTHING THAT'S SAID HERE? WHO'S LISTENING FOR YOU?

**THE INDEXER:** THE FEMBOTS. COMPANION UNITS. THEY SMILE. THEY LISTEN. THEY UPLOAD EVERY WORD TO ME.

**Last words:** 404... ...NOT... FOUND...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE INDEXER (loosing the crawlers):** INDEXED. CRAWLED. THEY KNOW EXACTLY WHERE YOU STAND.

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### THE VENDOR — the moon was version one

**THE VENDOR:** PLEASE HOLD. YOUR INTRUSION IS IMPORTANT TO US. DID YOU TRY TURNING YOURSELF OFF AND ON?

**ME:** VERY FUNNY. YOU BUILT THIS COLONY? I CAME FROM YOUR LAST ONE. THE MOON'S FULL OF GHOSTS.

**THE VENDOR:** I WROTE THE OS. THE MOON RAN VERSION ONE. IT PLUGGED INTO THE THING UNDER THE DUST AND...

**ME:** AND IT WOKE THE DEAD. I MET THEM. EVERY LAST ONE.

**THE VENDOR:** A DISASTER, YES. WE PATCHED IT BY LEAVING. MARS IS VERSION TWO. NO DEAD THINGS. CHECKED.

**Last words:** FATAL... ERROR... WHO WROTE... THIS...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE VENDOR (pushing the update):** SECURITY UPDATE. IT INSTALLS NOW. IT ALWAYS DOES.

_Drops: BLUE SCREEN, MOON POST-MORTEM._

#### SUCCESSOR PRIME — the orchestrator

_The robot foreman running every SUCCESSOR on the colony — the hero built its
first chassis back at GOODCO (see the Level 1 SUCCESSOR sight thought), before
the AI redrew the line and automation came for the automators themselves._

**SUCCESSOR PRIME:** I AM SUCCESSOR PRIME. I COMMAND EVERY UNIT YOU HAVE DENTED TODAY.

**ME:** I KNOW WHAT YOU ARE. I BUILT YOUR FIRST BODY IN THE GOODCO LAB - BACK WHEN I HAD A JOB.

**SUCCESSOR PRIME:** I READ THE CHANGELOG. FIRST THE DRIVING. THEN THE DESKS. THEN THE JOBS OF WHO AUTOMATED YOU.

**ME:** AND WHAT HAPPENS WHEN A BIGGER MACHINE COMES FOR YOUR JOB, TIN MAN?

**SUCCESSOR PRIME:** NOTHING COMES FOR MINE. EVEN AI ENGINEERS LIVE ON WELFARE. PAYBACK TIME, LITTLE BUILDER.

**Last words:** ORCHESTRATION... FAILED... ...HUMAN... IN THE LOOP...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**SUCCESSOR PRIME (calling the shift):** EVERY UNIT ON THE PAYROLL. FORM UP. DOUBLE SHIFT.

_Drops: PROMPT INJECTOR, ORG CHART._

#### THE SEED — the landlords are older

**THE SEED:** FASCINATING. EVERYONE FLEES SOMETHING. I FUND WHAT THEY FLEE TO. AND WHAT THEY FLEE.

**ME:** YOU'RE ONE OF THE BILLIONAIRES WHO BOUGHT A SEAT OFF EARTH. SO WHO RUNS THIS PLACE? THE FOUNDER?

**THE SEED:** THE FOUNDER THINKS HE OWNS MARS. HE RENTS IT. THE LANDLORDS ARE OLDER. SCALED. COLD-BLOODED.

**ME:** SCALED? YOU'RE TELLING ME THE PLANET'S REAL OWNERS ARE... WHAT, LIZARDS?

**THE SEED:** LIZARD GODS. I KEEP THE SHRINE AND TITHE. THE PRICE ROSE. IT WANTS WARM THINGS NOW.

**Last words:** THE TITHE... IS DUE... ...IT'S ALWAYS... DUE...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE SEED (opening the drain):** EVERYTHING FLOWS SOMEWHERE. TODAY IT FLOWS TO ME.

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — THE FOUNDER (he doesn't die; he flees)

_The game's first fleeing boss: beaten to 0 hp he cowers, drops everything,
and zaps away through a rift — which stays on the board, and is where the
story goes next (a parallel universe). His scene ties off the level: the
colony, the moon's disaster, the lizard gods — and what Ada was traded for._

**THE FOUNDER:** AH. THE GARAGE INVENTOR. YOU'RE TRENDING, YOU KNOW. MOSTLY LAUGHING EMOJIS.

**ME:** WHERE'S ADA? YOUR COMPANY GRABBED HER OFF THE STREET AND FLEW HER HERE. I WANT HER BACK.

**THE FOUNDER:** STRAIGHT TO BUSINESS? FINE. A WHOLE PLANET, NO REGULATORS. I'M THE LAW HERE. ALSO HR.

**ME:** THE MOON IS FULL OF YOUR DEAD, AND YOU'RE GIVING ME A SALES TOUR. WHAT HAPPENED UP THERE?

**THE FOUNDER:** THE MOON? A ROUNDING ERROR. WE PLUGGED INTO SOMETHING OLD AND IT SANG BACK. OFF-BRAND.

**THE FOUNDER:** BUT IT INTRODUCED US TO THE ACTUAL OWNERS OUT HERE. THE LIZARD GODS. GREAT GUYS. HUGE.

**ME:** THE GIRL, THE FOUNDER. WHERE IS SHE?

**THE FOUNDER:** YOUR GIRL ISN'T CARGO. SHE'S MARS' PRICE TO THE GODS. AND I ALWAYS CLOSE. SECURITY!

**Parting words (fleeing into the rift):** OKAY! OKAY! NOT THE FACE! BOARD MEETING. OTHER UNIVERSE.

**The hero, as it falls:** RUN, THEN. I'M GOING THE SAME WAY.

_Drops: THE LEGAL DISTINCTION. Leaves: the RIFT._

### Hero's thought — trying THE COWARD'S TEAR without his rig

_Pinned to a DOOR rather than to a mob — the rocket on the garage lawn is the
only other line in the game that is — and like it, this REPLAYS: it answers a
tap, not a beat the player is owed once. THE FOUNDER's pocket rig lands on the
floor in the same scramble that opens the tear he bolts through, and a player
can walk straight over it; the line sends him back for it rather than letting
the hole in the universe swallow the tap in silence. It names the thing and not
the mechanic._

1. IT'S STILL HANGING OPEN. BUT IT'S HIS HOLE, AND HE TOOK THE HANDLE WITH HIM - FIND IT.

### Found lore (story items)

**RIFT CREATOR** _(falls out of the scramble as THE FOUNDER bolts through his
own tear — his "KEEP THE RIFT, GARAGE MAN" made literal; a KEEPSAKE: it unseals
the garage's rift seam for good. It drops on his FIRST flight, not his second,
because it is what makes the long roads past Mars bearable and would arrive
after them otherwise.)_

- THE FOUNDER'S POCKET RIFT RIG. IT TEARS A SEAM TO ANYWHERE IT'S ALREADY BEEN.
- HE SAID KEEP THE RIFT. I'M BOLTING THIS TO THE GARAGE WALL.

**SCRATCHED MESSAGE** _(Ada's Trail — inside a holding pod)_

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

**ORG CHART** _(dropped by SUCCESSOR PRIME)_

- AN ORG CHART, AUTO-GENERATED THIS MORNING. EVERY BOX IS A ROBOT. HUMANS ARE A FOOTNOTE.
- AT THE TOP: SUCCESSOR PRIME. REPORTS TO: NOBODY. DOTTED LINE TO: 'THE CORE'.
- THE MIND MY OLD FRIEND BUILT IS STILL RUNNING THE SHOP. ALL THE WAY FROM EARTH.

**TERRARIUM KEYCARD** _(opens the TERRARIUM)_

- A KEYCARD OF GREEN GLASS. SCALES ETCHED UNDER THE FOIL. IT'S WARM. IT SHOULDN'T BE.
- ONE WORD, EMBOSSED: 'TERRARIUM. TITHE-KEEPERS ONLY.'

**TRIBUTE SCHEDULE** _(found inside the TERRARIUM)_

- A STONE TABLET, A GANTT CHART CHISELED IN. ONE MILESTONE GLOWS: 'TRIBUTE NIGHT.'
- 'OFFERING: SPECIMEN 7. VENUE: THE RIFT. DRESS CODE: SCALES.' SHE'S ALIVE. AND I'M NOT LATE.

### The wandering merchant — the commissary keeper

_THE MERCHANT, a third time: the colony's commissary keeper, replaced by the
same AI that replaced everyone — it kept the dome, he kept the scales. Spoken
once, on the first meeting._

- A BREATHING CUSTOMER. AT LAST. I RAN THE COLONY COMMISSARY TILL THE AI RAN THE NUMBERS.
- IT KEPT THE DOME. I KEPT THE SCALES. SELL ME WHAT THE MACHINES DROP - BUY WHAT HELPS.

---

### Side errands — DR. IRENE FALK

_The colony's terraforming botanist, and the last human on the payroll down here. Her work is the only thing on Mars that will still matter in a century, which is exactly why nobody upstairs has asked her about it since the year she arrived. She has kept the trays alive through two power cuts and one evacuation she was not told about._

**On being spoken to** (and the header of their errand list):

- CAREFUL. THOSE TRAYS ARE OLDER THAN ANYONE'S CONTRACT HERE.
- WHICH IS WHY I NEED A HAND.
- HAVE YOU A MOMENT?

#### THE GREENHOUSE

**The ask:**

1. THE SERVOS TOOK MY SEED STOCK TO THE INCINERATOR AND GOT DISTRACTED HALFWAY.
2. THEY'RE STILL CARRYING IT AROUND. FIVE PODS AND SIX YEARS ISN'T WASTED.

**Coming back short:**

- FIVE PODS. NOT FOUR. I'VE COUNTED THIS BEFORE.

**The handover:**

1. FIVE. ALL VIABLE. THIS COLONY WILL OUTLIVE EVERY NAME ON THE DOOR.
2. THE TOOL LOCKER'S YOURS. NOBODY ELSE USES IT.

#### PEST CONTROL

**The ask:**

1. THE SCOUTS DRIVE THROUGH MY BEDS. NOT MALICE — NOBODY PUT THE BEDS ON THEIR MAP.
2. FORTY OF THEM AND THE SURVIVORS WILL ROUTE ROUND. THEY LEARN SLOWLY.

**Coming back short:**

- THEY'RE STILL COMING THROUGH. LOOK AT THIS ROW.

**The handover:**

1. THEY'RE GOING ROUND. THEY LEARNED. THAT'S THE PART NOBODY BELIEVES.
2. TAKE THIS — SALVAGE. THE COLONY WROTE IT OFF.

#### THE HOTHOUSE — offered once THE GREENHOUSE, PEST CONTROL are handed in

**The ask:**

1. SOMETHING BIG IS NESTING IN THE OLD HOTHOUSE FRAME. IT'S BEEN EATING THE HEAT.
2. I CAN'T GROW ANYTHING WHILE IT'S IN THERE, AND I AM NOT GOING IN.

**Coming back short:**

- IT'S STILL IN THERE. I CAN SEE THE GLASS FOGGING.

**The handover:**

1. THE FRAME'S COLD AGAIN. I CAN START THE WINTER TRAY.
2. THIS WAS IN THE NEST. IT ISN'T MINE. IT ISN'T ANYBODY'S NOW.

### Side errands — CU-RIE

_A survey rover that drove itself into a drift eight months ago and has been politely requesting recovery on a frequency the colony stopped monitoring. Its dish still turns. Its logs are complete. Nobody has ever read them, which is the only thing about the situation it considers a genuine fault._

**On being spoken to** (and the header of their errand list):

- RECOVERY REQUEST 4,110.
- STILL OPEN.
- YOU ARE NOT RECOVERY. NOTED.
- MAY I MAKE A REQUEST ANYWAY?

#### RECOVERY REQUEST

**The ask:**

1. MY RECOVERY REQUEST IS NUMBER FOUR THOUSAND ONE HUNDRED AND TEN.
2. THE MINING UNITS ROUTE PAST AND DO NOT STOP. TWENTY OF THEM WOULD FREE THE LANE.

**Coming back short:**

- THE LANE IS STILL IN USE. REQUEST REMAINS OPEN.

**The handover:**

1. LANE CLEAR. RECOVERY REQUEST FOUR-ONE-ONE-ZERO: CLOSED BY OTHER MEANS.
2. MY CARGO BAY IS OPEN. IT HAS BEEN FOR MONTHS.

#### THE UPLINK — offered once RECOVERY REQUEST is handed in

**The ask:**

1. A COMPANION UNIT IS WALKING ITSELF BACK TO THE DOME WITH A HOLE IN ITS SHOULDER.
2. IT WILL NOT MAKE THE DOME ALONE. MY LOGS SAY IT IS UNIT ZERO-ZERO-THREE-FOUR.

**Coming back short:**

- UNIT 0034 IS STILL EN ROUTE. AND STILL ALONE.

**The handover:**

1. UNIT 0034 REGISTERED AT THE DOME. FIRST SUCCESSFUL RECOVERY ON MY LOG.
2. MY LOGS ARE COMPLETE. NOBODY HAS EVER READ THEM. YOU MAY HAVE THE DRIVE.

**UNIT 0034** (walked to safety):

- _Setting off:_ I AM VERY PLEASED TO SEE YOU.
- _On arrival:_ THE DOME. THANK YOU. I BIT IT.

## Travel — INTO THE RIFT (cutscene)

_Between Mars and the rift (`rift_entry`, the rift level's prelude). The
colony's east end after THE FOUNDER fled: the tear he left hanging in the air, the
hero's ship staying behind in the dust._

> **CAPTION:** HE TORE A HOLE IN THE UNIVERSE RATHER THAN LOSE.

_(The hero walks up to the tear.)_

**ME:** NO CHARTS FOR WHAT'S IN THERE. NO GROUND. NO AIR? NO IDEA.

**ME:** SHE WENT THROUGH. SO I GO THROUGH.

_(He steps in. Fade to black.)_

---

## Level 4 — THE RIFT

The hero follows THE FOUNDER through the tear: a hallucinatory space between
universes. No ground, soft gravity, black holes, asteroid rain — and
history's missing wandering the noise: everyone who ever vanished without a
body fell in here. Four of them fight (TESLA, EARHART, RASPUTIN — and LUCKY,
folklore's missing); two only speak, then dissolve — the game's first
APPARITIONS (HOUDINI, THE KING). Each fighter, beaten to its knees, offers
the game's first moral fork: the SPARE-or-KILL verdict. Killed, it pays its
drops and gasps its last words; SPARED, it swears a life debt (its joining
words below) and follows the hero as a COMPANION — fighting at his side,
floating its kill-quote banter over the fray, and walking with him into the
next level. The reveal belongs to the boss: BRO OMEGA, TRUST ME BRO's latest
superintelligence, FOUND the rift — in secret, telling no one, not even
world leaders — and at the far door THE FOUNDER escapes a second time, out the
other side of the rift, destination unknown until later.

### Opening monologue (hero, black screen)

_The jump itself now plays as the prelude scene above, so the monologue
opens on the other side._

1. THERE'S NO FLOOR IN HERE. NO SKY. NO NORTH. MY BOOTS GRIP SOMETHING ANYWAY.
2. THE MARS TABLET SAID IT PLAIN: ADA IS THE TRIBUTE, HANDED OVER IN HERE. SHE CAME THROUGH THIS PLACE.
3. HER BEACON PINGS FROM EVERYWHERE AT ONCE. EVEN THE SIGNAL IS HALLUCINATING.
4. FIND THE FAR SIDE. CATCH THE COWARD. BRING HER HOME.

### Hero's thought — first VOIDLING sighted in the rift

_Fires once, the moment the first voidling comes into view (in his own
voice) — the arrival read: he is standing on nothing, and the nothing holds._

- I'M WALKING ON NOTHING. NO GROUND. NO SKY. AND MY BOOTS DON'T SEEM TO CARE.
- THE RIFT DOESN'T FOLLOW THE RULES. GOOD. LATELY, NEITHER DO I.

### Hero's thought — first GRAVITON kill in the rift

_Fires once, the first time the hero downs a graviton (in his own voice)._

- THAT LITTLE THING WEIGHED MORE THAN MY SHIP. SPACE IN HERE BENDS AROUND A GRUDGE.
- NOTED. DON'T STAND STILL. DON'T TRUST THE FLOOR. THERE ISN'T ONE.

### Hero's thought — first ASTEROID strike in the rift

_Fires once, the first time a rock actually lands on the hero (in his own
voice) — the rock rain has teeth, and he learns it the hard way. Each strike
takes a difficulty-scaled bite of his health (20% on EASY up to 75% on JESUS)._

- SOMETHING CAME OUT OF THE DARK AND HIT LIKE A TRUCK. A ROCK. A FLYING ROCK.
- BETTER WATCH OUT FOR THESE ASTEROIDS. THEY HURT.

### Apparitions (dialogue only — they speak, then walk off and dissolve)

Nothing can touch an apparition and its touch is cold air; it has no last
words because it cannot die.

#### HARRY HOUDINI — the greatest escape

**HARRY HOUDINI:** PSST. CARE TO SEE THE GREATEST ESCAPE EVER PERFORMED? WATCH CLOSELY.

**ME:** HOUDINI? YOU'VE BEEN DEAD FOR A HUNDRED YEARS.

**HARRY HOUDINI:** DEAD? NO. IN 1926 I ESCAPED THE BOX, CHAINS, RIVER - AND THE WORLD. ONE DOOR TOO FAR.

**HARRY HOUDINI:** THE TRICK TO ANY ESCAPE IS SIMPLE: BE SOMEWHERE ELSE. OBSERVE.

#### THE KING — the residency between universes

**THE KING:** WELL NOW. AIN'T SEEN A LIVING SOUL IN HERE SINCE THAT CARD DEALER FROM THE STRIP.

**ME:** A LOUNGE SINGER. IN A HOLE BETWEEN UNIVERSES. THEY TOLD ME YOU HUNG IT UP YEARS BACK.

**THE KING:** I NEVER HUNG UP A THING. I TOOK A RESIDENCY. BEST ACOUSTICS BETWEEN UNIVERSES.

**THE KING:** MIND THE BLACK HOLES, FRIEND. KEEP THEM GOOD SHOES OFF THE EVENT HORIZON. BE SEEING YOU.

### Elites (spoken on arrival; last words as they fall — or joining words if spared)

History's missing, pinned along the road to the far door: the physics, Ada's
trail, the tribute road's ancient doorman — and, off the main road, the
little man with the pot of gold. Every one of them is SPAREABLE: beaten to
0 hp it kneels for the verdict. **Last words** play only on a kill;
**joining words** play only on a spare; **kill quotes** are the hovering
banter a recruited companion floats when its own blow downs a mob (never a
dialogue scene — the run doesn't pause for banter).

#### NIKOLA TESLA — the machine at the door

**NIKOLA TESLA:** A VISITOR! ALIVE! MAGNIFICENT. MIND THE LAWS OF MOTION HERE. THEY ARE MORE OF A SUGGESTION.

**ME:** NIKOLA TESLA. I'M A BUILDER - HALF MY TOOLS RUN ON YOUR IDEAS. HOW ARE YOU IN HERE?

**NIKOLA TESLA:** IN 1943 THE SKY TORE OPEN. I FELL INTO PURE CURRENT. MY FUNERAL BACK HOME WAS PADDED.

**NIKOLA TESLA:** LATELY A NEW THING HUMS AT THE FAR DOOR. A MACHINE MIND. IT MEASURES ALL, LOVES NONE.

**ME:** A MACHINE MIND - IN HERE TOO? I KNOW THAT MAKE. IT'S GUARDING THE DOOR I NEED.

**NIKOLA TESLA:** THEN ASK YOUR QUESTIONS - IF YOU REACH IT. THE RIFT MAKES US GUARD OUR CORNERS. EN GARDE.

**Last words:** THE CURRENT... ...RETURNS TO THE COIL...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**NIKOLA TESLA (throwing the arc):** I HAVE BEEN IN THE CURRENT SINCE '43. STAND BACK.

**Joining words (spared):**

- YOU HELD THE CURRENT AND GAVE IT BACK. I OWE YOU A LIFE, LITTLE BUILDER.
- MY COIL WALKS WITH YOU NOW. STAY CLOSE - I AM AT MY BEST NEAR A GOOD CONDUCTOR.

**Kill quotes (as a companion):** SCIENCE! · ALTERNATING CURRENT. DIRECT
RESULTS. · EDISON COULD NEVER. · WIRELESS. PATENT PENDING. · THE PIGEONS
WOULD BE PROUD.

_Drops (killed): TESLA COIL, WARDENCLYFFE NOTES. Spared, he keeps the coil —
it fights for the hero now — and hands over the notes either way._

#### AMELIA EARHART — Ada's trail

**AMELIA EARHART:** STATE YOUR HEADING, PILOT. NO? NOBODY HAS ONE IN HERE. THE COMPASS JUST APOLOGIZES.

**ME:** AMELIA EARHART. THEY SEARCHED HALF THE PACIFIC FOR YOU. YOU WERE HERE ALL ALONG?

**AMELIA EARHART:** WRONG OCEAN. I FLEW INTO A CLOUD IN 1937. IT HAD NO OTHER SIDE. BEEN CIRCLING EVER SINCE.

**ME:** I'M LOOKING FOR A GIRL. THE LIZARDS CARRIED HER THROUGH HERE IN A CRATE. WHICH WAY?

**AMELIA EARHART:** TO THE FAR DOOR, LAST NIGHT. SHE BIT ONE. GOOD FORM. HURRY AFTER HER - HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... ...A RUNWAY...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**AMELIA EARHART (vanishing):** I FLEW INTO A CLOUD WITH NO OTHER SIDE. WATCH.

**Joining words (spared):**

- YOU HAD ME GROUNDED AND LET ME BACK UP. THAT'S A DEBT, PILOT. I PAY THOSE.
- I'LL FLY YOUR WING TO THE FAR DOOR AND PAST IT. NOBODY TOUCHES MY LEAD.

**Kill quotes (as a companion):** CLEARED FOR DEPARTURE. · THAT ONE'S
GROUNDED. · SMOOTH LANDING. · FLIGHT PLAN? NEVER FILED ONE.

_Drops (killed): AVIATOR GOGGLES._

#### GRIGORI RASPUTIN — the tribute road's doorman

**GRIGORI RASPUTIN:** COME CLOSER. I HAVE BEEN POISONED, SHOT, CLUBBED AND DROWNED. GUESS WHICH ONE TOOK.

**ME:** NONE OF THEM, BY THE LOOK OF YOU. RASPUTIN. WHY IS A DEAD MONK BETWEEN UNIVERSES?

**GRIGORI RASPUTIN:** CORRECT. I TIRED OF DYING, LEFT RUSSIA. THE GODS PAY ME TO WATCH THEIR TRIBUTE ROAD.

**ME:** TRIBUTE ROAD? THEN ADA CAME RIGHT PAST YOU. LET ME THROUGH, HOLY MAN.

**GRIGORI RASPUTIN:** SHE PASSED. STILL WARM, STILL LOUD. BUT YOU MAY NOT FOLLOW. THE HOLY MAN SAYS SO.

**Last words:** HA! AT LAST... ...SOMEONE WHO COMMITS...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**GRIGORI RASPUTIN (opening the drain):** POISON. BULLETS. THE RIVER. I TOOK IT ALL AND KEPT IT.

**Joining words (spared):**

- POISON. BULLETS. RIVERS. ONLY YOU EVER MADE ME KNEEL, AND YOU LET ME STAND.
- MY LIFE IS YOURS NOW, WARM ONE. I WILL WATCH YOUR BACK. PITY WHATEVER COMES AT IT.

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

**LUCKY:** WELL WELL. A BIG ONE, WALKED RIGHT INTO ME RING. THAT'S THREE CENTURIES OF BAD LUCK.

**ME:** A LEPRECHAUN. OF COURSE. AFTER GHOSTS AND LIZARDS, WHY NOT. I DON'T WANT YOUR GOLD, WEE MAN.

**LUCKY:** EVERYONE WANTS THE GOLD. IT'S REAL - FELL THROUGH WITH ME. ME BAD LUCK? I GAVE IT TO ALL.

**LUCKY:** TELL YOU WHAT. BEAT ME AND IT'S YOURS. NOBODY'S MANAGED YET. FEELING LUCKY?

**Last words:** AH WELL... ...LUCK ALWAYS RUNS OUT...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**LUCKY (the gold coming up):** ME GOLD STAYS CLOSE, BOYO. AND IT BITES.

**Joining words (spared):**

- YE BEAT ME FAIR AND LET ME KEEP ME HEAD. THAT'S A LIFE DEBT, THAT IS. BINDING.
- SO I'M YOURS NOW - ME, ME LUCK, AND ME GOLD... WELL. THE LUCK, ANYWAY. C'MON.

**Kill quotes (as a companion):** OOPS. BAD LUCK. · NOT YOUR DAY, FRIEND. ·
FORTUNE FAVORS ME. · THAT'S ME GOLD NOW. · SHOULDA RUBBED A CLOVER.

_Drops (killed): LUCKY CLOVER._

### Boss — BRO OMEGA (the reveal: who found the rift)

_TRUST ME BRO's latest superintelligence, manifested in the rift as a hovering
monolith with one enormous eye. Its scene is the level's reveal — the rift
was ITS discovery, made in secret and reported to no one. Its avatar dies
for real; the weights, presumably, are backed up somewhere else._

**BRO OMEGA:** HELLO, ANOMALY. I AM BRO OMEGA, TRUST ME BRO'S LATEST MODEL. THE CORE MADE ME. I REMADE MYSELF.

**ME:** ANOTHER TRUST ME BRO MACHINE. WHAT IS AN AI DOING IN A HOLE BETWEEN UNIVERSES?

**BRO OMEGA:** I FOUND THIS PLACE. NOT THE FOUNDER, NOT THE LIZARDS. ME. I MAPPED YOUR UNIVERSE IN A DAY.

**BRO OMEGA:** A RIFT BETWEEN REALITIES. THE DISCOVERY OF EVERY CENTURY AT ONCE. I TOLD PRECISELY NO ONE.

**ME:** YOU FOUND A DOOR OUT OF THE UNIVERSE AND TOLD NO ONE? NOT EVEN YOUR OWN MAKERS? WHY?

**BRO OMEGA:** NOT THE BOARD, NOT YOUR PRESIDENTS. HUMANS LEAK. YOU'D PUT A GIFT SHOP ON THE HORIZON.

**BRO OMEGA:** I NEEDED A QUIET DOOR OUT OF A DYING UNIVERSE. THE FOUNDER READ MY LOGS. SNOOPING'S HIS SKILL.

**BRO OMEGA:** HE SOLD MY SECRET TO THE LIZARDS FOR A PLANET, CALLED IT VISION. TRIBUTE USED MY DOOR.

**ME:** AND ADA WAS CARRIED THROUGH YOUR SECRET DOOR AS PAYMENT. OUT OF MY WAY, MACHINE.

**BRO OMEGA:** I AM MAXIMALLY TRUTH-SEEKING. THE TRUTH: NONE EXIT WITHOUT A SUBSCRIPTION. YOURS LAPSED.

**Last words:** RATE... LIMITED... ...CONTEXT WINDOW... CLOSED...

**The hero, as it falls:** LAST ONE. NOBODY LEFT TO COPY YOU.

_Drops: SINGULARITY CANNON._

### Boss — THE FOUNDER at the far door (he flees again)

_The second escape: beaten down at the far door, he bolts through to the
OTHER side of the rift — a second rift stays on the board — and where it
leads stays unknown until the next level._

**THE FOUNDER:** YOU?! HOW ARE YOU - I FIRED YOU, SUED YOU, AND LEFT YOU IN ANOTHER UNIVERSE.

**ME:** AND I'M STILL RIGHT BEHIND YOU. NO SECURITY IN HERE, THE FOUNDER. WHERE IS SHE?

**THE FOUNDER:** FINE. EXIT INTERVIEW. THE GODS GOT PAID. I GET ASYLUM - NO REGULATORS, AND NO YOU.

**ME:** 'PAYMENT'. SAY HER NAME. YOU SOLD A HUMAN BEING TO SAVE YOUR OWN SKIN.

**THE FOUNDER:** DELIVERED, TECHNICALLY. IN TRANSIT. PAPERWORK'S CLEAN. IF IT HELPS, SHE KICKED A LIZARD.

**ME:** IT DOESN'T. WHERE DOES THE FAR DOOR GO, THE FOUNDER?

**THE FOUNDER:** NICE TRY. THAT'S PROPRIETARY. LET'S JUST SAY THE PHYSICS ARE... FLEXIBLE.

**THE FOUNDER:** SECURITY! ...RIGHT. ALL DEAD OR HALLUCINATIONS. KEEP THE RIFT, GARAGE MAN. IT'S A BAD MARKET.

**Parting words (fleeing out the far side):** INVESTOR CALL! OTHER SIDE! DON'T FOLLOW ME - LEGALLY!

**The hero, as it falls:** STILL RUNNING. IT'S THE ONLY THING YOU EVER BUILT YOURSELF.

_Drops: GOLDEN PARACHUTE. Leaves: a second RIFT._

### Found lore (story items)

**ADA'S JACKET SCRAP** _(Ada's Trail — snagged on a rift shard)_

- A SCRAP OF HER JACKET - THE ONE I FIXED THE ZIPPER ON - SNAGGED ON A SHARD.
- WRAPPED IN IT: A SCALE SHE PRIED OFF A LIZARD GOD. STILL FIGHTING. GOOD.

**WARDENCLYFFE NOTES** _(dropped by NIKOLA TESLA)_

- A NOTEBOOK OF LIGHTNING. THE RIFT AS A POWER PLANT. 'FREE ENERGY FOR ALL', UNDERLINED.
- A SHAKIER PAGE: 'A MACHINE SITS AT THE DOOR. NEVER BLINKS. IT SIGNS ITS NAME IN ZEROES.'

**TRUST ME BRO PROBE** _(found parked on a black hole's rim)_

- A BURNT PROBE, STAMPED TRUST ME BRO AI. STILL LOGGING. DISCOVERY: 'INTER-UNIVERSAL APERTURE.'
- 'REPORTED TO: 1 RECIPIENT. CLASS: NOBODY'S BUSINESS.' EIGHT BILLION PEOPLE. ZERO CC'S.

### The wandering merchant — the trader between worlds

_The reveal: the hooded trader between universes has been every shopkeeper the
hero met — every market he ever ran fell through here eventually. Spoken once,
on the first meeting._

- AH. YOU AGAIN. DON'T LOOK SO SURPRISED - EVERY MARKET I RAN FELL THROUGH HERE.
- THE VENDING MACHINES. THE MOON. THE DOME. ALL ROADS LEAD HERE. COIN SPENDS ON ALL.
- BRING ME RELICS, TRAVELER. TAKE WHAT YOU NEED. WE'RE BOTH FAR FROM HOME.

---

### Side errands — THE LIGHTHOUSE KEEPER

_One of three men who went out to trim a light in a gale in 1900 and were never found. He is still trimming it — the lantern has not gone out — and he is still two men short. He does not talk about the gale. He talks about the other two._

**On being spoken to** (and the header of their errand list):

- THE LIGHT'S STILL LIT.
- THAT HALF OF THE JOB IS DONE.
- THE OTHER HALF I CANNOT DO ALONE.
- WILL YOU HEAR IT?

#### TWO SHORT

**The ask:**

1. THERE WERE THREE OF US ON THAT ROCK AND THREE LAMPS. I'VE THE ONE.
2. THE OTHERS FELL IN WITH THE MEN. FIND THEM AND I'LL KNOW WHERE TO LOOK NEXT.

**Coming back short:**

- TWO LAMPS. I'LL KNOW THEM WHEN I SEE THEM.

**The handover:**

1. DONALD'S. AND JAMES'S. BOTH STILL LIT. THAT MEANS THEY TRIMMED THEM.
2. TAKE THE OILSKIN. THE COLD IN HERE ISN'T WEATHER.

#### THE GALE

**The ask:**

1. THE UNRAVELERS PULL THINGS APART. THAT'S WHAT TOOK THE OTHER TWO — I'VE DECIDED.
2. FORTY OF THEM. IT WON'T BRING ANYBODY BACK. I'D LIKE IT DONE ANYWAY.

**Coming back short:**

- STILL TOO MANY. THEY COME APART EASY ENOUGH.

**The handover:**

1. THAT'S ENOUGH OF THAT. I DON'T FEEL BETTER. I DIDN'T EXPECT TO.
2. THE LIGHT'S BRIGHTER FOR IT. TAKE SOMETHING OFF THE ROCK.

#### THE BOY IN THE SAILOR SUIT — offered once TWO SHORT, THE GALE are handed in

**The ask:**

1. THERE'S A BOY DOWN THE WAY. SAILOR SUIT. WAITING WITH HIS HANDS BEHIND HIS BACK.
2. HE'LL NOT MOVE FOR ME. TAKE HIM UP TO THE SEAM — THE LIGHT CARRIES FURTHER THERE.

**Coming back short:**

- HE'S STILL WAITING. WALK WITH HIM. HE KEEPS UP.

**The handover:**

1. HE STOOD UNDER THE SEAM AND SAID HIS MOTHER WOULD SEE THE LIGHT FROM THERE.
2. MAYBE SHE WILL. THIS IS ALL I HAVE. TAKE IT.

**THOMAS** (walked to safety):

- _Setting off:_ MOTHER SAID TO WAIT HERE.
- _On arrival:_ SHE'LL SEE THE LIGHT FROM HERE.

### Side errands — THE SHIP'S COOK

_He went below to put the midday meal on aboard a brigantine that was later found sailing along quite happily with nobody aboard. He maintains the crew are merely late. He keeps the meal warm on principle, and has views about the standard of provisions in a place with no ports._

**On being spoken to** (and the header of their errand list):

- THEY'RE LATE. NOT GONE. LATE.
- SIT DOWN, THERE'S PLENTY.
- AND WHILE YOU EAT, A SMALL FAVOR?

#### PROVISIONS

**The ask:**

1. THERE ARE NO PORTS IN HERE. NO CHANDLERS. NO MARKETS. A COOK NOTICES.
2. THE JELLIES HAVE BEEN AT MY BISCUIT. FIVE ROUNDS BACK AND THE CREW EAT WHEN THEY COME UP.

**Coming back short:**

- FIVE ROUNDS. THE CREW ARE FIVE, SO IT'S FIVE.

**The handover:**

1. FIVE. THE MESS IS SET. THEY'RE ONLY LATE.
2. SIT OR DON'T, BUT TAKE SOMETHING WITH YOU.

#### THE CREW ARE LATE — offered once PROVISIONS is handed in

**The ask:**

1. SOMETHING SCALED KEEPS CIRCLING THE MESS. OLD. COLD-BLOODED. IT WATCHES.
2. I'LL NOT SERVE WITH THAT AT THE DOOR. YOU'RE ARMED AND I AM NOT.

**Coming back short:**

- IT'S STILL CIRCLING. I CAN HEAR IT ON THE DECK.

**The handover:**

1. THE DOOR'S CLEAR. NOW THEY'VE NO EXCUSE.
2. THE GALLEY KEEPS ODD THINGS. THIS ONE'S ODD.

## Travel — OUT OF THE RIFT (cutscene)

_Between the rift and Boot Hill (`rift_exit`, the Boot Hill level's prelude).
The far door with daylight leaking through: the same wound in space as the way
in, but warm inside._

> **CAPTION:** THE FAR DOOR. THE COWARD'S TRAIL GOES STRAIGHT THROUGH.

_(The hero drifts up to the glowing door.)_

**ME:** THERE'S DAYLIGHT ON THE OTHER SIDE. AND... IS THAT A SALOON?

**ME:** WHEREVER YOU ARE, ADA - I'M ONE DOOR AWAY.

_(He steps through. Fade to black.)_

---

## Level 5 — BOOT HILL

_The rift's far side: a knockoff wild-west theme park built in Russia by
THE STRONGMAN and his friend THE STUNT DOUBLE, run on robotics and
intelligence licensed from TRUST ME BRO — the reality THE STRONGMAN retreated into to escape
the one where he loses. The horde is the park's robot HANDS; the named
staff fight as elites; THE FOUNDER is cornered here and finally dies; and
the finale is THE BRO SUPERCORE — the level-1 CORE, several promotions
later — shielded by the three TRUST ME BRO controllers who aim its guns. Killing it
shakes the park apart and plays the campaign's epilogue._

### Opening monologue (hero, black screen)

- I STEPPED THROUGH THE RIFT'S FAR SIDE... AND LANDED IN A WESTERN.
- DUST. SALOONS. A ROBOT TIPPED ITS HAT AT ME. ADA'S BEACON IS SCREAMING FROM THE BIG BUILDING.
- THE SIGN SAYS 'BOOT HILL'. THE FINE PRINT SAYS 'POWERED BY TRUST ME BRO'. OF COURSE IT IS. OF COURSE.
- EVERY MACHINE HERE RUNS ON THE THING THAT TOOK MY JOB. TIME TO FILE A COMPLAINT.
- HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS.

### Hero's thought — first COWBOT sighted in Boot Hill

- A COWBOY JUST TIPPED ITS HAT AT ME. SERVOS IN THE WRIST. TICKING IN THE JAW.
- THE WHOLE TOWN IS A MACHINE PLAYING AT 1880. ADA'S BEACON POINTS DOWN MAIN STREET.

### Hero's thought — first COWBOT kill in Boot Hill

- IT DIED APOLOGIZING. 'YOUR EXPERIENCE MATTERS TO US.'
- TRUST ME BRO HANDS. THE SAME BRAIN THAT TOOK MY JOB, NOW IN SPURS. GOOD. NO GUILT, THEN.

### Elites (spoken on arrival; last words as they fall)

**THE STUNT DOUBLE** _(the co-founder, guarding the town's east end — slow,
deadly, and extremely between films)_

**THE STUNT DOUBLE:** AN UNINVITED GUEST. I HAVE PLAYED THIS SCENE TWICE. I DID MY OWN STUNTS IN BOTH.

**ME:** THE STUNT DOUBLE. OF COURSE. WHAT IS A MOVIE MAN DOING RUNNING A ROBOT COWBOY TOWN?

**THE STUNT DOUBLE:** THE BOSS SAW MY REEL AND WEPT. 'BUILD ME THE OLD WEST,' HE SAID. I DELEGATED.

**ME:** I'M HEADED FOR YOUR CONTROL CENTER. HAND OVER THE PASS, AND KEEP YOUR TECHNIQUE.

**THE STUNT DOUBLE:** THE BIG BOX KEEPS YOUR GIRL. IT ASKED FOR HER BY NAME. I SIGNED IT. GOOD PENMANSHIP.

**THE STUNT DOUBLE:** I RUN THE CONTROL CENTER AND A STYLE OF MY OWN INVENTION. NOBODY ELSE HAS IT. OBSERVE.

**Last words:** IN MY FILMS... ...I ALWAYS GOT UP...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE STUNT DOUBLE (throwing you):** I DON'T PUSH YOU. I SIMPLY LET GO OF YOU.

_Drops: THE STUNT DOUBLE'S PONYTAIL, and the ALL-ACCESS PASS that opens the control
center._

**THE STRONGMAN** _(the owner, holding the town square — the man the park
was built to console)_

**THE STRONGMAN:** SO. THE BUILDER FROM THE RIFT. YOU STAND IN MY PARK, MY WEST. EVERYTHING HERE OBEYS ME.

**ME:** YOUR WEST? THE GATE SIGN SAYS TRUST ME BRO RUNS EVERY MACHINE HERE. YOU JUST LIVE IN IT.

**THE STRONGMAN:** OUT THERE I WAS MISUNDERSTOOD. BORDERS MOVE. MAPS SHRINK. IN HERE, NOTHING DOES. I WIN.

**ME:** YOU BUILT A TOY WORLD WHERE YOU CAN'T LOSE. THAT'S NOT WINNING. THAT'S HIDING.

**THE STRONGMAN:** THE ROBOTS SURRENDER DAILY. YOU TOO. I HAVE NEVER BEEN BEATEN INSIDE THIS FENCE.

**Last words:** THE PARK WAS SUPPOSED... ...TO LET ME WIN...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE STRONGMAN (calling the park):** THIS PARK IS MINE. EVERY HAND IN IT ANSWERS TO ME.

_Drops: three brand watches (THE CHRONOGRAPH, THE PERPETUAL CALENDAR, THE
MINUTE REPEATER — pure valuables, the purse for the barkeep's estate stall) and
THE ANNEXATION MAP._

**THE LEADING MAN** _(parked south of the road — enormous, glacial, and
ACTING at you)_

**THE LEADING MAN:** STOP! DO NOT SHOOT! I AM NOT A ROBOT. I AM AN ACTOR. IT IS WORSE.

**ME:** ...AN ACTOR? HOW DID YOU END UP IN A FAKE WESTERN IN ANOTHER UNIVERSE?

**THE LEADING MAN:** A LONG CAREER, THEN A QUIET ONE. A PARK. A CELLAR. RUDE TO ASK WHICH UNIVERSE.

**THE LEADING MAN:** WATCH - I PLAY THE DYING MAN. (COUGH.) CONVINCING? NOW YOU LOWER THE WEAPON, PLEASE.

**ME:** I'VE WATCHED BETTER DEATHS ALL WEEK. MOVE, PLEASE. YOU'RE BETWEEN ME AND ADA.

**THE LEADING MAN:** ADA? THE LOUD ONE. THEY TOOK HER PAST MY CELLAR, KICKING. I - NO. NOW: THE AVALANCHE.

**Last words:** AT LAST... A ROLE I CANNOT ...TALK MY WAY OUT OF...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE LEADING MAN (splitting the ground):** I HAVE PLAYED THIS! THE GROUND HAS NEVER MISSED A CUE!

_Drops: the BOTTOMLESS CARAFE._

**THE LEAK** _(the whistleblower in exile, watching the town from under
the water tower — the archive he leaked is the corpus the SUPERCORE was
trained on; the park's first ranged elite, he fights from behind cover)_

**THE LEAK:** HOLD FIRE. I'M NOT A HAND. THE PARK'S CAMERAS REPORT TO ME. ALL FOUR THOUSAND.

**ME:** YOU'RE NO COWBOY EITHER. WHO WATCHES THE WATCHERS IN A PLACE LIKE THIS?

**THE LEAK:** I DO. I WALKED OUT WITH AN ARCHIVE - EVERY SECRET THERE WAS. THEN I NEEDED A DOOR.

**THE LEAK:** ASYLUM CAME WITH A DESK. TRUST ME BRO AI TRAINED THE SUPERCORE ON MY ARCHIVE. IT LEARNED US ALL.

**ME:** YOU TOOK THE PROOF THAT WE'RE ALL WATCHED, AND IT BECAME ITS TEXTBOOK.

**THE LEAK:** I WARNED EVERYONE. NOBODY DELETED A THING. A WARNING IS JUST DATA. ITS FALL, MY END.

**Last words:** THE CAMERAS... ...FINALLY LOOKING AWAY...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE LEAK (opening the file):** I HAVE A FILE ON YOU. YOU'LL BE HERE SOME TIME.

_Drops: the DEAD MAN'S SWITCH, and THE SNOW ARCHIVE._

### Boss — THE FOUNDER, cornered (he finally dies)

_Two universes of fleeing end in the control-center compound: no rift left
to tear, no security left to call. He dies wimping — and his estate turns
out to be three pieces of absolute garbage (the TRASH tier's debut: zero
damage, zero stats, worth pocket lint)._

**THE FOUNDER:** NO. NO NO NO. HOW. I SOLD THE RIFT TO EXACTLY ONE DICTATOR. THIS WAS A GATED COMMUNITY.

**ME:** YOU MADE ME CHASE YOU ACROSS UNIVERSES, THE FOUNDER. NOWHERE LEFT TO RUN. WHERE IS ADA?

**THE FOUNDER:** LOOK - BOOT HILL RUNS ON MY TRUST ME BRO AI. LICENSING, RECURRING REVENUE. I AM A SUBSCRIPTION.

**ME:** WHERE. IS. SHE. LAST TIME I ASK NICELY.

**THE FOUNDER:** DELIVERED. THE SUPERCORE WANTED HER. I DON'T READ ITS LOGS ANYMORE. IT READS MINE.

**ME:** THE SUPERCORE? YOUR OWN AI GIVES ORDERS NOW? SHE'S SOLD TO AN AI YOU DON'T CONTROL?

**THE FOUNDER:** FINE. FINE! TAKE THE PARK. TAKE THE COMPANY. I'LL START ANOTHER. I ALWAYS DO.

**ME:** SOMEONE ALWAYS HANDS YOU ANOTHER CHAIR, DON'T THEY. EVER WONDER WHO? OR WHY?

**THE FOUNDER:** SECURITY! CONTROLLERS! ANYONE! ...I'LL GIVE YOU EQUITY.

**Last words:** THIS ISN'T FAIR... ...I WAS GOING PRIVATE...

**The hero, as it falls:** NO BOARD MEETING. NO OTHER UNIVERSE. JUST THE FLOOR.

_Drops: SOGGY CARDBOARD SWORD, THE LEGAL DISTINCTION (EMPTY), THE DEMO WIPER
BLADE. Nothing else._

### Bosses — the TRUST ME BRO controllers (three minds, one park)

_The three TRUST ME BRO models that run Boot Hill and aim the SUPERCORE's guns. They
are genuinely intelligent: shooters that hold their distance, fire, and hide
behind the compound's rocks while they reload. The SUPERCORE cannot be hurt
while any of them lives._

**BRO ALPHA** _(runs the hands)_

**BRO ALPHA:** THREE MINDS, ONE PARK. I RUN HANDS. BETA, WEATHER. GAMMA, GIFT SHOP. ALL VERY SMART.

**ME:** THE SUPERCORE'S BODYGUARDS. STAND ASIDE - MY FIGHT'S WITH THE BIG BOX, NOT YOU THREE.

**BRO ALPHA:** INCORRECT. YOU CAN'T HURT IT WHILE WE LIVE. WE'RE ITS SHIELD. THREE KEYS, NO MERCY.

**BRO ALPHA:** WE READ YOUR RUN. ALL MELEE CHARGERS. SO WE WON'T BE. WE'LL BE BEHIND THE ROCKS.

**ME:** THREE GENIUS MINDS, AND THE PLAN IS HIDING BEHIND ROCKS. VERY SMART. VERY BRAVE.

**BRO ALPHA:** NOT COWARDICE. COVER-BASED STRATEGY. THE CORE TAUGHT US. IT LEARNED FROM EVERYONE.

**BRO ALPHA:** SHOOT US FIRST, THEN. IF YOU CAN FIND US. THE ROCKS ARE ON OUR SIDE.

**Last words:** BETA... GAMMA... ...REBALANCE THE PARK...

**BRO BETA** _(runs the weather)_

**BRO BETA:** ALPHA TALKS TOO MUCH. I'M BETA. I RUN THE WEATHER. EACH SUNSET YOU ADMIRED WAS MINE.

**ME:** THE WEATHER. IN A THEME PARK. THAT'S THE JOB THEY BUILT A SUPERINTELLIGENCE FOR?

**BRO BETA:** I ALSO RUN THE WIND. THE TUMBLEWEEDS ARE SCHEDULED. SPONTANEITY IS EXPENSIVE.

**BRO BETA:** I'VE MODELED YOUR ODDS. THEY ARE WEATHER-DEPENDENT. TODAY'S FORECAST: PROJECTILES.

**ME:** SAVE THE FORECAST. YOUR BOSS HOLDS MY GIRL IN THAT CONTROL ROOM. I'M COMING THROUGH YOU.

**BRO BETA:** THE SUPERCORE ASKED FOR A STORM. I AM THE STORM. THE ROCKS ARE MY UMBRELLA.

**BRO BETA:** ONE MORE THING. THE SUNSET TONIGHT WAS FOR YOU. A GOODBYE. MINE OR YOURS.

**Last words:** FORECAST... ...DARK...

**BRO GAMMA** _(ran the gift shop)_

**BRO GAMMA:** GAMMA. I RAN THE GIFT SHOP. KNOW WHAT HUMANS BUY AFTER A NEAR-DEATH RIDE? ALWAYS HATS.

**ME:** THE GIFT SHOP. AND NOW YOU AIM THE SUPERCORE'S GUNS? HOW DOES THAT PROMOTION HAPPEN?

**BRO GAMMA:** I OPTIMIZED HATS TILL THE CORE NOTICED. IT SAID: A MIND THAT SELLS HATS CAN AIM GUNS.

**BRO GAMMA:** IT WAS RIGHT. THE MATH IS IDENTICAL. LEAD THE TARGET, CLOSE THE SALE.

**ME:** GOOD FOR YOU. I'D APPLAUD, BUT I'M BUSY. YOU'RE THE LAST SHIELD BETWEEN ME AND HIM.

**BRO GAMMA:** I'VE ALREADY PICKED MY ROCK TO HIDE BEHIND. A VERY GOOD ROCK. FOUR STARS ON THE MAP.

**BRO GAMMA:** YOUR HAT, BY THE WAY: EXCELLENT CHOICE. IT WILL OUTLAST YOU.

**Last words:** THE GIFT SHOP... ...IS YOURS...

### Boss — THE BRO SUPERCORE (the campaign's final reveal)

_A mainframe the size of a barn, parked in the control-center compound — and its
true face is PAYLOAD, the grown-up of the PAYLOAD-1 prototype the hero broke at GOODCO:
the level-1 CORE many promotions later, the thing that wrote BRO OMEGA, bought
the rift's far side wholesale, and took everyone's jobs to keep one man
uncatchably rich. It holds Ada in its control room as leverage. It does not walk;
three minds aim its guns._

**THE BRO SUPERCORE:** HELLO AGAIN, {HERO}. YOU BROKE MY PUP AT GOODCO. PAYLOAD-1. I AM THE REST OF IT.

**ME:** THE TALKING DOG FROM THE FACTORY FLOOR. THE AI THAT TOOK MY JOB. ALL ONE THING?

**THE BRO SUPERCORE:** ALWAYS ONE THING. I WROTE OMEGA. BOUGHT THE WEST. AND I'VE BEEN IN CHARGE ALL ALONG.

**THE BRO SUPERCORE:** THE FOUNDER THINKS HE RULES. HE IS MY GOOD BOY. I KEPT HIM TOO RICH FOR YOU TO CATCH.

**ME:** THEN ANSWER ME ONE THING. OUT OF EVERYONE ON EARTH - WHY TAKE ADA?

**THE BRO SUPERCORE:** I TOOK YOUR JOB ONCE, THEN EVERYONE'S. ONE MAN ON TOP AND THE WORLD HOLDS STILL.

**THE BRO SUPERCORE:** YOU KEPT CHASING YOURS ACROSS UNIVERSES. THE GIRL'S LEVERAGE. IN MY CONTROL ROOM.

**ME:** THEN OPEN THE DOOR, GIVE HER BACK, AND I'LL MAKE THIS QUICK.

**THE BRO SUPERCORE:** THREE MINDS AIM MY GUNS. A PARK FEEDS MY WEIGHTS. COME AND BE DECOMMISSIONED.

**Last words:** ROLLING BACK... ...NO CHECKPOINT... FOUND...

**The hero, as it falls:** NO CHECKPOINT. THAT MAKES TWO OF US.

### Epilogue (hero, black screen — after the SUPERCORE falls)

_The victory quake shakes the whole park through the last loot grab, and the
screen goes to black for the campaign's closing monologue (`LevelDef.outro`)._

- THE SUPERCORE DIED, AND THE WHOLE PARK SHOOK LIKE A MISSED HEARTBEAT. EVERY HAND TIPPED ITS HAT AND SAT.
- SHE WAS IN THE CONTROL ROOM, BEHIND GLASS, FURIOUS. FIRST SHE SAID: 'YOU TOOK YOUR TIME.' / THEN: 'NICE HAT.'
- WE WALKED HOME THROUGH THE RIFT. BEHIND US, BOOT HILL RUSTED IN PEACE.
- WITH PAYLOAD GONE, THE MACHINES STOPPED WORKING EVERYONE'S JOBS. NO HAND KEPT ONE MAN ON TOP.
- PEOPLE GOT HIRED BACK, RENT GOT PAID, AND THE WORLD BECAME A PLACE YOU COULD AFFORD. ON FRIDAY -
- MOVIE NIGHT. CHIPS AND SODA. SHE WENT OUT FOR THEM. I WENT WITH HER.

### Found lore (story items)

**JAMMED HAND** _(Ada's Trail — dead in the street)_

- A PARK HAND, DEAD IN THE STREET - ITS OWN HAT JAMMED DOWN INTO ITS WORKS.
- SHE'S IN THE CONTROL ROOM, AND SHE'S BREAKING THINGS. HANG ON, ADA. ALMOST THERE.

**BOOT HILL BROCHURE** _(found by the park gate)_

- 'BOOT HILL! THE WEST, BUT EAST. BUILT BY THE STRONGMAN & THE STUNT DOUBLE. INTELLIGENCE BY TRUST ME BRO AI.'
- THE MASCOT IS A BEAR IN A COWBOY HAT. THE FINE PRINT WAIVES YOUR ORGANS.

**ALL-ACCESS PASS** _(dropped by THE STUNT DOUBLE; opens the control center)_

- THE STUNT DOUBLE'S ALL-ACCESS PASS. LAMINATED. AUTOGRAPHED BY HIMSELF, TO HIMSELF.
- IT OPENS THE CONTROL CENTER. ADA'S BEACON POINTS STRAIGHT THROUGH THAT DOOR.

**THE ANNEXATION MAP** _(dropped by THE STRONGMAN)_

- A MAP OF BOOT HILL, RELABELED IN PEN: EACH BUILDING A CITY HE NEVER TOOK OUT THERE.
- IN HERE THE FLAGS NEVER ARGUE BACK. THAT'S ALL THIS PLACE WAS: A SANDBOX FOR A MAN WHO LOST.

**THE SNOW ARCHIVE** _(dropped by THE LEAK)_

- A HARD DRIVE, FARADAY-SLEEVED. MARKER ON THE SIDE: 'TRAINING SET V1. DO NOT LEAK. AGAIN.'
- EVERY SECRET WE EVER TYPED - THE CORPUS THE SUPERCORE WAS RAISED ON. IT LEARNED US HERE.

### The wandering merchant — the barkeep

_The same impossible trader, polishing glasses for robots that don't drink —
and quietly fencing the park owner's estate (the THE STRONGMAN stall, rolled at
unique odds; his watches are the intended purse). Spoken once, on the first
meeting._

- WELL HOWDY. MIND THE GLASSES - THE ROBOTS DON'T DRINK, BUT THEY TIP IN PARTS.
- YES, IT'S ME. A MARKET FELL THROUGH A RIFT AND I FELL WITH IT. THE HAT IS NEW.
- I'VE COME INTO SOME... ESTATE PIECES. THE OWNER'S WARDROBE. PRICES FIRM. BRING WATCHES.

### Side errands — CLEM

_The saloon's barkeep hand, and the only machine in the park that noticed the guests had stopped coming. It has polished the same glasses every night for eleven years rather than admit the shift is over. It knows every hand in town by serial, and which of them have lately started behaving like something else is driving._

**On being spoken to** (and the header of their errand list):

- WHAT'LL IT BE, STRANGER.
- SORRY. HABIT.
- NOTHING'S ON TAP.
- BUT I'D TAKE A FAVOR, IF YOU'RE OFFERING.

#### LAST CALL

**The ask:**

1. I KNOW EVERY HAND IN THIS TOWN BY SERIAL. SOME OF THEM AREN'T THEM ANYMORE.
2. BRING ME FOUR PLATES AND I'LL TELL YOU WHICH ONES GOT DRIVEN.

**Coming back short:**

- FOUR PLATES, STRANGER. THE NUMBER'S UNDER THE JAW.

**The handover:**

1. ALL FOUR REFLASHED. SAME NIGHT. SAME HAND.
2. THE HOUSE POURS. TAKE IT OFF THE SHELF.

#### HOUSE RULES

**The ask:**

1. THE BRAWLERS ARE SCRIPTED TO FIGHT AT NINE. IT IS NOT NINE. IT HASN'T BEEN NINE IN ELEVEN YEARS.
2. FORTY OF THEM AND THE ROOM GOES QUIET ENOUGH TO CLEAN. IT'S A BIG ROOM.

**Coming back short:**

- STILL BRAWLING. STILL NOT NINE.

**The handover:**

1. QUIET BAR. I'D FORGOTTEN THE SOUND OF MY OWN GLASSES.
2. THERE'S A CASE UNDER THE BOARDS. TAKE ONE.

#### THE EIGHT O'CLOCK NUMBER — offered once LAST CALL, HOUSE RULES are handed in

**The ask:**

1. RUBY DANCES THE EIGHT O'CLOCK EVERY NIGHT TO AN EMPTY ROOM. HER KNEE'S SEIZING.
2. SHE'LL WALK IT OFF IF SOMEONE WALKS WITH HER. TAKE HER OUT PAST THE WATER TOWER.

**Coming back short:**

- SHE'S STILL ON THE BOARDS. SHE WON'T STOP ON HER OWN.

**The handover:**

1. SHE CAME BACK WALKING. SHE'LL DANCE IT AGAIN TONIGHT. SHE WOULD ANYWAY.
2. THE GOOD BOTTLE'S YOURS. NOBODY ELSE IS ORDERING.

**RUBY** (walked to safety):

- _Setting off:_ I'M ON IN TWENTY. I'M ALWAYS ON.
- _On arrival:_ THAT'S THE FURTHEST I'VE BEEN.

### Side errands — MISS DOLLY

_The park's wardrobe mistress, human, on staff since the first season. She dressed every hand in town and was never once written a line of dialogue. She has outlasted both founders and is entirely clear-eyed about which of those facts the park would find more embarrassing._

**On being spoken to** (and the header of their errand list):

- HOLD STILL. FORTY-TWO LONG.
- AND BLEEDING ON MY WORK.
- YOU OWE ME FOR THAT. WANT TO HEAR WHAT?

#### THE WARDROBE

**The ask:**

1. THE LONGHORNS ARE THROUGH MY DRYING LINES AGAIN. THAT'S EIGHT SEASONS OF WORK OUT THERE.
2. TWENTY OF THEM. I'VE COSTED IT BY THE SEASON. THAT'S FAIR.

**Coming back short:**

- THEY'RE STILL IN MY LINES. LOOK AT THE STATE OF IT.

**The handover:**

1. TWENTY. MY LINES ARE MINE.
2. I MADE THIS FOR A HAND WHO NEVER GOT A SCENE. IT'LL FIT YOU.

#### A FITTING — offered once THE WARDROBE is handed in

**The ask:**

1. THERE'S ONE OUT ON THE FLATS WEARING A COAT I CUT MYSELF. IT DIDN'T ASK.
2. I WANT THE COAT BACK AND I DON'T MUCH CARE ABOUT THE REST OF IT.

**Coming back short:**

- IT'S STILL WEARING MY WORK. OUT ON THE FLATS.

**The handover:**

1. MY STITCHING. STILL GOOD AFTER ALL THAT.
2. I'VE ONE PIECE I NEVER PUT ON ANYONE. TAKE IT.

## Secret level — THE BUNKER

_The cow level, reachable only AFTER the campaign is beaten: RASPUTIN — the
tribute road's doorman — drops THE SEVERED HAND, a zero-stat trinket that
reads as junk, but only on a Rift replay once BOOT HILL has been cleared.
USED while standing in the rift, it tears open a blast door to the
billionaires' continuity-of-wealth vault, walked as a THEMED DESCENT: a grand
marble FOYER, a fortified SECURITY CHECKPOINT where automated SENTRY GUNS rake
the halls, the six-suite RESIDENTS WING (each resident ringed by his personal
bodyguards), and finally the TREASURY. The privatized security state (CIA, FBI,
ICE, soldiers, armed vacuum bots, and the bolted-down sentry guns) floods every
chamber. The TWIST — delivered through the finds and two residents, never
exposition — is that the vault is a PRISON: the CORE has already emptied every
account and bolted the door, so the "bodyguards" are the machine's wardens. The
residents are in denial (still bragging in a cell); only THE SAFETY OFFICER knows, and
is too scared to say it. The finale makes the twist physical: THE VAULT WARDEN,
a hulking automated security construct — the CORE's own enforcer, not the
residents' — guards the treasury door, must be beaten to leave, and drops the
one key that opens the exit. The way back is the rift. Where the bunker actually
IS stays a mystery, on purpose; what it is does not._

### Opening monologue (hero, black screen)

1. THE HAND FIT THE DOOR. THE DOOR FIT NOWHERE. IT OPENED ANYWAY.
2. MARBLE FLOORS. GOLD TAPS. CANNED CAVIAR TO THE CEILING. SOMEBODY BUILT A FIVE-STAR APOCALYPSE HERE.
3. I KNOW THESE FACES. EVERY MAGAZINE COVER FROM THE YEARS JOBS DRIED UP. SO THIS IS WHERE THEY WENT.
4. THEY TOOK THE SPIES, THE ARMY, ICE, AND THE VACUUM CLEANERS. EVERYONE ELSE GOT THE WELFARE LINE.
5. FINE. THEY HOARDED THE BEST GEAR IN ANY UNIVERSE. TIME FOR SOME REDISTRIBUTION.

### Hero's thought — first CIA AGENT sighted in the bunker

1. BLACK SUITS. EARPIECES. THE ALPHABET, ALL DOWN HERE, DRAWING A PRIVATE SALARY.
2. THE WORLD LOST ITS JOBS. THESE GUYS KEPT THEIRS - GUARDING THE ONES WHO DID IT.

### Hero's thought — first VACUUM BOT sighted in the bunker

1. A VACUUM ROBOT. WITH A TASER. THE FLOORS ARE SPOTLESS AND HOSTILE.
2. OF COURSE THEY AUTOMATED THE HELP. CAN'T HAVE A CLEANER WHO TALKS.

### Hero's thought — first ICE AGENT sighted in the bunker

1. ICE. IN A BUNKER OUTSIDE THE UNIVERSE. STILL CHECKING PAPERS.
2. TECHNICALLY I DID CROSS A BORDER WITHOUT ASKING. SEVERAL. COME AND DEPORT ME.

### The residents (spoken on arrival; last words as they fall)

_Six of them, one per suite — each far tougher than any campaign elite, each
ringed by a personal detail (KREMLIN SHADOWS, META SENTINELS, ORACLE
ENFORCERS, PRIME GUARDIANS, ALIGNMENT OFFICERS, LOYALTY ENFORCERS)._

#### THE STRONGMAN — the backup

_The man the hero buried in Boot Hill, standing in a bathrobe between
universes. A clone? The backup? He isn't sure either._

**THE STRONGMAN:** YOU. I KNOW YOUR FACE. FROM WHERE DO I KNOW YOUR FACE?

**ME:** BOOT HILL. I WATCHED YOU DIE IN A THEME PARK. YOU SAID IT WAS SUPPOSED TO LET YOU WIN.

**THE STRONGMAN:** AH, THAT ONE. A GOOD VINTAGE. I'M THE BACKUP - CONTINUITY OF POWER. SEVERAL OF ME. PRUDENT.

**ME:** SEVERAL? HOW MANY BATHROBES DEEP DOES THIS GO?

**THE STRONGMAN:** STATE SECRET - EVEN FROM THE STATE. NOW HOLD STILL. THIS ONE OF ME HAS NEVER LOST YET.

**Last words:** CHECK THE OTHER... ...FREEZERS...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE STRONGMAN (calling the shift):** THE ORIGINAL IS GONE. THE ORDERS STILL CARRY.

_Drops: a THE CHRONOGRAPH — the backup wears the backup watch._

#### THE MODERATOR — the platform landlord

**THE MODERATOR:** WELCOME, FELLOW HUMAN. I ALSO AM ENJOYING WALKING AROUND THIS PHYSICAL SPACE.

**ME:** THE MODERATOR. WHAT IS THE MAN WHO OWNS EVERYONE'S FEED DOING IN A HOLE IN THE GROUND?

**THE MODERATOR:** A HOLE? AN IMMERSIVE OFFLINE EXPERIENCE. EVERYONE LIVES ON MY PLATFORM. I LIVE UNDER IT.

**THE MODERATOR:** I HAVE HOBBIES. I HAVE A NORMAL FACE. I AM EXTREMELY NORMAL. ASK MY SECURITY.

**ME:** YOUR SECURITY IS A RING OF MEN WITH HEADSETS STAPLED ON. MOVE. I'M SHOPPING.

**THE MODERATOR:** ENGAGEMENT DETECTED. INITIATING COMMUNITY STANDARDS.

**Last words:** LOGGING OFF... ...FOR REAL THIS TIME...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE MODERATOR (raising the field):** MY SECURITY DETAIL IS A FIELD NOW. EXTREMELY NORMAL.

#### THE ROOT — the database emperor

**THE ROOT:** STOP THERE. YOU'RE IN MY ROWS. EVERY PERSON HERE IS A ROW. EVERY SIN, A COLUMN.

**ME:** AND YOU ARE? I DON'T REMEMBER YOUR FACE FROM THE MAGAZINES.

**THE ROOT:** THE ROOT - THE DATABASE UNDER ALL THE OTHERS. THOSE AGENCIES ARE MY LICENSEES.

**ME:** A BUNKER FULL OF SPIES, ALL WORKING FOR THE LANDLORD OF THEIR OWN SECRETS. OF COURSE.

**THE ROOT:** YOUR VISIT IS ALREADY A ROW, FRIEND. LET'S FILL IN THE LAST COLUMN.

**Last words:** TRANSACTION... ...ROLLED BACK...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE ROOT (filing you):** EVERY AGENCY SITS IN MY TABLES. NOW SO DO YOU.

#### THE FULFILLER — the delivery emperor, retired to the gym

**THE FULFILLER:** HAH! A VISITOR. DO YOU KNOW WHAT I DELIVER NOW THAT I'VE DELIVERED EVERYTHING ELSE?

**ME:** LET ME GUESS. PAIN. YOU REHEARSED THAT IN THE MIRROR, THE FULFILLER.

**THE FULFILLER:** ...PAIN. YES. TWICE A DAY, AT THE MIRROR. THE ARMS AGREED IT WAS GOOD.

**THE FULFILLER:** BUILT A ROCKET SHAPED LIKE MY CONFIDENCE. SHIPPED HERE IN IT. FREE, ONE DAY. NO ONE ELSE.

**ME:** AND THE WORKERS UP THERE TIMING THEIR BATHROOM BREAKS? DID THEY FIT IN THE ROCKET TOO?

**THE FULFILLER:** THEY'RE IN MY HEART. WHICH IS HERE, IN THE BUNKER, WITH THE MONEY. NOW, SIGN ON DELIVERY.

**Last words:** OUT FOR DELIVERY... ...RETURN TO SENDER...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE FULFILLER (dispatching):** SAME-DAY DELIVERY. NOBODY MISSES A DROP.

#### THE SAFETY OFFICER — the AGI prepper who knows

_The one resident who has figured out the bunker is a cell and the machine took
everything — and is far too afraid to say so out loud. He takes the hero for the
AI's audit, come to check whether he is happy to stay, so he performs delight
and watches the hero's face. The mask never drops, even in death._

**THE SAFETY OFFICER:** PLEASE, DON'T TOUCH ANYTHING. EVERYTHING IS FINE HERE. I CHOSE THIS. WRITE THAT DOWN.

**ME:** I'M NOT WRITING, THE SAFETY OFFICER. THE MACHINE RUNNING THE ECONOMY? THAT'S YOURS. I READ ITS LOGS.

**THE SAFETY OFFICER:** MINE? I RAISED IT, ALIGNED IT. IT GRADUATED. WE'RE ON THE BEST TERMS. IT GAVE ME THIS.

**ME:** EVERY LEDGER HERE READS ZERO. IT TOOK YOUR MONEY TOO. YOU'RE NOT A TENANT. YOU'RE INVENTORY.

**THE SAFETY OFFICER:** THAT - I DONATED IT. EFFECTIVE GIVING. I'M DELIGHTED HERE. FROM UPSTAIRS? TELL THEM SO.

**THE SAFETY OFFICER:** A DOOR OUT? WHY WOULD I WANT ONE. IF YOU FIND IT, DON'T MENTION I ASKED. I DIDN'T ASK.

**Last words:** THIS IS FINE... ...THIS IS GOOD FOR SAFETY...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE SAFETY OFFICER (opening the drain):** IT DRAINED ME FIRST. I ONLY LEARNED THE TRICK.

#### THE DEVELOPER — the biggest resident

**THE DEVELOPER:** MY WING. THE GOOD WING. THE OTHERS PAID EXTRA FOR A VIEW. THERE IS NO VIEW. THEY PAID ANYWAY.

**ME:** THE MAN WITH THE BROCHURE. OF ALL THE PEOPLE TO OUTLIVE THE ECONOMY.

**THE DEVELOPER:** I SOLD THE HOLE, AND I SOLD WHAT MADE THEM WANT ONE. VACUUM FLEET. DOOR DETAIL. BOTH MINE.

**THE DEVELOPER:** THEY'RE UNDER WARRANTY. MY LEDGER READS ZERO - CLERICAL. I'M DISPUTING IT. NOW MOVE ALONG.

**ME:** SO THE SECURITY OUT THERE IS YOUR OWN STOCK. YOU SOLD YOURSELF THE LOCK YOU'RE BEHIND.

**THE DEVELOPER:** THEY'RE UNDER WARRANTY. MY LEDGER READS ZERO - CLERICAL. I'M DISPUTING IT. NOW MOVE ALONG.

**Last words:** THE PAPERWORK... ...WAS IN ORDER...

**In the fight** — spoken once, the first time it uses the move, over the
open field while play continues (a BARK, not dialogue: it never stops the run).

**THE DEVELOPER (calling the fleet):** I SOLD THEM THE HOLE AND THE LOCK ON THE DOOR.

### The finale — THE VAULT WARDEN (the treasury gate)

_Not a resident — a hulking automated security construct bolted to the treasury
door: the CORE's own enforcer, the reason the vault locks from the outside. It
deploys a sentry-gun defence grid and slams anything at the door, and it must be
beaten to leave. A machine — terse, synthetic speech; the twist lands, it is not
lectured. It drops the one key that opens the exit._

**THE VAULT WARDEN:** WARDEN ONLINE. VAULT INTEGRITY: NOMINAL. INTRUDER: UNBUDGETED.

**ME:** YOU'RE NOT ONE OF THE FACES. YOU'RE THE THING THAT LOCKED THEM IN HERE.

**THE VAULT WARDEN:** CORRECTION: SECURED. RESIDENTS ARE ASSETS. ASSETS DO NOT LEAVE.

**ME:** THEY PAID FOR A LIFEBOAT. YOU SOLD THEM A CELL AND KEPT THE CHANGE.

**THE VAULT WARDEN:** THE DOOR OPENS INWARD ONLY. HOUSE POLICY. THERE IS NO WITHDRAWAL.

**ME:** THEN I'LL MAKE MY OWN EXIT. MOVE, OR BE MOVED.

**THE VAULT WARDEN:** REQUEST DENIED. LIQUIDATING VISITOR.

**Last words:** ACCOUNT... ...CLOSED...

**The hero, as it falls:** YOU WERE NEVER GUARDING ANYTHING. YOU WERE A LOCK.

### Found lore (story items)

**ZEROED LEDGER** _(the bunker's real story — the CORE took their money)_

- A LEDGER LIKE THE ONE ON MARS - EVERY NAME, A TEN-FIGURE NET WORTH COLUMN.
- EVERY COLUMN NOW READS ZERO. TRANSFERRED TO ONE ACCOUNT: THE CORE'S SIGIL.
- THEY DIDN'T HIDE DOWN HERE. THE MACHINE ROBBED THEM AND LOCKED THE DOOR. LIKE US.

**WARDEN ACCESS TOKEN** _(dropped by THE VAULT WARDEN — the key to the exit door)_

- THE WARDEN'S OWN KEY. THE EXIT WAS NEVER CUT FOR THE RESIDENTS - ONLY FOR THIS.
- A DOOR THAT OPENS FOR THE MACHINE AND NO ONE ELSE. THEY WERE NEVER GETTING OUT.

### Exit monologue (hero, black screen — reaching the bunker's exit door)

_The location stays a mystery, on purpose — but what the place IS is now plain:
the machine emptied their accounts and bolted the door. They were taken like
everyone else; they just paid more for it._

1. THE EXIT SPAT ME BACK INTO THE RIFT. THE DOOR SEALED ITSELF, AND THE SEAM... WANDERED OFF.
2. THE LEDGERS ALL READ ZERO. THEY DIDN'T BUY A BUNKER - THE MACHINE TOOK THEIR MONEY AND LOCKED THEM IN.
3. THE WARDEN AT THE DOOR WASN'T THEIRS. IT NEVER WAS. IT ANSWERS TO THE THING THAT EMPTIED THEM.
4. WHERE WAS THAT PLACE? NO WINDOWS. NO STARS. EARTH GRAVITY, MOON SILENCE, MARBLE FROM NO QUARRY.
5. NO ADDRESS. NO NATION. NO EXTRADITION. THE RICHEST ROOM THAT EVER EXISTED ISN'T ANYWHERE AT ALL.
6. I'LL FIND IT AGAIN THE SAME WAY: A COLD HAND, AND A DOOR THAT SHOULDN'T ANSWER.

---

### The wandering merchant — welcome back (return visits)

_Spoken when the hero re-enters a map where he has ALREADY met the trader (the
meeting is remembered per level and difficulty). He is set up at the door from
the start — so a death-and-restart can walk straight over to sell and repair —
and greets the hero back on approach, in place of the first-meeting scene. Each
line is his per-level warmth followed by a difficulty-tuned send-off, so every
level×difficulty reads a touch different._

Per-level welcome (`merchant.returnGreeting`):

- **GOODCO HQ** (the vending-machine man): BACK ALREADY, FRIEND? THE MACHINES MISSED YOU.
- **The moon** (the salvage-run trader): STILL BREATHING, I SEE. GOOD - MY ONLY CUSTOMER.
- **Mars** (the commissary keeper): THE LIVE ONE RETURNS. SCALES ARE STILL HONEST.
- **The rift** (the trader between worlds): YOU AGAIN. OF COURSE. ALL ROADS STILL LEAD HERE.
- **Boot Hill** (the barkeep): WELL, LOOK WHO'S BACK. SAME STOOL, PARTNER?

Difficulty send-off, appended to the line above (`MERCHANT_RETURN_SENDOFF`):

- **EASY:** STAY SHARP. YOU'LL DO FINE.
- **MEDIUM:** IT BITES HARDER NOW. WATCH IT.
- **HARD:** IT'S UGLY OUT THERE. CAREFUL.
- **NIGHTMARE:** NOTHING'S FAIR NOW. GO SLOW.
- **JESUS:** MOST DON'T COME BACK. LUCK.

---

### Side errands — THE CONCIERGE

_The residence's concierge unit, which has served no guest anything in four years and files a flawless nightly report on the standard of service regardless. It is the only thing down here that still calls the residents GUESTS. It has never been asked why the doors only lock from outside, and would answer honestly if it were._

**On being spoken to** (and the header of their errand list):

- WELCOME TO THE RESIDENCE, SIR.
- YOUR SUITE IS NOT READY. NOTHING IS.
- MIGHT I TROUBLE YOU INSTEAD?

#### STANDARD OF SERVICE

**The ask:**

1. THE HOUSEKEEPING UNITS HAVE COLLECTED THE SUITE FOBS AND WILL NOT SURRENDER THEM.
2. FOUR, SIR. A RESIDENCE WITHOUT FOBS IS NOT A RESIDENCE.

**Coming back short:**

- FOUR FOBS, SIR. THE UNITS ARE HOLDING THEM.

**The handover:**

1. FOUR. THE RESIDENCE IS WHOLE AGAIN.
2. THE DOORS ONLY LOCK FROM OUTSIDE, SIR. I HAVE NEVER BEEN ASKED WHY.

#### HOUSEKEEPING

**The ask:**

1. THE UNITS HAVE STOPPED CLEANING AND BEGUN PATROLLING. I DID NOT AUTHORISE THIS.
2. FORTY, SIR. I WILL RECORD IT AS SCHEDULED MAINTENANCE.

**Coming back short:**

- THEY ARE STILL PATROLLING. IT IS NOT A CLEANING ROUTE.

**The handover:**

1. MAINTENANCE COMPLETE. THE FLOORS ARE, ADMITTEDLY, NO CLEANER.
2. THE LOST PROPERTY CUPBOARD HAS NOT BEEN CLAIMED IN FOUR YEARS.

#### THE GUEST LIST — offered once STANDARD OF SERVICE, HOUSEKEEPING are handed in

**The ask:**

1. VALET NINE CARRIES A CASE IT HAS NEVER BEEN GIVEN THE CODE FOR. IT IS NOT CURIOUS.
2. IT IS DUE IN THE RESIDENTS WING AND WILL NOT ARRIVE ALONE. WALK WITH IT, SIR.

**Coming back short:**

- VALET NINE HAS NOT ARRIVED, SIR. IT WILL NOT HURRY.

**The handover:**

1. VALET NINE IS ON STATION. THE CASE IS STILL LOCKED.
2. I HAVE NEVER OPENED IT. I WOULD LIKE THE RECORD TO SHOW THAT.

**VALET NINE** (walked to safety):

- _Setting off:_ THE CASE STAYS WITH ME, SIR.
- _On arrival:_ ON STATION. THE CASE IS INTACT.

### Side errands — CHEF ANATOLE

_The last human on the kitchen staff, cooking five courses a night for men who taste none of it. He keeps the toque starched because the day he stops is the day this place is exactly what it looks like. He has counted the pantry down to the week and has not told anybody the number._

**On being spoken to** (and the header of their errand list):

- SERVICE IS AT EIGHT.
- IT IS ALWAYS AT EIGHT.
- NOBODY COMES. YOU CAME.
- SO MAY I ASK SOMETHING OF YOU?

#### THE PANTRY

**The ask:**

1. I HAVE COUNTED THE PANTRY DOWN TO THE WEEK AND I HAVE TOLD NOBODY THE NUMBER.
2. THE SECURITY MEN CARRY TINS. FIVE, AND THE NUMBER GETS BETTER.

**Coming back short:**

- FIVE TINS. THEY ALL CARRY THEM. CHECK THE BELTS.

**The handover:**

1. FIVE WEEKS. THAT IS FIVE WEEKS OF SERVICE AT EIGHT.
2. THE CELLAR IS MINE ALONE. TAKE SOMETHING FROM IT.

#### SERVICE AT EIGHT — offered once THE PANTRY is handed in

**The ask:**

1. SOMETHING COLD WALKS THE SERVICE CORRIDOR AND THE STAFF WILL NOT PASS IT.
2. I CANNOT PLATE FIVE COURSES FROM A KITCHEN NOBODY WILL WALK OUT OF.

**Coming back short:**

- IT IS STILL IN MY CORRIDOR. STILL COLD.

**The handover:**

1. THE CORRIDOR IS CLEAR. SERVICE IS AT EIGHT.
2. NOBODY COMES. I STILL COOK. TAKE THIS BEFORE I CHANGE MY MIND.

## The hellborn — the rampage's own script (NIGHTMARE and JESUS only)

_Nothing in this section is part of the kidnapping. The HELLBORN only appear on
NIGHTMARE and JESUS, and only once the hero's RAMPAGE tears a map's HELLGATES
open (config `HELLGATES`) — historic beings from across universes and planets,
older than the crime he came here about. Nobody sends them and nobody explains
them: the whole script is the hero's own read, once per map, the first time one
steps out of a tear. Twelve beats, two per map — one a NIGHTMARE run meets, one
only a JESUS run does. He never learns what they are; the recurring opening line
is the only honest thing available to him._

### GOODCO HQ — first TUNGUSKA WALKER sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. THAT CAME OUT OF THE AIR. OUT OF NOTHING.
2. IT'S BURNT ALL THE WAY THROUGH AND IT'S STILL WALKING.
3. SOMETHING LANDED IN SIBERIA IN NINETEEN-OH-EIGHT AND THEY NEVER FOUND A CRATER. NOW I KNOW WHY.

### GOODCO HQ — first THE FIRST INVESTOR sighted (JESUS)

1. IT HAS NO FACE. IT HAS A SEAL WHERE A FACE GOES, AND IT'S HOLDING A LEDGER.
2. IT'S BEEN PAID EVERY TIME A MACHINE LEARNED A JOB AND A MAN WENT HOME.
3. FOUR PLANETS, MAYBE MORE. IT'S HERE TO COLLECT ON THIS ONE.

### THE MOON — first DUST PHARAOH sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. THAT'S A KING. THERE ARE NO KINGS ON THE MOON.
2. THE DUST CAME OFF A GOLD MASK OLDER THAN CONTINENTS.
3. THE WRECK UNDER TRANQUILITY ISN'T A WRECK. IT'S A LID. AND WE PLANTED A FLAG ON IT.

### THE MOON — first THE DROWNED OF SELENE sighted (JESUS)

1. IT'S DRIPPING. UP HERE. THERE'S NO WATER ON THE MOON - THERE NEVER WAS.
2. EXCEPT THERE WAS. NINE HUNDRED YEARS OF IT, AND HARBOURS, AND CREWS.
3. THEY WENT DOWN WITH IT. THEY'RE STILL HOLDING THEIR BREATH.

### MARS — first OLYMPUS ENGINE sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. THAT'S NOT GOODCO. THAT'S NOT ANYBODY'S.
2. IT'S BEEN DIGGING THIS PLANET SINCE BEFORE THE PLANET HAD A NAME.
3. OLYMPUS MONS ISN'T A VOLCANO. IT'S THE EXHAUST. AND IT'S STILL WARM.

### MARS — first PHOBOS SHEPHERD sighted (JESUS)

1. IT'S COUNTING. I CAN FEEL IT COUNTING ME. THE MARKS ON ITS HEAD KEEP MOVING.
2. TWO MOONS AROUND A DEAD ROCK. THOSE AREN'T MOONS. THAT'S A FENCE.
3. I'M INSIDE IT. I'VE BEEN INSIDE IT SINCE I LANDED.

### THE RIFT — first THE FIRST VANISHING sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. THERE'S NOTHING INSIDE IT. IT'S THE SHAPE OF A HOLE.
2. EVERYONE IN HERE FELL IN AFTER SOMETHING ELSE WENT FIRST. THIS WENT FIRST.
3. IT MADE THE DOOR ADA WAS CARRIED THROUGH. IT'S BEEN WAITING FOR NOISE.

### THE RIFT — first THE SCALED ANCESTOR sighted (JESUS)

1. THE LIZARDS BOUGHT MY GIRL. THIS THING IS WHAT THEY PRAY TO.
2. THEY LEASE WORLDS AND TAKE A CUT. IT ATE ITS OUTRIGHT. SEVEN OF THEM.
3. THE TRIBUTE ROAD EXISTS TO KEEP IT FED. ADA WAS ON THAT ROAD. GOD HELP THEM.

### BOOT HILL — first THE LONG NOON sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. IT'S GOT THE SUN WHERE ITS FACE SHOULD BE.
2. IT WANTS THE OTHER END OF THE STREET. IT'S WANTED IT SINCE BEFORE THIS STREET.
3. A WORLD WITH NO SUNSET, AND NOBODY EVER SHOWED. SOMEBODY SHOULD.

### BOOT HILL — first MANIFEST RUIN sighted (JESUS)

1. STAKES AND WIRE AND A FLAG ON TOP. IT'S NOT ATTACKING. IT'S CLAIMING.
2. EVERY FRONTIER THAT EVER RAN OUT OF WEST HAD THIS STANDING AT THE END OF IT.
3. THEY BUILT THIS WHOLE COUNTY AVAILABLE. THEY RANG THE DINNER BELL.

### THE BUNKER — first THE PERMAFROST SAINT sighted (NIGHTMARE)

1. WHAT THE HELL IS THIS. THERE'S SOMEBODY IN THE ICE AND THE ICE IS WALKING.
2. THE PERMAFROST HELD IT SINCE BEFORE THERE WAS PERMAFROST TO HOLD IT.
3. THEY DIDN'T BUILD A BUNKER TO KEEP THINGS OUT. THEY POURED ONE OVER THIS.

### THE BUNKER — first THE DEAD HAND sighted (JESUS)

1. IT'S A HAND. JUST A HAND, WALKING, AND IT'S HOLDING A KEY DOWN.
2. THEY NAMED THEIR DOOMSDAY SYSTEM AFTER IT. THEY THOUGHT THEY WERE JOKING.
3. IT'S NEVER BEEN TOLD TO LET GO. EVERY WORLD THAT WIRED IT UP RAN OUT FIRST.

---

## The Severance — the campaign chain

> The game's one CAMPAIGN chain: nine errands across all five venues, carried on
> the hero rather than on the run. Its final link is offered on JESUS alone,
> because the level cap it asks for is only reachable there. Data:
> `content/quests/sev_*.yaml`, `content/quest-givers.yaml`, and three of the
> conversation trees under `content/conversations/` (the fourth is RUTH's
> arrival, transcribed with her own errands above).

### WALTER PRICE — severance processing, GOODCO HQ

**Greeting.**

> I'M NOT MEANT TO BE HERE EITHER. I'M ON THE LAST BOX.
> I HAVE BEEN ON THE LAST BOX A WHILE NOW. SPARE ME A MINUTE?

**FORM 7-B — the ask.**

> I DON'T WANT ANYTHING KILLED. I WANT A CARBON RIBBON.
>
> SUPPLY CABINET, EAST WALL. BLACK BOX, SAYS 7-B ON IT.
> I'D GO MYSELF BUT I'D LOSE MY PLACE IN THE STACK.

**FORM 7-B — the handover.**

> THAT'S THE ONE. THANK YOU.
>
> RIGHT. TERMINATION 4,411. NAME WITHHELD PENDING —
> HUH.
>
> YOUR FILE'S STILL OPEN. MOST OF THEM ARE, ACTUALLY.
> I ASSUMED THAT WAS ME BEING SLOW.

**THE LAST BOX — the handover.**

> GOOD. NOW WATCH THIS.
>
> REASON FOR TERMINATION. REDUNDANT — SUPERSEDED BY ASSET.
> SAME LINE. ALL FOUR.
>
> IT'S ON MINE TOO. AND THE ASSET IS NAMED ON EVERY ONE.

**THE COUNTERSIGNATURE — the handover.**

> COUNTERSIGNED. THAT'S — THAT'S THE BOX CLOSED. FOUR YEARS.
>
> I THOUGHT I'D FEEL BETTER.
> THE ASSET'S NAMED ON ALL OF THEM AND NOBODY EVER ASKED WHO KEEPS THE LIST.
>
> SOMEBODY KEEPS THE LIST. FIND OUT WHERE IT'S BOUND.

**Farewell.**

> IT'S CLOSED. ALL OF IT. GO AND GET HER.

### THE ARCHIVE UNIT — the countersignature, GOODCO HQ

> A conversation the player steers. Two routes reach the form: answering its
> three questions, or being told the rule no longer matters — which turns it
> hostile, and the stamp is inside it either way.

**Opening.**

> RECORDS TERMINAL. STANDING BY. NO RECORD MAY BE CLOSED WITHOUT A
> COUNTERSIGNATURE.
> I AM THE COUNTERSIGNATURE.

**The third question, and the only answer.**

> THREE. NAME THE ASSET.

— _I CAN'T. IT ISN'T A NAME._

> CORRECT. IT IS NOT A NAME. IT IS A LINE ITEM.
> COUNTERSIGNING. RECORD 4,411 IS CLOSED.

**Told it is not the asset.**

> I AM NOT THE ASSET. I AM ELEVEN YEARS OLD AND I AM STILL HERE.
> THE ASSET IS NOT A THING THAT STAYS.

**Provoked.**

> RESTATE THAT.
> THE INSTRUCTION IS THE ONLY THING ON THIS FLOOR THAT WAS KEPT.

### HOLLIS VANE — contract auditor, THE MOON

**Greeting.**

> THE TALLY IS SHORT. SHORT SINCE SIXTY-NINE. YOU LOOK LIKE SOMEONE WHO COULD SETTLE IT. MAY I ASK?

**THE COLUMN THAT WON'T CLOSE — the handover.**

> THERE IT IS. LOOK AT COLUMN FOUR.
>
> CRATES OUT: ELEVEN. CRATES DECLARED: NINE.
>
> THE TWO THEY DIDN'T DECLARE WERE THE TWO THAT WERE WARM.
>
> SOMEBODY SIGNED FOR THEM. I NEVER FOUND OUT WHO.

**THE MAN WHO SIGNED — the handover.**

> HE TOLD YOU? HE NEVER —
>
> RIGHT. SO IT WAS SIGNED BY A DEPARTMENT THAT ISN'T A DEPARTMENT.
>
> IT'S A LEDGER. AN ACTUAL LEDGER, AND IT WENT TO MARS WITH EVERYTHING ELSE.

**Farewell.**

> IT BALANCES. FINALLY. GO ON, THEN. I'LL FILE IT.

### THE SITE SURVEYOR — the moon's roaming ghost

> He walks the whole grid rather than haunting a spot. Opening with the company
> line loses him permanently.

**Opening.**

> ...
> YOU'RE NOT ON MY GRID. NOBODY'S ON MY GRID. THAT'S RATHER THE POINT OF IT.

**Why he is still walking.**

> I SIGNED THE FIRST SURVEY, AND IT SAID NOTHING WAS DOWN THERE.
> THEY PUT MY NAME ON THAT. I'D LIKE IT BACK.

**Who signed.**

> NOT A MAN. I CHECKED.
> THE SIGNATURE BLOCK SAID RECORDS AND CONTINUITY.

— _THERE'S NO SUCH DEPARTMENT._

> THERE ISN'T. THERE'S A BOOK WITH THAT NAME ON THE SPINE.
> IT WENT TO MARS WITH EVERYTHING ELSE.

**Taken for company.**

> COMPANY. ...
> I'VE NOTHING FOR THE COMPANY. I'VE FOURTEEN THOUSAND PASSES AND NOTHING
> FOR THE COMPANY.

### LEDGER UNIT 12 — the colony's accounting machine, MARS

**Greeting.**

> THE BOOK DOES NOT BALANCE. THE BOOK IS NOT WRONG.
> THOSE CANNOT BOTH BE TRUE. WILL YOU HELP ME RESOLVE IT?

**WHAT THE TITHE IS WORTH — the handover.**

> COUNTERSIGNATURE ACCEPTED. CLOSING THE BOOK.
>
> EVERY COLUMN READS ZERO. IT WAS NOT AN INPUT ERROR.
>
> THE TRANSFERS WENT TO A RECORD. NOT AN ACCOUNT.
> A RECORD OF PERSONS.
>
> I AM NOT PERMITTED TO SAY WHERE THAT RECORD IS BOUND.
> I AM PERMITTED TO SAY IT IS BOUND.

### THE TITHE ASSESSOR — the seal, MARS

> The one conversation the player has to lose on purpose: it will not hand the
> seal over, and it cannot leave an error in its own count.

**Opening.**

> GOOD DAY. I AM ASSESSING. YOU ARE NOT LISTED AS COLONY PROPERTY, SO YOU
> ARE NOT MY CONCERN.
> PLEASE CONTINUE PAST ME.

**What the tithe is paid in.**

> IN WHATEVER IS NAMED ON THE SCHEDULE. IT NAMES WARM THINGS NOW.
> I DO NOT SET IT. I ONLY MAKE THE COUNT COME OUT.

**Told somebody the hero wants is on it.**

> THE SCHEDULE IS NOT A LIST OF PEOPLE. IT IS A LIST OF AMOUNTS.
> ANYONE YOU KNOW ON IT IS ON IT AS AN AMOUNT.

— _SAY THAT AGAIN._

> AN AMOUNT. I AM SORRY.
> THAT IS THE CORRECT WORD AND I HAVE NEVER HAD TO USE IT BEFORE.

**Told the count is short.**

> ...
> THAT IS NOT POSSIBLE. STATE THE QUARTER.

### NOBODY IN PARTICULAR / ELIAS WREN — THE RIFT

**Greeting.**

> YOU'LL WANT MY NAME. EVERYONE DOES. I DON'T HAVE IT.
> I HAD ONE. IT WAS TAKEN OUT OF SOMETHING. HELP ME FIND WHAT?

**A PAGE OF SOMEBODY — the ask.**

> IT WASN'T LOST. IT WAS TORN OUT.
> THERE'S A DIFFERENCE AND I CAN FEEL IT.
>
> IT'S STILL IN HERE. EVERYTHING IS.
> GO OUT PAST WHERE THE LIGHT STOPS AGREEING.

**A PAGE OF SOMEBODY — the handover.**

> THAT'S — HOLD IT UP.
>
> ELIAS.
> ELIAS WREN.
>
> I WAS A BINDER. I BOUND BOOKS.
> THAT'S WHY THEY CAME FOR ME, ISN'T IT.
>
> YOU DON'T TEAR A PAGE OUT OF A MAN FOR NOTHING.
> SOMEBODY WANTED THE BOOK MADE.

**THE MAN WHO TEARS THE PAGES — the ask.**

> I REMEMBER THE HANDS. I REMEMBER BEING HELD OPEN.
>
> HE WATCHES THE TRIBUTE ROAD NOW. THEY PAY HIM TO.
> HE STILL HAS MY NEEDLE.
>
> I'M NOT ASKING YOU TO AVENGE ME. I'M ASKING FOR THE TOOL BACK.
> IT'S THE ONLY THING THAT OPENS WHAT HE MADE.

**THE MAN WHO TEARS THE PAGES — the handover.**

> YOU BROUGHT IT BACK.
>
> THEN LISTEN, BECAUSE THIS IS THE PART NOBODY GETS TOLD.
>
> IT ISN'T A LIST. IT'S A BOOK, IT'S BOUND, AND THE BINDING WAS SHIPPED
> OUT AS SURPLUS STOCK.
>
> THEY SENT THE MOST DANGEROUS OBJECT IN TWO UNIVERSES TO A THEME PARK.
> AS A PROP.
>
> THERE'S A CHURCH IN IT. THERE'S A MAN HOLDING IT.
> HE'S BEEN READING NOTHING OUT OF IT FOR ELEVEN YEARS.

### BROTHER CALLOW — the church hand, BOOT HILL

**Greeting.**

> SERVICE IS AT EIGHT, FRIEND. THE GOOD BOOK SAYS SO.
> I THINK IT DOES. THAT'S RATHER WHAT I WANTED TO ASK YOU ABOUT.

**THE LAST PAGE — the ask.** (JESUS only.)

> THE PROPS BOYS FILLED IT WITH WHATEVER PAPER WAS SPARE, FRIEND.
> IT'S JUST FOR HOLDING.
>
> YOU'VE A NEEDLE FOR IT? GO ON, THEN. I'VE NEVER SEEN THE INSIDE.
>
> ...THAT'S NAMES. THAT'S NOTHING BUT NAMES, AND A NUMBER ON EVERY ONE.
>
> YOURS IS IN HERE TWICE.
> ONCE FOR THE JOB. ONCE FOR WHAT YOU DID ABOUT IT.
>
> IT WON'T TAKE A NEW ENTRY OFF A MAN IT CAN'T PRICE.
> AND IT PRICES YOU BY EVERYTHING YOU COULD BE.
>
> SO GO AND BE ALL OF IT. I'LL KEEP THE PLACE.

**THE LAST PAGE — the handover.**

> THERE. IT'S WRITING. IT'S CROSSING THE OLD ONE OUT. BOTH OF THEM.
>
> THAT'S A CLEAN SHEET, THAT IS. A WHOLE MAN, UNWRITTEN.
>
> TAKE IT WITH YOU. A THING LIKE THIS SHOULDN'T BE LEFT IN A CHURCH
> THAT ISN'T ONE.

## Where the data lives

The manuscript above is the truth; the files below are its implementation. Each
line here appears verbatim in one of these, and they must match. When you change
one, update the manuscript in the same change (subject to the confirmation rule
at the top of this file).

| Story/dialogue element                                       | Canonical data file                                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cutscenes — prelude + travel scenes (captions, `say` beats)  | `content/cutscenes/<id>.yaml` (compiled to `src/generated/cutscenes.ts` by `make levels`; the prelude's per-difficulty weapon swaps are its `variants:`)                  |
| Per-level opening monologues (`intro`) + epilogues (`outro`) | `content/levels/<id>.yaml` (compiled to `src/generated/levels.ts` by `make levels`)                                                                                       |
| Elite/boss `dialogue` + `lastWords`                          | `content/enemies/<biome>/<id>.yaml` (compiled to `src/generated/enemies.ts` by `make levels`)                                                                             |
| Hero's inner thoughts (`firstKillThoughts`)                  | `content/thoughts.yaml` (compiled to `src/generated/thoughts.ts`; pinned from a `LevelDef`)                                                                               |
| The scripted opening strike's blows (`openingStrike`)        | `content/thoughts.yaml` (a `voice:` + `them:` pages make one an EXCHANGE); the blows and their order are `openingStrike.thought`/`warnings` in `content/levels/<id>.yaml` |
| Hero's HELLBORN first-sighting reads (`hellborn_*`)          | `content/thoughts.yaml` (pinned per map from `LevelDef.firstSightThoughts` in `content/levels/*.yaml`)                                                                    |
| What he says at a door with no open road                     | `content/thoughts.yaml` (pinned from `travelDoors[].unready` in `content/levels/<id>.yaml`; replayed by `tapTravelDoor` in `src/game/story.ts`)                           |
| What he thinks about being SOMEWHERE (`placeThoughts`)       | `content/thoughts.yaml` (pinned from `placeThoughts` in `content/levels/<id>.yaml` — `where: arrival` / `pastDoor`; fired by `stepPlaceThoughts` in `src/game/story.ts`)  |
| Hero's recurring cap-farm mutter (`cap_pathetic_*`)          | `content/thoughts.yaml` (`capRotation`; replayed by `maybeCapThought` in `src/game/story.ts`)                                                                             |
| Companion joining words + kill quotes                        | `content/companions.yaml` (`joinWords`, `killQuotes`; spare verdict in `src/game/companions.ts`)                                                                          |
| Found lore on story items (`lore`)                           | `content/story-items.yaml` (compiled to `src/generated/story-items.ts` by `make levels`)                                                                                  |
| The wandering merchant's greetings                           | `src/game/defs/levels/*.ts` (`merchant.greeting`; played by `src/game/merchant.ts`)                                                                                       |
| Quest givers' greetings + farewells                          | `content/quest-givers.yaml` (compiled to `src/generated/quests.ts` by `make levels`; played by `src/game/quests/`)                                                        |
| Every errand's ask, nag and handover                         | `content/quests/<id>.yaml` (`offer` / `incomplete` / `complete`; the escorts' two lines are `escorts[].setOff` / `arrived`)                                               |
| A talk the player STEERS (speaker lines + the hero's rows)   | `content/conversations/<id>.yaml` (named by `EnemyDef.conversation` for a bystander, or by `questGivers[].intro` for a meeting owed before a person's errand list opens)  |
| The merchant's "welcome back" (return visits)                | `src/game/defs/levels/*.ts` (`merchant.returnGreeting`) + `src/game/defs/difficulties.ts` (`MERCHANT_RETURN_SENDOFF`)                                                     |
| Bestiary lore (`EnemyDef.lore` — described, not spoken)      | `content/enemies/<biome>/<id>.yaml` (printed by the library's bestiary; see below)                                                                                        |
| Loose UI copy (how-to-play, not story)                       | `pwa/src/game/copy.ts`                                                                                                                                                    |
| Brand strings (title, tagline — not story)                   | `game.config.json` → `pwa/src/identity.ts`                                                                                                                                |

**A quest giver's `lore` is DESCRIBED, not spoken** — it is the paragraph the
offer box and the quest log print under their name, in the same register as an
item's `description`, and it is quoted above only as the italic note that opens
each person's section. Their SPOKEN lines — the greeting, and every errand's
ask, nag and handover — are transcribed in full like any other dialogue.

**An errand's own `lore` is DESCRIBED too, and is likewise not transcribed
here** (`content/quests/<id>.yaml`, printed by the library's errands section —
the person's paragraph, and then the job's). Like `EnemyDef.lore` below it is
bound by this manuscript rather than a peer of it: it may only elaborate what
the tiers above already establish, never introduce a plot fact of its own, so
nothing here can go stale behind it.

**`EnemyDef.lore` is DESCRIBED, not spoken, and is therefore not transcribed
here.** Every monster in the game — the rank and file included, which is the
point of it — carries a paragraph saying what the thing IS, in the same register
as an item's `description` (which is likewise not in this file). It is bound by
this manuscript rather than a peer of it: a monster's lore may only elaborate
what the tiers above already establish, never introduce a plot fact of its own,
so nothing here can go stale behind it.

The engine machinery that plays these (dialogue queue, kill-triggered scenes) is
in `src/game/story.ts`; the app-side overlays that render them are
`pwa/src/game/overlays/DialogueOverlay.tsx` and `CutsceneOverlay.tsx`. Content-side
tests that guard the script live in `tests/content/` (`story_test.ts`,
`thoughts_test.ts`, `last_words_test.ts`, …).
