// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TALENTS' sentences. A rank table says what a talent comes to; what makes
// a talent page worth reading is the paragraph around it — what the thing does
// in a fight, what it costs a build to own, and what owning it means you are
// not owning instead.
//
// Every clause is assembled out of facts the model got back from the engine
// (./model-talents.mjs); none of it invents a number, and none of it states a
// rule the catalog could contradict.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

/**
 * WHAT EACH SLOPE IS, in one noun phrase — the clause the opening line reaches
 * for. Deliberately plain: the talent's own `blurb` is the flavour, and saying
 * the same thing twice in two voices reads as a page arguing with itself.
 */
export const SLOPE_NOUN = {
  critChancePerRank: "crits more often",
  critDamagePerRank: "crits harder",
  moveSpeedPerRank: "moves faster",
  dodgePerRank: "slips more blows",
  damageReductionPerRank: "takes less from every blow",
  magicReductionPerRank: "wards off part of every blow",
  reflectPerRank: "turns part of every blow back on whoever landed it",
  maxHpPerRank: "carries a deeper health pool",
  berserkPerRank: "hits harder the closer to death it gets",
};

/** WHAT EACH PROC IS, in one clause — same rule as the slopes above. */
export const PROC_NOUN = {
  cleavingEcho:
    "a roll on every swing to cut into foes past what the weapon can normally reach",
  twinStrike: "a roll on every blow for it to land a second time",
  parry:
    "a roll on every melee blow that lands on you to turn it aside entirely",
  seismic: "a shockwave under every jump landing",
  piercing: "shots that punch on through the body they hit",
  concussive: "a roll on every hit to shove what it struck straight back",
  crippling: "a roll on every hit to slow what it struck to a hobble",
  volley: "a roll on every pull to loose a fan of extra rounds",
  springHeels: "a higher, longer jump",
  evasionBurst: "a dodge that leaves you moving",
  frostNova: "a blast of cold off every blow that lands on you",
};

/** WHAT A CONJURATION PUTS ON THE FIELD, permanently — one clause per spell. */
export const CONJURE_NOUN = {
  orbit: "a ring of fire turning around you",
  storm: "lightning that keeps grounding itself through the nearest body",
  stasis: "a field that slows everything standing in it",
  seeker: "orbs that hunt the horde down and burst on it",
  singularity: "a vortex that hauls a cluster together and crushes it",
  immolation: "a burning ring you carry with you",
};

const percent = (frac) => `${Math.round(frac * 100)}%`;
/** A small fraction kept to a tenth of a percent — INT's cadence trim is 0.6%
 * a point, and rounding it to a whole percent nearly doubles it. */
const percentTenth = (frac) => `${Number((frac * 100).toFixed(1))}%`;
/** "a" or "an" — the talent roles include `offense`, and "a offense talent" is
 * the kind of thing a generator ships four hundred copies of. */
const article = (word) => (/^[aeiou]/i.test(word) ? "an" : "a");
/** Two places, trailing zeros trimmed. Not one place: a crit-damage ladder
 * climbing 0.15 a rank reads 0.15 / 0.3 / 0.45, and rounding that to a tenth
 * makes two of the five ranks print the same figure as their neighbour. */
const trim = (n) => `${Number(n.toFixed(2))}`;

/** Seconds from ms, trailing zeros trimmed — 900 ms is 0.9 s, not 0.90. */
export const secondsLabel = (ms) => {
  const seconds = ms / 1000;
  return Number.isInteger(seconds)
    ? `${seconds}`
    : `${Number(seconds.toFixed(2))}`;
};

/**
 * One rank-table cell, in the unit its measure declares.
 *
 * Its own vocabulary rather than the powers' `valueLabel`, because the two
 * genuinely differ: a talent's fan is authored in DEGREES where a powerup's is
 * in radians, and a talent deals in bonuses (`+9%`, which is not the same
 * statement as `9%`) where a power block deals in absolutes. The CONJURED
 * tables are the exception and go through the powers' labels, since those rows
 * really are a power's block.
 */
