// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// IS THE ROSTER IN THE CLOUD THE ONE THAT WENT IN — the peer of
// `tauri/shell/src/roster.rs`.
//
// WHY A SHELL MODE EXISTS FOR THIS AT ALL
//
// `localStorage` belongs to the WEBVIEW, and one webview engine's store is not
// another's. A player moving between two desktop builds cannot have their
// heroes carried across on disk no matter what either shell does with its own
// folders — the platform cloud is the only bridge between them, which makes
// "cloud save works, both ways, with a real roster" a precondition of shipping
// such a move rather than a nicety.
//
// Proving that by hand costs an evening: play on one build, quit, launch the
// other, and squint at a character list. Worse, it proves the wrong thing when
// it passes for the wrong reason — a roster that "came across" because the
// second build simply had its own copy already looks identical to one that
// synced.
//
// So both builds can read the cloud from the command line and say exactly what
// is in it, in the same words: which provider answered, who Steam thinks the
// player is, how many bytes are under the key, a fingerprint of them, and the
// save envelope's own census. Run it on one, keep the report, run it on the
// other with `--against` — and the verdict is a line rather than a judgement
// call.
//
// WHAT THIS MODULE REFUSES TO KNOW
//
// It never merges, never migrates and never repairs. The blob is the GAME's
// (`pwa/src/game/cloud-save.ts` owns the format and every merge rule), and a
// shell that started having opinions about a hero would be a second
// implementation of the thing the save format exists to keep in one place.
//
// THE ONE DESTRUCTIVE DOOR: `--roster-restore` writes a blob back INTO the
// cloud, which is the only way to test the WRITE half from a given build
// without playing a campaign on it. It refuses to run over a cloud that already
// holds a different roster unless told to in as many words — a verification
// tool that can silently flatten the thing being verified is worse than no
// tool.

import { readFileSync, writeFileSync } from "node:fs";

import type { CloudPlayer, CloudProvider } from "./cloud-provider";
import { SAVE_KEY } from "./cloud-save";
import { output } from "./output";

/** Which build wrote a report — the field `compare` refuses to run without. */
const SHELL = "electron";

/** The flag that selects each mode, so the launcher, the docs and the refusals
 * all spell them the same way. */
export const CHECK_FLAG = "--roster-check";
/** See CHECK_FLAG. */
export const RESTORE_FLAG = "--roster-restore";

/** What the command line asked this launch to do about the roster. */
export type RosterMode =
  | { kind: "check"; out?: string; against?: string }
  | { kind: "restore"; file: string; overwrite: boolean };

/**
 * Read the roster mode off a command line, or null for an ordinary launch.
 *
 * Like `dedicatedArgs`, this is checked before Electron is ready: a shell that
 * only reads a cloud has no business registering a scheme, opening a window or
 * writing a window rect over the geometry the player's real launches remember.
 */
export function rosterMode(argv: readonly string[]): RosterMode | null {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    if (at < 0) return undefined;
    const next = argv[at + 1];
    // `--out --against b.json` is a typo somebody makes at the end of a long
    // evening, and reading `--against` as a FILE NAME would write the report to
    // a file called `--against` and then compare against nothing.
    return next !== undefined && !next.startsWith("--") ? next : undefined;
  };
  const restore = value(RESTORE_FLAG);
  if (restore !== undefined) {
    return {
      kind: "restore",
      file: restore,
      overwrite: argv.includes("--overwrite"),
    };
  }
  if (argv.includes(CHECK_FLAG)) {
    return { kind: "check", out: value("--out"), against: value("--against") };
  }
  return null;
}

/** The save envelope's census — six fields off the top of the document, and
 * deliberately not a seventh. */
export type Envelope = {
  format: string;
  version: number;
  heroes: string[];
  tombstones: number;
  writtenAt: number;
  writtenBy: string;
};

/**
 * Read the envelope, or null for anything that is not one.
 *
 * Everything is read defensively and nothing is required: a payload from a
 * FUTURE format has to be reportable, since "the other build wrote something
 * this one cannot parse" is a finding rather than a crash.
 */
