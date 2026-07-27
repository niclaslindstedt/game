// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ARSENAL — one page per item, plus the index that racks them by rarity
// and by slot.
//
// The centrepiece of an item page is THE IN-GAME ITEM CARD. Not a lookalike:
// the markup here wears the app's own `.item-card` / `.tier-*` / `.card-foot`
// class names and the stylesheet it is styled by is the very file the game
// imports (pwa/src/lib/item-card.css, inlined by ./styles.mjs), so the card a
// reader sees is the card the game draws — same fill, same rarity ring, same
// glow — and the two cannot drift apart. The one thing that differs is HOW the
// text is drawn: the game blits PixelText canvases, a document sets the same
// words in the WOFF2 packed from the same glyph map.

import {
  TIER_COLORS,
  TIER_LABELS,
  affixColor,
  tierGlowClass,
} from "./catalogs.mjs";
import { spriteSize } from "./art.mjs";
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
import { list } from "./prose.mjs";
import {
  REFERENCE_NOTE,
  TIER_LABEL,
  bandLabel,
  gearShapeNotes,
  itemDescription,
  itemLead,
  namedOddsNote,
  pairLabel,
  qualityIntro,
  sourceLines,
  tradeNotes,
  weaponShapeNotes,
} from "./prose-arsenal.mjs";

const SLOT_LABEL = {
  weapon: "WEAPON",
  head: "HEAD",
  chest: "CHEST",
  legs: "LEGS",
  feet: "FEET",
  charm: "CHARM",
  bag: "BAG",
};

/** The rarity racks the index is built from, best first. */
const RACKS = [
  {
    tier: "artifact",
    blurb: "The level-99 chase — the rarest things in the game.",
  },
  {
    tier: "legendary",
    blurb: "Orange. Dropped from HARD up, and rarely even there.",
  },
  {
    tier: "set",
    blurb: "The five bosses' green kits, farmed a piece at a time.",
  },
  {
    tier: "unique",
    blurb: "Gold. The named relics, each with its own fixed block.",
  },
];

const oneDp = (n) => (Number.isInteger(n) ? `${n}` : n.toFixed(1));
const percent = (frac) => `${Math.round(frac * 100)}%`;

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

// ---- the card -------------------------------------------------------------------

/** One line inside the card: a white label and a grey value, as in the game. */
const cardRow = (label, value) =>
  `        <div class="tooltip-row"><span class="card-label">${escapeHtml(label)}</span><span class="card-value">${escapeHtml(value)}</span></div>`;

/**
 * The stat lines a card carries, in the order the in-game card lists them — as
 * DATA, `{ label, value }`.
 *
 * Kept apart from the markup because two surfaces draw these same lines: the
 * page's HTML card (`cardRows` below) and the drop shot's baked card
 * (drop-shot.mjs), which is a PNG and so cannot reuse markup at all. Sharing the
 * strings is the only thing that keeps a weapon's damage from reading one way in
 * the document and another in the picture beside it.
 */
export function cardRowData(item) {
  const rows = [];
  const s = item.stats;
  if (item.slot === "weapon") {
    rows.push({ label: "DAMAGE", value: bandLabel(s.damage) });
    rows.push({ label: "DPS", value: oneDp(s.dps) });
    rows.push({ label: "SPEED", value: s.cadenceSec.toFixed(2) });
    rows.push({ label: "RANGE", value: `${Math.round(s.reach)}` });
  } else {
    if (s.armor != null) {
      rows.push({
        label: "ARMOR",
        value: `${s.armor} · ${s.armorType.toUpperCase()}`,
      });
    }
    if (s.bonuses?.maxHp) {
      rows.push({ label: "+MAX HP", value: `${s.bonuses.maxHp}` });
    }
    if (s.bonuses?.critChance) {
      rows.push({ label: "+CRIT", value: percent(s.bonuses.critChance) });
    }
    if (s.bagSlots) rows.push({ label: "BAG SLOTS", value: `+${s.bagSlots}` });
  }
  return rows;
}

/** Those same lines as the page's markup. */
function cardRows(item) {
  return cardRowData(item).map((row) => cardRow(row.label, row.value));
}

/**
 * The item card. `.item-card` and the tier classes come from the game's own
 * stylesheet — see the note at the top of this file.
 */
