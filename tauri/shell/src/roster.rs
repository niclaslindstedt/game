// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! IS THE ROSTER IN THE CLOUD THE ONE THAT WENT IN — the peer of
//! `electron/src/roster.ts`.
//!
//! ## Why a shell mode exists for this at all
//!
//! `localStorage` belongs to the WEBVIEW, and one webview engine's store is not
//! another's. A player moving between two desktop builds cannot have their
//! heroes carried across on disk no matter what either shell does with its own
//! folders — **the platform cloud is the only bridge between them**, which
//! makes "cloud save works, both ways, with a real roster" a precondition of
//! shipping such a move rather than a nicety.
//!
//! Proving that by hand costs an evening: play on one shell, quit, launch the
//! other, and squint at a character list. Worse, it proves the wrong thing when
//! it passes for the wrong reason — a roster that "came across" because the
//! second shell simply had its own copy already looks identical to one that
//! synced.
//!
//! So both shells can read the cloud from the command line and say exactly what
//! is in it, in the same words: which provider answered, who Steam thinks the
//! player is, how many bytes are under the key, a fingerprint of them, and the
//! save envelope's own census (format, version, heroes by name, when and by
//! which device it was written). Run it on one shell, keep the report, run it on
//! the other with `--against` — and the verdict is a line rather than a
//! judgement call.
//!
//! ## What this module refuses to know
//!
//! It never merges, never migrates and never repairs. The blob is the GAME's
//! (`pwa/src/game/cloud-save.ts` owns the format and every merge rule), and a
//! shell that started having opinions about a hero would be a second
//! implementation of the thing the save format exists to keep in one place. The
//! envelope census below reads six fields off the top of the document and
//! stops; anything it cannot parse is reported as unreadable rather than
//! guessed at.
//!
//! ## The one destructive door, and why it is here
//!
//! [`RosterMode::Restore`] writes a blob back INTO the cloud, which is the only
//! way to test the WRITE half from a given shell without playing a campaign on
//! it. It refuses to run over a cloud that already holds a different roster
//! unless it is told to in as many words — a verification tool that can silently
//! flatten the thing being verified is worse than no tool.

use std::path::PathBuf;

use serde_json::{json, Value};

use crate::cloud_provider::{CloudPlayer, CloudRead};

/// What the command line asked this launch to do about the roster.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RosterMode {
    /// Read the cloud and say what is in it.
    Check {
        /// Write the report (and the blob inside it) here as well as to stdout.
        out: Option<PathBuf>,
        /// A report written by the other shell, to compare this one against.
        against: Option<PathBuf>,
    },
    /// Write a blob from a previously written report back into the cloud.
    Restore {
        /// The report file to take the blob out of.
        file: PathBuf,
        /// Given in as many words, because this replaces the player's roster.
        overwrite: bool,
    },
}

/// The flag that selects each mode, so the launcher, the docs and the refusals
/// all spell them the same way.
pub const CHECK_FLAG: &str = "--roster-check";
/// See [`CHECK_FLAG`].
pub const RESTORE_FLAG: &str = "--roster-restore";

/// Read the roster mode off a command line, or `None` for an ordinary launch.
///
/// Like [`crate::dedicated::dedicated_args`], this is checked before Tauri's
/// builder exists: a shell that only reads a cloud has no business registering
/// a scheme, opening a window or writing a window rect.
pub fn roster_mode(argv: &[String]) -> Option<RosterMode> {
    let value = |flag: &str| -> Option<String> {
        let at = argv.iter().position(|arg| arg == flag)?;
        argv.get(at + 1)
            .filter(|next| !next.starts_with("--"))
            .cloned()
    };
    if let Some(file) = value(RESTORE_FLAG) {
        return Some(RosterMode::Restore {
            file: PathBuf::from(file),
            overwrite: argv.iter().any(|arg| arg == "--overwrite"),
        });
    }
    if argv.iter().any(|arg| arg == CHECK_FLAG) {
        return Some(RosterMode::Check {
            out: value("--out").map(PathBuf::from),
            against: value("--against").map(PathBuf::from),
        });
    }
    None
}

