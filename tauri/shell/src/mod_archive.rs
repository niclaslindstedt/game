// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! A MOD IN A .ZIP — the peer of `electron/src/mod-archive.ts`, rule for rule
//! and refusal for refusal.
//!
//! [`crate::workshop`] says the Workshop path deliberately has no archive
//! parser: a subscription is downloaded and unpacked by Steam, so a stranger's
//! file never meets code of ours. That still holds and this module does not
//! change it. What it answers is the OTHER way a mod arrives — somebody sends a
//! friend a zip — where the alternative is not "no parser" but "the player
//! unzips it by hand into a folder whose name they have to be told". The file
//! is opened either way; doing it here means it is opened under rules we wrote.
//!
//! So this is a deliberately SMALL reader rather than a dependency, and it
//! refuses far more than a general-purpose one would:
//!
//!   * stored and deflated entries only — no other method, no encryption, no
//!     zip64 (a mod is YAML and a thumbnail; anything needing zip64 is not one)
//!   * no entry may escape the destination: absolute paths, drive letters,
//!     backslashes, `..` segments and control characters are all refused by
//!     NAME, before anything is written
//!   * hard caps on entry count, per-entry size and total size, so a bomb is a
//!     refusal rather than a full disk
//!   * sizes come from the CENTRAL DIRECTORY, never from the local header,
//!     which may legally be zeroed when a data descriptor follows
//!
//! Every refusal names the entry. A mod that will not extract is reported the
//! same way a mod that will not compile is: it appears in the list, with the
//! reason on its row.

use std::fmt;

use flate2::bufread::DeflateDecoder;
use std::io::Read;

/// No mod is anywhere near these. They exist so a hostile file is a refusal.
mod limits {
    /// How many files one archive may hold.
    pub const ENTRIES: usize = 4_000;
    /// How big one of them may unpack to.
    pub const ENTRY_BYTES: usize = 16 * 1024 * 1024;
    /// …and how big all of them may unpack to together.
    pub const TOTAL_BYTES: usize = 128 * 1024 * 1024;
    /// How long a path inside the archive may be.
    pub const NAME_LENGTH: usize = 255;
}

const SIG_EOCD: u32 = 0x0605_4b50;
const SIG_CENTRAL: u32 = 0x0201_4b50;
const SIG_LOCAL: u32 = 0x0403_4b50;
const METHOD_STORE: u16 = 0;
const METHOD_DEFLATE: u16 = 8;
/// A size or offset of this in a 32-bit field means "see the zip64 record".
const ZIP64_SENTINEL: u32 = 0xffff_ffff;

/// One file out of an archive.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveEntry {
    /// Its path inside the archive, forward slashes and checked.
    pub name: String,
    /// Its bytes.
    pub data: Vec<u8>,
}

/// Every refusal, so a caller can report one reason per archive.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ArchiveError(String);

impl fmt::Display for ArchiveError {
    fn fmt(&self, out: &mut fmt::Formatter<'_>) -> fmt::Result {
        out.write_str(&self.0)
    }
}

impl std::error::Error for ArchiveError {}

type Result<T> = std::result::Result<T, ArchiveError>;

fn refuse<T>(message: impl Into<String>) -> Result<T> {
    Err(ArchiveError(message.into()))
}

