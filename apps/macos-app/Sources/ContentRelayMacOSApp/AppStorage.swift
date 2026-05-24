import ContentRelayMacOSCore
import Foundation

struct SavedRelayConfiguration: Codable, Equatable {
  let relayHubBaseURL: String
  let deviceId: String
  let deviceNickname: String
  let pollIntervalSeconds: Int
  let lastUsedTargetDeviceIds: [String]

  init(
    relayHubBaseURL: String,
    deviceId: String,
    deviceNickname: String = "",
    pollIntervalSeconds: Int,
    lastUsedTargetDeviceIds: [String] = []
  ) {
    self.relayHubBaseURL = relayHubBaseURL
    self.deviceId = deviceId
    self.deviceNickname = deviceNickname
    self.pollIntervalSeconds = pollIntervalSeconds
    self.lastUsedTargetDeviceIds = lastUsedTargetDeviceIds
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.relayHubBaseURL = try container.decode(String.self, forKey: .relayHubBaseURL)
    self.deviceId = try container.decode(String.self, forKey: .deviceId)
    self.deviceNickname = try container.decodeIfPresent(String.self, forKey: .deviceNickname) ?? ""
    self.pollIntervalSeconds = try container.decode(Int.self, forKey: .pollIntervalSeconds)
    self.lastUsedTargetDeviceIds = try container.decodeIfPresent([String].self, forKey: .lastUsedTargetDeviceIds) ?? []
  }
}

struct SettingsSnapshot: Equatable {
  var relayHubBaseURL: String
  var deviceId: String
  var deviceNickname: String
  var pollIntervalSeconds: String

  static let empty = SettingsSnapshot(
    relayHubBaseURL: "",
    deviceId: "",
    deviceNickname: "",
    pollIntervalSeconds: "15"
  )
}

final class RelayAppConfigurationStore {
  private let fileManager: FileManager

  init(fileManager: FileManager = .default) {
    self.fileManager = fileManager
  }

  func loadSavedConfiguration() throws -> SavedRelayConfiguration? {
    let fileURL = try configurationFileURL()
    guard fileManager.fileExists(atPath: fileURL.path) else {
      return nil
    }

    let data = try Data(contentsOf: fileURL)
    return try JSONDecoder().decode(SavedRelayConfiguration.self, from: data)
  }

  func loadCredentials() throws -> RelayDeviceCredentials? {
    guard let configuration = try loadSavedConfiguration() else {
      return nil
    }

    guard let relayHubBaseURL = URL(string: configuration.relayHubBaseURL) else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "The saved Relay Hub URL is invalid."]
      )
    }

    return RelayDeviceCredentials(
      relayHubBaseURL: relayHubBaseURL,
      deviceId: configuration.deviceId
    )
  }

  func save(snapshot: SettingsSnapshot) throws {
    let currentConfiguration = try loadSavedConfiguration()
    let pollIntervalSeconds = try parsePollIntervalSeconds(snapshot.pollIntervalSeconds)
    let normalizedServerBaseURL = try normalizeRelayHubBaseURL(snapshot.relayHubBaseURL)

    let configuration = SavedRelayConfiguration(
      relayHubBaseURL: normalizedServerBaseURL.absoluteString,
      deviceId: snapshot.deviceId.trimmingCharacters(in: .whitespacesAndNewlines),
      deviceNickname: snapshot.deviceNickname.trimmingCharacters(in: .whitespacesAndNewlines),
      pollIntervalSeconds: pollIntervalSeconds,
      lastUsedTargetDeviceIds: currentConfiguration?.lastUsedTargetDeviceIds ?? []
    )

    try writeConfiguration(configuration)
  }

  func rememberLastUsedTargetDeviceIds(_ deviceIds: [String]) throws {
    let currentConfiguration = try requireSavedConfiguration()
    let configuration = SavedRelayConfiguration(
      relayHubBaseURL: currentConfiguration.relayHubBaseURL,
      deviceId: currentConfiguration.deviceId,
      deviceNickname: currentConfiguration.deviceNickname,
      pollIntervalSeconds: currentConfiguration.pollIntervalSeconds,
      lastUsedTargetDeviceIds: Array(NSOrderedSet(array: deviceIds)) as? [String] ?? []
    )

    try writeConfiguration(configuration)
  }

  func lastUsedTargetDeviceIds() throws -> [String] {
    try loadSavedConfiguration()?.lastUsedTargetDeviceIds ?? []
  }

  func clear() throws {
    let fileURL = try configurationFileURL()
    if fileManager.fileExists(atPath: fileURL.path) {
      try fileManager.removeItem(at: fileURL)
    }
  }

  func makeSettingsSnapshot() throws -> SettingsSnapshot {
    let configuration = try loadSavedConfiguration()

    return SettingsSnapshot(
      relayHubBaseURL: configuration?.relayHubBaseURL ?? "",
      deviceId: configuration?.deviceId ?? "",
      deviceNickname: configuration?.deviceNickname ?? "",
      pollIntervalSeconds: String(configuration?.pollIntervalSeconds ?? 15)
    )
  }

  func currentPollIntervalSeconds() throws -> Int {
    try loadSavedConfiguration()?.pollIntervalSeconds ?? 15
  }

  private func requireSavedConfiguration() throws -> SavedRelayConfiguration {
    guard let configuration = try loadSavedConfiguration() else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 7,
        userInfo: [NSLocalizedDescriptionKey: "The app is not configured yet."]
      )
    }

    return configuration
  }

  private func writeConfiguration(_ configuration: SavedRelayConfiguration) throws {
    let fileURL = try configurationFileURL()
    try fileManager.createDirectory(
      at: fileURL.deletingLastPathComponent(),
      withIntermediateDirectories: true
    )
    let data = try JSONEncoder().encode(configuration)
    try data.write(to: fileURL, options: .atomic)
  }

  private func configurationFileURL() throws -> URL {
    try applicationSupportDirectoryURL().appendingPathComponent("config.json", isDirectory: false)
  }

  private func applicationSupportDirectoryURL() throws -> URL {
    let baseDirectory = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )

    return baseDirectory.appendingPathComponent("ContentRelayMacOS", isDirectory: true)
  }
}

