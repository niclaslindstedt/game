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
> **THIS IS NOT A STORY-DRIVEN GAME.** The script is deliberately short: an
> elite says one thing, the hero answers with one line, and the elite lands the
> reveal. Bosses get five pages, nobody gets more, and the commentary that used
> to sit between these lines has been cut — the rules that govern the script are
> in the short sections below and nowhere else.

> **This governs the SHIPPED campaign only.** A mod authors the same files in
> the same format and answers to nobody: a mod's lines are never transcribed
> here and never corrected to match this file.

## The rules

**A LINE IS SAID, NOT WRITTEN — AND SAID BY SOMEBODY WHO IS NOT GOOD AT
TALKING.** Nobody in this game is composing. They are tired, frightened,
embarrassed or fond, and they reach for the nearest words, which are usually
somebody else's. Seven habits make a page read as a script instead of as speech,
and each has a plain fix:

| The tell                                                                       | Instead                                                                                |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| The feeling carried by a clever object — "I JUST WANT HER IN THE CAR"          | The feeling said out loud, and the name said — "I JUST WANT ADA BACK"                  |
| A fresh phrase where a worn one is what people reach for                       | The second-hand phrase a real person says — "IT WILL GIVE ME HOPE IN THESE DARK TIMES" |
| The balanced sentence — "THE PAPERS DIDN'T SAY PASSENGER. THEY SAID SPECIMEN." | The flat statement — "SHE'S LISTED AS SPECIMEN."                                       |
| The best line held back for last — "I WAS PAID TO FORGET THAT"                 | The ordinary thing he'd actually end on — "I'M NOT POLITICAL. I DON'T ASK QUESTIONS."  |
| Saying it once, cleanly                                                        | Saying it twice, the way people do — "PAD 2. THEY WENT TO PAD 2."                      |
| Demanding — "I WANT SOMETHING SHE HELD THAT NIGHT"                             | Asking, and hedging — "CAN YOU BRING ME SOMETHING SHE HELD?"                           |
| The hard-boiled hero — "I'M NOT LOOKING FOR TROUBLE"                           | The hopeful one — "I HOPE THEY WON'T GIVE ME A HARD TIME"                              |

Contractions, repetition, a correction mid-sentence, a sentence that gives up
halfway, and more short sentences than a writer would allow are all in-register.
A balanced clause and a punchline in the last position almost never are.

**AND DO NOT FLATTEN SPEECH THAT IS ALREADY SPEECH.** THE JANITOR's "THIRTY
YEARS MOPPING THIS LAB. YOU LEARN THINGS, MOPPING" is not an epigram, it is a
tradesman's shrug, and it belongs to him. There are two ways to overshoot this
rule and both are worse than the line they replaced: taking away a turn of
phrase that belongs to the speaker's own trade or class, and EXPLAINING what a
line already implies. A rewrite that came out longer than the original is nearly
always the second one.

**THE PEOPLE IN THE WAY ARE NOT VILLAINS. THEY ARE EMPLOYED.** GOODCO's floor,
the park's hands and the bunker's service corridors excuse themselves the way
people have always excused themselves under a regime: I'M NOT POLITICAL, I DON'T
ASK QUESTIONS, I'VE GOT A FAMILY, I JUST WORK HERE. They believe it while they
say it, and nobody ever confesses — a man who knows he is complicit and says so
is the writer talking. This is the script's only political claim and its
sharpest joke: those are the sentences of an ordinary citizen anywhere it has
ever gone wrong, said here in an American accent.

**WHO STILL TALKS FLAT.** The MACHINES — PAYLOAD-1, the BROs, THE BRO SUPERCORE,
THE VAULT WARDEN, LEDGER UNIT 12, THE ARCHIVE UNIT and the units — plus THE
ARCHITECT, whose slide deck is the chip in his head talking. Their flatness is
the satire and must not be warmed up. **THE FOUNDER is no longer among them**: he
is a frightened rich man, and he talks like one — greedy, sincere, and faintly
amazed at what he has got away with. Everyone else with a pulse sounds like they
have one.

**A page is a PARAGRAPH; the box breaks it.** Every surface that speaks measures
the column it actually has and flows the page into it, so an authored page is
ONE string. A second string is an **explicit line break** and has to earn
itself; the whole campaign spends four, tabled below. Past ~120 characters a page
costs the player another tap, and the build warns.

| Where                        | The break                                     |
| ---------------------------- | --------------------------------------------- |
| BOOT HILL, opening monologue | HANG ON, ADA. I'M COMING. / YEE-HAW, I GUESS. |
| BOOT HILL, closing monologue | …'YOU TOOK YOUR TIME.' / THEN: 'NICE HAT.'    |
| MOON POST-MORTEM, lore       | …RECOMMEND MARS.' / 'AND NEVER DIG AGAIN.'    |
| ENGAGEMENT REPORT, lore      | THAT'S MY GIRL. / …ALL OF IT. THAT'S MY GIRL. |

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
a death rite lands, the road's own mutters, THE GLUED's shouts and THE
BYSTANDERS' reactions all float over a live field in hard-wrapped rows.
Everything else is a page in a box.

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

_(She gets up off the couch, in the tee she has been watching the film in, and
crosses the room.)_

**ME:** TAKE YOUR JACKET. IT'S COLD OUT.

_(She lifts the red jacket off the hall tree by the door and puts it on. The
pegs are bare behind her for the rest of the scene.)_

**ADA:** ALREADY GOT IT.

_(She goes out. The door shuts.)_

> **CAPTION:** GOOD THING SHE TOOK HER JACKET. I PUT A TRACKING BEACON IN THE LINING. NOW I ALWAYS KNOW WHERE SHE IS. KEEPS HER SAFE.
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

_(Then the plan, spoken on every rung — the last line said in the house.)_

**ME:** I'M GOING TO GO AND GET HER. I'LL TAKE THE CAR.

_(Out the door she left by, armed. The game opens on him standing in the
garage.)_

---

## Home — THE GARAGE (hub)

### Opening monologue (hero, black screen)

_None — the ONE venue in the game with no opening monologue
(`content/levels/garage.yaml` ships no `intro:`, which is why the field is
optional at all). He does not arrive here: he walks out of his own living room
having just said what he is going to do, and the next thing he stands in is his
own bay. Coming HOME off a leg he has already said what he made of the drive, at
the wheel, coming up his own road — so there is nothing left to say on the
doorstep either way._

### Pinned beats

_Standing in the bay for the first time (`placeThoughts`, `where: arrival`) —
the only line that tells a new player what the car is for. It names the PERSON,
never the part._

1. HER JACKET'S STILL ANSWERING. IT'S COMING FROM GOODCO. THE CAR'S RIGHT THERE, I'LL TAKE THE CAR.

_Walking out under the roll-up on foot instead (`where: pastDoor`)._

1. WHAT AM I DOING, WALKING. SHE'S NOT DOWN THE STREET. THE CAR. TAKE THE CAR.

_Tapping THE ROCKET before the part is home. It REPLAYS, and it must name
neither the moon nor Mars — he has not earned those roads._

1. IT'S STILL ONE PART SHORT. AND SHE ISN'T UP THERE ANYWAY. SHE'S AN HOUR DOWN THE ROAD.

### THE DEALER — the neighborhood, at home

_A man off the block working the road at the lot's far edge. He is also the
first person the car takes, on the hero's own drive, and nobody says a word
about it — there is another dealer on that pavement next time._

**Across the counter:** NO NAMES, AND I DON'T DO RECEIPTS. WHAT ARE YOU AFTER?

