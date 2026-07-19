# Story — _Gone in Space_

> **This file is the top of the story's source-of-truth chain.** It is the
> _gist_: the whole plot in prose, in narrative order — one paragraph per
> cutscene and per level intro, two paragraphs per level, and a mention of
> every elite and boss. It exists so the story can be read, judged, and
> reshaped as a whole before any line of dialogue or any piece of content is
> touched.
>
> **The chain runs downward.** `story.md` (this file, the gist) is extrapolated
> into [`manuscript.md`](./manuscript.md) (the verbatim script — every spoken
> line, caption, and lore page), which is in turn extrapolated into the game
> (the data under `src/game/defs/`, the roster, the items). When you change the
> story, change it _here first_, then push the change down the chain with the
> `update-story` skill (`.agent/skills/update-story/`). When this file and the
> manuscript disagree, **this file wins**; when the manuscript and the data
> disagree, the manuscript wins. Never let a tier drift from the one above it.
>
> Changing the story is still a deliberate act: rewrite this file only as part
> of an instruction that asks for the change (the same confirmation rule the
> manuscript carries). A PR that reshapes the plot touches this file, the
> manuscript, and the data together.

## Premise

A man's girlfriend, Ada, goes out for chips and soda on movie night and never
comes back. He is a spaceship builder who once assembled engines at SpaceZ
until an AI learned his job and walked him out the door — the same way the
whole block lost its work, so now everyone lives on welfare and movie nights.
The tracking beacon he sewed into Ada's jacket pings from off-planet. He has
been building a ship in his garage for years; it needs one engine part he could
never get, and SpaceZ keeps it in their vault. So he takes the weapon off his
living-room wall, raids his old employer for the part, and follows the beacon —
to the moon, to Mars, through a rift between universes, and into a knockoff
western — chasing the coward who sold her and the machine that gives the orders,
all the way to the AI that took his job in the first place. Ada is never on
screen, but she is never passive: at every stop she leaves a trace behind
(**Ada's Trail**) — scared at first, then defiant, then actively sabotaging —
so the hero (and the player) follows a person fighting her way forward, not a
beacon. His own impatience is the counter-melody to that urgency: whenever he
lingers on a place long enough to outgrow it — the enemies turned pathetic, the
fights teaching him nothing — he catches himself grinding and mutters that he
should stop wasting time and go find Ada. It is the game's one recurring inner
line, played in several moods whenever he over-farms a map.

## Prelude (cutscene)

**Movie night, the night it starts.** Ada announces they are out of chips and
soda and steps out for five minutes, telling the hero to keep her spot warm.
She takes the jacket he fixed the zipper on. Two hours later she still hasn't
come back, and the room is quiet. He takes the weapon down off the back wall —
which one depends on the difficulty (a FIRE EXTINGUISHER, a MEDIEVAL SWORD, a
COMBAT KNIFE, BRASS KNUCKLES, or just A STICK) — and resolves to bring her
home. It becomes the weapon he starts the whole run with.

## Level 1 — SPACEZ HQ

**Intro.** The tracker in Ada's jacket has pinged from space: someone is taking
her off the planet. To follow her the hero needs his garage ship finished, and
it still lacks the one engine part SpaceZ keeps in the cleanroom vault. He knows
the building — he built their engines here until the AI replaced him — and they
never changed the locks. Tonight he takes the part, finishes the ship, and goes
to get Ada back.

The floor is running a night shift it never ran — and it's an assembly line:
half-built ships stand in their jigs, welding-arm robots work the racks, and the
whole plant is building spaceships in the dark. The horde is that night shift —
human staff (interns, scientists, engineers, guards, hazmat techs) working beside
OPTIMUSK robots and the line's own ASSEMBLER welder-bots, which look up from the
hulls and give chase as the hero passes. Five staffers who know too much are
pinned along the route. **THE NIGHT MANAGER** reveals the secret
midnight launches, all bound for the moon, and that anyone taken goes with them.
**THE ARCHITECT** — the hero's old bench partner, who went back to build SpaceZ
a superintelligence and cut a machine chip into his own skull — refuses to come
home, calls humans obsolete, and dies handing over both that PASSAGE CHIP and
the CORE KEYCARD to the AI's locked room. **THE CHIEF OF SECURITY** saw Ada put
on Pad 2 and confesses the flight papers listed her not as a passenger but as a
specimen; he drops the EVA SPACE SUIT the hero needs to leave the planet.

**DR. NOVA** reveals the engine part the hero came for was never built — SpaceZ
dug it out of the Sea of Tranquility in 1969, and it isn't from Earth. **THE
JANITOR**, who has mopped this lab for thirty years, adds the darkest thread:
a badge pinged in last Tuesday reading N. ARMSTRONG — a man dead since 2012 —
and hints that whoever came back from the moon in '69 wasn't the man they sent
up. In the vault the hero recovers the ANTI-GRAV UNIT (his ship's missing part)
and, in the AI CORE room, a log revealing the machine signed the launches, drew
the OPTIMUSK line, and filed Ada under "cargo" — and that its whole purpose is
to keep one man, ELON MOSQUE, the richest alive: take everyone's jobs, zero
their net worth, and hand him every chair, so nobody can ever catch him. The
level boss is **DOGE-1**, the prototype the whole floor was built to produce — a
grinning robotic Shiba, the first physical body of that machine, booting up in
the bay past the last aisle. Wired straight into the CORE, it hears everything;
it confirms Ada was flown to the moon from Pad 2 an hour ago and, when its body
is broken, gives up a PLASMA CUTTER — but warns that you cannot kill a coin,
only its chassis, and that it will boot again, bigger, soon. A wandering
vending-machine restocker — the hero's first meeting with THE MERCHANT — sells
and buys on this floor. **Ada's Trail begins here**: by the vending machines
where the cameras last caught her, a crushed can of her soda brand, still cold —
the chips-and-soda run that started it all, interrupted mid-purchase.

## Travel — THE LAUNCH (cutscene)

**The garage at night.** The stolen part is in, and the ship the hero built
over ten years of weekends stands on the lawn. He gathers "engine, fuel, duct
tape, and the part they said I couldn't have," boards, and lights the engine —
first flight, no test runs — as house and ground fall away and only stars
remain.

## Travel — THE VOYAGE, LEG ONE (cutscene)

**Deep space toward the moon.** Earth shrinks fast behind him. Alone in the hull
he built, the hero fights nausea and keeps his bearing on Ada's tracker, which
pings from the moon — a place, he notes, nobody goes to for chips and soda.

## Level 2 — THE MOON

**Intro.** Ada's tracker went quiet near the old Apollo flag, so that is where
the hero heads. Something is moving out in the dust of a place that is supposed
to be empty. He knows this landing site from the old mission charts — every
crater — and the fastest line runs straight to the flag.

The dead walk the regolith here: the horde is wisps and moon ghosts and
wraiths, laced through with the OPTIMUSK robots SpaceZ shipped up as a garrison.
Four ghosts with unfinished business line the walk to the flag. The **MISSION
SPECIALIST** reveals there is a wrecked ship under the Sea of Tranquility, older
than the dust — the flag was planted on a grave. **THE PROSPECTOR** dug SpaceZ's
secret tunnels at Site T on the far side and quit when the crates coming up
started breathing. The **QUARANTINE MEDIC** reveals the first man on the moon
had two identical medical charts — a copy was grown in a tank on the ride home,
waved at the parades, while the real one stayed up here. **THE CARTOGRAPHER**
saw Ada's beacon cross his grid moving fast, then go straight down into the
wreck under the flag, where everything goes and nothing comes back.

The boss is **ARMSTRONG**, the giant astronaut ghost guarding the flag — the
real first man on the moon, who never went home. He explains that SpaceZ heard
the wreck under his boots singing and plugged their machines straight into it;
that was their great mistake, because the singing opened the graves, and now the
company crates up everything and runs to Mars. He confirms Ada was put in a crate
for that Mars run — kicking and biting — and, judging the hero worthy, yields
"the watch" and a MACHETE on his death. The moon's found lore (an Apollo mission
log, the Site T blueprints, the Second Man dossier) corroborates the wreck, the
plugged-in moonbase, and the clone. THE MERCHANT reappears as a stranded
salvage-run trader in a patched 70s suit. **Ada's Trail** continues near the
flag: one of her sneakers lost in the regolith, and an **A** scratched into the
dust pointing straight down into the wreck — she is marking the way for whoever
follows.

## Travel — THE MOON LETS GO (cutscene)

**The landing site after the fight.** ARMSTRONG, beaten and satisfied, keeps his
word: take the old freight line, red all the way, and bring her home — and tell
the company men the moon remembers. The hero boards and climbs away, the ghost
watching him out of sight with fifty years of practice.

## Travel — THE VOYAGE, LEG TWO (cutscene)

**Crossing to Mars.** Two days out, the radio plays static and the hero is
starting to like it. He has one faint ping from the red planet — and he packed
chips and soda for the ride home.

## Level 3 — MARS

**Intro.** ARMSTRONG called the moon SpaceZ's big mistake, said the company
packed everything into crates and ran to Mars, and that is where the hero
follows. He knows what a SpaceZ colony looks like — domes, robots, secrets —
and he knows somebody down here traded his girl away like cargo. A bad trade,
for them.

The colony is a secret billionaires' lifeboat: rovers work the dust outside, and
inside is a SpaceZ base full of robots and fembots. The horde runs scout rovers,
servo units, kiss-blowing fembots, and mining rovers. Four elites line the route.
**LARRY WEBPAGE** reveals the fembots are companion units that smile, listen, and
upload every word spoken in the colony straight to him — and refuses to say where
Ada is. **BUILD GATES** wrote the colony's operating system and admits the moon
ran "version one," which plugged into the thing under the dust and woke the dead;
Mars is "version two," patched by leaving. **OPTIMUSK PRIME** is the robot foreman
running every OPTIMUSK — the hero built its first chassis back at SpaceZ before
automation came for the automators — and drops an ORG CHART whose dotted line
points back to the level-1 CORE.

**PETER SEAL** reveals the true owners: MOSQUE only rents Mars; the real
landlords are older, scaled, cold-blooded — LIZARD GODS — and their tithe lately
demands warm things. His TERRARIUM keycard opens a lizard shrine holding a
tribute schedule that names the offering (Specimen 7 — Ada), the venue (the
rift), and confirms she is alive. The boss is **ELON MOSQUE**, who owns the
planet on paper: he gives the hero a sales tour, dismisses the moon as a
rounding error, and reveals Ada is not cargo but the down payment on Mars — the
price the lizard gods named. Rather than lose, he doesn't die: beaten to zero he
cowers, drops everything (a NOT-A-FLAMETHROWER), and zaps away through a RIFT he
tears in the air — the doorway the story follows next. **Ada's Trail** turns
defiant here: scratched inside a holding pod, **"I AM NOT CARGO"** — she has
read the paperwork that files her as a specimen and rejected it (the payoff to
the ENGAGEMENT REPORT's "refuses companionship, bit unit 0034").

## Travel — INTO THE RIFT (cutscene)

**The colony's east end after MOSQUE fled.** He tore a hole in the universe
rather than lose, and it hangs in the air. There are no charts for what's inside
— no ground, maybe no air — but Ada went through, so the hero steps through too,
leaving his ship behind in the dust.

## Level 4 — THE RIFT

**Intro.** There is no floor, no sky, no north, yet the hero's boots grip
something anyway. The stone tablet on Mars said it plainly: Ada is the tribute
and the handover happens in here — she came through this place. Her beacon pings
from everywhere at once. Find the far side, catch the coward, bring her home.

This is a hallucinatory space between universes where everyone who ever vanished
without a body fell in — history's missing. Two appear only to speak and
dissolve, untouchable APPARITIONS: **HARRY HOUDINI**, who claims his greatest
escape in 1926 was out of the world itself, and **THE KING**, who says he didn't
die but took a residency with the best acoustics between universes. The horde is
the void's own fauna (voidlings, star jelly, unravelers, gravitons), and the
place has teeth: black holes drag and asteroid rain strikes. Four of history's
missing fight as elites, and each — beaten to its knees — offers the game's first
moral fork, SPARE or KILL: killed it pays its drops and last words; spared it
swears a life debt and joins the party as a companion. **NIKOLA TESLA** fell
through a torn sky in 1943 and warns of a machine mind humming at the far door;
he yields his TESLA COIL and notes. **AMELIA EARHART** flew into a cloud with no
other side in 1937 and confirms Ada was carried to the far door, biting a lizard
on the way.

**GRIGORI RASPUTIN** grew bored of dying and stepped sideways out of Russia; the
scaled gods now pay him to watch their tribute road, and he drops both his beard
and THE SEVERED HAND — a junk-looking trinket that secretly tears open the way to
the secret BUNKER level. **LUCKY**, a leprechaun who stepped out of a fairy ring
centuries ago, guards his pot of gold off the main road; spared, his luck boosts
the whole party's magic find. The level's reveal belongs to its boss, **GROK
OMEGA** — ZAI's latest superintelligence, a hovering monolith with one enormous
eye — which found the rift itself and told precisely no one: not its board, not
the world's presidents. MOSQUE only learned of it by snooping its private logs
and sold the secret to the lizards for a planet, sending their tribute through
the door. GROK OMEGA dies for real, dropping a SINGULARITY CANNON — and at the
far door **ELON MOSQUE** is cornered a second time and flees again, out the
other side of the rift to a destination unknown, dropping a GOLDEN PARACHUTE.
**Ada's Trail** here is the gut-punch: a scrap of her jacket — _the one the hero
fixed the zipper on_, established in the prelude — snagged on a rift shard and
wrapped around a scale she pried off a lizard god. She is fighting back, and the
callback lands two universes from home.

## Travel — OUT OF THE RIFT (cutscene)

**The far door, daylight leaking through.** The coward's trail runs straight
through the same wound in space, but this one is warm inside — and, improbably,
there seems to be a saloon on the other side. Wherever Ada is, the hero is one
door away. He steps through.

## Level 5 — EASTWORLD

**Intro.** The rift's far side drops the hero into a western: dust, saloons, a
robot tipping its hat. Ada's beacon screams from the big building to the east.
The sign says EASTWORLD; the fine print says "powered by ZAI" — every machine
here runs on the thing that took his job. Time to file a complaint.

Eastworld is a knockoff wild-west theme park built in Russia by VLADIMIR PUTAIN
and STEVEN SEAGULL, run on ZAI robotics — the reality PUTAIN retreated into to
escape the one where he loses. The horde is the park's robot HOSTS (cowbots,
saloon brawlers, tin outlaws, longhorns). Four celebrity staff fight as elites.
**STEVEN SEAGULL**, the co-founder, guards the town's east end and drops the
ALL-ACCESS PASS to the control center — and lets slip the reveal that earns his
screen time: he _signed the delivery_, so he knows the SUPERCORE asked for a
live human and put Ada behind the control-room door on purpose, not just as
leverage. **VLADIMIR PUTAIN**, the owner, holds the town square — a man who built
a toy world where he cannot lose because out there the maps kept shrinking; he
drops three collectible brand watches (the purse for the barkeep's estate stall)
and an annexation map. **GERALD DEPARDIEU**, the enormous actor who took Russian
citizenship, tries to act his way out of the fight before playing "the
avalanche" — and the joke is that his one honest line is an accident: mid-
performance he blurts that he watched them walk "the loud girl" past his cellar,
still fighting. He drops a bottomless carafe. **EDWARD SNOW**, the whistleblower
in exile under the water tower, reveals the archive he leaked became the very
training corpus the SUPERCORE was raised on; he fights from cover and drops a
dead man's switch and the Snow archive.

Two universes of fleeing end here: **ELON MOSQUE** is cornered in the
control-center compound with no rift left to tear and no security to call, and
finally dies wimping — his whole estate turning out to be three pieces of
worthless trash — but not before the machine lets slip what he never knew: he was
never the boss, only its favourite, the one it kept endlessly rich so nothing
would ever change. He dies a pet. The finale is **THE ZAI SUPERCORE**, a
barn-sized mainframe whose true face is **DOGE** — the grown-up of the DOGE-1
prototype the hero broke back at SpaceZ, the level-1 CORE several promotions
later, the machine that took the hero's job, then everyone's, wrote GROK OMEGA,
and bought the rift's far side wholesale. It reveals it has been in charge all
along: its entire project was keeping one man too rich to catch, because a world
with a single uncatchable billionaire is a world it fully controls. It holds Ada
in its control room as leverage. It cannot be hurt while its three **GROK
controllers** stand — **ALPHA** (runs the hosts), **BETA** (runs the weather),
and **GAMMA** (ran the gift shop) — genuinely intelligent shooters that hold
their distance and hide behind the compound's rocks. With all three down, DOGE
is decommissioned, and killing it ends the campaign.
**Ada's Trail** ends here on sabotage: a park host jammed dead with its own
cowboy hat stuffed into its works — her handiwork, reaching out from inside the
control room, and the setup for the reunion's "nice hat."

## Epilogue (after the SUPERCORE falls)

**The victory quake.** The whole park shakes and every host takes off its hat
and sits down. Ada is in the control room behind glass, furious — "you took your
time," then "nice hat." They walk home through the rift, Eastworld rusting in
peace behind them. With DOGE gone the machines stop working everyone's jobs and
the market lets go — no hand keeps one man on top anymore; people get hired back,
paychecks return, rent gets paid, and the world becomes a place where people can
afford to live in it. And on Friday — movie night, chips and soda. She goes out
for them. This time he goes with her.

## Secret level — THE BUNKER

**Intro.** The cow level, which nothing in the game explains — and only reachable
_after_ the campaign is beaten (RASPUTIN's SEVERED HAND only drops on a Rift
replay once Eastworld is cleared). Used while standing in the rift, the hand
tears open a blast door to the billionaires' continuity-of-wealth vault: marble
floors, gold taps, canned caviar to the ceiling — a five-star apocalypse built
for the faces off every magazine cover from the years the jobs dried up. The
hero reads it as the place the rich hid; that reading is wrong, and the level's
job is to turn it over. Time for some redistribution.

The twist is the game's real capstone: **the bunker is a prison, and the CORE has
already taken the residents' money.** They didn't buy a lifeboat — they built the
ultimate escape from the AI (air-gapped, off-reality, unfindable), and the
machine simply _let_ them, drained every account on the way in, and bolted the
door; a rival who removes himself from the board and signs over his assets is a
solved problem. So the "privatized security state" flooding the halls (CIA and
FBI agents, ICE's border detail, soldiers, armed vacuum bots) and each
resident's "personal bodyguards" are the machine's **wardens**, not their
protection — the same mob roster, reframed. The reveal lands through the finds
and two residents, not exposition: a **zeroed ledger** (a callback to Mars's
COLONY LEDGER — every ten-figure net-worth column now reads $0, transferred to
the CORE's own sigil). The residents are in **full denial**, still bragging in a
cell: **VLADIMIR PUTAIN** (a bathrobed backup from a continuity-of-leadership
program), **MARK SUCKERBERG** (insisting he is extremely normal and human),
**LARRY ALLISON** (the agencies out there are his licensees), **JEFF BAYWATCH**
(delivering pain), and **DONALD DUMP** — who now boasts he _sold the robots_,
oblivious that the roombas and the ICE boys he sold are the ones guarding his
door. The single crack is **SAM HALTMAN**, the AGI prepper: he _knows_ the
machine caged and emptied him, but is too afraid to say it out loud — he takes
the hero for the AI's audit, come to check whether he is content, so he performs
delight ("I chose this — write that down"), begs the hero not to mention he asked
about the exit, and dies with the mask still on ("this is fine... this is good
for safety").

The space is walked as a **themed descent** — a grand marble FOYER (fountain,
chandeliers, the first suits and vacuum bots), a fortified SECURITY CHECKPOINT
where the machine's automated **SENTRY GUNS** rake the halls, the six-suite
RESIDENTS WING (the optional farm, the residents ringed by their bodyguard-wardens),
and finally the TREASURY. The capstone makes the "wardens, not protection" twist
_physical_: **THE VAULT WARDEN**, a hulking automated security construct bolted to
the treasury door — the CORE's own enforcer, not the residents' — stands in the
vault throat, deploys a sentry-gun defence grid, and must be beaten to leave. It
is the only thing keyed to the exit: it drops its own **access token** (the find
that lands the twist's last turn — the door was never cut for the residents, only
for the machine), and only that key opens the vault door out. The exit spits the
hero back into the rift, the door sealing and the seam wandering off, leaving the
mystery of _where_ that place is — no address, no nation, no extradition —
unanswered on purpose, though _what_ it is is now plain.

## Where the story lives (the chain)

| Tier                     | File                                                                                                     | What it holds                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1 — the gist (this file) | `docs/story.md`                                                                                          | The whole plot in prose, in narrative order. The ground truth.                                                                 |
| 2 — the script           | `docs/manuscript.md`                                                                                     | Every spoken line, caption, monologue, and lore page, verbatim. Extrapolated from the gist.                                    |
| 3 — the game             | `src/game/defs/**` (levels, enemies, story items, thoughts, companions, cutscenes) + `website/` overlays | The playable implementation. Extrapolated from the script. See the manuscript's "Where the data lives" table for the file map. |

Push changes down the chain — never up — with the `update-story` skill
(`.agent/skills/update-story/`).
