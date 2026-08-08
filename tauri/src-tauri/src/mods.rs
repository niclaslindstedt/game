// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! THE MODS BRIDGE, wired up — the effects half of [`adastrail_shell::mods`],
//! and the peer of `createModsBridge` in `electron/src/mods.ts`.
//!
//! **THE COMPILER IS A CHILD PROCESS, AND THAT IS THE MIRROR IMAGE OF
//! ELECTRON'S PROBLEM.** There is ONE mod compiler — `mod/tools/build.mjs`,
//! shared verbatim with the CLI a modder runs, so that "it works in my mod" and
//! "it works in the game" mean the same thing. Electron's main process is Node
//! and simply `import()`s it; this shell is Rust and spawns it, handing a job in
//! on stdin and reading plain JSON back out.
//!
//! Two things follow, and both are improvements rather than costs:
//!
//!  * **ONE INVOCATION FOR THE WHOLE LIST.** Reading the reference catalog is
//!    the expensive part and it is done once per list rather than once per mod,
//!    which is what a per-mod spawn would have cost.
//!  * **A COMPILER THAT THROWS TAKES DOWN A CHILD.** On the Electron side a mod
//!    that makes the compiler throw is caught in the main process's own thread;
//!    here it cannot reach the shell at all, and the row still appears with its
//!    error.
//!
//! What crosses to the page is unchanged either way: compiled JSON, never a
//! mod's YAML and never a path the page is expected to read.

use std::collections::BTreeSet;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use adastrail_shell::mod_archive::{mod_entries, read_zip};
use adastrail_shell::mods::{
    self, archive_cache_dir, archive_stamp, folder_key, is_local_mod, local_mods_dir,
    portable_mods_path, safe_slug, InstalledMod, ModSource, ModsRequest, PortableEnv,
    PublishOutcome, RevealTarget, ITEM_ID_FILE,
};
use adastrail_shell::output;
use adastrail_shell::runtime::Resources;
use adastrail_shell::workshop::{compiler_failed, PublishAnswer, PublishRequest, WorkshopProvider};
use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

/// How long the whole list may take to compile.
///
/// A player may have a dozen mods on a slow disk, and the page's own timeout is
/// thirty seconds — this is under it so a wedged compiler produces a list with
/// a reason rather than a menu that never fills in.
const COMPILE_TIMEOUT_SECS: u64 = 25;

/// Everything the mods bridge needs that is not a decision.
pub struct ModsBridge {
    app: AppHandle,
    resources: Resources,
    user_data: PathBuf,
    app_id: u32,
    workshop: Option<Box<dyn WorkshopProvider>>,
}

impl ModsBridge {
    /// Build the bridge. Nothing is spawned until the page asks for a list.
    pub fn new(
        app: AppHandle,
        resources: Resources,
        user_data: PathBuf,
        app_id: u32,
        workshop: Option<Box<dyn WorkshopProvider>>,
    ) -> Self {
        Self {
            app,
            resources,
            user_data,
            app_id,
            workshop,
        }
    }

    /// Route one message from the page.
    ///
    /// `list` and `publish` are slow — a compile and an upload — so they answer
    /// from a thread rather than from Tauri's IPC one.
    pub fn handle(self: &std::sync::Arc<Self>, message: &Value) {
        let request = mods::parse(message);
        match request.action.as_str() {
            "list" | "publish" => {
                let bridge = std::sync::Arc::clone(self);
                if std::thread::Builder::new()
                    .name("mods".to_string())
                    .spawn(move || bridge.slow(&request))
                    .is_err()
                {
                    output::warn("mods: could not start a worker for this request");
                }
            }
            "reveal" => self.reveal(request.which),
            // Open the game's Workshop hub in the Steam client — where a joiner
            // refused for a missing mod goes to get it. A fixed URL built from
            // OUR OWN app id, never from anything the page sent: the one thing
            // this action must not become is an open-arbitrary-URL channel.
            "workshop" => {
                let url = mods::workshop_url(self.app_id);
                if let Err(err) = self.app.opener().open_url(url, None::<&str>) {
                    output::warn(&format!("mods: could not open the Workshop — {err}"));
                }
            }
            _ => {}
        }
    }

    fn slow(&self, request: &ModsRequest) {
        let event = if request.action == "list" {
            let mods = self.installed();
            mods::list_event(
                request.request_id,
                &mods,
                &self.local_dir(),
                self.portable_dir().as_deref(),
            )
        } else {
            mods::publish_event(request.request_id, &self.publish(request))
        };
        crate::emit_event(&self.app, "mods", &event);
    }

    // -----------------------------------------------------------------------
    // The list
    // -----------------------------------------------------------------------

