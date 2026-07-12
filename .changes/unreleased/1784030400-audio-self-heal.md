---
type: Fixed
title: Sound no longer stops intermittently
---

Music and sound effects no longer stay silent after the browser or OS
suspends the audio engine (an audio-device change, a background tab, or an
iOS interruption). The engine now nudges the audio context back to life on
its own every scheduler tick instead of waiting for a user gesture, so sound
reliably recovers rather than requiring a lucky menu tap.
