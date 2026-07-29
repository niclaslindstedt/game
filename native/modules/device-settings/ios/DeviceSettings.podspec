# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# The local Expo module behind the iOS SETTINGS BUNDLE (see ../index.ts).
# Autolinked from ../expo-module.config.json — there is no npm package to install.

Pod::Spec.new do |s|
  s.name           = 'DeviceSettings'
  s.version        = '1.0.0'
  s.summary        = 'Reads the app\'s iOS Settings-app switches'
  s.description    = 'Exposes the Settings.bundle toggles (NSFW content, coin store) to the game.'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  # Matches the deployment target the SDK's own modules use (expo-haptics).
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