export function envelope(blob: string): Envelope | null {
  let document: unknown;
  try {
    document = JSON.parse(blob);
  } catch {
    return null;
  }
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  ) {
    return null;
  }
  const record = document as Record<string, unknown>;
  const characters = Array.isArray(record.characters) ? record.characters : [];
  const string = (value: unknown, fallback: string) =>
    typeof value === "string" ? value : fallback;
  return {
    format: string(record.format, "(none)"),
    version: typeof record.version === "number" ? record.version : 0,
    heroes: characters.map((character) => {
      const hero = (character ?? {}) as Record<string, unknown>;
      return typeof hero.name === "string"
        ? hero.name
        : string(hero.id, "(unnamed)");
    }),
    tombstones:
      typeof record.tombstones === "object" && record.tombstones !== null
        ? Object.keys(record.tombstones).length
        : 0,
    writtenAt: typeof record.writtenAt === "number" ? record.writtenAt : 0,
    writtenBy: string(record.writtenBy, "(unknown)"),
  };
}

/**
 * A fingerprint of the stored bytes, for comparing one read against another.
 *
 * FNV-1a over the bytes, printed with the LENGTH in front of it — the identical
 * function the Rust peer computes, so a report written by one build compares
 * against a report written by the other. It is not a cryptographic digest and
 * is not asked to be one: the question it answers is "are these two reads of
 * the same blob", where the two candidates are a player's own roster and the
 * same roster a minute later. Length-prefixing is what makes the cheap hash
 * sufficient — two rosters would have to collide in 64 bits AND be byte-
 * identical in size.
 */
export function digest(blob: string): string {
  const bytes = Buffer.from(blob, "utf8");
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (const byte of bytes) {
    hash = ((hash ^ BigInt(byte)) * prime) & mask;
  }
  return `${bytes.length}-${hash.toString(16).padStart(16, "0")}`;
}

/** What a read returned: the blob, `null` for an empty cloud, `undefined` for a
 * read that FAILED. Not the same answer — see ./cloud-provider.ts. */
export type CloudRead = string | null | undefined;

/** Everything one build can say about the cloud in one go. */
export type RosterReport = {
  shell: string;
  provider: string | null;
  available: boolean;
  player: CloudPlayer | null;
  read: CloudRead;
};

/**
 * The report as a document — what `--out` writes and `--against` reads.
 *
 * The blob travels INSIDE it, which is what makes the same file serve a
 * restore. It is the player's own save on the player's own disk, which is why
 * it is written plainly rather than encoded: a file they cannot open is a file
 * they cannot check.
 */
export function reportDocument(report: RosterReport): Record<string, unknown> {
  const document: Record<string, unknown> = {
    kind: "adas-trail/roster-report",
    shell: report.shell,
    provider: report.provider,
    available: report.available,
    player: report.player
      ? { id: report.player.id, name: report.player.name }
      : null,
  };
  if (report.read === undefined) {
    document.read = "failed";
  } else if (report.read === null) {
    document.read = "missing";
  } else {
    const found = envelope(report.read);
    document.read = "blob";
    document.bytes = Buffer.byteLength(report.read, "utf8");
    document.digest = digest(report.read);
    document.envelope = found
      ? {
          format: found.format,
          version: found.version,
          heroes: found.heroes,
          tombstones: found.tombstones,
          writtenAt: found.writtenAt,
          writtenBy: found.writtenBy,
        }
      : null;
    document.blob = report.read;
  }
  return document;
}

