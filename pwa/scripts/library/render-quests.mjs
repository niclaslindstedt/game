// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ERRANDS — one page per quest, one per person who hands them out, and the
// index that groups both by the venue they stand on.
//
// An errand page leads with what the reader came for (what it asks, what it
// pays, what it opens), then its authored paragraph, then the numbers, and puts
// the CONVERSATION behind a cover — because an errand's spoken lines are the
// one part of it that is a spoiler in the way a boss's arrival scene is. A
// person's page is the same shape one level up: who they are, their whole
// chain, and their spoken greeting behind the same cover.
//
// The one thing neither page publishes is a COORDINATE. Where a person stands,
// where an escort waits and where they are being walked to are all world pixels,
// and a reader has no ruler — the venue's own map render is the answer to
// "where", and it is one click away on every page here.

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
  chainProse,
  giverDescription,
  giverLead,
  KIND_LABEL,
  objectivePhrase,
  questDescription,
  questLead,
  questNotes,
  rewardProse,
} from "./prose-quests.mjs";

/**
 * The colour the whole section reads in — the gold of the `!` over a giver's
 * head and of the offer box itself, which is the one modal in the game
 * deliberately off the shared steel skin because somebody is asking you for
 * something. The pages wear the same signal for the same reason.
 */
const QUEST_ACCENT = "#ffcf4a";

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
 * A sprite, when the atlas has a cell for it.
 *
 * The `sprite` class is the default and matters: the atlas cells are written
 * out at their native 128 px, so an `<img>` with no class renders one at the
 * full 128 and shoves whatever it is riding — a heading, a table cell — into a
 * layout of its own. Only a PORTRAIT drops it, because `.portrait > img` sizes
 * that slot itself.
 */
function sprite(name, base, alt, { lazy = true, className = "sprite" } = {}) {
  const size = name ? spriteSize(name) : null;
  return size
    ? img({
        src: `${base}library/sprites/${name}.png`,
        alt,
        width: size.width,
        height: size.height,
        className,
        lazy,
      })
    : "";
}

const link = (base, entry) =>
  `<a href="${base}library/${entry.path}/">${escapeHtml(entry.name)}</a>`;

// ---- the cards ----------------------------------------------------------------

/**
 * What an errand's social card says and is drawn from. Called by BOTH the page
 * and the build (see `enemyCardSpec`), so the card a page names and the card
 * that gets written are the same file.
 */
