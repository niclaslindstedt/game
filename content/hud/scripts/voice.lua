-- SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
-- THE VOICE CARDS' JUDGEMENTS — what a card says about the person on it, and
-- what colour it says it in.
--
-- Called as `f(state)` like every other HUD script, with one group more than
-- usual: `state.speaker` is THIS CARD's own speaker, because the card's parts
-- are drawn once per person on the rail.
--
--   speaker.seat     their seat in the party
--   speaker.name     their roster name, already cut to the card's width
--   speaker.level    how loud their latest frame was, 0..1
--   speaker.peak     the loudest frame in the kept window, 0..1
--   speaker.muted    silenced locally, by this player, for this session
--   speaker.unheard  their packets arrive and nothing here can decode them
--   speaker.talking  a packet arrived recently enough to still count
--   speaker.self     this is the player's own card
--
-- `state.voice` is the session's own half (`live`, `transmitting`, `level`,
-- `speakerCount`, `faulted`, `fault`), and `state.hud` / `state.ui` are there as
-- always — so a card CAN read the run, which is what a mod that wants a
-- speaker's health on their card needs.

local M = {}

--- HOW LOUD COUNTS AS SHOUTING — the peak at which a card turns hot.
--
-- A presentation threshold and nothing else: below it a card draws in the party
-- rail's own green, above it in the amber the HUD already uses for "look at
-- this". The point is not accuracy. It is that two cards side by side answer
-- "which of these two is screaming" without the player comparing bar heights.
local SHOUT_PEAK = 0.34

--- …and how loud counts as a WHISPER, below which the card says so. Somebody
-- talking under this is somebody their friends will ask to speak up, and saying
-- it on the card saves the round trip.
local WHISPER_PEAK = 0.05

local HOT = "#ffd75e"
local CALM = "#e8ecf1"
local QUIET = "#9aa3ad"
local BROKEN = "#ff9b9b"
local LIVE = "#7ef0c8"
local DEAD = "#4b5563"

local function shouting(state)
  return state.speaker.peak >= SHOUT_PEAK
end

--- IS THIS CARD HOT — the one judgement that also drives a CSS class
-- (`.voice-card.shouting`, which draws the card's border and its glow). It is
-- exported rather than kept private so the border cannot drift from the words:
-- everything that reddens when somebody starts shouting asks this.
function M.is_shouting(state)
  return shouting(state) and not state.speaker.muted
end

--- WHAT THIS CARD IS DOING, in a word — and the ORDER is the whole of it.
--
-- `unheard` first, because it is the only one that is a fault: somebody IS
-- talking and this machine cannot decode them, and silence would be
-- indistinguishable from a mute. Then the mute, which the player did on purpose.
-- Then the two ends of the loudness ladder. Ordinary speech says nothing at all
-- — a card that is always captioned is a card nobody reads.
function M.status_text(state)
  if state.speaker.unheard then
    return "CANNOT PLAY THIS VOICE"
  elseif state.speaker.muted then
    return "MUTED"
  elseif state.speaker.peak < WHISPER_PEAK then
    return "WHISPERING"
  elseif shouting(state) then
    return "SHOUTING"
  end
  return ""
end

function M.status_color(state)
  if state.speaker.unheard then
    return BROKEN
  elseif M.is_shouting(state) then
    return HOT
  end
  return QUIET
end

--- The name at the head of the card, hot while they are shouting.
function M.name_color(state)
  if M.is_shouting(state) then
    return HOT
  end
  return CALM
end

--- THE WAVEFORM'S OWN COLOUR, which follows the same ladder so the strip and
-- the words never disagree. A muted card's strip goes grey rather than dark:
-- the bars still move, because "silenced" and "not talking" are different
-- things and the card should keep saying which.
function M.wave_color(state)
  if state.speaker.muted or state.speaker.unheard then
    return DEAD
  elseif shouting(state) then
    return HOT
  end
  return LIVE
end

return M
