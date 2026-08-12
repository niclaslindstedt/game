// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE STORY — one chapter per mission, and the front page that runs them in
// order.
//
// These are the library's READING pages. The other three sections answer a
// question ("what does a PERFECT gladius swing for"); this one is read start to
// finish, so it is prose first and tables never.
//
// It is also the section where the spoiler rule earns its keep. A chapter is
// nothing BUT plot, so every word of it sits behind a cover — and every word is
// still really in the document, because a blurred paragraph is indexed and a
// hidden one is not. What stays uncovered is only what a player already knows
// before they get there: which venue it is, and how much is waiting in it.

import { spriteSize } from "./art.mjs";
import {
  escapeHtml,
  img,
  page,
  pageSchema,
  reveal,
  revealAll,
  SITE_URL,
  table,
  TITLE,
} from "./html.mjs";
import { list } from "./prose.mjs";
import { linkDictionary, prose } from "./story-doc.mjs";

/** Speech pages, the blockquote treatment the whole library shares. */
const speech = (pages, who, hero = false) =>
  pages
    .map(
      (lines) => `      <blockquote class="speech${hero ? " hero" : ""}">
        ${who ? `<span class="who">${escapeHtml(who)}</span>` : ""}
        <p>${lines.map(escapeHtml).join("<br />")}</p>
      </blockquote>`,
    )
    .join("\n");

/** A cutscene's spoken beats: narrator cards and lines, in the order played. */
const scene = (beats) =>
  beats
    .map((beat) =>
      beat.kind === "caption"
        ? `      <p class="caption">${beat.lines.map(escapeHtml).join("<br />")}</p>`
        : speech([beat.lines], beat.who, beat.who === "THE HERO"),
    )
    .join("\n");

/**
 * One monologue, however many boxes it is tapped through. A hero's intro or a
 * pinned thought is a single unbroken thing — rendering a blockquote per page
 * would read as several people taking turns, which is what the exchanges above
 * legitimately look like and this is not.
 */
const monologue = (
  pages,
  who = "THE HERO",
  hero = true,
) => `      <blockquote class="speech${hero ? " hero" : ""}">
        <span class="who">${escapeHtml(who)}</span>
${pages
  .map((lines) => `        <p>${lines.map(escapeHtml).join("<br />")}</p>`)
  .join("\n")}
      </blockquote>`;

/**
 * A PINNED BEAT, rendered as what it actually is. Nearly all of them are the
 * hero alone, and print as one unbroken monologue. A few are an EXCHANGE —
 * somebody answers him back (`{ them: … }`, `ThoughtDef.voice`) — and those
 * have to take turns on the page, or the other party's words come out in the
 * hero's own blockquote under his own name, which is the one thing a reader
 * must never be shown about a scene with two people in it.
 */
const pinnedBeat = (thought) => {
  const them = thought.voice?.speaker;
  if (!them) return monologue(thought.pages);
  let run = [];
  let hero = true;
  const out = [];
  const flush = () => {
    if (run.length > 0)
      out.push(monologue(run, hero ? "THE HERO" : them, hero));
    run = [];
  };
  for (const page of thought.pages) {
    const mine = Array.isArray(page);
    if (mine !== hero) {
      flush();
      hero = mine;
    }
    run.push(mine ? page : page.them);
  }
  flush();
  return out.join("\n");
};

/**
 * What a name in the story's prose may link to, in priority order. This is what
 * stitches the four sections into one graph: a chapter naming THE FLAGBEARER hands
 * the reader his stat block, one naming EXCALIBUR hands them its card.
 *
 * The order matters because a name is not always unique — THE FOUNDER is three
 * separate monsters, one per venue he is cornered in — so a chapter puts its
 * OWN cast at the front and links the copy the reader is actually reading
 * about. Beyond that, the earliest sighting wins: a name first met on the moon
 * should not lead to the version of it fought two venues later, which would be
 * a link that spoils by itself.
 */
