import ContentRelayMacOSCore
import Foundation
import Security

struct SavedRelayConfiguration: Codable, Equatable {
  let serverBaseURL: String
  let deviceId: String
  let pollIntervalSeconds: Int
  let lastUsedTargetDeviceIds: [String]

  init(
    serverBaseURL: String,
    deviceId: String,
    pollIntervalSeconds: Int,
    lastUsedTargetDeviceIds: [String] = []
  ) {
    self.serverBaseURL = serverBaseURL
    self.deviceId = deviceId
    self.pollIntervalSeconds = pollIntervalSeconds
    self.lastUsedTargetDeviceIds = lastUsedTargetDeviceIds
  }

  init(from decoder: Decoder) throws {
    let container = try decoder.container(keyedBy: CodingKeys.self)
    self.serverBaseURL = try container.decode(String.self, forKey: .serverBaseURL)
    self.deviceId = try container.decode(String.self, forKey: .deviceId)
    self.pollIntervalSeconds = try container.decode(Int.self, forKey: .pollIntervalSeconds)
    self.lastUsedTargetDeviceIds = try container.decodeIfPresent([String].self, forKey: .lastUsedTargetDeviceIds) ?? []
  }
}

struct SettingsSnapshot: Equatable {
  var serverBaseURL: String
  var deviceId: String
  var authToken: String
  var pollIntervalSeconds: String

  static let empty = SettingsSnapshot(
    serverBaseURL: "",
    deviceId: "",
    authToken: "",
    pollIntervalSeconds: "15"
  )
}

final class RelayAppConfigurationStore {
  private let fileManager: FileManager
  private let keychainStore: RelayAuthTokenKeychainStore

  init(
    fileManager: FileManager = .default,
    keychainStore: RelayAuthTokenKeychainStore = RelayAuthTokenKeychainStore()
  ) {
    self.fileManager = fileManager
    self.keychainStore = keychainStore
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

    guard let serverBaseURL = URL(string: configuration.serverBaseURL) else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "The saved server URL is invalid."]
      )
    }

    guard let authToken = try keychainStore.loadAuthToken() else {
      return nil
    }

    return RelayDeviceCredentials(
      serverBaseURL: serverBaseURL,
      deviceId: configuration.deviceId,
      authToken: authToken
    )
  }

  func save(snapshot: SettingsSnapshot) throws {
    let currentConfiguration = try loadSavedConfiguration()
    let pollIntervalSeconds = try parsePollIntervalSeconds(snapshot.pollIntervalSeconds)
    let normalizedServerBaseURL = try normalizeServerBaseURL(snapshot.serverBaseURL)

    let configuration = SavedRelayConfiguration(
      serverBaseURL: normalizedServerBaseURL.absoluteString,
      deviceId: snapshot.deviceId.trimmingCharacters(in: .whitespacesAndNewlines),
      pollIntervalSeconds: pollIntervalSeconds,
      lastUsedTargetDeviceIds: currentConfiguration?.lastUsedTargetDeviceIds ?? []
    )

    try writeConfiguration(configuration)
    try keychainStore.saveAuthToken(snapshot.authToken.trimmingCharacters(in: .whitespacesAndNewlines))
  }

  func rememberLastUsedTargetDeviceIds(_ deviceIds: [String]) throws {
    let currentConfiguration = try requireSavedConfiguration()
    let configuration = SavedRelayConfiguration(
      serverBaseURL: currentConfiguration.serverBaseURL,
      deviceId: currentConfiguration.deviceId,
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

    try keychainStore.deleteAuthToken()
  }

  func makeSettingsSnapshot() throws -> SettingsSnapshot {
    let configuration = try loadSavedConfiguration()
    let authToken = try keychainStore.loadAuthToken() ?? ""

    return SettingsSnapshot(
      serverBaseURL: configuration?.serverBaseURL ?? "",
      deviceId: configuration?.deviceId ?? "",
      authToken: authToken,
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

final class RelayAuthTokenKeychainStore {
  private static let service = "me.patricktree.ContentRelayMacOS"
  private static let account = "device-auth-token"

  func loadAuthToken() throws -> String? {
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: Self.service,
      kSecAttrAccount: Self.account,
      kSecReturnData: true,
      kSecMatchLimit: kSecMatchLimitOne,
    ]

    var result: CFTypeRef?
    let status = SecItemCopyMatching(query as CFDictionary, &result)

    switch status {
    case errSecSuccess:
      guard let data = result as? Data, let token = String(data: data, encoding: .utf8) else {
        throw NSError(
          domain: "ContentRelayMacOS",
          code: 2,
          userInfo: [NSLocalizedDescriptionKey: "The saved auth token is unreadable."]
        )
      }

      return token
    case errSecItemNotFound:
      return nil
    default:
      throw NSError(
        domain: "ContentRelayMacOS",
        code: Int(status),
        userInfo: [NSLocalizedDescriptionKey: "Failed to read the auth token from Keychain (status \(status))."]
      )
    }
  }

  func saveAuthToken(_ token: String) throws {
    guard !token.isEmpty else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "The auth token cannot be empty."]
      )
    }

    let encodedToken = Data(token.utf8)
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: Self.service,
      kSecAttrAccount: Self.account,
    ]

    let attributes: [CFString: Any] = [kSecValueData: encodedToken]
    let updateStatus = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)

    if updateStatus == errSecSuccess {
      return
    }

    if updateStatus != errSecItemNotFound {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: Int(updateStatus),
        userInfo: [NSLocalizedDescriptionKey: "Failed to update the auth token in Keychain (status \(updateStatus))."]
      )
    }

    var createQuery = query
    createQuery[kSecValueData] = encodedToken

    let createStatus = SecItemAdd(createQuery as CFDictionary, nil)
    guard createStatus == errSecSuccess else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: Int(createStatus),
        userInfo: [NSLocalizedDescriptionKey: "Failed to save the auth token in Keychain (status \(createStatus))."]
      )
    }
  }

  func deleteAuthToken() throws {
    let query: [CFString: Any] = [
      kSecClass: kSecClassGenericPassword,
      kSecAttrService: Self.service,
      kSecAttrAccount: Self.account,
    ]

    let status = SecItemDelete(query as CFDictionary)
    guard status == errSecSuccess || status == errSecItemNotFound else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: Int(status),
        userInfo: [NSLocalizedDescriptionKey: "Failed to delete the auth token from Keychain (status \(status))."]
      )
    }
  }
}

private func normalizeServerBaseURL(_ rawValue: String) throws -> URL {
  let trimmedValue = rawValue.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let url = URL(string: trimmedValue), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
    throw NSError(
      domain: "ContentRelayMacOS",
      code: 4,
      userInfo: [NSLocalizedDescriptionKey: "Enter a valid absolute server URL."]
    )
  }

  let normalizedURLString = trimmedValue.hasSuffix("/") ? String(trimmedValue.dropLast()) : trimmedValue
  guard let normalizedURL = URL(string: normalizedURLString) else {
    throw NSError(
      domain: "ContentRelayMacOS",
      code: 5,
      userInfo: [NSLocalizedDescriptionKey: "The server URL could not be normalized."]
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
