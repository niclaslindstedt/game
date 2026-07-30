// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TALENTS' page model: every passive talent the hero can train, folded into
// the shape a page wants to be rendered from — with its numbers read back OUT
// OF THE ENGINE at each of its ranks, plus the point economy that decides which
// of them a build can ever afford.
//
// Facts only, the same rule the bestiary, arsenal and powers models follow. The
// sentences are ./prose-talents.mjs; the markup is ./render-talents.mjs.
//
// WHY NOTHING HERE READS AN AUTHORED SLOPE. `content/talents.yaml` says
// `chancePerRank: 0.16`, and a page printing that would be correct against the
// YAML and wrong against the game: the roll a player actually gets is that slope
// times the rank, clamped to the talent's own ceiling and scaled by the TALENT
// POWER dial, and a crit bonus counts only on the tree's own weapon class. So
// every figure below comes back from the accessor that OWNS the rule, asked
// with the talent trained (`withTalent` in ./catalogs.mjs) — the same discipline
// the arsenal's reference hero exists for.
//
// WHY IT IS ITS OWN SECTION. A talent is not an item and not a power: it is
// never carried, never spent, never picked up and never runs out. It is the one
// thing in the game the player buys with points rather than finds, it is
// permanent once bought, and it is the whole of what "spec" means here — which
// tree a hero's stats have been feeding, and what that tree turned into.

import { EFFECT_BLOCKS } from "./model-powers.mjs";
import {
  ABILITY,
  ABILITY_DEFS,
  abilityBlocks,
  LEVELING,
  SPELL,
  SPELL_BLOCKS,
  STATS,
  TALENTS,
  TALENT_BLOCKS,
  TALENT_CLASS_STAT,
  TALENT_DEFS,
  TALENT_READS,
  TALENT_STATS,
  TALENT_UNLOCK_STEP,
  TREE_LOOK,
  talentBlocks,
  talentIcon,
  talentsForTree,
  treeCapacity,
  withTalent,
} from "./catalogs.mjs";

/**
 * EVERY AUTHORED FIELD REACHES A PAGE — or the build stops. Same contract as
 * the bestiary's `ENEMY_FIELDS` and the powers' `POWER_FIELDS` (see ./model.mjs
 * for why it exists). It bites hardest here, because a talent is a COMPOSITION
 * of an effect bag and any number of proc blocks: a page that quietly ignored a
 * block would describe a talent that does two things as though it did one, and
 * nothing would look broken.
 */
export const TALENT_FIELDS = {
  id: "the page's own route",
  name: "the heading",
  tree: "the tree chip, the persona, and which stat pays for it",
  kind: "the ROLE chip, and the tree's own grouping",
  maxRank: "the rank table's depth, and what a maxed copy costs in stat points",
  blurb: "the one-line summary under the icon — the picker's own words",
  icon: "not reader-facing on its own: resolved through the engine's `talentIcon`",
  effect:
    "the slope bag — one column per field, all of them in `EFFECT_SLOPES`",
  // …and one entry per proc block, all of them rendered by `PROC_READOUTS`.
  // Spread from the engine's own list so the two can never fall out of step.
  ...Object.fromEntries(
    TALENT_BLOCKS.map((block) => [block, "a proc block — its own rank table"]),
  ),
};

// ---- what a rank actually buys -------------------------------------------------

/**
 * THE SLOPE BAG, FIELD BY FIELD: what each one is called on a page, and which
 * engine accessor is asked for its value.
 *
 * `read` is handed the reference hero with this very talent trained to the rank
 * being tabled, and returns the number a player would have. It may set the two
 * scratch fields a read needs — BERSERKER RAGE means nothing at full health —
 * because `withTalent` puts them back afterwards.
 */