/** The report as a human reads it, which is the form it is used in. */
export function describeReport(report: RosterReport): string {
  const lines = [`roster check — the ${report.shell} shell`];
  if (report.provider === null) {
    lines.push(
      "  cloud     none on this launch (no Steam client, GIS_STEAM=off, or a " +
        "build with no store behind it)",
    );
  } else if (!report.available) {
    lines.push(`  cloud     ${report.provider}, but NOT available right now`);
  } else {
    lines.push(`  cloud     ${report.provider}`);
  }
  if (report.player) {
    lines.push(`  player    ${report.player.name} (${report.player.id})`);
  }
  if (report.read === undefined) {
    // The distinction the whole seam is built around: a cloud that could not be
    // read is not an empty one, and a verification that reported "no roster"
    // for an unreachable cloud would send somebody looking for a sync bug that
    // is not there.
    lines.push(
      "  roster    THE READ FAILED — this is not the same as an empty cloud",
    );
  } else if (report.read === null) {
    lines.push("  roster    nothing stored under the save key yet");
  } else {
    const bytes = Buffer.byteLength(report.read, "utf8");
    lines.push(`  roster    ${bytes} bytes · ${digest(report.read)}`);
    const found = envelope(report.read);
    if (found) {
      lines.push(
        `  save      ${found.format} v${found.version} · written by ${found.writtenBy}`,
      );
      lines.push(
        `  heroes    ${found.heroes.length}${
          found.heroes.length > 0 ? ` — ${found.heroes.join(", ")}` : ""
        }`,
      );
      if (found.tombstones > 0) {
        lines.push(`  deleted   ${found.tombstones} tombstoned`);
      }
    } else {
      lines.push(
        "  save      UNREADABLE — the bytes are there but they are not a save " +
          "envelope this build understands",
      );
    }
  }
  return lines.join("\n");
}

/** How a comparison came out. `inconclusive` means the test DID NOT RUN, which
 * is neither a pass nor a failure. */
export type Verdict = "same" | "different" | "inconclusive";

/**
 * Compare this build's read against a report the other one wrote.
 *
 * Returns the verdict and the lines explaining it, because the interesting case
 * is the one where they differ and "different" on its own sends the reader back
 * to two files.
 */
export function compare(
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): { verdict: Verdict; lines: string[] } {
  const lines: string[] = [];
  const name = (report: Record<string, unknown>) =>
    typeof report.shell === "string" ? report.shell : "?";
  const mineName = name(mine);
  const theirsName = name(theirs);

  if (theirs.kind !== "adas-trail/roster-report") {
    lines.push("the file given to --against is not a roster report");
    return { verdict: "inconclusive", lines };
  }
  if (mineName === theirsName) {
    // Comparing a build against itself proves the file round-tripped and
    // nothing else. It is the most likely way to run this by mistake, since
    // both invocations look identical in a terminal's history.
    lines.push(
      `both reports came from the ${mineName} shell — the point of the check ` +
        "is one report from each",
    );
    return { verdict: "inconclusive", lines };
  }

  const digestOf = (report: Record<string, unknown>) =>
    typeof report.digest === "string" ? report.digest : undefined;
  const mineDigest = digestOf(mine);
  const theirsDigest = digestOf(theirs);

  if (mineDigest !== undefined && mineDigest === theirsDigest) {
    lines.push(
      `the ${mineName} shell and the ${theirsName} shell read the SAME roster ` +
        `(${mineDigest})`,
    );
    return { verdict: "same", lines };
  }
  if (mineDigest !== undefined && theirsDigest !== undefined) {
    lines.push(`${mineName}  ${mineDigest}`);
    lines.push(`${theirsName}  ${theirsDigest}`);
    lines.push(
      "the two shells are looking at DIFFERENT rosters. Either the write half " +
        "never landed, or one of them is signed in as a different Steam " +
        "account — the player line above says which.",
    );
    return { verdict: "different", lines };
  }
  const empty = (who: string, report: Record<string, unknown>) =>
    `${who} has no roster to compare (${
      typeof report.read === "string" ? report.read : "no read at all"
    })`;
  if (mineDigest === undefined) lines.push(empty(mineName, mine));
  if (theirsDigest === undefined) lines.push(empty(theirsName, theirs));
  return { verdict: "inconclusive", lines };
}

/** The blob inside a report file, for a restore. */
export function blobOf(report: Record<string, unknown>): string | null {
  return typeof report.blob === "string" ? report.blob : null;
}

