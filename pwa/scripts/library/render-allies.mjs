// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ALLIES — one page per companion, plus the index that lays out the roster
// and the party rules every one of them obeys.
//
// An ally page leads with the RECRUIT, because that is the only thing on it a
// reader cannot get any other way: everything below is numbers about a figure
// they may never have been offered. Then what it brings, then what training it
// comes to, and last — behind a cover — what it says.
//
// The cover is smaller here than anywhere else in the library, and deliberately
// so. An ally's numbers are not a spoiler: a player who has been offered the
// choice already knows who is on the table, and a player who has not is reading
// a page about somebody they will meet as an ELITE, whose own bestiary entry
// keeps that fight's story covered. What IS covered is the join — the payoff of
// a verdict the game stops the run to ask for.

import {
  cardFor,
  DEFAULT_CARD,
  dropFigure,
  escapeHtml,
  img,
  page,
  pageSchema,
  reveal,
  SITE_URL,
  table,
  TITLE,
} from "./html.mjs";
import { spriteSize } from "./art.mjs";
import {
  alliesDescription,
  allyDescription,
  allyLead,
  auraProse,
  novaProse,
  partyProse,
  trainingNotes,
} from "./prose-allies.mjs";

/**
 * The colour the section reads in — the mint the GAME draws a companion's own
 * health bar in (`render/actors.ts`), which is the one colour in the game that
 * means "this one is yours". It is also, by coincidence worth keeping rather
 * than relying on, the stylesheet's own mint: gold belongs to the errands and
 * amber to the selection, so an ally had a colour waiting for it either way.
 */
const ALLY_ACCENT = "#7ef0c8";

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

const sprite = (name, base, alt, { lazy = true } = {}) => {
  const size = spriteSize(name);
  return size
    ? img({
        src: `${base}library/sprites/${name}.png`,
        alt,
        width: size.width,
        height: size.height,
        lazy,
      })
    : "";
};

/**
 * What this ally's social card says and is drawn from. Called by BOTH the page
 * and the build, for the reason spelled out on `enemyCardSpec` — one function,
 * so the card a page names and the card that gets written are the same file.
 *
 * An ally is staged like a MOB rather than framed like an item, for the plainest
 * possible reason: it is one, standing on the map it is recruited from. The
 * only thing the picture cannot show is which side it is on.
 */
