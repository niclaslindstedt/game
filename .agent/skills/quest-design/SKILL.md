---
name: quest-design
description: "Use when adding, updating or reworking a QUEST — an errand a non-combatant asks of the hero — or the person who hands it out, the conversation tree behind it, or a campaign-long chain. Covers what makes an errand worth doing rather than a chore (which verb each objective kind actually buys, combining two into a beat, giving a conversation a branch that can lose, pacing a chain), then the two catalogs and their pipeline, the eight objective kinds, what a reward may pay and how to price it, campaign vs run errands, conversations and neutral mobs, the trader hook, the story-chain obligation, and the build refusals and tests that bite when a piece is missing."
---

# Designing a Quest

An errand is one YAML file. Everything the player sees — the `!` over a head,
the pick list, the offer box, the tracker line, the log row, the map pin, the
library page — is derived from it, so the craft is entirely in the def and the
words. There is no engine change in a new quest; if you find yourself needing
one, that is the finding.

**The rules live in `AGENTS.md` → QUESTS.** Read that section first: it is the
_why_ (why the mark is derived, why the givers step last, why an escort is a
timer with a body). This skill is the _how_ — where to put things, what the
build will refuse, and how to check the result — plus the one thing no schema
can check: whether the errand is worth doing at all. If you read one section
before writing anything, make it **What makes an errand worth doing**.

**Before starting, read this skill's lessons** — `node scripts/skill-lessons.mjs quest-design --list`,
then the ones this task touches (`--scope=…`, `--concepts=…`). Reading them here and
reflecting on them before the commit is the **`skill-reflection`** skill's job — load
it at both ends of the session.

Load `pixel-assets` if the quest needs a new giver/escort sprite or item icon,
`enemy-design` if it needs a new breed to kill or talk to, `update-story` if it
moves a plot beat, `playtest` / `test-scenario` to see it running.

## Where everything lives

| Piece | File |
| --- | --- |
| The errand | `content/quests/<id>.yaml` — one per file, **stem == id** |
| The person | `content/quest-givers.yaml` — a `questGivers:` map of id → person |
| A conversation tree | `content/conversations/<id>.yaml` — stem == id |
| Field reference | `src/game/defs/quests.ts` (`QuestDef`, `QuestGiverDef`, `QuestObjective`, `QuestReward`, `QuestMerchantDeal`) and `src/game/defs/conversations.ts` — every field documented at the type |
| Pipeline | loader `scripts/quest-data/load-yaml.mjs`, schema `scripts/asset-tools/quest-schema.mjs`, generator `scripts/generate-quests.mjs` → gitignored `src/generated/quests.ts`. Regenerate with `make levels` (or `make assets`) |
| Engine | `src/game/quests/` — `index.ts` (orchestrator: givers, marks, the pick list, tallies), `escort.ts`, `rewards.ts`, `campaign.ts` + `campaign-save.ts` (the hero-carried log), `merchant.ts` (the stall hook), `placement.ts` (authored spots on a carved map) |
| Neutral mobs | `src/game/disposition.ts` (`inert`, `provokeEnemy`), `EnemyDef.disposition` / `conversation` / `ai.idle` |
| Conversations | `src/game/conversation.ts` (the runtime), `src/game/defs/conversations.ts` (the contract) |
| Tuning | `src/game/config/quests.ts` (`QUESTS.*` — talk/tap radii, escort numbers, drop pity; there is deliberately no ward radius) |
| App surfaces | `overlays/QuestOverlay.tsx` (offer + pick list), `QuestLogOverlay.tsx`, `TalkOverlay.tsx` (conversations), `game-screen/QuestTracker.tsx`, `QuestFlash.tsx`, `render/quests.ts` (givers, head marks, escorts), `quest-text.ts` |
| Sounds | `content/sounds/quest_*.yaml` + `escort_*.yaml` — event-triggered, so a new quest needs none |
| Library pages | `pwa/scripts/library/model-quests.mjs` (`QUEST_FIELDS`, `QUEST_GIVER_FIELDS`), `prose-quests.mjs`, `render-quests.mjs` |
| Story chain | `docs/story.md` → `docs/manuscript.md` — **every spoken line is transcribed** |
| Mod surface | `mod/FORMAT.md` (the authoring reference), `mod/catalog.json` (committed, drift-tested — regenerate when an id is added) |
| Tests | `tests/engine/quests_test.ts`, `campaign_quests_test.ts`, `conversation_test.ts` (synthetic fixtures); `tests/content/quests_test.ts` (the shipped campaign) |

