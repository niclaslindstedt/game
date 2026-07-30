// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE TALENTS — one page per passive talent, plus the index that lays out the
// three trees and the point economy they are spent from.
//
// A talent page leads with what the reader came for (what it does, which stat
// buys it, what a maxed copy costs), then its rank tables, then the rules that
// are not numbers, then the rest of its tree — because the question a talent
// page is really answering is "instead of what".
//
// Nothing here sits behind a reveal. A talent is not a spoiler: the picker
// shows a hero the whole tree the first time it opens, and it shows it for
// about as long as it takes to read one line.

import {
  cardFor,
  DEFAULT_CARD,
  escapeHtml,
  img,
  page,
  pageSchema,
  SITE_URL,
  table,
  TITLE,
} from "./html.mjs";
import { spriteSize } from "./art.mjs";
import { valueLabel } from "./prose-powers.mjs";
import {
  economyProse,
  talentDescription,
  talentLead,
  talentNotes,
  talentValue,
  treeProse,
} from "./prose-talents.mjs";

const paragraphs = (lines) =>
  lines.map((line) => `        <p>${escapeHtml(line)}</p>`).join("\n");

const notesList = (notes) =>
  notes.length === 0
    ? ""
    : `      <ul class="notes">
${notes
  .map(
    ([key, text]) =>
      `        <li><span class="stat-key">${escapeHtml(key)}</span>${escapeHtml(text)}</li>`,
  )
  .join("\n")}
      </ul>`;

/**
 * What this talent's social card says and is drawn from. Called by BOTH the
 * page and the build, for the reason spelled out on `enemyCardSpec` — one
 * function, so the card a page names and the card that gets written are the
 * same file.
 *
 * A talent's card is the ONE in the library with no drop shot behind it, and
 * that is a fact about the subject rather than an omission: a monster stands
 * somewhere and a power lies on a floor, but a talent is never anywhere. It is
 * a row in a picker and then a property of the hero.
 */
