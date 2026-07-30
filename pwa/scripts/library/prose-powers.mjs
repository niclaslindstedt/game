// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE POWERS' sentences. A block of parameters is a row; what makes a power's
// page worth reading is the paragraph around it — what the thing is, whether it
// runs on a clock or is over at once, whether a second copy is worth picking up,
// and how often you can expect to see one at all.
//
// Every clause here is assembled out of facts the model got back from the engine
// (./model-powers.mjs); none of it invents a number.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

/**
 * What each effect block IS, in one noun phrase — the word the opening line
 * reaches for. Deliberately plain: the flavor is the power's own authored
 * `lore`, and repeating it in a generated sentence beside it reads as the page
 * saying the same thing twice in two voices.
 */
const BLOCK_NOUN = {
  orbit: "a ring of orbs turning around the hero",
  storm: "a charge that keeps grounding itself through the nearest body",
  stasis: "a field that slows everything standing in it",
  nuke: "a blast over everything in sight",
  magnet: "a pull that hauls loose loot to the hero",
  trail: "a burning wake laid behind the hero as he moves",
  barrier: "a shell that eats incoming damage until its pool runs out",
  rain: "a barrage falling around the fight",
  phase: "a spell of being untouchable",
  well: "a core that hauls the horde in and grinds it",
  surge: "the hero's own weapon run hot",
  pulse: "a wave washing out of the hero",
  volley: "a stream of shots that loose themselves at the nearest foe",
  turret: "a grid of guns bolted to the floor where it lands",
  ward: "a floor under the hero's health that a killing blow cannot pass",
  singularity: "a vortex collapsing on the nearest cluster",
  immolation: "a burning ring the hero carries with him",
};

export const secondsLabel = (ms) => {
  const seconds = ms / 1000;
  // Trailing zeros trimmed: 6500 ms is 6.5 seconds, not 6.50 — a fixed two
  // places makes a duration read as a stopwatch reading rather than a length.
  return Number.isInteger(seconds)
    ? `${seconds}`
    : `${Number(seconds.toFixed(2))}`;
};

const percent = (frac) => `${Math.round(frac * 100)}%`;
const oneDp = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** One block-parameter value, in the unit its declaration names. */
export function valueLabel(row) {
  switch (row.unit) {
    case "sec":
      return `${secondsLabel(row.value)} S`;
    case "px":
      return `${row.value} PX`;
    case "speed":
      return `${row.value} PX/S`;
    case "rad":
      return `${oneDp(row.value)} RAD/S`;
    // A fan is authored in radians and read in degrees — nobody pictures 0.34
    // of a radian, and every other angle a reader meets in this game (a
    // weapon's `sweepDeg`) is already in degrees.
    case "deg":
      return `${Math.round((row.value * 180) / Math.PI)}°`;
    case "pct":
      return percent(row.value);
    case "mult":
      return `${oneDp(row.value)}×`;
    case "hp":
      return `${row.value} HP`;
    default:
      return `${row.value}`;
  }
}

// ---- the opening line ---------------------------------------------------------

/**
 * What this power is, in a sentence or two, before any table. A reader who
 * searched a power's name wants the same three answers a player would: what it
 * does, how long it lasts, and whether picking up a second one is worth
 * anything.
 */
export function powerLead(power) {
  const lines = [];
  const blocks = power.effects.map((effect) => effect.block);
  const what = list(blocks.map((block) => BLOCK_NOUN[block] ?? block));

  lines.push(
    power.instant
      ? `${power.name} is spent rather than run: it is ${what}, and it is over in the instant it is used.`
      : `${power.name} is ${what}, and it runs for ${secondsLabel(power.durationMs)} seconds from the moment it is spent.`,
  );

  // A composed power is the catalog's whole design, and the one thing a reader
  // cannot work out from a stat table: two blocks means two clocks, both
  // running, neither of them the thing the power calls itself.
  if (blocks.length > 1) {
    lines.push(
      `It does ${blocks.length} things at once, each on its own clock — it leads with the ${power.kind}, but the rest of it is running the whole time too.`,
    );
  }

  if (power.stackable) {
    lines.push(
      "It stacks: a second pickup spent while the first is still running adds a whole fresh copy rather than resetting the clock, so two at once is genuinely twice the power.",
    );
  } else if (!power.instant) {
    lines.push(
      "It does not stack. A second pickup spent while a copy is already running would be wasted, so the dock refuses it and keeps it banked for afterwards.",
    );
  }

  if (power.uniqueHeld) {
    lines.push(
      "And only one may sit in the dock at a time: a second is left lying on the floor and the merchant will not sell you one, because a pocket full of these would not be a power any more.",
    );
  }

  return lines;
}

// ---- the notes ------------------------------------------------------------------

/**
 * The short `[key, text]` notes under a power's numbers — the rules that are
 * true of the power but are not one of its parameters.
 */
