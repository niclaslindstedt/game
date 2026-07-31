// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ALLIES' sentences. A training table says what a rank comes to; what makes
// an ally's page worth reading is the paragraph around it — how you get this
// one at all, what it is actually contributing to a fight, and what it costs
// you to keep it standing.
//
// Every clause is assembled out of facts the model got back from the catalogs
// and the engine (./model-allies.mjs). None of it invents a number, and — the
// rule this section is likeliest to break — none of it retells the elite's own
// authored paragraph, which the page quotes and attributes instead.

import { TITLE } from "./html.mjs";

const percent = (frac) => `${Math.round(frac * 100)}%`;
const seconds = (ms) => {
  const value = ms / 1000;
  return Number.isInteger(value) ? `${value}` : `${Number(value.toFixed(2))}`;
};
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * A paragraph, with the source's own line breaks collapsed.
 *
 * These sentences are written across several lines to stay readable at 80
 * columns. A rendered paragraph would not care, but the SAME strings reach a
 * meta description and an og:description, where a run of newlines is a tag
 * full of whitespace — and the first sentence of a lead is exactly what the
 * story chapters' descriptions are cut from.
 */
const say = (strings, ...values) =>
  String.raw({ raw: strings }, ...values)
    .replace(/\s+/g, " ")
    .trim();

/** What its weapon does to a body, in one word the reader already has. */
const CLASS_VERB = {
  melee: "swings",
  ranged: "shoots",
  magic: "casts",
};

/**
 * THE OPENING PARAGRAPHS of an ally's page: how you get it, and what it brings
 * when you do.
 *
 * The recruit leads, because it is the only fact on the page a reader cannot
 * get any other way — every other section is numbers about somebody they may
 * never have met. It is also the section's whole premise: the allies are the
 * monsters the game lets you not kill.
 */
export function allyLead(ally, tuning) {
  const lines = [];
  const recruit = ally.recruit;

  if (recruit) {
    lines.push(
      say`Beat ${recruit.enemy.name} down${
        recruit.venue ? ` on ${recruit.venue.name}` : ""
      } and it kneels instead of dying: the run stops and asks you for a
      verdict. Spare it and this is who gets up — the same figure, at your side
      from here, handing over its story items but keeping its own kit. It is
      the only companion you get to keep, and sparing anybody else later
      retires it.`,
    );
  } else {
    // Reached only if a companion is authored that no elite names. Saying so is
    // better than a page that opens by describing a recruit which cannot
    // happen (see `recruitOf`).
    lines.push(
      say`Nothing in the game is spareable into ${ally.name} — no elite names
      it, so the roster carries it and no run can recruit it.`,
    );
  }

  const blow = ally.weapon.throws
    ? `${ally.base.damage} a ${ally.weapon.pellets > 1 ? "pellet" : "shot"}`
    : `${ally.base.damage} a blow`;
  lines.push(
    say`It arrives at your own level with ${ally.base.hp} health and its
    signature ${ally.weapon.name} in hand, and
    ${CLASS_VERB[ally.weapon.class] ?? "swings"} for ${blow} every
    ${seconds(ally.base.cooldownMs)} s at ${ally.weapon.range} px of reach.
    That figure is already through the party damper: a recruit fights at
    ${percent(tuning.damageMult)} of what its weapon says, because the party is
    there to support the hero rather than to clear the field for him.`,
  );

  if (ally.power) {
    lines.push(
      say`From there it trains on its OWN kills, and every
      ${ally.power.everyLevels} levels it earns a rank of ${ally.power.name} —
      ${ally.power.blurb.toLowerCase()}. That is what turns a spared elite into
      a specialist rather than a second body, and the ladder does not stop.`,
    );
  } else {
    lines.push(
      say`From there it trains on its OWN kills — deeper health and a harder
      blow with every level — but it never gains a new trick: the roster gives
      it no signature power.`,
    );
  }
  return lines;
}