export function talentValue(measure, value) {
  // A measure a rank does not have at all — the mastery kicker below the rank
  // it appears at. An em dash, never a zero: "1x" against a speed burst that
  // cannot happen is a smaller number saying a bigger lie.
  if (value === null || value === undefined) return "&mdash;";
  switch (measure.unit) {
    case "pct":
      return percent(value);
    // A BONUS, and the sign is the whole of it: "+9%" crit chance is nine
    // points added to whatever the hero already had, where a bare "9%" reads as
    // the total.
    case "plusPct":
      return `+${percent(value)}`;
    case "mult":
      return `${trim(value)}×`;
    case "plusMult":
      return `+${trim(value)}×`;
    case "px":
      return `${Math.round(value)} PX`;
    case "sec":
      return `${secondsLabel(value)} S`;
    case "deg":
      return `${Math.round(value)}°`;
    case "dmg":
      return `${Math.round(value)}`;
    default:
      return `${value}`;
  }
}

// ---- the opening line ---------------------------------------------------------

/**
 * What this talent is, in a sentence or three, before any table. A reader who
 * searched a talent's name wants what a player deciding at the picker wants:
 * what it does, what tree it is in, and what it costs to take it all the way.
 */
export function talentLead(talent, model) {
  const lines = [];
  const what = list([
    ...Object.keys(SLOPE_NOUN)
      .filter((slope) =>
        talent.readouts.some((readout) =>
          readout.measures.some((measure) => measure.key === slope),
        ),
      )
      .map((slope) => SLOPE_NOUN[slope]),
    ...talent.readouts
      .filter((readout) => PROC_NOUN[readout.id])
      .map((readout) => PROC_NOUN[readout.id]),
    ...(talent.conjure ? [CONJURE_NOUN[talent.conjure.spell]] : []),
  ]);

  lines.push(
    `${talent.name} is ${article(talent.kind)} ${talent.kind} talent in the ${talent.tree.title} tree, the one ${talent.tree.stat.toUpperCase()} pays for${
      what ? `: ${what}` : ""
    }.`,
  );

  lines.push(
    `It is ALWAYS ON. There is nothing to press, nothing to aim, no mana and no cooldown — once the point is spent it is part of the hero, on every map, for the rest of that hero's life.`,
  );

  lines.push(
    `Every rank costs one ${talent.tree.stat.toUpperCase()} talent point, and a point is ${model.unlockStep} points of ${talent.tree.stat.toUpperCase()} the player chose to spend. So carrying it at ${talent.maxRank} means ${talent.maxRankStatCost} chosen points of ${talent.tree.stat.toUpperCase()} that bought nothing else in the tree.`,
  );

  if (talent.weaponClassGated) {
    lines.push(
      `The bonus is gated to the tree's own weapon: it counts on ${weaponWord(talent.tree.id)} and on nothing else, so it is worth nothing at all to a build fighting the other way.`,
    );
  }

  if (talent.readouts.length + (talent.conjure ? 1 : 0) > 1) {
    lines.push(
      `It does more than one thing, and one rank buys all of them — the tables below are the same rank read in each of its parts.`,
    );
  }

  return lines;
}

/** How a tree's own weapons are named in a sentence. */
const weaponWord = (tree) =>
  tree === "melee"
    ? "blows you land in melee"
    : tree === "ranged"
      ? "shots you fire"
      : "spells you project";

// ---- the notes ------------------------------------------------------------------

/**
 * The short `[key, text]` notes under a talent's tables — the rules that are
 * true of the talent but are not one of its numbers.
 */
