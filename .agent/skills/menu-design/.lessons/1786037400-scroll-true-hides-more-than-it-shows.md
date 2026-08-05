---
title: "`scroll: true` on a page that only just overflows HIDES rows the plain layout would have shown"
date: 2026-08-05
---

`scroll: true` does not mean "scroll if needed" — it means "cap this list at
`.title-menu.scrollable`'s `max-height: min(52vh, 20rem)` and scroll inside the
cap" (applied when `useMenuOverflow` also measures an overflow, see
`TitleScreen`'s `tallMenu && levelsOverflow`). At the landscape-phone reference
(844×390) that cap is ~202 px — about **four and a half rows** — while the plain
un-capped layout fits **six rows plus the bottom help line** in the same screen,
because the header shrinks and the column uses the whole height.

So a page that overflows by one or two rows is WORSE with the flag than without
it: the DEVELOPER index (five doors + BACK) showed five rows and swallowed its
own BACK row with `scroll: true`, and showed all six the moment the flag came
off. Without the flag the outer `.title-content` column scrolls anyway if the
screen really is too short, which is what the seven- and eight-row player
settings pages (GAMEPLAY, GORE) rely on.

Rule of thumb: reach for `scroll: true` when a list is genuinely LONG and
open-ended (the level ladder, the mod list, the BALANCE knobs — a dozen rows or
more, where a fixed cap with a fade beats a page you scroll past the header of).
For anything under about eight rows, leave it off and let the column do it.

And judge it from a screenshot, never from the row count: which of the two is
right is a measurement, and the reference viewport is the one that decides.
