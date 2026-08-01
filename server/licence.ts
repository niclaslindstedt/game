// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE LICENCE LOCK.
//
// Multiplayer is licensed through Steam and nowhere else (docs/multiplayer.md
// — Licence): the multiplayer right travels with the Steam copy, so a session
// carried over anything but the Steam relay is unlicensed play, whoever set it
// up. The hub enforces that per join with its `unlicensed` refusal; what it
// cannot enforce is the ESCAPE — `allowUnlicensedTransport` — which the repo's
// own suites and the headless soak legitimately need, and which the dedicated
// server reads from a config file. A config file is a thing a determined
// player can edit, so on its own the escape is a statement of what the licence
// permits rather than a lock.
//
// This literal is the lock. In the repo tree it is `true`, so tests, the soak
// fleet and a developer's own dedicated server all work from sources. The ship
// target (`scripts/build-server.mjs`) folds it to `false` while staging, so in
// the packaged binary the config escape is dead code and no edit to any file
// the build ships can reopen it. It is a LITERAL rather than a computed value
// precisely so the fold is a one-token rewrite the build can verify it made.
//
// The honest limit stays honest: this locks the SHIPPED build. Somebody
// compiling the open-source tree themselves holds `true` again — that is the
// nature of a source-available game, and the licence text is what governs
// them, not this constant.
export const UNLICENSED_TRANSPORT_UNLOCKED: boolean = true; // licence-lock: the ship target folds this literal to false
