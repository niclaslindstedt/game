---
type: Fixed
title: The tilted camera — steady fog, straight controls, and walls that lie down
---

Three things the world projection got wrong, most visible with the developer
CAMERA YAW turned up but two of them present on the shipped camera too:

- **The fog of war no longer crawls.** Its stipple is composited in screen space
  but was snapped to whole WORLD units, which is a fractional number of screen
  pixels once the floor is foreshortened — so the frontier band slid against the
  ground and re-phased as the hero walked. It now snaps to the projected ground
  grid, the same whole pixel the floor itself is blitted on.
- **Steering goes where you push.** The touch dpad, the stick and the WASD
  cluster all state a direction on the SCREEN, and it was being handed to the
  simulation as a direction in the WORLD — so with the camera turned, "down" walked
  the hero off at an angle. The push now crosses into the world through the
  projection, with the pace it was pushed at left alone.
- **Blood, dust and punted bodies travel along the floor.** The effects layer is
  drawn upright over a projected anchor, which is right for something happening in
  the air but wrong for anything measuring a distance ACROSS the ground: a blood
  spray flew along the screen's axes while the spatter it left landed on the
  turned floor, a jump's dust smeared the wrong way from the man who kicked it up,
  a killed body was punted off at an angle to the blow, and a swing's ground
  footprint pointed somewhere the blade never went. All four now go through the
  projection — which also retires three hand-rolled "flatten" constants that stood
  in for the camera's own squash and ignored the live pitch.
- **Art drawn from above lies down with the floor.** A sprite says which plane it
  belongs to (`plane: upright | floor`), so a wall panel, a painted marking, a
  hatch or a top-down crate foreshortens with the ground tiles it is set into
  instead of standing up taller than them — and a straight run of wall stops
  reading as a flight of stairs when the camera is turned.
