// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE MISSION GUIDE — one page per venue, and the index that walks the
// campaign in order.
//
// A mission page is where the other two sections meet: the roster links every
// monster into the bestiary, the pools link every base and relic into the
// arsenal, and the ladder table says what the place actually fields on each
// rung. Two things sit behind covers rather than being withheld — the MAP,
// because a level's layout is a spoiler in the same way its plot is, and the
// STORY, because a search result should not hand over the ending.

import { DIFFICULTY_DEFS } from "./catalogs.mjs";
import { spriteSize } from "./art.mjs";
import {
  escapeHtml,
  img,
  page,
  pageSchema,
  reveal,
  SITE_URL,
  table,
  TITLE,
} from "./html.mjs";
import { list } from "./prose.mjs";
import {
  hazardNotes,
  missionDescription,
  missionLead,
  placementClause,
  venueNotes,
} from "./prose-missions.mjs";

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

/** Speech pages, the same blockquote treatment the bestiary's story uses. */
const speech = (pages, who) =>
  pages
    .map(
      (lines) => `      <blockquote class="speech hero">
        ${who ? `<span class="who">${escapeHtml(who)}</span>` : ""}
        <p>${lines.map(escapeHtml).join("<br />")}</p>
      </blockquote>`,
    )
    .join("\n");

// ---- the sections ------------------------------------------------------------------

function ladderSection(mission) {
  const rows = mission.ladder
    .filter((rung) => rung.mobLevels)
    .map((rung) => [
      `<span style="color:${escapeHtml(rung.color)}">${escapeHtml(rung.name)}</span>`,
      rung.mobLevels[0] === rung.mobLevels[1]
        ? `${rung.mobLevels[0]}`
        : `${rung.mobLevels[0]}–${rung.mobLevels[1]}`,
      rung.intendedLevel != null ? `${rung.intendedLevel}` : "—",
      rung.leavesAt != null ? `${rung.leavesAt}` : "—",
      rung.relicFloor != null ? `${rung.relicFloor}` : "—",
    ]);
  if (rows.length === 0) return "";
  return `      <h2 id="ladder">What it fields</h2>
      <p>The mob levels here are authored per rung rather than scaled off your
      own, so the place is exactly as hard as it was tuned to be. COMES AT is
      the hero level the rung expects you to arrive at; LEAVES AT is where a
      single clear is reckoned to put you. RELICS FROM is the level this
      venue's own named relics start dropping at — below it they never do,
      which is why they are farmed on a return trip rather than found on the
      way through.</p>
${table({
  caption:
    "JESUS is the one rung that scales to the hero rather than to an authored number, so it has no fixed figure to state and is left out.",
  head: ["DIFFICULTY", "MOB LEVEL", "COMES AT", "LEAVES AT", "RELICS FROM"],
  rows,
})}`;
}

function rosterSection(mission, base) {
  if (mission.roster.length === 0) return "";
  const byRole = (role) =>
    mission.roster.filter((entry) => entry.role === role);
  const group = (role, heading, blurb) => {
    const entries = byRole(role);
    if (entries.length === 0) return "";
    // HOW they arrive is said once, for the group — see `placementClause`.
    const clause = placementClause(entries);
    return `      <h3>${escapeHtml(heading)}</h3>
      <p>${escapeHtml(blurb)}${clause ? ` You meet them ${escapeHtml(clause)}.` : ""}</p>
      <ul class="roster">
${entries
  .map(
    (entry) =>
      `        <li><a href="${base}library/${entry.path}/"><span class="role-${entry.role}">${escapeHtml(entry.name)}</span></a></li>`,
  )
  .join("\n")}
      </ul>`;
  };

  return `      <h2 id="roster">Who is waiting</h2>
      <p>${mission.roster.length} kinds of thing live here${
        mission.foes
          ? `, and the run calls them ${escapeHtml(mission.foes)}`
          : ""
      }. Every one has its own page with its health, its damage and its drops
      on each rung.</p>
${group("boss", "The boss", "The fight the level ends on.")}
${group("elite", "Named elites", "The set-piece fights along the way, each with a name and a reason to be here.")}
${group("minion", "The rank and file", "What the venue keeps throwing at you between the set pieces.")}`;
}

