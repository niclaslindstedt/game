// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE POWERS — one page per timed power, plus the index that groups them by the
// venue that introduces them.
//
// A power page leads with what the reader came for (what the thing does, how
// long it runs, whether a second one is worth grabbing), then its authored
// paragraph, then the numbers of every effect block it carries, then how often
// it actually turns up. Nothing here sits behind a reveal: a power is not a
// spoiler — a player meets every one of them by picking it up off a floor, and
// the game never explains a single one.

import {
  cardFor,
  DEFAULT_CARD,
  dropFigure,
  escapeHtml,
  img,
  page,
  pageSchema,
  SITE_URL,
  table,
  TITLE,
} from "./html.mjs";
import { spriteSize } from "./art.mjs";
import {
  bombProse,
  powerDescription,
  powerLead,
  powerNotes,
  rarityProse,
  secondsLabel,
  valueLabel,
} from "./prose-powers.mjs";

// A tenth of a percent under 10% and a whole one above it — the difference
// between 1.2% and 0.5% is the whole point of the bailout table, while "20.0%"
// of a pool is a false precision. Trailing zeros trimmed either way.
const percent = (frac) =>
  `${Number((frac * 100).toFixed(frac < 0.1 ? 1 : 0))}%`;

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
 * How hard each power's card shines (og-card.mjs `flairLayer`) — off the
 * catalog's own rarity ladder rather than a table typed here, so a rebalance in
 * `content/powerups.yaml` moves the halo with it. An ordinary power gets
 * nothing, for the same reason a base item does: the halo has to MEAN rare.
 */
function powerFlair(power) {
  const { share } = power.rarity;
  if (share >= 1) return 0;
  if (share >= 0.5) return 1;
  if (share >= 0.25) return 2;
  return 3;
}

/** The accent a power reads in — the amber every pickup wears on the floor. */
const POWER_ACCENT = "#ffd75e";

/**
 * What this power's social card says and is drawn from. Called by BOTH the page
 * and the build, for the reason spelled out on `enemyCardSpec` — one function,
 * so the card a page names and the card that gets written are the same file.
 */
export function powerCardSpec(power) {
  return {
    slug: power.path.replace(/\//g, "-"),
    sprite: power.icon,
    venueId: power.introducedBy?.id ?? null,
    title: power.name,
    subtitle: power.instant
      ? "INSTANT"
      : `${secondsLabel(power.durationMs)} SECONDS`,
    rarity: "POWER",
    accent: POWER_ACCENT,
    titleColor: POWER_ACCENT,
    flair: powerFlair(power),
    // The first block's own numbers — the four a reader would ask for.
    rows: (power.effects[0]?.rows ?? []).slice(0, 4).map((row) => ({
      label: row.label,
      value: valueLabel(row),
    })),
    footLeft: "POWER",
    footRight: power.introducedBy?.name ?? "",
    alt: `${power.name} — a powerup in ${TITLE}`,
  };
}

// ---- the sections ---------------------------------------------------------------

/**
 * One effect block's numbers, led by the ART THAT BLOCK PUTS ON THE FIELD.
 *
 * The portrait shows what the pickup looks like lying on the floor; for half
 * the catalog that shares nothing at all with what you are then looking at (the
 * SENTRY GRID is a red panel on the ground and four guns once spent). The art
 * rides its block's own heading rather than a section of its own, because that
 * is where it means something — this picture is what these numbers describe —
 * and because a lone 4-px slug under a heading of its own is a section that
 * reads as a rendering fault.
 */
function effectSection(effect, power, sprites) {
  if (effect.rows.length === 0) return "";
  const art = power.art.find((entry) => entry.block === effect.block);
  const size = art ? spriteSize(art.sprite) : null;
  return `      <h3 id="effect-${escapeHtml(effect.block)}">${
    size
      ? img({
          src: `${sprites}${art.sprite}.png`,
          alt: `What ${power.name} puts on the field in ${TITLE}`,
          width: size.width,
          height: size.height,
          className: "sprite",
        })
      : ""
  }${escapeHtml(effect.title)}</h3>
${table({
  head: ["WHAT", "VALUE"],
  rows: effect.rows.map((row) => [escapeHtml(row.label), valueLabel(row)]),
})}`;
}

/**
 * Which venues' pools carry it, and what the pick actually comes to there —
 * or, for the one power no pool carries, the two channels the loot rules hand
 * it out on themselves.
 */
function poolsSection(power, base) {
  if (power.bomb) {
    return `      <h2 id="drops">How often it turns up</h2>
${paragraphs([...rarityProse(power), ...bombProse(power)])}
${table({
  caption: `The bailout's ceiling, per rung — the chance one kill on a field of ${power.bomb.crowd.full} coughs up a bomb.`,
  head: ["DIFFICULTY", "AT A PACKED FIELD"],
  rows: power.bomb.crowd.rungs.map((rung) => [
    escapeHtml(rung.name),
    rung.max > 0 ? percent(rung.max) : "never",
  ]),
})}`;
  }
  if (power.pools.length === 0) return "";
  return `      <h2 id="drops">How often it turns up</h2>
