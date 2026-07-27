---
title: Sharing a component means sharing its wording and colours, not just its CSS
date: 2026-07-27
---

Phase 1 settled that sharing a game surface means EXTRACTING the shared part into
its own file (`pwa/src/lib/pixel-panel.css`) rather than linking the app's
stylesheet. Applying that to the item card produced a card that looked right and
still was not the game's card, because a card is three things:

1. its **skin** — extracted to `pwa/src/lib/item-card.css`, imported by
   `styles.css` and inlined by the library;
2. its **wording** — `affixLine` lived inside `ItemCard.tsx`, which a build
   script cannot import. It moved to `@ui/lib/affix-line.ts`, whose only import
   is a TYPE, so a plain `node` script loads it as-is and both surfaces word an
   affix identically;
3. its **colours** — `TIER_COLORS` / `AFFIX_COLORS` already sat in
   `pwa/src/game/tiers.ts` (also type-import-only), so the library reads that
   rather than restating a palette that would drift a shade at a time.

Extracting only the CSS gives you a card that looks like the game's and says
things the game does not. Check all three.

Two sizing notes, both learned from the screenshot:

- The game's pixel font has a 5-pixel cap in an 8-pixel em, so a card's font
  sizes must be MULTIPLES OF 8px (8 = the in-game scale 1, 16 = scale 2). Any
  other size puts the glyph grid on fractions and the art turns to mush.
- The app doubles its root font-size past `UI_SCALE_BREAKPOINT_PX` (700px), so
  the library has to as well, or a desktop reader is shown a card no desktop
  player sees.