const EFFECT_SLOPES = {
  critChancePerRank: {
    label: "CRIT CHANCE",
    unit: "plusPct",
    // Gated by tree: a melee-tree talent lifts melee crits only, which is
    // exactly why the tree is passed in rather than assumed.
    read: (state, def) => TALENT_READS.talentCritChanceBonus(state, def.tree),
  },
  critDamagePerRank: {
    label: "CRIT DAMAGE",
    unit: "plusMult",
    read: (state, def) => TALENT_READS.talentCritDamageBonus(state, def.tree),
  },
  moveSpeedPerRank: {
    label: "MOVE SPEED",
    unit: "mult",
    read: (state) => TALENT_READS.talentSpeedMult(state),
  },
  dodgePerRank: {
    label: "DODGE CHANCE",
    unit: "plusPct",
    read: (state) => TALENT_READS.talentDodgeBonus(state),
  },
  damageReductionPerRank: {
    label: "EVERY BLOW YOU TAKE, CUT BY",
    unit: "pct",
    read: (state) => TALENT_READS.talentDamageReduction(state),
  },
  magicReductionPerRank: {
    label: "EVERY BLOW YOU TAKE, CUT BY",
    unit: "pct",
    // The martial cut and the magic ward fold into one flat reduction at the
    // player-damage choke point, so this is the same accessor — and reports
    // this talent alone, because only this talent is trained.
    read: (state) => TALENT_READS.talentDamageReduction(state),
  },
  reflectPerRank: {
    label: "SENT BACK AT THE ATTACKER",
    unit: "pct",
    read: (state) => TALENT_READS.talentReflectFrac(state),
  },
  maxHpPerRank: {
    label: "MAX HEALTH",
    unit: "plusPct",
    read: (state) => TALENT_READS.talentMaxHpPct(state),
  },
  berserkPerRank: {
    label: "WEAPON DAMAGE, NEARLY DEAD",
    unit: "mult",
    // The enrage is the boost at ZERO health, fading linearly to nothing at
    // full — so the figure worth printing is the one at the bottom of the bar.
    read: (state) => {
      state.player.hp = 0;
      return TALENT_READS.talentBerserkMult(state);
    },
  },
  conjure: {
    // Declared but not a column of its own: a conjuration's numbers are a whole
    // effect block, tabled below through `SPELL_BLOCKS`.
    label: null,
    note: "the spell this talent projects — tabled as its own effect block",
  },
};

/**
 * THE PROC BLOCKS, one readout each: what the block is called, what a rank of
 * it comes to, and where every authored field inside it goes.
 *
 * `read` returns `{ measure key → value }` for the rank being tabled, straight
 * off the accessor that owns the proc. `fields` is the coverage half — every
 * key the YAML may carry, with the reason it is or isn't a column, exactly as
 * `EFFECT_BLOCKS` does for a power.
 */