export function storyLinks(model) {
  const byFirstSighting = [...model.enemies].sort(
    (a, b) => (a.home?.storyIndex ?? 99) - (b.home?.storyIndex ?? 99),
  );
  return [
    byFirstSighting,
    model.items,
    model.missions,
    // The people the story's side-errand paragraphs name by name — PRIYA NAIR,
    // THE CONCIERGE, CU-RIE. They read exactly like the monsters do (a full
    // uppercase run of the game's own name for somebody), and until they had
    // pages of their own they were the one cast in those paragraphs a reader
    // could not click through to.
    model.quests.givers,
    model.venues.map((venue) => ({
      name: venue.name,
      path: `missions/${venue.slug}`,
    })),
  ];
}

// ---- the sections -----------------------------------------------------------

/**
 * What a chapter page says with its cover ON. It has to be enough to tell a
 * reader whether this is the chapter they came for, and it must give away
 * nothing — so it is counted off the page's own contents rather than written.
 */
function frame(chapter, position, total) {
  if (chapter.kind === "hellborn") {
    const venues = new Set(chapter.arrivals.map((a) => a.venue.id)).size;
    return `They only exist on the top two rungs, and only once you have made
      enough noise to be heard. ${chapter.arrivals.length} of them come through,
      spread across ${venues} venues, and the game never explains a single one.
      Everything below this line is covered.`;
  }
  const has = [
    chapter.scenes.length > 0
      ? `${chapter.scenes.length} scene${chapter.scenes.length === 1 ? "" : "s"} on the way in`
      : null,
    chapter.speakers.length > 0
      ? `${chapter.speakers.length} named figures with something to say`
      : null,
    chapter.finds.length > 0
      ? `${chapter.finds.length} find${chapter.finds.length === 1 ? "" : "s"} that fill in the rest`
      : null,
    chapter.thoughts.length > 0
      ? `${chapter.thoughts.length} things he says only to himself`
      : null,
  ].filter(Boolean);
  const holds = list(has);
  return `Chapter ${position} of ${total}${
    chapter.secret ? ", and the one nothing in the game tells you about" : ""
  }. ${holds ? `It holds ${holds}. ` : ""}Every word of it is the game's own,
      and every word of it is a spoiler, so the whole chapter is covered until
      you ask for it.`;
}

function gistSection(chapter, linker) {
  const hellborn = chapter.kind === "hellborn";
  return `      <h2 id="story">${hellborn ? "What they are" : "What happens here"}</h2>
${reveal({
  id: "reveal-gist",
  label: hellborn ? "WHAT THEY ARE" : "THE PLOT",
  body: prose(chapter.gist, {
    heading: chapter.heading,
    ...linker,
  }),
})}`;
}

function scenesSection(chapter, linker) {
  if (chapter.scenes.length === 0) return "";
  const blocks = chapter.scenes
    .map(
      (
        cut,
        i,
      ) => `      <h3 id="scene-${escapeHtml(cut.slug)}">${escapeHtml(cut.title)}</h3>
${reveal({
  id: `reveal-scene-${i}`,
  label: "THE SCENE",
  body: `${
    cut.gist ? `${prose(cut.gist, { heading: cut.title, ...linker })}\n` : ""
  }${scene(cut.beats)}${variantsBlock(cut, linker)}`,
})}`,
    )
    .join("\n");

  const one = chapter.scenes.length === 1;
  return `      <h2 id="scenes">How he gets there</h2>
      <p>${one ? "The scene that plays" : "The scenes that play"} before the
      level does, tapped through one frame at a time.</p>
${blocks}`;
}

/**
 * The rungs a scene plays differently on. Only the prelude does — the weapon on
 * the living room wall is the run's actual starting weapon — and the difference
 * is read by diffing the variants the engine registers, so a new rung or a
 * re-armed wall shows up here without anyone saying so.
 */