/// The save envelope's census — six fields off the top of the document, and
/// deliberately not a seventh.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Envelope {
    /// The format id the game stamps into every payload.
    pub format: String,
    /// Its version. A newer one than this build knows is not an error here —
    /// the shell does not merge, so it only has to report the number.
    pub version: u64,
    /// The heroes, by the name the player gave them.
    pub heroes: Vec<String>,
    /// Deleted heroes still carrying a tombstone.
    pub tombstones: usize,
    /// When the payload was written, in milliseconds since the epoch.
    pub written_at: u64,
    /// Which device wrote it — the field that answers "did this actually come
    /// from the other shell, or has this one had its own copy all along".
    pub written_by: String,
}

/// Read the envelope, or `None` for anything that is not one.
///
/// Everything is read defensively and nothing is required: a payload from a
/// FUTURE format has to be reportable, since "the other shell wrote something
/// this build cannot parse" is a finding rather than a crash.
pub fn envelope(blob: &str) -> Option<Envelope> {
    let document: Value = serde_json::from_str(blob).ok()?;
    let object = document.as_object()?;
    let heroes = object
        .get("characters")
        .and_then(Value::as_array)
        .map(|characters| {
            characters
                .iter()
                .map(|character| {
                    character
                        .get("name")
                        .and_then(Value::as_str)
                        .or_else(|| character.get("id").and_then(Value::as_str))
                        .unwrap_or("(unnamed)")
                        .to_string()
                })
                .collect()
        })
        .unwrap_or_default();
    Some(Envelope {
        format: object
            .get("format")
            .and_then(Value::as_str)
            .unwrap_or("(none)")
            .to_string(),
        version: object.get("version").and_then(Value::as_u64).unwrap_or(0),
        heroes,
        tombstones: object
            .get("tombstones")
            .and_then(Value::as_object)
            .map(serde_json::Map::len)
            .unwrap_or(0),
        written_at: object.get("writtenAt").and_then(Value::as_u64).unwrap_or(0),
        written_by: object
            .get("writtenBy")
            .and_then(Value::as_str)
            .unwrap_or("(unknown)")
            .to_string(),
    })
}

/// A fingerprint of the stored bytes, for comparing one read against another.
///
/// FNV-1a over the bytes, printed with the LENGTH in front of it. It is not a
/// cryptographic digest and is not asked to be one — the question it answers is
/// "are these two reads of the same blob", where the two candidates are a
/// player's own roster and the same roster a minute later, not two documents an
/// attacker chose. Length-prefixing is what makes the cheap hash sufficient:
/// two rosters would have to collide in 64 bits AND be byte-identical in size.
///
/// Written out here rather than pulled in, because a hash crate in this crate's
/// dependency list is a build-script risk taken for eleven lines, and this crate
/// compiling on a machine with nothing installed is the property the whole
/// two-crate split exists to protect.
pub fn digest(blob: &str) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    for byte in blob.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{}-{hash:016x}", blob.len())
}

/// Everything one shell can say about the cloud in one go.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RosterReport {
    /// `"tauri"` or `"electron"`.
    pub shell: String,
    /// Which platform cloud answered, or `None` where there was none at all.
    pub provider: Option<String>,
    /// Whether it was reachable and writable.
    pub available: bool,
    /// The signed-in platform player, where the platform named one.
    pub player: Option<CloudPlayer>,
    /// What the read returned.
    pub read: CloudRead,
}

