// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE BESTIARY — one page per monster, plus the index that groups them by the
// place you meet them.
//
// A monster page leads with what the reader came for (what this thing is, and
// what it does to you), then the numbers, then what it drops, and only at the
// bottom — behind the reveal — what it SAYS. An empty section is never
// rendered: a monster with no mechanics has no MECHANICS heading, rather than
// one with nothing under it.

import {
  ENEMY_DEFS,
  GEAR_DEFS,
  UNIQUE_DEFS,
  WEAPON_DEFS,
  isGradeVariant,
  itemIcon,
  itemName,
} from "./catalogs.mjs";
import { itemPath } from "./model-arsenal.mjs";
import { missionPath } from "./model-missions.mjs";
import {
  cardFor,
  dropFigure,
  escapeHtml,
  img,
  page,
  pageSchema,
  reveal,
  SITE_URL,
  storeNudge,
  table,
  TITLE,
} from "./html.mjs";
import { spriteSize } from "./art.mjs";
import {
  contactLabel,
  dropProse,
  hpLabel,
  lead,
  levelLabel,
  list,
  mechanicsProse,
  metaDescription,
  sightingProse,
  traitNotes,
  xpLabel,
} from "./prose.mjs";

const ROLE_LABEL = { minion: "MONSTER", elite: "ELITE", boss: "BOSS" };

/** The colours the page's own role chips wear (styles.mjs), so a card agrees. */
const ROLE_ACCENT = {
  minion: "#98a0aa",
  elite: "#ffd75e",
  boss: "#ff8c42",
};

/** A monster's rank is its rarity — see `TIER_FLAIR` in render-arsenal.mjs. The
 * rank and file get no halo, so the ones that do read as the event they are. */
const ROLE_FLAIR = { minion: 0, elite: 2, boss: 3 };

/**
 * What this monster's social card says and is drawn from.
 *
 * Both the PAGE (which names the card in `og:image`) and the BUILD (which
 * renders the PNG) call this, so the file a page points at and the file that
 * gets written cannot end up with different names — the failure mode being ~100
 * pages whose card 404s, which no test would otherwise notice because the
 * markup is perfectly well-formed either way.
 */