## The def, by concern

**Identity.** `level` + `giver` + `order` decide where it appears and where it
sits in that person's pick list. `order` is low-first; without it the list falls
back to alphabetical, which is never the order a person would say things in.

**The words.** `offer` (pages, each a list of lines) → `incomplete` (the nag,
one page) → `complete` (pages). An authored line is a **paragraph**: the box
flows it into whatever column the device really has, so you are not counting
characters to a fixed width — you are deciding how much of a thought lands on
one screenful (~120 chars) and where the one held beat goes (max 2 lines per
page, and the whole shipped campaign spends five of them).

**`lore` is required, on both the errand and the person.** Described, not
spoken, in the dry register of an item's `description` — the library prints it,
and the alternative is a page whose only prose sits behind a spoiler cover.

**The eight objective kinds.** Every entry must be met.

| Kind | Asks for | Notes |
| --- | --- | --- |
| `kill` | `count` of a breed | Any kill counts — companions, powerups too |
| `killNamed` | one pinned elite/boss | Tracker reads a name, not a tally |
| `collect` | `count` of a piece the quest itself defines | See `items:` below |
| `escort` | walk somebody to `to` | The only kind that can FAIL |
| `visit` | stand at `at` on `level` | `name` is required — the tracker says the PLACE, never a coordinate |
| `flag` | a run flag was set | The only bridge from a conversation; `name` is what the tracker reads |
| `sell` | hand a piece over the counter | The piece LEAVES — that is the beat |
| `reachLevel` | be level N | Keep rare: a wall, not a task. Tracker words it as the climb |

**`items:`** are the quest's own tokens (id, name, icon), found via `dropFrom`
breeds (`dropChance`, capped at one in eight off a horde breed, with a pity
floor so a fetch quest is always finishable)
and/or `at:` spots laid out on ACCEPT. A piece with neither can never appear —
the build refuses it.

**`escorts:`** are bodies with hp the horde can reach. They follow the hero,
stop past the leash, and the errand fails if one falls.

**`reward:`** `xpShare` (a share of the hero's CURRENT level bar — never a flat
figure), `coins`, `loot: {count, tierBonus, slot}` rolled through the ordinary
drop pipeline, `uniques` handed over whole, `abilities` docked, `cleanSlates`
(a respec — the campaign pays exactly one, ever).

**`campaign: true`** moves the log and flags onto the HERO, per difficulty. Only
then may the chain cross maps, and a chain may not mix campaign and run links
in either direction. Use sparingly.

**`conversation:`** replaces the two-button offer with a tree, for a person the
hero has to talk around. **`merchant:`** lets the chain run through the stall —
`buys` (with `sets:` flags) and `sells` (gated on `requires:` flags).

## What makes an errand worth doing

The section above is how to author one. This is how to make one anybody wants
to finish — the part that is actually design, and the part a schema can never
check.

**The default failure is a chore.** "Kill eight of those" is not bad because
killing is bad; it is bad because it asks for more of what the player was
already doing, and the errand adds nothing but a counter. Before writing the
objectives, answer one question: **what does this make the player do that they
would not otherwise do today?** If the honest answer is "the same thing, but
counted", the errand is not ready.

Reaching for a kind other than `kill` is usually the answer, and each one buys
a different verb:

| Kind | What it actually asks of the player |
| --- | --- |
| `visit` | Look at the map instead of the fight. There is no arrow — the tracker gives a described PLACE, so the errand is a search |
| `flag` | Talk to somebody, and choose what to say |
| `sell` | Give something up. The piece LEAVES, and that cost is the beat |
| `collect` off a rare breed | Hunt a specific thing rather than whatever is nearest |
| `escort` | Fight differently — the horde wants you to kite, the follower wants you not to |
| `reachLevel` | Nothing today. It is a wall, and the chain has to be worth the wait |

**COMBINE kinds to make a beat; the ORDER is the mechanic.** The single most
useful thing in the catalog is not any one objective, it is that two of them in
sequence mean something neither means alone. The trader hook is the worked
example: `sell` the seal you prised off a body, and only THEN does `merchant.
sells` put the thing you actually wanted on the counter. Written as one step —
"buy the signature" — it is a fetch quest with a price tag. Written as two, the
trader becomes somebody with an opinion about what you are carrying. When you
add a `merchant:` block, check that the `requires:` flag makes the order
un-short-circuitable; if the player can buy first, you have written a shop.

