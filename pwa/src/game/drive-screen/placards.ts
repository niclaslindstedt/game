// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD HAS TO SAY, AND HOW IT REACHES THE SCREEN.
//
// THREE KINDS OF WORDS AND THE DIFFERENCES ARE THE WHOLE POINT OF THE FILE. THE
// GLUED SHOUT (`GLUED_BARKS`): they are addressing a driver they can see, they
// want the car stopped, and they are drawn in the white. THE CROWD THINK
// (`CROWD_THOUGHTS`): nobody out there is talking to the car at all, the
// sentence is a private one about the rent or the soup or a daughter who still
// calls, and it is drawn in the grey. Same glyphs, same float, same half-second
// window — one is aimed at the hero and the other has never heard of him.
//
// AND THEN SOMEBODY SEES A COLLISION (`WITNESS_LINES`). That one is neither: it
// is not prepared, like a placard, and it is not private, like a thought — it is
// a person on a pavement turning round because a wagon has just put somebody
// over its own roof. It is drawn in the white with THE GLUED, because it is a
// shout; it is written in a different register from either, because nobody
// composes a sentence at the moment they see that.
//
// THE WORDS ARE HERE RATHER THAN IN A THOUGHT CATALOG, and the reason is the
// shape of the line rather than a filing preference. `content/thoughts.yaml`
// holds BEATS: a speaker's name, a portrait family, pages the dialogue box
// flows into a measured column and the player taps through. Not one of those
// four things exists here — a line shouted from a road going past at 120 mph has
// no name plate, no face, no column and nobody to tap it. It is a
// BARK, the same kind of line a boss shouts over its own head mid-fight
// (`AbilityDef`), and the shipped barks are authored in code for the same
// reason. `docs/manuscript.md` transcribes them either way — the story chain
// cares that a line is written down, not which file it sleeps in.
//
// THEY ARE RIGHT, AND THAT IS THE WHOLE JOB OF THESE FIVE LINES. Nothing here
// is a strawman: no chanting, nothing that argues with itself, nothing written
// to be laughed at. They are polite, they are patient, they have plainly thought
// about this harder than the man in the car has, and one of them apologises for
// the inconvenience. What plays is the gap — he agrees with every word, reads
// none of it, says nothing about it before or afterwards, and could not stop the
// car if he wanted to.
//
// AND NOTHING NAMES ANYBODY REAL. Not a campaign, not a group, not a person, not
// a near-miss pun on one (docs/naming.md). THE GLUED is a role, and a role does
// not date: there has been somebody sitting in a road since there have been
// roads.

import type { WitnessScene } from "@game/core";

import type { PixelFont } from "@ui/lib/pixel-font.ts";

import { worldToCanvas } from "../render/tilt.ts";
import type { Camera } from "../render/view.ts";

/**
 * THE LINES, in `DrivePedestrian.bark`'s own order. The engine picks an index
 * into this list without ever being told what is in it (`GLUED_BARKS`,
 * engine/game/drive/blockade.ts) — keep the two lengths in step, or the last voice
 * on the road never speaks.
 */
export const GLUED_BARKS: readonly string[] = [
  "WE'VE GLUED OURSELVES TO THE TARMAC FOR THE CLIMATE",
  "NO CARS ON A DEAD PLANET",
  "MY HANDS ARE IN THE ROAD. THEY DON'T COME OUT.",
  "THE ROAD IS CLOSED TODAY",
  "SORRY FOR THE DISRUPTION",
];