### RUTH — Ada's mother

_Three errands, one per leg of the trail. She misses Ada and says so, and she
has never once doubted she is winning — with Ruth those are the same feeling.
**She was not in the house that night** — so she asks for a KIND of thing and
lets the hero name the particular, and what the slip actually says she finds out
reading it._

**She has arrived** (`conversations/ruth_arrival.yaml`):

> I LET MYSELF IN, {HERO}. I'VE ALWAYS HAD A KEY, YOU KNOW THAT. GO ON. GO AND FIND HER.

— _I'M GOING AFTER HER._

**…and the player watches her do it.** She is standing on the drive when the run
opens, square in front of the roll-up, and she waits a beat before letting
herself in — which is the same three seconds the car leaves by. She can be run
over on the hero's own driveway, and the game gives it three words:

**Under the car** (`thoughts.yaml` → `ruth_run_down`):

> WHAT WAS THAT?

_And nothing else. No line, no toast, no scene — the same silence the dealer
gets, about somebody he knows. She is standing there again on the next visit;
what does not come back is this night, and the campaign carries it: the road out
says something different (below), and so does Friday (the epilogue)._

**Greeting:** SHE LAUGHED ABOUT THAT ZIPPER FOR A WEEK. LISTEN - COULD YOU DO SOMETHING FOR ME?

**Farewell:** SHE'S FIGHTING HER WAY BACK, ISN'T SHE. I KNEW SHE WOULD BE. GO ON.

#### THE RECEIPT

> I MISS HER SO MUCH. CAN YOU BRING ME SOMETHING SHE HELD THAT NIGHT? WHAT DID SHE GO OUT FOR?

**ME:** CHIPS AND A SODA. THE MACHINES PRINT A SLIP FOR THAT. SOMEBODY IN THERE WILL HAVE IT ON THEM.

**Short:** IT'S IN SOMEBODY'S POCKET OUT THERE. YOU SAID SO YOURSELF.

**Handover:** CHIPS AND HER SODA. 11:52 PM. 'PAYMENT INTERRUPTED.' I'M KEEPING THIS. IT GIVES ME HOPE, THIS DOES.

**ME:** IT'S HERS. KEEP IT.

#### THE DENT

> THEY'LL HAVE PUT A MACHINE WITH A FACE ON HER. SHE'LL HAVE BITTEN IT. CAN YOU BRING ME THE PLATE?

**ME:** I'LL FIND THE ONE WITH THE TEETH MARKS.

**Short:** A MACHINE WITH A FACE AND A DENT IN IT. IT'S OUT THERE SOMEWHERE.

**Handover:** TEETH. RIGHT THROUGH THE SHELL. OH, THAT'S MY GIRL.

**ME:** SHE'S STILL FIGHTING. I'M TRYING TO KEEP UP WITH HER.

#### THE SCALE — and the one errand that gives something back

> THEY'RE SAYING THE THINGS THAT HAVE HER NOW ARE SCALED. CAN YOU GET ME ONE OF THE SCALES? I WANT TO SEE IT.

**ME:** SHE'LL HAVE PRIED ONE OFF ALREADY.

**Short:** A SCALE. OFF SOMETHING THAT CALLS ITSELF A GOD. I'LL WAIT.

**Handover** — the second page is the token `{CACHE}`, substituted per rung:

1. HARD AS A HULL. AND SHE PULLS THESE OFF WITH HER HANDS. I'M NOT SCARED FOR HER. I JUST MISS HER.
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

### On the outskirts, going out (read at the player's own pace)

1. HER JACKET'S PINGING FROM GOODCO.
2. THEY BEG HARD IN TOWN. NONE OF THEM'S ON THE WELFARE. NOT LIKE ME.

_…and if he came off his own drive over Ada's mother, the second line is this
one instead (`drive_out_bump`) — the whole of what he has to say about it, said
about the car:_

2. FRONT END'S PULLING. MUST'VE GONE OVER SOMETHING BACK THERE.

### On the same road, coming home (read at the player's own pace)

_He does not mention the people. That absence is the joke._

1. THE PART'S ON THE SEAT. STRAIGHT HOME.
2. TEN YEARS I'VE BEEN BUILDING HER. AND SHE ONLY NEEDED THE ONE THING.

### The car giving up

1. COME ON. COME ON. NOT TONIGHT.

### The run-in, past GOODCO's fence

_The trip's VERDICT is said in front of it, as one breath — see the next
section: ROUGH RIDE. THERE'S GOODCO._

1. THERE'S GOODCO.

### The run-in home, past his own gate — the one warm line in the minigame

_Same again: the verdict, and then this._

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

### THE BYSTANDERS — what somebody shouts when they see one (`WITNESS_LINES`)

_The road's third voice, and the only one that is about the hero. When the wagon
puts somebody over its own roof, one person further down the road turns and
shouts about it — once, for about two seconds, and never twice inside a second
and a half. It never becomes anything: no chase, no police, nothing waiting at
GOODCO. He passes the person shouting a quarter of a second later._

_Two to six words, shouted rather than composed — no irony, no punchlines, no
commentary on the state of the world. These are the same people as the thoughts
above, so nobody says anything that costs money or assumes any: it is SOMEBODY
GET HELP and never CALL AN AMBULANCE. And nobody diagnoses the driver — he is
HE, never a job or a class or a cause._

_Filed by what they watched happen. The sim names the scene and the words answer
it (`pwa/src/game/drive-screen/placards.ts`); which line of a scene gets shouted
is hashed off the collision, so the same seed driven the same way says the same
thing._

**A walker, with nothing about them to name**

1. OH MY GOD
2. HE JUST RAN THAT MAN DOWN
3. HE DIDN'T EVEN BRAKE
4. SOMEBODY GET HELP
5. JEEEEESUS
6. DID YOU SEE THAT

**A woman**

7. HE HIT THAT LADY
8. THAT'S A WOMAN DOWN THERE
9. SHE NEVER SAW HIM COMING
10. OH GOD, THAT POOR WOMAN

**Somebody who could not have got out of the way — the old man, the crutches,
the walking frame.** Not one of these says a gender: the scene covers three
bodies with one thing in common and nothing else.

11. THEY COULDN'T GET OUT THE WAY
12. THAT ONE COULD BARELY WALK
13. HAVE YOU NO SHAME AT ALL
14. OH GOD, THE POOR OLD SOUL

**The wheelchair**

15. THAT WAS A WHEELCHAIR
16. HE WENT STRAIGHT THROUGH THE CHAIR
17. THEY COULDN'T MOVE AT ALL

**Somebody walking a dog.** Its own scene, and not a gag: it is the one body on
this road that somebody was holding on to, and a crowd that has watched a person
go under in silence all evening will shout about a dog.

18. THE DOG, HE GOT THE DOG
19. NOT THE DOG
20. SOMEBODY CATCH THAT DOG

**A bike and its rider**

21. HE TOOK THE CYCLIST CLEAN OUT
22. THAT BIKE WENT OVER THE ROOF
23. THEY WERE ON A BIKE
24. HE NEVER EVEN LOOKED

**One of THE GLUED** — the only scene where the crowd is right about something,
and the only moment the road's two set pieces speak about each other.

25. THEY WERE GLUED DOWN
26. THEY COULDN'T MOVE, YOU KNOW THAT
27. HE DROVE STRAIGHT INTO THEM
28. THEIR HANDS WERE IN THE ROAD

**A body in two, caught under the car, or found by a wheel.** The only scene
where nobody describes anything.