function lootSection(mission, base, sprites) {
  const loot = mission.loot;
  const blocks = [];

  const pool = (items, heading, blurb) => {
    if (items.length === 0) return "";
    return `      <h3>${escapeHtml(heading)}</h3>
      <p>${escapeHtml(blurb)}</p>
      <ul class="roster">
${items
  .map(
    (item) =>
      `        <li><a href="${base}library/${item.path}/">${escapeHtml(item.name)}<span class="req">L${item.levelReq}</span></a></li>`,
  )
  .join("\n")}
      </ul>`;
  };

  blocks.push(
    pool(
      loot.weapons,
      "Weapons it introduces",
      "The bases this venue brings into the campaign. Each starts dropping once the monster killing for you is at least its level — and each carries its exceptional and elite versions along with it, so the pool keeps paying out here long after you have out-levelled the plain form.",
    ),
  );
  blocks.push(
    pool(
      loot.gear,
      "Gear it introduces",
      "The armor, jewellery, trinkets and bags on this venue's own table, gated the same way.",
    ),
  );

  if (loot.powers.length > 0) {
    blocks.push(`      <h3>Powers it hands out</h3>
      <p>The campaign introduces two new powers per venue and every venue keeps
      what came before, so the vocabulary grows the whole way down. These are
      the ${loot.powers.length} this one can drop.</p>
      <ul class="chip-row">${loot.powers
        .map((power) => {
          const size = spriteSize(power.icon);
          return `<li class="chip">${
            size
              ? `${img({
                  src: `${sprites}${power.icon}.png`,
                  alt: "",
                  width: size.width,
                  height: size.height,
                  className: "sprite",
                })} `
              : ""
          }${escapeHtml(power.name)}</li>`;
        })
        .join("")}</ul>`);
  }

  if (loot.relics.length > 0) {
    blocks.push(`      <h3>Relics locked to this place</h3>
      <p>Named items that belong to this venue and nowhere else: anything
      standing here can drop them, at odds that climb with what killed you for
      it${loot.namedMult !== 1 ? `, and this venue pays named items at ${loot.namedMult}× the usual rate` : ""}.
      Which relics are on the table depends on the rung you are running.</p>
${table({
  head: ["DIFFICULTY", "RELICS"],
  rows: loot.relics.map((entry) => [
    `<span style="color:${escapeHtml(DIFFICULTY_DEFS[entry.difficulty]?.color ?? "")}">${escapeHtml(entry.name)}</span>`,
    entry.items
      .map(
        (item) =>
          `<a href="${base}library/${item.path}/">${escapeHtml(item.name)}</a>`,
      )
      .join(", "),
  ]),
})}`);
  }

  const extras = [];
  if (loot.trophy) {
    extras.push([
      "ALL-CLEAR TROPHY",
      `Killing every last monster on the map pays a ${loot.trophy.name}.`,
    ]);
  }
  for (const drop of loot.early) {
    if (drop.item) {
      extras.push([
        "SCRIPTED OPENING",
        `A ${drop.item.name} is handed over around ${drop.atKills[0]}–${drop.atKills[1]} kills in, so no run starts empty-handed however the odds fall.`,
      ]);
    }
  }
  if (loot.placed.length > 0) {
    extras.push([
      "LEFT LYING",
      `${list(loot.placed.map((item) => item.name))} ${loot.placed.length === 1 ? "sits" : "sit"} where the designer put ${loot.placed.length === 1 ? "it" : "them"}, not where the dice do.`,
    ]);
  }
  if (extras.length > 0) blocks.push(notesList(extras));

  const body = blocks.filter(Boolean).join("\n");
  if (!body) return "";
  return `      <h2 id="loot">What it pays</h2>
${body}`;
}