/**
 * WHAT THE PEOPLE ON THE ROAD ARE THINKING — forty of them, one per person, each
 * played at most once a trip (`CROWD_THOUGHTS`, engine/game/drive/crowd.ts, deals
 * the deck; keep the two lengths in step or the last thoughts never come up).
 *
 * NOT LINES. THOUGHTS. Nobody out here is addressing the car — THE GLUED do
 * that, in capitals, at a driver they can see. These are the sentence a person
 * happens to be turning over as a wagon goes past them at a hundred and twenty:
 * the rent, the boy, the soup, a giveaway somebody is hoping is on again,
 * whether anybody has looked at them today. That is why they are drawn in the
 * grey rather than the white (`THOUGHT_INK`) and why not one of them is aimed at
 * the hero. He is not in them. He is not in anything of theirs.
 *
 * THE RULES THEY ARE WRITTEN TO, and every one of them is load-bearing:
 *
 * SHORT ENOUGH TO BE TAKEN IN AT A GLANCE — five to eight words, one sentence,
 * no clause that has to be held. The reading window is under a second; anything
 * that needs a second look is a line the player never gets at all, which is a
 * line that may as well not have been written.
 *
 * SMALL, NOT TRAGIC. Not one of them is about dying, and none of them is a
 * plea. What makes the beat land is scale: a man hoping his shoes last the
 * winter, a woman whose sister has stopped picking up. A catalogue of
 * catastrophes reads as an author asking to be felt sorry for; a catalogue of
 * Tuesdays reads as people.
 *
 * AND A FEW OF THEM ARE HOPEFUL, which is the cruellest thing in the file and
 * the reason it is not a misery list. Somebody was waved at this morning.
 * Somebody's daughter still sends what she can. At least love is free. Those are
 * the ones to be standing on the tarmac when the bumper arrives.
 *
 * NOTHING NAMES ANYTHING REAL (`docs/naming.md`). The one brand in here is
 * FOODCO, which is invented and is the block's cut-price grocer — the place a
 * giveaway would come from if there were one. It is deliberately NOT GOODCO:
 * the company that took these people's jobs is a different outfit entirely, and
 * a line that conflated the two would be making an argument, where this one is
 * just somebody hoping there is food on a Thursday.
 */
export const CROWD_THOUGHTS: readonly string[] = [
  "SHE STILL WAITS UP FOR ME",
  "I WISH I WAS ON WELFARE",
  "I HOPE FOODCO DOES ANOTHER GIVEAWAY",
  "I AM SO TIRED OF BEGGING",
  "THE BOY ASKED FOR MEAT AGAIN",
  "THE SOUP CAN LAST THREE MORE DAYS",
  "SOMEBODY WAVED AT ME THIS MORNING",
  "MY SISTER STOPPED PICKING UP",
  "I HAD A DESK ONCE",
  "THE SHELTER TAKES NAMES AT SIX",
  "NOBODY HAS LOOKED AT ME TODAY",
  "THE LETTER SAYS FINAL NOTICE AGAIN",
  "I CAN SLEEP RIGHT THROUGH LUNCH NOW",
  "THEY CALLED ME A VALUED TEAM MEMBER",
  "THE DOG EATS BEFORE I DO",
  "THESE SHOES MIGHT SEE THE WINTER OUT",
  "I STILL KNOW HOW TO WELD",
  "TWENTY-TWO YEARS AND THEN A PAPER CUP",
  "A WARM DAY IS SOMETHING AT LEAST",
  "THE BUS COSTS MORE THAN BREAD NOW",
  "MY DAUGHTER SENDS WHAT SHE CAN",
  "SIXTY MORE AND I SLEEP INSIDE",
  "MY STOMACH WON'T SHUT UP",
  "I USED TO GIVE TO COLLECTIONS",
  "THEY SAY THE JOBS WENT TO MARS",
  "MY WIFE WOULD HATE SEEING ME HERE",
  "THE LIBRARY STAYS WARM UNTIL FIVE",
  "I NEVER LEARNED HOW TO ASK",
  "THIS COAT WAS SOMEBODY'S FATHER'S",
  "I SAVED A STAMP FOR THE APPEAL",
  "THE PHONE DIED AND SO DID THE INTERVIEWS",
  "ONE OF THESE CARS MIGHT STOP",
  "I WAS GOING TO BE SOMETHING",
  "THEY GAVE MY LOCKER TO A MACHINE",
  "I TALK TO THE CAT MOSTLY",
  "FORTY YEARS AND NOTHING TO SHOW",
  "THE CLINIC WANTS PAYING UP FRONT",
  "I DREAMED ABOUT A FULL FRIDGE",
  "SOMEBODY WILL NOTICE ME EVENTUALLY",
  "MY NAME IS ON A LIST SOMEWHERE",
];