const PROC_READOUTS = {
  cleavingEcho: {
    title: "The cleave",
    measures: [
      { key: "chance", label: "CHANCE PER SWING", unit: "pct", cap: true },
      { key: "extraTargets", label: "EXTRA FOES STRUCK", unit: "n" },
    ],
    read: (state) => TALENT_READS.talentCleavingEcho(state),
    fields: {
      chancePerRank: "folds into CHANCE PER SWING",
      chanceCap: "the ceiling that roll is clamped to",
      extraTargets: "folds into EXTRA FOES STRUCK",
      bonusTargets: "the bigger figure the top ranks add instead",
      bonusFromRank: "the rank the bigger figure starts at",
    },
  },
  twinStrike: {
    title: "The second blow",
    measures: [
      { key: "chance", label: "CHANCE PER BLOW", unit: "pct", cap: true },
      { key: "echoFrac", label: "THE ECHO LANDS FOR", unit: "pct" },
    ],
    read: (state) => TALENT_READS.talentTwinStrike(state),
    fields: {
      chancePerRank: "folds into CHANCE PER BLOW",
      chanceCap: "the ceiling that roll is clamped to",
      echoDamageFrac: "folds into THE ECHO LANDS FOR",
      fullEchoRank: "the rank the echo goes to full damage",
    },
  },
  parry: {
    title: "The parry",
    measures: [
      {
        key: "chance",
        label: "CHANCE TO TURN A BLOW ASIDE",
        unit: "pct",
        cap: true,
      },
      {
        key: "riposteFrac",
        label: "RIPOSTED BACK AT THE ATTACKER",
        unit: "pct",
      },
    ],
    read: (state) => TALENT_READS.talentParry(state),
    fields: {
      chancePerRank: "folds into CHANCE TO TURN A BLOW ASIDE",
      chanceCap: "the ceiling that roll is clamped to",
      riposteFrac: "folds into RIPOSTED BACK AT THE ATTACKER",
      riposteRank: "the rank the riposte appears at",
    },
  },
  seismic: {
    title: "The landing",
    measures: [
      { key: "radius", label: "SHAKES THE GROUND FOR", unit: "px" },
      { key: "damage", label: "DAMAGE", unit: "dmg" },
      { key: "knockback", label: "FLINGS THEM BACK", unit: "px" },
    ],
    read: (state) => TALENT_READS.talentSeismic(state),
    fields: {
      radius: "folds into SHAKES THE GROUND FOR",
      radiusPerRank: "folds into SHAKES THE GROUND FOR",
      damage: "folds into DAMAGE",
      damagePerRank: "folds into DAMAGE",
      knockback: "folds into FLINGS THEM BACK",
    },
  },
  piercing: {
    title: "The pierce",
    measures: [
      { key: "pierce", label: "EXTRA BODIES PUNCHED THROUGH", unit: "n" },
      { key: "retain", label: "DAMAGE KEPT PER BODY", unit: "pct" },
    ],
    read: (state) => TALENT_READS.talentPiercing(state),
    fields: {
      piercePerRank: "folds into EXTRA BODIES PUNCHED THROUGH",
      retainBase: "folds into DAMAGE KEPT PER BODY",
      retainPerRank: "folds into DAMAGE KEPT PER BODY",
      retainCap: "the ceiling that falloff is clamped to",
    },
  },
  concussive: {
    title: "The shove",
    measures: [
      { key: "chance", label: "CHANCE PER HIT", unit: "pct", cap: true },
      { key: "distance", label: "SHOVED BACK", unit: "px" },
    ],
    read: (state) => TALENT_READS.talentConcussive(state),
    fields: {
      chancePerRank: "folds into CHANCE PER HIT",
      chanceCap: "the ceiling that roll is clamped to",
      distance: "folds into SHOVED BACK",
      distancePerRank: "folds into SHOVED BACK",
    },
  },
  crippling: {
    title: "The hobble",
    measures: [
      { key: "chance", label: "CHANCE PER HIT", unit: "pct", cap: true },
      { key: "slowFactor", label: "SPEED WHILE HOBBLED", unit: "pct" },
      { key: "slowMs", label: "HOBBLED FOR", unit: "sec" },
    ],
    read: (state) => TALENT_READS.talentCrippling(state),
    fields: {
      chancePerRank: "folds into CHANCE PER HIT",
      chanceCap: "the ceiling that roll is clamped to",
      slowFactor: "folds into SPEED WHILE HOBBLED",
      slowMs: "folds into HOBBLED FOR",
      slowMsPerRank: "folds into HOBBLED FOR",
    },
  },
  volley: {
    title: "The extra rounds",
    measures: [
      { key: "chance", label: "CHANCE PER PULL", unit: "pct", cap: true },
      { key: "extra", label: "EXTRA SHOTS", unit: "n" },
      { key: "spreadDeg", label: "FANNED ACROSS", unit: "deg" },
    ],
    read: (state) => TALENT_READS.talentVolley(state),
    fields: {
      chancePerRank: "folds into CHANCE PER PULL",
      chanceCap: "the ceiling that roll is clamped to",
      extra: "folds into EXTRA SHOTS",
      bonusExtra: "the bigger figure the top ranks add instead",
      bonusFromRank: "the rank the bigger figure starts at",
      spreadDeg: "folds into FANNED ACROSS",
    },
  },
  springHeels: {
    title: "The jump",
    measures: [
      { key: "velocityMult", label: "TAKEOFF SPEED", unit: "mult" },
      { key: "costMult", label: "STAMINA A HOP COSTS", unit: "mult" },
    ],
    read: (state) => TALENT_READS.talentJumpMods(state),
    fields: {
      velocityPerRank: "folds into TAKEOFF SPEED",
      jumpCostReduction: "folds into STAMINA A HOP COSTS",
      costReductionRank: "the rank the cheaper hop appears at",
    },
  },
  evasionBurst: {
    title: "The dart away",
    measures: [
      { key: "speedMult", label: "MOVE SPEED WHILE IT LASTS", unit: "mult" },
      { key: "ms", label: "LASTS", unit: "sec" },
    ],
    // TWO accessors, because the burst is two facts and only one of them knows
    // about rank: `talentEvasionBurstMult` reports the carrier's speed whenever
    // the window is open, and it is `talentEvasionBurstMs` that decides whether
    // a dodge ever opens one. Reading the multiplier alone would print a 1.35×
    // against every rank, including the four where nothing ever happens.
    read: (state) => {
      const ms = TALENT_READS.talentEvasionBurstMs(state);
      // Nothing at all below the mastery rank, and `null` rather than `1×` and
      // `0 S`: the multiplier is real at every rank, but no dodge ever opens a
      // window for it to apply in, and printing it would say the opposite.
      if (ms <= 0) return { speedMult: null, ms: null };
      state.player.evasionBurstMs = ms;
      return {
        speedMult: TALENT_READS.talentEvasionBurstMult(state),
        ms,
      };
    },
    fields: {
      speedMult: "folds into MOVE SPEED WHILE IT LASTS",
      ms: "folds into LASTS",
      rank: "the rank the burst appears at",
    },
  },
  frostNova: {
    title: "The nova",
    measures: [
      { key: "radius", label: "FREEZES EVERYTHING WITHIN", unit: "px" },
      { key: "freezeMs", label: "FROZEN FOR", unit: "sec" },
      { key: "slowFactor", label: "SPEED WHILE FROZEN", unit: "pct" },
      { key: "cooldownMs", label: "CANNOT FIRE AGAIN FOR", unit: "sec" },
    ],
    read: (state) => TALENT_READS.talentFrostNova(state),
    fields: {
      radius: "folds into FREEZES EVERYTHING WITHIN",
      radiusPerRank: "folds into FREEZES EVERYTHING WITHIN",
      freezeMs: "folds into FROZEN FOR",
      freezeMsPerRank: "folds into FROZEN FOR",
      slowFactor: "folds into SPEED WHILE FROZEN",
      cooldownMs: "folds into CANNOT FIRE AGAIN FOR",
      cooldownPerRank: "folds into CANNOT FIRE AGAIN FOR",
      cooldownFloorMs: "the floor that reset can never drop below",
    },
  },
};

