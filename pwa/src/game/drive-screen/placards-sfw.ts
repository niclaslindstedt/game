// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// WHAT THE ROAD SAYS WHEN THE MESS IS MADE OF GLITTER — the SFW half of the
// drive's three voices.
//
// THE ROAD IS THE SAME ROAD. The sim is untouched: the same twenty people are
// glued across the same four lanes, the same walkers are on the same pavement,
// and the same bystander turns round at the same collision. What changes is
// what any of it is MADE of — a body peels away in pastel dust rather than
// coming apart (`render/stardust.ts`), the marks it leaves are re-hued, and a
// burning car throws gold stars instead of flame (`star-fire.ts`).
//
// SO THE WORDS HAVE TO AGREE WITH THE PICTURE, and that is the whole reason
// this file exists rather than a switch that hides the shipped lines. A crowd
// shouting THERE'S PIECES OF THEM over a shower of glitter is worse than
// either version on its own: it tells the player what the mode is refusing to
// draw, which is the one thing a presentation mode may never do. And a silent
// road is not the answer either — the three voices are most of what makes this
// stretch feel inhabited.
//
// THEY ARE THE SAME PEOPLE, IN A DIFFERENT WORLD. Nobody out here is destitute,
// nobody is begging, and nothing that happens costs anybody anything: the
// thoughts are about the traffic and the sparkle rather than about the rent,
// and a bystander who watches somebody turn into confetti is delighted rather
// than sick. What survives the swap is the SHAPE — a thought is private and has
// never heard of the car, a shout is aimed at a driver who is not reading it,
// and a reaction is short and badly formed because nobody composes a sentence
// at the moment they see something. Those three rules are `placards.ts`'s and
// they are load-bearing here too.
//
// EVERY LENGTH RULE THE SHIPPED LISTS OBEY APPLIES UNCHANGED, because the
// reading window is a fact about the camera and the wagon's speed rather than
// about the mode: four to eight words for a thought, one sentence, no terminal
// punctuation; two to six for a reaction. `tests/content/drive_words_test.ts`
// holds both sets to the same bar.
//
// AND NOTHING NAMES ANYTHING REAL (`docs/naming.md`) — no make of car, no
// brand of sweet, no cartoon.

import type { WitnessScene } from "@game/core";

/**
 * THE GLUED, IN THE MODE — five lines, in `DrivePedestrian.bark`'s own order and
 * paired with the sim's `GLUED_BARKS` count exactly as the shipped list is.
 *
 * They are still sitting in the road with the lanes shut, because that is what
 * the sim staged; what they are sitting there FOR is a chalk mural and a road
 * party rather than a cause, so nothing in here argues with anybody. Two of them
 * are about the driver's speed and one is about the glitter, which is what the
 * player is looking at while he reads them.
 */
export const GLUED_BARKS_SFW: readonly string[] = [
  "SLOW DOWN! WE'RE DRAWING ON THE ROAD",
  "THE ROAD IS CLOSED FOR THE PARADE",
  "WE'RE COUNTING CARS FOR THE SCIENCE FAIR",
  "MIND THE GLITTER, IT GETS EVERYWHERE",
  "SORRY FOR THE HOLD-UP!",
];

/**
 * WHAT THE CROWD IS THINKING, IN THE MODE — forty of them, one per person, each
 * dealt at most once a trip (`CROWD_THOUGHTS`, engine/game/drive/crowd.ts).
 *
 * STILL THOUGHTS, STILL NOT ADDRESSED TO HIM. Nobody out here is talking to the
 * car; these are the sentence somebody happens to be turning over as a wagon
 * goes past at a hundred and twenty. That is why they are drawn in the same grey
 * the shipped ones are, and why a line like I THINK HE IS SHOWING OFF is a
 * private opinion rather than a shout.
 *
 * WHAT THEY ARE ABOUT IS THE ROAD ITSELF — how fast that one went, what the
 * sparks are doing, what the glitter gets into. It is the mode's own subject
 * matter: the player IS watching gold stars come off a car, so a crowd remarking
 * on them is a crowd looking at the same thing he is.
 *
 * AND A FEW OF THEM ARE STILL SMALL RATHER THAN SPECTACULAR — somebody is going
 * to have to sweep this up, somebody wishes they had brought a camera, somebody
 * is keeping the prettiest one. A list where every line is WOW reads as a laugh
 * track; the ordinary ones are what make it a street.
 */