export function enemyCardSpec(enemy) {
  return {
    slug: enemy.path.replace(/\//g, "-"),
    sprite: enemy.sprite,
    venueId: enemy.home?.id ?? null,
    title: enemy.name,
    // Same split as an item's card: the place is the fact, the rank is the
    // classification and sits smaller beneath it.
    subtitle: enemy.home?.name ?? "",
    rarity: ROLE_LABEL[enemy.role],
    accent: ROLE_ACCENT[enemy.role] ?? ROLE_ACCENT.minion,
    // Same read as the bestiary roster, where a boss's name is already orange
    // and an elite's amber — the rank IS the rarity for a monster.
    titleColor: ROLE_ACCENT[enemy.role] ?? "#e6e8eb",
    flair: ROLE_FLAIR[enemy.role] ?? 0,
    // The same four numbers the page's stat block opens with (`statsBlock`).
    rows: [
      { label: "HEALTH", value: `${enemy.base.hp}` },
      { label: "CONTACT DAMAGE", value: `${enemy.base.contactDamage}` },
      { label: "SPEED", value: `${enemy.base.speed}/s` },
      { label: "CRIT CHANCE", value: `${Math.round(enemy.base.critChance * 100)}%` },
    ],
    footLeft: ROLE_LABEL[enemy.role],
    footRight: enemy.home?.name ?? "",
    alt: `${enemy.name} — ${ROLE_LABEL[enemy.role].toLowerCase()} in ${TITLE}`,
  };
}

/** True when the arsenal carries a page for this id — everything equippable
 * does; a story item (a keycard, a dossier) does not. */
const hasItemPage = (id) => {
  const def = WEAPON_DEFS[id] ?? GEAR_DEFS[id];
  // A generated grade variant has no page of its own — it is described on the
  // base it was generated from, which is where a link would have to land.
  if (def) return !isGradeVariant(def);
  return id in UNIQUE_DEFS;
};

/** The rarity an id reads in, so a relic in a drop list wears its own colour
 * here exactly as it does on the item card. */
const itemTier = (id) =>
  UNIQUE_DEFS[id] ? (UNIQUE_DEFS[id].tier ?? "unique") : null;

const paragraphs = (lines) =>
  lines.map((line) => `        <p>${escapeHtml(line)}</p>`).join("\n");

/**
 * A named thing with its icon, as one inline run — and, whenever the arsenal
 * has a page for it, a LINK to that page. This is the whole point of a drop
 * list: a monster's page is where a reader finds out what it hands over, and it
 * is worthless if finding out what THAT is means going back to a search box.
 * Story items (keycards, dossiers) have no arsenal page, so they stay plain.
 */
function itemChip(id, sprites, base) {
  const icon = itemIcon(id);
  const size = icon ? spriteSize(icon) : null;
  const art = size
    ? `${img({
        src: `${sprites}${icon}.png`,
        alt: "",
        width: size.width,
        height: size.height,
        className: "sprite",
      })} `
    : "";
  const name = escapeHtml(itemName(id));
  const tier = itemTier(id);
  const body = hasItemPage(id)
    ? `<a href="${base}library/${itemPath(id)}/">${name}</a>`
    : name;
  return `<li class="chip${tier ? ` tier-chip-${tier}` : ""}">${art}${body}</li>`;
}

const chipRow = (ids, sprites, base) =>
  ids.length === 0
    ? ""
    : `      <ul class="chip-row">${ids.map((id) => itemChip(id, sprites, base)).join("")}</ul>`;

// ---- the sections -----------------------------------------------------------

function statsBlock(enemy) {
  const b = enemy.base;
  const stats = [
    ["CATALOG HEALTH", b.hp],
    ["CONTACT DAMAGE", b.contactDamage],
    ["HITS EVERY", `${(b.contactCooldownMs / 1000).toFixed(2)}s`],
    ["SPEED", `${b.speed}/s`],
    ["SIZE", `${b.radius * 2} across`],
    ["CRIT CHANCE", `${Math.round(b.critChance * 100)}%`],
  ];
  if (b.dodgeChance !== null)
    stats.push(["DODGES", `${Math.round(b.dodgeChance * 100)}%`]);
  if (b.levelBonus) stats.push(["ABOVE THE HORDE", `+${b.levelBonus} levels`]);
  stats.push(["NOTICES YOU AT", b.aggroRadius]);

  return `      <ul class="stats">
${stats
  .map(
    ([key, value]) =>
      `        <li><span class="stat-key">${escapeHtml(key)}</span><span class="stat-val">${escapeHtml(value)}</span></li>`,
  )
  .join("\n")}
      </ul>
      <p class="note">The catalog's own figures: this monster before any level
      has placed it. The difficulty ladder then sets the level it actually
      spawns at — and, for a hand-placed fight like a boss, overrides its health
      outright — so the numbers under “Where you meet it” are the ones you
      really face, and they will not match the row above.</p>`;
}

function fieldSection(enemy, base) {
  const withRungs = enemy.sightings.filter((s) => s.rungs.length > 0);
  if (withRungs.length === 0) return "";
  return withRungs
    .map((sighting, i) => {
      const prose = sightingProse(enemy, sighting);
      const rows = sighting.rungs.map((rung) => [
        `<span style="color:${escapeHtml(rung.color)}">${escapeHtml(rung.name)}</span>`,
        levelLabel(rung),
        hpLabel(rung),
        contactLabel(rung),
        xpLabel(rung),
      ]);
      return `      <h3><a href="${base}library/${missionPath(sighting.venue.id)}/">${escapeHtml(sighting.venue.name)}</a></h3>
${prose.length ? paragraphs(prose) : ""}
${table({
  // Said once, on the first table — a caption repeated under every venue is
  // noise the second time a reader meets it.
  caption:
    i === 0
      ? "JESUS is the one rung that scales to the hero rather than to an authored number, so it has no fixed figure to state and is left out."
      : null,
  head: ["DIFFICULTY", "LEVEL", "HEALTH", "DAMAGE", "XP"],
  rows,
})}`;
    })
    .join("\n");
}

function mechanicsSection(enemy, base) {
  const sets = [];
  if (enemy.mechanics) sets.push({ label: null, mechanics: enemy.mechanics });
  for (const phase of enemy.phases) {
    sets.push({
      label: `Below ${Math.round(phase.belowHpFrac * 100)}% health it switches to:`,
      mechanics: phase.mechanics,
    });
  }
  if (sets.length === 0) return "";

  const blocks = sets
    .map(({ label, mechanics }) => {
      const moves = mechanicsProse(mechanics);
      if (moves.length === 0) return "";
      return `${label ? `      <p>${escapeHtml(label)}</p>\n` : ""}      <ul class="notes">
${moves
  .map((move) => {
    const summoned = move.summons ? ENEMY_DEFS[move.summons] : null;
    const link = summoned
      ? ` It calls <a href="${base}library/bestiary/${escapeHtml(move.summons.replace(/_/g, "-"))}/">${escapeHtml(summoned.name)}</a>.`
      : "";
    return `        <li><span class="stat-key">${escapeHtml(move.title)}</span>${escapeHtml(move.text)}${link}</li>`;
  })
  .join("\n")}
      </ul>`;
    })
    .filter(Boolean)
    .join("\n");
  if (!blocks) return "";

  return `      <h2 id="mechanics">Mechanics</h2>
      <p>Every dangerous move is telegraphed — it roots, it winds up, and you
      get the beat you need to be somewhere else.</p>
${blocks}`;
}

function rangedSection(enemy) {
  const r = enemy.traits.ranged;
  if (!r) return "";
  return `      <h2 id="shooting">Its shot</h2>
      <p>It fires every ${(r.cooldownMs / 1000).toFixed(1)}s from up to ${r.range} away,
      for ${r.damage} before your armor turns its share. Walls eat the shot and a
      jump clears it.${r.takesCover ? " Between shots it puts the nearest solid thing between you and it, and only steps back out as the reload runs down." : ""}</p>`;
}

function dropsSection(enemy, sprites, base) {
  const drops = enemy.drops;
  if (!drops) return "";
  const lines = dropProse(enemy);
  const blocks = [];

  if (drops.items.length > 0) {
    blocks.push(`      <h3>Always drops</h3>
${chipRow(
  drops.items.map((i) => i.id),
  sprites,
  base,
)}${
      drops.items.some((i) => i.requiresClear)
        ? `\n      <p>${escapeHtml(
            list(
              drops.items
                .filter((i) => i.requiresClear)
                .map(
                  (i) =>
                    `${itemName(i.id)} stays latent until ${i.requiresClear.replace(/_/g, " ").toUpperCase()} has been beaten`,
                ),
            ),
          )}.</p>`
        : ""
    }`);
  }
  if (drops.uniqueItems.length > 0) {
    blocks.push(`      <h3>Named relics it always hands over</h3>
${chipRow(drops.uniqueItems, sprites, base)}`);
  }
  if (drops.storyItems.length > 0) {
    blocks.push(`      <h3>Story items</h3>
${chipRow(drops.storyItems, sprites, base)}`);
  }
  if (drops.uniques.length > 0) {
    blocks.push(`      <h3>Named relics it can roll</h3>
      <p>Gated to the rung you beat it on, and rolled against the monster's own
      level, so the deeper rungs open names the shallow ones never see.</p>
${drops.uniques
  .map(
    (entry) => `      <h4 class="stat-key">${escapeHtml(entry.name)}</h4>
${chipRow(entry.ids, sprites, base)}`,
  )
  .join("\n")}`);
  }

  if (lines.length === 0 && blocks.length === 0) return "";
  return `      <h2 id="drops">What it drops</h2>
${lines.length ? paragraphs(lines) : ""}
${blocks.join("\n")}`;
}

function storySection(enemy, base) {
  const { dialogue, lastWords } = enemy.story;
  const spareable = enemy.traits.spareable;
  if (dialogue.length === 0 && lastWords.length === 0 && !spareable) return "";

  // Where this fight sits in the plot. The hellborn belong to no mission — they
  // are what a rampage lets in — so they read their own chapter.
  const chapterSlug = enemy.hellborn ? "the-hellborn" : enemy.home?.slug;

  const pages = dialogue
    .map((entry) => {
      const hero = !Array.isArray(entry);
      const lines = hero ? entry.hero : entry;
      return `      <blockquote class="speech${hero ? " hero" : ""}">
        <span class="who">${escapeHtml(hero ? "THE HERO" : enemy.name)}</span>
        <p>${lines.map(escapeHtml).join("<br />")}</p>
      </blockquote>`;
    })
    .join("\n");

  const last =
    lastWords.length > 0
      ? `      <h3>Last words</h3>
      <blockquote class="speech">
        <p>${lastWords.map(escapeHtml).join("<br />")}</p>
      </blockquote>`
      : "";

  const spare = spareable
    ? `      <p>Beaten, it kneels rather than dies, and the run stops for your
      verdict. Spare it and ${escapeHtml(spareable.name)} fights at your side for
      the rest of the campaign, handing over its story items but keeping its own
      kit. Kill it and the withheld blow lands.</p>`
    : "";

  return `      <h2 id="story">What it says</h2>
      <p>Spoilers for this fight, covered until you ask for them.</p>
${reveal({
  id: "reveal-story",
  label: "SPOILERS",
  body: [pages, last, spare].filter(Boolean).join("\n"),
})}
${
  chapterSlug
    ? `      <p>What this scene is part of — everything said and found around it —
      is <a href="${base}library/story/${escapeHtml(chapterSlug)}/">its chapter
      of the story</a>.</p>`
    : ""
}`;
}

// ---- the pages --------------------------------------------------------------

/** One monster's page. */
export function enemyPage(enemy, { base, groundFor }) {
  const size = spriteSize(enemy.sprite);
  const sprites = `${base}library/sprites/`;
  const canonical = `${SITE_URL}${base}library/${enemy.path}/`;
  const cardSpec = enemyCardSpec(enemy);
  const card = cardFor(base, cardSpec.slug, cardSpec.alt);
  // Only a monster with a home has a map to stand on — the hellborn, who turn
  // up wherever the rift has been, get no shot rather than an arbitrary venue.
  const dropShot = enemy.home
    ? dropFigure({
        src: `${base}library/shots/${cardSpec.slug}.png`,
        alt: `${enemy.name}, ${ROLE_LABEL[enemy.role].toLowerCase()} of ${enemy.home.name} in ${TITLE}, shown on the map of the level it patrols`,
        caption: `${enemy.name} — where it patrols in ${enemy.home.name}.`,
      })
    : "";
  const tags = [
    `<li class="chip role-${enemy.role}">${ROLE_LABEL[enemy.role]}</li>`,
    enemy.home ? `<li class="chip">${escapeHtml(enemy.home.name)}</li>` : "",
    enemy.rarity
      ? `<li class="chip tag">${enemy.rarity.toUpperCase()} MONSTER</li>`
      : "",
    enemy.hellborn ? `<li class="chip tag">HELLBORN</li>` : "",
    enemy.traits.phasing ? `<li class="chip tag">PHASING</li>` : "",
    enemy.traits.ranged ? `<li class="chip tag">RANGED</li>` : "",
    enemy.traits.spareable ? `<li class="chip tag">SPAREABLE</li>` : "",
  ].filter(Boolean);

  const body = `      <ul class="chip-row">${tags.join("")}</ul>
      <div class="portrait">
        ${img({
          src: `${base}library/sprites/${enemy.sprite}.png`,
          alt: `${enemy.name}, as it appears in ${TITLE}`,
          width: size.width,
          height: size.height,
          lazy: false,
        })}
        <div class="portrait-body">
${paragraphs(lead(enemy))}
        </div>
      </div>
      <section class="panel pixel-panel">
      <h2 id="stats">The numbers</h2>
${statsBlock(enemy)}
      </section>
      <h2 id="field">Where you meet it</h2>
${dropShot}
${fieldSection(enemy, base)}
${
  enemy.summonedBy.length > 0
    ? `      <p>Called into the fight by ${list(
        enemy.summonedBy.map(
          (s) =>
            `<a href="${base}library/${s.path}/">${escapeHtml(s.name)}</a>`,
        ),
      )}.</p>`
    : ""
}
      <h2 id="traits">What to know</h2>
      <ul class="notes">
${traitNotes(enemy)
  .map(
    ([key, text]) =>
      `        <li><span class="stat-key">${escapeHtml(key)}</span>${escapeHtml(text)}</li>`,
  )
  .join("\n")}
      </ul>
${mechanicsSection(enemy, base)}
${rangedSection(enemy)}
${dropsSection(enemy, sprites, base)}
${storySection(enemy, base)}`;

  return page({
    base,
    path: enemy.path,
    title: `${enemy.name} — ${TITLE} bestiary`,
    description: metaDescription(enemy),
    heading: enemy.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "BESTIARY", href: `${base}library/bestiary/` },
      { label: enemy.name },
    ],
    ground: enemy.home ? groundFor(enemy.home.id) : null,
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${enemy.name} — ${TITLE} bestiary`,
      description: metaDescription(enemy),
      // The page's own card, not the site default — and the SAME object the
      // og:image tag above is written from, because check-seo fails a build
      // where an Article's schema image and its og:image disagree.
      image: card.url,
    }),
  });
}

/** The bestiary index, grouped by the place you meet each monster. */
export function bestiaryIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/bestiary/`;
  const total = model.enemies.length;

  const groups = model.groups
    .filter((group) => group.entries.length > 0)
    .map((group) => {
      const venue = group.venue;
      const heading = venue ? venue.name : "ELSEWHERE";
      const tally = (role) =>
        group.entries.filter((e) => e.role === role).length;
      const parts = [
        `${tally("boss")} boss${tally("boss") === 1 ? "" : "es"}`,
        tally("elite") ? `${tally("elite")} named elites` : null,
        tally("minion") ? `${tally("minion")} in the rank and file` : null,
      ];
      const blurb = venue
        ? `${venue.foes ? `${venue.foes[0] + venue.foes.slice(1).toLowerCase()}. ` : ""}${group.entries.length} in all — ${list(parts)}.`
        : `${group.entries.length} monsters that reach the board some other way.`;
      return `      <h2 id="${escapeHtml(venue ? venue.slug : "elsewhere")}">${escapeHtml(heading)}</h2>
      <p>${escapeHtml(blurb)}</p>
      <ul class="roster">
${group.entries
  .map((enemy) => {
    const size = spriteSize(enemy.sprite);
    return `        <li><a href="${base}library/${enemy.path}/">${img({
      src: `${base}library/sprites/${enemy.sprite}.png`,
      alt: "",
      width: size.width,
      height: size.height,
    })}<span class="role-${enemy.role}">${escapeHtml(enemy.name)}</span></a></li>`;
  })
  .join("\n")}
      </ul>`;
    })
    .join("\n");

  const description = `Every one of the ${total} monsters in ${TITLE}, grouped by where you meet them — health, damage, spawns and drops for each.`;

  return page({
    base,
    path: "bestiary",
    title: `Bestiary — every monster in ${TITLE}`,
    description,
    heading: "THE BESTIARY",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "BESTIARY" },
    ],
    ground: groundFor(model.venues[0].id),
    body: `      <p class="lede">All ${total} monsters in ${escapeHtml(TITLE)}, in the order you
      run into them. Every figure on every page is read straight out of the
      game's own catalogs and rebuilt with it, so nothing here can quietly go
      out of date.</p>
${groups}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Bestiary — every monster in ${TITLE}`,
      description,
    }),
  });
}

