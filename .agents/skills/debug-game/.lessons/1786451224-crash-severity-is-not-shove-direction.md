---
title: Crash severity and shove direction may need two answers from one contact
date: 2026-08-11
scope: engine/game/drive/impact.ts
concepts: [collision, physics, trajectory, severity]
---

The drive used one contact-normal projection for both how complete a vehicle crash was and where the struck vehicle travelled, so an offset meeting of two ends became nearly harmless. Keep the geometric normal for the lateral shove, but classify front/rear vehicle contact separately for crash energy and speed loss; this preserves a Burnout-style sideways wreck without grading the crash down.
