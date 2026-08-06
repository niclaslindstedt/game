---
title: A giver may owe a MEETING before their slate opens — `QuestGiverDef.intro`
date: 2026-08-06
---

"Talking to X the first time should play a dialogue, then they hand out
quests" is a giver-level facility, not a quest-level one:
`QuestGiverDef.intro: { conversation, until }` in `content/quest-givers.yaml`.
The first tap opens that tree instead of the slate (gated in
`talkToQuestGiver`, `src/game/quests/index.ts`); once `until` is set by one of
the tree's branches the slate opens exactly as before. Flags travel with the
hero for a campaign giver, so the meeting is had once per DIFFICULTY, not once
per run.

Two things that bite:

- **`QuestDef.conversation` looks like the field for this and is DEAD.** It is
  typed, schema-validated and documented, and nothing in the engine reads it —
  `talkToGiverTree` had no caller at all before this. Wiring it properly would
  need a way for a branch to ACCEPT an errand, which is not one of the four
  things a branch may do. Don't reach for it.
- **The schema refuses an `until` no branch sets** (`checkGiverIntro` in
  `scripts/asset-tools/quest-schema.mjs`, reading the `refs.flags` set the
  generator already builds). Without that check the failure is a person
  standing over their own errands forever with nothing on screen to say why.