/// Every file in a zip, checked.
///
/// Directory entries are dropped — the paths of the files are what say which
/// directories exist, and a zip that names a directory it stores nothing in has
/// told us nothing we need.
pub fn read_zip(buffer: &[u8]) -> Result<Vec<ArchiveEntry>> {
    let eocd = find_eocd(buffer)?;
    let count = u16(buffer, eocd + 10)? as usize;
    let central = u32(buffer, eocd + 16)?;
    if central == ZIP64_SENTINEL || count == 0xffff {
        return refuse("zip64 archives are not supported");
    }
    if count > limits::ENTRIES {
        return refuse(format!("too many entries ({count})"));
    }
    let mut at = central as usize;
    if at >= buffer.len() {
        return refuse("the central directory is outside the file");
    }

    let mut entries = Vec::with_capacity(count);
    let mut total = 0usize;
    for _ in 0..count {
        if at + 46 > buffer.len() || u32(buffer, at)? != SIG_CENTRAL {
            return refuse("the central directory is malformed");
        }
        let method = u16(buffer, at + 10)?;
        let compressed = u32(buffer, at + 20)?;
        let uncompressed = u32(buffer, at + 24)?;
        let name_length = u16(buffer, at + 28)? as usize;
        let extra_length = u16(buffer, at + 30)? as usize;
        let comment_length = u16(buffer, at + 32)? as usize;
        let local_offset = u32(buffer, at + 42)?;
        let end = at + 46 + name_length;
        if end > buffer.len() {
            return refuse("the central directory is malformed");
        }
        // A name is bytes in the file and text everywhere else. Anything that
        // is not UTF-8 is refused rather than replaced: a lossy name is a name
        // that no longer matches what the manifest declares.
        let Ok(name) = std::str::from_utf8(&buffer[at + 46..end]) else {
            return refuse("an entry's name is not text");
        };
        let name = name.to_string();
        at = end + extra_length + comment_length;

        if name.ends_with('/') {
            continue; // a directory entry stores nothing
        }
        check_name(&name)?;
        if compressed == ZIP64_SENTINEL
            || uncompressed == ZIP64_SENTINEL
            || local_offset == ZIP64_SENTINEL
        {
            return refuse(format!("\"{name}\" needs zip64, which is not supported"));
        }
        let uncompressed = uncompressed as usize;
        if uncompressed > limits::ENTRY_BYTES {
            return refuse(format!("\"{name}\" is too big ({uncompressed} bytes)"));
        }
        total += uncompressed;
        if total > limits::TOTAL_BYTES {
            return refuse("the archive unpacks to more than the limit");
        }

        let data = read_entry(
            buffer,
            local_offset as usize,
            &name,
            method,
            compressed as usize,
            uncompressed,
        )?;
        entries.push(ArchiveEntry { name, data });
    }
    Ok(entries)
}

/// Where the mod actually starts inside the archive.
///
/// Zipping a mod folder the obvious way (right-click → compress) puts
/// everything under one top-level directory, so the manifest is at
/// `my-mod/mod.yaml` rather than at the root. Both shapes are what people will
/// send, so both are read: the prefix is whatever directory holds `mod.yaml`,
/// and an archive with no manifest — or with two of them at different depths —
/// is refused rather than guessed at.
pub fn mod_root(entries: &[ArchiveEntry]) -> Result<String> {
    let manifests: Vec<&str> = entries
        .iter()
        .map(|entry| entry.name.as_str())
        .filter(|name| *name == "mod.yaml" || name.ends_with("/mod.yaml"))
        .collect();
    match manifests.len() {
        0 => refuse("there is no mod.yaml in the archive"),
        1 => {
            let manifest = manifests[0];
            Ok(manifest[..manifest.len() - "mod.yaml".len()].to_string())
        }
        many => refuse(format!(
            "the archive holds {many} mods (one mod.yaml each) — zip one mod at a time"
        )),
    }
}

/// The archive's files, rooted at the mod rather than at the zip.
pub fn mod_entries(entries: Vec<ArchiveEntry>) -> Result<Vec<ArchiveEntry>> {
    let root = mod_root(&entries)?;
    if root.is_empty() {
        return Ok(entries);
    }
    Ok(entries
        .into_iter()
        .filter(|entry| entry.name.starts_with(&root))
        .map(|entry| ArchiveEntry {
            name: entry.name[root.len()..].to_string(),
            data: entry.data,
        })
        .collect())
}

