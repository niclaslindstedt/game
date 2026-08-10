// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";

import "./styles.css";
// The game path enters at the STUDIO CARD, not at the app: `Boot.tsx` is the
// whole entry chunk and fetches `App.tsx` behind the card it puts up. The doc
// pages below never reach it at all, so they no longer carry the app's graph
// either.
import { Boot } from "./Boot.tsx";
import { markAppMounted } from "./app/boot-watchdog.ts";

// Both document pages are lazily loaded, and must STAY lazy: they are walls of
// prose that nobody reaching the game ever loads, and bundling them into the
// entry chunk pushes the critical path over the SEO checker's 1000 KB budget
// (`pwa/scripts/check-seo.mjs`). Their own chunks cost the rare visitor a fetch
// and cost every player nothing.
const PrivacyPage = lazy(() =>
  import("./PrivacyPage.tsx").then((m) => ({ default: m.PrivacyPage })),
);
const ContactPage = lazy(() =>
  import("./ContactPage.tsx").then((m) => ({ default: m.ContactPage })),
);

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// Trivial path-based switch. The build emits `dist/<page>/index.html` for each
// entry in `DOC_PAGES` (pwa-plugin.ts) so the host serves this same bundle at
// `/privacy/` and `/contact/`, and this check decides which view mounts.
// Deploy slots nest them one segment deeper (`/preview/privacy/`), and the
// installed app serves them off its own local server — the suffix check
// matches them all.
//
// Both URLs are required by the app stores (a privacy policy, and a support
// page because App Store Connect rejects a bare `mailto:`), so they must
// resolve everywhere the game is served, not just on the release slot.
const path = window.location.pathname.replace(/\/$/, "");
const page = path.endsWith("/privacy")
  ? PrivacyPage
  : path.endsWith("/contact")
    ? ContactPage
    : null;

// The game is an APP, not a document, so lock the document's own scrolling the
// moment we know a game surface is what's mounting (see `html.app-locked` in
// styles.css). It goes on before the first render — a frame in which the page
// is still scrollable is a frame a thumb already on the glass can pull.
// The doc pages keep their scroll: they are documents, and they say so by not
// being locked.
if (!page) document.documentElement.classList.add("app-locked");

// NO <StrictMode> WRAPPER, deliberately. `preact/compat` exports it as a plain
// Fragment — Preact has no development-mode double-invocation — so wrapping the
// tree in it would render as a safety check that does not run, which is worse
// than not claiming one. The rule it used to enforce still stands as a RULE
// (a state updater must be pure); it is simply no longer machine-checked here.
createRoot(root).render(
  page ? (
    // No fallback UI: the prerendered shell already carries the page's gist,
    // so a null fallback is a blink, not a blank page.
    <Suspense fallback={null}>
      {page === PrivacyPage ? <PrivacyPage /> : <ContactPage />}
    </Suspense>
  ) : (
    <Boot />
  ),
);

// CALL OFF THE BOOT WATCHDOG (app/boot-watchdog.ts) — the inline script in the
// shell is, until this line runs, counting down to declaring the boot dead and
// reloading the page out from under it. AFTER `render`, not before: what the
// watchdog is asked to prove is that something replaced the prerendered
// console, and a flag raised by a module that then threw on its way to
// mounting would prove the opposite of what it claims.
markAppMounted();