/** Fail the build when a talent carries something no page would show. */
function assertTalentFieldsCovered(def) {
  const unknown = Object.keys(def).filter((key) => !(key in TALENT_FIELDS));
  for (const key of Object.keys(def.effect ?? {})) {
    if (!(key in EFFECT_SLOPES)) unknown.push(`effect.${key}`);
  }
  for (const block of talentBlocks(def)) {
    const spec = PROC_READOUTS[block];
    if (!spec) {
      unknown.push(`${block} (no readout)`);
      continue;
    }
    for (const key of Object.keys(def[block])) {
      if (!(key in spec.fields)) unknown.push(`${block}.${key}`);
    }
  }
  const spell = def.effect?.conjure;
  if (spell && !SPELL_BLOCKS[spell]) unknown.push(`effect.conjure "${spell}"`);
  if (unknown.length > 0) {
    throw new Error(
      `library: talent "${def.id}" carries ${unknown.join(", ")}, which no library page renders. ` +
        `Add it to the generator (pwa/scripts/library/model-talents.mjs) and declare it in ` +
        `TALENT_FIELDS / EFFECT_SLOPES / PROC_READOUTS — the pages are never edited by hand, ` +
        `so an unrendered field would silently vanish.`,
    );
  }
}

// ---- the rank tables -----------------------------------------------------------

/** Every rank a talent can be trained to, 1 → its own ceiling. */
const ranksOf = (def) => Array.from({ length: def.maxRank }, (_, i) => i + 1);

/**
 * The SLOPE readout: one table whose columns are the fields the talent's effect
 * bag carries and whose rows are its ranks. One table rather than one per field
 * because the fields of one bag are one effect — EXECUTIONER's crit chance and
 * crit damage are the same rank of the same talent, and splitting them into two
 * tables would say otherwise.
 */