export function itemCard(item, sprites) {
  const size = spriteSize(item.icon);
  const color = TIER_COLORS[item.tier] ?? TIER_COLORS.regular;
  const bonuses = (item.bonuses ?? [])
    .map(
      (bonus) =>
        `        <div class="tooltip-row"><span style="color:${escapeHtml(affixColor(bonus.affix))}">${escapeHtml(bonus.line)}</span></div>`,
    )
    .join("\n");
  const setBlock = item.set
    ? `        <div class="item-card-set">
          <div class="card-set-name">${escapeHtml(item.set.name)}</div>
${item.set.members
  .map(
    (member) =>
      `          <div class="card-set-member${member.self ? " self" : ""}">${escapeHtml(member.name)}</div>`,
  )
  .join("\n")}
${item.set.bonuses
  .map((tierBonus) =>
    tierBonus.lines
      .map(
        (line) =>
          `          <div class="card-set-bonus">(${tierBonus.pieces}) ${escapeHtml(line)}</div>`,
      )
      .join("\n"),
  )
  .join("\n")}
        </div>`
    : "";

  return `      <div class="item-card${tierGlowClass(item.tier)}" style="border-color:${escapeHtml(color)}">
        <div class="tooltip-name-row">${
          size
            ? img({
                src: `${sprites}${item.icon}.png`,
                alt: "",
                width: size.width,
                height: size.height,
                className: "pixel-img card-icon",
              })
            : ""
        }<span class="card-name" style="color:${escapeHtml(color)}">${escapeHtml(item.name)}</span></div>
${item.ilvl != null ? `        <div class="card-ilvl">ITEM LEVEL ${item.ilvl}</div>\n` : ""}${cardRows(item).join("\n")}
${bonuses}${bonuses && setBlock ? "\n" : ""}${setBlock}
${
  TIER_LABELS[item.tier]
    ? `        <div class="card-tier" style="color:${escapeHtml(color)}">${escapeHtml(TIER_LABELS[item.tier])}</div>\n`
    : ""
}        <div class="card-foot">REQUIRES LEVEL ${item.levelReq}</div>
      </div>`;
}

// ---- the sections ------------------------------------------------------------------

function qualitySection(item) {
  const quality = item.quality;
  if (!quality) return "";
  const headline = item.family === "weapon" ? "DAMAGE" : "ARMOR";
  const rows = quality.rows.map((row) => [
    escapeHtml(row.prefix || "NORMAL"),
    row.value ? pairLabel(row.value) : "—",
    `${row.band[0].toFixed(2)}–${row.band[1].toFixed(2)}×`,
    percent(row.oddsLow),
    percent(row.oddsHigh),
  ]);
  return `      <h2 id="quality">Make quality</h2>
${paragraphs(qualityIntro(item, quality))}
${table({
  head: [
    "MAKE",
    headline,
    "SCALE",
    "ODDS AT MLVL 1",
    `ODDS AT MLVL ${quality.highMlvl}`,
  ],
  rows,
})}`;
}

function ladderSection(item) {
  if (item.ladder.length === 0) return "";
  const weapon = item.family === "weapon";
  const rows = item.ladder.map((rung) => [
    escapeHtml(rung.name),
    `${rung.levelReq}`,
    weapon ? bandLabel(rung.stats.damage) : `${rung.stats.armor ?? "—"}`,
    weapon ? oneDp(rung.stats.dps) : `${rung.stats.durability ?? "—"}`,
    weapon
      ? oneDp(rung.stats.targets)
      : (rung.stats.armorType ?? "—").toUpperCase(),
  ]);
  rows.unshift([
    `${escapeHtml(item.name)} <span class="dim">(normal)</span>`,
    `${item.levelReq}`,
    weapon ? bandLabel(item.stats.damage) : `${item.stats.armor ?? "—"}`,
    weapon ? oneDp(item.stats.dps) : `${item.stats.durability ?? "—"}`,
    weapon
      ? oneDp(item.stats.targets)
      : (item.stats.armorType ?? "—").toUpperCase(),
  ]);

  return `      <h2 id="grades">What it becomes</h2>
      <p>The same shape comes back twice more, further down the campaign: an
      EXCEPTIONAL version and an ELITE one, generated from this base rather
      than authored beside it. They keep its look, its cadence, its reach and
      its arc; what changes is the level they ask for and the numbers priced
      onto the curve at it. A venue that pays this base pays its whole ladder,
      so a first-map find keeps dropping — as something else — into the
      endgame.</p>
${table({
  head: weapon
    ? ["GRADE", "REQUIRES", "DAMAGE", "DPS", "REACHES"]
    : ["GRADE", "REQUIRES", "ARMOR", "WEARS", "MATERIAL"],
  rows,
})}${
    weapon
      ? `
      <p class="note">The per-hit blow barely moves up the ladder, and that is
      the point: a longer-reaching weapon in a bigger build sweeps a wider
      slice of the crowd, so the same damage budget buys more total output at a
      similar figure per target. Read the REACHES column beside the DPS one.</p>`
      : ""
  }`;
}

