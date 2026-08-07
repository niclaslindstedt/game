// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE VOICE TAP — the developer's receive-side recorder, and the two things
// about it that are worth pinning rather than eyeballing.
//
// The WAV header is the first: it is 44 hand-written bytes with three lengths in
// it that all have to agree, and the failure mode is a file that opens as
// silence, as noise, or at the wrong speed — none of which looks like a header
// bug when you are trying to judge whether voice sounds right. The second is the
// DIGEST, which is the whole basis of the byte-identity claim: it has to be
// order-sensitive and it has to notice one flipped bit, or comparing two runs
// says nothing.

import { describe, expect, it } from "vitest";

import { VOICE_SAMPLE_RATE } from "../server/wire/voice.ts";
import {
  startVoiceTap,
  stopVoiceTap,
  tapVoicePacket,
  tapVoicePcm,
  voiceTapReport,
  voiceTapRunning,
  voiceTapWav,
} from "../pwa/src/game/net/voice/tap.ts";

function packet(seat: number, bytes: number[]) {
  return {
    seat,
    codec: 1,
    last: false,
    bytes: new Uint8Array(bytes),
  };
}

/** Read a finished WAV back — the header fields, and the samples. */
async function readWav(blob: Blob) {
  const view = new DataView(await blob.arrayBuffer());
  const ascii = (at: number, length: number) =>
    String.fromCharCode(...new Uint8Array(view.buffer.slice(at, at + length)));
  const dataBytes = view.getUint32(40, true);
  const samples: number[] = [];
  for (let at = 44; at < 44 + dataBytes; at += 2) {
    samples.push(view.getInt16(at, true));
  }
  return {
    riff: ascii(0, 4),
    wave: ascii(8, 4),
    fmt: ascii(12, 4),
    format: view.getUint16(20, true),
    channels: view.getUint16(22, true),
    rate: view.getUint32(24, true),
    byteRate: view.getUint32(28, true),
    blockAlign: view.getUint16(32, true),
    bits: view.getUint16(34, true),
    data: ascii(36, 4),
    dataBytes,
    riffLength: view.getUint32(4, true),
    totalBytes: view.byteLength,
    samples,
  };
}

describe("recording what arrived", () => {
  it("records nothing until it is asked to", () => {
    stopVoiceTap();
    expect(voiceTapRunning()).toBe(false);
    tapVoicePacket(packet(1, [1, 2, 3]));
    tapVoicePcm(1, new Float32Array(960));
    expect(voiceTapReport()).toEqual([]);
  });

  it("counts packets and bytes per seat, in seat order", () => {
    startVoiceTap();
    tapVoicePacket(packet(2, new Array(60).fill(7)));
    tapVoicePacket(packet(2, new Array(64).fill(9)));
    tapVoicePacket(packet(1, new Array(58).fill(3)));
    const report = voiceTapReport();
    expect(report.map((row) => row.seat)).toEqual([1, 2]);
    expect(report[1]!.packets).toBe(2);
    expect(report[1]!.bytes).toBe(124);
    // The quickest read on whether the bitrate is what was asked for.
    expect(report[1]!.meanBytes).toBe(62);
    stopVoiceTap();
  });

  it("forgets everything when it stops", () => {
    startVoiceTap();
    tapVoicePacket(packet(1, [1]));
    stopVoiceTap();
    expect(voiceTapReport()).toEqual([]);
  });
});

describe("the digest — the basis of the byte-identity claim", () => {
  it("is the same for the same bytes in the same order", () => {
    startVoiceTap();
    tapVoicePacket(packet(1, [1, 2, 3]));
    tapVoicePacket(packet(1, [4, 5, 6]));
    const first = voiceTapReport()[0]!.digest;
    startVoiceTap();
    tapVoicePacket(packet(1, [1, 2, 3]));
    tapVoicePacket(packet(1, [4, 5, 6]));
    expect(voiceTapReport()[0]!.digest).toBe(first);
    stopVoiceTap();
  });

  it("notices ONE flipped bit", () => {
    startVoiceTap();
    tapVoicePacket(packet(1, [1, 2, 3, 4]));
    const clean = voiceTapReport()[0]!.digest;
    startVoiceTap();
    tapVoicePacket(packet(1, [1, 2, 3, 5]));
    expect(voiceTapReport()[0]!.digest).not.toBe(clean);
    stopVoiceTap();
  });

  it("notices a REORDER, which a sum would not", () => {
    // The property that makes this worth having over a byte total: a jitter
    // buffer that played two frames the wrong way round is exactly the bug the
    // digest exists to catch, and it moves no byte counts at all.
    startVoiceTap();
    tapVoicePacket(packet(1, [1, 2]));
    tapVoicePacket(packet(1, [3, 4]));
    const forward = voiceTapReport()[0]!.digest;
    startVoiceTap();
    tapVoicePacket(packet(1, [3, 4]));
    tapVoicePacket(packet(1, [1, 2]));
    const reversed = voiceTapReport()[0]!.digest;
    expect(reversed).not.toBe(forward);
    stopVoiceTap();
  });
});

