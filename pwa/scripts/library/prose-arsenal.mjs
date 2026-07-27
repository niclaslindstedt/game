// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARSENAL's sentences. A stat table is a row; what makes an item page worth
// reading is the paragraph around it — what the piece IS, what it turns into,
// and how you get one. Every clause here is assembled out of facts the model
// got back from the engine; none of it invents a number.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

const CLASS_NOUN = {
  melee: "a melee weapon",
  ranged: "a ranged weapon",
  magic: "a magic weapon",
};

const CLASS_STAT = {
  melee: "STRENGTH",
  ranged: "DEXTERITY",
  magic: "INTELLECT",
};

const SLOT_NOUN = {
  weapon: "weapon",
  head: "headgear",
  chest: "body armor",
  legs: "leg armor",
  feet: "footwear",
  charm: "a charm",
  bag: "a bag",
};

export const TIER_LABEL = {
  trash: "TRASH",
  regular: "BASE ITEM",
  set: "SET",
  unique: "UNIQUE",
  legendary: "LEGENDARY",
  artifact: "ARTIFACT",
};

const TIER_NOUN = {
  set: "a set piece",
  unique: "a unique",
  legendary: "a legendary",
  artifact: "an artifact",
};

const MATERIAL_NOUN = {
  cloth: "cloth",
  leather: "leather",
  mail: "mail",
  plate: "plate",
};

const percent = (frac) => `${Math.round(frac * 100)}%`;
const oneDp = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));

/** A `{min,max}` damage band, or a bare number when the two agree. */
export const bandLabel = (band) =>
  band.min === band.max ? `${band.min}` : `${band.min}–${band.max}`;

export const pairLabel = (pair) =>
  pair[0] === pair[1] ? `${pair[0]}` : `${pair[0]}–${pair[1]}`;

// ---- the opening line -----------------------------------------------------------

/**
 * What this thing is, in one or two sentences, before any table. A reader who
 * searched an item's name wants the answer above the fold: what it is, what it
 * costs to hold, and — for a named item — who has to die for it.
 */
export function itemLead(item, sources) {
  const lines = [];

  if (item.kind === "named") {
    const what = TIER_NOUN[item.tier] ?? "a named item";
    lines.push(
      `${item.name} is ${what} built on the ${item.base.name}, and every copy carries the same bonuses — the block is authored, not rolled, so there is no such thing as a badly rolled one.`,
    );
    lines.push(
      `It is worn from level ${item.levelReq}, the requirement of the base underneath it rather than its own item level of ${item.ilvl} — which is why it can land in your hands long before it looks like it should.`,
    );
    if (item.world) {
      lines.push(
        "It is a world relic: it belongs to one place, drops from anything standing in it, and only once the hero has out-levelled a first pass through — so it is farmed on a return trip rather than found on the way past.",
      );
    }
    if (item.keeper) {
      lines.push(
        "It is a keeper. Its headline bonus is a fraction of your own numbers rather than a flat lump, so it reads modest the day you find it and grows with you for the rest of the campaign.",
      );
    }
    return lines;
  }

  if (item.sidearm) {
    lines.push(
      `${item.name} is the weapon the run starts with, and the only one that is never a drop: the game mints it into an empty holster and it cannot break. It is also the one weapon that swings for its full catalog weight — everything scavenged off a corpse is cut to half, and this is not.`,
    );
    return lines;
  }

  const what =
    item.family === "weapon"
      ? CLASS_NOUN[item.weaponClass]
      : (SLOT_NOUN[item.slot] ?? "a piece of gear");
  lines.push(
    `${item.name} is ${what}, wielded from level ${item.levelReq}.` +
      (item.family === "weapon"
        ? ` ${CLASS_STAT[item.weaponClass]} is the stat that scales it.`
        : ""),
  );
  lines.push(
    `The requirement cuts both ways: nothing below level ${item.levelReq} ever drops one, and a hero below it banks the find rather than wearing it.`,
  );

  if (item.ladder.length > 0) {
    lines.push(
      `It is a pool base, so it climbs: the same shape returns later in the campaign as ${list(item.ladder.map((rung) => rung.name))}, at requirements the endgame can actually meet.`,
    );
  }
  if (sources.length === 0) {
    lines.push(
      "Nothing in the campaign is authored to pay it out, so it turns up only where the loot rules reach it on their own.",
    );
  }
  return lines;
}