export function questCardSpec(quest) {
  return {
    slug: quest.path.replace(/\//g, "-"),
    sprite: quest.face,
    venueId: quest.venue?.id ?? null,
    title: quest.name,
    subtitle: quest.giver.name,
    rarity: KIND_LABEL[quest.leads] ?? "ERRAND",
    accent: QUEST_ACCENT,
    titleColor: QUEST_ACCENT,
    // An errand is never rare — there is exactly one of each, on one map — so
    // the halo says nothing and is left off. A chain LINK earns one step of it,
    // because being gated behind other work is the only scarcity an errand has.
    flair: quest.requires.length > 0 ? 1 : 0,
    alt: `${quest.name} — an errand in ${TITLE}`,
  };
}

/** The same, for the person who hands them out. */
export function giverCardSpec(giver) {
  return {
    slug: giver.path.replace(/\//g, "-"),
    sprite: giver.sprite,
    venueId: giver.venue?.id ?? null,
    title: giver.name,
    subtitle: giver.venue?.name ?? "",
    rarity: "QUEST GIVER",
    accent: QUEST_ACCENT,
    titleColor: QUEST_ACCENT,
    flair: 0,
    alt: `${giver.name} — a quest giver in ${TITLE}`,
  };
}

// ---- the sections ---------------------------------------------------------------

/**
 * What the errand asks, one row per objective.
 *
 * A monster is a LINK (its own page answers "how hard is that"); a quest piece
 * and an escort are not — they exist only for this errand and have no page
 * anywhere else — so they carry their sprite in the cell instead, which is the
 * only place either one's art appears at all.
 */
function asksSection(quest, model, base) {
  const rows = quest.objectives.map((objective) => {
    const art = objective.item?.icon ?? objective.escort?.sprite ?? null;
    const own = objective.item?.name ?? objective.escort?.name ?? null;
    // The three kinds whose subject is a SENTENCE rather than a thing: a place
    // to find, something to be told, a level to reach. Each carries its own
    // wording, and a row that fell through to the em-dash-and-1 default said
    // nothing at all about what was being asked.
    const worded =
      objective.kind === "reachLevel"
        ? `LEVEL ${objective.level}`
        : objective.kind === "visit" || objective.kind === "flag"
          ? escapeHtml(objective.name)
          : null;
    const subject =
      worded != null
        ? worded
        : objective.enemy != null
          ? link(base, objective.enemy)
          : own != null
            ? `${sprite(art, base, `${own}, in ${TITLE}`)}${escapeHtml(own)}`
            : "—";
    const count =
      objective.kind === "kill" || objective.kind === "collect"
        ? `${objective.count}`
        : // A search, a conversation, a climb and a sale are each one thing that
          // either happened or has not; a "1" in the column would read as a
          // tally the player is meant to be counting up to.
          "—";
    return [
      escapeHtml(KIND_LABEL[objective.kind] ?? objective.kind.toUpperCase()),
      subject,
      count,
    ];
  });

  return `      <h2 id="asks">What it asks</h2>
${table({
  head: ["SHAPE", "WHAT", "HOW MANY"],
  rows,
})}
${
  quest.objectives.some(
    (objective) => (objective.item?.carriers ?? []).length > 0,
  )
    ? table({
        caption:
          "Who is carrying the pieces — a kill of one of these, while the errand is live and the tally short, rolls for a piece.",
        head: ["PIECE", "CARRIED BY", "PER KILL"],
        rows: quest.objectives
          .filter((objective) => (objective.item?.carriers ?? []).length > 0)
          .map((objective) => [
            escapeHtml(objective.item.name),
            objective.item.carriers
              .map((carrier) => link(base, carrier))
              .join(", "),
            `${Math.round(objective.item.dropChance * 100)}%`,
          ]),
      })
    : ""
}
${notesList(questNotes(quest, model.tuning))}`;
}

/** What it pays, with the XP share priced out against the ladder's own hero. */
function paysSection(quest, base) {
  const reward = quest.reward;
  const rows = [
    reward?.coins ? ["COINS", `${reward.coins}`] : null,
    reward?.loot
      ? [
          "ROLLED LOOT",
          `${reward.loot.count}${reward.loot.slot ? ` ${reward.loot.slot}` : ""}${
            reward.loot.tierBonus
              ? ` (+${reward.loot.tierBonus} tier skew)`
              : ""
          }`,
        ]
      : null,
    ...(reward?.uniques ?? []).map((unique) => ["RELIC", link(base, unique)]),
    ...(reward?.abilities ?? []).map((power) => ["POWER", link(base, power)]),
    reward?.cleanSlates
      ? [
          "CLEAN SLATE",
          `${reward.cleanSlates} — every stat point refunded into a pool and the whole build re-placed, spent whenever you like`,
        ]
      : null,
    reward?.cache
      ? [
          "THE CACHE",
          `the chest in the garage — somewhere to KEEP what you cannot carry, standing from the moment you hand this in, and a row deeper on every difficulty you run this errand on`,
        ]
      : null,
  ].filter(Boolean);

  return `      <h2 id="pays">What it pays</h2>
${paragraphs(rewardProse(quest))}
${rows.length > 0 ? table({ head: ["WHAT", "HOW MUCH"], rows }) : ""}
${
  (reward?.xp ?? []).length > 0
    ? table({
        caption: `What the share comes to for the hero this venue is tuned for. JESUS keeps the player-relative ladder, so it has no fixed reference level to price against.`,
        head: ["DIFFICULTY", "HERO LEVEL", "XP"],
        rows: reward.xp.map((rung) => [
          escapeHtml(rung.name),
          `${rung.heroLevel}`,
          `${rung.xp}`,
        ]),
      })
    : ""
}`;
}

/**
 * AT THE TRADER — the three-step beat, printed in order because the ORDER is
 * the mechanic. A page that listed "he sells the bound signature" and stopped
 * would describe a purchase and miss the whole thing: the counter does not hold
 * it until the hero has sold him the seal he took off the assessor.
 */
function traderSection(quest) {
  const deal = quest.merchant;
  if (!deal) return "";
  const rows = [];
  if (deal.buys?.item) {
    rows.push([
      "HE BUYS",
      `${escapeHtml(deal.buys.item.name)} — ${deal.buys.coins} coins`,
    ]);
  }
  for (const sale of deal.sells) {
    if (!sale.item) continue;
    rows.push([
      sale.gated ? "THEN HE SELLS" : "HE SELLS",
      `${escapeHtml(sale.item.name)} — ${sale.price} coins`,
    ]);
  }
  if (rows.length === 0) return "";
  return `      <h2 id="trader">At the trader</h2>
${paragraphs([
  deal.buys && deal.sells.some((s) => s.gated)
    ? `This errand runs through the wandering merchant, and the order is the point. He will not put the piece it wants on his counter until you have sold him ${escapeHtml(deal.buys.item?.name ?? "the other one")} — he has to know you have seen one. Both rows appear under ERRANDS at his stall, and only while the errand is running.`
    : `This errand runs through the wandering merchant. The rows appear under ERRANDS at his stall, and only while it is running.`,
])}
${table({ head: ["STEP", "WHAT"], rows })}`;
}

/** The chain, in both directions, when there is one. */
function chainSection(quest, base) {
  if (quest.requires.length === 0 && quest.unlocks.length === 0) return "";
  const before =
    quest.requires.length > 0
      ? `      <p>Comes after ${quest.requires
          .map((prior) => link(base, prior))
          .join(", ")}.</p>`
      : "";
  const after =
    quest.unlocks.length > 0
      ? `      <p>Opens ${quest.unlocks
          .map((next) => link(base, next))
          .join(", ")}.</p>`
      : "";
  return `      <h2 id="chain">The chain</h2>
${before}
${after}
${paragraphs(chainProse(quest))}`;
}

/** The conversation, behind the page's cover. */
function talkSection(quest) {
  const pages = (entries, who) =>
    entries
      .map(
        (lines) => `      <blockquote class="speech">
        <span class="who">${escapeHtml(who)}</span>
        <p>${lines.map(escapeHtml).join("<br />")}</p>
      </blockquote>`,
      )
      .join("\n");

  const escortLines = quest.objectives
    .map((objective) => objective.escort)
    .filter((escort) => escort && (escort.setOff || escort.arrived))
    .map(
      (escort) => `      <blockquote class="speech">
        <span class="who">${escapeHtml(escort.name)}</span>
        <p>${[escort.setOff, escort.arrived]
          .filter(Boolean)
          .map(escapeHtml)
          .join("<br />")}</p>
      </blockquote>`,
    )
    .join("\n");

  const body = [
    `      <h3>The ask</h3>`,
    pages(quest.story.offer, quest.giver.name),
    quest.story.incomplete.length > 0
      ? `      <h3>Coming back short</h3>\n${pages([quest.story.incomplete], quest.giver.name)}`
      : "",
    `      <h3>The handover</h3>`,
    pages(quest.story.complete, quest.giver.name),
    escortLines ? `      <h3>On the way</h3>\n${escortLines}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return `      <h2 id="said">What is said</h2>
      <p>The errand in the giver's own words, covered until you ask for it.</p>
${reveal({ id: "reveal-said", label: "THE CONVERSATION", body })}`;
}

// ---- the pages ------------------------------------------------------------------

/** One errand's page. */
export function questPage(
  quest,
  model,
  { base, groundFor, venueName, hasImages },
) {
  const canonical = `${SITE_URL}${base}library/${quest.path}/`;
  const description = questDescription(quest);
  const cardSpec = questCardSpec(quest);
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const venue = quest.venue ? venueName(quest.venue.id) : null;
  const dropShot =
    hasImages && venue
      ? dropFigure({
          src: `${base}library/shots/${cardSpec.slug}.webp`,
          alt: `${quest.name}, an errand in ${TITLE}, on the floor of ${venue} where it is handed out`,
          caption: `${quest.name} — on ${venue}.`,
        })
      : "";

  const chips = [
    `<li class="chip tag">ERRAND</li>`,
    `<li class="chip tag">${escapeHtml(KIND_LABEL[quest.leads] ?? "ASK")}</li>`,
    `<li class="chip"><a href="${base}library/${quest.giver.path}/">${escapeHtml(quest.giver.name)}</a></li>`,
    quest.venue
      ? `<li class="chip"><a href="${base}library/${quest.venue.path}/">${escapeHtml(quest.venue.name)}</a></li>`
      : "",
    quest.minDifficulty
      ? `<li class="chip">${escapeHtml(quest.minDifficulty.name)} AND UP</li>`
      : "",
    quest.requires.length > 0 ? `<li class="chip">CHAIN LINK</li>` : "",
    // The single most useful thing to know before taking one: this errand
    // belongs to the HERO, not to the run — it is carried between venues and
    // survives leaving the map.
    quest.campaign ? `<li class="chip tag">CAMPAIGN</li>` : "",
  ].filter(Boolean);

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <div class="portrait">
        ${sprite(quest.face, base, `${quest.name}, an errand in ${TITLE}`, {
          lazy: false,
          className: null,
        })}
        <div class="portrait-body">
${paragraphs(questLead(quest))}
      <p class="flavor-plain">${escapeHtml(quest.lore)}</p>
        </div>
      </div>
      <section class="panel pixel-panel">
${asksSection(quest, model, base)}
      </section>
${dropShot}
${traderSection(quest)}
${paysSection(quest, base)}
${chainSection(quest, base)}
${talkSection(quest)}`;

  return page({
    base,
    path: quest.path,
    title: `${quest.name} — ${TITLE} errands`,
    description,
    heading: quest.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ERRANDS", href: `${base}library/errands/` },
      { label: quest.name },
    ],
    ground: groundFor(quest.venue?.id ?? null),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${quest.name} — ${TITLE} errands`,
      description,
      // Same object as the og:image tag — see the note in render-bestiary.
      image: card.url,
    }),
  });
}

/** One quest giver's page. */
export function giverPage(
  giver,
  model,
  { base, groundFor, venueName, hasImages },
) {
  const canonical = `${SITE_URL}${base}library/${giver.path}/`;
  const description = giverDescription(giver);
  const cardSpec = giverCardSpec(giver);
  const card = hasImages
    ? cardFor(base, cardSpec.slug, cardSpec.alt)
    : DEFAULT_CARD;
  const venue = giver.venue ? venueName(giver.venue.id) : null;
  const dropShot =
    hasImages && venue
      ? dropFigure({
          src: `${base}library/shots/${cardSpec.slug}.webp`,
          alt: `${giver.name}, a quest giver in ${TITLE}, standing on ${venue}`,
          caption: `${giver.name} — where they wait, on ${venue}.`,
        })
      : "";

  const chain = model.quests.filter((quest) => quest.giver.id === giver.id);

  const said = [
    giver.story.greeting.length > 0
      ? `      <h3>On being spoken to</h3>
      <blockquote class="speech">
        <span class="who">${escapeHtml(giver.name)}</span>
        <p>${giver.story.greeting.map(escapeHtml).join("<br />")}</p>
      </blockquote>`
      : "",
    giver.story.farewell.length > 0
      ? `      <h3>Once everything is done</h3>
      <blockquote class="speech">
        <span class="who">${escapeHtml(giver.name)}</span>
        <p>${giver.story.farewell.map(escapeHtml).join("<br />")}</p>
      </blockquote>`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const body = `      <ul class="chip-row"><li class="chip tag">QUEST GIVER</li>${
    giver.venue
      ? `<li class="chip"><a href="${base}library/${giver.venue.path}/">${escapeHtml(giver.venue.name)}</a></li>`
      : ""
  }<li class="chip">${chain.length} ERRAND${chain.length === 1 ? "" : "S"}</li></ul>
      <div class="portrait">
        ${sprite(
          giver.sprite,
          base,
          `${giver.name}, a quest giver in ${TITLE}`,
          {
            lazy: false,
            className: null,
          },
        )}
        <div class="portrait-body">
${paragraphs(giverLead(giver, model.tuning))}
      <p class="flavor-plain">${escapeHtml(giver.lore)}</p>
        </div>
      </div>
      <section class="panel pixel-panel">
      <h2 id="errands">What they want</h2>
${table({
  head: ["ERRAND", "ASKS", "PAYS"],
  rows: chain.map((quest) => [
    link(base, quest),
    escapeHtml(quest.objectives.map(objectivePhrase).join("; ")),
    escapeHtml(
      [
        quest.reward?.xpShare ? `${quest.reward.xpShare} of a level` : "",
        quest.reward?.coins ? `${quest.reward.coins} coins` : "",
        quest.reward?.loot
          ? `${quest.reward.loot.count} rolled ${quest.reward.loot.count === 1 ? "piece" : "pieces"}`
          : "",
      ]
        .filter(Boolean)
        .join(", ") || "the next link",
    ),
  ]),
})}
      </section>
${dropShot}
${
  said
    ? `      <h2 id="said">What they say</h2>
      <p>Their own lines, covered until you ask for them.</p>
${reveal({ id: "reveal-giver-said", label: "WHAT THEY SAY", body: said })}`
    : ""
}`;

  return page({
    base,
    path: giver.path,
    title: `${giver.name} — ${TITLE} quest givers`,
    description,
    heading: giver.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ERRANDS", href: `${base}library/errands/` },
      { label: giver.name },
    ],
    ground: groundFor(giver.venue?.id ?? null),
    ogImage: card,
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${giver.name} — ${TITLE} quest givers`,
      description,
      image: card.url,
    }),
  });
}

