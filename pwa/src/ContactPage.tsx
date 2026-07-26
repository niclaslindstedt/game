// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Standalone contact page, served at `/contact` (see the path switch in
// `main.tsx` and the alias emitter in `pwa-plugin.ts`).
//
// It exists because App Store Connect REQUIRES a support URL and rejects a
// bare `mailto:` — so the support address needs a page to live on. That is
// also why this page carries no links back into the game or the source
// repository: it is reached from a paid store listing, and its whole job is to
// put a reader in touch, not to route them anywhere else.
import {
  CONTACT_EMAIL,
  DocShell,
  MailLink,
  Section,
  Strong,
} from "./DocPage.tsx";
import { IDENTITY } from "./identity.ts";

export function ContactPage() {
  return (
    <DocShell title="Contact and support">
      <Section title="Get in touch">
        <p>
          Everything about <Strong>{IDENTITY.title}</Strong> — a bug, a crash, a
          question about a purchase, a lost hero, a request about your data, or
          just something you want to say about the game — goes to one address:
        </p>
        <p className="text-base">
          <MailLink />
        </p>
        <p>
          It is read by a person, not a queue. Expect a reply within a few days.
        </p>
      </Section>

      <Section title="What to include">
        <p>
          A useful report is much faster to fix than a vague one. Where you can,
          mention:
        </p>
        <ul className="ml-5 list-disc space-y-1">
          <li>Which device and OS version you are playing on.</li>
          <li>
            Whether you are on the installed app or in a browser, and the
            version shown at the bottom of the title screen.
          </li>
          <li>The hero, level, and difficulty it happened on.</li>
          <li>What you did just before it went wrong.</li>
        </ul>
      </Section>

      <Section title="Purchases">
        <p>
          Coin packs are sold and processed by <Strong>Apple</Strong> or{" "}
          <Strong>Google</Strong>, not by us — so refunds are requested through
          them, and we never see your payment details. If coins you paid for did
          not arrive, open the store screen once while online (an interrupted
          purchase is redelivered automatically), and write to <MailLink /> if
          they still have not appeared.
        </p>
      </Section>

      <Section title="Your data">
        <p>
          The game keeps your heroes and progress on your own device and runs no
          server of ours. The full details are on the{" "}
          <a
            href={`${import.meta.env.BASE_URL}privacy/`}
            className="text-amber-400 hover:underline"
          >
            privacy policy
          </a>
          . For anything that page does not answer, write to {CONTACT_EMAIL}.
        </p>
      </Section>
    </DocShell>
  );
}
