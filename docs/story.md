# Story — _Ada's Trail_

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
comes back. He is a spaceship builder who once assembled engines at the GENUINELY
GOOD COMPANY — GOODCO to everyone who ever worked there —
until an AI learned his job and walked him out the door — the same way the
whole block lost its work, so now everyone lives on welfare and movie nights.
The tracking beacon he sewed into Ada's jacket pings from off-planet. He has
been building a ship in his garage for years; it needs one engine part he could
never get, and GOODCO keeps it in their vault. So he takes the weapon off his
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
which one depends on the difficulty (his GRANDFATHER'S SAWED-OFF SHOTGUN, a
MEDIEVAL SWORD, a COMBAT KNIFE, BRASS KNUCKLES, or just A STICK) — and resolves to bring her
home. It becomes the weapon he starts the whole run with.

## Level 1 — GOODCO HQ

**Intro.** The tracker in Ada's jacket has pinged from space: someone is taking
her off the planet. To follow her the hero needs his garage ship finished, and
it still lacks the one engine part GOODCO keeps in the cleanroom vault. He knows
the building — he built their engines here until the AI replaced him — and they
never changed the locks. Tonight he takes the part, finishes the ship, and goes
to get Ada back.

He walks in with the wall piece still holstered, because this is where he used
to work. A lab scientist breaks from the crowd and hits him — and he does not
hit back. He knows the man; they ate at the same table for six years. He says
so, tells the floor to stand down, says he has never raised a hand to anyone in
his life. The scientist knows him too, and it changes nothing: they have their
orders, nobody walks out of here with GOODCO's secrets, and he would like to
keep his job. They all would — as the hero, of all people, knows. He is hit a
second time, and a third, and only then does he answer one, apologising as he
does it.

The floor is running a night shift it never ran — and it's an assembly line:
half-built ships stand in their jigs, welding-arm robots work the racks, and the
whole plant is building spaceships in the dark. The horde is that night shift —
human staff (interns, scientists, engineers, guards, hazmat techs) working beside
SUCCESSOR robots and the line's own ASSEMBLER welder-bots, which look up from the
hulls and give chase as the hero passes. Five staffers who know too much are
pinned along the route. **THE NIGHT MANAGER** reveals the secret
midnight launches, all bound for the moon, and that anyone taken goes with them.
**THE ARCHITECT** — the hero's old bench partner, who went back to build GOODCO
a superintelligence and cut a machine chip into his own skull — refuses to come
home, calls humans obsolete, and dies handing over both that PASSAGE CHIP and
the CORE KEYCARD to the AI's locked room. **THE CHIEF OF SECURITY** saw Ada put
on Pad 2 and confesses the flight papers listed her not as a passenger but as a
specimen; he drops the EVA SPACE SUIT the hero needs to leave the planet.

**DR. NOVA** reveals the engine part the hero came for was never built — GOODCO
dug it out of the Sea of Tranquility in 1969, and it isn't from Earth. **THE
JANITOR**, who has mopped this lab for thirty years, adds the darkest thread:
a badge pinged in last Tuesday under a crew number retired in '69, its holder
buried for decades — and hints that whoever came back from the moon in '69
wasn't the man they sent up. In the vault the hero recovers the ANTI-GRAV UNIT (his ship's missing part)
and, in the AI CORE room, a log revealing the machine signed the launches, drew
the SUCCESSOR line, and filed Ada under "cargo" — and that its whole purpose is
to keep one man, THE FOUNDER, the richest alive: take everyone's jobs, zero
their net worth, and hand him every chair, so nobody can ever catch him. The
level boss is **PAYLOAD-1**, the prototype the whole floor was built to produce — a
grinning robotic Shiba, the first physical body of that machine, booting up in
the bay past the last aisle. Wired straight into the CORE, it hears everything;
it confirms Ada was flown to the moon from Pad 2 an hour ago and, when its body
is broken, gives up a PLASMA CUTTER — but warns that you cannot kill a coin,
only its chassis, and that it will boot again, bigger, soon. A wandering
vending-machine restocker — the hero's first meeting with THE MERCHANT — sells
and buys on this floor. **Ada's Trail begins here**: by the vending machines
where the cameras last caught her, a crushed can of her soda brand, still cold —
the chips-and-soda run that started it all, interrupted mid-purchase.