export const CROWD_THOUGHTS_SFW: readonly string[] = [
  "THAT CAR IS GOING VERY FAST",
  "LOOK AT ALL THE LITTLE STARS",
  "THE GLITTER GETS IN YOUR HAIR",
  "I HOPE HE MAKES IT ON TIME",
  "SOMEBODY IS IN A DREADFUL HURRY",
  "THE SPARKS ARE MY FAVOURITE PART",
  "I COUNTED SIX STARS THAT TIME",
  "THAT ONE WENT PAST LIKE A COMET",
  "MY COAT IS COVERED IN SPARKLES",
  "THE ROAD SMELLS LIKE BIRTHDAY CANDLES",
  "I SHOULD HAVE BROUGHT MY CAMERA",
  "THE STARS ARE WARM WHEN THEY LAND",
  "NOBODY DRIVES THAT FAST ON PURPOSE",
  "I WONDER WHERE HE IS GOING",
  "THE GLITTER TASTES A BIT LIKE LEMON",
  "I WAVED AND I THINK HE SAW",
  "THAT WAS FASTER THAN THE LAST ONE",
  "THE PIGEONS LOVE THE SHINY BITS",
  "I AM GOING TO SWEEP UP LATER",
  "MY SISTER WOULD LOVE THIS STREET",
  "THE SPARKLES LAND LIKE WARM SNOW",
  "HE MUST BE LATE FOR SOMETHING",
  "I FOUND A STAR IN MY POCKET",
  "THE WHOLE ROAD IS TWINKLING TONIGHT",
  "I LIKE THE YELLOW ONES BEST",
  "THAT ENGINE SOUNDS VERY PLEASED WITH ITSELF",
  "THE LAMP POSTS ARE ALL SPARKLY NOW",
  "I HOPE THERE IS MORE GLITTER LATER",
  "SOMEBODY SHOULD PUT UP A SIGN",
  "IT SOUNDS LIKE A ROCKET GOING PAST",
  "THE STARS GO UP AND COME DOWN SLOWLY",
  "I AM SAVING THE PRETTIEST ONE",
  "MY BOOTS ARE FULL OF SPARKLES",
  "THAT CAR NEEDS A GOOD WASH",
  "THE GLITTER STICKS TO EVERYTHING OUT HERE",
  "I CAUGHT ONE BEFORE IT FADED",
  "THE STREET LOOKS LIKE A BIRTHDAY CAKE",
  "I THINK HE IS SHOWING OFF",
  "EVERY CAR SHOULD SPARKLE LIKE THAT",
  "I WILL TELL THEM ABOUT THIS",
];

/**
 * WHAT SOMEBODY SHOUTS WHEN THEY SEE ONE, IN THE MODE — filed by the SCENE the
 * sim named (`WitnessScene`, engine/game/drive/witness.ts), and total for the
 * same reason the shipped table is: a scene is a NAME, so the compiler refuses
 * the omission rather than leaving one case silent.
 *
 * THE SCENE IS THE SAME EVENT AND THE REGISTER IS THE OPPOSITE. `person` is
 * still somebody watching a body meet a bumper — in this mode they watch them
 * turn into confetti and come out the other side, so what is shouted is
 * delight, surprise, or a remark about the colour. Nothing here is horror and
 * nothing here is a joke at anybody's expense.
 *
 * THE MACHINES KEEP THEIR ALARM, which is what stops the whole road reading as
 * a birthday party: a bus is still a bus, a rollover is still on its roof and a
 * street light is still the council's problem. The mode changed what a PERSON is
 * made of; it did not change what steel does.
 *
 * `torn` is authored in full even though the mode never raises it — the split
 * and the gib are both refused before the first tick — because the table's
 * totality is what makes the seam safe, and a scene left thin is a scene that
 * says one sentence the day something starts raising it.
 */
export const WITNESS_LINES_SFW: Readonly<
  Record<WitnessScene, readonly string[]>
