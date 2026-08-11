# Platform planning

Store requirements change. Before final delivery, verify current dimensions,
safe areas, alpha rules, file formats, and content policies against official
platform documentation or the repository's current releasing manifests.

Approval by a storefront is only the minimum bar. Review every accepted image
again from the perspective of a player deciding what the game is. A compliant
but misleading capsule damages reviews, refunds, retention, and trust.

## Steam

Treat each capsule as its own composition. Search/list capsules need ruthless
thumbnail clarity; library heroes need a wide crop-safe center; library logos
must remain separate transparent artwork. In this repository, the current exact
rasters live in `electron/RELEASING.md` and
`electron/store/capsules/PROMPTS.md` and are enforced by store preflight.

## Apple App Store

Keep icons free of transparency and platform badges. Screenshots are real
product captures handled by `store-shots`; use this skill only for promotional
art Apple currently accepts for the relevant placement. Respect device crops,
safe areas, rating/content rules, and localized copy.

## Google Play

Plan the feature graphic for aggressive surface-dependent crops and keep the
core subject/title inside a conservative center safe area. Treat screenshots as
real product captures. Validate icon masking and avoid baking store badges or
small unreadable copy into feature art.

## Cross-platform set review

- Make one contact sheet of finals at actual thumbnail scale.
- Check that the set varies composition and palette without changing identity.
- Check every crop for missing faces, weapons, titles, and narrative cues.
- Confirm generated-content disclosures for every target storefront.
- Keep ratings, legal marks, platform logos, prices, awards, and review quotes
  out unless the user supplies and authorizes exact assets/copy.
