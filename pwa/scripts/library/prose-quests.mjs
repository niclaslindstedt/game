// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ERRANDS' sentences. An objective is a row of ids and counts; what makes a
// page worth reading is the sentence around it — what the job actually is, who
// is standing there asking, what it comes to at the rung you are on, and
// whether anything else opens once it is handed in.
//
// Every clause here is assembled out of facts the model got back from the
// catalogs and the engine (./model-quests.mjs); none of it invents a number,
// and none of it retells the errand's own authored paragraph.
//
// THE OBJECTIVE WORDING IS DELIBERATELY NOT THE GAME'S. The tracker's own
// `objectiveLine` (pwa/src/game/quest-text.ts) writes a TALLY — "MOON RATS
// 3/8" — because it is read mid-fight, at a glance, over the top of the fight.
// A page has no run behind it and no tally to show, so it words the same
// objective as a sentence with the thing it names linked. Sharing one function
// would mean one of the two surfaces reading badly, and it would drag a module
// off the app's startup path into a build script.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const percent = (frac) => `${Math.round(frac * 100)}%`;

/**
 * WHAT ONE OBJECTIVE ASKS, as a phrase — no subject, so a caller can put it
 * after "It wants" or "You are asked to". The names come back unlinked; the
 * renderer links them from the model's own entries rather than from this
 * string, because a helper that emitted markup could not be used in a `<title>`
 * or a meta description.
 */
export function objectivePhrase(objective) {
  switch (objective.kind) {
    case "kill":
      return `${plural(objective.count, "kill")} of ${objective.enemy?.name ?? "the horde"}`;
    case "killNamed":
      return `${objective.enemy?.name ?? "one named foe"} put down`;
    case "collect":
      return `${plural(objective.count, objective.item?.name ?? "piece")} brought back`;
    default:
      // The game's own word for a finished escort (`objectiveLine` prints
      // DELIVERED), and the only honest one: where they are being walked TO is
      // a world coordinate, which is the one fact this section cannot publish.
      return `${objective.escort?.name ?? "somebody"} delivered in one piece`;
  }
}

/** The one word an errand's SHAPE is chipped as. */
export const KIND_LABEL = {
  kill: "CULL",
  killNamed: "HUNT",
  collect: "FETCH",
  escort: "ESCORT",
};

/**
 * What this errand is, in a sentence or two, before any table.
 *
 * It leads with the ask and the person, because those are the two things a
 * reader searching an errand's name is trying to place. What it deliberately
 * does NOT do is paraphrase the errand's own `lore` sitting directly beneath
 * it — a page saying the same thing twice in two voices reads as filler, which
 * is the same restraint the powers' opening line keeps.
 */
export function questLead(quest) {
  const lines = [];
  const asks = list(quest.objectives.map(objectivePhrase));

  lines.push(
    `${quest.name} is an errand ${quest.giver.name} hands out${
      quest.venue ? ` on ${quest.venue.name}` : ""
    }, and it wants ${asks}.`,
  );

  if (quest.objectives.length > 1) {
    lines.push(
      "Every part of it counts: the errand is not done, and cannot be handed in, until all of them are.",
    );
  }

  const escort = quest.objectives.find((o) => o.kind === "escort")?.escort;
  if (escort) {
    lines.push(
      `An escort is the one errand shape that can FAIL rather than merely stay open — ${escort.name} is a body on the field the horde can reach, and if they fall the errand goes with them.`,
    );
  }

  if (quest.requires.length > 0) {
    lines.push(
      `It is not offered cold: ${list(quest.requires.map((prior) => prior.name))} ${
        quest.requires.length === 1 ? "has" : "have"
      } to be handed in first, on this same map and to this same person.`,
    );
  }

  if (quest.minDifficulty) {
    lines.push(
      `And it only appears from ${quest.minDifficulty.name} up — a run on a gentler rung never sees it offered.`,
    );
  }

  return lines;
}

/**
 * The notes under the objectives: the rules that are true of the ASK but are
 * not one of its counts.
 */
export function questNotes(quest, tuning) {
  const notes = [];
  const collected = quest.objectives
    .map((objective) => objective.item)
    .filter(Boolean);
  const escorts = quest.objectives
    .map((objective) => objective.escort)
    .filter(Boolean);

  // WHO carries a piece and at what odds is the table directly above this, so
  // the note says the two things a table cannot: what is already on the floor
  // before a single kill, and the pity floor that stops a coin flip from being
  // the reason an errand cannot be finished.
  for (const item of collected) {
    notes.push([
      item.name,
      `${
        item.placed > 0
          ? `${plural(item.placed, "piece")} of it ${item.placed === 1 ? "is" : "are"} already lying on the floor, found rather than fought for. `
          : ""
      }${
        item.carriers.length > 0
          ? `A long dry run off the horde is not a dead end: after ${tuning.dropPity} kills of a carrier with nothing to show for it, the next one drops for certain.`
          : "Nothing on the map carries one, so what is lying there is the whole supply."
      }`,
    ]);
  }

  if (collected.length > 0) {
    notes.push([
      "ONLY WHILE IT IS LIVE",
      "the pieces exist for the errand and nothing else — they drop once it has been accepted and the tally is still short, and they are handed over at the turn-in.",
    ]);
  }

  for (const escort of escorts) {
    notes.push([
      escort.name,
      `${escort.hp} health, and takes ${percent(
        tuning.escortDamageMult,
      )} of what a monster's touch would land on you. They walk at ${
        tuning.escortSpeed
      } px/s — a shade under your own — and stop rather than follow once you are more than ${
        tuning.escortLeashDistance
      } px ahead.`,
    ]);
  }

  if (escorts.length > 0) {
    notes.push([
      "WHY IT IS HARD",
      "nothing on the field is retargeted onto them: the horde reaches an escort because the escort follows YOU, which is what makes the fight want you to kite and the errand want you not to.",
    ]);
  }

  const named = quest.objectives.find((o) => o.kind === "killNamed")?.enemy;
  if (named) {
    notes.push([
      "ONE BODY",
      `${named.name} is a set piece rather than a breed, so the tracker reads a name instead of a tally — there is exactly one of them to find.`,
    ]);
  }

  if (quest.objectives.some((o) => o.kind === "kill")) {
    notes.push([
      "ANY KILL COUNTS",
      "yours, a companion's, a powerup's — the errand is thinning them out, not proving it was you.",
    ]);
  }

  return notes;
}