    /// Every mod on this machine, compiled.
    ///
    /// Workshop items first, then the folders on disk: a mod the player put
    /// there themselves is the one they want at the bottom of the load order,
    /// winning, because it is the one they just added.
    fn installed(&self) -> Vec<InstalledMod> {
        let mut found: Vec<(String, PathBuf, ModSource, bool)> = Vec::new();

        for item in self
            .workshop
            .as_deref()
            .map(WorkshopProvider::subscribed)
            .unwrap_or_default()
        {
            found.push((
                item.item_id,
                PathBuf::from(item.folder),
                ModSource::Workshop,
                item.needs_update,
            ));
        }

        // The two folders on disk, in load order: what the player is writing,
        // then what they were sent. A portable mod wins a clash with an
        // authoring copy of itself, which is the right way round for the person
        // the feature is for.
        let mut roots: Vec<(PathBuf, ModSource)> = vec![(self.local_dir(), ModSource::Local)];
        if let Some(portable) = self.portable_dir() {
            roots.push((portable, ModSource::Portable));
        }
        // A checkout run from the repo could have one folder serving as both.
        // Reading it twice would list every mod twice.
        let mut seen = BTreeSet::new();
        let mut broken: Vec<InstalledMod> = Vec::new();

        for (dir, source) in roots {
            if !seen.insert(dir.clone()) || !dir.is_dir() {
                continue;
            }
            let Ok(entries) = fs::read_dir(&dir) else {
                continue;
            };
            for entry in entries.flatten() {
                let path = entry.path();
                let name = entry.file_name().to_string_lossy().to_string();
                if path.is_dir() {
                    // A directory with no manifest is not a half-broken mod, it
                    // is not a mod — somebody's notes, an editor's backup
                    // folder. Reporting it as broken would put permanent noise
                    // in the list.
                    if path.join("mod.yaml").is_file() {
                        found.push((folder_key(source, &name), path, source, false));
                    }
                    continue;
                }
                if !name.to_lowercase().ends_with(".zip") {
                    continue;
                }
                // An archive IS reported when it fails, unlike a nameless
                // directory: a file called `something.zip` sitting in the mods
                // folder was put there to be played, so "it is not a mod" is an
                // answer the player needs.
                //
                // Always `portable`, whichever folder it sat in — the source
                // answers "may this be published?", and a zip never can.
                let key = folder_key(source, &name);
                match self.unpack(&path) {
                    Ok(folder) => found.push((key, folder, ModSource::Portable, false)),
                    Err(reason) => broken.push(InstalledMod {
                        key,
                        folder: path.display().to_string(),
                        source: ModSource::Portable,
                        bundle: Value::Null,
                        errors: vec![reason],
                        needs_update: false,
                    }),
                }
            }
        }

        let folders: Vec<PathBuf> = found
            .iter()
            .map(|(_, folder, _, _)| folder.clone())
            .collect();
        let compiled = self.compile(&folders);
        let mut mods: Vec<InstalledMod> = found
            .into_iter()
            .enumerate()
            .map(|(at, (key, folder, source, needs_update))| {
                let (bundle, errors) = compiled
                    .get(at)
                    .cloned()
                    .unwrap_or((Value::Null, vec!["the compiler said nothing".to_string()]));
                if !errors.is_empty() {
                    output::warn(&format!(
                        "mods: {key} did not compile — {} problem(s): {}",
                        errors.len(),
                        errors[0]
                    ));
                }
                InstalledMod {
                    key,
                    folder: folder.display().to_string(),
                    source,
                    bundle,
                    errors,
                    needs_update,
                }
            })
            .collect();
        mods.append(&mut broken);
        output::info(&format!("mods: {} installed", mods.len()));
        mods
    }