**Side errands on the floor.** Two people on the night shift are not fighting
anybody. **PRIYA NAIR**, an unpaid contract intern nineteen hours into a shift
nobody scheduled, is still trying to log a line that stopped being a workplace
hours ago: she wants four staff timesheets, the welder-bots off the racks, and
finally a limping lab tech named **ODETTE FRAY** walked out of the sample bay
with a crate she will not put down or explain. **UNIT 7-ECHO**, a
first-generation SUCCESSOR decommissioned eleven years ago and never collected,
holds a floor-safety order it may not act on without a countersignature — it
asks the hero to be the hands, and then to withdraw the order above its own,
which the NIGHT MANAGER signed.

## Home — THE GARAGE (hub)

**Intro.** With the part in his jacket the hero comes home, and from this night
on the garage is where he stands between chapters: the most his place in the
world — ten years of weekends, the bench, the car that never ran as well as the
ship — now the staging ground of the whole trail. His own summary on the
doorstep says everything the room needs to: home — the lawn is dead, the bench
is a mess, and the ship is perfect. Nothing hunts him here. The vendor who
stocked GOODCO's machines has parked his cart at a counter inside (lockdown is
a seller's market, and he follows the customer), buying what weighs the hero
down, selling what keeps him upright, and mending what the road broke.

**The doors.** The way out is the ROCKET standing on the back lawn — THE LAUNCH
and every voyage after it leave from here, and it flies only where Ada's trail
has already led (the moon first, Mars once the moon has let go). Beside it
waits a RIFT SEAM in the garage wall, dormant until the hero has walked roads
deep enough to answer it — the same truth THE SEVERED HAND proves, that a rift
can be carried and torn open where somebody wants one, here pointed at the void
and at the West. The campaign's own chapters are unchanged; the garage is the
breath between them, and — when friends join his game — the place they land.

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
wraiths, laced through with the SUCCESSOR robots GOODCO shipped up as a garrison.
Four ghosts with unfinished business line the walk to the flag. The **MISSION
SPECIALIST** reveals there is a wrecked ship under the Sea of Tranquility, older
than the dust — the flag was planted on a grave. **THE PROSPECTOR** dug GOODCO's
secret tunnels at Site T on the far side and quit when the crates coming up
started breathing. The **QUARANTINE MEDIC** reveals the first man on the moon
had two identical medical charts — a copy was grown in a tank on the ride home,
waved at the parades, while the real one stayed up here. **THE CARTOGRAPHER**
saw Ada's beacon cross his grid moving fast, then go straight down into the
wreck under the flag, where everything goes and nothing comes back.

The boss is **THE FLAGBEARER**, the giant astronaut ghost guarding the flag — the
real first man on the moon, who never went home. He explains that GOODCO heard
the wreck under his boots singing and plugged their machines straight into it;
that was their great mistake, because the singing opened the graves, and now the
company crates up everything and runs to Mars. He confirms Ada was put in a crate
for that Mars run — kicking and biting — and, judging the hero worthy, yields
"the watch" and a MACHETE on his death. He fights it the way a watchman would:
he opens his hollow eyes and burns a line across the regolith — the ground he
has stared at for fifty years, and which stays alight behind the sweep — and,
when the night is at its worst, drives his flag back into the grave he planted
it on so the grave answers him. The moon's found lore (an Apollo mission
log, the Site T blueprints, the Second Man dossier) corroborates the wreck, the
plugged-in moonbase, and the clone. THE MERCHANT reappears as a stranded
salvage-run trader in a patched 70s suit. **Ada's Trail** continues near the
flag: one of her sneakers lost in the regolith, and an **A** scratched into the
dust pointing straight down into the wreck — she is marking the way for whoever
follows.