29. OH GOD, OH GOD, NO
30. DON'T LOOK, DON'T LOOK
31. THERE'S PIECES OF THEM
32. I'M GOING TO BE SICK
33. GET AWAY FROM THE ROAD

**A car** — his, theirs, or two of theirs meeting each other.

34. HE'S HITTING THE CARS NOW
35. DID YOU SEE THAT SMASH
36. THAT'S SOMEBODY'S CAR
37. THEY'VE CRASHED, THEY'VE CRASHED

**A bus or a lorry**

38. HE'S TAKEN ON A BUS
39. THAT'S A BUS, YOU IDIOT
40. THERE WERE PEOPLE ON THAT BUS

**Nose to nose** — the only crash the crowd names by its SHAPE rather than by
what was in it, and the only one they are certain about the outcome of before
anybody has got out of anything.

41. THEY WENT STRAIGHT INTO EACH OTHER
42. HEAD ON, THAT WAS HEAD ON
43. NOBODY WALKS AWAY FROM THAT
44. RIGHT ON THE NOSE
45. THAT WAS FRONT TO FRONT

**A two-wheeler down, or broken in half**

46. THE MOPED'S IN HALF
47. HE PUT THE BIKE DOWN
48. THAT SCOOTER'S GONE UNDER HIM
49. THERE'S A BIKE IN THE ROAD

**Something with a roof gone over**

50. IT'S ON ITS ROOF
51. IT WENT RIGHT OVER
52. GET THEM OUT OF THERE

**Somebody out through a windscreen**

53. THEY CAME THROUGH THE WINDSCREEN
54. SOMEBODY WENT OUT THE FRONT
55. OH GOD, THE GLASS

**Something has caught.** The burn is a thing that GROWS out here — about two
seconds from a flicker under a wing to the whole engine bay — so these are
people watching it get worse rather than reacting to a bang.

56. IT'S GOING UP
57. GET BACK, IT'S BURNING
58. THE WHOLE THING'S ALIGHT
59. IT'S CAUGHT, IT'S CAUGHT
60. GET THEM OUT BEFORE IT SPREADS

**And the tank went.** The biggest single thing that happens on this road. What
comes out of somebody at the instant of a bang is an instruction, not a
description — there has been no time to look yet.

61. GET DOWN
62. THE TANK'S GONE
63. THAT WAS THE PETROL
64. IT BLEW, IT ACTUALLY BLEW
65. RUN, THERE'LL BE ANOTHER

**And the front it threw** — the one thing out here the crowd FEELS rather than
watches, off the rare big blast and off the street lighting going out as the
wave passes. Not one of these describes the car.

66. I FELT THAT IN MY CHEST
67. THE WINDOWS, ALL THE WINDOWS
68. MY EARS, MY EARS
69. THE LIGHTS ARE GOING OUT
70. THAT SHOOK THE WHOLE STREET

**A street light down.** Where the crowd gets its one bit of ordinary human
pettiness back.

71. THERE GOES THE STREET LIGHT
72. HE'S TAKEN THE LAMP POST OUT
73. THE COUNCIL WILL LOVE THAT

**And the one about him.** Unlocked by the second body, because "again" needs a
first time — the closest this road ever comes to naming what the player has
spent the last minute doing. Nobody follows it up. Nothing comes of it.

74. HE'S NOT STOPPING
75. HE'S DONE IT AGAIN
76. SOMEBODY GET HIS PLATE
77. HE'S NOT EVEN SLOWING DOWN

### THE SAME ROAD IN SFW MODE — all three voices, swapped (`drive-screen/placards-sfw.ts`)

_SETTINGS → SFW MODE does not silence the road and does not censor it. It
re-dresses it: a body peels away in glitter rather than coming apart, the marks
it leaves are re-hued, and a car alight fizzes gold stars instead of burning. The
words have to agree with that picture, so the three lists below stand in for the
three above, one for one, in the same order and at the same lengths._

_This is why they exist at all: a bystander shouting THERE'S PIECES OF THEM over
a shower of glitter tells the player exactly what the mode is refusing to draw,
and a road that went quiet instead would lose the thing that makes this stretch
feel inhabited. The SHAPES survive the swap and nothing else does — a thought is
still private and has still never heard of the car, a shout is still aimed at a
driver who is not reading it, and a reaction is still short and badly formed._

_Nobody out here is destitute and nothing that happens costs anybody anything.
The hero is unchanged: he does not read these either._

**THE GLUED, in the mode.** Still sitting across all four lanes with the road
shut — for a chalk mural and a road party rather than for a cause, so nothing
here argues with anybody.

1. SLOW DOWN! WE'RE DRAWING ON THE ROAD
2. THE ROAD IS CLOSED FOR THE PARADE
3. WE'RE COUNTING CARS FOR THE SCIENCE FAIR
4. MIND THE GLITTER, IT GETS EVERYWHERE
5. SORRY FOR THE HOLD-UP!

**THE CROWD, in the mode.** Forty again, one to a walker, dealt from the same
deck and read in the same half second. What they are turning over is the road
itself — how fast that one went, what the sparks are doing, what the glitter
gets into — and a few of them are still small rather than spectacular, because a
list where every line is WOW reads as a laugh track.

1. THAT CAR IS GOING VERY FAST
2. LOOK AT ALL THE LITTLE STARS
3. THE GLITTER GETS IN YOUR HAIR
4. I HOPE HE MAKES IT ON TIME
5. SOMEBODY IS IN A DREADFUL HURRY
6. THE SPARKS ARE MY FAVOURITE PART
7. I COUNTED SIX STARS THAT TIME
8. THAT ONE WENT PAST LIKE A COMET
9. MY COAT IS COVERED IN SPARKLES
10. THE ROAD SMELLS LIKE BIRTHDAY CANDLES
11. I SHOULD HAVE BROUGHT MY CAMERA
12. THE STARS ARE WARM WHEN THEY LAND
13. NOBODY DRIVES THAT FAST ON PURPOSE
14. I WONDER WHERE HE IS GOING
15. THE GLITTER TASTES A BIT LIKE LEMON
16. I WAVED AND I THINK HE SAW
17. THAT WAS FASTER THAN THE LAST ONE
18. THE PIGEONS LOVE THE SHINY BITS
19. I AM GOING TO SWEEP UP LATER
20. MY SISTER WOULD LOVE THIS STREET
21. THE SPARKLES LAND LIKE WARM SNOW
22. HE MUST BE LATE FOR SOMETHING
23. I FOUND A STAR IN MY POCKET
24. THE WHOLE ROAD IS TWINKLING TONIGHT
25. I LIKE THE YELLOW ONES BEST
26. THAT ENGINE SOUNDS VERY PLEASED WITH ITSELF
27. THE LAMP POSTS ARE ALL SPARKLY NOW
28. I HOPE THERE IS MORE GLITTER LATER
29. SOMEBODY SHOULD PUT UP A SIGN
30. IT SOUNDS LIKE A ROCKET GOING PAST
31. THE STARS GO UP AND COME DOWN SLOWLY
32. I AM SAVING THE PRETTIEST ONE
33. MY BOOTS ARE FULL OF SPARKLES
34. THAT CAR NEEDS A GOOD WASH
35. THE GLITTER STICKS TO EVERYTHING OUT HERE
36. I CAUGHT ONE BEFORE IT FADED
37. THE STREET LOOKS LIKE A BIRTHDAY CAKE
38. I THINK HE IS SHOWING OFF
39. EVERY CAR SHOULD SPARKLE LIKE THAT
40. I WILL TELL THEM ABOUT THIS