function variantsBlock(cut, linker) {
  if (cut.variants.length === 0) return "";
  return `
        <h4>What hangs on the wall</h4>
        <p>The same night on every rung but one detail: what he takes down off
        the wall, which is the weapon the whole run starts with.</p>
        <ul class="notes">
${cut.variants
  .map(
    (variant) =>
      `          <li><span class="stat-key" style="color:${escapeHtml(variant.color)}">${escapeHtml(variant.name)}</span>${
        variant.weapon
          ? `<a href="${linker.href(variant.weapon.path)}">${escapeHtml(variant.weapon.name)}</a> — `
          : ""
      }${escapeHtml(variant.beats.flatMap((beat) => beat.lines).join(" "))}</li>`,
  )
  .join("\n")}
        </ul>`;
}

function arrivalSection(chapter) {
  if (chapter.intro.length === 0) return "";
  return `      <h2 id="arrival">What he says on arriving</h2>
      <p>The monologue over the black screen, before a single shot.</p>
${reveal({
  id: "reveal-intro",
  label: "THE MONOLOGUE",
  body: monologue(chapter.intro),
})}`;
}

function thoughtsSection(chapter, { href }) {
  if (chapter.thoughts.length === 0) return "";
  const body = chapter.thoughts
    .map((thought, i) => {
      const who = thought.enemy
        ? `<a href="${href(thought.enemy.path)}">${escapeHtml(thought.enemy.name)}</a>`
        : "";
      // A scripted strike is one scene fought over several rounds, so only its
      // FIRST round introduces the man swinging; the rest just say he did it
      // again, which is the whole shape of the beat.
      const again = thought.when === "strike" && thought.blow > 0;
      const heading = again
        ? thought.blow === 1
          ? "He swings again"
          : "And again"
        : `${
            {
              kill: "The first one he kills",
              sight: "The first one he sees",
              strike: "The one who swings first",
              // A MARTYR the level walks in on its own clock. A SIGHTING like
              // `sight`, but of somebody nothing placed on this floor — which
              // is exactly what the heading has to say.
              martyr: "The first one who walks in wearing a bomb",
              // Not a speaker but a DOOR he tries too early — so the slot the
              // others fill with a mob's name gets the door's instead.
              door: "The way out he cannot take yet",
              // Not a speaker either: the venue ENDING, which on this one
              // venue is a beat rather than a splash (`LevelDef.exitByCar`).
              exit: "When the last of them stops moving",
              // Not a speaker either: a PLACE, and being in it is the whole
              // trigger. The slot gets what "being there" means.
              place: {
                arrival: "The first minute he stands here",
                pastDoor: "When he walks out of here instead",
              }[thought.where],
            }[thought.when]
          }${
            thought.door
              ? ` — ${escapeHtml(thought.door)}`
              : who
                ? ` — ${who}`
                : ""
          }`;
      return `      <h3 id="thought-${i}">${heading}</h3>
${pinnedBeat(thought)}`;
    })
    .join("\n");
  return `      <h2 id="thoughts">What stops him mid-run</h2>
      <p>The run halts for these: something on this map is worth him saying out
      loud. Most fire on their own and once only. Usually there is nobody to say
      it to — and on the few where there is, they answer back. The ones pinned
      to a door are his answer to you trying it, and they keep answering for as
      long as the road stays shut.</p>
${reveal({ id: "reveal-thoughts", label: "WHAT HE THINKS", body })}`;
}