actor PersistentHandledDeliveryStore: HandledDeliveryStore {
  private let fileURL: URL
  private var state: PersistedHandledDeliveryState

  init(fileManager: FileManager = .default) throws {
    let applicationSupportDirectory = try fileManager.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    ).appendingPathComponent("ContentRelayMacOS", isDirectory: true)

    try fileManager.createDirectory(at: applicationSupportDirectory, withIntermediateDirectories: true)

    self.fileURL = applicationSupportDirectory.appendingPathComponent("state.json", isDirectory: false)

    if fileManager.fileExists(atPath: fileURL.path) {
      let data = try Data(contentsOf: fileURL)
      self.state = try JSONDecoder().decode(PersistedHandledDeliveryState.self, from: data)
    } else {
      self.state = PersistedHandledDeliveryState(handledDeliveryIds: [])
    }
  }

  func contains(deliveryId: String) async throws -> Bool {
    state.handledDeliveryIds.contains(deliveryId)
  }

  func insert(deliveryId: String) async throws {
    state.handledDeliveryIds.removeAll { $0 == deliveryId }
    state.handledDeliveryIds.append(deliveryId)

    if state.handledDeliveryIds.count > 5_000 {
      state.handledDeliveryIds.removeFirst(state.handledDeliveryIds.count - 5_000)
    }

    try persist()
  }

  private func persist() throws {
    let data = try JSONEncoder().encode(state)
    try data.write(to: fileURL, options: .atomic)
  }
}

private struct PersistedHandledDeliveryState: Codable {
  var handledDeliveryIds: [String]
}

private func normalizeRelayHubBaseURL(_ rawValue: String) throws -> URL {
  let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let url = URL(string: trimmedValue), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
    throw NSError(
      domain: "ContentRelayMacOS",
      code: 4,
      userInfo: [NSLocalizedDescriptionKey: "Enter a valid absolute Relay Hub URL."]
    )
  }

  let normalizedURLString = trimmedValue.hasSuffix("/") ? String(trimmedValue.dropLast()) : trimmedValue
  guard let normalizedURL = URL(string: normalizedURLString) else {
    throw NSError(
      domain: "ContentRelayMacOS",
      code: 5,
      userInfo: [NSLocalizedDescriptionKey: "The Relay Hub URL could not be normalized."]
    )
  }

  return normalizedURL
}

private func parsePollIntervalSeconds(_ rawValue: String) throws -> Int {
  let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let pollIntervalSeconds = Int(trimmedValue), pollIntervalSeconds >= 5 else {
    throw NSError(
      domain: "ContentRelayMacOS",
      code: 6,
      userInfo: [NSLocalizedDescriptionKey: "Enter a poll interval of at least 5 seconds."]
    )
  }

  return pollIntervalSeconds
}
