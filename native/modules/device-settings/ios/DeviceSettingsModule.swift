// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// THE SETTINGS-APP SWITCHES, the Apple half: the two content controls that live
// OUTSIDE the game, in iOS Settings → <app>.
//
// The transport is UserDefaults, because that is the only thing a Settings.bundle
// can write. The bundle (declared by native/plugins/with-settings-bundle.js) draws
// the rows; iOS writes the player's answer into the app's standard defaults suite
// under the keys below, and this module reads them back.
//
// THE MISSING-KEY CASE IS THE COMMON ONE, NOT AN EDGE CASE. iOS does NOT copy a
// Settings.bundle's `DefaultValue` into UserDefaults — the key simply does not
// exist until the player has visited the page and moved that switch. So a nil read
// is "the player never touched this", which must answer the shipped default (ON),
// exactly as the bundle's own DefaultValue advertises. Reading `bool(forKey:)`
// directly would answer false for a fresh install and ship every player the
// censored game, which is the whole bug this comment exists to prevent.
//
// Reads are SYNCHRONOUS on purpose: the shell bakes the answers into the script it
// injects before the WebView loads a byte of the game, so the game boots already
// knowing them and no gore or store row can flash before a policy arrives.

import ExpoModulesCore

/// The Settings.bundle preference keys. Kept in step with the `Key` entries in
/// native/plugins/with-settings-bundle.js — the bundle writes them, this reads them.
private let NSFW_KEY = "nsfw_content"
private let STORE_KEY = "coin_store"

public class DeviceSettingsModule: Module {
  private var changeObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("DeviceSettings")

    // Fired when the defaults change — i.e. the player went to iOS Settings,
    // flipped a switch and came back. The shell pushes the new flags into the
    // running page so the game answers to them without a relaunch.
    Events("onSettingsChange")

    OnCreate {
      self.changeObserver = NotificationCenter.default.addObserver(
        forName: UserDefaults.didChangeNotification,
        object: UserDefaults.standard,
        queue: .main
      ) { [weak self] _ in
        self?.sendEvent("onSettingsChange", flagsPayload())
      }
    }

    OnDestroy {
      if let observer = self.changeObserver {
        NotificationCenter.default.removeObserver(observer)
        self.changeObserver = nil
      }
    }

    /// The switches as they stand right now. Synchronous — the shell needs them
    /// before the WebView loads (see the file header).
    Function("flags") { () -> [String: Bool] in
      flagsPayload()
    }
  }
}

/// Read one switch, treating an absent key as the shipped default. See the file
/// header: absent is the norm until the player visits the settings page.
private func flag(_ key: String, default fallback: Bool) -> Bool {
  guard let value = UserDefaults.standard.object(forKey: key) as? Bool else {
    return fallback
  }
  return value
}

/// Both switches, in the shape the JS side expects. Both default ON: the game
/// ships its full presentation and its store, and a parent turns them off.
private func flagsPayload() -> [String: Bool] {
  [
    "nsfw": flag(NSFW_KEY, default: true),
    "store": flag(STORE_KEY, default: true),
  ]
}