/**
 * WHAT SOMEBODY SHOUTS WHEN THEY SEE ONE — sixty lines, filed by the SCENE the
 * sim says they just watched (`WitnessScene`, engine/game/drive/witness.ts).
 *
 * A TABLE KEYED ON THE CASE, NEVER A BRANCH IN THE DRAIN. The engine names what
 * happened and this answers with words, exactly the way the two legs' monologues
 * are a `Record<levelId, …>` in `voice.ts` rather than an `if` at the say. A new
 * case is one more row here beside one more arm of `sceneOf` there, and nothing
 * in between learns there was a fifteenth.
 *
 * AND THE TABLE IS TOTAL, WHICH IS WHY THIS BEAT IS SAFER THAN THE OTHER TWO.
 * `GLUED_BARKS` and `CROWD_THOUGHTS` are lists the sim indexes by a NUMBER it
 * got from a count in the other tree, so a list that drifts short silently stops
 * using its tail and every check stays green. A scene is a NAME, so this is a
 * `Record<WitnessScene, …>` and the compiler refuses the omission outright.
 *
 * THE RULES THEY ARE WRITTEN TO, and every one is load-bearing:
 *
 * SHORTER THAN A THOUGHT — two to six words. A thought is read off a body the
 * car is closing on for most of a second; a reaction is picked at the far edge
 * of the reading window and the wagon is doing 905 px/s, so it has under three
 * tenths. Anything with a subordinate clause in it is a line nobody ever read.
 *
 * SHOUTED, NOT COMPOSED. No irony, no punchlines, no commentary on the state of
 * the world — these people are not the author's mouthpiece and the joke is not
 * theirs. What comes out of somebody who has just watched a car go through a
 * person is short, badly formed and often not a sentence at all: a noise, a
 * name for what they saw, an instruction to nobody in particular.
 *
 * THEY ARE THE SAME PEOPLE AS THE THOUGHTS. The crowd out here is the one the
 * welfare did not reach (`crowd.ts`), so nobody says anything that costs money
 * or assumes any: it is "SOMEBODY GET HELP", never "CALL AN AMBULANCE", and
 * "SOMEBODY GET HIS PLATE", never a phone.
 *
 * NOBODY ADDRESSES HIM BY ANYTHING HE IS. He is HE, and he is never a job, a
 * class, a company or a cause — the moment a bystander diagnoses the driver, the
 * road has an opinion and this minigame has stopped being about a man who is not
 * paying attention.
 *
 * AND NOTHING NAMES ANYTHING REAL (`docs/naming.md`) — no make of car, no
 * emergency number, no brand on the bus.
 */
