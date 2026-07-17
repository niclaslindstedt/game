---
type: Changed
title: Realistic 3D title-menu planets
---

The developer ORBITAL MENU now renders every world as a real rotating, sun-lit globe: a per-pixel canvas sphere shader with a procedural surface texture, correct waxing/waning phases and a soft terminator computed from each body's true 3D position relative to the sun, atmospheric limb glow on the worlds with air, real axial tilt, and rotation and orbital speeds scaled from each planet's true period (Venus turns retrograde; the Moon is tidally locked). The orbits also fan out at their own inclinations so the system reads in 3D rather than as one flat line, and a new `?skytest` URL parameter opens a bare planetarium view of the sky for inspection.
