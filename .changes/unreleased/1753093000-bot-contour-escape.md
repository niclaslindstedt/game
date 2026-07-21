---
type: Fixed
title: Autopilot no longer wedges on walls
---

The autopilot now escapes geometry like a human: when stuck it commits to an open heading and traces the obstacle's contour instead of rotating blindly, its A* route replans when a wall cuts off the next waypoint, and loot grabs steer around shelves — eliminating the wall-pocket livelocks that froze botted runs.