/**
 * Whether a restore may go ahead, and why not.
 *
 * The rule is deliberately strict in the one direction that matters: writing
 * over a cloud that already holds a DIFFERENT roster needs `--overwrite` in as
 * many words. Writing the identical bytes back is allowed without it, because
 * that is the harmless case and refusing it would train somebody to type
 * `--overwrite` reflexively.
 */
export function refuseRestore(
  incoming: string,
  existing: CloudRead,
  overwrite: boolean,
): string | null {
  if (existing === undefined) {
    return (
      "the cloud could not be read, so there is no telling what this would " +
      "replace. Fix the read first — see the report above."
    );
  }
  if (existing === null) return null;
  if (digest(existing) === digest(incoming)) return null;
  if (overwrite) return null;
  const heroes = envelope(existing)?.heroes.length ?? 0;
  return (
    `the cloud already holds a DIFFERENT roster (${heroes} hero(es), ` +
    `${digest(existing)}). Pass --overwrite to replace it.`
  );
}

// ---------------------------------------------------------------------------
// The mode, as a process
// ---------------------------------------------------------------------------

/** Read the cloud and describe what it holds. */
export async function readRoster(
  provider: CloudProvider | null,
): Promise<RosterReport> {
  const available = provider ? await provider.isAvailable() : false;
  return {
    shell: SHELL,
    provider: provider?.id ?? null,
    available,
    player: provider ? await provider.identify() : null,
    // Asked for even when the provider says it is not available, because
    // "unavailable but there is a file under the key" is a real state and the
    // read is what proves it.
    read: provider ? await provider.load(SAVE_KEY) : undefined,
  };
}

/**
 * Run the mode and answer the process's exit code.
 *
 * Zero means the command did what it was asked, which for a check is "the cloud
 * was read and reported". A comparison that came out DIFFERENT is a non-zero
 * exit, because that is a finding somebody is scripting against; one that came
 * out inconclusive is non-zero too, since "the test did not run" must never be
 * read as a pass by a script that only looks at the code.
 */
export async function runRosterMode(
  mode: RosterMode,
  provider: CloudProvider | null,
): Promise<number> {
  if (mode.kind === "check") {
    const report = await readRoster(provider);
    // stdout rather than the shell's quiet-by-default info channel: this mode
    // was asked for from a terminal by somebody who wants the answer, and a
    // release build that swallowed it would be a command that appears to do
    // nothing.
    console.log(describeReport(report));
    const document = reportDocument(report);
    if (mode.out) {
      try {
        writeFileSync(mode.out, `${JSON.stringify(document)}\n`, "utf8");
        console.log(
          `\nwrote ${mode.out} — it carries the roster itself, so keep it as ` +
            "you would a save file",
        );
      } catch (err) {
        output.error(`could not write ${mode.out} — ${String(err)}`);
        return 1;
      }
    }
    if (!mode.against) return 0;
    const theirs = readReport(mode.against);
    if (!theirs) {
      output.error(`could not read a roster report from ${mode.against}`);
      return 1;
    }
    const { verdict, lines } = compare(document, theirs);
    console.log();
    for (const line of lines) console.log(line);
    return verdict === "same" ? 0 : verdict === "different" ? 2 : 3;
  }

  if (!provider) {
    output.error(
      "there is no platform cloud on this launch, so there is nowhere to restore to.",
    );
    return 1;
  }
  const blob = blobOf(readReport(mode.file) ?? {});
  if (blob === null) {
    output.error(
      `${mode.file} is not a roster report with a roster in it — write one ` +
        "with `--roster-check --out <file>` first.",
    );
    return 1;
  }
  const before = await readRoster(provider);
  console.log(describeReport(before));
  const refusal = refuseRestore(blob, before.read, mode.overwrite);
  if (refusal) {
    output.error(`\n${refusal}`);
    return 1;
  }
  if (await provider.save(SAVE_KEY, blob)) {
    console.log(`\n✓ restored ${blob.length} bytes into ${provider.id}`);
    return 0;
  }
  output.error("\nthe cloud refused the write — see the launch log.");
  return 1;
}

function readReport(path: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