export function allyCardSpec(ally) {
  return {
    slug: ally.path.replace(/\//g, "-"),
    sprite: ally.sprite,
    venueId: ally.recruit?.venue?.id ?? null,
    title: ally.name,
    subtitle: ally.power?.name ?? ally.weapon.name,
    rarity: "COMPANION",
    accent: ALLY_ACCENT,
    titleColor: ALLY_ACCENT,
    // There is no rarity ladder to claim a halo off: the roster is four, each
    // recruited from one named elite, and none of them is rarer than another.
    flair: 0,
    rows: [],
    alt: `${ally.name} — a companion in ${TITLE}`,
  };
}

// ---- the sections ---------------------------------------------------------------

/**
 * WHAT IT BRINGS, as the same stat block a monster's page opens with — the two
 * are the same question asked of the two sides of a fight, and a reader who has
 * just come off a bestiary page should not have to learn a second layout for it.
 */
function kitSection(ally, base) {
  const stats = [
    ["HEALTH", `${ally.base.hp}`],
    [ally.weapon.throws ? "PER SHOT" : "PER FOE", `${ally.base.damage}`],
    ["HITS EVERY", `${ally.base.cooldownMs / 1000} S`],
    ["REACH", `${ally.weapon.range}`],
    ...(ally.weapon.sweepDeg ? [["ARC", `${ally.weapon.sweepDeg}°`]] : []),
    ...(ally.weapon.pellets > 1
      ? [["VOLLEY", `${ally.weapon.pellets}`]]
      : []),
    ["PACE", `${ally.base.speed}`],
    ["SIZE", `${ally.base.radius}`],
  ];
  return `      <h2 id="kit">What it brings</h2>
      <p>Its signature weapon is the
      <a href="${base}library/${ally.weapon.path}/">${escapeHtml(ally.weapon.name)}</a>,
      the ${escapeHtml(ally.weapon.class)} piece it fought you with — minted into
      its hands unbreakable, so unlike everything you carry it can never wear
      out. Every figure below is at the level it joins you on, and every one of
      them climbs from there.</p>
      <ul class="stats">
${stats
  .map(
    ([key, value]) =>
      `        <li><span class="stat-key">${escapeHtml(key)}</span><span class="stat-val">${escapeHtml(value)}</span></li>`,
  )
  .join("\n")}
      </ul>`;
}

/** The training ladder: a row per rank, and what the ally is when it lands. */
function trainingSection(ally, tuning) {
  const measures = ally.training.measures;
  return `      <h2 id="training">What training comes to</h2>
${table({
  head: [
    "RANK",
    "AT LEVEL",
    "HEALTH",
    ally.weapon.throws ? "PER SHOT" : "PER FOE",
    ...measures.map((measure) => measure.label),
  ],
  rows: ally.training.rows.map((row) => [
    `${row.rank}`,
    `${row.level}`,
    `${row.hp}`,
    `${row.damage}`,
    ...measures.map((measure) => {
      const value = row.values[measure.key];
      // A space before the unit, always: the pixel font sets these, and a
      // trailing letter hard against a digit is misread — `96PX` reads as a
      // number, not as a distance.
      return measure.unit ? `${value} ${measure.unit}` : `${value}`;
    }),
  ]),
})}
${notesList(trainingNotes(ally, tuning))}`;
}

// ---- the pages ------------------------------------------------------------------

/** One companion's page. */
export function allyPage(
  ally,
  model,
  { base, groundFor, venueName, hasImages },
) {
  const canonical = `${SITE_URL}${base}library/${ally.path}/`;
  const description = allyDescription(ally);
  const cardSpec = allyCardSpec(ally);
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const recruit = ally.recruit;
  const venue = recruit?.venue ? venueName(recruit.venue.id) : null;
  const dropShot =
    hasImages && venue
      ? dropFigure({
          src: `${base}library/shots/${cardSpec.slug}.webp`,
          alt: `${ally.name}, a companion in ${TITLE}, standing on ${venue}`,
          caption: `${ally.name} — where the offer is made, on ${venue}.`,
        })
      : "";

  const chips = [
    `<li class="chip tag">COMPANION</li>`,
    recruit?.venue
      ? `<li class="chip"><a href="${base}library/missions/${escapeHtml(recruit.venue.slug)}/">${escapeHtml(recruit.venue.name)}</a></li>`
      : "",
    `<li class="chip">${escapeHtml(ally.weapon.class.toUpperCase())}</li>`,
    ally.power ? `<li class="chip">${escapeHtml(ally.power.name)}</li>` : "",
    ally.aura ? `<li class="chip tag">MAGIC FIND AURA</li>` : "",
    ally.nova ? `<li class="chip tag">FROST NOVA</li>` : "",
  ].filter(Boolean);

  // Its own lines: the join is a scene the game plays once, the banter is
  // hovering text over a kill. Both are spoken words, so both go behind the
  // cover the rest of the library puts spoken words behind.
  const said = [
    ally.story.joinWords.length > 0
      ? `      <h3>On getting up</h3>
${ally.story.joinWords
  .map(
    (lines) => `      <blockquote class="speech">
        <span class="who">${escapeHtml(ally.name)}</span>
        <p>${lines.map(escapeHtml).join("<br />")}</p>
      </blockquote>`,
  )
  .join("\n")}`
      : "",
    ally.story.killQuotes.length > 0
      ? `      <h3>Over its own kills</h3>
      <ul class="quote-list">
${ally.story.killQuotes
  .map((line) => `        <li>${escapeHtml(line)}</li>`)
  .join("\n")}
      </ul>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const nova = novaProse(ally);
  const aura = auraProse(ally, model.tuning);

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <div class="portrait">
        ${sprite(ally.sprite, base, `${ally.name}, a companion in ${TITLE}`, { lazy: false })}
        <div class="portrait-body">
${paragraphs(allyLead(ally, model.tuning))}
${
  recruit
    ? `      <p class="flavor-plain">${escapeHtml(recruit.enemy.lore)}</p>
      <p class="note">— <a href="${base}library/${recruit.enemy.path}/">${escapeHtml(recruit.enemy.name)}</a>, the elite it is until you spare it.</p>`
    : ""
}
        </div>
      </div>
      <section class="panel pixel-panel">
${kitSection(ally, base)}
      </section>
      <section class="panel pixel-panel">
${trainingSection(ally, model.tuning)}
      </section>
${
  nova.length
    ? `      <h2 id="nova">Its frost nova</h2>
${paragraphs(nova).replace(/^ {8}/gm, "      ")}`
    : ""
}
${
  aura.length
    ? `      <h2 id="aura">Its aura</h2>
${paragraphs(aura).replace(/^ {8}/gm, "      ")}`
    : ""
}
${dropShot}
${
  said
    ? `      <h2 id="said">What it says</h2>
      <p>Its own lines, covered until you ask for them.</p>
${reveal({ id: "reveal-ally-said", label: "WHAT IT SAYS", body: said })}`
    : ""
}`;

  return page({
    base,
    path: ally.path,
    title: `${ally.name} — ${TITLE} companions`,
    description,
    heading: ally.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ALLIES", href: `${base}library/allies/` },
      { label: ally.name },
    ],
    ground: groundFor(recruit?.venue?.id ?? null),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${ally.name} — ${TITLE} companions`,
      description,
      // Same object as the og:image tag — see the note in render-bestiary.
      image: card.url,
    }),
  });
}

/** A rack of ally links, each with its portrait and what it grows into. */
function rack(allies, base) {
  return `      <ul class="roster allies">
${allies
  .map(
    (ally) =>
      `        <li><a href="${base}library/${ally.path}/">${sprite(
        ally.sprite,
        base,
        "",
      )}<span class="ally-name">${escapeHtml(ally.name)}<span class="where">${escapeHtml(
        ally.power?.name ?? ally.weapon.name,
      )}</span></span></a></li>`,
  )
  .join("\n")}
      </ul>`;
}

/**
 * The allies index: the roster, then the rules the party plays by.
 *
 * The rules are the reason this is an index rather than four loose pages. None
 * of them is visible from inside the game — a player can watch a companion
 * kneel for twelve seconds without ever learning that the count freezes while a
 * foe is near it — and none of them belongs on any ONE ally's page, because
 * every one is true of all of them.
 */
export function alliesIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/allies/`;
  const total = model.allies.length;
  const description = alliesDescription(model);
  // Where the offers are made, said once here rather than on every row: a value
  // identical down every row of a rack belongs in the sentence above it.
  const venues = [
    ...new Set(
      model.allies.map((ally) => ally.recruit?.venue?.name).filter(Boolean),
    ),
  ];

  return page({
    base,
    path: "allies",
    title: `Allies — every companion in ${TITLE}`,
    description,
    heading: "THE ALLIES",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ALLIES" },
    ],
    ground: groundFor(model.allies[0]?.recruit?.venue?.id ?? null),
    body: `      <p class="lede">The ${total} figures in ${escapeHtml(TITLE)} you can
      choose not to kill. Beat one of them down and the run stops for a verdict;
      spare it and it fights beside you for the rest of the campaign, levelling
      off its own kills and growing a signature power you never get to use
      yourself.</p>
      <h2 id="roster">The roster</h2>
      <p>All ${total} of them are named elites${
        venues.length === 1 ? ` on ${escapeHtml(venues[0])}` : ""
      }, and every one is a fight before it is an ally. What each grows into is
      under its name.</p>
${rack(model.allies, base)}
      <section class="panel pixel-panel">
      <h2 id="party">How the party works</h2>
${paragraphs(partyProse(model)).replace(/^ {8}/gm, "      ")}
      </section>`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Allies — every companion in ${TITLE}`,
      description,
    }),
  });
}