describe("writing the decoded audio out as a WAV", () => {
  it("answers null when nothing was heard", () => {
    startVoiceTap();
    expect(voiceTapWav(4)).toBeNull();
    stopVoiceTap();
  });

  it("writes a header whose three lengths agree", async () => {
    // THE FAILURE THIS PREVENTS: a WAV with a wrong length opens as silence, as
    // noise, or at the wrong speed — and none of that looks like a header bug
    // when you are trying to judge whether the voice path sounds right.
    startVoiceTap();
    tapVoicePcm(0, new Float32Array(480));
    tapVoicePcm(0, new Float32Array(480));
    const wav = await readWav(voiceTapWav(0)!);
    expect(wav.riff).toBe("RIFF");
    expect(wav.wave).toBe("WAVE");
    expect(wav.fmt).toBe("fmt ");
    expect(wav.data).toBe("data");
    expect(wav.format).toBe(1); // PCM
    expect(wav.channels).toBe(1); // mono, as the encoder is configured
    expect(wav.rate).toBe(VOICE_SAMPLE_RATE);
    expect(wav.bits).toBe(16);
    // The three lengths: 960 samples × 2 bytes, the RIFF chunk, and the file.
    expect(wav.dataBytes).toBe(960 * 2);
    expect(wav.riffLength).toBe(36 + 960 * 2);
    expect(wav.totalBytes).toBe(44 + 960 * 2);
    // …and the derived rate fields, which a reader uses to decide the speed.
    expect(wav.byteRate).toBe(VOICE_SAMPLE_RATE * 2);
    expect(wav.blockAlign).toBe(2);
    stopVoiceTap();
  });

  it("keeps the samples, in order", async () => {
    startVoiceTap();
    tapVoicePcm(0, new Float32Array([0, 0.5, -0.5, 1, -1]));
    const wav = await readWav(voiceTapWav(0)!);
    // -16383 rather than -16384 is not a bug to fix: both halves are scaled by
    // 32767 and `Math.round` breaks its tie upward, so a negative sample can land
    // one LSB shy of its mirror. That is roughly -90 dBFS of asymmetry — far
    // below the noise floor of the lossy codec whose output these samples ARE —
    // and the alternative (scaling negatives by 32768) buys nothing audible for a
    // second branch in the hot loop.
    expect(wav.samples).toEqual([0, 16384, -16383, 32767, -32767]);
    stopVoiceTap();
  });

  it("CLAMPS a sample past full scale rather than wrapping it", async () => {
    // A decoder may hand back a shade over 1.0. Wrapping that is a loud click
    // at exactly the peak of the loudest word — which reads as a codec fault.
    startVoiceTap();
    tapVoicePcm(0, new Float32Array([1.4, -1.9]));
    const wav = await readWav(voiceTapWav(0)!);
    expect(wav.samples).toEqual([32767, -32767]);
    stopVoiceTap();
  });

  it("bounds what it holds rather than growing for ever", () => {
    // A tap left running through a long session must not be a leak. It keeps the
    // most recent audio, because what somebody is investigating is what just
    // happened.
    startVoiceTap();
    // 40 seconds of frames against a 30-second cap.
    for (let i = 0; i < 40; i++)
      tapVoicePcm(0, new Float32Array(VOICE_SAMPLE_RATE));
    const seconds = voiceTapReport()[0]!.seconds;
    expect(seconds).toBeLessThanOrEqual(30);
    expect(seconds).toBeGreaterThan(0);
    stopVoiceTap();
  });
});
