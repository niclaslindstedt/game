// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//! SCREENSHOTS' EFFECTS — writing the file, putting it on the clipboard,
//! revealing it in the file manager, and filing a copy in Steam's own library.
//! The decisions behind all of it are [`adastrail_shell::screenshots`].
//!
//! Two things live here and they are different halves of the same feature:
//!
//! | Type            | What it is                                              |
//! | --------------- | ------------------------------------------------------- |
//! | [`DesktopShots`] | the FOLDER and the SHARE — what any desktop can do      |
//! | [`SteamLibrary`] | the platform copy, which only a Steam build has         |
//!
//! The second one exists on this shell and does NOT on Electron's, and that is
//! the inversion [`adastrail_shell::screenshots_provider`] argues in full: the
//! Electron build gets its Steam copy from Valve's overlay, which this shell
//! cannot have, so here the game has to file it itself.

use std::fs;
use std::path::Path;

use adastrail_shell::output;
use adastrail_shell::screenshots::ShotSink;
use adastrail_shell::screenshots_provider::ScreenshotLibrary;
use tauri::image::Image;
use tauri::AppHandle;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::steam::steam_client;

/// The player's own pictures folder, and the two things a desktop can do with a
/// picture that a browser tab cannot.
pub struct DesktopShots {
    app: AppHandle,
}

impl DesktopShots {
    /// Build the sink for this app handle.
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl ShotSink for DesktopShots {
    fn write(&self, path: &Path, png: &[u8]) -> bool {
        // The folder is made on the first write rather than at startup: a game
        // nobody photographs should not leave a folder behind.
        if let Some(folder) = path.parent() {
            if let Err(err) = fs::create_dir_all(folder) {
                output::warn(&format!(
                    "screenshots: could not make {} — {err}",
                    folder.display()
                ));
                return false;
            }
        }
        match fs::write(path, png) {
            Ok(()) => true,
            Err(err) => {
                // A full disk, a read-only pictures folder, a player who has
                // moved their home directory. All somebody's ordinary Tuesday,
                // and the game's own roll already holds the picture.
                output::warn(&format!(
                    "screenshots: could not write {} — {err}",
                    path.display()
                ));
                false
            }
        }
    }

    fn share(&self, path: &Path, png: &[u8]) -> bool {
        // The clipboard FIRST, because it is the half that actually sends the
        // picture somewhere; the file manager is the half that shows the player
        // where their copy lives. Each is reported on its own, so a desktop with
        // no clipboard image support still reveals the file.
        let copied = match Image::from_bytes(png) {
            Ok(image) => match self.app.clipboard().write_image(&image) {
                Ok(()) => true,
                Err(err) => {
                    output::warn(&format!(
                        "screenshots: clipboard refused the picture — {err}"
                    ));
                    false
                }
            },
            Err(err) => {
                output::warn(&format!(
                    "screenshots: could not decode the picture — {err}"
                ));
                false
            }
        };
        let revealed = match self.app.opener().reveal_item_in_dir(path) {
            Ok(()) => true,
            Err(err) => {
                output::warn(&format!("screenshots: could not reveal the file — {err}"));
                false
            }
        };
        copied || revealed
    }
}

/// Steam's own screenshot library — where a Steam player expects to find a
/// picture they took.
pub struct SteamLibrary;

impl ScreenshotLibrary for SteamLibrary {
    fn id(&self) -> &'static str {
        "steam"
    }

    fn add(&self, path: &Path, width: u32, height: u32) -> bool {
        let Some(client) = steam_client() else {
            return false;
        };
        // No thumbnail: Steam builds its own when one is not supplied, and a
        // thumbnail this shell generated would need an image resizer for no
        // gain. The dimensions are read off the PNG's own header by the decision
        // layer, which is why nothing here decodes anything.
        match client.screenshots().add_screenshot_to_library(
            path,
            None,
            width as i32,
            height as i32,
        ) {
            Ok(_) => true,
            Err(err) => {
                // Never fatal: the player already has their copy on disk, and a
                // Steam that refuses one is a Steam that is shutting down or an
                // app whose cloud quota is full.
                output::warn(&format!(
                    "screenshots: Steam would not take {} — {err:?}",
                    path.display()
                ));
                false
            }
        }
    }
}

/// The platform library for this shell, or `None` where there is none.
pub fn screenshot_library() -> Option<Box<dyn ScreenshotLibrary>> {
    steam_client().map(|_| Box::new(SteamLibrary) as Box<dyn ScreenshotLibrary>)
}