export function talentCardSpec(talent) {
  return {
    slug: talent.path.replace(/\//g, "-"),
    sprite: talent.icon,
    title: talent.name,
    subtitle: `${talent.maxRank} RANKS`,
    rarity: talent.tree.title,
    accent: talent.tree.accent,
    titleColor: talent.tree.accent,
    // The tree's colour is the whole flair a talent card needs; a rarity halo
    // would be claiming a ladder talents are not on.
    flair: 0,
    rows: [],
    footLeft: "TALENT",
    footRight: talent.tree.stat.toUpperCase(),
    alt: `${talent.name} — a ${talent.tree.title} talent in ${TITLE}`,
  };
}

// ---- the sections ---------------------------------------------------------------

/** One readout as a table: a row per rank, a column per measure. */
function readoutTable(readout, cell) {
  return `      <h3 id="rank-${escapeHtml(readout.id)}">${escapeHtml(readout.title)}</h3>
${table({
  head: ["RANK", ...readout.measures.map((measure) => measure.label)],
  rows: readout.ranks.map((row) => [
    `${row.rank}`,
    ...readout.measures.map((measure) =>
      cell(measure, row.values[measure.key]),
    ),
  ]),
})}`;
}

/**
 * The CONJURATION table — the granted spell's own numbers per rank, worded with
 * the labels a picked-up power's block is worded with, and followed by the
 * pickups that put the same thing on the field where any exist.
 */
function conjureSection(conjure, base) {
  const twins = conjure.powers.length
    ? `      <p>The same effect the game also hands out as a pickup: ${conjure.powers
        .map(
          (power) =>
            `<a href="${base}library/${power.path}/">${escapeHtml(power.name)}</a>`,
        )
        .join(", ")}. The difference is the clock — a pickup runs for seconds, a
      conjuration never stops.</p>`
    : `      <p>No pickup in the game puts this on the field. It is the magic
      tree's own, and training it is the only way to see it.</p>`;
  return `      <h3 id="conjure">${escapeHtml(conjure.title)}</h3>
${twins}
${table({
  head: ["RANK", ...conjure.measures.map((measure) => measure.label)],
  rows: conjure.ranks.map((row) => [
    `${row.rank}`,
    ...conjure.measures.map((measure) =>
      valueLabel({ ...measure, value: row.values[measure.key] }),
    ),
  ]),
})}`;
}

/** A rack of talent links, each with its picker glyph, in the tree's colour. */
function rack(talents, base, sprites, accent) {
  return `      <ul class="roster talent-rack"${
    accent ? ` style="--tree: ${accent}"` : ""
  }>
${talents
  .map((talent) => {
    const size = spriteSize(talent.icon);
    return `        <li><a href="${base}library/${talent.path}/">${
      size
        ? img({
            src: `${sprites}${talent.icon}.png`,
            alt: "",
            width: size.width,
            height: size.height,
          })
        : ""
    }<span class="talent-name">${escapeHtml(talent.name)}<span class="where">${escapeHtml(
      talent.kind.toUpperCase(),
    )}</span></span></a></li>`;
  })
  .join("\n")}
      </ul>`;
}

// ---- the pages ------------------------------------------------------------------

/** One talent's page. */
export function talentPage(talent, model, { base, groundFor, hasImages }) {
  const sprites = `${base}library/sprites/`;
  const canonical = `${SITE_URL}${base}library/${talent.path}/`;
  const description = talentDescription(talent);
  const cardSpec = talentCardSpec(talent);
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const size = spriteSize(talent.icon);
  const tree = model.trees.find((entry) => entry.id === talent.tree.id);
  const siblings = (tree?.entries ?? []).filter(
    (entry) => entry.id !== talent.id,
  );

  const chips = [
    `<li class="chip tag">TALENT</li>`,
    `<li class="chip"><a href="${base}library/talents/#${escapeHtml(talent.tree.id)}">${escapeHtml(talent.tree.title)}</a></li>`,
    `<li class="chip">${escapeHtml(talent.tree.stat.toUpperCase())}</li>`,
    `<li class="chip tag">${escapeHtml(talent.kind.toUpperCase())}</li>`,
    `<li class="chip">${talent.maxRank} RANKS</li>`,
    `<li class="chip">ALWAYS ON</li>`,
  ];

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <div class="portrait">
        ${
          size
            ? img({
                src: `${sprites}${talent.icon}.png`,
                alt: `${talent.name}, as the talent picker draws it in ${TITLE}`,
                width: size.width,
                height: size.height,
                lazy: false,
              })
            : ""
        }
        <div class="portrait-body">
${paragraphs(talentLead(talent, model))}
      <p class="flavor-plain">${escapeHtml(talent.blurb)}</p>
        </div>
      </div>
      <section class="panel pixel-panel">
      <h2 id="ranks">What a rank buys</h2>
${[
  ...talent.readouts.map((readout) => readoutTable(readout, talentValue)),
  ...(talent.conjure ? [conjureSection(talent.conjure, base)] : []),
].join("\n")}
${notesList(talentNotes(talent, model))}
      </section>
${
  siblings.length === 0
    ? ""
    : `      <h2 id="tree">The rest of the ${escapeHtml(talent.tree.title)} tree</h2>
      <p>Every one of these is bought out of the same ${escapeHtml(
        talent.tree.stat.toUpperCase(),
      )} points, so a rank here is a rank not spent on any of them.</p>
${rack(siblings, base, sprites, talent.tree.accent)}`
}`;

  return page({
    base,
    path: talent.path,
    title: `${talent.name} — ${TITLE} talents`,
    description,
    heading: talent.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "TALENTS", href: `${base}library/talents/` },
      { label: talent.name },
    ],
    ground: groundFor(null),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${talent.name} — ${TITLE} talents`,
      description,
      // Same object as the og:image tag — see the note in render-bestiary.
      image: card.url,
    }),
  });
}

/**
 * The talents index: the point economy, then a panel per tree.
 *
 * Grouped by TREE and, inside a tree, left in CATALOG order — which is the
 * order the picker puts them in, offense at the top and defense at the bottom.
 * That order is the one piece of arrangement the content itself carries, and an
 * alphabetical index would throw it away for nothing.
 */
export function talentsIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/talents/`;
  const sprites = `${base}library/sprites/`;
  const total = model.talents.length;

  const trees = model.trees
    .map(
      (
        tree,
      ) => `      <h2 id="${escapeHtml(tree.id)}">${escapeHtml(tree.title)}<span class="count">${tree.entries.length}</span></h2>
      <p>${escapeHtml(treeProse(tree, model))}</p>
${rack(tree.entries, base, sprites, tree.accent)}`,
    )
    .join("\n");

  const description = `Every one of the ${total} passive talents in ${TITLE} — what each rank buys, which stat pays for it, and how the three trees are earned and spent.`;

  return page({
    base,
    path: "talents",
    title: `Talents — every passive talent in ${TITLE}`,
    description,
    heading: "THE TALENTS",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "TALENTS" },
    ],
    ground: groundFor(null),
    body: `      <p class="lede">All ${total} passive talents, across the three trees a
      hero grows: what every rank actually comes to, which stat pays for it, and
      what carrying it to the top costs a build.</p>
${paragraphs(economyProse(model)).replace(/^ {8}/gm, "      ")}
${trees}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Talents — every passive talent in ${TITLE}`,
      description,
    }),
  });
}