function sourcesSection(item, base) {
  const href = (path) => `${base}library/${path}/`;
  // A grade variant reaches a player through its ancestor's pool entry, which
  // is the very entry the base's own sources already name — so listing those
  // again would print each venue twice and say nothing new. Only a variant
  // named somewhere in its OWN right adds a line; the sentence under the list
  // covers the rest.
  const viaLadder = (item.ladderSources ?? []).filter(
    (source) => !source.viaGrade,
  );
  const lines = sourceLines([...item.sources, ...viaLadder], href);
  const odds =
    item.kind === "named" ? namedOddsNote(item, item.tierOdds) : null;
  if (lines.length === 0 && !odds) return "";

  return `      <h2 id="drops">Where it comes from</h2>
${
  lines.length > 0
    ? `      <ul class="notes">
${lines.map((line) => `        <li>${line}.</li>`).join("\n")}
      </ul>
${
  item.ladder.length > 0
    ? `      <p>Every one of those pools carries ${list(
        item.ladder.map((rung) => escapeHtml(rung.name)),
      )} along with it — the game expands a pool entry into its whole grade
      family at roll time — so the same venues keep paying this shape out at
      requirements ${item.ladder[item.ladder.length - 1].levelReq} deep.</p>`
    : ""
}`
    : `      <p>Nothing in the campaign is authored to hand it over, so it only
      turns up where the general loot rules reach it.</p>`
}${
    odds
      ? `\n${(Array.isArray(odds) ? odds : [odds])
          .map((line) => `      <p>${escapeHtml(line)}</p>`)
          .join("\n")}`
      : ""
  }`;
}

function namedOnItSection(item, base) {
  if (item.namedOnIt.length === 0) return "";
  return `      <h2 id="named">Named items built on it</h2>
      <p>${
        item.namedOnIt.length === 1 ? "One relic wears" : "These relics wear"
      } this base's shape and numbers, with an authored block of bonuses on
      top.</p>
      <ul class="chip-row">${item.namedOnIt
        .map(
          (named) =>
            `<li class="chip tier-chip-${escapeHtml(named.tier)}"><a href="${base}library/${named.path}/">${escapeHtml(named.name)}</a></li>`,
        )
        .join("")}</ul>`;
}

function setSection(item, base) {
  const set = item.set;
  if (!set) return "";
  return `      <h2 id="set">${escapeHtml(set.name)}</h2>
      <p>A boss's green kit, themed to one weapon class — this one to
      ${escapeHtml(set.weaponClass)}. Wearing several pieces at once pays
      bonuses on top of each piece's own, and the thresholds stack, so the full
      kit carries every tier at once.</p>
      <ul class="roster">
${set.members
  .map((member) =>
    member.self
      ? `        <li><span class="self">${escapeHtml(member.name)} <span class="dim">(this piece)</span></span></li>`
      : `        <li><a href="${base}library/${member.path}/">${escapeHtml(member.name)}</a></li>`,
  )
  .join("\n")}
      </ul>
${table({
  head: ["WORN", "GRANTS"],
  rows: set.bonuses.map((tierBonus) => [
    `${tierBonus.pieces} pieces`,
    escapeHtml(tierBonus.lines.join(", ")),
  ]),
})}`;
}

// ---- the pages ------------------------------------------------------------------

/**
 * How hard each tier's card shines (og-card.mjs `flairLayer`). It climbs with
 * the same ladder the tier colours do, and the two commonest tiers get nothing:
 * the halo has to MEAN rare, so the bases a player drowns in must not wear it.
 */
const TIER_FLAIR = {
  trash: 0,
  regular: 0,
  magic: 1,
  rare: 1,
  set: 2,
  unique: 2,
  legendary: 3,
  artifact: 3,
};

/**
 * What this item's social card says and is drawn from. Called by BOTH the page
 * and the build, for the reason spelled out on `enemyCardSpec` — one function,
 * so the card a page names and the card that gets written are the same file.
 *
 * The accent is the item's own tier colour, the very value the page's rarity
 * ring and card foot are drawn in, so an artifact unfurls searing red and a
 * magic base unfurls blue without this module knowing what either word means.
 */