${paragraphs(rarityProse(power))}
${table({
  head: ["VENUE", "POOL", "WEIGHT", "SHARE OF THE POOL"],
  rows: power.pools.map((entry) => [
    `<a href="${base}library/${entry.venue.path}/">${escapeHtml(entry.venue.name)}</a>`,
    `${entry.poolSize} powers`,
    `${entry.weight}`,
    percent(entry.odds),
  ]),
})}`;
}

// ---- the pages ------------------------------------------------------------------

/** One power's page. */
export function powerPage(
  power,
  model,
  { base, groundFor, venueName, hasImages },
) {
  const sprites = `${base}library/sprites/`;
  const canonical = `${SITE_URL}${base}library/${power.path}/`;
  const description = powerDescription(power);
  const cardSpec = powerCardSpec(power);
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const size = spriteSize(power.icon);
  const venue = power.introducedBy ? venueName(power.introducedBy.id) : null;
  const dropShot =
    hasImages && venue
      ? dropFigure({
          src: `${base}library/shots/${cardSpec.slug}.webp`,
          alt: `${power.name}, a powerup in ${TITLE}, lying on the floor of ${venue} where it is first handed out`,
          caption: `${power.name} — the pickup, on ${venue}.`,
        })
      : "";

  const chips = [
    `<li class="chip tag">POWER</li>`,
    `<li class="chip">${escapeHtml(
      power.instant ? "INSTANT" : `RUNS ${secondsLabel(power.durationMs)} S`,
    )}</li>`,
    `<li class="chip tag">LEADS WITH ${escapeHtml(power.kind.toUpperCase())}</li>`,
    power.stackable ? `<li class="chip">STACKS</li>` : "",
    power.uniqueHeld ? `<li class="chip">ONE AT A TIME</li>` : "",
    power.introducedBy
      ? `<li class="chip"><a href="${base}library/${power.introducedBy.path}/">${escapeHtml(power.introducedBy.name)}</a></li>`
      : "",
  ].filter(Boolean);

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <div class="portrait">
        ${
          size
            ? img({
                src: `${sprites}${power.icon}.png`,
                alt: `${power.name}, as the pickup appears in ${TITLE}`,
                width: size.width,
                height: size.height,
                lazy: false,
              })
            : ""
        }
        <div class="portrait-body">
${paragraphs(powerLead(power))}
      <p class="flavor-plain">${escapeHtml(power.lore)}</p>
        </div>
      </div>
      <section class="panel pixel-panel">
      <h2 id="stats">What it does</h2>
${power.effects.map((effect) => effectSection(effect, power, sprites)).join("\n")}
${notesList(powerNotes(power, model))}
      </section>
${dropShot}
${poolsSection(power, base)}`;

  return page({
    base,
    path: power.path,
    title: `${power.name} — ${TITLE} powers`,
    description,
    heading: power.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "POWERS", href: `${base}library/powers/` },
      { label: power.name },
    ],
    ground: groundFor(power.introducedBy?.id ?? null),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${power.name} — ${TITLE} powers`,
      description,
      // Same object as the og:image tag — see the note in render-bestiary.
      image: card.url,
    }),
  });
}

/** A rack of power links, each with its pickup icon. */
function rack(powers, base, sprites) {
  return `      <ul class="roster">
${powers
  .map((power) => {
    const size = spriteSize(power.icon);
    return `        <li><a href="${base}library/${power.path}/">${
      size
        ? img({
            src: `${sprites}${power.icon}.png`,
            alt: "",
            width: size.width,
            height: size.height,
          })
        : ""
    }<span>${escapeHtml(power.name)}</span><span class="req">${escapeHtml(
      // The space is load-bearing: in the game's pixel font a trailing `S`
      // hard against a digit reads as a 5, so `14S` is a fourteen-second power
      // that says a hundred and forty-five.
      power.instant ? "INSTANT" : `${secondsLabel(power.durationMs)} S`,
    )}</span></a></li>`;
  })
  .join("\n")}
      </ul>`;
}

/**
 * The powers index, grouped by the venue that introduces each one.
 *
 * That grouping is the campaign's own rule rather than a filing convenience:
 * every map brings two new powers and keeps everything that came before, so the
 * dock's vocabulary grows the whole way down and each venue is announced by two
 * things that could only have come from there. A flat A-to-Z would have thrown
 * that away, and it is the single most useful thing the section knows.
 */
export function powersIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/powers/`;
  const sprites = `${base}library/sprites/`;
  const powers = model.powers;

  const groups = model.groups
    .map((group) => {
      const where = group.venue
        ? `<a href="${base}library/${group.venue.path}/">${escapeHtml(group.venue.name)}</a>`
        : "ELSEWHERE";
      return `      <h2 id="${escapeHtml(group.venue?.id.replace(/_/g, "-") ?? "no-pool")}">${
        group.venue ? escapeHtml(group.venue.name) : "OFF THE POOLS"
      }<span class="count">${group.entries.length}</span></h2>
      <p>${
        group.venue
          ? `Brought into the campaign by ${where}.`
          : "In no venue's loot pool: the loot rules hand these out on channels of their own."
      }</p>
${rack(group.entries, base, sprites)}`;
    })
    .join("\n");

  const description = `Every one of the ${powers.length} powerups in ${TITLE} — what each power does, its numbers, how long it runs, whether it stacks and which venues drop it.`;

  return page({
    base,
    path: "powers",
    title: `Powers — every powerup in ${TITLE}`,
    description,
    heading: "THE POWERS",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "POWERS" },
    ],
    ground: groundFor(null),
    body: `      <p class="lede">All ${powers.length} powerups: what each one does,
      what its numbers are, how long it runs, whether a second copy is worth
      picking up, and how often it actually turns up.</p>
      <p>A power is not an item: it is banked on touch, never enters the bag,
      and is a few seconds of changed rules rather than a thing you wear — which
      is also why the game never gets a chance to explain one.${
        model.groups.some((group) => group.venue)
          ? ` They are filed the way the campaign hands them out, venue by venue,
      each pool keeping most of what came before it — so the list a run draws
      from gets deeper, and every individual power rarer, the further down it
      goes.`
          : ""
      }</p>
${groups}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Powers — every powerup in ${TITLE}`,
      description,
    }),
  });
}