/** The library's front door. */
export function landing(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/`;
  const total =
    model.enemies.length +
    model.items.length +
    model.missions.length +
    model.story.chapters.length;
  const description = `Every monster, every item, every mission and the whole story of ${TITLE} — ${total} reference pages, compiled from the game itself.`;
  const bosses = model.enemies.filter((e) => e.role === "boss").slice(0, 6);
  const chase = model.named
    .filter((item) => item.tier === "artifact" || item.tier === "legendary")
    .slice(0, 6);

  const rack = (entries, colorClass) => `        <ul class="roster">
${entries
  .map((entry) => {
    const sprite = entry.sprite ?? entry.icon;
    const size = spriteSize(sprite);
    return `          <li><a href="${base}library/${entry.path}/">${
      size
        ? img({
            src: `${base}library/sprites/${sprite}.png`,
            alt: "",
            width: size.width,
            height: size.height,
          })
        : ""
    }<span class="${colorClass(entry)}">${escapeHtml(entry.name)}</span></a></li>`;
  })
  .join("\n")}
        </ul>`;

  return page({
    base,
    path: "",
    title: `The ${TITLE} library`,
    description,
    heading: "THE LIBRARY",
    ground: groundFor(model.venues[0].id),
    body: `      <p class="lede">Everything the game knows about itself, written down.
      The pages here are compiled from the same files ${escapeHtml(TITLE)} runs on
      and rebuilt every time it is — so a monster that gets rebalanced is
      rebalanced here too, on the same day.</p>
      <section class="panel pixel-panel">
        <h2 id="bestiary">The bestiary</h2>
        <p>All ${model.enemies.length} monsters across ${model.venues.length} venues:
        what they field on each difficulty, how they come at you, what they drop,
        and — behind a cover — what they say.</p>
        <p><a href="${base}library/bestiary/">Open the bestiary</a></p>
${rack(bosses, () => "role-boss")}
      </section>
      <section class="panel pixel-panel">
        <h2 id="arsenal">The arsenal</h2>
        <p>All ${model.items.length} items: ${model.named.length} named relics on
        the chase ladder, and ${model.bases.length} base types under them. Damage,
        armor, level requirements, the BROKEN-to-PERFECT make-quality table each
        base rolls on, what it upgrades into, and what drops it.</p>
        <p><a href="${base}library/arsenal/">Open the arsenal</a></p>
${rack(chase, (item) => `tier-text-${item.tier}`)}
      </section>
      <section class="panel pixel-panel">
        <h2 id="missions">The missions</h2>
        <p>The ${model.missions.length} venues, in the order you run them: what
        each fields on every difficulty, who is waiting, what it pays out, and —
        behind covers — its map and what the hero says on arriving.</p>
        <p><a href="${base}library/missions/">Open the mission guide</a></p>
        <ul class="chip-row">${model.missions
          .map(
            (mission) =>
              `<li class="chip"><a href="${base}library/${mission.path}/">${escapeHtml(mission.name)}</a></li>`,
          )
          .join("")}</ul>
      </section>
      <section class="panel pixel-panel">
        <h2 id="story">The story</h2>
        <p>A chapter per mission, ${model.story.chapters.length} in all: the
        scenes, the monologues, the arrival speeches, the last words and the
        found lore, in the game's own words rather than a retelling. Every
        chapter is a spoiler, so every chapter is covered until you ask.</p>
        <p><a href="${base}library/story/">Read the story</a></p>
      </section>
      <h2 id="truth">Where the numbers come from</h2>
      <p>Nothing on these pages is typed by hand. Authored facts — a monster's
      health, where it spawns, what it guards — are read out of the compiled
      catalogs the game itself loads. Derived facts — what it actually fields on
      nightmare once the level ladder and the horde curve have had their say —
      come from calling the game's own code. A reference site that quietly
      disagrees with the game is worse than none at all, so this one has no
      separate copy of anything to disagree with.</p>
${storeNudge() ? `      <p>${storeNudge()}</p>` : ""}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `The ${TITLE} library`,
      description,
    }),
  });
}