    /// Compile a batch of folders in one invocation of the shared compiler.
    ///
    /// A folder the compiler could not answer for at all comes back with the
    /// failure as its error, because a mod missing from the list with no
    /// explanation is the thing this whole seam exists to avoid.
    fn compile(&self, folders: &[PathBuf]) -> Vec<(Value, Vec<String>)> {
        if folders.is_empty() {
            return Vec::new();
        }
        let blank = |reason: &str| {
            folders
                .iter()
                .map(|_| (Value::Null, vec![reason.to_string()]))
                .collect::<Vec<_>>()
        };
        if let Some(missing) = self.resources.missing_for_mods() {
            output::warn(&format!("mods: {missing}"));
            return blank(&missing);
        }
        let job = json!({
            "tools": self.resources.mod_tools("").display().to_string(),
            "catalog": self.resources.mod_catalog().display().to_string(),
            "folders": folders.iter().map(|f| f.display().to_string()).collect::<Vec<_>>(),
        });
        match run_compiler(&self.resources, &job) {
            Ok(results) => folders
                .iter()
                .enumerate()
                .map(|(at, folder)| {
                    let result = results.get(at);
                    let bundle = result
                        .and_then(|result| result.get("bundle"))
                        .cloned()
                        .unwrap_or(Value::Null);
                    let errors = result
                        .and_then(|result| result.get("errors"))
                        .and_then(Value::as_array)
                        .map(|errors| {
                            errors
                                .iter()
                                .filter_map(Value::as_str)
                                .map(str::to_string)
                                .collect::<Vec<_>>()
                        })
                        .unwrap_or_else(|| {
                            vec![compiler_failed(
                                &folder.display().to_string(),
                                "the compiler skipped it",
                            )]
                        });
                    (bundle, errors)
                })
                .collect(),
            Err(reason) => {
                output::warn(&format!("mods: the compiler could not be run — {reason}"));
                blank(&reason)
            }
        }
    }

    // -----------------------------------------------------------------------
    // Publishing
    // -----------------------------------------------------------------------

    fn publish(&self, request: &ModsRequest) -> PublishOutcome {
        let folder = PathBuf::from(request.folder.clone().unwrap_or_default());
        // The ONE path the page hands INWARD, so it is the one that gets
        // checked: publishing is an upload, and a folder outside the player's
        // own mods directory is not something the page has any business naming.
        if !is_local_mod(&folder, &self.local_dir()) || !folder.is_dir() {
            return PublishOutcome::Refused {
                reason: "not-a-mod",
                detail: None,
            };
        }
        let Some(provider) = self.workshop.as_deref() else {
            return PublishOutcome::Refused {
                reason: "no-steam",
                detail: None,
            };
        };
        // Never publish something that does not compile. The Workshop is public,
        // and the first thing a subscriber would see is a mod that cannot load.
        let compiled = self.compile(std::slice::from_ref(&folder));
        let (bundle, errors) = compiled
            .into_iter()
            .next()
            .unwrap_or((Value::Null, Vec::new()));
        if bundle.is_null() {
            return PublishOutcome::Refused {
                reason: "error",
                detail: Some(
                    errors
                        .first()
                        .cloned()
                        .unwrap_or_else(|| "it does not compile".to_string()),
                ),
            };
        }
        let text = |field: &str| {
            bundle
                .get(field)
                .and_then(Value::as_str)
                .unwrap_or_default()
                .to_string()
        };
        let preview = folder.join("preview.png");
        let answer = provider.publish(&PublishRequest {
            item_id: fs::read_to_string(folder.join(ITEM_ID_FILE))
                .ok()
                .and_then(|raw| mods::read_item_id(&raw)),
            title: text("name"),
            description: text("description"),
            change_note: request.change_note.clone(),
            folder: folder.display().to_string(),
            preview: preview.is_file().then(|| preview.display().to_string()),
            tags: vec![adastrail_shell::workshop::tag_for_kind(&text("kind")).to_string()],
        });
        match answer {
            PublishAnswer::Ok {
                item_id,
                needs_to_accept_agreement,
            } => {
                self.remember_item_id(&folder, &item_id);
                PublishOutcome::Published {
                    item_id,
                    needs_to_accept_agreement,
                }
            }
            PublishAnswer::Failed { detail } => PublishOutcome::Refused {
                reason: "error",
                detail: Some(detail),
            },
        }
    }

    /// Write the Workshop id down BESIDE the mod.
    ///
    /// Not fatal when it fails, but the next publish would create a SECOND
    /// item and split the mod's subscribers in two, so it is said out loud.
    fn remember_item_id(&self, folder: &Path, item_id: &str) {
        if let Err(err) = fs::write(folder.join(ITEM_ID_FILE), format!("{item_id}\n")) {
            output::warn(&format!(
                "mods: could not record the Workshop id in {} — {err}. \
                 Publishing again would create a second item.",
                folder.display()
            ));
        }
    }

    // -----------------------------------------------------------------------
    // The folders
    // -----------------------------------------------------------------------

    /// The folder a player drops a mod they are writing into. Created on first
    /// look so the path in the docs always exists to be opened.
    fn local_dir(&self) -> PathBuf {
        let dir = local_mods_dir(&self.user_data);
        // A read-only userData is not worth failing a launch over.
        let _ = fs::create_dir_all(&dir);
        dir
    }