function speakersSection(chapter, { href, sprites }) {
  if (chapter.speakers.length === 0) return "";
  const body = chapter.speakers
    .map((speaker) => {
      const size = spriteSize(speaker.sprite);
      const pages = speaker.dialogue
        .map((entry) => {
          const hero = !Array.isArray(entry);
          return speech(
            [hero ? entry.hero : entry],
            hero ? "THE HERO" : speaker.name,
            hero,
          );
        })
        .join("\n");
      const notes = [
        speaker.apparition
          ? "He speaks and dissolves — there is nothing here to fight."
          : null,
        speaker.spareable
          ? "Beaten to his knees he can be spared instead of finished, and then he follows you."
          : null,
      ].filter(Boolean);
      return `      <h3 id="said-${escapeHtml(speaker.id.replace(/_/g, "-"))}">${
        size
          ? `${img({
              src: `${sprites}${speaker.sprite}.png`,
              alt: "",
              width: size.width,
              height: size.height,
              className: "sprite",
            })} `
          : ""
      }<a href="${href(speaker.path)}"><span class="role-${speaker.role}">${escapeHtml(speaker.name)}</span></a></h3>
${notes.length > 0 ? `      <p class="note">${escapeHtml(notes.join(" "))}</p>\n` : ""}${pages}${
        speaker.lastWords.length > 0
          ? `\n      <p class="last-words">As he falls:</p>
${speech([speaker.lastWords], speaker.name)}`
          : ""
      }`;
    })
    .join("\n");

  return `      <h2 id="said">Who speaks here</h2>
      <p>Every named figure on this map talks, and the fight waits while they
      do. The hero answers back — the arrival scenes are exchanges, not
      speeches.</p>
${reveal({ id: "reveal-said", label: "WHAT THEY SAY", body })}`;
}

function findsSection(chapter, { href }) {
  if (chapter.finds.length === 0) return "";
  const body = chapter.finds
    .map((find) => {
      const where = find.from
        ? `Off <a href="${href(find.from.path)}">${escapeHtml(find.from.name)}</a>.`
        : "Left lying where somebody dropped it.";
      const notes = [
        where,
        find.unlocks ? "It opens a door on this map." : null,
        find.suitsHero
          ? "Picking it up puts the hero in the suit for the rest of the run."
          : null,
        find.keepsake
          ? "Kept for good: it stays with the character across every later " +
            "run — and it is what unseals the rift seam on the garage wall."
          : null,
      ].filter(Boolean);
      return `      <h3 id="found-${escapeHtml(find.id.replace(/_/g, "-"))}">${escapeHtml(find.name)}</h3>
      <p class="note">${notes.join(" ")}</p>
${speech(find.lore, null)}`;
    })
    .join("\n");
  return `      <h2 id="found">What he finds</h2>
      <p>The conspiracy is told in pieces you pick up off the floor, one find at
      a time. These are the ones this chapter holds.</p>
${reveal({ id: "reveal-found", label: "THE FINDS", body })}`;
}

function endingSection(chapter, linker) {
  if (chapter.outro.length === 0 && !chapter.epilogue) return "";
  const parts = [
    chapter.epilogue
      ? prose(chapter.epilogue, { heading: "Epilogue", ...linker })
      : "",
    chapter.outro.length > 0 ? monologue(chapter.outro) : "",
  ].filter(Boolean);
  return `      <h2 id="ending">How it ends</h2>
${reveal({ id: "reveal-ending", label: "THE ENDING", body: parts.join("\n") })}`;
}

function hellbornSection(chapter, { href, sprites }) {
  const body = chapter.arrivals
    .map((arrival) => {
      const size = spriteSize(arrival.sprite);
      return `      <h3 id="hellborn-${escapeHtml(arrival.id.replace(/_/g, "-"))}">${
        size
          ? `${img({
              src: `${sprites}${arrival.sprite}.png`,
              alt: "",
              width: size.width,
              height: size.height,
              className: "sprite",
            })} `
          : ""
      }<a href="${href(arrival.path)}">${escapeHtml(arrival.name)}</a></h3>
      <p class="note">Comes through at <a href="${href(arrival.venue.path)}">${escapeHtml(arrival.venue.name)}</a>,
      on <span style="color:${escapeHtml(arrival.color ?? "")}">${escapeHtml(arrival.rung)}</span> and up.</p>
${arrival.thoughts.map((thought) => pinnedBeat(thought)).join("\n")}${
        arrival.lastWords.length > 0
          ? `\n${speech([arrival.lastWords], arrival.name)}`
          : ""
      }`;
    })
    .join("\n");
  return `      <h2 id="arrivals">What comes through</h2>
      <p>Two per venue: the one a NIGHTMARE run can meet, and the worse one only
      the top rung ever sees. The hero has no idea what any of them are, and the
      game never tells him.</p>
${reveal({ id: "reveal-hellborn", label: "WHAT COMES THROUGH", body })}`;
}

