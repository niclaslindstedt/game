// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! HOW LONG THE SHELL TOOK TO GET OUT OF THE WAY — the peer of
//! `electron/src/metrics.ts`, and the one module in this tree that exists for
//! the people measuring the shell rather than for the game.
//!
//! A desktop wrapper is judged on two numbers, and only one of them can be
//! weighed from outside. Install size a packager reads off a directory. **Cold
//! start cannot be measured from the outside at all**: a stopwatch on the
//! process gives you the moment one build's window appeared and the moment
//! another build's splash did, and the two are not the same event. So the shell
//! writes down five moments itself, in a vocabulary both desktop builds share,
//! into the same shape of file — and `scripts/shell-bench.mjs` reads them side
//! by side.
//!
//! **The marks are shell-side only, and the ceiling that puts on the number is
//! the honest part.** The last one is the webview reporting the document
//! finished loading, which is NOT the moment the player sees the title screen —
//! the game boots, hydrates its catalogs and renders after that, and no shell
//! can see any of it without the page telling it. Both shells stop at the same
//! place, so the COMPARISON is sound even though neither number is the whole
//! wait; a mark that only one shell could produce would be worse than no mark.
//!
//! One line of JSON per launch, appended to `startup.jsonl` in the app's own
//! user-data directory, newest last and the oldest dropped past
//! [`KEEP_LAUNCHES`]. A line rather than a document because the bench harness
//! launches the same build several times and takes the median: a file that
//! overwrote itself would make that five reads racing four writes.

use std::fs;
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

/// The file, in the app's user-data directory beside `launch.log`.
pub const STARTUP_FILE: &str = "startup.jsonl";

/// How many launches are kept. Twenty is more than any bench run takes and
/// small enough that the file stays a thing a human can read in a bug report.
pub const KEEP_LAUNCHES: usize = 20;

/// A moment worth stamping, and what it means.
///
/// **The list is the contract between the two shells**, which is why it is a
/// table with prose beside it rather than five string literals scattered
/// through two startup paths. `scripts/shell-parity.mjs` reads this list and
/// `electron/src/metrics.ts`'s and refuses a build where they disagree — a mark
/// only one shell records is a column the comparison silently loses.
pub const MARKS: &[(&str, &str)] = &[
    (
        "process",
        "the earliest instant the shell can stamp — always 0, and the thing \
         every other mark is measured from",
    ),
    (
        "shell-resolved",
        "capabilities parsed, the user-data directory adopted, the launch log \
         open, and the platform seams asked for (which is where a Steam \
         handshake is paid for)",
    ),
    (
        "window-created",
        "the window object exists and the webview has been pointed at the game",
    ),
    (
        "window-shown",
        "the window is on screen. Both shells hold it hidden until here so the \
         player never watches a white rectangle fill in",
    ),
    (
        "page-loaded",
        "the webview says the document finished loading. NOT the title screen — \
         see the module header for what this number does not contain",
    ),
];

/// The mark every measurement is relative to.
pub const FIRST_MARK: &str = "process";

/// The mark the headline number ends at.
pub const LAST_MARK: &str = "page-loaded";

/// Is this a mark both shells know about?
pub fn known_mark(name: &str) -> bool {
    MARKS.iter().any(|(mark, _)| *mark == name)
}

/// One launch's stamps, in the order they were taken.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct StartupMetrics {
    marks: Vec<(String, u64)>,
    /// Anything that made this launch not a fair sample — said out loud rather
    /// than left for a reader to infer from a number that looks wrong.
    notes: Vec<String>,
}

impl StartupMetrics {
    /// A fresh recorder.
    pub fn new() -> Self {
        Self::default()
    }

    /// Stamp a mark at `millis` after the process started.
    ///
    /// Two things are refused rather than recorded, because both make a
    /// comparison lie rather than merely being untidy: a name neither shell
    /// agreed to, and a mark that went BACKWARDS. The second happens for real —
    /// a coarse platform clock, or a mark taken on a thread that started before
    /// the one that stamped the previous one — and a negative interval in a
    /// median is a number nobody can see is wrong.
    pub fn mark(&mut self, name: &str, millis: u64) {
        if !known_mark(name) {
            self.notes.push(format!("unknown mark {name} was dropped"));
            return;
        }
        if self.marks.iter().any(|(mark, _)| mark == name) {
            self.notes.push(format!("mark {name} was stamped twice"));
            return;
        }
        let last = self.marks.last().map(|(_, at)| *at).unwrap_or(0);
        self.marks.push((name.to_string(), millis.max(last)));
    }