/**
 * The one-sentence summary a search result and an unfurl show.
 *
 * A companion is USUALLY the elite it was spared from, name and all — every one
 * the game ships is — so the obvious wording ("spare X to recruit X") reads as a
 * generator that has lost track of what it is describing. The same-name case
 * therefore states the identity instead, and neither branch reaches for a
 * pronoun: which one a figure takes is a fact about the character rather than
 * anything the catalog states, and the roster is exactly the place a guess
 * would land on a real person's name.
 */
export function allyDescription(ally) {
  const recruit = ally.recruit;
  const where = recruit?.venue ? ` on ${recruit.venue.name}` : "";
  const how = !recruit
    ? "recruited by nothing in the game"
    : recruit.enemy.name === ally.name
      ? `spared${where} rather than finished`
      : `spared from ${recruit.enemy.name}${where}`;
  const what = ally.power
    ? `${ally.power.name} every ${ally.power.everyLevels} levels`
    : "no signature power";
  // Held under Google's 160-character cut, which is what the whole shape is
  // for: everything here is a fact a searcher can act on, in descending order
  // of how likely they are to have searched for it, and the sentence stops
  // rather than trailing into a clause the result page would cut mid-word.
  return `${ally.name}, a ${TITLE} companion — ${how}. ${ally.base.hp} health, ${ally.weapon.name}, ${what}.`;
}

/**
 * THE FROST NOVA and THE AURA — the two things an ally does that are not simply
 * hitting something. Each is worded from its own block and omitted entirely
 * when the def carries none, which is most of the roster for both.
 */
export function novaProse(ally) {
  const nova = ally.nova;
  if (!nova) return [];
  return [
    say`While it is up and something is in reach, it pulses a chilling ring
    every ${seconds(nova.everyMs)} s. Everything caught inside takes the bite
    below AND is slowed to ${percent(nova.chillFactor)} of its pace for
    ${seconds(nova.chillMs)} s — which is what makes a plain melee ally the
    party's crowd-control anchor rather than a second axe.`,
    say`It holds its charge until a foe is actually in the blast, so it never
    fires into empty ground, and it goes quiet the moment the ally is knocked
    down. The bite lands at full authored weight: the party damper is a rule
    about traded weapon blows, and a signature power is not one.`,
  ];
}

export function auraProse(ally, tuning) {
  if (!ally.aura) return [];
  return [
    say`Everything that dies while it is standing rolls its loot tier at
    ${percent(1 + ally.aura.magicFind)} of the normal chance — a MAGIC FIND aura
    over the whole run's drops, not just over its own kills. It goes silent the
    moment this one goes down and stays silent until you spend a bottle of salts
    on it, so every fight you finish with it face-down is a fight paying plain
    loot. Of the roster this is the one whose upkeep pays for itself.`,
    say`It is also why this one is worth carrying through a farm rung even when
    the fight does not need the help: at ${percent(tuning.damageMult)} weapon
    damage a companion is never the reason a pack died, and this is the
    contribution that does not care how hard it hits.`,
  ];
}

/**
 * The notes under the training table — the things that are rules rather than
 * numbers, so a reader is not left inferring them from a column.
 */