function merchantSection(mission, base) {
  const merchant = mission.merchant;
  if (!merchant) return "";
  const stock =
    merchant.stock.length > 0
      ? `      <p>His stall can carry ${list(
          merchant.stock.map(
            (item) =>
              `<a href="${base}library/${item.path}/">${escapeHtml(item.name)}</a>`,
          ),
        )} on top of the ordinary rolled stock — rolled at the same odds a boss drops one, landing on a counter instead of a corpse.</p>`
      : "";
  return `      <h2 id="merchant">The trader</h2>
      <p>A wandering merchant works this venue too: sell him what you will
      never wear, buy what you will. He dresses for the place.</p>
${stock}${
    merchant.greeting.length > 0
      ? `
${reveal({
  id: "reveal-merchant",
  label: "WHAT HE SAYS",
  body: speech(merchant.greeting, merchant.name),
})}`
      : ""
  }`;
}

function mapSection(mission, base, mapImage) {
  if (!mapImage) return "";
  return `      <h2 id="map">The place itself</h2>
      <p>The whole venue at once, covered — a map is a spoiler in the same way a
      plot is.</p>
${reveal({
  id: "reveal-map",
  label: "THE MAP",
  body: `      <figure class="map">
${img({
  src: mapImage.src,
  // The alt says what the picture IS without saying what is on it: it has to
  // describe the image for a reader who cannot see it, and must not hand over
  // what the panel is covering.
  alt: `A top-down view of the whole of ${mission.name}, drawn in the game's own pixel art`,
  width: mapImage.width,
  height: mapImage.height,
  className: "map-img",
})}
        <figcaption>The place as you actually see it, drawn from the game's own
        sprites at the game's own coordinates and shrunk to fit — the ground,
        the walls, the buildings and the landmarks. The scattered rocks and
        rubble are rolled fresh every run, so treat those as a likeness rather
        than a plan; everything built stays exactly where it is.</figcaption>
      </figure>`,
})}`;
}

function storySection(mission, base) {
  const story = mission.story;
  const parts = [];
  if (story.intro.length > 0) {
    parts.push(`      <h3>On arriving</h3>
${speech(story.intro, "THE HERO")}`);
  }
  if (story.outro.length > 0) {
    parts.push(`      <h3>On leaving</h3>
${speech(story.outro, "THE HERO")}`);
  }
  if (story.thoughts.length > 0) {
    // Said once, for the group. A row per monster all reading "the run stops
    // for a thought" is a column shouting the same sentence over the names —
    // and the thoughts themselves are printed in full on the story chapter.
    const named = (when) =>
      story.thoughts
        .filter((thought) => thought.when === when)
        .map((thought) => thought.enemy?.name ?? thought.enemy)
        .filter(Boolean);
    const clauses = [
      named("sight").length > 0
        ? `first lays eyes on ${list(named("sight"))}`
        : null,
      named("kill").length > 0 ? `first kills ${list(named("kill"))}` : null,
    ].filter(Boolean);
    parts.push(`      <h3>What stops him mid-run</h3>
      <p>The run halts on its own, once each, when he ${clauses.join(", and when he ")}.</p>`);
  }
  const chapter = `      <p>The whole of what happens here — the scenes on the way
      in, every arrival speech, the last words and the found lore — is
      <a href="${base}library/story/${escapeHtml(mission.slug)}/">this venue's
      chapter of the story</a>, covered the same way.</p>`;
  if (parts.length === 0) {
    return `      <h2 id="story">What he says</h2>
${chapter}`;
  }
  return `      <h2 id="story">What he says</h2>
      <p>Spoilers for this mission, covered until you ask for them.</p>
${reveal({ id: "reveal-story", label: "SPOILERS", body: parts.join("\n") })}
${chapter}`;
}

// ---- the pages ------------------------------------------------------------------