/**
 * THE REWARD, IN PROSE — and the paragraph exists to explain the one number on
 * the page that is not what it looks like.
 *
 * Every other figure in the library is a figure; an errand's XP is a SHARE of a
 * level bar, so the table beside this says what it comes to for the hero the
 * ladder intends to be standing here rather than what was authored. A reader
 * who takes the same errand ten levels over that is paid ten levels' worth, and
 * the sentence has to say so or the table quietly becomes a promise.
 */
export function rewardProse(quest) {
  const reward = quest.reward;
  if (!reward) return ["It pays nothing but the next link of its chain."];
  const lines = [];
  const parts = [
    reward.xpShare ? "experience" : "",
    reward.coins ? `${reward.coins} coins` : "",
    reward.loot ? plural(reward.loot.count, "rolled piece") : "",
    reward.uniques.length > 0 ? list(reward.uniques.map((u) => u.name)) : "",
    reward.abilities.length > 0
      ? list(reward.abilities.map((a) => a.name))
      : "",
  ].filter(Boolean);
  lines.push(`Handing it in pays ${list(parts)}.`);

  if (reward.xpShare) {
    lines.push(
      `The experience is authored as a SHARE of your own level bar — ${reward.xpShare} of one — rather than as a figure, so the same errand is worth the same fraction of a level on the first map and the last. The table below is what that comes to for a hero at the level this venue is tuned for; take it later and it pays more.`,
    );
  }
  if (reward.loot) {
    lines.push(
      `The rolled ${reward.loot.count === 1 ? "piece goes" : "pieces go"} through the ordinary drop pipeline at your own level${
        reward.loot.slot ? `, held to the ${reward.loot.slot} slot` : ""
      }${
        reward.loot.tierBonus
          ? `, with ${plural(reward.loot.tierBonus, "tier")} of skew on the rarity roll — the same skew the merchant's stall takes`
          : ""
      }. A quest is a second CALLER of the loot system, never a second loot system, so what it hands over is the same kind of thing a monster drops.`,
    );
  }
  if (reward.uniques.length > 0) {
    lines.push(
      `${list(reward.uniques.map((u) => u.name))} ${
        reward.uniques.length === 1 ? "is" : "are"
      } handed over WHOLE rather than rolled for — a named relic an author picked, which is the one payout in the game that is not a roll.`,
    );
  }
  return lines;
}

/**
 * The chain's RULE, once. WHICH errands are on either side of this one is
 * stated by the page as links a reader can click, so repeating them in prose
 * would be the same sentence twice, the second time unclickable.
 */
export function chainProse(quest) {
  if (quest.requires.length === 0 && quest.unlocks.length === 0) return [];
  return [
    "A chain never crosses a map or a run: the quest log belongs to the run you are in rather than to the hero, so every link of one is taken, done and handed in on a single visit, from the same person.",
  ];
}

// ---- the person ------------------------------------------------------------------

/**
 * Who this is, and why they are standing in a place everything else is trying
 * to kill you in. The horde's ward is the fact a reader would otherwise
 * misread — a civilian in the middle of a level looks like a body waiting to
 * happen, and this one cannot be touched at all.
 */
export function giverLead(giver, tuning) {
  const lines = [];
  lines.push(
    `${giver.name} stands${giver.venue ? ` on ${giver.venue.name}` : ""} and hands out ${plural(
      giver.quests.length,
      "errand",
    )}: ${list(giver.quests.map((quest) => quest.name))}.`,
  );
  lines.push(
    `Nothing can hurt them, and nothing gets to try — the horde is pushed back out of a ${tuning.repelRadius} px ward around them, exactly as it is around the merchant. An errand you have to clear a pack off to accept is a pack, not an errand.`,
  );
  lines.push(
    `Walk within ${tuning.talkRadius} px and they open the conversation themselves, once. A person with more than one thing to say opens on the whole list rather than handing them out one at a time.`,
  );
  return lines;
}

// ---- the heads --------------------------------------------------------------------

const clamp = (text) =>
  text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;

/** The `<meta name="description">` for an errand's page. */
export function questDescription(quest) {
  return clamp(
    `${quest.name} in ${TITLE}: the errand ${quest.giver.name} hands out${
      quest.venue ? ` on ${quest.venue.name}` : ""
    } — what it asks, what it pays, and what it opens.`,
  );
}

/** The `<meta name="description">` for a giver's page. */
export function giverDescription(giver) {
  return clamp(
    `${giver.name} in ${TITLE}: who they are${
      giver.venue ? `, where they stand on ${giver.venue.name}` : ""
    }, and every one of the ${giver.quests.length} errands they hand out.`,
  );
}