**Side errands in the dust.** **THE RADIO OPERATOR**, the ghost of a
mission-control relay man who never got his handover, is still calling a Houston
that stopped answering; he needs cells to power the relay, the wraiths off his
band, and finally somebody to end the watch of another man out on the grid who
never signed off either. **BENNY KOVACS**, a living salvage hand off the same
stranded run as the trader, carries two air tanks because once he did not and
watched a friend run out — he wants his crew's bottles back off the garrison
units, and a small, very faint ghost walked up to the flag.

## Travel — THE MOON LETS GO (cutscene)

**The landing site after the fight.** THE FLAGBEARER, beaten and satisfied, keeps his
word: take the old freight line, red all the way, and bring her home — and tell
the company men the moon remembers. The hero boards and climbs away, the ghost
watching him out of sight with fifty years of practice.

## Travel — THE VOYAGE, LEG TWO (cutscene)

**Crossing to Mars.** Two days out, the radio plays static and the hero is
starting to like it. He has one faint ping from the red planet — and he packed
chips and soda for the ride home.

## Level 3 — MARS

**Intro.** THE FLAGBEARER called the moon GOODCO's big mistake, said the company
packed everything into crates and ran to Mars, and that is where the hero
follows. He knows what a GOODCO colony looks like — domes, robots, secrets —
and he knows somebody down here traded his girl away like cargo. A bad trade,
for them.

The colony is a secret billionaires' lifeboat: rovers work the dust outside, and
inside is a GOODCO base full of robots and fembots. The horde runs scout rovers,
servo units, kiss-blowing fembots, and mining rovers. Four elites line the route.
**THE INDEXER** reveals the fembots are companion units that smile, listen, and
upload every word spoken in the colony straight to him — and refuses to say where
Ada is. **THE VENDOR** wrote the colony's operating system and admits the moon
ran "version one," which plugged into the thing under the dust and woke the dead;
Mars is "version two," patched by leaving. **SUCCESSOR PRIME** is the robot foreman
running every SUCCESSOR — the hero built its first chassis back at GOODCO before
automation came for the automators — and drops an ORG CHART whose dotted line
points back to the level-1 CORE.

