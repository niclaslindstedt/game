---
title: Screen-stated intent judged by world-frame arcs breaks under the projection
date: 2026-08-01
---

Symptom class: a control that states its intent on the SCREEN (the touch
dpad, a held pointer) produces wrong-looking behavior from a system that
judges intent by WORLD-frame angles — e.g. the car's intent arcs
(`vehicles.ts`) read a screen-up push, unprojected through a yawed/pitched
camera, as a bearing far enough behind the nose to mean REVERSE, so the
parked car backed away from an innocent push.

Mechanism: `screenDirToWorld` is correct for "walk that way" (a bearing),
but any consumer that CLASSIFIES the bearing against fixed world-frame arcs
(forward/abeam/behind) inherits the projection's skew. The neutral band the
player perceives is screen-relative; the engine's is world-relative.

Fix pattern: measure the intent's geometry in SCREEN space (dot/cross of
the push against the projected nose via `projectOffset`), then compose the
engine-facing target in the ACTOR's own frame (`heading` ± the measured
deflection). The projection has positive determinant, so which SIDE of the
nose a push sits on is the same on screen and floor — only magnitudes skew.

Triage shortcut: log the composed target AND the consumer's classification
(`want`/`ahead`) for a few ticks; a transient wrong-source input (a stale
cursor-follow target on the first tick of a touch) and a held-forever
residual (a band that never brakes) both show up immediately in that trace.