**A conversation earns its place when a branch can LOSE.** A tree whose rows
all lead to the same node is a monologue with extra taps. Give at least one
branch a cost:

- **A door that closes.** The moon surveyor will not talk to a company man, and
  "COMPANY. SITE T AUDIT." is offered plainly as the efficient-sounding opening.
  Take it and he is done with you for the run.
- **A fight you asked for.** `provoke: true` turns the speaker hostile, and it
  cannot be taken back.
- **A branch you have to lose ON PURPOSE.** The tithe assessor will never hand
  over its seal — there is no clever line that gets it. What it cannot do is
  leave an error in its own count, so telling it the count is short starts a
  fight the player chose. That is a better beat than a persuasion check, because
  the player has to decide to start something with somebody who has been polite
  to them.

Two supporting rules: a gated row is LEFT OUT, never greyed (a greyed row is a
spoiler in the shape of a locked door), and `reentry` on flags is what stops a
person greeting you identically after you have already been told something.

**A chain earns its length by starting small.** THE SEVERANCE opens on a man
who needs a typewriter ribbon, pays 0.06 of a level for it, and the errand is
genuinely boring — deliberately, because the turn only lands if the player took
it for the coins. Escalate by REVEAL rather than by numbers: each link should
change what the previous one meant. If link four is link two with a bigger
count, the chain is padded rather than written.

**Put the last link's climax before the gate, not on it.** `reachLevel` is a
wait, not a fight. THE SEVERANCE's real climax is the link BEFORE it (a named
elite, a drop, the answer to the whole chain); the level gate that follows is a
quiet errand you finish by playing the game. A chain that ends on the wall ends
on an anticlimax.

**Nothing new is needed for most of this.** A quest is a second CALLER of
systems that already exist — the loot roller, the drop pipeline, the merchant,
the conversation runtime. If an errand seems to want an engine change, that is
usually the design asking for something the game does not do yet, and it is
worth reconsidering the errand before widening the engine.

## Picking the numbers

Calibrated against the 39 shipped errands — stay inside these unless you have a
reason:

- **A run errand:** `xpShare` 0.35–0.9 (median **0.5**), coins 60–260 (median
  **135**). It is one map's side work.
- **A campaign errand:** `xpShare` 0.06–1.0 (median **0.26**), coins 40–2000.
  They start deliberately tiny (a typewriter ribbon pays 0.06) and the last link
  pays the game's only respec.
- **Kill counts** are **40** for a breed the map's horde is thick with and
  **20** for a scarce or heavy one, and `tests/content/quests_test.ts` fails
  anything over 40. They used to run 1–10 and that was the wrong size of job:
  a measured MEDIUM run of GOODCO HQ kills 176 monsters in three minutes, so a
  ten-kill errand was finished before its offer box had been read twice. What
  makes 40 safe on the scarce breeds is that an errand TOPS THE HORDE UP as it
  is taken (`src/game/quests/restock.ts`) when the field can no longer pay for
  it — a carved map's monsters are finite, so an errand accepted on ground the
  hero already swept would otherwise sit at 0/40 forever. That suite also
  checks the breed is one the named map actually spawns, which the schema
  cannot: it only knows the id exists.
- **A fetch piece's `dropChance`** defaults to **0.08** and the build REFUSES
  anything above **0.125** off a breed the map's blueprint `horde` is made of.
  With the pity floor at 25 that is ~11 kills a piece, so a four-piece fetch
  errand and a forty-kill cull are deliberately the same size of job. The
  ceiling binds only FARMABLE carriers: off a one-off — an elite, a guardian, a
  bystander, a rampage-only hellborn — any rate is allowed and 1 is often
  right, because there is one of that mob and the roll decides whether the beat
  happens at all rather than how long the hunt is.
- **`xpShare` above 1** is a whole free level for one errand and out-paces the
  kills-per-level table the campaign is tuned on. The schema warns past 2.

## Workflow

1. **Decide run or campaign.** Run is the default and almost always right. A
   campaign chain asks the player to carry something for hours.
2. **Pick the person.** Reuse a giver if one already stands on that map with
   room in their slate; a new one needs an entry in `content/quest-givers.yaml`,
   a `_0`/`_1` sprite pair, a spot inside the map, and a `lore` paragraph. Place
   them near the intended route but out of a wave lane — a giver carries NO
   ward, so the horde reaches whoever is standing there.
