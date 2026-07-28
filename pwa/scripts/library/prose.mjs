// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The sentences. A generated reference page fails in one specific way — it
// comes out correct and lifeless, every field present and nobody wanting to
// read it — and this module is where that is fixed. It turns the page model's
// facts into English: what a monster IS, how it comes at you, and what its
// tricks actually do to you.
//
// Every sentence is assembled from facts the model got out of the engine. None
// of it invents a number, and none of it states anything the catalogs do not.

import { TITLE } from "./html.mjs";

const ROLE_NOUN = {
  minion: "one of the rank and file",
  elite: "a named elite",
  boss: "a boss",
};

const GORE_NOUN = {
  blood: "bleeds",
  ecto: "comes apart in ectoplasm",
  sparks: "throws sparks",
};

/** A count of enemies, phrased. */
const count = (n) => (n === 1 ? "one" : `${n}`);

const seconds = (ms) => {
  const s = ms / 1000;
  return Number.isInteger(s) ? `${s}s` : `${s.toFixed(1)}s`;
};

const percent = (frac) => `${Math.round(frac * 100)}%`;

/** Join a list into "a, b and c". */
export function list(items) {
  const parts = items.filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * The opening line — what this thing is, and where it lives. It leads with what
 * the reader came for (a boss's name and its venue), not with a metadata table.
 */
export function lead(enemy) {
  const where = enemy.home
    ? `on ${enemy.home.name}`
    : "somewhere off the campaign path";
  const sentences = [];

  if (enemy.rarity === "unique") {
    sentences.push(
      `${enemy.name} is a one-of-a-kind monster that turns up ${where} on a fraction of runs, alone, and never twice.`,
    );
  } else if (enemy.rarity === "rare") {
    const pack = enemy.traits.pack;
    const size = pack
      ? pack[0] === pack[1]
        ? `, ${count(pack[0])} at a time`
        : `, anywhere from ${pack[0]} to ${pack[1]} at a time`
      : ", alone";
    sentences.push(
      `${enemy.name} is a rare oddity that turns up ${where} on most runs${size}.`,
    );
  } else if (enemy.hellborn) {
    sentences.push(
      `${enemy.name} does not live ${where} at all. It is dragged through a hellgate — the rifts the horde tears open once a rampage runs hot enough — and it fights at elite weight.`,
    );
  } else {
    sentences.push(
      `${enemy.name} is ${ROLE_NOUN[enemy.role]} ${where}${
        enemy.home?.foes ? `, a place of ${enemy.home.foes.toLowerCase()}` : ""
      }.`,
    );
  }

  if (enemy.traits.apparition) {
    sentences.push(
      "It cannot be fought. Nothing touches it and it touches nothing — it comes to say its piece and then walks away and dissolves.",
    );
  } else if (enemy.traits.phasing) {
    sentences.push(
      "It senses you through walls and drifts straight through them; the dead do not respect stone.",
    );
  }

  if (enemy.traits.ranged) {
    sentences.push(
      enemy.traits.ranged.takesCover
        ? `It shoots from ${enemy.traits.ranged.range} away and ducks behind cover between shots.`
        : `It shoots from up to ${enemy.traits.ranged.range} away rather than closing.`,
    );
  }

  if (enemy.guardedBy.length > 0) {
    sentences.push(
      `Blows bounce off it while ${list(enemy.guardedBy.map((g) => g.name))} still ${enemy.guardedBy.length === 1 ? "stands" : "stand"}.`,
    );
  }

  return sentences;
}

/** The 155-ish characters a search result shows under the title. */
export function metaDescription(enemy) {
  const where = enemy.home ? ` on ${enemy.home.name}` : "";
  const role =
    enemy.rarity === "unique"
      ? "One-of-a-kind monster"
      : enemy.rarity === "rare"
        ? "Rare monster"
        : enemy.role === "boss"
          ? "Boss"
          : enemy.role === "elite"
            ? "Elite"
            : "Monster";
  const rung = enemy.sightings[0]?.rungs?.[0];
  const stats = rung
    ? ` Level ${levelLabel(rung)} at ${hpLabel(rung)} health on ${rung.name.toLowerCase()}.`
    : "";
  // `distinctName`, not `name` — two monsters that share a display name would
  // otherwise share this sentence too, and a byte-identical description on two
  // URLs is the strongest duplicate signal a site can send about itself.
  const text = `${role}${where} in ${TITLE}: ${enemy.distinctName}. Health, damage, where it spawns and what it drops.${stats}`;
  return text.length <= 160 ? text : text.slice(0, 157).trimEnd() + "…";
}

const range = (pair) =>
  pair[0] === pair[1] ? `${pair[0]}` : `${pair[0]}–${pair[1]}`;
export const levelLabel = (rung) => range(rung.level);
export const hpLabel = (rung) => range(rung.hp);
export const contactLabel = (rung) => range(rung.contact);
export const xpLabel = (rung) => range(rung.xp);

/** How this venue puts the monster in front of you. */
export function sightingProse(enemy, sighting) {
  const lines = [];
  const totals = sighting.entries.reduce((acc, entry) => {
    acc[entry.kind] = (acc[entry.kind] ?? 0) + (entry.count ?? 0);
    return acc;
  }, {});
  const has = (kind) => sighting.kinds.includes(kind);

  if (has("pinned")) {
    lines.push(
      `It is placed by hand on ${sighting.venue.name} and waits at its post until you come close.`,
    );
  }
  if (has("placed")) {
    lines.push(
      `${totals.placed ? count(totals.placed) : "Some"} are scattered across ${sighting.venue.name} at the start of the run, sleeping until you get near.`,
    );
  }
  if (has("spawner")) {
    lines.push(
      `Spawn points on ${sighting.venue.name} release ${totals.spawner ? count(totals.spawner) : "a stream"} of them, a few at a time, until the point drains empty.`,
    );
  }
  if (has("hellgate")) {
    lines.push(
      "It only reaches the board through a hellgate, which opens once the horde's rampage runs hot enough.",
    );
  }
  if (has("pack")) {
    lines.push(
      `It sleeps in a placed pack that wakes the moment you walk into it${totals.pack ? `, ${count(totals.pack)} of them at once` : ""}.`,
    );
  }
  if (has("wave")) {
    lines.push("It streams in with the ambient horde as the run wears on.");
  }
  if (has("rare")) {
    lines.push(
      `${sighting.venue.name} rolls one rare monster from a short list on most runs, and this is one of the names on it.`,
    );
  }
  if (has("unique")) {
    lines.push(
      `It is a candidate for ${sighting.venue.name}'s once-a-run unique roll, so most runs never see it.`,
    );
  }
  if (has("vanguard")) {
    lines.push(
      "It is the scripted first foe — the one that rushes ahead of the pack and makes the hero draw his weapon.",
    );
  }
  if (enemy.summonedBy.length > 0) {
    lines.push(
      `${list(enemy.summonedBy.map((s) => s.name))} also calls it out of the ground mid-fight.`,
    );
  }
  return lines;
}

/** The set-piece moves, described as what they DO rather than as a field dump. */
export function mechanicsProse(mechanics) {
  const out = [];
  if (mechanics.charge) {
    const m = mechanics.charge;
    out.push({
      title: "CHARGE",
      text: `Inside ${m.range} it locks its bearing, roots for ${seconds(m.windupMs)}, then dashes ${Math.round(m.range * 1.3)} along that line at ${m.speedMult}× speed with its blows carrying ${m.damageMult ?? 1.5}× damage. The bearing locks at the START of the windup, so a sidestep beats it. Once every ${seconds(m.cooldownMs)}.`,
    });
  }
  if (mechanics.slam) {
    const m = mechanics.slam;
    out.push({
      title: "SLAM",
      text: `With you inside ${m.radius} it roots for ${seconds(m.windupMs)} and then smashes the ground for ${percent(m.damageFrac)} of its contact damage to everything standing in that circle. A jump sails clean over it. Once every ${seconds(m.cooldownMs)}.`,
    });
  }
  if (mechanics.enrage) {
    const m = mechanics.enrage;
    out.push({
      title: "ENRAGE",
      text: `Below ${percent(m.belowHpFrac)} health it fights like a cornered animal for the rest of the fight — ${m.speedMult}× speed and ${m.damageMult}× damage, permanently.`,
    });
  }
  if (mechanics.summon) {
    const m = mechanics.summon;
    out.push({
      title: "SUMMON",
      text: `Every ${seconds(m.cooldownMs)} it calls ${count(m.count)} more out of the ground, up to ${m.maxAlive} of its own summons alive at once. They arrive outside the level's wave budget, so they are extra rather than borrowed.`,
      summons: m.defId,
    });
  }
  return out;
}

/** The one-line notes that sit beside the stat block. */
export function traitNotes(enemy) {
  const notes = [];
  const t = enemy.traits;
  if (t.phasing)
    notes.push(["PHASING", "Walks through walls and hunts you through them."]);
  if (t.apparition)
    notes.push([
      "APPARITION",
      "Cannot be hurt, deals no damage, counts toward nothing.",
    ]);
  if (t.flees)
    notes.push([
      "COWARD",
      t.flees.belowHpFrac
        ? `Bolts at ${percent(t.flees.belowHpFrac)} health rather than dying, tearing open a rift where it stood.`
        : "Beaten to nothing it escapes rather than dying, tearing open a rift where it stood.",
    ]);
  if (t.spareable)
    notes.push([
      "SPAREABLE",
      `Beaten, it kneels instead of dying and the run pauses for the verdict. Spared, ${t.spareable.name} joins the party.`,
    ]);
  if (enemy.hellborn)
    notes.push([
      "HELLBORN",
      "Comes through a rift, and is the one kill a rampage pays for instead of taxing.",
    ]);
  if (enemy.base.idle === "work")
    notes.push([
      "ON SHIFT",
      "Potters about its post until something wakes it.",
    ]);
  if (enemy.base.leashRadius)
    notes.push([
      "LEASHED",
      `Never strays further than ${enemy.base.leashRadius} from where it stands.`,
    ]);
  if (enemy.base.returnSpeedFactor)
    notes.push([
      "GOING HOME",
      `Drifts back to its post at ${percent(enemy.base.returnSpeedFactor)} of its speed.`,
    ]);
  if (enemy.base.rushSpeed)
    notes.push([
      "THE ENTRANCE",
      `Closes at ${enemy.base.rushSpeed}/s until it has said its piece, then fights at its own pace.`,
    ]);
  if (enemy.base.xp !== null)
    notes.push([
      "FLAT REWARD",
      `Pays exactly ${enemy.base.xp} experience however high its level runs.`,
    ]);
  if (enemy.base.xpMobMult !== null)
    notes.push([
      "PART OF A WHOLE",
      `Pays ${enemy.base.xpMobMult}× a monster of its level rather than a full set-piece reward — the fight it belongs to is priced as one.`,
    ]);
  if (enemy.rarityTuning)
    notes.push([
      enemy.rarity === "unique" ? "UNIQUE MONSTER" : "RARE MONSTER",
      `Fields ${enemy.rarityTuning.hpMult}× the health, ${enemy.rarityTuning.damageMult}× the damage and pays ${enemy.rarityTuning.xpMult}× the experience of an ordinary monster of its kind.`,
    ]);
  notes.push(["WHEN STRUCK", `It ${GORE_NOUN[enemy.gore]}.`]);
  return notes;
}

/** The drop notes — what a kill actually hands over. */
export function dropProse(enemy) {
  const drops = enemy.drops;
  if (!drops) return [];
  const lines = [];
  if (drops.counts) {
    const pieces = [];
    if (drops.counts.weapons)
      pieces.push(
        `${count(drops.counts.weapons)} weapon${drops.counts.weapons === 1 ? "" : "s"}`,
      );
    if (drops.counts.gear)
      pieces.push(
        `${count(drops.counts.gear)} piece${drops.counts.gear === 1 ? "" : "s"} of gear`,
      );
    if (drops.counts.medkits)
      pieces.push(
        `${count(drops.counts.medkits)} medkit${drops.counts.medkits === 1 ? "" : "s"}`,
      );
    if (drops.counts.repairs)
      pieces.push(
        `${count(drops.counts.repairs)} repair kit${drops.counts.repairs === 1 ? "" : "s"}`,
      );
    if (drops.counts.xpArrows)
      pieces.push(
        `${count(drops.counts.xpArrows)} golden arrow${drops.counts.xpArrows === 1 ? "" : "s"}`,
      );
    if (pieces.length > 0) lines.push(`Every kill pays ${list(pieces)}.`);
    if (drops.counts.tierBonus)
      lines.push(
        `Its drops roll ${percent(drops.counts.tierBonus)} better on the rarity ladder than the level's ordinary loot.`,
      );
  }
  if (drops.dropProfile) {
    const p = drops.dropProfile;
    lines.push(
      `A heavy hitter rather than a set piece: ${list([
        p.dropBonus
          ? `${percent(p.dropBonus)} more likely to drop at all`
          : null,
        p.tierBonus
          ? `${percent(p.tierBonus)} better on the rarity roll when it does`
          : null,
      ])}.`,
    );
  }
  if (drops.tierDrops.length > 0) {
    lines.push(
      `Guaranteed pieces by rarity: ${list(
        drops.tierDrops.map(([tier, chance]) =>
          chance >= 1
            ? `${Math.floor(chance)} ${tier}${chance % 1 ? `, and a ${percent(chance % 1)} chance of one more` : ""}`
            : `a ${percent(chance)} chance of a ${tier}`,
        ),
      )}. A rarity the monster's own level has not unlocked yet is skipped, so the same fight pays better on a harder rung.`,
    );
  }
  return lines;
}