// ---- the pages ---------------------------------------------------------------

/** One chapter. */
export /**
 * THE CAMPAIGN CHAIN's chapter, which is a chapter about a ROUTE rather than a
 * place: it names its links in narrative order, with the venue each is handed
 * out on, so a reader can see the shape of the whole thing before taking the
 * first one. The prose above it already tells the story; this is the map of it.
 */
function chainSection(chapter, href) {
  const rows = chapter.links.map((link) => [
    `<a href="${href(link.path)}">${escapeHtml(link.name)}</a>`,
    `<a href="${href(link.venue.path)}">${escapeHtml(link.venue.name)}</a>`,
    link.minDifficulty ? escapeHtml(link.minDifficulty.toUpperCase()) : "—",
  ]);
  return `      <h2 id="links">The chain, in order</h2>
      <p>Nine errands across five venues, carried on the hero rather than on the
      run: its progress survives leaving a map, and the person who hands out the
      next link is whoever is standing on the venue the story has reached. It is
      tracked per difficulty, so a fresh rung starts it again.</p>
${table({ head: ["ERRAND", "HANDED OUT ON", "FROM RUNG"], rows })}`;
}

export function chapterPage(chapter, context, position, total) {
  const { base, groundFor, linkGroups } = context;
  const canonical = `${SITE_URL}${base}library/${chapter.path}/`;
  const href = (path) => `${base}library/${path}/`;
  const sprites = `${base}library/sprites/`;
  const at = { href, sprites };
  // One `seen` set for the whole page: a name is linked the first time the
  // reader meets it and left as prose after that.
  const linker = {
    dict: linkDictionary([chapter.speakers, ...linkGroups]),
    href,
    seen: new Set(),
  };
  // Under 160 characters, or Google truncates it (check-seo warns) — and the
  // tail is where the spoiler warning would be, so it is the half that has to
  // survive being cut.
  const description =
    chapter.kind === "hellborn"
      ? `The hellborn in ${TITLE}: what a rampage lets through on the top two rungs, where each arrives, and what the hero makes of it.`
      : `${chapter.name}, chapter ${position} of ${TITLE}: the scenes, the monologues, the arrival speeches and the found lore, behind spoiler covers.`;

  const chips = [
    chapter.kind === "hellborn"
      ? `<li class="chip tag">NIGHTMARE AND UP</li>`
      : `<li class="chip">CHAPTER ${position}</li>`,
    chapter.secret ? `<li class="chip tag">SECRET</li>` : "",
    chapter.venue
      ? `<li class="chip"><a href="${href(chapter.venue.path)}">THE PLACE</a></li>`
      : "",
  ].filter(Boolean);

  const nav = [
    chapter.previous
      ? `<a href="${href(chapter.previous.path)}">&laquo; ${escapeHtml(chapter.previous.name)}</a>`
      : "",
    chapter.next
      ? `<a href="${href(chapter.next.path)}">${escapeHtml(chapter.next.name)} &raquo;</a>`
      : "",
  ].filter(Boolean);

  const body = `      <ul class="chip-row">${chips.join("")}</ul>
      <p class="lede">${frame(chapter, position, total)}</p>
${revealAll({ id: "reveal-chapter", label: "THE WHOLE CHAPTER" })}
${
  chapter.kind === "hellborn"
    ? `${gistSection(chapter, linker)}
${hellbornSection(chapter, at)}`
    : chapter.kind === "chain"
      ? `${gistSection(chapter, linker)}
${chainSection(chapter, href)}`
      : `${gistSection(chapter, linker)}
${scenesSection(chapter, linker)}
${arrivalSection(chapter)}
${thoughtsSection(chapter, at)}
${speakersSection(chapter, at)}
${findsSection(chapter, at)}
${endingSection(chapter, linker)}
      <h2 id="place">The place itself</h2>
      <p>Everything this chapter happens in — what it fields on each rung, who
      is waiting, what it pays out and the map of it — is on
      <a href="${href(chapter.venue.path)}">the ${escapeHtml(chapter.name)} mission page</a>.</p>`
}
${nav.length > 0 ? `      <nav class="campaign-nav">${nav.join("")}</nav>` : ""}`;

  return page({
    base,
    path: chapter.path,
    title: `${chapter.name} — the story of ${TITLE}`,
    description,
    heading: chapter.name,
    crumbs: [
      { label: "LIBRARY", href: `${base}library/` },
      { label: "STORY", href: `${base}library/story/` },
      { label: chapter.name },
    ],
    ground: groundFor(chapter.venue?.id ?? null),
    body,
    schema: pageSchema({
      type: "Article",
      canonical,
      name: `${chapter.name} — the story of ${TITLE}`,
      description,
    }),
  });
}