export const WITNESS_LINES: Readonly<Record<WitnessScene, readonly string[]>> =
  {
    // ── SOMEBODY WENT UNDER THE CAR ──────────────────────────────────────────
    // THE PLAIN ONE, and the one most of the road gets. It carries the two lines
    // everybody already has in their head for this — the noise and the disbelief
    // — because those are what actually get said, and because a scene with only
    // clever lines in it is a scene nobody believes.
    person: [
      "OH MY GOD",
      "HE JUST RAN THAT MAN DOWN",
      "HE DIDN'T EVEN BRAKE",
      "SOMEBODY GET HELP",
      "JEEEEESUS",
      "DID YOU SEE THAT",
    ],
    woman: [
      "HE HIT THAT LADY",
      "THAT'S A WOMAN DOWN THERE",
      "SHE NEVER SAW HIM COMING",
      "OH GOD, THAT POOR WOMAN",
    ],
    // NOT ONE OF THESE SAYS A GENDER. The scene covers the old man, the crutches
    // and the walking frame — three bodies with one thing in common and nothing
    // else — so a line that guessed would be wrong two thirds of the time in
    // front of a player looking straight at the sprite.
    elder: [
      "THEY COULDN'T GET OUT THE WAY",
      "THAT ONE COULD BARELY WALK",
      "HAVE YOU NO SHAME AT ALL",
      "OH GOD, THE POOR OLD SOUL",
    ],
    wheelchair: [
      "THAT WAS A WHEELCHAIR",
      "HE WENT STRAIGHT THROUGH THE CHAIR",
      "THEY COULDN'T MOVE AT ALL",
    ],
    // THE DOG GETS ITS OWN SCENE, and it is not a gag. It is the one body on this
    // road that somebody was holding on to, and a crowd that has watched a person
    // go under in silence all evening will shout about a dog — which is a truer
    // thing about people than any line here could say outright.
    dog: ["THE DOG, HE GOT THE DOG", "NOT THE DOG", "SOMEBODY CATCH THAT DOG"],
    cyclist: [
      "HE TOOK THE CYCLIST CLEAN OUT",
      "THAT BIKE WENT OVER THE ROOF",
      "THEY WERE ON A BIKE",
      "HE NEVER EVEN LOOKED",
    ],
    // AND THE ONE SCENE WHERE THE CROWD IS RIGHT ABOUT SOMETHING. THE GLUED cannot
    // move and everybody watching knows it, so what is shouted here is a FACT
    // rather than an alarm — which is also the only moment the road's two set
    // pieces speak about each other.
    glued: [
      "THEY WERE GLUED DOWN",
      "THEY COULDN'T MOVE, YOU KNOW THAT",
      "HE DROVE STRAIGHT INTO THEM",
      "THEIR HANDS WERE IN THE ROAD",
    ],
    // THE WORST OF IT, AND THE ONLY SCENE WHERE NOBODY DESCRIBES ANYTHING. A
    // person who has just seen a body come apart does not narrate it; they look
    // away, they say a name they do not mean, or they tell somebody else not to
    // look. One line names it and that is the ceiling.
    torn: [
      "OH GOD, OH GOD, NO",
      "DON'T LOOK, DON'T LOOK",
      "THERE'S PIECES OF THEM",
      "I'M GOING TO BE SICK",
      "GET AWAY FROM THE ROAD",
    ],
    // ── AND THE REST OF THE ROAD ─────────────────────────────────────────────
    // Everything below happened to a MACHINE, and the register drops with it: no
    // horror, plenty of alarm, and the two lines that give the crowd its one bit
    // of ordinary human pettiness back.
    car: [
      "HE'S HITTING THE CARS NOW",
      "DID YOU SEE THAT SMASH",
      "THAT'S SOMEBODY'S CAR",
      "THEY'VE CRASHED, THEY'VE CRASHED",
    ],
    heavy: [
      "HE'S TAKEN ON A BUS",
      "THAT'S A BUS, YOU IDIOT",
      "THERE WERE PEOPLE ON THAT BUS",
    ],
    // NOSE TO NOSE — the only crash on this road the crowd names by its SHAPE
    // rather than by what was in it, and the only one a bystander is certain
    // about the outcome of before anybody has got out of anything.
    headOn: [
      "THEY WENT STRAIGHT INTO EACH OTHER",
      "HEAD ON, THAT WAS HEAD ON",
      "NOBODY WALKS AWAY FROM THAT",
      "RIGHT ON THE NOSE",
      "THAT WAS FRONT TO FRONT",
    ],
    bike: [
      "THE MOPED'S IN HALF",
      "HE PUT THE BIKE DOWN",
      "THAT SCOOTER'S GONE UNDER HIM",
      "THERE'S A BIKE IN THE ROAD",
    ],
    rolled: ["IT'S ON ITS ROOF", "IT WENT RIGHT OVER", "GET THEM OUT OF THERE"],
    thrown: [
      "THEY CAME THROUGH THE WINDSCREEN",
      "SOMEBODY WENT OUT THE FRONT",
      "OH GOD, THE GLASS",
    ],
    // SOMETHING HAS CAUGHT — the burn, which on this road is a thing that
    // GROWS. It takes about two seconds to go from a flicker under a wing to
    // the whole engine bay, so these are the lines of people watching it get
    // worse rather than of people reacting to a bang.
    fire: [
      "IT'S GOING UP",
      "GET BACK, IT'S BURNING",
      "THE WHOLE THING'S ALIGHT",
      "IT'S CAUGHT, IT'S CAUGHT",
      "GET THEM OUT BEFORE IT SPREADS",
    ],
    // …AND THE TANK WENT. The biggest single thing that happens out here. What
    // comes out of somebody at the instant of a bang is an instruction and not a
    // description — get down, run — because there has been no time to look yet.
    blast: [
      "GET DOWN",
      "THE TANK'S GONE",
      "THAT WAS THE PETROL",
      "IT BLEW, IT ACTUALLY BLEW",
      "RUN, THERE'LL BE ANOTHER",
    ],
    // …AND THE FRONT IT THREW, which is the one thing on this road the crowd
    // FEELS rather than watches. So not one of these describes the car: they are
    // about the chest, the ears, the windows and the lights, which is what a
    // pressure wave actually is to somebody standing in it half a street away.
    shockwave: [
      "I FELT THAT IN MY CHEST",
      "THE WINDOWS, ALL THE WINDOWS",
      "MY EARS, MY EARS",
      "THE LIGHTS ARE GOING OUT",
      "THAT SHOOK THE WHOLE STREET",
    ],
    lamp: [
      "THERE GOES THE STREET LIGHT",
      "HE'S TAKEN THE LAMP POST OUT",
      "THE COUNCIL WILL LOVE THAT",
    ],
    // ── AND THE ONE ABOUT HIM ────────────────────────────────────────────────
    // THE ONLY SCENE THAT IS NOT ABOUT WHAT HAPPENED. It is unlocked by the
    // second body (`DRIVE.witness.fleeingShare`), because "again" needs a first
    // time — and it is the closest this road ever comes to naming what the player
    // has spent the last minute doing. Nobody follows it up. Nothing comes of it.
    // He is at GOODCO ninety seconds later remarking on the suspension.
    fleeing: [
      "HE'S NOT STOPPING",
      "HE'S DONE IT AGAIN",
      "SOMEBODY GET HIS PLATE",
      "HE'S NOT EVEN SLOWING DOWN",
    ],
  };

