// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE ACHIEVEMENTS — the section index, and one page per category of badge.
//
// A category page leads with what that section of the shelf is measuring, then
// lists its badges the way the shelf lists them: the sprite, the name, the
// condition in the game's own words, and a meta line saying what it pays and how
// far it runs. Where a whole family is ONE condition with a different subject
// each time — the relic wall, the companion roster — the page draws a rack of
// the subjects instead, each a link into the arsenal or the bestiary, with the
// shared condition stated once above it.
//
// NOTHING HERE SITS BEHIND A REVEAL, and that is a decision rather than an
// oversight. Every other section covers what a player earns by playing; a badge
// is the opposite — the shelf shows all 244 conditions from the first run,
// unhidden and unmissable, because a list of things to go and do is worth
// nothing to somebody who cannot read it yet. Covering them here would tell a
// reader less than the game already tells them.

import { spriteSize } from "./art.mjs";
import { escapeHtml, img, page, pageSchema, SITE_URL, TITLE } from "./html.mjs";
import {
  achievementsDescription,
  achievementsLede,
  badgeMeta,
  categoryChips,
  categoryDescription,
  categoryLead,
  economyProse,
  platformProse,
  rackLead,
  rackTitle,
} from "./prose-achievements.mjs";

const paragraphs = (lines, indent = "      ") =>
  lines.map((line) => `${indent}<p>${escapeHtml(line)}</p>`).join("\n");

/** A badge's sprite, at the intrinsic size of its 8× preview. Every badge in the
 * catalog draws with an atlas sprite, so a missing one is a build failure over
 * in `copySprites` rather than a hole rendered here. */
function badgeIcon(badge, sprites, alt = "") {
  const size = spriteSize(badge.icon);
  if (!size) return "";
  return img({
    src: `${sprites}${badge.icon}.png`,
    alt,
    width: size.width,
    height: size.height,
  });
}

/**
 * ONE BADGE, AS THE SHELF DRAWS A ROW: sprite, name, the condition verbatim, and
 * the meta line under it.
 *
 * A list rather than a table, and the reason is the phone. Every table in the
 * library sets `white-space: nowrap` because its cells are figures; a badge's
 * cell is a SENTENCE, and a column of sentences that cannot wrap turns a 390px
 * viewport into a horizontal scroll several screens wide. So the condition wraps
 * and the figures sit under it, which is also how the game's own shelf stacks a
 * row.
 */
function badgeRow(badge, base, sprites) {
  const link = badge.subject?.path
    ? ` <a href="${base}library/${badge.subject.path}/">${escapeHtml(
        badge.subject.name,
      )}</a>`
    : "";
  return `        <li id="badge-${escapeHtml(badge.slug)}">
          <span class="badge-cell">${badgeIcon(badge, sprites)}</span>
          <span class="badge-body">
            <span class="badge-name">${escapeHtml(badge.name)}</span>
            <span class="badge-ask">${escapeHtml(badge.ask)}${link}</span>
            <span class="badge-meta">${badgeMeta(badge)
              .map((part) => `<span>${escapeHtml(part)}</span>`)
              .join("")}</span>
          </span>
        </li>`;
}

/** A run of badges as a list of rows. */
function rowsBlock(block, base, sprites) {
  return `      <ul class="badges">
${block.badges.map((badge) => badgeRow(badge, base, sprites)).join("\n")}
      </ul>`;
}

/**
 * A run of badges as a RACK: the shared condition once, then a grid of the
 * subjects, each linked to its own page. See `blocksFor` in the model for what
 * qualifies a run and why.
 */
function rackBlock(block, base, sprites) {
  return `      <h3 id="rack-${escapeHtml(block.subjectKind)}">${escapeHtml(
    rackTitle(block),
  )}</h3>
      <p>${escapeHtml(rackLead(block))}</p>
      <ul class="roster badge-rack">
${block.badges
  .map(
    (badge) =>
      `        <li id="badge-${escapeHtml(badge.slug)}"><a href="${base}library/${
        badge.subject.path
      }/">${badgeIcon(badge, sprites)}<span class="badge-name">${escapeHtml(
        badge.name,
        // The tier alone, and only where the rack does not share one — the
        // point value is the tier restated (a tier IS its weight), so printing
        // both puts two words in a cell that has room for one name.
      )}${
        block.tier === null
          ? `<span class="where">${escapeHtml(badge.tier.toUpperCase())}</span>`
          : ""
      }</span></a></li>`,
  )
  .join("\n")}
      </ul>`;
}