export function itemCardSpec(item) {
  const color = TIER_COLORS[item.tier] ?? TIER_COLORS.regular;
  return {
    slug: item.path.replace(/\//g, "-"),
    sprite: item.icon,
    title: item.name,
    // Two lines, not one label: the level is the fact a reader is after, so it
    // gets the big line; the tier is the classification and sits smaller under
    // it (og-card.mjs).
    subtitle: `LEVEL ${item.levelReq}`,
    rarity: TIER_LABEL[item.tier] ?? item.tier.toUpperCase(),
    accent: color,
    // The NAME wears the rarity, exactly as the game draws it on an item card
    // and in the inventory grid — it is the read a player already knows, so a
    // card that gilds its title is saying "unique" before it says anything.
    titleColor: color,
    flair: TIER_FLAIR[item.tier] ?? 0,
    // The drop shot's card quotes the page's own card lines — same numbers, one
    // source (`cardRowData`), so the picture can't contradict the document.
    rows: cardRowData(item).slice(0, 4),
    footLeft: TIER_LABELS[item.tier] ?? "",
    footRight: `REQUIRES LEVEL ${item.levelReq}`,
    alt: `${item.name} — ${(TIER_LABEL[item.tier] ?? item.tier).toLowerCase()} in ${TITLE}`,
  };
}

/** One item's page. */
export function itemPage(
  item,
  { base, groundFor, venueOf, venueName, hasImages },
) {
  const sprites = `${base}library/sprites/`;
  const canonical = `${SITE_URL}${base}library/${item.path}/`;
  const description = itemDescription(item);
  const cardSpec = itemCardSpec(item);
  // Without a generated set this build has no card of its own to name, so the
  // page wears the site default rather than pointing `og:image` at a 404.
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const venueId = venueOf(item);
  const venue = venueName(venueId);
  const tierWord = (TIER_LABEL[item.tier] ?? item.tier).toLowerCase();
  const dropShot =
    hasImages && venue
      ? dropFigure({
          src: `${base}library/shots/${cardSpec.slug}.webp`,
          alt: `${item.name}, a ${tierWord} ${SLOT_LABEL[item.slot]?.toLowerCase() ?? item.slot} in ${TITLE}, shown on the map of ${venue} where it drops`,
          caption: `${item.name} — where it drops, in ${venue}.`,
        })
      : "";

  const chips = [
    `<li class="chip tier-chip-${escapeHtml(item.tier)}">${escapeHtml(TIER_LABEL[item.tier] ?? item.tier.toUpperCase())}</li>`,
    `<li class="chip">${escapeHtml(SLOT_LABEL[item.slot] ?? item.slot.toUpperCase())}</li>`,
    item.weaponClass
      ? `<li class="chip tag">${escapeHtml(item.weaponClass.toUpperCase())}</li>`
      : "",
    `<li class="chip">LEVEL ${item.levelReq}</li>`,
    item.world ? `<li class="chip tag">WORLD RELIC</li>` : "",
    item.keeper ? `<li class="chip tag">KEEPER</li>` : "",
  ].filter(Boolean);

  const shape =
    item.slot === "weapon"
      ? weaponShapeNotes(item.stats)
      : gearShapeNotes(item);
  const notes = [...shape, ...tradeNotes(item)];

  const lore =
    item.kind === "named"
      ? `      <blockquote class="flavor"><p>${escapeHtml(item.lore)}</p></blockquote>${
          item.base.description
            ? `\n      <p class="note">Underneath the name it is a
      <a href="${base}library/${item.base.path}/">${escapeHtml(item.base.name)}</a>:
      ${escapeHtml(item.base.description)}</p>`
            : ""
        }`
      : item.description
        ? `      <p class="flavor-plain">${escapeHtml(item.description)}</p>`
        : "";

  const durability =
    item.slot === "weapon" && item.stats.durability
      ? `      <p class="note">A dropped copy carries ${item.stats.durability} swings of wear.
      At zero it does not shatter — it falls into the bag unusable until a
      repair kit mends it, and the hero draws the best thing left.</p>`
      : "";

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <div class="portrait item-portrait">
${itemCard(item, sprites)}
        <div class="portrait-body">
${paragraphs(itemLead(item, item.sources))}
${lore}
        </div>
      </div>
      <section class="panel pixel-panel">
      <h2 id="stats">What it does</h2>
${notesList(notes)}
${durability}
      <p class="note">${escapeHtml(REFERENCE_NOTE)}</p>
      </section>
${
  item.kind === "named"
    ? `      <h2 id="bonuses">Its bonuses</h2>
      <p>Fixed on every copy. Only the base damage${item.slot === "weapon" ? "" : " and armor"} moves,
      by a ±${percent(item.baseRollBand)} band rolled per drop — so two copies differ a
      little and a well-rolled one is worth keeping.</p>
      <ul class="notes">
${item.bonuses
  .map(
    (bonus) =>
      `        <li><span class="stat-key" style="color:${escapeHtml(affixColor(bonus.affix))}">${escapeHtml(bonus.line)}</span></li>`,
  )
  .join("\n")}
      </ul>`
    : ""
}
${setSection(item, base)}
${qualitySection(item)}
${ladderSection(item)}
${namedOnItSection(item, base)}
${dropShot}
${sourcesSection(item, base)}`;

  return page({
    base,
    path: item.path,
    title: `${item.name} — ${TITLE} arsenal`,
    description,
    heading: item.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ARSENAL", href: `${base}library/arsenal/` },
      { label: item.name },
    ],
    ground: groundFor(venueOf(item)),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${item.name} — ${TITLE} arsenal`,
      description,
      // Same object as the og:image tag — see the note in render-bestiary.
      image: card.url,
    }),
  });
}