/**
 * WHICH OF A SCENE'S LINES THIS ONE IS — the app's half of the seam, because
 * the app is the only side that knows how many there are.
 *
 * `roll` is the 0→1 the sim hashed off the incident (`DriveWitness.roll`), so
 * the same seed driven the same way shouts the same words — and no draw was
 * spent off `state.rng` to get there.
 */
export function witnessLine(scene: WitnessScene, roll: number): string {
  const lines = WITNESS_LINES[scene];
  const at = Math.min(lines.length - 1, Math.floor(roll * lines.length));
  return lines[at] ?? lines[0] ?? "";
}

/**
 * BARE FLOATING TEXT, THE WAY THE RUN ALREADY SPEAKS — the ink, and the hard
 * one-pixel shadow under it.
 *
 * IT IS NOT A SPEECH BUBBLE, and it stopped being one after a look at it. A
 * panel with a rim, a fill and a tail is the game's WINDOW skin, and a window is
 * a thing the player is meant to stop and read — it takes a fifth of a
 * 844×390 frame, it covers the town, and over a road going past at 120 mph it
 * reads as the game having paused when it plainly has not. What the run already
 * uses for a word that has to be read WITHOUT stopping anything is the float
 * (`kind: "text"` in render/effects.ts): pixel glyphs, a hard near-black
 * shadow a pixel down-right so they keep contrast over anything, and no
 * furniture at all. That is what a line shouted from a road is, so that is what
 * these are.
 *
 * The shadow is the whole reason it works over tarmac AND over the pale
 * crossing paint the blockade is usually standing on — a low-contrast glyph is
 * invisible on exactly one of those two, whichever colour you pick.
 */