3. **Write the errand.** `content/quests/<id>.yaml`, stem == id. Objectives
   first (they are the contract), then the words around them.
4. **New sprites/icons** via the `pixel-assets` skill — a giver/escort needs a
   walk pair, a quest piece needs one icon.
5. **Compile:** `make levels`. The schema refuses everything in the next
   section; fix until silent, including warnings.
6. **Story chain, if it speaks** — and it does: `docs/story.md` first (the
   gist), then `docs/manuscript.md` (verbatim). **Ask the user before rewriting
   the manuscript** unless the request already authorises it.
7. **Regenerate the mod catalog** if you added an id: `make mod-catalog` (it is
   committed and drift-tested, and it must land in the SAME commit).
8. **Verify.** `make test`, `make lint`, `make fmt-check` — and **never** a bare
   `npx vitest run` (see AGENTS.md: it skips the asset rebuild the drift tests
   depend on, so a stale catalog agrees with an equally stale build and CI
   fails over exactly the drift the test exists to catch).
9. **Look at it.** Stand the hero on the giver and screenshot — the harness
   needs a dev server, and writes into `pwa/assets-preview/playtest/`:

   ```sh
   npm install --no-save playwright     # once
   (cd pwa && npx vite --port 5199 &)
   node pwa/scripts/playtest.mjs --level <id> --seed 42 \
     --scenario '{"place":{"x":…,"y":…},"clearField":true}'
   ```

   Judge the offer box, the pick list, the tracker and the head mark — not the
   YAML.
10. **Changeset:** `.changes/unreleased/$(date +%s)-<slug>.md`, `type: Added`.

## The rules the surfaces rest on

**AND THE GEAR IS DECIDED BEFORE THE PLAYER SAYS YES —
`quests/reward-choices.ts`.** An errand used to promise "AN ITEM" and roll it
at the handover, which is two problems wearing one sentence: the player could
not tell whether the job was worth doing, and the piece that arrived had no
relation to the build they were playing. The gear is now MINTED ONCE, when
the conversation first opens (`GameState.questRewards`, keyed by quest id),
and shown in full — real bases, real tier, real rolled affixes, drawn with
the bag's own `affixLine` and tier colours. Four rules:
- **IT IS THE ORDINARY PIPELINE, CALLED THREE TIMES.** Every row is a
  `rollEquipment` off the level's own pool at the SAME tier and quality, so
  the choice is about the build and never about which row rolled better.
  `eligibleBases` is exported from `items/rolling.ts` for it rather than
  re-derived, or the level gates, the material gates and the base-level floor
  would exist twice.
- **THE THREE ARE ONE PER CLASS, AND THE GAME ALREADY HAD THE THREE.** A
  weapon reward offers a MELEE, a RANGED and a MAGIC base (`WeaponClass`); an
  armor reward offers MAIL, LEATHER and CLOTH — and those materials already
  lean STR/DEX/INT in their own `ARMOR_TYPES[…].statWeights`, so the class
  flavour of the affixes falls out of picking the base and nothing reaches
  into the affix roller. PLATE is deliberately not a lane (NIGHTMARE-gated,
  so it would be empty for most of the campaign).
- **SOMETHING EVERYONE WOULD WANT IS OFFERED ALONE.** A charm or a bag has no
  material, no weapon class and an even affix spread, so there is no second
  version of it to want instead — three copies of one piece is a menu with
  one dish.
- **MINTED AT THE CONVERSATION, NEVER AT THE RENDER.** The app is a pure
  READER (`questRewardChoices`); minting per render would spin a slot machine
  while the player read it and mint an item id every frame. The pick is
  `chooseQuestReward` (a run command like every other verb) and rides the
  errand, so it survives walking away and coming back.
- **SHOWN AT THE ASK, CHOSEN AT THE HANDOVER.** The offer lists them under
  ITEM REWARDS as a prospectus — what the job pays — and the slots are
  viewable but not selectable there: choosing at the ask would make the
  player commit at the one moment they know least about the build they will
  have when they come back. The handover says CHOOSE ONE and the slots take
  the press.