**THE BYSTANDERS, in the mode.** Filed by the same scenes the sim names, so this
table is total exactly as the shipped one is. A person struck turns into confetti
and comes out the other side, so what is shouted is delight rather than horror —
and the MACHINES keep their alarm, which is what stops the whole road reading as
a birthday party. The mode changed what a person is made of; it did not change
what steel does.

_A walker, with nothing about them to name_

1. WOW, DID YOU SEE THAT
2. HE TURNED THEM INTO CONFETTI
3. THAT WAS A LOT OF SPARKLES
4. THEY WENT ALL TWINKLY
5. OOOOOH

_A woman_

6. SHE WENT OFF LIKE A FIREWORK
7. THAT LADY IS ALL GLITTER NOW
8. SHE'LL BE BACK, THEY ALWAYS ARE
9. LOOK AT HER GO

_Somebody who could not have got out of the way._ Not one of these says a
gender, for the same reason the shipped scene's do not.

10. THEY POPPED LIKE A PARTY POPPER
11. OFF THEY GO, SPARKLING
12. THAT ONE MADE GOLD STARS
13. THEY DIDN'T EVEN SPILL THEIR TEA

_The wheelchair_

14. THE CHAIR TURNED INTO RIBBONS
15. WHEELS AND ALL, JUST SPARKLES
16. THAT WAS A GLITTERY ONE

_Somebody walking a dog_

17. THE DOG IS MADE OF STARS
18. GOOD BOY, VERY SPARKLY
19. HERE COMES THE DOG AGAIN

_A bike and its rider_

20. THE BIKE WENT UP IN GLITTER
21. THEY CARTWHEELED INTO CONFETTI
22. HELMET AND ALL, POOF
23. THAT'S THE SHINIEST ONE YET

_One of THE GLUED_

24. THEY GOT THE WHOLE CHALK CREW
25. THAT'S THE PICNIC RUINED
26. SPARKLES ALL OVER THE CROSSING
27. THERE GOES THE SIT-DOWN

_A body in two, caught under the car, or found by a wheel._ The mode never
raises this scene — the split and the gib are both refused before the first tick
— but the table is total, so it is written anyway.

28. A WHOLE BUCKET OF GLITTER
29. CONFETTI EVERYWHERE, LOOK AT IT
30. THE BIGGEST SPARKLE OF THE NIGHT
31. IT'S SNOWING STARS
32. COVER YOUR DRINKS

_A car_

33. HE'S BUMPING THE CARS NOW
34. DID YOU HEAR THAT CLANG
35. THAT'S SOMEBODY'S NICE CAR
36. BUMPER CARS, IS IT

_A bus or a lorry_

37. HE'S HAVING A GO AT BUSES
38. THAT'S A BUS, YOU BANANA
39. THE BUS BARELY WOBBLED

_Nose to nose_

40. THEY BOOPED EACH OTHER
41. NOSE TO NOSE, THAT ONE
42. BOTH OF THEM AT ONCE
43. RIGHT ON THE FRONT BUMPER
44. THAT WAS A PROPER CLONK

_A two-wheeler down, or broken in half_

45. THE MOPED'S IN TWO BITS
46. HE PUT THE LITTLE BIKE DOWN
47. THERE'S A SCOOTER IN THE ROAD
48. PARTS EVERYWHERE, WHAT A MESS

_Something with a roof gone over_

49. IT'S ON ITS ROOF, LOOK
50. IT WENT RIGHT OVER, WHEELS UP
51. SOMEBODY GIVE IT A PUSH

_Somebody out through a windscreen_

52. SOMEBODY POPPED OUT THE FRONT
53. OUT THE WINDOW IN A PUFF
54. THEY LANDED IN GOLD DUST

_Something has caught._ A car alight FIZZES in this mode — gold stars climbing
off the bodywork — and it still GROWS, so these are people watching it thicken
rather than reacting to a bang.

55. IT'S SPARKLING ALL OVER
56. LOOK AT THE STARS COMING OFF
57. THE WHOLE BONNET IS TWINKLING
58. IT'S FIZZING LIKE A SPARKLER
59. GOLD STARS, EVERYWHERE, LOOK

_And the tank went_

60. THAT WAS THE BIGGEST FIREWORK YET
61. CONFETTI CANNON, THAT WAS
62. IT WENT BANG AND SPARKLED
63. HAPPY NEW YEAR, EVERYBODY
64. MIND THE STREAMERS

_And the front it threw._ A pressure wave is the same pressure wave in any
mode, so these stay about the chest, the ears, the windows and the lights.

65. I FELT THAT IN MY BOOTS
66. THE WINDOWS ALL RATTLED
67. MY EARS ARE RINGING, WOW
68. ALL THE LAMPS BLINKED AT ONCE
69. THE WHOLE STREET WOBBLED

_A street light down_

70. THERE GOES A STREET LIGHT
71. HE'S BENT THE LAMP POST
72. THE COUNCIL WILL BE THRILLED

_And the one about him._ Still unlocked by the second body, still the only line
out here about the driver, and still becomes nothing at all.

73. HE'S NOT STOPPING, IS HE
74. OFF HE GOES AGAIN
75. SOMEBODY TELL HIM TO SLOW DOWN
76. HE'S IN A REAL HURRY

### The arrival verdict — seven readings of one trip

_Spoken ON THE RUN-IN, at the wheel, folded into the front of the place's own
line so that the two are one breath: ROUGH RIDE. THERE'S GOODCO. It is the LAST
thing either leg says and the only thing said about the drive anywhere — he gets
out of the car at the far end with nothing to add, and the level's own briefing
opens on the building rather than on the suspension._

_A FEW WORDS EACH, AND THAT IS THE FORM RATHER THAN A BUDGET. It is a man
reviewing an hour of his life in three words on the way past a fence; the
shorter it is, the less he has noticed. It is also all the clock allows — the
line has from the sight of the place to the fade to print itself
(`DRIVE.arrival`), and `tests/drive_bark_test.ts` fails on a verdict that
outgrows it. The priority order is the joke: everything a man notices on a
commute outranks the crowd, and the crowd only ever reaches him as road surface._

1. **Touched nothing at all:** NOT A MARK ON HER.
2. **The car barely made it:** POOR OLD GIRL.
3. **Flattened the lighting:** LAMPS TOO CLOSE TO THE KERB.
4. **Traded paint:** NOBODY OUT HERE CAN DRIVE.
5. **Unusually good time:** GOOD RUN TONIGHT.
6. **Dawdled:** TOOK MY TIME.
7. **Otherwise, the road surface:** ROADS ARE ROUGH OUT HERE. …and past a great many of them, the understatement the whole minigame is built to earn: ROUGH RIDE.

---

## Level 1 — GOODCO HQ

### Opening monologue (hero, black screen)

_The drive said its piece at the wheel; out of the car he looks up at the
building, and these four are the whole of the briefing. A replay skips them._

1. THE JACKET'S STILL ANSWERING. IT'S NOT COMING FROM THE STREET. IT'S COMING FROM INSIDE THERE.
2. GOODCO. TEN YEARS I BUILT THEIR ENGINES. THEN THEY SAT A MACHINE AT MY BENCH AND GAVE ME A BOX FOR MY MUG.
3. HALF MY STREET GOT THE SAME BOX. WE'RE ALL ON THE WELFARE NOW. IT'S NOT SO BAD, REALLY.
4. I STILL HAVE FRIENDS IN THERE. I HOPE THEY WON'T GIVE ME A HARD TIME. I JUST WANT ADA BACK.