const INK = "#e8e4d8";
const SHADOW = "#0b0d10";
/**
 * …AND THE QUIETER INK A THOUGHT IS IN. The same glyphs a stop short of white,
 * which is as far as the difference is allowed to go: the whole beat depends on
 * these being READABLE — a line nobody could have read is not a joke about a man
 * who does not read them — so the separation is carried by TONE rather than by
 * hiding them. Over tarmac it reads as somebody muttering; beside one of THE
 * GLUED's shouts it is obviously the smaller voice.
 */
const THOUGHT_INK = "#a9a294";

/** How wide a line is allowed to get, in unscaled font px, and the scale it is
 * drawn at. Wider than the boxed version could afford now there is no padding
 * or rim to pay for, which is fewer lines for the same words. */
const WRAP_PX = 62;
/**
 * …AND A THOUGHT IS ALLOWED A WIDER COLUMN, WHICH IS A LEGIBILITY DECISION MADE
 * BY LOOKING AT IT.
 *
 * At the shout's width a six-word thought folds into THREE stacked rows, and
 * three rows is a paragraph: the eye has to walk down it, and there is not
 * two-thirds of a second to walk down anything. Widened, the same line lands in
 * two — one glance instead of three — and two rows is what the beat can actually
 * afford. It is bounded by the frame rather than by taste: half of this plus
 * `READ_PX` has to stay inside the ~308 world px the camera shows past the
 * bumper, or the line fades up already clipped.
 */
const THOUGHT_WRAP_PX = 88;
const TEXT_SCALE = 1;
/**
 * How far above the body's own anchor the text sits (world px) — a seated
 * person is half the height of a standing one, so this clears a head rather
 * than a sprite. Somebody ON THEIR FEET needs the rest of the sprite paid for,
 * or the last row of their thought is printed across their own hair.
 *
 * IT IS A QUESTION ABOUT THE BODY, NOT ABOUT THE VOICE, and it used to be read
 * off the voice because the two happened to agree: every shout was one of THE
 * GLUED (seated) and every thought was a walker (on their feet). A REACTION
 * broke the coincidence — it comes from whoever was near enough to see, which
 * is usually a walker and is sometimes one of the seated watching the wagon come
 * through their own people — so the caller passes the posture and the voice
 * picks nothing but ink and column width.
 */
const LIFT = 13;
const STANDING_LIFT = 20;

/**
 * HOW FAR OFF A BUBBLE IS STILL DRAWN (world px along the road).
 *
 * A blockade holds four voices and the road holds one blockade, so this is not
 * a draw budget — it is a READING one. A bubble that fades up as the car closes
 * gives the player the same beat a real one has: something pale on the road,
 * then words, then no time at all. Drawn from the moment it is legible and not
 * before.
 */
const READ_PX = 260;
const FADE_PX = 90;

/**
 * …AND A THOUGHT READS FROM EXACTLY AS FAR OFF, WHICH IS NOT A TASTE — IT IS THE
 * FRAME.
 *
 * The first cut gave thoughts a longer reach (360 px) on the reasoning that a
 * shout has a demonstration to announce it while a thinking walker has nothing,
 * so the line itself is the arrival and needs longer on screen. Then it was
 * LOOKED AT: the camera holds the car in the trailing quarter and shows about
 * 308 world px past the bumper (`CAMERA_LEAD_FRAC`), so a line centred on a body
 * 360 px out is drawn HALF OFF the right edge of the picture — the words fade up
 * already clipped, which reads as a rendering bug rather than as a person. 260
 * is the furthest a body can be and still have a full-width line fit beside it,
 * which is why the shout was set there and why this cannot go past it.
 *
 * What is bought instead is a longer FADE, so the line surfaces rather than
 * appearing. It is still gone before it has been thought about. Nobody catches
 * all forty in a trip and nobody is meant to.
 */
