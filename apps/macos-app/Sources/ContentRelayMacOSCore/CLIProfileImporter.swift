import Foundation

public enum CLIProfileImportError: LocalizedError, Equatable {
  case missingProfilesFile(URL)
  case missingMacOSProfile
  case invalidProfilesFile(String)

  public var errorDescription: String? {
    switch self {
    case let .missingProfilesFile(url):
      return "No CLI profiles file exists at \(url.path)."
    case .missingMacOSProfile:
      return "No macOS CLI profile could be imported. Activate a `macos` profile in the relay CLI first."
    case let .invalidProfilesFile(message):
      return message
    }
  }
}

public enum CLIProfileImporter {
  public static func importPreferredMacOSProfile(
    from profilesFileURL: URL = defaultProfilesFileURL()
  ) throws -> ImportedCLIProfile {
    guard FileManager.default.fileExists(atPath: profilesFileURL.path) else {
      throw CLIProfileImportError.missingProfilesFile(profilesFileURL)
    }

    let data = try Data(contentsOf: profilesFileURL)
    let decoded: PersistedProfilesFile

    do {
      decoded = try JSONDecoder().decode(PersistedProfilesFile.self, from: data)
    } catch {
      throw CLIProfileImportError.invalidProfilesFile(
        "The CLI profiles file could not be decoded: \(error.localizedDescription)"
      )
    }

    let activeProfile = decoded.profiles.first { $0.profileId == decoded.activeProfileId }
    if let activeProfile, activeProfile.platform == "macos" {
      return try activeProfile.toImportedProfile()
    }

    let macOSProfiles = decoded.profiles.filter { $0.platform == "macos" }
    if macOSProfiles.count == 1, let profile = macOSProfiles.first {
      return try profile.toImportedProfile()
    }

    throw CLIProfileImportError.missingMacOSProfile
  }

  public static func defaultProfilesFileURL() -> URL {
    FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(".content-relay", isDirectory: true)
      .appendingPathComponent("profiles.json", isDirectory: false)
  }
}

private struct PersistedProfilesFile: Decodable {
  let activeProfileId: String?
  let profiles: [PersistedCLIProfile]
}

private struct PersistedCLIProfile: Decodable {
  let profileId: String
  let relayHubBaseUrl: String
  let deviceId: String
  let nickname: String
  let platform: String

  func toImportedProfile() throws -> ImportedCLIProfile {
    guard let relayHubBaseURL = URL(string: relayHubBaseUrl) else {
      throw CLIProfileImportError.invalidProfilesFile(
        "The imported CLI profile has an invalid Relay Hub URL: \(relayHubBaseUrl)"
      )
    }

    return ImportedCLIProfile(
      nickname: nickname,
      relayHubBaseURL: relayHubBaseURL,
      deviceId: deviceId
    )
  }
}