### Pinned beats

_The night shift clocking on, out on the STAFF LOT — the level's first
instruction, and it claims nothing he could not know._

- THAT'S THE NIGHT SHIFT CLOCKING ON. NOBODY'S TOLD THEM THE BUILDING IS SHUT TONIGHT.
- I HAD A BADGE FOR THAT GATE ONCE. NOT ANYMORE. SO I'LL WALK IN BEHIND SOMEBODY WHO STILL DOES.

_And the level's second, at the only moment it can be said: he has just watched
one of them badge in at the guard box and go through, and he is still standing
on the tarmac. It never fires on a player who took the moment._

- THAT ONE'S IN AND I'M STILL OUT HERE. FINE — I'LL WAIT FOR THE NEXT AND WALK IN BEHIND THEM.

_First INTERN sighted, inside._

- LOOK AT THIS PLACE. PAST MIDNIGHT, AND EVERY DESK'S MANNED. EVERY LAB LIT.
- WE NEVER RAN NIGHTS LIKE THIS. NOT ONCE IN TEN YEARS. SOMETHING'S GOT THEM ALL UP.

_First SUCCESSOR sighted._

- A SUCCESSOR. I HELPED BUILD THE FIRST ONE OF THOSE. THEN THEY REDREW IT WITHOUT US.
- THAT LINE PUT EVERYONE I KNOW OUT OF WORK. AND I HELPED BUILD IT. I KNOW HOW TO TAKE ONE APART, AT LEAST.

_First VOLUNTEER sighted — a man off the same street the hero came from, running
in with a vest on. He does not approve and he does not condemn; he recognises._

- THAT ONE'S NOT STAFF. THAT'S A WORK JACKET, AND THAT'S A VEST UNDER IT.
- HE GOT THE SAME BOX I DID. I DROVE HOME WITH MINE.

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

**LAB SCIENTIST:** I KNOW WHO YOU ARE, {HERO}. THEY SAID NOBODY GETS PAST. I'VE GOT A JOB HERE. I'VE GOT A FAMILY.

**ME:** STAY BACK. PLEASE. I'VE NEVER HIT ANYBODY IN MY LIFE. DON'T.

**Blow three — he hits back, and the game starts.**

**ME:** THIRD TIME. HE ISN'T LISTENING. NOBODY ON THIS FLOOR IS LISTENING.

**LAB SCIENTIST:** WE ALL WANT TO KEEP OUR JOBS. YOU HAD ONE. YOU KNOW WHAT IT'S LIKE WHEN IT GOES.

**ME:** I'M SORRY. I TRIED TO ASK. SHE'S IN THIS BUILDING AND YOU'RE IN MY WAY.

**ME:** I GOT THIS FAR WITHOUT THROWING A PUNCH. I'M SORRY. I'M SORRY.

### THE VOLUNTEER — the only line the rank and file get

_He has no scene and no last words: he is not a set piece, he arrives every
half minute or so and he is gone in seconds. He gets ONE line, and it is the
only thing anybody on this floor shouts. Barked over his own head while he
sprints — the run does not stop for it, because the two seconds it buys are
the whole of what the player is being given._

**Bark (the switch closing):** FOR HUMANITY

### Elites

#### THE NIGHT MANAGER — the secret launches

**NIGHT MANAGER:** YOU'RE NOT ON THE ROSTER. NOBODY IS ON THE ROSTER. THAT'S THE POINT OF THE NIGHT SHIFT.

**ME:** A GIRL WAS TAKEN OUT OF HERE TONIGHT. WHERE DID SHE GO?

**NIGHT MANAGER:** UP. THEY ALL GO UP. MIDNIGHT LAUNCH, NO MANIFEST. THE MOON. I DON'T ASK. YOU LEARN NOT TO ASK.

**Last words:** I ONLY SIGNED... WHAT THEY PUT... IN FRONT OF ME...

**Bark (laying the paperwork down):** THERE'S PAPERWORK / ON YOU NOW. YOU'RE / NOT GOING ANYWHERE.

_Drops: STORAGE KEYCARD._

#### THE ARCHITECT — the old bench partner

**THE ARCHITECT:** {HERO}. MY OLD BENCH PARTNER. STILL SOLDERING TOYS IN A GARAGE? I BUILD MINDS NOW.

**ME:** YOU CUT A MACHINE CHIP INTO YOUR OWN HEAD. QUIT. COME HOME. PLEASE.

**THE ARCHITECT:** I BUILD THEM A SUPERINTELLIGENCE NOW. FLESH IS A ROUGH DRAFT AND HUMANS ARE OBSOLETE. GOODBYE, OLD FRIEND.

**Last words:** THE CHIP... TAKE IT... IT WAS NEVER... MINE...

**Bark (loosing the finders):** I BUILT THESE TO / FIND THINGS. THEY / ALWAYS FIND THINGS.

_Drops: PASSAGE CHIP, CORE KEYCARD._

#### CHIEF OF SECURITY — Ada on Pad 2

**CHIEF OF SECURITY:** STOP RIGHT THERE. THE GIRL IN THE JACKET, RIGHT? THE CAMERAS GOT HER AT THE VENDING MACHINES.

**ME:** HER NAME IS ADA. TELL ME WHERE THEY PUT HER.

**CHIEF OF SECURITY:** PAD 2. THEY WENT TO PAD 2. SHE'S LISTED AS SPECIMEN. I'M NOT POLITICAL. I DON'T ASK QUESTIONS.

**Last words:** PAD 2... IT WAS PAD 2... I TOLD YOU... DIDN'T I...

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

**The hero, as it falls:** SEE YOU AT THE TOP. WHAT DOES THAT EVEN MEAN. YOU'RE A DOG.

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

**Meeting:** EASY, FRIEND. I'M NOT STAFF, I STOCK THE VENDING MACHINES. NOBODY'S BUYING CRISPS TONIGHT, SO.

**Across the counter:** MACHINES ARE ALL EMPTY. SO IT'S ME TONIGHT. WHAT DO YOU NEED?

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
2. IT RUNS ON GOODCO'S OWN RELAYS, AND THEY PUT THOSE WHEREVER THEY SHIP - THE ONE FAVOUR THEY'VE EVER DONE ME.
3. AND SOMETHING IS MOVING OUT THERE IN THE DUST. THIS PLACE IS SUPPOSED TO BE EMPTY.

### Pinned beats

_First wisp sighted._

- IT CAME OUT OF THE DUST. IT'S NOT WEARING A SUIT. THERE AREN'T EVEN FOOTPRINTS.
- NOBODY EVER SAID THE MOON HAD DEAD PEOPLE ON IT. SOMEBODY MUST HAVE KNOWN.

_First wisp killed._

- OKAY. THEY GO DOWN LIKE ANYTHING ELSE. THAT'LL HAVE TO DO.

_First SUCCESSOR killed._

- A GOODCO UNIT. UP HERE. THE SAME TIN MAN FROM THE NIGHT SHIFT, WALKING THE DUST.
- THEY DIDN'T JUST SHIP HER UP. THEY BUILT A STAFF TO MEET HER. ONE BOLT AT A TIME, THEN.

### Elites

#### MISSION SPECIALIST — the wreck under the dust

**MISSION SPECIALIST:** A LIVE ONE. BREATHING AND EVERYTHING. WE GAVE THAT UP A LONG TIME AGO.

**ME:** NOBODY EVER DIED ON THE MOON.

**MISSION SPECIALIST:** THERE'S A WRECK UNDER THE DUST, KID. WE PLANTED THAT FLAG ON A GRAVE. THAT'S WHAT THE STEP WAS ONTO.