function slopeReadout(def) {
  const measures = Object.entries(def.effect ?? {})
    .filter(([field]) => EFFECT_SLOPES[field]?.label)
    .map(([field]) => ({
      key: field,
      label: EFFECT_SLOPES[field].label,
      unit: EFFECT_SLOPES[field].unit,
    }));
  if (measures.length === 0) return null;
  return {
    id: "slopes",
    title: "What it changes",
    // A summed slope has no ceiling of its own — the shape is kept so every
    // readout answers the same questions.
    cap: null,
    measures,
    ranks: ranksOf(def).map((rank) => ({
      rank,
      values: Object.fromEntries(
        measures.map((measure) => [
          measure.key,
          withTalent(def.id, rank, (state) =>
            EFFECT_SLOPES[measure.key].read(state, def),
          ),
        ]),
      ),
    })),
  };
}

/** One proc block's readout: its own table, its own rows, one per rank. */
function procReadout(def, block) {
  const spec = PROC_READOUTS[block];
  const rows = ranksOf(def).map((rank) => ({
    rank,
    values: withTalent(def.id, rank, (state) => spec.read(state)) ?? {},
  }));
  const capped = spec.measures.some((measure) => measure.cap);
  return {
    id: block,
    title: spec.title,
    measures: spec.measures,
    ranks: rows,
    // The talent's own ceiling on its roll, stated ONLY when the rank ladder
    // actually reaches it — a cap five ranks never touch is a fact about the
    // tuning, not about anything a player can do.
    cap:
      capped && def[block].chanceCap !== undefined
        ? {
            value: def[block].chanceCap,
            reached: rows.some(
              (row) => (row.values.chance ?? 0) >= def[block].chanceCap,
            ),
          }
        : null,
  };
}

/**
 * A CONJURATION's readout: the granted spell's own numbers at each rank, tabled
 * with the labels and units a picked-up power's block is tabled with.
 *
 * The block a conjuration arrives at is the very shape `content/powerups.yaml`
 * authors (see `SPELL_BLOCKS`), which is what lets one vocabulary cover both —
 * a ring's ORB SIZE is the same fact whether the ring was grabbed off a floor or
 * projected by a magic-tree hero.
 */
function conjureReadout(def) {
  const spell = def.effect?.conjure;
  if (!spell) return null;
  const { block, read } = SPELL_BLOCKS[spell];
  const spec = EFFECT_BLOCKS[block];
  const ranks = ranksOf(def).map((rank) => ({
    rank,
    values: withTalent(def.id, rank, (state) => read(state, rank)),
  }));
  // A field is a column when its declaration gives it a label AND the spell
  // actually returns it — the SEEKER arrives at a `volley` block and fills in
  // more of it than a stasis field does.
  const measures = Object.entries(spec.fields)
    .filter(([key, field]) => field.label && ranks[0].values[key] !== undefined)
    .map(([key, field]) => ({
      key,
      label: field.label,
      unit: field.unit,
      of: field.of ?? null,
    }));
  return {
    spell,
    block,
    title: spec.title,
    measures,
    ranks,
    // The powers that put the SAME effect on the field, so a reader can see
    // what the permanent version of a familiar pickup is. Asked of the catalog
    // rather than listed here: two of the five conjurations have no pickup twin
    // at all, and a hand-written table would have claimed otherwise.
    powers: Object.values(ABILITY_DEFS)
      .filter((power) => abilityBlocks(power).includes(block))
      .map((power) => ({
        id: power.id,
        name: power.name,
        path: `powers/${slugFor(power.id)}`,
      })),
  };
}

// ---- one talent ----------------------------------------------------------------

/** URL slug for a catalog id — hyphens read better in a URL than underscores. */
const slugFor = (id) => id.replace(/_/g, "-");

/** The route a talent's page lives at, relative to `/library/`. */
export const talentPath = (id) => `talents/${slugFor(id)}`;

/** The tree a talent belongs to, with the persona and colour the picker gives
 * it and the stat that pays for it. */