/** A rack of errand links, each with the face of what it is about. */
function rack(quests, base) {
  return `      <ul class="roster errands">
${quests
  .map(
    (quest) =>
      `        <li><a href="${base}library/${quest.path}/">${sprite(
        quest.face,
        base,
        "",
      )}<span>${escapeHtml(quest.name)}</span><span class="req">${escapeHtml(
        KIND_LABEL[quest.leads] ?? "",
      )}</span></a></li>`,
  )
  .join("\n")}
      </ul>`;
}

/**
 * The errands index, grouped by venue and then by the person standing on it.
 *
 * That nesting is the feature's own shape rather than a filing choice: an
 * errand is offered on ONE map, a chain may not cross one, and each map has
 * exactly two people on it — so a flat A-to-Z would throw away the only two
 * facts a reader needs to find the one they half-remember.
 */
export function questsIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/errands/`;

  const groups = model.groups
    .map((group) => {
      const people = group.givers
        .map(
          (giver) => `      <h3 id="${escapeHtml(giver.slug)}">${sprite(
            giver.sprite,
            base,
            "",
          )}<a href="${base}library/${giver.path}/">${escapeHtml(
            giver.name,
          )}</a></h3>
      <p>${escapeHtml(giver.lore)}</p>
${rack(
  group.quests.filter((quest) => quest.giver.id === giver.id),
  base,
)}`,
        )
        .join("\n");
      // Anything filed under a person the venue does not list still shows up,
      // so no errand can silently fall out of the index.
      const orphans = group.quests.filter(
        (quest) => !group.givers.some((giver) => giver.id === quest.giver.id),
      );
      return `      <h2 id="${escapeHtml(group.venue?.id.replace(/_/g, "-") ?? "elsewhere")}">${
        group.venue ? escapeHtml(group.venue.name) : "ELSEWHERE"
      }<span class="count">${group.quests.length}</span></h2>
      <p>${
        group.venue
          ? `Handed out on <a href="${base}library/${group.venue.path}/">${escapeHtml(group.venue.name)}</a>, and finished there — the quest log belongs to the run you are in.`
          : "Filed under a venue the campaign does not run."
      }</p>