impl RosterReport {
    /// The report as a document — what `--out` writes and `--against` reads.
    ///
    /// The blob travels INSIDE it, which is what makes the same file serve
    /// [`RosterMode::Restore`]. It is the player's own save on the player's own
    /// disk, which is why it is written plainly rather than encoded: a file
    /// they cannot open is a file they cannot check.
    pub fn document(&self) -> Value {
        let mut document = json!({
            "kind": "adas-trail/roster-report",
            "shell": self.shell,
            "provider": self.provider,
            "available": self.available,
            "player": self.player.as_ref().map(|player| json!({
                "id": player.id,
                "name": player.name,
            })),
        });
        let object = document.as_object_mut().expect("built as an object");
        match &self.read {
            CloudRead::Failed => {
                object.insert("read".to_string(), json!("failed"));
            }
            CloudRead::Missing => {
                object.insert("read".to_string(), json!("missing"));
            }
            CloudRead::Blob(blob) => {
                object.insert("read".to_string(), json!("blob"));
                object.insert("bytes".to_string(), json!(blob.len()));
                object.insert("digest".to_string(), json!(digest(blob)));
                object.insert("envelope".to_string(), envelope_document(blob));
                object.insert("blob".to_string(), json!(blob));
            }
        }
        document
    }

    /// The report as a human reads it, which is the form it is used in.
    pub fn describe(&self) -> String {
        let mut lines = vec![format!("roster check — the {} shell", self.shell)];
        lines.push(match (&self.provider, self.available) {
            (None, _) => "  cloud     none on this launch (no Steam client, GIS_STEAM=off, or a \
                          build with no store behind it)"
                .to_string(),
            (Some(provider), false) => {
                format!("  cloud     {provider}, but NOT available right now")
            }
            (Some(provider), true) => format!("  cloud     {provider}"),
        });
        if let Some(player) = &self.player {
            lines.push(format!("  player    {} ({})", player.name, player.id));
        }
        match &self.read {
            // The distinction the whole seam is built around: a cloud that
            // could not be read is not an empty one, and a verification that
            // reported "no roster" for an unreachable cloud would send somebody
            // looking for a sync bug that is not there.
            CloudRead::Failed => lines.push(
                "  roster    THE READ FAILED — this is not the same as an empty cloud".to_string(),
            ),
            CloudRead::Missing => {
                lines.push("  roster    nothing stored under the save key yet".to_string());
            }
            CloudRead::Blob(blob) => {
                lines.push(format!(
                    "  roster    {} bytes · {}",
                    blob.len(),
                    digest(blob)
                ));
                match envelope(blob) {
                    Some(envelope) => {
                        lines.push(format!(
                            "  save      {} v{} · written by {}",
                            envelope.format, envelope.version, envelope.written_by
                        ));
                        lines.push(format!(
                            "  heroes    {}{}",
                            envelope.heroes.len(),
                            if envelope.heroes.is_empty() {
                                String::new()
                            } else {
                                format!(" — {}", envelope.heroes.join(", "))
                            }
                        ));
                        if envelope.tombstones > 0 {
                            lines.push(format!("  deleted   {} tombstoned", envelope.tombstones));
                        }
                    }
                    None => lines.push(
                        "  save      UNREADABLE — the bytes are there but they are not a save \
                         envelope this build understands"
                            .to_string(),
                    ),
                }
            }
        }
        lines.join("\n")
    }
}

fn envelope_document(blob: &str) -> Value {
    match envelope(blob) {
        Some(envelope) => json!({
            "format": envelope.format,
            "version": envelope.version,
            "heroes": envelope.heroes,
            "tombstones": envelope.tombstones,
            "writtenAt": envelope.written_at,
            "writtenBy": envelope.written_by,
        }),
        None => Value::Null,
    }
}

/// How a comparison came out.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Verdict {
    /// Both shells read the same bytes. This is the one that clears a
    /// handover.
    Same,
    /// Both read a roster and they are different.
    Different,
    /// One of the two had nothing to compare — an unreachable cloud, an empty
    /// one, or a file that is not a report. NOT a pass and NOT a failure: it
    /// means the test did not run.
    Inconclusive,
}