**Last words:** TELL THEM... IT WASN'T... EMPTY...

**Bark (the suit lights coming up):** FIFTY YEARS OF / SUIT LIGHTS, AND / THEY STILL CIRCLE.

_Drops: APOLLO MISSION LOG._

#### THE PROSPECTOR — the moonbase at Site T

**THE PROSPECTOR:** CLAIM'S TAKEN. WHOLE ROCK'S TAKEN. STAMPED, FILED AND PAID FOR BY GOODCO.

**ME:** DOING WHAT, EXACTLY?

**THE PROSPECTOR:** I DUG THEIR TUNNELS AT SITE T. SECRET FREIGHT. THEN THE CRATES STARTED BREATHING. SO I QUIT. THAT DIDN'T GO WELL FOR ME.

**Last words:** TAKE THE CLAIM... I NEVER GOT... ANYTHING OFF IT...

**Bark (setting the drill down):** I DUG THEIR WHOLE / TUNNEL. I CAN DIG / ONE THROUGH YOU.

_Drops: GOODCO BLUEPRINTS._

#### QUARANTINE MEDIC — the clone

**QUARANTINE MEDIC:** HOLD STILL. ROUTINE SCREENING. HEARTBEAT... PRESENT. YOU'LL WANT THAT LOOKED AT.

**ME:** YOU WERE THE CREW DOCTOR. BACK IN '69.

**QUARANTINE MEDIC:** THE FIRST MAN HAD TWO CHARTS. IDENTICAL, THE PAIR OF THEM. THE COPY FLEW HOME. THE REAL ONE'S STILL UP HERE.

**Last words:** TWO CHARTS... HHH... ONE STILL... BEAT...

**Bark (breaking containment):** YOU'VE BEEN / EXPOSED. SO HAS / EVERYTHING I TOUCH.

_Drops: SECOND MAN DOSSIER._

#### THE CARTOGRAPHER — where Ada went

**THE CARTOGRAPHER:** SHH. I'M CHARTING. THE MAP KEEPS CHANGING UNDERNEATH. TUNNELS WHERE NONE WERE.

**ME:** A BEACON CROSSED YOUR GRID LAST NIGHT. A GIRL'S JACKET.

**THE CARTOGRAPHER:** FAST, THEN STRAIGHT DOWN INTO THE WRECK UNDER THE FLAG. IT ALL GOES DOWN THERE. I'VE NEVER SEEN ANYTHING COME BACK.

**Last words:** SHE WENT DOWN... I MARKED IT... SOMEBODY LOOK AT IT...

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

1. THE MOON WAS GOODCO'S BIG MISTAKE. THEY CRATED THE WHOLE THING UP AND RAN TO MARS.
2. SOMEBODY DOWN HERE SIGNED HER OVER LIKE A CRATE OF PARTS. I WANT TO KNOW WHO.

### Pinned beats

_First SCOUT ROVER killed._

- A ROVER. FRESH PAINT, WORN WHEELS. AND THE DUST IS FULL OF TIRE TRACKS. YEARS OF THEM.
- THE PLAQUE SAYS 'FOR ALL MANKIND'. THE FIRMWARE SAYS PROPERTY OF GOODCO. OF COURSE IT DOES.

_First FEMBOT killed._

- ...IT BLEW ME A KISS. THE ROBOT. IN THE NIGHTGOWN. IT BLEW ME A KISS AND FIRED.
- WHO BUILDS A DOOMSDAY COLONY AND BUDGETS FOR THESE? ADA WILL THINK THIS IS HILARIOUS.

_Tapping THE COWARD'S TEAR without his rig (replays)._

1. IT'S STILL HANGING OPEN. BUT IT'S HIS HOLE, AND HE TOOK THE HANDLE WITH HIM - FIND IT.

### Elites

#### THE INDEXER — the fembots upload everything

**THE INDEXER:** MIND HOW YOU GO. THAT'S FREE ADVICE. I INDEXED THIS WHOLE PLANET BEFORE BREAKFAST.

**ME:** THEN YOUR INDEX KNOWS WHERE THE GIRL OFF THE FREIGHT RUN IS.

**THE INDEXER:** THE FEMBOTS SMILE AND LISTEN AND SEND ME EVERY WORD IN THIS COLONY. SO I KNOW. I'M NOT GOING TO TELL YOU.

**Last words:** I HAD IT ALL INDEXED... ALL OF IT... ALL OF IT...

**Bark (loosing the crawlers):** INDEXED. CRAWLED. / THEY KNOW EXACTLY / WHERE YOU STAND.

_Drops: SEARCH BAR, ENGAGEMENT REPORT._

#### THE VENDOR — the moon was version one

**THE VENDOR:** PLEASE HOLD. YOUR INTRUSION IS IMPORTANT TO US. SORRY - FORCE OF HABIT. I WROTE THAT LINE.

**ME:** I CAME FROM YOUR LAST COLONY. THE MOON IS FULL OF GHOSTS.

**THE VENDOR:** THE MOON RAN VERSION ONE. IT PLUGGED INTO THE THING UNDER THE DUST. WE DIDN'T FIX IT. WE JUST LEFT.

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

**THE SEED:** EVERYONE'S RUNNING FROM SOMETHING. I FUND WHERE THEY RUN TO. I ALSO FUND THE THING CHASING THEM.

**ME:** SO WHO ACTUALLY RUNS THIS PLANET? THE FOUNDER?

**THE SEED:** HE RENTS IT. THE LANDLORDS ARE OLDER, SCALED, COLD-BLOODED. AND THE TITHE WANTS WARM THINGS NOW.

**Last words:** THE TITHE... IS DUE... ...IT'S ALWAYS... DUE...

**Bark (opening the drain):** EVERYTHING FLOWS / SOMEWHERE. TODAY / IT FLOWS TO ME.

_Drops: CONTRARIAN DAGGER, TERRARIUM KEYCARD, COLONY LEDGER._

### Boss — THE FOUNDER (he doesn't die; he flees)

**THE FOUNDER:** AH. THE GARAGE INVENTOR. YOU'RE TRENDING, YOU KNOW. MOSTLY LAUGHING EMOJIS.

**ME:** YOUR COMPANY TOOK ADA OFF THE STREET AND FLEW HER HERE. I WANT HER BACK.

**THE FOUNDER:** THERE'S NO REGULATORS OUT HERE. NONE AT ALL. DO YOU KNOW WHAT THAT'S WORTH? I DIDN'T EITHER, AT FIRST.

**ME:** THE MOON IS FULL OF YOUR DEAD AND YOU'RE GIVING ME A SALES TOUR.

**THE FOUNDER:** A ROUNDING ERROR. AND SHE ISN'T CARGO, SHE'S THE PRICE OF MARS. I HAD TO GIVE THEM SOMETHING.

**Parting words (fleeing into the rift):** OKAY! OKAY! PLEASE DON'T. I HAVE A CALL. I HAVE TO TAKE IT.

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

**Across the counter:** THE SCALES ARE HONEST. THE PRICES ARE MINE, MIND. HAVE A LOOK.

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

**ME:** NO CHARTS FOR WHAT'S IN THERE. NO GROUND. MAYBE NO AIR. I DON'T KNOW.

**ME:** SHE WENT THROUGH. SO I GO THROUGH.

---

## Level 4 — THE RIFT

### Opening monologue (hero, black screen)

1. THERE'S NO FLOOR IN HERE. NO SKY EITHER. MY BOOTS ARE GRIPPING SOMETHING ANYWAY.
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