> = {
  // ── SOMEBODY WENT THROUGH THE GLITTER ─────────────────────────────────────
  person: [
    "WOW, DID YOU SEE THAT",
    "HE TURNED THEM INTO CONFETTI",
    "THAT WAS A LOT OF SPARKLES",
    "THEY WENT ALL TWINKLY",
    "OOOOOH",
  ],
  woman: [
    "SHE WENT OFF LIKE A FIREWORK",
    "THAT LADY IS ALL GLITTER NOW",
    "SHE'LL BE BACK, THEY ALWAYS ARE",
    "LOOK AT HER GO",
  ],
  // The scene covers the old man, the crutches and the walking frame — three
  // bodies with one thing in common and nothing else — so not one of these says
  // a gender, exactly as the shipped list does not.
  elder: [
    "THEY POPPED LIKE A PARTY POPPER",
    "OFF THEY GO, SPARKLING",
    "THAT ONE MADE GOLD STARS",
    "THEY DIDN'T EVEN SPILL THEIR TEA",
  ],
  wheelchair: [
    "THE CHAIR TURNED INTO RIBBONS",
    "WHEELS AND ALL, JUST SPARKLES",
    "THAT WAS A GLITTERY ONE",
  ],
  dog: [
    "THE DOG IS MADE OF STARS",
    "GOOD BOY, VERY SPARKLY",
    "HERE COMES THE DOG AGAIN",
  ],
  cyclist: [
    "THE BIKE WENT UP IN GLITTER",
    "THEY CARTWHEELED INTO CONFETTI",
    "HELMET AND ALL, POOF",
    "THAT'S THE SHINIEST ONE YET",
  ],
  glued: [
    "THEY GOT THE WHOLE CHALK CREW",
    "THAT'S THE PICNIC RUINED",
    "SPARKLES ALL OVER THE CROSSING",
    "THERE GOES THE SIT-DOWN",
  ],
  torn: [
    "A WHOLE BUCKET OF GLITTER",
    "CONFETTI EVERYWHERE, LOOK AT IT",
    "THE BIGGEST SPARKLE OF THE NIGHT",
    "IT'S SNOWING STARS",
    "COVER YOUR DRINKS",
  ],
  // ── AND THE REST OF THE ROAD, WHICH IS STILL MADE OF STEEL ────────────────
  car: [
    "HE'S BUMPING THE CARS NOW",
    "DID YOU HEAR THAT CLANG",
    "THAT'S SOMEBODY'S NICE CAR",
    "BUMPER CARS, IS IT",
  ],
  heavy: [
    "HE'S HAVING A GO AT BUSES",
    "THAT'S A BUS, YOU BANANA",
    "THE BUS BARELY WOBBLED",
  ],
  headOn: [
    "THEY BOOPED EACH OTHER",
    "NOSE TO NOSE, THAT ONE",
    "BOTH OF THEM AT ONCE",
    "RIGHT ON THE FRONT BUMPER",
    "THAT WAS A PROPER CLONK",
  ],
  bike: [
    "THE MOPED'S IN TWO BITS",
    "HE PUT THE LITTLE BIKE DOWN",
    "THERE'S A SCOOTER IN THE ROAD",
    "PARTS EVERYWHERE, WHAT A MESS",
  ],
  rolled: [
    "IT'S ON ITS ROOF, LOOK",
    "IT WENT RIGHT OVER, WHEELS UP",
    "SOMEBODY GIVE IT A PUSH",
  ],
  thrown: [
    "SOMEBODY POPPED OUT THE FRONT",
    "OUT THE WINDOW IN A PUFF",
    "THEY LANDED IN GOLD DUST",
  ],
  // A CAR ALIGHT IS A CAR FIZZING (`star-fire.ts`), so these are the lines of
  // people watching gold stars climb off a bonnet rather than of people
  // watching a fire take hold. It still GROWS — the stars thicken with the
  // burn — which is why none of them is a reaction to a bang.
  fire: [
    "IT'S SPARKLING ALL OVER",
    "LOOK AT THE STARS COMING OFF",
    "THE WHOLE BONNET IS TWINKLING",
    "IT'S FIZZING LIKE A SPARKLER",
    "GOLD STARS, EVERYWHERE, LOOK",
  ],
  blast: [
    "THAT WAS THE BIGGEST FIREWORK YET",
    "CONFETTI CANNON, THAT WAS",
    "IT WENT BANG AND SPARKLED",
    "HAPPY NEW YEAR, EVERYBODY",
    "MIND THE STREAMERS",
  ],
  // THE FRONT IT THREW is the one thing on this road the crowd FEELS rather
  // than watches, and a pressure wave is the same pressure wave in any mode —
  // so these stay about the chest, the ears, the windows and the lights.
  shockwave: [
    "I FELT THAT IN MY BOOTS",
    "THE WINDOWS ALL RATTLED",
    "MY EARS ARE RINGING, WOW",
    "ALL THE LAMPS BLINKED AT ONCE",
    "THE WHOLE STREET WOBBLED",
  ],
  lamp: [
    "THERE GOES A STREET LIGHT",
    "HE'S BENT THE LAMP POST",
    "THE COUNCIL WILL BE THRILLED",
  ],
  // ── AND THE ONE ABOUT HIM ─────────────────────────────────────────────────
  // Unlocked by the second body, as the shipped scene is. It is still the only
  // line out here that is about the driver rather than about what happened, and
  // it still becomes nothing at all: he is at GOODCO ninety seconds later
  // remarking on the suspension.
  fleeing: [
    "HE'S NOT STOPPING, IS HE",
    "OFF HE GOES AGAIN",
    "SOMEBODY TELL HIM TO SLOW DOWN",
    "HE'S IN A REAL HURRY",
  ],
};