/** The story's front page: the premise, and the chapters in order. */
export function storyIndex(model, { base, groundFor, linkGroups }) {
  const canonical = `${SITE_URL}${base}library/story/`;
  const href = (path) => `${base}library/${path}/`;
  const story = model.story;
  const chapters = story.chapters;
  const description = `The whole story of ${TITLE}, a chapter per mission: every cutscene, monologue, arrival scene and piece of found lore, as the game plays them.`;

  const entries = chapters
    .map((chapter, i) => {
      const counts = [
        chapter.speakers.length > 0
          ? `${chapter.speakers.length} WHO SPEAK`
          : null,
        chapter.finds.length > 0
          ? `${chapter.finds.length} ${chapter.finds.length === 1 ? "FIND" : "FINDS"}`
          : null,
        chapter.scenes.length > 0
          ? `${chapter.scenes.length} ${chapter.scenes.length === 1 ? "SCENE" : "SCENES"}`
          : null,
        chapter.arrivals?.length ? `${chapter.arrivals.length} OF THEM` : null,
      ].filter(Boolean);
      return `        <li><a href="${href(chapter.path)}"><span class="chapter-no">${
        chapter.kind === "hellborn" ? "&mdash;" : i + 1
      }</span><span>${escapeHtml(chapter.name)}</span>${
        counts.length > 0
          ? `<span class="chapter-holds">${escapeHtml(counts.join(" · "))}</span>`
          : ""
      }</a></li>`;
    })
    .join("\n");

  return page({
    base,
    path: "story",
    title: `The story of ${TITLE}`,
    description,
    heading: "THE STORY",
    crumbs: [{ label: "LIBRARY", href: `${base}library/` }, { label: "STORY" }],
    ground: groundFor(model.venues[0].id),
    body: `      <p class="lede">A chapter per mission, in the order they are played.
      Each one carries the whole of that chapter — the scenes, the monologues,
      the arrival speeches, the last words and the lore.</p>
      <p>Everything below the covers is a spoiler and stays covered until you
      ask for it, so arriving cold costs you nothing and reading on costs you
      the ending.</p>
      <h2 id="premise">The premise</h2>
${reveal({
  id: "reveal-premise",
  label: "THE PREMISE",
  body: prose(story.premise, {
    heading: "Premise",
    dict: linkDictionary(linkGroups),
    href,
    seen: new Set(),
  }),
})}
      <h2 id="chapters">The chapters</h2>
      <ol class="chapters">
${entries}
      </ol>
      <h2 id="refrain">The line he keeps saying</h2>
      <p>One monologue belongs to no chapter. Farm a map past the level it was
      tuned for — the kills stop paying, the monsters stop mattering — and he
      catches himself at it. The game rotates through ${story.refrain.length}
      moods of the same two beats.</p>
${reveal({
  id: "reveal-refrain",
  label: "THE REFRAIN",
  body: story.refrain.map((thought) => pinnedBeat(thought)).join("\n"),
})}`,
    schema: pageSchema({
      type: "CollectionPage",
      canonical,
      name: `The story of ${TITLE}`,
      description,
    }),
  });
}