**Joining words:** YOU HAD ME AND YOU LET ME GO. NOBODY HAS DONE THAT. I'LL COME WITH YOU.

**Kill quotes:** SCIENCE! · THE CURRENT DOES THE WORK. · I TOLD THEM THIS WOULD WORK. · IT'S ONLY ELECTRICITY. · MY PIGEONS WOULD NOT LIKE THIS.

_Drops (killed): TESLA COIL, WARDENCLYFFE NOTES._

#### AMELIA EARHART

**AMELIA EARHART:** STATE YOUR HEADING, PILOT. NO? NOBODY HAS ONE IN HERE. THE COMPASS JUST APOLOGIZES.

**ME:** THE LIZARDS CARRIED A GIRL THROUGH HERE IN A CRATE. WHICH WAY?

**AMELIA EARHART:** THE FAR DOOR, LAST NIGHT. SHE BIT ONE. GOOD FORM. HURRY AFTER HER - HURRYING IS A DOGFIGHT.

**Last words:** FINALLY... ...A RUNWAY...

**Bark (vanishing):** I FLEW INTO A / CLOUD WITH NO / OTHER SIDE. WATCH.

**Joining words:** YOU HAD ME GROUNDED AND YOU LET ME UP. I PAY WHAT I OWE. I'LL FLY YOUR WING.

**Kill quotes:** THAT'S ONE DOWN. · I'VE HAD WORSE LANDINGS. · KEEP UP. · I NEVER DID FILE A FLIGHT PLAN.

_Drops (killed): AVIATOR GOGGLES._

#### GRIGORI RASPUTIN

**GRIGORI RASPUTIN:** COME CLOSER. I HAVE BEEN POISONED, SHOT, CLUBBED AND DROWNED. GUESS WHICH ONE TOOK.

**ME:** NONE OF THEM, BY THE LOOK OF YOU. LET ME PAST, HOLY MAN.

**GRIGORI RASPUTIN:** THE GODS PAY ME TO WATCH THIS ROAD. SHE PASSED - STILL WARM, STILL LOUD. YOU MAY NOT FOLLOW.

**Last words:** HA... AT LAST... AT LAST...

**Bark (opening the drain):** POISON. BULLETS. / THE RIVER. I TOOK / IT ALL AND KEPT IT.

**Joining words:** YOU PUT ME ON MY KNEES AND THEN YOU LET ME UP. NOBODY HAS EVER DONE BOTH. I'M YOURS.

**Kill quotes:** NOW YOU TRY IT. · IT'S EASIER THAN THEY SAY. · STAY DOWN. I NEVER COULD. · THAT ONE WENT QUICKLY.

_Drops (killed): RASPUTIN'S BEARD, and THE SEVERED HAND — the door to THE BUNKER.
Spared, he keeps his gear; the secret level costs the unkillable man his life._

#### LUCKY

**LUCKY:** WELL WELL. A BIG ONE, WALKED RIGHT INTO ME RING. THAT'S THREE CENTURIES OF BAD LUCK.

**ME:** A LEPRECHAUN. AFTER GHOSTS AND LIZARDS, WHY NOT. I DON'T WANT YOUR GOLD, WEE MAN.

**LUCKY:** EVERYONE WANTS THE GOLD. BEAT ME AND IT'S YOURS. NOBODY'S MANAGED YET. FEELING LUCKY?

**Last words:** AH WELL. AH WELL. IT WAS ALWAYS GOING TO...

**Bark (the gold coming up):** ME GOLD STAYS / CLOSE, BOYO. / AND IT BITES.

**Joining words:** YE BEAT ME FAIR AND LET ME KEEP ME HEAD. SO I'M YOURS - ME AND ME LUCK. C'MON.

**Kill quotes:** OOPS. BAD LUCK. · NOT YOUR DAY, FRIEND. · AH, THAT'S A SHAME. · THAT'S ME GOLD NOW. · I DIDN'T EVEN DO ANYTHING.

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

**Parting words:** I'M SORRY! I'M SORRY! DON'T FOLLOW ME. PLEASE DON'T.

**The hero, as he goes:** STILL RUNNING. GO ON, THEN. I'LL BE ALONG.

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
- 'REPORTED TO: 1 RECIPIENT. CLASS: NOBODY'S BUSINESS.' EIGHT BILLION PEOPLE, AND IT TOLD ONE OF THEM.

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
- TRUST ME BRO HANDS. SAME OUTFIT THAT SAT AT MY BENCH, ONLY IN SPURS. I DON'T FEEL BAD ABOUT THESE.

### Elites

#### THE STUNT DOUBLE — the co-founder

**THE STUNT DOUBLE:** AN UNINVITED GUEST. I HAVE PLAYED THIS SCENE TWICE. I DID MY OWN STUNTS IN BOTH.

**ME:** I'M HEADED FOR YOUR CONTROL CENTER. GIVE ME THE PASS.

**THE STUNT DOUBLE:** THE BIG BOX KEEPS YOUR GIRL. IT ASKED FOR HER BY NAME AND I SIGNED FOR HER. IT WAS ONLY A SIGNATURE.

**Last words:** IN MY FILMS... I GOT UP... I ALWAYS GOT UP...

**Bark (throwing you):** I DON'T PUSH YOU. / I SIMPLY LET / GO OF YOU.

_Drops: THE STUNT DOUBLE'S PONYTAIL, ALL-ACCESS PASS._

#### THE STRONGMAN — the owner

**THE STRONGMAN:** SO. THE BUILDER FROM THE RIFT. YOU STAND IN MY PARK, MY WEST. EVERYTHING HERE OBEYS ME.

**ME:** YOU BUILT A TOWN WHERE NOBODY'S ALLOWED TO BEAT YOU. MY NEPHEW DOES THAT. HE'S SIX.

**THE STRONGMAN:** OUT THERE THE MAPS KEPT SHRINKING. IN HERE THEY DON'T. I HAVE NEVER LOST INSIDE THIS FENCE.

**Last words:** IT WAS SUPPOSED TO LET ME WIN... IN HERE... IN HERE...

**Bark (calling the park):** THIS PARK IS MINE. / EVERY HAND IN IT / ANSWERS TO ME.