const THOUGHT_FADE_PX = 110;

/** The furthest off a line of either kind is ever drawn from. Read by the
 * RENDERER, which has to tell a candidate that is about to draw nothing from one
 * that will: it hands the single slot to the nearest speaker, and a shout that
 * silently drew nothing would have spent that slot on nothing. */
export const PLACARD_READ_PX = READ_PX;

/**
 * …AND A LINE DOES NOT STOP AT THE BUMPER. How long it goes on being drawn once
 * the car is PAST its owner, as a share of the road still visible behind the
 * wagon.
 *
 * IT USED TO BE ZERO, and that is the bug this closes. The reading window was
 * `away > 0` — ahead of the car and nothing else — so a thought was taken off a
 * walker on the frame the bumper drew level with them, while the walker
 * themselves went on down the picture for another quarter of a frame. Somebody
 * mid-sentence about the rent had it cut off in front of the player, every time,
 * which reads as the renderer dropping the line rather than as the car going
 * past.
 *
 * The window is the FRAME's own trailing share (`CAMERA_LEAD_FRAC`) rather than
 * a distance, for the same reason `READ_PX` is bounded by the frame: the camera
 * holds the wagon in the trailing quarter, so it is exactly "until its owner
 * leaves the picture" on every viewport. The RENDERER measures it and passes it
 * in as `passedPx` — this module has never known how wide the screen is, and
 * restating the camera's lead here would be one edit from disagreeing with it.
 */

/** …and over how much of that the line comes off (world px). A short one: the
 * body is already sliding out of frame with its own words half-clipped by the
 * edge, and a line that snapped off at full strength there would be the same
 * cut this fixes, moved a quarter of a frame. */
const PASSED_FADE_PX = 60;

/**
 * WHERE A CANDIDATE SITS IN THE QUEUE FOR THE ONE SLOT (`MAX_BUBBLES`) — lower
 * speaks.
 *
 * NEAREST AHEAD FIRST, WHICH IS THE SEQUENCE RULE, and then the ones the car has
 * already passed, least-passed first. A speaker behind the bumper takes the slot
 * only when nobody in front of it wants it, so the picket line still reads as a
 * sequence of lines arriving — and out on the open road, where the thoughts are
 * dealt half a screen apart (`DRIVE.thoughtPitchPx`), the walker just passed
 * keeps their sentence until the next one is close enough to be read.
 */
export function placardOrder(awayPx: number): number {
  return awayPx >= 0 ? awayPx : READ_PX - awayPx;
}

/**
 * WHICH VOICE A LINE IS IN. `shout` is one of THE GLUED addressing the driver;
 * `thought` is one of the crowd not addressing anybody at all; `reaction` is
 * somebody who has just watched a collision. It picks the ink and the column
 * width and nothing else — all three are the same float, on purpose.
 *
 * A REACTION IS A SHOUT'S INK AND A THOUGHT'S COLUMN, which is not a compromise
 * but the two answers to two different questions. It is AIMED at the driver, so
 * it is in the white; and it is written to be caught in a quarter of a second at
 * the far edge of the reading window, so it gets the wide column that folds a
 * six-word line into two rows instead of three.
 */
export type PlacardVoice = "shout" | "thought" | "reaction";

/**
 * ONE VOICE AT A TIME, AND THAT NUMBER WAS ARRIVED AT BY LOOKING — three times.
 *
 * The blockade holds four voices spread through twenty people, all of them
 * inside a couple of hundred pixels of road. Four lines overprint into a single
 * block of illegible grey, which turns four people who have something to say
 * into one smudge. Stacking them in lanes fixed that and broke something else:
 * the formation spans the carriageway kerb to kerb, so the speaker nearest the
 * top edge has barely a body's height of sky above them, and the stack ran
 * straight off the top of the frame — clamped back down, the lanes collapsed
 * into each other and it was the smudge again. Dropping the boxes for bare
 * floating text bought a great deal of room back, and it did not change this
 * answer: two voices a lane apart still overprint, because what overlaps is the
 * TEXT and the boxes were only ever making it worse.
 *
 * So the NEAREST one speaks and the rest hold their placards in silence. As the
 * car closes, that one is passed and the next takes its place, which turns a
 * wall of text into a SEQUENCE — three or four lines read one after another over
 * the second and a half it takes to arrive, which is how you would actually read
 * a picket line through a windscreen.
 */
