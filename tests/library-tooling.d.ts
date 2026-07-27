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

/** An arsenal page's subject — a plain base or a named chase item. Loose for
 * the same reason `LibraryEnemy` is: the shape is the generator's business. */
type LibraryItem = {
  id: string;
  slug: string;
  path: string;
  name: string;
  kind: "base" | "named";
  family: "weapon" | "gear" | "named";
  tier: string;
  icon: string;
  levelReq: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

/** A mission page's subject. */
type LibraryMission = {
  id: string;
  slug: string;
  path: string;
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [field: string]: any;
};

type LibraryModel = {
  enemies: LibraryEnemy[];
  venues: Array<{ id: string; slug: string; name: string }>;
  groups: Array<{ venue: { id: string } | null; entries: LibraryEnemy[] }>;
  items: LibraryItem[];
  bases: LibraryItem[];
  named: LibraryItem[];
  missions: LibraryMission[];
};

/** What a page renderer needs to resolve slot-relative URLs, backgrounds and
 * the mission maps. */
type LibraryContext = {
  base: string;
  groundFor: (venueId: string | null) => string | null;
  mapFor?: (
    levelId: string,
  ) => { src: string; width: number; height: number } | null;
  venueOf?: (item: LibraryItem) => string;
};

declare module "*/library/model.mjs" {
  export const ENEMY_FIELDS: Record<string, string>;
  export function libraryModel(): LibraryModel;
  export function libraryRoutes(): Array<{ path: string; sources: string[] }>;
  export function slugFor(id: string): string;
  export function enemyPath(id: string): string;
}

declare module "*/library/model-arsenal.mjs" {
  export const WEAPON_FIELDS: Record<string, string>;
  export const GEAR_FIELDS: Record<string, string>;
  export const UNIQUE_FIELDS: Record<string, string>;
  export function itemPath(id: string): string;
}

declare module "*/library/model-missions.mjs" {
  export const LEVEL_FIELDS: Record<string, string>;
  export function missionPath(id: string): string;
}

declare module "*/library/render-arsenal.mjs" {
  export function itemPage(item: LibraryItem, context: LibraryContext): string;
  export function arsenalIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
}

declare module "*/library/render-missions.mjs" {
  export function missionPage(
    mission: LibraryMission,
    context: LibraryContext,
    sprites: string,
  ): string;
  export function missionsIndex(
    model: LibraryModel,
    context: LibraryContext,
  ): string;
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