    fn portable_dir(&self) -> Option<PathBuf> {
        portable_mods_path(&PortableEnv {
            packaged: self.resources.is_packaged(),
            platform: if cfg!(target_os = "macos") {
                "macos".to_string()
            } else if cfg!(windows) {
                "windows".to_string()
            } else {
                "linux".to_string()
            },
            exe_dir: std::env::current_exe()
                .ok()
                .and_then(|exe| exe.parent().map(Path::to_path_buf))
                .unwrap_or_default(),
            cwd: std::env::current_dir().unwrap_or_default(),
        })
    }

    /// Show one of the game's own folders in the desktop's file manager.
    ///
    /// Creating it first is the point: a folder the player is told about and
    /// then cannot find is worse than no row at all — and the portable one is
    /// never made at startup, because an install directory may be read-only,
    /// which is fine to READ from and worth failing quietly on here.
    fn reveal(&self, which: RevealTarget) {
        let dir = match which {
            RevealTarget::Portable => self.portable_dir(),
            RevealTarget::Local => Some(self.local_dir()),
        };
        let Some(dir) = dir else {
            return;
        };
        let _ = fs::create_dir_all(&dir);
        if let Err(err) = self
            .app
            .opener()
            .open_path(dir.display().to_string(), None::<&str>)
        {
            output::warn(&format!("mods: could not open the folder — {err}"));
        }
    }

    /// Unpack a `.zip` into the archive cache and answer the folder to compile.
    ///
    /// Re-extracted when the FILE changes rather than on every launch: the cache
    /// is keyed by the archive's size and modification time, so replacing a zip
    /// with a newer one is picked up on the next list and a launch that changed
    /// nothing pays a stat instead of an unpack.
    fn unpack(&self, zip: &Path) -> Result<PathBuf, String> {
        let meta = fs::metadata(zip).map_err(|err| err.to_string())?;
        let modified = meta
            .modified()
            .ok()
            .and_then(|at| at.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|since| since.as_millis() as u64)
            .unwrap_or_default();
        let stem = zip
            .file_stem()
            .map(|stem| stem.to_string_lossy().to_string())
            .unwrap_or_default();
        let home = archive_cache_dir(&self.user_data).join(safe_slug(&stem));
        let target = home.join(archive_stamp(meta.len(), modified));
        if target.join("mod.yaml").is_file() {
            return Ok(target);
        }

        let bytes = fs::read(zip).map_err(|err| err.to_string())?;
        let entries = mod_entries(read_zip(&bytes).map_err(|err| err.to_string())?)
            .map_err(|err| err.to_string())?;
        // Replace rather than accumulate: one extraction per archive, always
        // the current one.
        let _ = fs::remove_dir_all(&home);
        for entry in &entries {
            let file = target.join(&entry.name);
            // Belt and braces over the archive reader's own name check:
            // whatever the archive said, nothing is written outside the folder
            // this extraction owns.
            if !file.starts_with(&target) {
                let _ = fs::remove_dir_all(&home);
                return Err(format!(
                    "\"{}\" would be written outside the mod",
                    entry.name
                ));
            }
            if let Some(parent) = file.parent() {
                fs::create_dir_all(parent).map_err(|err| err.to_string())?;
            }
            fs::write(&file, &entry.data).map_err(|err| err.to_string())?;
        }
        output::info(&format!(
            "mods: unpacked {} ({} files)",
            zip.file_name().unwrap_or_default().to_string_lossy(),
            entries.len()
        ));
        Ok(target)
    }
}

/// Run the shared compiler once and read its answer.
fn run_compiler(resources: &Resources, job: &Value) -> Result<Vec<Value>, String> {
    let mut child = Command::new(resources.node())
        .arg(resources.mod_compiler())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|err| err.to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "no input channel".to_string())?
        .write_all(job.to_string().as_bytes())
        .map_err(|err| err.to_string())?;
    // Dropping stdin is what tells the compiler the job is complete; without it
    // both processes wait for the other.
    drop(child.stdin.take());

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(COMPILE_TIMEOUT_SECS);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if std::time::Instant::now() >= deadline => {
                let _ = child.kill();
                return Err("the compiler took too long".to_string());
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
            Err(err) => return Err(err.to_string()),
        }
    }
    let output = child.wait_with_output().map_err(|err| err.to_string())?;
    if !output.stderr.is_empty() {
        output::info(&format!(
            "mods: compiler said — {}",
            String::from_utf8_lossy(&output.stderr).trim()
        ));
    }
    let answer: Value = serde_json::from_slice(&output.stdout)
        .map_err(|err| format!("the compiler's answer could not be read — {err}"))?;
    answer
        .get("results")
        .and_then(Value::as_array)
        .cloned()
        .ok_or_else(|| "the compiler answered nothing".to_string())
}