/// Compare this shell's read against a report the other shell wrote.
///
/// Returns the verdict and the lines explaining it, because the interesting
/// case is the one where they differ and "different" on its own sends the
/// reader back to two files.
pub fn compare(mine: &Value, theirs: &Value) -> (Verdict, Vec<String>) {
    let mut lines = Vec::new();
    let shell = |report: &Value| {
        report
            .get("shell")
            .and_then(Value::as_str)
            .unwrap_or("?")
            .to_string()
    };
    let (mine_name, theirs_name) = (shell(mine), shell(theirs));

    if theirs.get("kind").and_then(Value::as_str) != Some("adas-trail/roster-report") {
        lines.push("the file given to --against is not a roster report".to_string());
        return (Verdict::Inconclusive, lines);
    }
    if mine_name == theirs_name {
        // Comparing a shell against itself proves the file round-tripped and
        // nothing else. It is the most likely way to run this by mistake, since
        // both invocations look identical in a terminal's history.
        lines.push(format!(
            "both reports came from the {mine_name} shell — the point of the check is one \
             report from each"
        ));
        return (Verdict::Inconclusive, lines);
    }

    fn digest_of(report: &Value) -> Option<&str> {
        report.get("digest").and_then(Value::as_str)
    }
    match (digest_of(mine), digest_of(theirs)) {
        (Some(mine_digest), Some(theirs_digest)) if mine_digest == theirs_digest => {
            lines.push(format!(
                "the {mine_name} shell and the {theirs_name} shell read the SAME roster \
                 ({mine_digest})"
            ));
            (Verdict::Same, lines)
        }
        (Some(mine_digest), Some(theirs_digest)) => {
            lines.push(format!("{mine_name}  {mine_digest}"));
            lines.push(format!("{theirs_name}  {theirs_digest}"));
            lines.push(
                "the two shells are looking at DIFFERENT rosters. Either the write half never \
                 landed, or one of them is signed in as a different Steam account — the player \
                 line above says which."
                    .to_string(),
            );
            (Verdict::Different, lines)
        }
        _ => {
            let empty = |name: &str, report: &Value| {
                format!(
                    "{name} has no roster to compare ({})",
                    report
                        .get("read")
                        .and_then(Value::as_str)
                        .unwrap_or("no read at all")
                )
            };
            if digest_of(mine).is_none() {
                lines.push(empty(&mine_name, mine));
            }
            if digest_of(theirs).is_none() {
                lines.push(empty(&theirs_name, theirs));
            }
            (Verdict::Inconclusive, lines)
        }
    }
}

/// The blob inside a report file, for [`RosterMode::Restore`].
pub fn blob_of(report: &Value) -> Option<String> {
    report
        .get("blob")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Whether a restore may go ahead, and why not.
///
/// The rule is deliberately strict in the one direction that matters: writing
/// over a cloud that already holds a DIFFERENT roster needs `--overwrite` in as
/// many words. Writing the identical bytes back is allowed without it, because
/// that is the harmless case and refusing it would train somebody to type
/// `--overwrite` reflexively.
pub fn refuse_restore(incoming: &str, existing: &CloudRead, overwrite: bool) -> Option<String> {
    match existing {
        CloudRead::Failed => Some(
            "the cloud could not be read, so there is no telling what this would replace. \
             Fix the read first — see the report above."
                .to_string(),
        ),
        CloudRead::Missing => None,
        CloudRead::Blob(blob) if digest(blob) == digest(incoming) => None,
        CloudRead::Blob(blob) => (!overwrite).then(|| {
            let heroes = envelope(blob)
                .map(|envelope| envelope.heroes.len())
                .unwrap_or(0);
            format!(
                "the cloud already holds a DIFFERENT roster ({heroes} hero(es), {}). \
                 Pass --overwrite to replace it.",
                digest(blob)
            )
        }),
    }
}
