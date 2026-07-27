// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Ambient types for THE LIBRARY's build-tooling `.mjs` modules
// (pwa/scripts/library/, see docs/library-plan.md). They're plain JavaScript
// with no declarations of their own; these wildcard module shims give
// tests/content/library_test.ts just enough typing to import them without
// `any` — the same pattern as ./sprite-tooling.d.ts.
//
// Deliberately loose on the page model: the shapes are the generator's own
// business and pinning them here would be a second definition to keep in step.
// What the test asserts is BEHAVIOUR — that every monster gets a page, that
// the numbers are the engine's, that the markup holds — not field types.

type LibraryRung = {
  difficulty: string;
  name: string;
  color: string;
  heroLevel: number;
  level: [number, number];
  authoredHp: boolean;
  hp: [number, number];
  contact: [number, number];
  xp: [number, number];
};

type LibrarySighting = {
  venue: { id: string; slug: string; name: string };
  kinds: string[];
  rungs: LibraryRung[];
};

type LibraryEnemy = {
  id: string;
  slug: string;
  path: string;
  name: string;
  role: "minion" | "elite" | "boss";
  sprite: string;
  home: { id: string; slug: string; name: string } | null;
  sightings: LibrarySighting[];
  [field: string]: unknown;
};

type LibraryModel = {
  enemies: LibraryEnemy[];
  venues: Array<{ id: string; slug: string; name: string }>;
  groups: Array<{ venue: { id: string } | null; entries: LibraryEnemy[] }>;
};

/** What a page renderer needs to resolve slot-relative URLs and backgrounds. */
type LibraryContext = {
  base: string;
  groundFor: (venueId: string) => string | null;
};

declare module "*/library/model.mjs" {
  export const ENEMY_FIELDS: Record<string, string>;
  export function libraryModel(): LibraryModel;
  export function libraryRoutes(): Array<{ path: string; sources: string[] }>;
  export function slugFor(id: string): string;
  export function enemyPath(id: string): string;
}

declare module "*/library/render-bestiary.mjs" {
  export function enemyPage(
    enemy: LibraryEnemy,
    context: LibraryContext,
  ): string;
  export function bestiaryIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
  export function landing(model: LibraryModel, context: LibraryContext): string;
}