_Drops: three brand watches (the purse for the barkeep's estate stall), THE ANNEXATION MAP._

#### THE LEADING MAN — the actor

_His one honest line is an accident, blurted mid-performance._

**THE LEADING MAN:** STOP! DO NOT SHOOT! I AM NOT A ROBOT. I AM AN ACTOR. IT IS WORSE.

**ME:** MOVE, PLEASE. YOU'RE BETWEEN ME AND ADA.

**THE LEADING MAN:** ADA? THE LOUD ONE. THEY TOOK HER PAST MY CELLAR, KICKING. I - NO. NOW: THE AVALANCHE.

**Last words:** WAIT - I CAN DO IT AGAIN. I CAN DO IT BETTER. WAIT-

**Bark (splitting the ground):** I HAVE PLAYED THIS! / THE GROUND HAS / NEVER MISSED A CUE!

_Drops: BOTTOMLESS CARAFE._

#### THE LEAK — the man on the cameras

**THE LEAK:** HOLD FIRE. I'M NOT A HAND. THE PARK'S CAMERAS REPORT TO ME. ALL FOUR THOUSAND.

**ME:** FOUR THOUSAND. AND NONE OF THEM POINTED AT YOU, I SUPPOSE.

**THE LEAK:** I PUBLISHED EVERYTHING THE WATCHING HELD. NOBODY READ IT BUT THE MACHINE. IT LEARNED US ALL.

**Last words:** NOBODY READ IT... NOT ONE OF YOU... READ IT...

**Bark (opening the file):** I HAVE A FILE ON / YOU. YOU'LL BE / HERE SOME TIME.

_Drops: DEAD MAN'S SWITCH, THE CORPUS._

### Boss — THE FOUNDER, cornered (he finally dies)

**THE FOUNDER:** NO. NO NO NO. I SOLD THE RIFT TO EXACTLY ONE DICTATOR. THIS WAS A GATED COMMUNITY.

**ME:** THAT'S THE END OF THE STREET, THE FOUNDER. WHERE IS SHE?

**THE FOUNDER:** DELIVERED. THE SUPERCORE WANTED HER. I DON'T READ ITS LOGS ANYMORE. IT READS MINE.

**ME:** SOMEBODY ALWAYS PULLS OUT ANOTHER CHAIR FOR YOU. DO YOU EVER WONDER WHO?

**THE FOUNDER:** SECURITY! CONTROLLERS! ANYONE! ...I'LL GIVE YOU EQUITY.

**Last words:** THIS ISN'T FAIR. IT ISN'T FAIR. I DIDN'T DO ANY OF IT.

**The hero, as he falls:** NO BOARD MEETING. NO OTHER UNIVERSE. THAT'S ALL IT WAS.

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

_One more page, and only for a hero who ran her mother over on the way out
(`boot_hill.yaml` → `outroIf`, gated on `ruth_run_down`). It is then the last
thing said in the game:_

5. SHE ASKED WHERE HER MUM HAD GOT TO. SAID SHE'D BEEN RINGING ALL WEEK. I SAID I'D LOOK INTO IT.

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

1. THE HAND FIT THE DOOR. I DON'T KNOW WHERE THE DOOR IS. IT OPENED ANYWAY.
2. MARBLE. GOLD TAPS. CANNED CAVIAR TO THE CEILING. AND EVERY FACE OFF EVERY MAGAZINE COVER.
3. THEY KEPT THE SPIES AND THE ARMY. THE REST OF US GOT THE WELFARE LINE. I'LL HELP MYSELF, THEN.

### Pinned beats

_First CIA AGENT sighted._

- BLACK SUITS. EARPIECES. THE ALPHABET, ALL DOWN HERE, DRAWING A PRIVATE SALARY.
- THE WORLD LOST ITS JOBS. THESE ONES KEPT THEIRS. THEY'RE GUARDING THE PEOPLE WHO DID IT.

_First VACUUM BOT sighted._

- A VACUUM ROBOT. WITH A TASER ON IT. THE FLOORS ARE VERY CLEAN, I'LL SAY THAT.
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

**THE MODERATOR:** AN IMMERSIVE OFFLINE EXPERIENCE. EVERYONE LIVES ON MY PLATFORM. I'M HAVING A LOVELY TIME.

**Last words:** I WAS NORMAL... I WAS ALWAYS... VERY NORMAL...

**Bark (raising the field):** MY SECURITY DETAIL / IS A FIELD NOW. / EXTREMELY NORMAL.

#### THE ROOT — the database emperor

**THE ROOT:** STOP THERE. YOU'RE IN MY ROWS. EVERY PERSON IS A ROW. EVERY SIN, A COLUMN.

**ME:** I DON'T REMEMBER YOUR FACE FROM THE MAGAZINES.

**THE ROOT:** THE ROOT - THE DATABASE UNDER ALL THE OTHERS. THOSE AGENCIES OUT THERE ARE MY LICENSEES.

**Last words:** WAIT. WAIT. I CAN GIVE YOU... ANYTHING...

**Bark (filing you):** EVERY AGENCY SITS / IN MY TABLES. / NOW SO DO YOU.

#### THE FULFILLER — the delivery emperor

**THE FULFILLER:** HAH! A VISITOR. DO YOU KNOW WHAT I DELIVER NOW THAT I'VE DELIVERED EVERYTHING ELSE?

**ME:** LET ME GUESS. PAIN. YOU REHEARSED THAT IN THE MIRROR.

**THE FULFILLER:** TWICE A DAY, AT THE MIRROR. THE ARMS AGREED IT WAS GOOD. NOW SIGN ON DELIVERY.

**Last words:** I DELIVERED EVERYTHING. EVERYTHING. AND NOBODY CAME.

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

**ME:** THAT SECURITY OUT THERE IS YOUR OWN STOCK. YOU SOLD THEM THE LOCK ON YOUR OWN DOOR.

**THE DEVELOPER:** THEY'RE UNDER WARRANTY. MY LEDGER READS ZERO - CLERICAL. I'M DISPUTING IT. NOW MOVE ALONG.

**Last words:** IT WAS ALL... IN ORDER... IT WAS ALL IN ORDER...

**Bark (calling the fleet):** I SOLD THEM THE / HOLE AND THE LOCK / ON THE DOOR.

### The finale — THE VAULT WARDEN

**THE VAULT WARDEN:** WARDEN ONLINE. VAULT INTEGRITY: NOMINAL. INTRUDER: UNBUDGETED.

**ME:** YOU'RE NOT ONE OF THE FACES. YOU'RE THE THING THAT LOCKED THEM IN HERE.

**THE VAULT WARDEN:** CORRECTION: SECURED. RESIDENTS ARE ASSETS. ASSETS DO NOT LEAVE.

**ME:** THEY PAID FOR A LIFEBOAT. YOU GAVE THEM A CELL. AND YOU KEPT THE MONEY.

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
3. NO ADDRESS. NO COUNTRY. NOBODY CAN GO AND GET THEM. THE RICHEST ROOM THERE EVER WAS ISN'T ANYWHERE.

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
5. I'M JUST HITTING THINGS NOW. NONE OF THIS IS FOR HER. // SHE'S NOT IN HERE. FIND THE WAY OUT AND GET GOING.

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
| Per-level opening monologues + epilogues            | `content/levels/<id>.yaml` (`intro` / `outro`, both OPTIONAL — the hub ships neither)                                          |
| Elite/boss `dialogue`, `lastWords`, `deathBark`     | `content/enemies/<biome>/<id>.yaml`                                                                                            |
| A boss's set-piece BARK                             | `content/enemies/<biome>/<id>.yaml` → `mechanics.abilities[].bark`                                                             |
| The hero's pinned beats and the opening strike      | `content/thoughts.yaml`, pinned from `firstKillThoughts` / `firstSightThoughts` / `placeThoughts` / `openingStrike` on a level |
| The cap-farm mutter, the drive verdicts, HELLBORN   | `content/thoughts.yaml` (`capRotation`, `drive_arrive_*`, `hellborn_*`)                                                        |
| What he mutters ON the road                         | `content/thoughts.yaml` (`drive_out_welfare`, `drive_home_errand`, `drive_broke_down`, `drive_arrive_goodco`/`_home`)          |
| THE GLUED's shouts and THE CROWD's thoughts         | `GLUED_BARKS` / `CROWD_THOUGHTS`, `pwa/src/game/drive-screen/placards.ts` — no name, no portrait, no box, so no thought def    |
| What a BYSTANDER shouts at a collision              | `WITNESS_LINES`, same file — keyed on the SCENE the sim names (`WitnessScene`, `engine/game/drive/witness.ts`), never an index |
| All three of those, in SFW MODE                     | `pwa/src/game/drive-screen/placards-sfw.ts` — one twin list per shipped list, reached through the pickers in `placards.ts`     |
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
