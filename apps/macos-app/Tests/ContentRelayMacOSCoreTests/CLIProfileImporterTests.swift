import ContentRelayMacOSCore
import Foundation
import Testing

@Test("CLI profile importer prefers the active macOS profile")
func importsActiveMacOSProfile() throws {
  let temporaryDirectory = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

  let profilesFileURL = temporaryDirectory.appendingPathComponent("profiles.json", isDirectory: false)
  try Data(
    """
    {
      "activeProfileId": "mac_profile",
      "profiles": [
        {
          "profileId": "cli_profile",
          "serverBaseUrl": "http://127.0.0.1:3000",
          "deviceId": "device_cli",
          "authToken": "auth_cli",
          "nickname": "CLI",
          "platform": "cli"
        },
        {
          "profileId": "mac_profile",
          "serverBaseUrl": "http://100.64.0.1:8787",
          "deviceId": "device_macos",
          "authToken": "auth_macos",
          "nickname": "My Mac",
          "platform": "macos"
        }
      ]
    }
    """.utf8
  ).write(to: profilesFileURL)

  let importedProfile = try CLIProfileImporter.importPreferredMacOSProfile(from: profilesFileURL)

  #expect(importedProfile.nickname == "My Mac")
  #expect(importedProfile.deviceId == "device_macos")
  #expect(importedProfile.authToken == "auth_macos")
  #expect(importedProfile.serverBaseURL.absoluteString == "http://100.64.0.1:8787")
}

@Test("CLI profile importer rejects missing macOS profiles")
func rejectsMissingMacOSProfiles() throws {
  let temporaryDirectory = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

  let profilesFileURL = temporaryDirectory.appendingPathComponent("profiles.json", isDirectory: false)
  try Data(
    """
    {
      "activeProfileId": "cli_profile",
      "profiles": [
        {
          "profileId": "cli_profile",
          "serverBaseUrl": "http://127.0.0.1:3000",
          "deviceId": "device_cli",
          "authToken": "auth_cli",
          "nickname": "CLI",
          "platform": "cli"
        }
      ]
    }
    """.utf8
  ).write(to: profilesFileURL)

  #expect(throws: CLIProfileImportError.missingMacOSProfile) {
    try CLIProfileImporter.importPreferredMacOSProfile(from: profilesFileURL)
  }
}
