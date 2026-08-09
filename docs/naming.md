# Naming — invent it, don't borrow it

This is the full rule. `AGENTS.md` carries the short form; when a name is being
chosen, read this one. It governs the **shipped campaign**. A mod's names are its
author's business and answer to nobody — except `mod/examples/`, which is
shipped content and follows the rule like everything else.

**Nothing in this game is named after a real person, company, product or
franchise — and that includes the near-miss pun.** The satire targets a
PHENOMENON (automation taking people's work, the people it makes rich, the
world it leaves behind) and never a nameable party. That is both the honest
version of the joke and the only version that ships: an app store may refuse a
game whose enemies are a real company on its own content guidelines, long
before anybody's lawyer reads a word of it.

**A NAME IS A QUARTER OF IT — this is the rule that gets missed.** A boss
renamed off a real person, still speaking that person's verbal tics, is that
person with a new nameplate. Four things carry identity and they move together
or not at all:

1. **THE NAME** — id, display name, file stem, sprite stem.
2. **THE VOICE** — `dialogue`, `lastWords`, barks, `lore`. A catchphrase, a
   signature insult, a manner of speaking, and any verifiable biographical fact
   (a filmography, a citizenship, a war, a court case) are each identification
   on their own.
3. **THE ART** — the sprite grid AND its `subject` slots. A silhouette
   identifies without a face: a stage costume, a distinctive hairline, the
   uniform somebody actually wears every day. **Trade dress counts double** — a
   brand's COLOUR SEQUENCE is protectable with no name attached, which is why
   the search baron wears a barcode rather than four coloured bars. And never
   trace a photograph: that puts a copyright question over the image on top of
   the likeness question over the person.
4. **THE DESCRIPTION** — a mob's or item's `description`/`lore` ships verbatim
   in the generated library, and a sprite's `description`, every `subject.*`
   slot and the palette comments are what the prompt generator feeds an image
   model (`scripts/asset-tools/prompt.mjs`). So a cleaned grid with a dirty
   `subject` grows its likeness straight back on the next regeneration.

**NAME THE ROLE, NOT THE PERSON.** THE FOUNDER, THE MODERATOR, THE FULFILLER,
THE SAFETY OFFICER, THE VENDOR, THE STRONGMAN, THE ROOT. The archetype is the
funnier half anyway — it is the thing being satirized, where the celebrity was
only ever one example of it — and it does not date. Read the shipped roster
before adding to it; new content joins that register, and a name needing
specialist knowledge to land at all (THE SUDOER) is off-register even when it
is safe.

What is SAFE, and generously so — most of this catalog already lives here:

- **Myth, folklore and antiquity.** Every name in the artifact tier (DRAUPNIR,
  GÁNDIVA, SAMPO, GRAM, BRISINGAMEN…) and the myth names in the tiers below it
  (MJÖLNIR, EXCALIBUR) are public domain and always will be.
- **Real technical, historical and trade vocabulary.** A Tesla coil, a boot
  hill, a minute repeater, a perpetual calendar, a barcode, root access. These
  are words, not brands.
- **Historical EVENTS.** Alternate history is a genre. That the first landing
  happened, and when, is free; who specifically walked is not.
- **Long-dead figures — with the estate caveat.** TESLA (1943), HOUDINI (1926),
  EARHART (1937) and RASPUTIN (1916) sit outside any post-mortem publicity
  statute. A twentieth-century celebrity is a different thing: several states
  run a post-mortem right for decades (Ohio 60 years, and Tennessee's exists
  because of Elvis), and those estates enforce. "Dead" is not the test —
  "dead long enough, and with nobody left to act" is.
- **Invented brands.** GOODCO and TRUST ME BRO AI carry the whole corporate
  satire precisely because they are ours.

What to refuse, including the cases that do not feel like borrowing:

- A real person, **living most of all** — a living subject adds defamation to
  the publicity question, and depicting one committing a crime is the sharpest
  form of it. Note the dead are not automatically safe here either: Sweden
  prosecutes **förtal av avliden** where a claim about a deceased person wounds
  surviving relatives, and this repo's author is Swedish.
- A company or product name, **and the one-letter pun on it**. A swapped vowel
  is not a different mark.
- **A coined term from another fiction**, even where the premise is fair game.
  "Robot western theme park" is an unprotectable idea; calling the robots
  "hosts" borrows the expression. Premises are free, vocabulary is not.
- **A title echoing a franchise's construction** — especially where the swapped
  word is a SYNONYM rather than an opposite, since that is the same commercial
  impression, which is the actual test. EAST/WEST are opposites and distinguish;
  GONE/LOST are synonyms and do not.
- Real logos, mascots, slogans and brand colour sequences in grids or palette
  comments.

**THE MECHANICAL TRAP, if a sweep is ever needed again — it defeated four
consecutive passes that each looked exhaustive.** A regex word boundary does
NOT fire before `_`, so `\bmosque\b` silently skips `mosque_brand` and
`\bspacez\b` skips `spacez_armed`. Always follow a boundary pass with a
prefix-aware one, then grep for `<old>_` and `_<old>` separately. Three
neighbours of the same trap:

- **A display name may also be a JavaScript identifier** (`const BOOT_HILL`), so
  a replacement containing a space breaks the parser rather than a test.
- **Library slugs are hyphenated** (`the-flagbearer`), so an id rename that
  writes `the_flagbearer` into a URL passes every type check and fails at
  runtime.
- **Scope content sweeps AWAY from the code layers** — `engine/`, `server/`,
  `electron/` and `tauri/`. `host` is the multiplayer vocabulary as well as a
  park robot, and `content/mainmenu.yaml` carries the multiplayer HOST rows
  despite living under `content/`.
- **Anything auditing a rename must exclude itself**, or the bulk pass rewrites
  the list of names it was checking against and then reports clean.