const blocksHtml = (blocks, base, sprites) =>
  blocks
    .map((block) =>
      block.kind === "rack"
        ? rackBlock(block, base, sprites)
        : rowsBlock(block, base, sprites),
    )
    .join("\n");

// ---- the pages ------------------------------------------------------------------

/** One category of the shelf. */
export function categoryPage(category, model, { base, groundFor }) {
  const sprites = `${base}library/sprites/`;
  const canonical = `${SITE_URL}${base}library/${category.path}/`;
  const description = categoryDescription(category);
  const siblings = model.categories.filter((entry) => entry.id !== category.id);

  const body = `      <ul class="chip-row"><li class="chip tag">ACHIEVEMENTS</li><li class="chip">${
    category.count
  } BADGES</li><li class="chip">${category.points} PTS</li></ul>
${paragraphs(categoryLead(category, model))}
      <section class="panel pixel-panel">
      <h2 id="badges">The badges</h2>
${blocksHtml(category.blocks, base, sprites)}
      </section>
      <h2 id="elsewhere">The rest of the shelf</h2>
      <ul class="chip-row">${siblings
        .map(
          (entry) =>
            `<li class="chip"><a href="${base}library/${entry.path}/">${escapeHtml(
              entry.label,
            )}</a><span class="chip-note">${entry.count}</span></li>`,
        )
        .join("")}</ul>`;

  return page({
    base,
    path: category.path,
    title: `${category.label} achievements — ${TITLE}`,
    description,
    heading: `${category.label} BADGES`,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ACHIEVEMENTS", href: `${base}library/achievements/` },
      { label: category.label },
    ],
    ground: groundFor(null),
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${category.label} achievements — ${TITLE}`,
      description,
    }),
  });
}

/**
 * The achievements index: what the shelf is worth, what the store lists carry,
 * and a panel per category.
 *
 * The two economy sections come FIRST, above the categories, because they are
 * the half a player cannot see from inside the game — the shelf already shows
 * every condition, and it never shows the shape of the ladder they sit on or
 * why a third of them reach a profile and the rest do not.
 */
export function achievementsIndex(model, { base, groundFor }) {
  const canonical = `${SITE_URL}${base}library/achievements/`;
  const sprites = `${base}library/sprites/`;
  const description = achievementsDescription(model);

  const panels = model.categories
    .map((category) => {
      // Six badges off the front of the category, which in catalog order is the
      // shelf's own order — so a ladder shows its first rungs rather than six
      // random rows, and the icons say what the section is about.
      const teaser = category.badges.slice(0, 6);
      return `      <section class="panel pixel-panel">
        <h2 id="${escapeHtml(category.slug)}">${escapeHtml(
          category.label,
        )}<span class="count">${category.count}</span></h2>
${paragraphs(categoryLead(category, model).slice(0, 1), "        ")}
        <ul class="chip-row">${categoryChips(category)
          .map((chip) => `<li class="chip">${escapeHtml(chip)}</li>`)
          .join("")}</ul>
        <p><a href="${base}library/${category.path}/">Open the ${escapeHtml(
          category.label,
        )} badges</a></p>
        <ul class="roster badge-rack">
${teaser
  .map(
    (badge) =>
      `          <li><span class="self">${badgeIcon(
        badge,
        sprites,
      )}<span class="badge-name">${escapeHtml(badge.name)}</span></span></li>`,
  )
  .join("\n")}
        </ul>
      </section>`;
    })
    .join("\n");

  return page({
    base,
    path: "achievements",
    title: `Achievements — every badge in ${TITLE}`,
    description,
    heading: "THE ACHIEVEMENTS",
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "ACHIEVEMENTS" },
    ],
    ground: groundFor(null),
    body: `      <p class="lede">${escapeHtml(achievementsLede(model))}</p>
      <section class="panel pixel-panel">
        <h2 id="points">What a badge is worth</h2>
${paragraphs(economyProse(model), "        ")}
      </section>
      <section class="panel pixel-panel">
        <h2 id="platforms">What reaches your profile</h2>
${paragraphs(platformProse(model), "        ")}
      </section>
${panels}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `Achievements — every badge in ${TITLE}`,
      description,
    }),
  });
}