/**
 * The 155-ish characters a search result shows under the title.
 *
 * The noun phrase comes from THE SAME THREE MAPS the body prose above reads,
 * and it arrives carrying its own article — because the article is a property
 * of the noun, not of the sentence. Writing `a ${noun}` here instead published
 * `a artifact` on every artifact, `a a charm` on every charm (`SLOT_NOUN`
 * supplies the article that `is a charm` needs), and `a footwear` on every pair
 * of boots, since half these nouns are mass nouns that take no article at all.
 * One convention, one set of maps, and the frame is `X is …` so the mass nouns
 * read correctly too.
 */
export function itemDescription(item) {
  const kind =
    item.kind === "named"
      ? (TIER_NOUN[item.tier] ?? "a named relic")
      : item.family === "weapon"
        ? (CLASS_NOUN[item.weaponClass] ?? "a weapon")
        : (SLOT_NOUN[item.slot] ?? "a piece of gear");
  const stats =
    item.family === "weapon" || item.stats.damage
      ? ` ${bandLabel(item.stats.damage)} damage, ${oneDp(item.stats.dps)} dps.`
      : item.stats.armor
        ? ` ${item.stats.armor} armor.`
        : "";
  const text = `${item.name} is ${kind} in ${TITLE}. Requires level ${item.levelReq}.${stats} What it rolls, what it becomes, and what drops it.`;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

// ---- the numbers ------------------------------------------------------------------

/**
 * The one caveat every figure on an arsenal page needs, said once. The pages
 * quote the item card, and the item card quotes a specific pair of hands — so
 * the pages say whose.
 */
export const REFERENCE_NOTE =
  "These are the figures the game's own item card shows for a fresh find, held by a hero who has spent no stat points — the piece itself, with nothing of the wielder in it. Your own STRENGTH, DEXTERITY or INTELLECT lifts them from there, as does an item level found deeper than the requirement.";

/** How a weapon's shape reads: what the swing reaches, what a crit weighs. */
export function weaponShapeNotes(stats) {
  const notes = [];
  if (stats.projectile) {
    const p = stats.projectile;
    if (p.count && p.count > 1) {
      notes.push([
        "VOLLEY",
        `Each pull throws ${p.count} projectiles across a ${p.spreadDeg ?? 0}° fan, and every one of them carries the full blow — so point blank it is one enormous hit and across a crowd it is ${p.count} separate ones.`,
      ]);
    }
    if (p.pierce) {
      notes.push([
        "PIERCING",
        `The round punches through ${p.pierce} more ${p.pierce === 1 ? "body" : "bodies"} before it spends itself, so a queued-up line is one shot rather than ${p.pierce + 1}.`,
      ]);
    }
    if (p.homing) {
      notes.push([
        "HOMING",
        "The shot steers toward whatever is ahead of it, so it corrects for a target that moves after you fire.",
      ]);
    }
    if (p.chain) {
      notes.push([
        "CHAINING",
        `On a hit the bolt leaps to ${p.chain} further ${p.chain === 1 ? "foe" : "foes"} nearby, each leap landing a fraction of the blow before it.`,
      ]);
    }
  } else if (stats.sweepDeg != null) {
    notes.push([
      "SWEEP",
      `The swing carves a ${stats.sweepDeg}° cone and strikes everything standing in it. INTELLECT widens that cone as you grow, out to a full half circle.`,
    ]);
  }
  notes.push([
    "PRICED FOR",
    `About ${oneDp(stats.targets)} ${stats.targets < 1.5 ? "target" : "targets"} a swing. That is what the damage budget assumes it reaches, which is why a wide weapon carries a smaller blow than a narrow one of the same level.`,
  ]);
  notes.push([
    "CRIT WEIGHT",
    `A critical hit lands for ${stats.critMult}× — a flat trait of the ${stats.weaponClass} class, the same on every weapon in it. Your build earns the crit CHANCE; the class fixes what a crit is worth.`,
  ]);
  if (stats.variance >= 0.35) {
    notes.push([
      "WILD",
      `Its blows swing ±${percent(stats.variance)} around the average — far wider than the usual band. The mean is unchanged; the excitement is not.`,
    ]);
  } else if (stats.variance <= 0.1) {
    notes.push([
      "PRECISE",
      `Its blows land within ±${percent(stats.variance)} of the average — a metronome next to the usual spread.`,
    ]);
  }
  return notes;
}

/** How a piece of gear's shape reads. */
export function gearShapeNotes(item) {
  const stats = item.stats;
  const notes = [];
  if (stats.armorType) {
    notes.push([
      "MATERIAL",
      `${MATERIAL_NOUN[stats.armorType].toUpperCase()}, which turns ${stats.armorMult}× what the same piece would in cloth.` +
        (stats.materialGate
          ? ` Plate is deep-campaign work: none of it drops below ${stats.materialGate.toUpperCase()}.`
          : ""),
    ]);
  }
  if (stats.statRequirement) {
    notes.push([
      "ALSO DEMANDS",
      `${stats.statRequirement.amount} ${stats.statRequirement.stat.toUpperCase()} to wear — heavier materials want a bruiser inside them.`,
    ]);
  }
  if (stats.durability) {
    notes.push([
      "WEARS OUT",
      `${stats.durability} hits taken before it falls silent. It is never destroyed — a worn-out piece still hangs on you contributing nothing until a repair kit brings it back.`,
    ]);
  } else if (item.family === "gear") {
    notes.push([
      "UNBREAKABLE",
      "It carries no wear budget, so it never needs a repair kit.",
    ]);
  }
  if (stats.passive) {
    const parts = Object.entries(stats.passive).map(
      ([stat, value]) =>
        `${value > 0 ? "+" : ""}${value} ${stat.toUpperCase()}`,
    );
    notes.push([
      "PAYS IN THE BAG",
      `${list(parts)} — the effect rides in the pocket, so it works without an equip slot.`,
    ]);
  }
  if (stats.bagSlots) {
    notes.push([
      "ROOM",
      `${stats.bagSlots} extra inventory cells while it is worn, on top of the floor STRENGTH already buys you.`,
    ]);
  }
  return notes;
}

/** The shared notes: how common it is, and what a merchant pays for it. */
export function tradeNotes(item) {
  const notes = [];
  if (item.dropWeight != null && item.dropWeight !== 1) {
    notes.push([
      item.dropWeight > 1 ? "COMMON" : "SCARCE",
      `Within its venue's pool it is picked ${oneDp(item.dropWeight)}× as often as an ordinary base.`,
    ]);
  }
  if (item.material === "metal") {
    notes.push([
      "SALVAGE",
      "It melts down: the merchant pays double what an ordinary piece of its worth fetches.",
    ]);
  } else if (item.material === "precious") {
    notes.push([
      "SALVAGE",
      "Precious material — the merchant pays four times what an ordinary piece of its worth fetches.",
    ]);
  }
  return notes;
}

// ---- make quality ------------------------------------------------------------------

/** What the quality table is FOR, said before it. */
export function qualityIntro(item, quality) {
  const headline = item.family === "weapon" ? "damage" : "armor";
  return [
    `Every plain drop of this base rolls a make quality on top of the numbers above — the craftsmanship of that particular copy, stamped at the moment it drops and frozen for life. It scales the ${headline} and the wear budget together, and it leads the name: a BROKEN ${item.name} and a PERFECT ${item.name} are the same base item and not the same find.`,
    `The bands overlap on purpose, so a good CRUDE can out-swing a poor NORMAL while a PERFECT always clears a NORMAL. Which one you get depends on the level of whatever dropped it: the two odds columns below are a level-1 killer and a level-${quality.highMlvl} one, and everything between is interpolated. Craftsmanship and magic are exclusive — a magic-or-better find is always normal make.`,
  ];
}

// ---- where it comes from --------------------------------------------------------

/**
 * Every way an item reaches your hands, as one list of sentences.
 *
 * Sources arrive one per RUNG — a relic listed on four difficulties is four
 * entries — and printing them that way gives four near-identical lines a reader
 * has to diff by eye. So the per-rung kinds are folded by who they come from
 * first, and the rungs are named inside the one sentence.
 */
export function sourceLines(sources, href) {
  const perRung = new Map();
  const rest = [];
  for (const source of sources) {
    if (source.kind !== "relicTable" && source.kind !== "worldRelic") {
      rest.push(source);
      continue;
    }
    const key = `${source.kind}:${source.from.id}`;
    if (!perRung.has(key)) perRung.set(key, { ...source, rungs: [] });
    perRung.get(key).rungs.push(source.rung);
  }
  const lines = [...perRung.values()].map((source) => {
    const who = `<a href="${href(source.from.path)}">${escapeName(source.from.name)}</a>`;
    const rungs = list([...new Set(source.rungs)]);
    return source.kind === "relicTable"
      ? `${who} can roll it on ${rungs}`
      : `anything standing on ${who} can drop it on ${rungs}`;
  });
  for (const source of rest) lines.push(sourceLine(source, href));
  return [...new Set(lines)];
}

const escapeName = (name) =>
  String(name).replace(/&/g, "&amp;").replace(/</g, "&lt;");

/** One source, as a sentence fragment with its link already in it. */
export function sourceLine(source, href) {
  const who = `<a href="${href(source.from.path)}">${escapeName(source.from.name)}</a>`;
  switch (source.kind) {
    case "kill":
      return source.requiresClear
        ? `${who} always hands it over, but only once ${source.requiresClear.replace(/_/g, " ").toUpperCase()} has been beaten`
        : `${who} always hands it over`;
    case "relicTable":
      return `${who} can roll it on ${source.rung}`;
    case "worldRelic":
      return `anything standing on ${who} can drop it on ${source.rung}`;
    case "pool":
      return source.viaGrade
        ? `${who} pays it out through its ${source.viaGrade.replace(/_/g, " ").toUpperCase()} pool entry`
        : `${who} carries it in its drop pool`;
    case "scripted":
      return `${who} hands it over on the scripted opening drop, around ${pairLabel(source.atKills)} kills in`;
    case "allClear":
      return `${who} pays it as the trophy for killing every last monster on the map`;
    case "placed":
      return `one lies where the designer put it on ${who}`;
    case "merchant":
      return `${who}'s merchant may have one on the counter`;
    case "gateKey":
      return `it opens a way out of ${who}`;
    default:
      return who;
  }
}

/** A fraction as a percentage, down to the smallest odds the game actually has. */
const odds = (frac) => {
  const pct = frac * 100;
  if (pct >= 1) return `${Math.round(pct)}%`;
  if (pct >= 0.01) return `${pct.toFixed(2)}%`;
  return `${pct.toFixed(3)}%`;
};

/** The odds a named item's tier actually rolls at, in English. */
export function namedOddsNote(item, tuning) {
  if (!tuning) {
    return item.tier === "set"
      ? "A set piece never falls out of a rarity roll. It is minted only from its boss's own table, on the rungs that table lists — which is what makes completing a kit a matter of going back rather than of getting lucky."
      : null;
  }
  const lines = [
    `The ${TIER_LABEL[item.tier].toLowerCase()} tier does not drop at all below monster level ${tuning.unlockMlvl}. At that level it rolls at ${odds(tuning.rollChance)}, and every level past it adds a little more.`,
  ];
  if (tuning.bossBonus) {
    lines.push(
      `Who you kill matters more than depth does: a boss adds ${odds(tuning.bossBonus)} on top and a named elite ${odds(tuning.eliteBonus ?? 0)}, while an ordinary minion's chance is cut to ${percent(tuning.minionMult)} of the figure above. That is the whole reason the set pieces are farmed off the set pieces.`,
    );
  }
  lines.push(
    `Once a roll lands the tier, which NAME it pays is a second weighted pick across every item eligible for that slot. This one's weight is ${item.rarity}${item.rarity === 100 ? " — the catalog default, so it is neither favoured nor held back" : ""}.`,
  );
  return lines;
}
