// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Standalone privacy policy, served at `/privacy` (see the path switch in
// `main.tsx` and the `emit-privacy-alias` plugin in `pwa-plugin.ts`). It is
// the URL App Store Connect and the Play Console require, and the canonical
// statement the store privacy questionnaires are answered from.
//
// The game is local-first with no backend of our own, no account, and no
// analytics — everything stays on the device. Data leaves it in exactly three
// ways, all of them platform-mediated and all described in full below: the
// iCloud cross-device save, Game Center identity, and store purchases.
//
// It renders in a PLAIN readable font on purpose. Every other surface uses the
// pixel font, which is uppercase-only (`GLYPHS` in scripts/asset-tools/font.mjs)
// and unreadable at paragraph length — a legal page has to be legible, and it
// is a document rather than part of the game's chrome. English-only by design,
// mirroring the sibling projects' policy pages.
import { Code, DocShell, MailLink, Section, Strong } from "./DocPage.tsx";
import { IDENTITY } from "./identity.ts";

// Last meaningful change to the policy text below. Bump this whenever the
// wording is edited — it renders verbatim at the top of the page and is the
// only line a reader has to look at to see how fresh the policy is.
const LAST_UPDATED = "2026-07-26";

export function PrivacyPage() {
  return (
    <DocShell title="Privacy policy" updated={LAST_UPDATED}>
      <Section title="Summary">
        <p>
          <Strong>{IDENTITY.title}</Strong> is a game that runs entirely on your
          own device. There is no backend of ours, no account to create, no
          sign-up, no cookies, and no analytics or tracking of any kind. We do
          not operate a server that your game talks to, and we never receive
          your saves, your progress, or any information about how you play.
        </p>
        <p>
          Your heroes and settings are stored on the device you play on. Inside
          the installed app they can additionally be carried between{" "}
          <em>your own</em> devices through Apple&apos;s iCloud, which is a
          service of your own Apple Account — not ours.
        </p>
      </Section>

      <Section title="What the game stores on your device">
        <p>
          In your browser&apos;s <Code>localStorage</Code> for this origin (or,
          in the installed app, the equivalent storage private to the app), the
          game keeps:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>
            Your <em>hero roster</em> — each character&apos;s name, level,
            stats, inventory, equipment, and campaign progress.
          </li>
          <li>Any run you parked mid-level, so you can pick it back up.</li>
          <li>Your high scores, including the hardcore score board.</li>
          <li>
            Your settings — sound and music volume, control preferences, key
            bindings, and display options.
          </li>
          <li>
            Your in-game coin balance, held as a set of per-device counters so
            the total survives being merged across your devices.
          </li>
          <li>
            A random identifier generated on the device, used only to tell your
            own devices&apos; coin counters apart when they merge. It is not
            tied to you, is never sent to us, and is not used for tracking.
          </li>
        </ul>
        <p>
          All of this is ordinary data on your own device. Clearing the
          browser&apos;s site data for this origin, or deleting the app, erases
          the local copy permanently — if you have not enabled the cross-device
          save, there is no other copy to restore from.
        </p>
      </Section>

      <Section title="Network requests">
        <p>
          In the browser, the only requests made are to fetch the game&apos;s
          own static files — HTML, JavaScript, CSS, the sprite atlas, and icons
          — from its own origin. Once loaded it is fully playable offline as an
          installed Progressive Web App. No fonts, analytics scripts,
          error-reporting services, advertising networks, or third-party
          resources of any kind are ever loaded.
        </p>
        <p>
          The <Strong>installed app</Strong> makes no requests at all to play.
          The entire game ships inside the app and is served from a small HTTP
          server running locally on your own device, so it works in airplane
          mode from the first launch. The only network traffic it can produce is
          the platform&apos;s own — iCloud sync, Game Center, and store
          purchases — each described below and each handled by Apple or Google
          rather than by us.
        </p>
      </Section>

      <Section title="Cross-device save (iCloud)" id="cloud-save">
        <p>
          In the installed app, <Strong>CLOUD SAVE</Strong> (under SETTINGS →
          DATA) copies your hero roster, your coin balance, and your hardcore
          score board into the{" "}
          <Strong>key-value storage of your own iCloud account</Strong>, so the
          same heroes appear on your other devices signed in to the same Apple
          Account. The data is written by Apple&apos;s iCloud, stays in your
          account, and is governed by Apple&apos;s privacy policy. It is not
          sent to us and we have no way to read it.
        </p>
        <p>
          Device-shaped state is deliberately excluded and never leaves the
          device: your settings, key bindings, which hero is selected, and any
          parked run.
        </p>
        <p>
          The feature is available only in the installed app, because a browser
          has no platform cloud to write to. You can see its state and sync on
          demand from that same settings page.
        </p>
      </Section>

      <Section title="Game Center">
        <p>
          On iOS the app asks <Strong>Game Center</Strong> for the display name
          of the signed-in player, so the cross-device save can show whose
          roster it is holding. That name is read from Apple&apos;s service on
          your device and stored with the save, and nothing about it is sent to
          us.
        </p>
        <p>
          The app also mirrors your <Strong>achievements</Strong> to that Game
          Center profile, so the badges you earn appear alongside your other
          games&apos;. The game&apos;s own badge shelf stays the record; Game
          Center is sent a copy, and is never read back.
        </p>
        <p>
          And it submits scores to Game Center&apos;s public{" "}
          <Strong>leaderboards</Strong> — the hardest blow you have ever landed,
          your lifetime kill count, your best sustained kill rate, and how far a
          hardcore hero got on the hardest difficulty. Those numbers, and the
          Game Center name Apple shows beside them, are published to the other
          players on those boards.
        </p>
        <p>
          All of it goes to Apple, not to us: we run no server and receive no
          copy of any of it. If you would rather not appear, sign out of Game
          Center — the game keeps its own on-device badge shelf and high-score
          board either way, and nothing else changes.
        </p>
      </Section>

      <Section title="Purchases">
        <p>
          The game sells optional <Strong>coin packs</Strong> — in-game currency
          only, and nothing in the story, the maps, or the loot is behind them.
          Purchases are processed entirely by{" "}
          <Strong>Apple&apos;s App Store</Strong> or{" "}
          <Strong>Google Play</Strong>. Your payment details are handled by them
          and are never seen by, sent to, or stored by us — the game only ever
          receives the platform&apos;s confirmation that a pack was bought, and
          credits the coins on your device.
        </p>
      </Section>

      <Section title="Cookies and analytics">
        <p>
          The game sets no cookies, and loads no analytics or
          behavioural-tracking SDK. We collect no usage statistics, no crash
          reports, and no telemetry. There is nothing to opt out of, because
          nothing is collected.
        </p>
      </Section>

      <Section title="Server logs">
        <p>
          The website is served as a static bundle by{" "}
          <Strong>GitHub Pages</Strong>. GitHub may record standard request
          metadata — IP address, user agent, requested path — in order to
          operate the service, as described in{" "}
          <a
            href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
            className="text-amber-400 hover:underline"
          >
            GitHub&apos;s privacy statement
          </a>
          . We run no additional logging service and have no access to those
          logs beyond what GitHub shows any repository owner. The installed app
          does not fetch the website at all, so it produces no such logs.
        </p>
      </Section>

      <Section title="Children">
        <p>
          The game is a general-audience action game containing stylised fantasy
          violence. It is not directed at children under 13, and it collects no
          personal information from anyone, of any age.
        </p>
      </Section>

      <Section title="Changes to this policy">
        <p>
          The <em>Last updated</em> date at the top of this page reflects the
          most recent edit. Should a future version store something new, or add
          another place data can be sent, this policy will be updated to
          describe it before that change ships.
        </p>
      </Section>

      <Section title="Contact">
        <p>
          For anything at all — including a question about this policy or a
          request about your data — write to <MailLink />.
        </p>
      </Section>
    </DocShell>
  );
}