export function talentNotes(talent, model) {
  const notes = [];

  if (talent.scalesWithLevel) {
    notes.push([
      "AUTHORED AT LEVEL 1",
      `every damage figure above is the blow a level-1 hero with nothing spent on INTELLIGENCE lands, measured against a reference minion carrying ${model.refMobHp} health. It does not stay there: a talent's output rides the same curve a monster's healthbar climbs, so a figure that clipped a third of a bar on the first map still clips a third of one on the last.`,
    ]);
    notes.push([
      "INTELLIGENCE DEEPENS IT",
      `on top of that curve, each point of INTELLIGENCE adds ${percent(model.intDamagePerPoint)} to every one of those blows — a conjured blow is a conjured blow, whichever tree threw it.`,
    ]);
  }

  for (const readout of talent.readouts) {
    if (readout.cap?.reached) {
      notes.push([
        "THE ROLL HAS A CEILING",
        `${readout.title.toLowerCase()} can never fire more often than ${percent(readout.cap.value)} of the time, and the last rank sits on that ceiling — a talent that rolled its way to a certainty would stop being a talent and start being the weapon.`,
      ]);
    }
  }

  if (talent.conjure) {
    notes.push([
      "INTELLIGENCE QUICKENS IT",
      `the figures above are a hero with nothing spent on INTELLIGENCE. Every point trims ${percentTenth(model.spellIntervalPerInt)} off each tick and strike, down to ${percent(model.spellIntervalFloor)} of the authored cadence — so the same rank fires far more often on a deep-INT hero.`,
    ]);
    notes.push([
      "IT STACKS WITH GEAR",
      `a worn piece that grants the same spell adds its rank to this one. The talent and the relic are the same machinery, so ${talent.maxRank} ranks here and a granted rank on a legendary is one spell running at ${talent.maxRank + 1}.`,
    ]);
  }

  notes.push([
    "A SPENT POINT IS PERMANENT",
    `a respec can move the stat points that earned it, but never below ${model.unlockStep} × the ranks already spent in that tree — the talent is kept, and the ${talent.tree.stat.toUpperCase()} holding it up is locked in place.`,
  ]);

  return notes;
}

// ---- the trees ------------------------------------------------------------------

/** The economy paragraph the index leads with, and every number in it asked of
 * the engine rather than restated from the design doc. */
export function economyProse(model) {
  const lines = [];
  lines.push(
    `Talents are bought, not found. Every ${model.unlockStep} points a hero CHOOSES to put into STRENGTH, DEXTERITY or INTELLIGENCE earns one talent point in THAT stat's tree, and the run pauses on the picker until it is spent. Gear never mints one: only the points the player placed by hand count.`,
  );
  lines.push(
    `Each talent holds up to ${model.maxRank} ranks and every rank is always on — no mana, no cooldown, nothing to press. Nothing is ever unlearned, either: a respec can move the stats underneath, but never far enough to strand a rank already bought.`,
  );
  const [tree] = model.trees;
  if (tree && tree.capacity > tree.ceiling) {
    lines.push(
      `And no tree can be filled. A stat tops out at ${model.statHardCap}, which is ${tree.ceiling} talent points, against the ${tree.capacity} ranks a tree can hold — so even a hero who pours a whole lifetime into one stat leaves ${tree.capacity - tree.ceiling} of its ranks untrained. Which of them to deepen is the whole of what a spec is here.`,
    );
  }
  return lines;
}

/** One tree's own paragraph on the index — who it is for and what it holds. */
export function treeProse(tree, model) {
  const kinds = [...new Set(tree.entries.map((talent) => talent.kind))];
  return `${tree.entries.length} talents, ${tree.capacity} ranks between them, paid for out of ${tree.stat.toUpperCase()} at ${model.unlockStep} chosen points a piece — ${list(kinds)}, in the order the picker lists them.`;
}

// ---- the head -------------------------------------------------------------------

/** The `<meta name="description">` for a talent's page. */
export function talentDescription(talent) {
  const text = `${talent.name} in ${TITLE}: what the talent does at every one of its ${talent.maxRank} ranks, what it costs in ${talent.tree.stat.toUpperCase()}, and where it sits in the ${talent.tree.title} tree. ${talent.blurb}`;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}
