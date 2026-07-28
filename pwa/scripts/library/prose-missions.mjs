// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MISSION GUIDE's sentences. A level is the one page a reader is most
// likely to arrive at cold — they searched the venue's name — so it has to
// open by telling them where they are, not by listing its dimensions.

import { TITLE } from "./html.mjs";
import { list } from "./prose.mjs";

const OBJECTIVE_NOUN = {
  killBoss: "ends when its boss goes down",
  clearAll: "ends when nothing is left standing",
  reachExit: "ends when you reach its exit",
};

/**
 * How a monster reaches the board, phrased for a group rather than a row.
 *
 * The first cut put one of these beside every NAME, and every elite on the page
 * read "AT ITS POST" — a column of identical grey text shouting over the names
 * a reader came for. The information is real but it is not per-monster, so it
 * is said ONCE, in the group's own sentence.
 */
const PLACEMENT_LABEL = {
  pinned: "waiting at a post",
  placed: "already scattered about when you land",
  spawner: "streaming out of spawn points",
  hellgate: "dragged in through a hellgate",
  pack: "asleep in packs until you walk into one",
  wave: "riding the ambient horde",
  rare: "on the once-a-run rare roll",
  unique: "on the once-a-run unique roll",
  vanguard: "as the scripted first foe",
};

const seconds = (ms) => `${Math.round(ms / 1000)}s`;

/** Every distinct way a group of monsters arrives, as one clause. */
export function placementClause(entries) {
  const kinds = new Set(entries.flatMap((entry) => entry.kinds));
  const labels = Object.keys(PLACEMENT_LABEL)
    .filter((kind) => kinds.has(kind))
    .map((kind) => PLACEMENT_LABEL[kind]);
  return labels.length > 0 ? list(labels) : "";
}

/** The opening paragraph — where you are and what ends it. */
export function missionLead(mission) {
  const lines = [];
  const ends =
    OBJECTIVE_NOUN[mission.objective?.type] ?? "ends on its own terms";
  const bosses = mission.boss.map((boss) => boss.name);

  lines.push(
    mission.secret
      ? `${mission.name} is not on the campaign's road. It is reached another way, and it ${ends}.`
      : `${mission.name} is the ${ordinal(mission.index)} venue of the campaign, and it ${ends}${
          bosses.length > 0 ? ` — ${list(bosses)}` : ""
        }.`,
  );

  if (mission.foes) {
    lines.push(
      `The run calls the things here ${mission.foes}: ${mission.roster.length} kinds of them, from the rank and file up to whatever is guarding the far end.`,
    );
  }

  if (mission.hasSpawners && !mission.hasHorde) {
    lines.push(
      "Its pressure comes from spawn points rather than an endless stream, so the map can genuinely be cleared and walked rather than farmed from a standstill.",
    );
  } else if (mission.hasHorde) {
    lines.push(
      "Its pressure is an ambient horde on a timer, thickening as the run wears on, so standing still is never the plan.",
    );
  }

  if (mission.exitTo) {
    lines.push(
      `Its exit leads back to ${mission.exitTo.name} rather than onward, which is what makes it a farm rather than a stop on the road.`,
    );
  }

  return lines;
}

function ordinal(n) {
  const words = [
    "",
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
  ];
  return words[n] ?? `${n}th`;
}

/** The 155-ish characters a search result shows under the title. */
export function missionDescription(mission) {
  const boss = mission.boss[0] ? ` Guarded by ${mission.boss[0].name}.` : "";
  const text = `${mission.name} in ${TITLE}: every monster, the loot pool, the powers it hands out, and the mob levels it fields on each difficulty.${boss}`;
  return text.length <= 160 ? text : `${text.slice(0, 157).trimEnd()}…`;
}

