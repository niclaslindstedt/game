# SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
# The local Expo module behind GAME CENTER on iOS (see ../index.ts). Autolinked
# from ../expo-module.config.json — there is no npm package to install.

Pod::Spec.new do |s|
  s.name           = 'GameCenter'
  s.version        = '1.0.0'
  s.summary        = 'Game Center sign-in, achievements, and the achievements dashboard'
  s.description    = 'Authenticates the local Game Center player, reports the game achievement progress, and presents the Game Center achievements board.'
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