function treeOf(tree) {
  return {
    id: tree,
    stat: TALENT_CLASS_STAT[tree],
    title: TREE_LOOK[tree].title,
    kicker: TREE_LOOK[tree].kicker,
    accent: TREE_LOOK[tree].accent,
    deep: TREE_LOOK[tree].deep,
  };
}

function talentModel(def) {
  assertTalentFieldsCovered(def);
  const readouts = [
    slopeReadout(def),
    ...talentBlocks(def).map((block) => procReadout(def, block)),
  ].filter(Boolean);
  const conjure = conjureReadout(def);

  return {
    id: def.id,
    slug: slugFor(def.id),
    path: talentPath(def.id),
    name: def.name,
    // The picker's own one-liner. It is the only sentence anybody wrote about
    // this talent, and the game shows it exactly once — in the half-second the
    // player is deciding.
    blurb: def.blurb,
    tree: treeOf(def.tree),
    // A label the picker groups and tints by, never a dispatch key — so the
    // page says what role it fills, not what it IS.
    kind: def.kind,
    icon: talentIcon(def),
    maxRank: def.maxRank,
    readouts,
    conjure,
    // What a maxed copy costs the build: every rank is one of the tree's
    // points, and a point is `TALENT_UNLOCK_STEP` CHOSEN points in the stat.
    maxRankStatCost: def.maxRank * TALENT_UNLOCK_STEP,
    // Whether its bonus counts only on the tree's own weapon class — true of
    // the crit slopes, which is the one place the tree does more than pay.
    weaponClassGated: !!(
      def.effect?.critChancePerRank || def.effect?.critDamagePerRank
    ),
    // Whether any figure on the page is a level-1 damage number that then rides
    // the campaign's own power curve, like a powerup's.
    scalesWithLevel:
      readouts.some((readout) =>
        readout.measures.some((measure) => measure.unit === "dmg"),
      ) || (conjure?.measures ?? []).some((measure) => measure.unit === "dmg"),
    sourceFiles: ["content/talents.yaml"],
  };
}

// ---- the catalog ---------------------------------------------------------------

/**
 * Every talent page, the three trees, and the point economy they are spent out
 * of.
 *
 * The economy is the section's spine and every number in it is the engine's: a
 * tree can hold `treeCapacity` ranks, a stat can only ever earn
 * `statHardCap / TALENT_UNLOCK_STEP` points, and those two numbers not matching
 * is the whole reason a build is a build. Nothing here asserts that they don't
 * match — the pages ask.
 */
export function talentsModel() {
  const talents = Object.values(TALENT_DEFS).map(talentModel);
  const byId = new Map(talents.map((talent) => [talent.id, talent]));

  const trees = TALENT_STATS.map((stat) => {
    const tree = Object.keys(TALENT_CLASS_STAT).find(
      (name) => TALENT_CLASS_STAT[name] === stat,
    );
    // CATALOG order, which is the order the picker lists a tree in — offense at
    // the top, defense at the bottom. Sorting it alphabetically would throw
    // away the one bit of arrangement the content itself carries.
    const entries = talentsForTree(tree).map((def) => byId.get(def.id));
    return {
      ...treeOf(tree),
      entries,
      // The most ranks this tree could ever absorb…
      capacity: treeCapacity(tree),
      // …against the most points its stat can ever earn. The gap is the choice.
      ceiling: Math.floor(STATS.statHardCap / TALENT_UNLOCK_STEP),
    };
  });

  return {
    talents,
    trees,
    unlockStep: TALENT_UNLOCK_STEP,
    maxRank: TALENTS.maxRank,
    statHardCap: STATS.statHardCap,
    // The yardstick every authored damage figure in the game was picked
    // against — the same one the powers pages quote, for the same reason.
    refMobHp: LEVELING.refMobHp,
    // Every conjured blow rides this per point of INTELLIGENCE — including the
    // ones a STRENGTH talent throws, which is exactly the sort of thing only a
    // page like this ever gets to say.
    intDamagePerPoint: ABILITY.intDamagePerPoint,
    // What INTELLIGENCE does to a conjuration that rank alone does not: it
    // quickens every tick and strike, to a floor.
    spellIntervalPerInt: SPELL.intervalPerInt,
    spellIntervalFloor: SPELL.intervalFloor,
  };
}