/** The stat-block notes about the venue itself. */
export function venueNotes(mission) {
  const notes = [];
  notes.push([
    "SIZE",
    `${mission.size.width} by ${mission.size.height} world units — about ${Math.round(mission.size.width / 422)} phone screens across.`,
  ]);
  notes.push([
    "GRAVITY",
    mission.gravity < 300
      ? `${mission.gravity} — low enough that a jump hangs, and clears things it has no business clearing.`
      : `${mission.gravity} — a jump here comes back down about when you expect it to.`,
  ]);
  notes.push([
    "SUIT",
    mission.suited
      ? "The hero arrives in the EVA suit, because outside it he would not last."
      : "The hero arrives in plain clothes — the air here is breathable, so the suit stays stowed.",
  ]);
  if (mission.safeZones > 0) {
    notes.push([
      "BREATHING ROOM",
      `${mission.safeZones} ${mission.safeZones === 1 ? "pocket" : "pockets"} where nothing spawns and the wandering horde is pushed back out — a genuine rest, not just a quiet corner.`,
    ]);
  }
  if (mission.quietZones > 0) {
    notes.push([
      "DEAD AREAS",
      `${mission.quietZones} ${mission.quietZones === 1 ? "stretch" : "stretches"} the ambient horde never spawns into. Authored content still lives there, which is the reward for going off the line.`,
    ]);
  }
  if (mission.chests > 0) {
    notes.push([
      "CHESTS",
      `${mission.chests} hand-placed containers. Your weapon smashes one like a crate, but the haul is richer and guaranteed.`,
    ]);
  }
  if (mission.lockedDoors > 0) {
    notes.push([
      "LOCKED",
      `${mission.lockedDoors} ${mission.lockedDoors === 1 ? "door" : "doors"} that will not open until the right key is in the bag.`,
    ]);
  }
  if (mission.fauna > 0) {
    notes.push([
      "LIVE HERE",
      `Something else is already here — ${mission.fauna} of them, grazing and pecking about their business. They will not fight you and you cannot fight them; they were here before you walked in.`,
    ]);
  }
  if (mission.canopy > 0) {
    notes.push([
      "OVERHEAD",
      `Things drift past above you here — ${mission.canopy} of them, out of focus and sliding faster than the ground does. None of it can be reached, hit or picked up. It is there to tell you which way is up.`,
    ]);
  }
  for (const gate of mission.gates) {
    if (gate.to && gate.key) {
      notes.push([
        "A WAY OUT",
        `Using the ${gate.key.name} while standing here tears open a way to ${gate.to.name}. Nothing in the game tells you this.`,
      ]);
    }
  }
  return notes;
}

/** What the venue itself throws at you, weather and all. */
export function hazardNotes(mission) {
  return mission.hazards
    .map((hazard) => {
      switch (hazard.kind) {
        case "asteroids":
          return [
            "METEORS",
            `Every ${seconds(hazard.spec.everyMs[0])} to ${seconds(hazard.spec.everyMs[1])} a rock falls near you, telegraphed by a firming shadow, and detonates — vaporising minions at the core and flinging everything else, you included, to the sides.`,
          ];
        case "sandstorms":
          return [
            "SAND STORMS",
            `Every ${seconds(hazard.spec.everyMs[0])} to ${seconds(hazard.spec.everyMs[1])} a dust gust drifts across. It moves slowly enough to walk clear of, which is the whole defence — caught, you go down prone while it passes over you.`,
          ];
        case "stampedes":
          return [
            "STAMPEDES",
            `Every ${seconds(hazard.spec.everyMs[0])} to ${seconds(hazard.spec.everyMs[1])} a wall of panicked staff charges in from the right and thunders left. It tramples minions outright. A jump sails clean over it; stepping out of the lane works too.`,
          ];
        case "hayBalls":
          return [
            "BALES",
            `Every ${seconds(hazard.spec.everyMs[0])} to ${seconds(hazard.spec.everyMs[1])} a spinning bale rolls in from the right in its own lane. It barely hurts; what it does is shove you back down the street until you leave the lane or jump it.`,
          ];
        case "wells":
          return [
            "BLACK HOLES",
            `${hazard.count} of them. They drag you, the monsters and the loose loot toward the core; anything grounded that reaches it is gone. Loot piles up on the rim, which is exactly the temptation.`,
          ];
        default:
          return null;
      }
    })
    .filter(Boolean);
}