    /// Say why this launch is not a fair sample of a cold start.
    pub fn note(&mut self, note: impl Into<String>) {
        self.notes.push(note.into());
    }

    /// What was stamped, in order.
    pub fn marks(&self) -> &[(String, u64)] {
        &self.marks
    }

    /// Whatever was recorded for one mark.
    pub fn at(&self, name: &str) -> Option<u64> {
        self.marks
            .iter()
            .find(|(mark, _)| mark == name)
            .map(|(_, at)| *at)
    }

    /// The headline number: process start to the page being loaded.
    ///
    /// `None` where the last mark never landed, which is what a launch that
    /// failed on the way to a window looks like — and reporting a total for one
    /// of those would put a fast number in the table for a build that never
    /// showed the game.
    pub fn cold_start_ms(&self) -> Option<u64> {
        self.at(LAST_MARK)
    }

    /// Whether every mark landed.
    pub fn complete(&self) -> bool {
        MARKS.iter().all(|(mark, _)| self.at(mark).is_some())
    }

    /// The one line the launch log gets.
    ///
    /// Read by a human comparing two builds with two log files open, so it is
    /// the intervals rather than the absolute stamps: "what did this step
    /// cost" is the question, and subtracting five numbers by hand is how a
    /// reader gets it wrong.
    pub fn summary(&self) -> String {
        if self.marks.is_empty() {
            return "startup: nothing was stamped".to_string();
        }
        let mut previous = 0;
        let steps: Vec<String> = self
            .marks
            .iter()
            .skip(1)
            .map(|(mark, at)| {
                let step = at.saturating_sub(previous);
                previous = *at;
                format!("{mark} +{step}ms")
            })
            .collect();
        let total = self
            .cold_start_ms()
            .map(|total| format!("{total}ms"))
            .unwrap_or_else(|| "incomplete".to_string());
        format!("startup: {total} total — {}", steps.join(", "))
    }

    /// The launch's own line in `startup.jsonl`.
    ///
    /// `shell` is `"tauri"` or `"electron"`; the bench harness groups by it and
    /// the file itself is the only place a stray copy says which build wrote
    /// it.
    pub fn document(&self, shell: &str, version: &str, stamp_seconds: u64) -> Value {
        let marks: serde_json::Map<String, Value> = self
            .marks
            .iter()
            .map(|(mark, at)| (mark.clone(), json!(at)))
            .collect();
        json!({
            "shell": shell,
            "version": version,
            "os": std::env::consts::OS,
            "arch": std::env::consts::ARCH,
            "at": stamp_seconds,
            "complete": self.complete(),
            "coldStartMs": self.cold_start_ms(),
            "marks": Value::Object(marks),
            "notes": self.notes,
        })
    }
}

/// Where the file lives.
pub fn startup_path(user_data: &Path) -> PathBuf {
    user_data.join(STARTUP_FILE)
}

/// The lines a file should hold once `line` is appended — the newest last, and
/// no more than [`KEEP_LAUNCHES`] of them.
///
/// Pure so the trimming is testable without a filesystem, and separate from
/// [`append_startup`] for the reason every decision in this crate is: the rule
/// ("keep the newest N, drop anything unparseable") is the part that can be
/// wrong.
pub fn rotate(existing: &str, line: &str) -> String {
    let mut lines: Vec<&str> = existing
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        // A truncated write from a launch that was killed mid-append would
        // otherwise sit at the top of the file forever, and the harness reads
        // this with a JSON parser.
        .filter(|line| serde_json::from_str::<Value>(line).is_ok())
        .collect();
    lines.push(line);
    let keep = lines.len().saturating_sub(KEEP_LAUNCHES);
    let mut out = lines[keep..].join("\n");
    out.push('\n');
    out
}

/// Append one launch to the file. Best-effort, exactly as the launch log is: a
/// measurement that could not be written must never be the reason a game does
/// not start.
pub fn append_startup(user_data: &Path, document: &Value) {
    let path = startup_path(user_data);
    let existing = fs::read_to_string(&path).unwrap_or_default();
    let _ = fs::write(&path, rotate(&existing, &document.to_string()));
}