/** A rack of item links, each with its icon. */
function rack(items, base, sprites) {
  return `      <ul class="roster">
${items
  .map((item) => {
    const size = spriteSize(item.icon);
    return `        <li><a href="${base}library/${item.path}/">${
      size
        ? img({
            src: `${sprites}${item.icon}.png`,
            alt: "",
            width: size.width,
            height: size.height,
          })
        : ""
    }<span class="tier-text-${escapeHtml(item.tier)}">${escapeHtml(item.name)}</span><span class="req">L${item.levelReq}</span></a></li>`;
  })
  .join("\n")}
      </ul>`;
}

/** The arsenal index: the named chase by rarity, then the bases by slot. */
export function arsenalIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/arsenal/`;
  const sprites = `${base}library/sprites/`;
  const byLevel = (a, b) =>
    a.levelReq - b.levelReq || a.name.localeCompare(b.name);

  const chase = RACKS.map((entry) => {
    const items = model.named
      .filter((item) => item.tier === entry.tier)
      .sort((a, b) => b.ilvl - a.ilvl || a.name.localeCompare(b.name));
    if (items.length === 0) return "";
    return `      <h2 id="${entry.tier}">${escapeHtml(TIER_LABEL[entry.tier])}<span class="count">${items.length}</span></h2>
      <p>${escapeHtml(entry.blurb)}</p>
${rack(items, base, sprites)}`;
  })
    .filter(Boolean)
    .join("\n");

  const slots = ["weapon", "head", "chest", "legs", "feet", "charm", "bag"]
    .map((slot) => {
      const items = model.bases
        .filter((item) => item.slot === slot)
        .sort(byLevel);
      if (items.length === 0) return "";
      return `      <h3 id="slot-${slot}">${escapeHtml(SLOT_LABEL[slot])}<span class="count">${items.length}</span></h3>
${rack(items, base, sprites)}`;
    })
    .filter(Boolean)
    .join("\n");

  const description = `Every one of the ${model.items.length} items in ${TITLE} — ${model.named.length} named relics and ${model.bases.length} base items, with damage, armor, level requirements, make quality and what drops each.`;

  return page({
    base,
    path: "arsenal",
    title: `Arsenal — every item in ${TITLE}`,
    description,
    heading: "THE ARSENAL",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ARSENAL" },
    ],
    ground: groundFor(null),
    body: `      <p class="lede">All ${model.items.length} items: ${model.named.length} named
      relics on the chase ladder, and ${model.bases.length} base types under
      them. Damage, armor, level requirements, what each one upgrades into, and
      what drops it.</p>
${chase}
      <h2 id="bases">Base items<span class="count">${model.bases.length}</span></h2>
      <p>The plain finds — the centre of a spread rather than a row. Each rolls
      a make quality from BROKEN to PERFECT, and each climbs into an
      EXCEPTIONAL and an ELITE version later in the campaign, so a base you
      meet on the first map is still dropping on the last one.</p>
${slots}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Arsenal — every item in ${TITLE}`,
      description,
    }),
  });
}