${people}
${orphans.length > 0 ? rack(orphans, base) : ""}`;
    })
    .join("\n");

  const description = `Every one of the ${model.quests.length} errands in ${TITLE} — who hands each one out, what it asks for, what it pays, and which errand it opens next.`;

  return page({
    base,
    path: "errands",
    title: `Errands — every quest in ${TITLE}`,
    description,
    heading: "THE ERRANDS",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ERRANDS" },
    ],
    ground: groundFor(model.groups[0]?.venue?.id ?? null),
    body: `      <p class="lede">All ${model.quests.length} errands, from the ${model.givers.length} people
      who hand them out: what each one asks for, what it pays, and what it opens
      next.</p>
      <p>Everyone else on every map is either trying to kill you or is a boss
      explaining why. These ${model.givers.length} are the counterweight — people the horde was
      inflicted on rather than people the horde is, still doing a job that
      stopped making sense some time ago. Nothing can hurt them — but unlike the
      merchant they are warded by nothing, so the horde crosses the ground they
      stand on and will kill you where you talk.</p>
      <p>An errand is offered on one map, taken and finished on one visit, and
      chained only to other errands from the same person: the quest log belongs
      to the run you are in rather than to the hero, so a chain can never cross
      a map or be picked up where you left it.</p>
${groups}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Errands — every quest in ${TITLE}`,
      description,
    }),
  });
}
