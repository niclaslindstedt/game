// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The shared shell for the game's DOCUMENT pages — the privacy policy and the
// contact page (`PrivacyPage.tsx`, `ContactPage.tsx`), each served at its own
// path by the alias emitter in `pwa-plugin.ts`.
//
// These render in a PLAIN readable font on purpose. Every other surface uses
// the pixel font, which is uppercase-only (`GLYPHS` in
// scripts/asset-tools/font.mjs) and unreadable at paragraph length — these are
// documents, not part of the game's chrome. English-only by design.
import type { ReactNode } from "react";

import { IDENTITY } from "./identity.ts";

/** Where a reader reaches a human — printed by both document pages and named
 * as the App Store listing's support contact (native/store/listing.yaml).
 *
 * Injected at build time from the `SUPPORT_EMAIL` repo variable (see
 * `vite.config.ts` and the Pages workflow), NOT hardcoded: the address can then
 * change without a commit, and it isn't sitting in a public source tree for
 * address scrapers. */
export const CONTACT_EMAIL = __SUPPORT_EMAIL__;

export function DocShell({
  title,
  updated,
  children,
}: {
  title: string;
  /** ISO date of the last meaningful edit, rendered under the heading. */
  updated?: string;
  children: ReactNode;
}) {
  // The deploy-slot root (`/`, `/preview/`, …) — the link back to the game.
  const homeUrl = import.meta.env.BASE_URL;
  return (
    <div className="h-full overflow-y-auto bg-[#0b0d10] px-4 pt-[calc(2.5rem+env(safe-area-inset-top))] pb-[calc(2.5rem+env(safe-area-inset-bottom))] text-neutral-300">
      <article className="mx-auto flex w-full max-w-2xl flex-col gap-6 font-sans text-sm leading-relaxed">
        <header className="flex flex-col gap-3">
          <a
            href={homeUrl}
            className="self-start text-xs text-amber-400 hover:underline"
          >
            &larr; Back to {IDENTITY.title}
          </a>
          <h1 className="text-lg font-bold text-white">{title}</h1>
          {updated ? (
            <p className="text-xs text-neutral-500">Last updated: {updated}</p>
          ) : null}
        </header>
        {children}
      </article>
    </div>
  );
}

export function Section({
  title,
  id,
  children,
}: {
  title: string;
  id?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="flex scroll-mt-10 flex-col gap-2">
      <h2 className="text-sm font-bold tracking-wide text-white">{title}</h2>
      {children}
    </section>
  );
}

export function Strong({ children }: { children: ReactNode }) {
  return <span className="text-neutral-100">{children}</span>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="font-mono text-neutral-100">{children}</code>;
}

/** The contact address as a mailto link — the one way to reach a human, so it
 * is spelled the same wherever it appears. */
export function MailLink() {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className="text-amber-400 hover:underline"
    >
      {CONTACT_EMAIL}
    </a>
  );
}