const MAX_BUBBLES = 1;
/** How close to the top of the picture a line may get (canvas px) — the top row
 * of the formation has almost no sky above it. */
const CEILING_PX = 6;

/** …read by the renderer, which is what decides WHICH one speaks: it has the
 * whole field and can pick the nearest, where this module only ever sees one
 * line at a time. */
export const MAX_PLACARDS = MAX_BUBBLES;

/** One speaker's line, floating over their own spot. This is a draw. */
export function drawPlacard(
  ctx: CanvasRenderingContext2D,
  font: PixelFont,
  text: string,
  worldX: number,
  worldY: number,
  camera: Camera,
  /** How far the car still is from this body (world px), for the fade-in —
   * NEGATIVE once the wagon is past them, which is the whole of the window
   * below (`PASSED_FADE_PX`). */
  awayPx: number,
  voice: PlacardVoice = "shout",
  /** IS THE SPEAKER SITTING DOWN — one of THE GLUED rather than somebody on
   * their feet. A fact about the BODY and not about the voice; see `LIFT`. */
  seated = voice === "shout",
  /** How much road is still visible BEHIND the bumper (world px) — the frame's
   * own trailing share, measured by the renderer. Zero cuts the line at the
   * bumper, which is what this drew before there was a window at all. */
  passedPx = 0,
): void {
  const quiet = voice === "thought";
  const wide = voice !== "shout";
  const fade = wide ? THOUGHT_FADE_PX : FADE_PX;
  if (awayPx > READ_PX || awayPx < -passedPx) return;
  // THE FADE IS AT BOTH ENDS NOW, and they are different lengths because they
  // are different beats: a line SURFACES as the car closes on it, and it is
  // TAKEN by the edge of the picture as the car leaves it behind.
  const out = Math.min(PASSED_FADE_PX, passedPx);
  const alpha =
    awayPx < 0
      ? Math.max(0, Math.min(1, (passedPx + awayPx) / Math.max(out, 1e-6)))
      : awayPx > READ_PX - fade
        ? (READ_PX - awayPx) / fade
        : 1;
  const lines = font.wrap(text, wide ? THOUGHT_WRAP_PX : WRAP_PX);
  const lineH = (font.height + 1) * TEXT_SCALE;
  // IN CANVAS SPACE, NOT THE WORLD'S — the one thing on this road drawn outside
  // the projection, and deliberately. Everything with a PLACE on the road is
  // raked with the tarmac it stands on; WORDS are not a thing on the road, they
  // are a thing being read, and a skewed paragraph is a worse paragraph. Where
  // it POINTS still comes from the world (`worldToCanvas` of the speaker's own
  // spot), so it stays over its owner as the road slides past.
  const seat = worldToCanvas(worldX, worldY, camera);
  const sx = Math.round(seat.x);
  const bottom = Math.round(seat.y) - (seated ? LIFT : STANDING_LIFT);
  const top = Math.max(CEILING_PX, bottom - lines.length * lineH);

  ctx.save();
  ctx.globalAlpha = alpha;
  for (const [i, line] of lines.entries()) {
    const width = font.measure(line) * TEXT_SCALE;
    const x = Math.round(sx - width / 2);
    const y = top + i * lineH;
    // The shadow first, a pixel down-right, then the glyphs over it — the run's
    // own float, exactly (render/effects.ts).
    font.draw(ctx, line, x + 1, y + 1, { scale: TEXT_SCALE, color: SHADOW });
    font.draw(ctx, line, x, y, {
      scale: TEXT_SCALE,
      color: quiet ? THOUGHT_INK : INK,
    });
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}