/// Refuse a name that could write outside the destination, on any platform.
///
/// By NAME and before any write, because the check that runs after a path has
/// been joined is the check that has already lost — and because a name is the
/// same on every OS while a resolved path is not.
fn check_name(name: &str) -> Result<()> {
    let bad = |why: &str| refuse::<()>(format!("\"{name}\" {why}"));
    if name.is_empty() {
        return bad("has no name");
    }
    if name.len() > limits::NAME_LENGTH {
        return bad("has too long a path");
    }
    // A backslash is a legal character in a zip name and a separator on
    // Windows; the spec says forward slash, so anything else is either hostile
    // or broken.
    if name.contains('\\') {
        return bad("uses a backslash");
    }
    if name.starts_with('/') {
        return bad("is an absolute path");
    }
    let mut chars = name.chars();
    if chars
        .next()
        .is_some_and(|first| first.is_ascii_alphabetic())
        && chars.next() == Some(':')
    {
        return bad("names a drive");
    }
    if name.chars().any(|ch| ch.is_control()) {
        return bad("has a control character in its path");
    }
    if name.split('/').any(|part| part == ".." || part == ".") {
        return bad("climbs out of the archive");
    }
    Ok(())
}

fn read_entry(
    buffer: &[u8],
    local_offset: usize,
    name: &str,
    method: u16,
    compressed: usize,
    uncompressed: usize,
) -> Result<Vec<u8>> {
    if method != METHOD_STORE && method != METHOD_DEFLATE {
        return refuse(format!("\"{name}\" uses an unsupported compression method"));
    }
    if local_offset + 30 > buffer.len() {
        return refuse(format!("\"{name}\" points outside the file"));
    }
    if u32(buffer, local_offset)? != SIG_LOCAL {
        return refuse(format!("\"{name}\" has no local header"));
    }
    // The local header's own sizes are NOT read: they are legally zero when the
    // entry carries a trailing data descriptor. The central directory is the
    // record that is always complete, and it is what every size here comes
    // from.
    let name_length = u16(buffer, local_offset + 26)? as usize;
    let extra_length = u16(buffer, local_offset + 28)? as usize;
    let start = local_offset + 30 + name_length + extra_length;
    let Some(end) = start.checked_add(compressed) else {
        return refuse(format!("\"{name}\" runs past the end of the file"));
    };
    if end > buffer.len() {
        return refuse(format!("\"{name}\" runs past the end of the file"));
    }

    let raw = &buffer[start..end];
    if method == METHOD_STORE {
        if raw.len() != uncompressed {
            return refuse(format!("\"{name}\" does not match its declared size"));
        }
        return Ok(raw.to_vec());
    }

    // The reader is capped at the per-entry limit PLUS one byte, so an archive
    // that declared a kilobyte and expands to a gigabyte stops at the ceiling
    // rather than at the allocation — and the extra byte is what makes an
    // over-long stream detectable instead of silently truncated.
    let mut inflated = Vec::with_capacity(uncompressed.min(limits::ENTRY_BYTES));
    let read = DeflateDecoder::new(raw)
        .take(limits::ENTRY_BYTES as u64 + 1)
        .read_to_end(&mut inflated);
    if let Err(err) = read {
        return refuse(format!("\"{name}\" could not be decompressed — {err}"));
    }
    if inflated.len() != uncompressed {
        return refuse(format!("\"{name}\" does not match its declared size"));
    }
    Ok(inflated)
}

/// The End of Central Directory record, scanned for from the back — it is the
/// only structure in a zip whose position is knowable, and a trailing comment
/// means it is not simply the last 22 bytes.
fn find_eocd(buffer: &[u8]) -> Result<usize> {
    if buffer.len() < 22 {
        return refuse("the file is not a zip");
    }
    let earliest = buffer.len().saturating_sub(22 + 0xffff);
    let mut at = buffer.len() - 22;
    loop {
        if u32(buffer, at)? == SIG_EOCD {
            return Ok(at);
        }
        if at == earliest {
            return refuse("the file is not a zip");
        }
        at -= 1;
    }
}

fn u16(buffer: &[u8], at: usize) -> Result<u16> {
    let bytes = buffer
        .get(at..at + 2)
        .ok_or_else(|| ArchiveError("the file ends mid-record".to_string()))?;
    Ok(u16::from_le_bytes([bytes[0], bytes[1]]))
}

fn u32(buffer: &[u8], at: usize) -> Result<u32> {
    let bytes = buffer
        .get(at..at + 4)
        .ok_or_else(|| ArchiveError("the file ends mid-record".to_string()))?;
    Ok(u32::from_le_bytes([bytes[0], bytes[1], bytes[2], bytes[3]]))
}
