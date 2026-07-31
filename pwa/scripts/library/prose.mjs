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
  cosmic: "sheds light",
};

/** What is left of a body that does not bleed, when a blow overwhelms it. */
const GORE_APART = {
  blood: "",
  ecto: " A blow that overwhelms it bursts it, and the goo it was holding together goes everywhere.",
  sparks:
    " A blow that overwhelms it bursts it into wire, cells and torn plate, and it smokes where it lands.",
  cosmic:
    " A blow that overwhelms it bursts it into shards of whatever it was made of, and they go out slowly.",
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
  } else if (enemy.traits.neutral) {
    sentences.push(
      enemy.traits.talks
        ? "It is not fighting anybody. Blades pass through it and its own touch is harmless, and it will talk to you — though how that conversation goes is up to you, and it can end with this one swinging."
        : "It is not fighting anybody. Blades pass through it and its own touch is harmless, until something gives it a reason to change its mind.",
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
  for (const ability of mechanics.abilities ?? []) {
    const entry = abilityProse(ability);
    if (entry) out.push(entry);
  }
  return out;
}

/**
 * One BOSS ABILITY CATALOG entry, described the same way (see
 * src/game/defs/enemies/abilities.ts). Split out from `mechanicsProse` because
 * the catalog is a LIST rather than four named fields — a new ability adds a
 * branch here and nothing else, which is the same bargain the engine makes.
 *
 * Every entry names the ability's ANSWER, because that is what a reader came
 * for: the bestiary's job is to let someone who just lost a fight work out what
 * they should have done, not to print the numbers back at them.
 */
function abilityProse(ability) {
  // What a rung-gated move is worth saying first — a reader on `hard` should
  // not be hunting for a move their difficulty never shows them.
  const gate = ability.minDifficulty
    ? ` Only from ${String(ability.minDifficulty).toUpperCase()} upward.`
    : "";
  const tell = `It roots for ${seconds(ability.windupMs)} first`;
  if (ability.id === "laser_eyes") {
    const a = ability;
    return {
      title: "LASER EYES",
      text:
        `${tell} — its eyes light, and the bearing LOCKS on wherever you were standing when they did. ` +
        `Then a beam sweeps ${Math.round(a.sweepDeg)}° across that bearing over ${seconds(a.sweepMs)}, reaching ${a.range}, ` +
        `burning for ${percent(a.damageFrac)} of its contact damage every ${seconds(a.hitIntervalMs)} you stand in it — ` +
        `and leaving the floor it crossed ON FIRE for ${seconds(a.scorchMs)}, biting ${percent(a.scorchDamageFrac)} every ${seconds(a.scorchTickMs)}. ` +
        `The sweep travels one way, edge to edge, so the answer is to move AROUND it — toward the side it has already passed — rather than across it. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "coin_cannon") {
    const a = ability;
    return {
      title: "COIN CANNON",
      text:
        `${tell} — the bearing LOCKS on where you were standing when it did. ` +
        `Then ${a.count} coins go out at once in a ${Math.round(a.spreadDeg)}° fan, reaching ${a.range} at ${a.speed} a second, ` +
        `each carrying ${percent(a.damageFrac)} of its contact damage` +
        (a.bounces > 0
          ? ` — and each one comes off up to ${count(a.bounces)} wall${a.bounces === 1 ? "" : "s"} before it dies. ` +
            `Cover is not the answer to this: the room is. Read where the walls are pointing and do not stand there.`
          : ".") +
        ` Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "bait_drop") {
    const a = ability;
    return {
      title: "PUMP AND DUMP",
      text:
        `${tell}, then scatters ${count(a.count)} piles of coins across ${a.spread} of floor around itself. ` +
        `They look exactly like loot. They are not. ` +
        `Each one lies inert for ${seconds(a.armMs)} — long enough to watch it land and walk away from — and then goes live, ` +
        `bursting for ${percent(a.damageFrac)} of its contact damage across ${a.blastRadius} if you come within ${a.triggerRadius} of it. ` +
        `They go cold on their own after ${seconds(a.lifeMs)}, so leaving them entirely alone costs you nothing at all. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "airstrike") {
    const a = ability;
    return {
      title: "ORBITAL DELIVERY",
      text:
        `${tell}, then calls ${count(a.count)} pods down onto marks scattered across ${a.spread} around YOU. ` +
        `Each falls for ${seconds(a.fallMs)} behind the same firming ground shadow a meteor drops behind — so you already know how to read it — ` +
        `and bursts for ${percent(a.damageFrac)} of its contact damage across ${a.blastRadius}` +
        (a.hatch
          ? `, then pops open and lets ${count(a.hatchCount ?? 1)} more out of the crater.`
          : ".") +
        ` The marks bracket you rather than chase you, so the question is which way to move, not whether. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
      summons: a.hatch,
    };
  }
  if (ability.id === "call_horde") {
    const a = ability;
    return {
      title: "CALL OF INCELS",
      text:
        `${tell}, and then they come — ${count(a.waves)} wave${a.waves === 1 ? "" : "s"} of followers at a dead run, ` +
        (a.waves > 1 ? `about ${seconds(a.waveGapMs)} apart, ` : "") +
        `down a lane the approach dust draws for you before the first of them is even on screen. ` +
        `They trample what they hit and put a grounded hero flat on his back. ` +
        `The answer is the one every herd in the game has: get out of the lane. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "recompile") {
    const a = ability;
    return {
      title: "RECOMPILE",
      text:
        `Once it is hurt, ${tell.charAt(0).toLowerCase()}${tell.slice(1)}, then raises a node ${a.distance} BEHIND itself — ` +
        `and starts pulling itself back together along a tether you can see, at ${percent(a.healFracPerSec)} of its full health every second. ` +
        `The node stands for ${seconds(a.lifeMs)} and it will raise another when it can. ` +
        `Do not race the bar: break the node and the healing stops. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
      summons: a.defId,
    };
  }
  if (ability.id === "lockdown") {
    const a = ability;
    return {
      title: "LOCKDOWN",
      text:
        `${tell}, then drops blast shutters in a ring ${a.radius} around YOU — ` +
        `${a.segments} segments with one ${Math.round(a.gapDeg)}° gap in them, and the gap is somewhere different every time. ` +
        `They are solid: they stop your shots and its own alike, and you cannot jump them. ` +
        `They pull back up after ${seconds(a.durationMs)}. ` +
        `You are not trapped, you are cornered — take the fight in there, or spend the time finding the way out and give up the ground. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "flag_plant") {
    const a = ability;
    return {
      title: "FLAG PLANT",
      text:
        `${tell}, then drives its flag into the ground ${a.distance} in front of it. ` +
        `The flag stands for ${seconds(a.lifeMs)} and calls the dead up out of the ground the whole time, and it will plant another the moment this one is gone. ` +
        `It is a body like any other: break the flag and the tap stops. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
      summons: a.defId,
    };
  }

  // ── THE ELITE TIER ────────────────────────────────────────────────────────
  // The same bargain as above, one branch apiece. These read shorter than the
  // boss entries on purpose: a boss's set piece is a fight the reader came to
  // this page to solve, while an elite's move is one of two dozen they will
  // meet in an afternoon, and the answer to each is a sentence.
  if (ability.id === "orbit_guard") {
    const a = ability;
    return {
      title: "ORBIT GUARD",
      text:
        `${tell}, then ${count(a.count)} motes come up and turn around it at ${a.radius} out, for ${seconds(a.durationMs)}. ` +
        `Anything the ring sweeps through takes ${percent(a.damageFrac)} of its contact damage, no more than once every ${seconds(a.hitIntervalMs)} however many motes pass at once. ` +
        `The ring does not chase — it only means the last stride into contact costs something. Time the gaps, or fight it from outside. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "seeker_volley") {
    const a = ability;
    return {
      title: "SEEKER VOLLEY",
      text:
        `${tell} — the bearing LOCKS on where you were standing — then ${count(a.count)} bolts leave in a ${Math.round(a.spreadDeg)}° fan, reaching ${a.range} at ${a.speed} a second, ` +
        `each carrying ${percent(a.damageFrac)} of its contact damage. ` +
        `They STEER after you, which is what makes them different from every other shot in the game: standing still does not work and neither does a sidestep. ` +
        `They turn slowly enough to be outrun, and a wall between you and them ends it. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "ember_trail") {
    const a = ability;
    return {
      title: "EMBER TRAIL",
      text:
        `${tell}, and then for ${seconds(a.durationMs)} it leaves burning ground behind it as it hunts — a patch every ${seconds(a.dropMs)}, ` +
        `each ${a.radius} across, alight for ${seconds(a.patchMs)} and biting ${percent(a.damageFrac)} of its contact damage every ${seconds(a.tickMs)} you stand in it. ` +
        `It is not aimed anywhere: it paints whatever path YOU walk it down. Kite it in circles and the room fills up; kite it in a straight line and it costs you nothing. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "shock_pulse") {
    const a = ability;
    return {
      title: "SHOCK PULSE",
      text:
        `${tell}, then throws a ring ${a.radius} out from itself: ${percent(a.damageFrac)} of its contact damage` +
        (a.push > 0
          ? `, and a shove hard enough to put you back out at range. The shove is the point rather than the damage — it is answering the habit of standing on top of it and trading. `
          : `. `) +
        `A jump clears it, exactly like a slam. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "blink_strike") {
    const a = ability;
    return {
      title: "BLINK STRIKE",
      text:
        `${tell} — the longest tell it has — and then it is not where it was. It arrives ${a.arriveDistance} from where you were standing WHEN THE TELL STARTED, already swinging for ${percent(a.damageFrac)} of its contact damage across ${a.strikeRadius}. ` +
        `It will do this from as far out as ${a.range}. Because the spot is fixed at the tell rather than at the arrival, a hero who keeps moving is met by a mob swinging at empty floor. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "rally_cry") {
    const a = ability;
    return {
      title: "RALLY CRY",
      text:
        `${tell}, and then it shouts. Everything hostile within ${a.radius} comes at you ${percent(a.speedMult - 1)} faster and hits ${percent(a.damageMult - 1)} harder for ${seconds(a.durationMs)} — ` +
        `and wakes up, if it was not already. ` +
        `It does nothing to you at all, which is exactly why it is dangerous: the answer is not a dodge, it is deciding to kill the one doing the shouting first. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "snare_field") {
    const a = ability;
    return {
      title: "SNARE FIELD",
      text:
        `${tell}, then lays a field ${a.radius} across on the ground where you were standing, from as far out as ${a.range}. ` +
        `It lies there for ${seconds(a.durationMs)} and cuts your pace to ${percent(a.slowFactor)} while you are in it. ` +
        `It deals NO damage whatsoever — its whole strength is what else is on the field while it has hold of you. Walk out of it; a jump clears it too. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "siphon_tether") {
    const a = ability;
    return {
      title: "SIPHON TETHER",
      text:
        `${tell}, then opens a drain onto you and holds still to drink: ${percent(a.damageFrac)} of its contact damage every ${seconds(a.tickMs)} for up to ${seconds(a.durationMs)}, ` +
        `and it keeps ${percent(a.healFrac)} of everything it takes as health. ` +
        `The reach is ${a.range} and the line is checked every moment it holds — step out of range or put something solid between you and it and the tether drops on the spot. ` +
        `It cannot move while it drinks, so it is also a stationary target for as long as you let it. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "ward_shield") {
    const a = ability;
    return {
      title: "WARD SHIELD",
      text:
        `Once it has been hurt, ${tell.charAt(0).toLowerCase() + tell.slice(1)} and raises a shell over itself worth ${percent(a.poolFrac)} of its full health. ` +
        `The shell EATS damage until that budget is spent, and whatever overflows still lands — so a saved cooldown breaks it AND hurts, while chipping at it merely feeds it. ` +
        `It fades on its own after ${seconds(a.durationMs)} if you leave it alone. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  if (ability.id === "quake_line") {
    const a = ability;
    return {
      title: "QUAKE LINE",
      text:
        `${tell} — the bearing LOCKS — then the ground splits away from it along that line: ${count(a.count)} fissures, one every ${a.spacing}, ` +
        `opening ${seconds(a.stepMs)} apart in order, each biting ${percent(a.damageFrac)} of its contact damage within ${a.radius}. ` +
        `Nothing travels — it stays where it is and the floor does the walking. A step SIDEWAYS is the whole answer, and the further out you are the longer you have to take it. ` +
        `Once every ${seconds(a.cooldownMs)}.${gate}`,
    };
  }
  return null;
}

/** The one-line notes that sit beside the stat block. */
export function traitNotes(enemy) {
  const notes = [];
  const t = enemy.traits;
  if (t.structure)
    notes.push([
      "STRUCTURE",
      "Not a creature at all — a thing that was put here, standing where it was driven in. It has no voice, it never comes for you, and it is worth no experience. It is only in the way, and it can be broken.",
    ]);
  if (t.locomotion === "float")
    notes.push([
      "HOVERS",
      "Has no legs and never touches the floor — it drifts over it, casting its shadow down.",
    ]);
  if (t.locomotion === "wheels")
    notes.push([
      "ROLLS",
      "Gets about on wheels or treads rather than on legs.",
    ]);
  if (t.phasing)
    notes.push(["PHASING", "Walks through walls and hunts you through them."]);
  if (t.apparition)
    notes.push([
      "APPARITION",
      "Cannot be hurt, deals no damage, counts toward nothing.",
    ]);
  if (t.neutral)
    notes.push([
      "NEUTRAL",
      t.talks
        ? "A bystander, not a foe: unhittable and harmless, and it holds a conversation. Provoke it and it becomes an ordinary monster for the rest of the run."
        : "A bystander, not a foe: unhittable and harmless until something provokes it, after which it is an ordinary monster.",
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
  notes.push([
    "WHEN STRUCK",
    `It ${GORE_NOUN[enemy.gore]}.` +
      // What is LEFT of it, which only a body that bleeds has an answer to.
      (enemy.anatomy === "humanoid"
        ? " A blow that overwhelms it bursts it, and there is a face among what lands."
        : enemy.anatomy === "beast"
          ? " A blow that overwhelms it bursts it into meat and bone — no face in it, whatever it was."
          : GORE_APART[enemy.gore]),
  ]);
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