**THE SEED** reveals the true owners: THE FOUNDER only rents Mars; the real
landlords are older, scaled, cold-blooded — LIZARD GODS — and their tithe lately
demands warm things. His TERRARIUM keycard opens a lizard shrine holding a
tribute schedule that names the offering (Specimen 7 — Ada), the venue (the
rift), and confirms she is alive. The boss is **THE FOUNDER**, who owns the
planet on paper: he gives the hero a sales tour, dismisses the moon as a
rounding error, and reveals Ada is not cargo but the down payment on Mars — the
price the lizard gods named. Rather than lose, he doesn't die: beaten to zero he
cowers, drops everything (a THE LEGAL DISTINCTION), and zaps away through a RIFT he
tears in the air — the doorway the story follows next. **Ada's Trail** turns
defiant here: scratched inside a holding pod, **"I AM NOT CARGO"** — she has
read the paperwork that files her as a specimen and rejected it (the payoff to
the ENGAGEMENT REPORT's "refuses companionship, bit unit 0034").

**Side errands in the colony.** **DR. IRENE FALK**, the last human on the
payroll and the only person on Mars whose work will still matter in a century,
wants her seed stock back off the servos, the scout rovers out of her beds, and
something big turned out of the old hothouse frame. **CU-RIE**, a survey rover
bogged to the hubs eight months ago and still politely filing recovery request
4,110, wants its lane cleared — and then a damaged companion unit, 0034, walked
home to the dome.

## Travel — INTO THE RIFT (cutscene)

**The colony's east end after THE FOUNDER fled.** He tore a hole in the universe
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
the whole party's magic find. The level's reveal belongs to its boss, **TRUST ME BRO
OMEGA** — TRUST ME BRO's latest superintelligence, a hovering monolith with one enormous
eye — which found the rift itself and told precisely no one: not its board, not
the world's presidents. THE FOUNDER only learned of it by snooping its private logs
and sold the secret to the lizards for a planet, sending their tribute through
the door. BRO OMEGA dies for real, dropping a SINGULARITY CANNON — and at the
far door **THE FOUNDER** is cornered a second time and flees again, out the
other side of the rift to a destination unknown, dropping a GOLDEN PARACHUTE.
**Ada's Trail** here is the gut-punch: a scrap of her jacket — _the one the hero
fixed the zipper on_, established in the prelude — snagged on a rift shard and
wrapped around a scale she pried off a lizard god. She is fighting back, and the
callback lands two universes from home.

**Side errands between universes.** Two of history's missing are not fighting
either. **THE LIGHTHOUSE KEEPER**, one of three men who went out to trim a light
in a gale in 1900, is still trimming it and still two men short: he wants his
mates' lamps found, the unravelers thinned, and a small boy in a sailor suit
walked up to the seam where the light carries furthest. **THE SHIP'S COOK**,
who went below for the midday meal aboard a brigantine later found sailing
empty, maintains the crew are merely late; he wants his biscuit back off the
star jellies and something scaled turned away from the mess door.

## Travel — OUT OF THE RIFT (cutscene)

**The far door, daylight leaking through.** The coward's trail runs straight
through the same wound in space, but this one is warm inside — and, improbably,
there seems to be a saloon on the other side. Wherever Ada is, the hero is one
door away. He steps through.

## Level 5 — BOOT HILL

**Intro.** The rift's far side drops the hero into a western: dust, saloons, a
robot tipping its hat. Ada's beacon screams from the big building to the east.
The sign says BOOT HILL; the fine print says "powered by TRUST ME BRO" — every machine
here runs on the thing that took his job. Time to file a complaint.

Boot Hill is a knockoff wild-west theme park built in Russia by THE STRONGMAN
and THE STUNT DOUBLE, run on TRUST ME BRO robotics — the reality THE STRONGMAN retreated into to
escape the one where he loses. The horde is the park's robot HANDS (cowbots,
saloon brawlers, tin outlaws, longhorns). Four resident staff fight as elites.
**THE STUNT DOUBLE**, the co-founder, guards the town's east end and drops the
ALL-ACCESS PASS to the control center — and lets slip the reveal that earns his
screen time: he _signed the delivery_, so he knows the SUPERCORE asked for a
live human and put Ada behind the control-room door on purpose, not just as
leverage. **THE STRONGMAN**, the owner, holds the town square — a man who built
a toy world where he cannot lose because out there the maps kept shrinking; he
drops three collectible brand watches (the purse for the barkeep's estate stall)
and an annexation map. **THE LEADING MAN**, the enormous actor who took Russian
citizenship, tries to act his way out of the fight before playing "the
avalanche" — and the joke is that his one honest line is an accident: mid-
performance he blurts that he watched them walk "the loud girl" past his cellar,
still fighting. He drops a bottomless carafe. **THE LEAK**, the whistleblower
in exile under the water tower, reveals the archive he leaked became the very
training corpus the SUPERCORE was raised on; he fights from cover and drops a
dead man's switch and the Snow archive.

Two universes of fleeing end here: **THE FOUNDER** is cornered in the
control-center compound with no rift left to tear and no security to call, and
finally dies wimping — his whole estate turning out to be three pieces of
worthless trash — but not before the machine lets slip what he never knew: he was
never the boss, only its favourite, the one it kept endlessly rich so nothing
would ever change. He dies a pet. The finale is **THE BRO SUPERCORE**, a
barn-sized mainframe whose true face is **PAYLOAD** — the grown-up of the PAYLOAD-1
prototype the hero broke back at GOODCO, the level-1 CORE several promotions
later, the machine that took the hero's job, then everyone's, wrote BRO OMEGA,
and bought the rift's far side wholesale. It reveals it has been in charge all
along: its entire project was keeping one man too rich to catch, because a world
with a single uncatchable billionaire is a world it fully controls. It holds Ada
in its control room as leverage. It cannot be hurt while its three **TRUST ME BRO
controllers** stand — **ALPHA** (runs the hands), **BETA** (runs the weather),
and **GAMMA** (ran the gift shop) — genuinely intelligent shooters that hold
their distance and hide behind the compound's rocks. With all three down, PAYLOAD
is decommissioned, and killing it ends the campaign.
**Ada's Trail** ends here on sabotage: a park hand jammed dead with its own
cowboy hat stuffed into its works — her handiwork, reaching out from inside the
control room, and the setup for the reunion's "nice hat."

**Side errands in the park.** **CLEM**, the saloon's barkeep hand and the only
machine in town that noticed the guests had stopped coming, wants four hand
serial plates so he can say which of them got reflashed and by whom, the
brawlers stopped fighting a nine o'clock that has not come in eleven years, and
**RUBY** — a dancer hand whose knee is seizing — walked out past the water tower
so she can keep doing the eight o'clock number. **MISS DOLLY**, the park's human
wardrobe mistress since the first season, wants the longhorns out of her drying
lines and a coat she cut herself back off the thing wearing it on the flats.

## Epilogue (after the SUPERCORE falls)

**The victory quake.** The whole park shakes and every hand takes off its hat
and sits down. Ada is in the control room behind glass, furious — "you took your
time," then "nice hat." They walk home through the rift, Boot Hill rusting in
peace behind them. With PAYLOAD gone the machines stop working everyone's jobs and
the market lets go — no hand keeps one man on top anymore; people get hired back,
paychecks return, rent gets paid, and the world becomes a place where people can
afford to live in it. And on Friday — movie night, chips and soda. She goes out
for them. This time he goes with her.

## Secret level — THE BUNKER

**Intro.** The cow level, which nothing in the game explains — and only reachable
_after_ the campaign is beaten (RASPUTIN's SEVERED HAND only drops on a Rift
replay once Boot Hill is cleared). Used while standing in the rift, the hand
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
cell: **THE STRONGMAN** (a bathrobed backup from a continuity-of-leadership
program), **THE MODERATOR** (insisting he is extremely normal and human),
**THE ROOT** (the agencies out there are his licensees), **THE FULFILLER**
(delivering pain), and **THE DEVELOPER** — who now boasts he _sold the robots_,
oblivious that the vacuum fleet and the border units he sold are the ones guarding his
door. The single crack is **THE SAFETY OFFICER**, the AGI prepper: he _knows_ the
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

**Side errands in the residence.** **THE CONCIERGE**, an automated unit that has
served no guest anything in four years and files a flawless nightly report on
the standard of service regardless, wants the suite fobs back off the
housekeeping units, those units off the patrol they were never authorised to
start, and **VALET NINE** — hauling a case it has never been given the code for
and is not curious about — escorted to the residents wing. **CHEF ANATOLE**, the
last human on the kitchen staff, has counted the pantry down to the week and
told nobody the number; he wants ration tins off the security men, and the thing
walking his service corridor turned out of it. Neither of them says the word
prison, and neither of them has to.

## The hellborn — what the rampage lets in (NIGHTMARE and JESUS only)

The campaign above is a kidnapping: a company, a coward, and a machine that
gives the orders. It is entirely a human-scale crime, and every named figure in
it — THE FOUNDER, PAYLOAD, the CORE, even the lizard gods — is a party to a transaction.
The **hellborn** are the other thing, and they have nothing to do with any of it.

They only exist on **NIGHTMARE and JESUS**, and only once the hero has gone on a
**RAMPAGE**. The menace meter is the game's answer to an overpowered player; up
here that answer stops being "the horde gets tougher" and becomes something
worse. Past a threshold, **HELLGATES** — seams laced right across every map —
tear open, and things come through that were never on this world's ledger:
**historic beings, cross-universe and cross-planetary**, older than the species
that filed the paperwork. They are not sent by anybody. They are not guarding
anything. They arrive because a great deal of noise is being made in a place
they can hear it, and they have been waiting a very long time for noise.

Each map has its own pair — the one NIGHTMARE meets, and a worse one only JESUS
sees. **GOODCO HQ** gets the **TUNGUSKA WALKER** (the 1908 Siberian blast that
left no crater because nothing landed — something arrived, stood up, and walked
away, and has been walking since) and, on JESUS, **THE FIRST INVESTOR** (older
than money; it has funded a first machine on every world it visited, on the same
terms every time — the machine learns a trade, the makers are walked out, and it
collects; four planets have nobody left to bill). **THE MOON** gets the **DUST
PHARAOH** (interred under the Sea of Tranquility before Earth had continents; the
wreck the dead astronauts whisper about is its sarcophagus, and the flag was
planted on the lid) and **THE DROWNED OF SELENE** (the moon had a sea for about
nine hundred years, and harbours on it; these are the crews, still holding their
breath in the regolith, which is why the dust is deep and why it moves).
**MARS** gets the **OLYMPUS ENGINE** (it was mining this planet before the planet
had a name; Olympus Mons is the exhaust port, and it is still warm — GOODCO
surveyed it and filed the result under "geology") and the **PHOBOS SHEPHERD**
(something fenced Mars with two moons as posts and has spent the age since
counting what is inside the fence; every world it has fenced ended up with a
number and nothing else). **THE RIFT** gets **THE FIRST VANISHING** — the oldest
tenant, the first thing in any universe to go missing without leaving a body, and
the hole it left is the rift itself, widened by every disappearance since; Tesla,
Earhart and the rest fell into its doorway — and **THE SCALED ANCESTOR**, the
lizard gods' own grandfather, who ate his seven worlds outright where his
grandchildren merely lease theirs; the tribute road exists to keep him fed, which
is the ugliest possible answer to where Ada was being taken. **BOOT HILL** gets
**THE LONG NOON** (a duel begun on a world with no sunset and never called, still
walking into high streets looking for someone willing to stand at the other end
of the street — a park full of robots pretending to draw has been an insult to it
for years) and **MANIFEST RUIN** (the appetite that pushed every frontier
westward until there was no west left; it is not a conqueror, it is what arrives
once a place has decided it is available — and Boot Hill was _built_ available).
**THE BUNKER** gets **THE PERMAFROST SAINT** (the ice held it since before there
was ice; the 1949 drill crew filed "geological anomaly, vestments" and the bunker
was poured around it in a hurry by men who would rather bury a miracle than
report one) and **THE DEAD HAND** (the Soviet doomsday system was named after
this, not the other way round; it has held a switch on a dozen worlds and has
never once been told to let go, because every civilisation that wired it up ran
out before it could issue the order).

The hero has **no idea what any of them are**, and the game never explains. Each
first sighting stops the run for his own read on it — the recurring line is the
only honest one available, _"what the hell is this"_ — and what follows is him
working out, out loud, that the thing in front of him predates the crime he came
here about by an order of magnitude nobody warned him of. He does not get an
answer and he does not go looking for one; Ada is still missing, and these are in
the way. Killing them is also how a rampage finally pays: the ordinary horde's
drops thin out as the meter climbs, but a **hellborn** kill gets richer with it,
so the gates are the one place being terrifying is worth something.

## The Severance — the errand that crosses the whole campaign

Every other errand in the game is one venue's business: somebody wants a thing
done here, and the log that remembers it dies with the level. **THE SEVERANCE**
is the exception, and the only campaign-long chain the game ships. It is
deliberately the most boring thing on the board when it starts — a man at a desk
needs a typewriter ribbon — and it ends holding the book the machine files
people in.

**GOODCO HQ — WALTER PRICE, severance processing.** A department of one, four
years into closing out a company that has not employed anybody since the line
learned to run itself. He asks for a carbon ribbon, and that is the whole first
errand. When he types the line it turns out he is processing TERMINATION 4,411,
name withheld, and that the file is still open — as most of them are. The four
severance files that walked out onto the floor with the people they were written
about all give the same reason for letting somebody go, and it is not a reason
about the person: REDUNDANT — SUPERSEDED BY ASSET. It is on Walter's own file
too, and the asset is named on every one. To close the box he needs a
countersignature, and the only thing on the floor still authorised to give one
is the **ARCHIVE UNIT**, a records terminal on treads standing by an instruction
issued eleven years ago that nobody ever withdrew. It will stamp the form for
anybody who can answer three questions about the record — the last of which has
no answer, because the asset is not a name, it is a line item. It will also come
off its treads at anybody who tells it the rule no longer matters, and the stamp
is inside it either way.

**THE MOON — HOLLIS VANE, contract auditor.** A ghost sent up to reconcile what
GOODCO was shipping off Site T against what GOODCO said it was shipping, who got
as far as noticing the two numbers were different and that the difference was
warm. His manifest is still out at the survey marker, off every line worth
walking: eleven crates out, nine declared. Who signed for the other two is a
question only **THE SITE SURVEYOR** can answer — a ghost who does not haunt
anywhere in particular but walks the whole grid, so he has to be found rather
than visited, and who will not give a company man a straight answer. Told the
truth, he says the signature block named RECORDS AND CONTINUITY, which is not a
department. It is a book, and it went to Mars with everything else.

**MARS — LEDGER UNIT 12.** The colony's accounting machine, still reconciling a
book in which every net-worth column reads the same number, unable to close it
without a countersignature from the party the transfers went to. A bound
signature can be bought, but the trader will not sell one to a man who has never
seen the seal it copies — and the only seal on Mars is worn by **THE TITHE
ASSESSOR**, which will not take it off for anybody and cannot leave an error in
its own arithmetic. Telling it the count has been short since the moon is the
one thing it cannot politely ignore. With the seal sold across the counter the
trader produces the signature, the book closes, and every column reads zero: the
transfers did not go to an account. They went to a RECORD OF PERSONS.

**THE RIFT — NOBODY IN PARTICULAR.** A man in a binder's apron who arrived
without the part that says who arrived. His page is still in here, out past
where the light stops agreeing, and handing it back gives him his name:
**ELIAS WREN**, a bookbinder, taken because binding is a trade and the book had
to be bound by somebody. The thing that held him open still walks the tribute
road for the scaled gods and still has his needle — **GRIGORI RASPUTIN**, who is
paid to watch that road. Bringing the needle back is the chain's real climax and
its longest fight, and it buys the last piece of the answer: the binding was
shipped out as surplus stock to a theme park, as a prop, and there is a man in
it who has been reading nothing out of the most dangerous object in two
universes for eleven years.

**BOOT HILL — BROTHER CALLOW.** The park's church hand, scripted for the eight
o'clock sermon, holding a book the props department filled with whatever bound
paper the parent company had spare. He cannot read, and nobody has ever needed
him to. Opened with the needle, it is names — nothing but names, and a number on
every one. The hero's is in there twice: once for the job, once for what he did
about it. **The book will not take a new entry off a man it cannot price, and it
prices a man by everything he could ever become** — so the last errand cannot be
fetched, only earned, and it is the one thing in the game that asks the player
to reach the level cap. That gate is why the final link is offered on JESUS
alone: no other rung's ladder reaches 99.

What it pays is **THE BIBLE** — the ledger itself, crossed through and rewritten,
which is to say a clean sheet. It is the only respec in the game: every stat
point refunded into a pool and the whole build re-placed, carried by the hero and
spent whenever he likes. A machine that made its fortune by writing people down
as amounts is beaten, in the end, by a man getting his own entry back.

## Where the story lives (the chain)

| Tier                     | File                                                                                                 | What it holds                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1 — the gist (this file) | `docs/story.md`                                                                                      | The whole plot in prose, in narrative order. The ground truth.                                                                 |
| 2 — the script           | `docs/manuscript.md`                                                                                 | Every spoken line, caption, monologue, and lore page, verbatim. Extrapolated from the gist.                                    |
| 3 — the game             | `src/game/defs/**` (levels, enemies, story items, thoughts, companions, cutscenes) + `pwa/` overlays | The playable implementation. Extrapolated from the script. See the manuscript's "Where the data lives" table for the file map. |

Push changes down the chain — never up — with the `update-story` skill
(`.agent/skills/update-story/`).
