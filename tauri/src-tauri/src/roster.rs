// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE ROSTER CHECK, as a process — the effects half of
//! [`adastrail_shell::roster`], which owns every rule the mode obeys.
//!
//! It runs BEFORE Tauri's builder, for the same reason `--dedicated` does: a
//! launch that only reads the cloud and prints has no business registering a
//! scheme, opening a window or writing a window rect over the geometry the
//! player's real launches remember. It talks to Steam, though — the whole point
//! is to ask the platform cloud what it is holding — so the handshake happens
//! here exactly as it would in a launch with a window.
//!
//! Everything it prints goes to STDOUT rather than through
//! [`adastrail_shell::output`]'s quiet-by-default info channel: this mode was
//! asked for from a terminal by somebody who wants the answer, and a release
//! build that swallowed it would be a command that appears to do nothing.

use std::fs;
use std::path::Path;

use adastrail_shell::cloud_provider::{CloudProvider, CloudRead, SAVE_KEY};
use adastrail_shell::output;
use adastrail_shell::roster::{
    blob_of, compare, refuse_restore, RosterMode, RosterReport, Verdict,
};
use serde_json::Value;

/// Which build wrote a report — the field [`compare`] refuses to run without.
const SHELL: &str = "tauri";

/// Run the mode and answer the process's exit code.
///
/// **Zero means the command did what it was asked**, which for a check is "the
/// cloud was read and reported". A comparison that came out DIFFERENT is a
/// non-zero exit, because that is a finding somebody is scripting against; one
/// that came out inconclusive is non-zero too, since "the test did not run" must
/// never be read as a pass by a script that only looks at the code.
pub fn run(mode: &RosterMode) -> i32 {
    let provider = crate::cloud::cloud_provider();
    match mode {
        RosterMode::Check { out, against } => {
            check(provider.as_deref(), out.as_deref(), against.as_deref())
        }
        RosterMode::Restore { file, overwrite } => restore(provider.as_deref(), file, *overwrite),
    }
}

fn read(provider: Option<&dyn CloudProvider>) -> RosterReport {
    let available = provider.is_some_and(CloudProvider::is_available);
    RosterReport {
        shell: SHELL.to_string(),
        provider: provider.map(|provider| provider.id().to_string()),
        available,
        player: provider.and_then(CloudProvider::identify),
        // Asked for even when the provider says it is not available, because
        // "unavailable but there is a file under the key" is a real state and
        // the read is what proves it.
        read: provider.map_or(CloudRead::Failed, |provider| provider.load(SAVE_KEY)),
    }
}

fn check(provider: Option<&dyn CloudProvider>, out: Option<&Path>, against: Option<&Path>) -> i32 {
    let report = read(provider);
    println!("{}", report.describe());
    let document = report.document();

    if let Some(path) = out {
        match fs::write(path, format!("{}\n", document)) {
            // Said out loud because the file holds the player's own save, and
            // somebody who did not expect that should find out from the command
            // rather than from a directory listing.
            Ok(()) => println!(
                "\nwrote {} — it carries the roster itself, so keep it as you would a save file",
                path.display()
            ),
            Err(err) => {
                output::error(&format!("could not write {} — {err}", path.display()));
                return 1;
            }
        }
    }

    let Some(path) = against else {
        return 0;
    };
    let theirs = match fs::read_to_string(path)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
    {
        Some(theirs) => theirs,
        None => {
            output::error(&format!(
                "could not read a roster report from {}",
                path.display()
            ));
            return 1;
        }
    };
    let (verdict, lines) = compare(&document, &theirs);
    println!();
    for line in lines {
        println!("{line}");
    }
    match verdict {
        Verdict::Same => 0,
        Verdict::Different => 2,
        Verdict::Inconclusive => 3,
    }
}

fn restore(provider: Option<&dyn CloudProvider>, file: &Path, overwrite: bool) -> i32 {
    let Some(provider) = provider else {
        output::error(
            "there is no platform cloud on this launch, so there is nowhere to restore to.",
        );
        return 1;
    };
    let Some(blob) = fs::read_to_string(file)
        .ok()
        .and_then(|raw| serde_json::from_str::<Value>(&raw).ok())
        .and_then(|report| blob_of(&report))
    else {
        output::error(&format!(
            "{} is not a roster report with a roster in it — write one with \
             `--roster-check --out <file>` first.",
            file.display()
        ));
        return 1;
    };

    let existing = provider.load(SAVE_KEY);
    println!("{}", read(Some(provider)).describe());
    if let Some(refusal) = refuse_restore(&blob, &existing, overwrite) {
        output::error(&format!("\n{refusal}"));
        return 1;
    }
    if provider.save(SAVE_KEY, &blob) {
        println!("\n✓ restored {} bytes into {}", blob.len(), provider.id());
        0
    } else {
        output::error("\nthe cloud refused the write — see the launch log.");
        1
    }
}