export function powerNotes(power, model) {
  const notes = [];
  // Two powers carry no damage figure at all — the MAGNET does nothing to a
  // monster, and the bomb's blow is a fraction of what its victims are
  // carrying rather than a number in the catalog. Printing the level-1
  // yardstick on either would explain a figure that isn't on the page, and
  // the INT deepening would claim a scaling neither of them rides.
  const scales = power.effects.some((effect) =>
    effect.rows.some((row) => row.unit === "dmg"),
  );

  if (scales) {
    notes.push([
      "AUTHORED AT LEVEL 1",
      `every damage figure above is the blow a level-1 hero with nothing spent on INTELLIGENCE lands, measured against a reference minion carrying ${model.refMobHp} health. It does not stay there: a power's output rides the same curve a monster's healthbar climbs, so a figure that clipped a third of a bar on the first map still clips a third of one on the last.`,
    ]);
  }

  const intClause = [
    scales
      ? `deepens every one of its blows by ${percent(model.intDamagePerPoint)}`
      : "",
    power.intRadius === "pull"
      ? "widens the pull"
      : power.intRadius === "field"
        ? `widens the field by ${model.stasisRadiusPerInt} px`
        : "",
  ].filter(Boolean);
  if (intClause.length > 0) {
    notes.push(["INTELLIGENCE", `each point ${list(intClause)}.`]);
  }

  if (power.instant) {
    notes.push([
      "NO CLOCK",
      "it never becomes a running power, so nothing about it can be extended, stacked or cut short.",
    ]);
  }

  return notes;
}

// ---- how often ------------------------------------------------------------------

/**
 * The rarity paragraph: what the power's weight means, and what it does to the
 * price at the stall.
 *
 * A weight is not a probability and must not be printed as though it were — it
 * only means anything against the pool it is drawn from, which is what the
 * table beside this paragraph is for. What the weight DOES say on its own is
 * how the catalog rates the power against an ordinary one, and that is the
 * sentence a reader can use.
 */
export function rarityProse(power) {
  const lines = [];
  const { weight, standard, share, markupCap } = power.rarity;

  if (power.pools.length === 0) {
    lines.push(
      `No venue's loot pool carries ${power.name}. It is the one power the loot rules hand out themselves, on two channels of their own.`,
    );
    return lines;
  }

  lines.push(
    share === 1
      ? `${power.name} is weighted at the catalog's ordinary ${standard}: inside a pool it is exactly as likely as any other unweighted power in it.`
      : share > 1
        ? `${power.name} is weighted ${weight} against the catalog's ordinary ${standard}, so it turns up ${oneDp(share)} times as often as an unweighted power sharing its pool.`
        : `${power.name} is weighted ${weight} against the catalog's ordinary ${standard}, so it turns up ${oneDp(1 / share)} times as RARELY as an unweighted power sharing its pool.`,
  );
  lines.push(
    power.keptThroughout
      ? "A pool is a flat list picked from by weight, so what those odds actually come to depends on how deep the venue's list is — and every venue from here on keeps it, so the same power thins out the further down the campaign you take it."
      : "A pool is a flat list picked from by weight, so what those odds actually come to depends on how deep the venue's list is. Note that it is not in every venue's pool from here on: the table below is the whole of where it drops.",
  );
  if (share < 1) {
    lines.push(
      `The merchant's counter reads the same weight and marks the price up by it, to a ceiling of ${markupCap}× — coins cannot buy past the rationing.`,
    );
  }
  return lines;
}

/**
 * The screen-nuke's own two channels, in prose. It is the one power with no
 * pool to be measured against, so the section that would have printed its
 * per-venue odds prints this instead — and both channels are the engine's own
 * knobs rather than an explanation of a rule (see `bombChannelsFor`).
 */
export function bombProse(power) {
  const { share, crowd } = power.bomb;
  return [
    `About ${percentTenth(share)} of every ordinary loot payout in the game is a bomb instead — a flat slice, everywhere, all campaign, and the reason one turns up when nothing in particular is going wrong.`,
    `The second channel is the bailout, and it only opens when the fight has already gone badly: nothing at all until ${crowd.threshold} monsters are on screen at once, then a rising chance on every kill, reaching the rung's own ceiling at ${crowd.full}.`,
    "That ceiling tapers the harder the run is — the gentle rungs are pulled out of a swarm, and JESUS is never rescued from one at all.",
    "Only ever one: while a bomb sits in the dock, or lies uncollected on screen, neither channel rolls another.",
  ];
}

/** A small probability, kept to a tenth of a percent rather than rounded to a
 * flat 1% — the difference between "sometimes" and "hardly ever". */
const percentTenth = (frac) => `${(frac * 100).toFixed(1)}%`;

// ---- the head -------------------------------------------------------------------

/** The `<meta name="description">` for a power's page. */
export function powerDescription(power) {
  const where = power.introducedBy
    ? ` Introduced on ${power.introducedBy.name}.`
    : "";
  const runs = power.instant ? "Instant" : `${secondsLabel(power.durationMs)}s`;
  const text = `${power.name} in ${TITLE}: what the power does, its numbers, how long it runs and which venues drop it. ${runs}, ${power.kind}.${where}`;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}