/** One mission's page. */
export function missionPage(mission, { base, groundFor, mapFor }, sprites) {
  const canonical = `${SITE_URL}${base}library/${mission.path}/`;
  const description = missionDescription(mission);

  const chips = [
    mission.secret
      ? `<li class="chip tag">SECRET</li>`
      : `<li class="chip">MISSION ${mission.index}</li>`,
    mission.foes ? `<li class="chip">${escapeHtml(mission.foes)}</li>` : "",
    `<li class="chip">${mission.roster.length} KINDS</li>`,
    ...mission.boss.map(
      (boss) =>
        `<li class="chip role-boss"><a href="${base}library/${boss.path}/">${escapeHtml(boss.name)}</a></li>`,
    ),
  ].filter(Boolean);

  const nav = [
    mission.previous
      ? `<a href="${base}library/${mission.previous.path}/">&laquo; ${escapeHtml(mission.previous.name)}</a>`
      : "",
    mission.next
      ? `<a href="${base}library/${mission.next.path}/">${escapeHtml(mission.next.name)} &raquo;</a>`
      : "",
  ].filter(Boolean);

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
${paragraphs(missionLead(mission))}
      <section class="panel pixel-panel">
      <h2 id="place">The place</h2>
${notesList(venueNotes(mission))}
      </section>
${ladderSection(mission)}
${rosterSection(mission, base)}
${
  mission.hazards.length > 0
    ? `      <h2 id="hazards">What the place itself does to you</h2>
${notesList(hazardNotes(mission))}`
    : ""
}
${lootSection(mission, base, sprites)}
${merchantSection(mission, base)}
${mapSection(mission, base, mapFor(mission.id))}
${storySection(mission, base)}
${nav.length > 0 ? `      <nav class="campaign-nav">${nav.join("")}</nav>` : ""}`;

  return page({
    base,
    path: mission.path,
    title: `${mission.name} — ${TITLE} mission guide`,
    description,
    heading: mission.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "MISSIONS", href: `${base}library/missions/` },
      { label: mission.name },
    ],
    ground: groundFor(mission.id),
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${mission.name} — ${TITLE} mission guide`,
      description,
      image: `${SITE_URL}/og-default.png`,
    }),
  });
}

/** The mission index: the campaign in the order it is played. */
export function missionsIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/missions/`;
  const description = `All ${model.missions.length} missions in ${TITLE} — the venue, its monsters, its loot pool, its powers and its map, one page each.`;

  const entries = model.missions
    .map((mission) => {
      const bosses = mission.boss
        .map(
          (boss) =>
            `<a href="${base}library/${boss.path}/">${escapeHtml(boss.name)}</a>`,
        )
        .join(", ");
      return `      <h2 id="${escapeHtml(mission.slug)}"><a href="${base}library/${mission.path}/">${escapeHtml(mission.name)}</a></h2>
      <p>${escapeHtml(missionLead(mission)[0] ?? "")}</p>
      <ul class="notes">
        <li><span class="stat-key">FOES</span>${escapeHtml(mission.foes ?? "—")}, ${mission.roster.length} kinds in all.</li>
${bosses ? `        <li><span class="stat-key">GUARDED BY</span>${bosses}.</li>` : ""}
        <li><span class="stat-key">PAYS</span>${mission.loot.weapons.length} weapons, ${mission.loot.gear.length} pieces of gear, ${mission.loot.powers.length} powers${
          mission.loot.relics.length > 0
            ? ", and relics that drop nowhere else"
            : ""
        }.</li>
      </ul>`;
    })
    .join("\n");

  return page({
    base,
    path: "missions",
    title: `Missions — every level in ${TITLE}`,
    description,
    heading: "THE MISSIONS",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "MISSIONS" },
    ],
    ground: groundFor(model.missions[0]?.id ?? null),
    body: `      <p class="lede">The campaign in the order it is played, plus the
      places you are not told about. Each page carries what the venue fields on
      every rung, who is waiting in it, what it pays out — and, behind covers,
      its map and what the hero says when he gets there.</p>
${entries}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Missions — every level in ${TITLE}`,
      description,
    }),
  });
}