export function trainingNotes(ally, tuning) {
  const notes = [];
  const rows = ally.training.rows;
  const last = rows[rows.length - 1];

  notes.push([
    "IT NEVER STOPS",
    say`The table is the first ${rows.length} ranks of a ladder that runs to
    level ${tuning.maxLevel}. Every rung past the last row here goes on paying
    the same way; there is no cap to reach and nothing to save points for.`,
  ]);
  notes.push([
    "ITS OWN KILLS",
    say`A level costs ${plural(rows[0].kills, "kill")} at the start and
    ${plural(last.kills, "kill")} by level ${last.level}, counted in ordinary
    mobs of its own level and earned off blows IT lands, never the hero's. The
    level rides the loadout, so it survives every mission and every difficulty —
    a companion carried from its first clear is levels ahead of the same figure
    recruited on the rung you are standing on.`,
  ]);
  // Only worth a note when there IS a volley: a coil that throws one bolt has
  // nothing to divide, and the note as written told its reader about pellets it
  // does not have. Asked of the weapon rather than assumed of everything that
  // throws something.
  if (ally.weapon.pellets > 1) {
    notes.push([
      "PER PELLET",
      say`The damage column is what ONE of them carries, and every pellet in the
      volley carries the whole figure — so a rank that adds a pellet adds that
      much damage rather than spreading the same amount thinner.`,
    ]);
  } else if (!ally.weapon.throws) {
    notes.push([
      "PER FOE",
      say`The damage column is what each body takes, and one swing reaches up to
      ${tuning.meleeTargets} of them — so it is per foe rather than per swing.`,
    ]);
  }
  if (
    ally.weapon.chain === null &&
    ally.training.measures.some((measure) => measure.key === "chain")
  ) {
    notes.push([
      "AN ARC IT DID NOT HAVE",
      say`The ${ally.weapon.name} chains nothing on its own. The first rank
      grants the arc outright rather than widening one, which is why rank 0
      shows none at all.`,
    ]);
  }
  notes.push([
    "NO STATS OF ITS OWN",
    say`A companion has no attributes to build — the gear IS the build. You can
    hand it a helmet and a chest piece out of your own bag (never legs, never
    boots), and its signature weapon stays in its hands unbreakable.`,
  ]);
  return notes;
}

/**
 * THE PARTY RULES, for the index — the things that are true of every ally and
 * visible from inside the game only by inference. This is the material that
 * earns the section an index rather than four unrelated pages: none of it
 * belongs on any one ally's page, and none of it can be read off the game.
 */
export function partyProse(model) {
  const t = model.tuning;
  return [
    say`A companion holds station about ${t.followDistance} px behind you and
    fights only what comes within ${t.engageRadius} px of YOU — the party works
    around the hero and never runs off to clear the map. Past ${t.leashRadius}
    px it drops whatever it was fighting and regroups, and left further behind
    than ${t.catchUpDistance} px it stops trying and simply rejoins you. These
    are party members, not escort quests.`,
    say`Every one of them hits at ${percent(t.damageMult)} of what its weapon
    says, and grows ${percent(t.damagePerLevel)} harder and
    ${percent(t.hpPerLevel)} deeper per level of its own. The damper is the
    whole design — a party that could carry a fight would be answering the game
    for you — and the menace meter deliberately ignores companion damage for
    the same reason: a party doing well is not the hero being too strong.`,
    say`The party is ${t.maxParty === 1 ? "ONE" : plural(t.maxParty, "strong")}.
    Spare a second figure and the one you had is retired on the spot — whatever
    armor you had lent it comes back to your bag, and everything else about it
    is gone, including every level it earned. Choosing who walks with you is
    the point; collecting them is not.`,
    say`They are beaten DOWN rather than killed, and DOWN is where they stay.
    Nothing in the world stands one back up: not time, not clearing the room it
    fell in, not the merchant, not the walk to the next venue. What wakes it is
    a bottle of SMELLING SALTS off the trader's shelf, USED out of your bag,
    and it comes round groggy on ${percent(t.saltsHpFraction)} of its health.`,
    say`Nor do they mend themselves — there is no regeneration at all. The only
    thing that fills a companion's bar back up is one of YOUR medkits, spent by
    pressing its portrait: a kit puts back ${percent(t.medkitHealFraction)} of
    the companion's health scaled by that kit's own quality, so a light one is
    a patch and a superior one nearly whole. A friend is a supply line. Budget
    for it before a boss.`,
    say`They talk. A companion's own kill floats one of its lines about
    ${percent(t.quoteChance)} of the time, never more than once every
    ${seconds(t.quoteCooldownMs)} s — banter rather than a ticker. Every line
    each of them has is on its page, behind a cover.`,
  ];
}

/**
 * The index's own summary line. It names no companions, deliberately: the four
 * names cost 45 characters and push everything a searcher could act on past
 * Google's 160-character cut, and the names are on the page they land on.
 */
export function alliesDescription(model) {
  return `All ${model.allies.length} companions in ${TITLE}: who to spare to recruit each one, what they bring to a fight, and what every rank of their signature power comes to.`;
}