- **THEY ARE BAG SLOTS, AND THE CARD IS THE BAG'S.** A row per piece with its
  name and every affix under it is three stacked paragraphs in a box that
  already carries a speech and a contract, and the icon says what the thing
  is faster than the words did. So the gear draws as `.inv-cell` slots with
  no names, and a press (or a hover) opens the piece's own `ItemTooltip` —
  the same card, with the same worn-piece comparison, that the player reads
  every other piece of gear on.

2. **THE LOG IS THE TRUTH; THE MARK IS DERIVED.** `giverMark` recomputes the
`!` / `?` over a head from the quest log every time it is asked, and nothing
caches it — a stored mark goes stale the instant a kill three rooms away
completes an objective, and a `?` that isn't there is a quest the player
never hands in. The three states are WoW's: gold `!` (work to take), gold `?`
(work to hand in), grey `?` (work running).
3. **A CONVERSATION NEVER STARTS ITSELF, AND A TAP OPENS THE WHOLE SLATE.**
Walking up MEETS somebody — discovered, pinned on the map, `!` over the head
— and that is all it does; `talkToQuestGiver` is the only door in, and only a
tap on the person calls it. It used to auto-open on approach, on the theory
that a quest nobody notices is a quest nobody takes, and what that actually
did was freeze the run into a modal the player had not asked for because
they rounded the wrong crate mid-fight. The head mark carries the invitation
instead — WoW has never needed more than one — which is also why the
GREETING is written as an ASK ("CAN I ASK YOU A FAVOR?") rather than as a
line of ambient character: it is now heard only by a player who deliberately
walked up and pressed, so it has to pay for the press. A giver with more
than one thing to say opens on the **PICK LIST** (WoW's gossip window)
rather than handing back one errand at a time, because the one-at-a-time
rule makes a second quest reachable only by refusing the first — which reads
as the game losing track of what it already offered. Every exit from an
errand returns to the slate, so taking three off one person costs one
walk-up. With exactly one topic the list is skipped: a menu of one is a menu
nobody wants. **A LIST ROW IS A BUTTON AND IS SIZED LIKE ONE** — the same
vertical padding as `.pixel-button`, because a row at text height is a
quarter of the tap target of the GOODBYE button sitting under it, and the
row is the one the player came to press.
4. **PROGRESS IS BOOKED WHERE IT HAPPENS, NOT SCANNED FOR.** `creditQuestKill`
is called from `killEnemy` and `creditQuestPickup` from the item pass — the
tally counts what the hero DID, not what is left standing.
5. **THE ERRAND-GIVERS STEP LAST.** A quest conversation takes the stage by
setting `phase = "quest"`; a sight-pinned thought, the opening strike and a
lair's occupant all take it by setting `phase = "dialogue"`. Whichever runs
LAST wins — and when the thought won it left the offer set behind a dialogue
the player tapped away, so the offer never appeared and the giver was stuck
mid-conversation for the rest of the run. `stepQuests` therefore runs after
every other scene-raising pass in `step/index.ts`.
6. **THE PERSON OWES A PARAGRAPH AND SO DOES THE JOB.** `QuestGiverDef.lore` and
`QuestDef.lore` are both REQUIRED and both DESCRIBED rather than spoken, in
the register of an item's `description` — the same rule `EnemyDef.lore`
follows, and for the same reason: without them an errand's only prose is its
offer dialogue, which is written to be heard while standing in front of
somebody and which the library keeps behind a spoiler cover. Nothing in the
simulation reads either; the library's ERRANDS section prints both in the
open, and the manuscript governs them without transcribing them.

**THE ERRANDS ARE ANSWERED ON THREE SURFACES, AND EACH ANSWERS A DIFFERENT
QUESTION** — which is why none of them can be folded into another:

- **THE TRACKER** (right of the field, under the minimap — WoW's objective
  tracker) is "how many more", read without stopping. It shows only RUNNING and
  finished-not-handed-in work, caps at three, and is tap-transparent, because
  the right-hand third of a landscape phone is where the steering thumb lives.
- **THE FLASH** (`QuestFlash.tsx`) is "that one counted", over the MIDDLE of the
  field. The tracker is always right and nobody is looking at it: a player who
  just killed the thing on their list is looking at the thing they just killed.
  It rides the engine's `questProgress`, emitted from the ONE `bump` every kind
  of progress goes through, so a kill off a list, a named elite going down, a
  fetch piece walked over and an escort delivered are all announced without four
  call sites — and it words itself with `objectiveLine`, so it can never
  disagree with the strip it is announcing.
- **THE LOG** is "what was I doing", read with the play stopped. It is raised by
  the HUD's own `!` button (beside the bag pouch) and freezes the run in its own
  **`questLog` phase**, exactly as the fog-of-war map does — a phase rather than
  an app-side pause, so nothing else has to be told a screen is up and the pause
  menu stays the pause menu. The button is GOLD once the run has taken an errand
  and grey until then; an untaken OFFER deliberately does not light it, since
  two givers stand on every map from the first frame and counting those would
  leave it permanently gold and saying nothing (that offer is already announced
  by the gold `!` over the person's own head). It used to hang off the pause
  menu, which put the answer to "what was I doing" two presses deep behind a
  screen about quitting.

The wording those three share is the leaf `pwa/src/game/quest-text.ts`
(`objectiveLine`), not the offer modal it used to live in: the run loop's event
pass reaches it on every bump, and a wording helper inside a modal component
would drag the modal into the loop to get at it. The tracker is kept live by the
quest tally being folded into the HUD change-key (`hud-model.ts`) — it reads
`state` directly, so without that a delivered escort moved nothing the key was
watching and the strip sat on a stale count.

The wording those three share is the leaf `pwa/src/game/quest-text.ts`
(`objectiveLine`), not the offer modal it used to live in: the run loop's event
pass reaches it on every bump, and a wording helper inside a modal component
would drag the modal into the loop to get at it.

## What the build refuses

Every one of these is silent at runtime — an errand that simply never completes,
with nothing on screen to explain it. That is why they are hard errors.

- **A coordinate that is off the map it names** — a giver's `at`, a `visit`,
  an `escort` destination or a placed piece. Checked against the venue's real
  `width`/`height`; within 32px of an edge is a warning instead.
- **Dangling ids:** the level, the giver, an enemy, a `dropFrom` breed, a
  sprite (and its `_0`/`_1` frames), an icon, a unique, a powerup, a
  conversation, a `requires` quest, a `minDifficulty`.
- **A giver who hands out no quests** — a person you walk up to and get silence
  from is the most confusing thing a quest system can ship.
- **A chain that loops**, or one that `requires` itself.
- **A chain that mixes run and campaign links**, either direction.
- **A run chain crossing maps** — the gate is read standing on that level, and a
  run's log dies with it.
- **A run errand's `visit` on another map** — the hero is never there while it
  runs.
- **A `collect` item nothing drops and nothing placed**, or one the `items:`
  block does not define; same for an `escort` id.
- **A `dropChance` above 0.125 off a breed the map's `horde` is made of** — a
  piece falling out of every second or third body is a counter rather than a
  hunt. Off a ONE-OFF carrier it is silent (and 1 is often correct there).
- **A conversation** whose `start`/`goto`/`reentry` names a missing node, two
  nodes with the same id, or a `gives:` handing over a piece the named quest
  does not define in its own `items:` — the hero would pick up a token no
  objective is counting.
- **An empty `merchant:`** — it must buy something or sell something.
- **Missing `lore`** on either the errand or the person.

Warnings you should still clear: a page over ~120 chars, more than 2 lines in a
page, `lore` over 420 chars, `xpShare` over 2, an errand with no reward.

## After you're done — the checklist

- [ ] `make levels` silent — no errors, no warnings
- [ ] `make test` green (**not** `npx vitest run`), `make lint`, `make fmt-check`
- [ ] `mod/catalog.json` regenerated if an id was added
- [ ] `docs/story.md` + `docs/manuscript.md` updated for every spoken line
- [ ] The library builds — a new authored field must be declared in
      `QUEST_FIELDS` / `QUEST_GIVER_FIELDS` **and actually rendered**. Declaring
      it alone makes the build pass while the page shows nothing, which is the
      exact silent omission the guard exists to prevent
- [ ] Looked at the offer box and the tracker in the running game
- [ ] Changeset fragment written
- [ ] `skill-reflection` run: a lesson fragment if this pass taught you
      something, and the stale/duplicate ones dealt with

## Skill self-improvement

Load the **`skill-reflection`** skill before this session commits. It owns the
whole lesson lifecycle for this skill: recording what the pass learned (with a
`scope` and `concepts` so the next task can find it), fixing anything in this
file the pass proved WRONG, deleting what went stale, merging what now says the
same thing twice, and promoting anything true in 100% of runs into the tables and checklists above.

```sh
node scripts/skill-lessons.mjs quest-design --list
```
