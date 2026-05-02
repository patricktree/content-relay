import AppKit
import ContentRelayMacOSCore
import Foundation
import UserNotifications

@MainActor
final class RelayMenuBarAppController: NSObject, NSApplicationDelegate, @preconcurrency UNUserNotificationCenterDelegate {
  private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
  private let configurationStore = RelayAppConfigurationStore()
  private let handledDeliveryStore: PersistentHandledDeliveryStore
  private let textWindowController = TextDeliveryWindowController()
  private let fileWindowController = FileDeliveryWindowController()
  private let launchAtLoginController = LaunchAtLoginController()
  private lazy var deliverySink = AppDeliverySink(textWindowController: textWindowController)
  private lazy var settingsViewModel = SettingsViewModel(
    initialSnapshot: (try? configurationStore.makeSettingsSnapshot()) ?? .empty,
    saveAction: { [weak self] snapshot in
      guard let self else {
        return "The app controller is no longer available."
      }

      return await self.saveSettings(snapshot)
    },
    importAction: { [weak self] in
      guard let self else {
        return SettingsImportResult(snapshot: .empty, message: "The app controller is no longer available.")
      }

      return await self.importCLIProfile()
    },
    testAction: { [weak self] snapshot in
      guard let self else {
        return "The app controller is no longer available."
      }

      return await self.testSettings(snapshot)
    }
  )
  private lazy var settingsWindowController = SettingsWindowController(viewModel: settingsViewModel)
  private lazy var composeViewModel = ComposeViewModel(
    initialTargetDeviceIds: (try? configurationStore.lastUsedTargetDeviceIds()) ?? [],
    loadDevicesAction: { [weak self] in
      guard let self else {
        return []
      }

      return await self.loadAvailableDevices()
    },
    sendAction: { [weak self] payloadType, title, textBody, urlString, fileURLs, targetDeviceIds in
      guard let self else {
        return ComposeSendResult(
          message: "The app controller is no longer available.",
          selectedTargetDeviceIds: targetDeviceIds
        )
      }

      return await self.sendFromComposeWindow(
        payloadType: payloadType,
        title: title,
        textBody: textBody,
        urlString: urlString,
        fileURLs: fileURLs,
        targetDeviceIds: targetDeviceIds
      )
    },
    pickFilesAction: { [weak self] in
      self?.pickFilesForUpload() ?? []
    }
  )
  private lazy var composeWindowController = ComposeWindowController(viewModel: composeViewModel)

  private let statusMenu = NSMenu()
  private let statusLineMenuItem = NSMenuItem(title: "Status: Starting…", action: nil, keyEquivalent: "")
  private let lastErrorMenuItem = NSMenuItem(title: "", action: nil, keyEquivalent: "")
  private lazy var sendMenuItem = NSMenuItem(
    title: "Send…",
    action: #selector(openComposeWindow),
    keyEquivalent: "n"
  )
  private lazy var fetchNowMenuItem = NSMenuItem(
    title: "Fetch Now",
    action: #selector(fetchNowFromMenu),
    keyEquivalent: "r"
  )
  private lazy var openLatestTextMenuItem = NSMenuItem(
    title: "Open Latest Text Window",
    action: #selector(openLatestTextWindow),
    keyEquivalent: "t"
  )
  private lazy var openLatestFileMenuItem = NSMenuItem(
    title: "Open Latest File Detail",
    action: #selector(openLatestFileWindow),
    keyEquivalent: "f"
  )
  private lazy var openSettingsMenuItem = NSMenuItem(
    title: "Settings…",
    action: #selector(openSettingsWindow),
    keyEquivalent: ","
  )
  private lazy var toggleLaunchAtLoginMenuItem = NSMenuItem(
    title: "Launch at Login",
    action: #selector(toggleLaunchAtLogin),
    keyEquivalent: "l"
  )
  private lazy var quitMenuItem = NSMenuItem(
    title: "Quit",
    action: #selector(quitApplication),
    keyEquivalent: "q"
  )

  private var latestFileDeliveryId: String?
  private var recentDeliveriesById: [String: RelayDelivery] = [:]
  private var pollingTask: Task<Void, Never>?
  private var isFetching = false

  override init() {
    do {
      self.handledDeliveryStore = try PersistentHandledDeliveryStore()
    } catch {
      fatalError("Failed to initialize the handled delivery store: \(error.localizedDescription)")
    }

    super.init()
  }

  func applicationDidFinishLaunching(_ notification: Notification) {
    configureMenuBar()
    configureNotifications()

    Task { @MainActor in
      await bootstrapConfiguration()
      await startPollingIfConfigured()
    }
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter,
    didReceive response: UNNotificationResponse,
    withCompletionHandler completionHandler: @escaping () -> Void
  ) {
    let deliveryId = response.notification.request.content.userInfo["deliveryId"] as? String

    Task { @MainActor in
      defer { completionHandler() }

      guard let deliveryId else {
        return
      }

      await showFileDelivery(deliveryId: deliveryId)
    }
  }

  private func configureMenuBar() {
    statusItem.button?.title = "Relay"

    statusLineMenuItem.isEnabled = false
    lastErrorMenuItem.isEnabled = false

    sendMenuItem.target = self
    fetchNowMenuItem.target = self
    openLatestTextMenuItem.target = self
    openLatestFileMenuItem.target = self
    openSettingsMenuItem.target = self
    toggleLaunchAtLoginMenuItem.target = self
    quitMenuItem.target = self

    statusMenu.addItem(statusLineMenuItem)
    statusMenu.addItem(lastErrorMenuItem)
    statusMenu.addItem(.separator())
    statusMenu.addItem(sendMenuItem)
    statusMenu.addItem(fetchNowMenuItem)
    statusMenu.addItem(openLatestTextMenuItem)
    statusMenu.addItem(openLatestFileMenuItem)
    statusMenu.addItem(.separator())
    statusMenu.addItem(openSettingsMenuItem)
    statusMenu.addItem(toggleLaunchAtLoginMenuItem)
    statusMenu.addItem(.separator())
    statusMenu.addItem(quitMenuItem)

    statusItem.menu = statusMenu
    updateStatusLine("Needs setup")
    updateLastError(nil)
    refreshMenuState()
  }

  private func configureNotifications() {
    let notificationCenter = UNUserNotificationCenter.current()
    notificationCenter.delegate = self

    Task {
      let granted = try? await notificationCenter.requestAuthorization(options: [.alert, .sound, .badge])
      if granted == false {
        await MainActor.run {
          updateLastError("Notifications are disabled. File deliveries will not surface visibly.")
        }
      }
    }
  }

  private func bootstrapConfiguration() async {
    let credentials: RelayDeviceCredentials?

    do {
      credentials = try configurationStore.loadCredentials()
    } catch {
      updateLastError(error.localizedDescription)
      settingsWindowController.present()
      return
    }

    if credentials != nil {
      settingsViewModel.apply(snapshot: (try? configurationStore.makeSettingsSnapshot()) ?? .empty)
      return
    }

    let importResult = await importCLIProfile()
    settingsViewModel.apply(snapshot: importResult.snapshot)

    do {
      if try configurationStore.loadCredentials() != nil {
        updateStatusLine("Imported CLI macOS profile")
        return
      }
    } catch {
      updateLastError(error.localizedDescription)
    }

    settingsWindowController.present()
  }

  private func startPollingIfConfigured() async {
    pollingTask?.cancel()

    let credentials: RelayDeviceCredentials?

    do {
      credentials = try configurationStore.loadCredentials()
    } catch {
      updateLastError(error.localizedDescription)
      refreshMenuState()
      return
    }

    guard credentials != nil else {
      refreshMenuState()
      return
    }

    let pollIntervalSeconds = (try? configurationStore.currentPollIntervalSeconds()) ?? 15

    pollingTask = Task { @MainActor [weak self] in
      guard let self else {
        return
      }

      while !Task.isCancelled {
        await self.fetchPendingDeliveries(trigger: .automatic)

        do {
          try await Task.sleep(for: .seconds(pollIntervalSeconds))
        } catch {
          return
        }
      }
    }
  }

  private func makeProcessor() throws -> PendingDeliveryProcessor {
    guard let credentials = try configurationStore.loadCredentials() else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 40,
        userInfo: [NSLocalizedDescriptionKey: "The app is not configured. Open Settings to import or paste the server URL and device ID."]
      )
    }

    let apiClient = URLSessionRelayAPIClient(credentials: credentials)
    return PendingDeliveryProcessor(
      apiClient: apiClient,
      handledDeliveryStore: handledDeliveryStore,
      deliverySink: deliverySink
    )
  }

  private func makeClient(from snapshot: SettingsSnapshot? = nil) throws -> URLSessionRelayAPIClient {
    if let snapshot {
      let serverBaseURL = try normalizedURL(from: snapshot.serverBaseURL)
      let deviceId = snapshot.deviceId.trimmingCharacters(in: .whitespacesAndNewlines)

      guard !deviceId.isEmpty else {
        throw NSError(
          domain: "ContentRelayMacOS",
          code: 41,
          userInfo: [NSLocalizedDescriptionKey: "Enter a device ID."]
        )
      }

      return URLSessionRelayAPIClient(
        credentials: RelayDeviceCredentials(
          serverBaseURL: serverBaseURL,
          deviceId: deviceId
        )
      )
    }

    guard let credentials = try configurationStore.loadCredentials() else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 43,
        userInfo: [NSLocalizedDescriptionKey: "The app is not configured. Open Settings first."]
      )
    }

    return URLSessionRelayAPIClient(credentials: credentials)
  }

  private func fetchPendingDeliveries(trigger: FetchTrigger) async {
    guard !isFetching else {
      return
    }

    isFetching = true
    updateStatusLine("Fetching…")
    refreshMenuState()

    defer {
      isFetching = false
      refreshMenuState()
    }

    do {
      let processor = try makeProcessor()
      let batch = try await processor.processPendingDeliveries()

      for processedDelivery in batch.processed {
        recentDeliveriesById[processedDelivery.delivery.deliveryId] = processedDelivery.delivery

        if processedDelivery.delivery.item.type == .file {
          latestFileDeliveryId = processedDelivery.delivery.deliveryId
        }
      }

      if batch.failures.isEmpty {
        updateStatusLine(statusMessage(for: batch.processed.count, trigger: trigger))
        updateLastError(nil)
      } else {
        let firstFailure = batch.failures[0]
        updateStatusLine("Processed with errors")
        updateLastError(firstFailure.message)
      }
    } catch {
      updateStatusLine("Fetch failed")
      updateLastError(error.localizedDescription)
    }
  }

  private func saveSettings(_ snapshot: SettingsSnapshot) async -> String {
    do {
      try configurationStore.save(snapshot: snapshot)
      settingsViewModel.apply(snapshot: try configurationStore.makeSettingsSnapshot())
      updateLastError(nil)
      await startPollingIfConfigured()
      return "Saved settings. Background fetching restarted."
    } catch {
      updateLastError(error.localizedDescription)
      return error.localizedDescription
    }
  }

  private func importCLIProfile() async -> SettingsImportResult {
    do {
      let importedProfile = try CLIProfileImporter.importPreferredMacOSProfile()
      let snapshot = SettingsSnapshot(
        serverBaseURL: importedProfile.serverBaseURL.absoluteString,
        deviceId: importedProfile.deviceId,
        pollIntervalSeconds: String((try? configurationStore.currentPollIntervalSeconds()) ?? 15)
      )

      try configurationStore.save(snapshot: snapshot)
      await startPollingIfConfigured()
      updateLastError(nil)

      return SettingsImportResult(
        snapshot: snapshot,
        message: "Imported the active macOS CLI profile."
      )
    } catch {
      let fallbackSnapshot = (try? configurationStore.makeSettingsSnapshot()) ?? .empty
      updateLastError(error.localizedDescription)

      return SettingsImportResult(snapshot: fallbackSnapshot, message: error.localizedDescription)
    }
  }

  private func testSettings(_ snapshot: SettingsSnapshot) async -> String {
    do {
      _ = try parsePollInterval(snapshot.pollIntervalSeconds)
      let client = try makeClient(from: snapshot)
      let deliveries = try await client.fetchPendingDeliveries()
      updateLastError(nil)
      return "Connection succeeded. Pending deliveries: \(deliveries.count)."
    } catch {
      updateLastError(error.localizedDescription)
      return error.localizedDescription
    }
  }

  private func loadAvailableDevices() async -> [RelayDeviceSummary] {
    do {
      let client = try makeClient()
      let devices = try await client.listDevices().sorted { $0.nickname.localizedCaseInsensitiveCompare($1.nickname) == .orderedAscending }
      updateLastError(nil)
      return devices
    } catch {
      updateLastError(error.localizedDescription)
      return []
    }
  }

  private func sendFromComposeWindow(
    payloadType: ComposePayloadType,
    title: String,
    textBody: String,
    urlString: String,
    fileURLs: [URL],
    targetDeviceIds: [String]
  ) async -> ComposeSendResult {
    do {
      let client = try makeClient()
      let normalizedTargetDeviceIds = try requireTargetDeviceIds(targetDeviceIds)
      let normalizedTitle = normalizedOptionalString(title)

      switch payloadType {
      case .text:
        let normalizedTextBody = textBody.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTextBody.isEmpty else {
          throw composeError("Enter text to send.")
        }

        _ = try await client.sendText(
          RelaySendTextRequest(
            text: normalizedTextBody,
            title: normalizedTitle,
            targetDeviceIds: normalizedTargetDeviceIds
          )
        )
      case .url:
        let normalizedURLString = urlString.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: normalizedURLString), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
          throw composeError("Enter a valid absolute URL.")
        }

        _ = try await client.sendURL(
          RelaySendURLRequest(
            url: normalizedURLString,
            title: normalizedTitle,
            targetDeviceIds: normalizedTargetDeviceIds
          )
        )
      case .file:
        guard !fileURLs.isEmpty else {
          throw composeError("Choose at least one file to send.")
        }

        _ = try await client.sendFiles(
          fileURLs: fileURLs,
          title: normalizedTitle,
          targetDeviceIds: normalizedTargetDeviceIds
        )
      }

      try configurationStore.rememberLastUsedTargetDeviceIds(normalizedTargetDeviceIds)
      updateLastError(nil)
      updateStatusLine("Sent \(payloadType.title.lowercased()) item")

      return ComposeSendResult(
        message: "Sent \(payloadType.title.lowercased()) item to \(normalizedTargetDeviceIds.count) device\(normalizedTargetDeviceIds.count == 1 ? "" : "s").",
        selectedTargetDeviceIds: normalizedTargetDeviceIds
      )
    } catch {
      updateLastError(error.localizedDescription)

      return ComposeSendResult(
        message: error.localizedDescription,
        selectedTargetDeviceIds: targetDeviceIds
      )
    }
  }

  private func showFileDelivery(deliveryId: String) async {
    do {
      let client = try makeClient()
      let delivery: RelayDelivery

      if let recentDelivery = recentDeliveriesById[deliveryId] {
        delivery = recentDelivery
      } else {
        let loadedDelivery = try await client.getDelivery(deliveryId: deliveryId)
        recentDeliveriesById[deliveryId] = loadedDelivery
        delivery = loadedDelivery
      }

      let viewedDelivery: RelayDelivery
      if delivery.state == .viewed {
        viewedDelivery = delivery
      } else {
        viewedDelivery = try await client.markDeliveryViewed(deliveryId: delivery.deliveryId)
        recentDeliveriesById[deliveryId] = viewedDelivery
      }

      fileWindowController.present(delivery: viewedDelivery) { [weak self] delivery in
        guard let self else {
          return FileDownloadResult(savedPaths: [], message: "The app controller is no longer available.")
        }

        return await self.downloadFiles(for: delivery)
      }
    } catch {
      updateLastError(error.localizedDescription)
      presentErrorAlert(message: error.localizedDescription)
    }
  }

  private func downloadFiles(for delivery: RelayDelivery) async -> FileDownloadResult {
    do {
      let client = try makeClient()
      let download = try await client.downloadDelivery(deliveryId: delivery.deliveryId)
      let destinationURL = try chooseDownloadDestination(for: download)
      let savedPaths = try writeDownloadedFiles(download, to: destinationURL)
      let message = "Saved \(savedPaths.count) file\(savedPaths.count == 1 ? "" : "s") to disk."
      updateLastError(nil)
      return FileDownloadResult(savedPaths: savedPaths, message: message)
    } catch {
      updateLastError(error.localizedDescription)
      return FileDownloadResult(savedPaths: [], message: error.localizedDescription)
    }
  }

  private func updateStatusLine(_ status: String) {
    statusLineMenuItem.title = "Status: \(status)"
  }

  private func updateLastError(_ message: String?) {
    let trimmedMessage = message?.trimmingCharacters(in: .whitespacesAndNewlines)

    if let trimmedMessage, !trimmedMessage.isEmpty {
      lastErrorMenuItem.title = "Last error: \(truncatePreview(trimmedMessage, maxLength: 90))"
      lastErrorMenuItem.isHidden = false
    } else {
      lastErrorMenuItem.title = ""
      lastErrorMenuItem.isHidden = true
    }
  }

  private func refreshMenuState() {
    sendMenuItem.isEnabled = true
    fetchNowMenuItem.isEnabled = !isFetching
    openLatestTextMenuItem.isEnabled = textWindowController.latestDelivery != nil
    openLatestFileMenuItem.isEnabled = latestFileDeliveryId != nil || fileWindowController.latestDelivery != nil
    toggleLaunchAtLoginMenuItem.state = launchAtLoginController.isEnabled() ? .on : .off
    toggleLaunchAtLoginMenuItem.isEnabled = launchAtLoginController.isSupportedInCurrentProcess()
  }

  private func presentErrorAlert(message: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = "Content Relay"
    alert.informativeText = message
    alert.runModal()
  }

  private func pickFilesForUpload() -> [URL] {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = true
    panel.canChooseFiles = true
    panel.canChooseDirectories = false

    guard panel.runModal() == .OK else {
      return []
    }

    return panel.urls
  }

  private func chooseDownloadDestination(for download: RelayDownloadDeliveryResponse) throws -> URL {
    if download.files.count == 1, let file = download.files.first {
      let panel = NSSavePanel()
      panel.nameFieldStringValue = file.fileName
      panel.canCreateDirectories = true

      guard panel.runModal() == .OK, let url = panel.url else {
        throw composeError("File download was cancelled.")
      }

      return url
    }

    let panel = NSOpenPanel()
    panel.prompt = "Download"
    panel.message = "Choose a folder for the downloaded files."
    panel.canChooseFiles = false
    panel.canChooseDirectories = true
    panel.canCreateDirectories = true
    panel.allowsMultipleSelection = false

    guard panel.runModal() == .OK, let baseDirectoryURL = panel.url else {
      throw composeError("File download was cancelled.")
    }

    return baseDirectoryURL.appendingPathComponent(sanitizedDirectoryName(for: download.item), isDirectory: true)
  }

  private func writeDownloadedFiles(
    _ download: RelayDownloadDeliveryResponse,
    to destinationURL: URL
  ) throws -> [String] {
    if download.files.count == 1, let file = download.files.first {
      guard let fileData = Data(base64Encoded: file.base64Content) else {
        throw composeError("The downloaded file could not be decoded.")
      }

      try fileData.write(to: destinationURL, options: .atomic)
      return [destinationURL.path]
    }

    try FileManager.default.createDirectory(at: destinationURL, withIntermediateDirectories: true)
    var savedPaths: [String] = []

    for file in download.files {
      guard let fileData = Data(base64Encoded: file.base64Content) else {
        throw composeError("The downloaded file `\(file.fileName)` could not be decoded.")
      }

      let fileURL = destinationURL.appendingPathComponent(file.fileName, isDirectory: false)
      try fileData.write(to: fileURL, options: .atomic)
      savedPaths.append(fileURL.path)
    }

    return savedPaths
  }

  @objc
  private func openComposeWindow() {
    composeWindowController.present()
  }

  @objc
  private func fetchNowFromMenu() {
    Task { @MainActor in
      await fetchPendingDeliveries(trigger: .manual)
    }
  }

  @objc
  private func openLatestTextWindow() {
    textWindowController.presentLatestIfAvailable()
  }

  @objc
  private func openLatestFileWindow() {
    if let latestFileDeliveryId {
      Task { @MainActor in
        await showFileDelivery(deliveryId: latestFileDeliveryId)
      }

      return
    }

    fileWindowController.presentLatestIfAvailable()
  }

  @objc
  private func openSettingsWindow() {
    do {
      settingsViewModel.apply(snapshot: try configurationStore.makeSettingsSnapshot())
    } catch {
      updateLastError(error.localizedDescription)
    }

    settingsWindowController.present()
  }

  @objc
  private func toggleLaunchAtLogin() {
    do {
      let isEnabled = try launchAtLoginController.toggle()
      updateLastError(nil)
      updateStatusLine(isEnabled ? "Launch at Login enabled" : "Launch at Login disabled")
      refreshMenuState()
    } catch {
      updateLastError(error.localizedDescription)
      presentErrorAlert(message: error.localizedDescription)
    }
  }

  @objc
  private func quitApplication() {
    NSApp.terminate(nil)
  }
}

private enum FetchTrigger {
  case automatic
  case manual
}

private func statusMessage(for processedCount: Int, trigger: FetchTrigger) -> String {
  if processedCount == 0 {
    return trigger == .manual ? "No pending deliveries" : "Watching for deliveries"
  }

  if processedCount == 1 {
    return "Processed 1 delivery"
  }

  return "Processed \(processedCount) deliveries"
}

private func normalizedURL(from value: String) throws -> URL {
  let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard !trimmedValue.isEmpty else {
    throw composeError("Enter a server base URL.")
  }

  let normalizedValue = trimmedValue.hasSuffix("/") ? String(trimmedValue.dropLast()) : trimmedValue
  guard let url = URL(string: normalizedValue), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
    throw composeError("Enter a valid absolute server URL.")
  }

  return url
}

private func parsePollInterval(_ value: String) throws -> Int {
  let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard let interval = Int(trimmedValue), interval >= 5 else {
    throw composeError("Enter a poll interval of at least 5 seconds.")
  }

  return interval
}

private func requireTargetDeviceIds(_ targetDeviceIds: [String]) throws -> [String] {
  let normalizedTargetDeviceIds = Array(NSOrderedSet(array: targetDeviceIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) })) as? [String] ?? []
  let filteredTargetDeviceIds = normalizedTargetDeviceIds.filter { !$0.isEmpty }

  guard !filteredTargetDeviceIds.isEmpty else {
    throw composeError("Choose at least one target device.")
  }

  return filteredTargetDeviceIds
}

private func normalizedOptionalString(_ value: String) -> String? {
  let trimmedValue = value.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmedValue.isEmpty ? nil : trimmedValue
}

private func sanitizedDirectoryName(for item: RelayItem) -> String {
  let baseName = item.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    ? item.title!
    : item.itemId

  let invalidCharacters = CharacterSet(charactersIn: "/:\n\r\t")
  let components = baseName.components(separatedBy: invalidCharacters)
  let joined = components.joined(separator: "-")
  let trimmed = joined.trimmingCharacters(in: .whitespacesAndNewlines)
  return trimmed.isEmpty ? item.itemId : trimmed
}

private func composeError(_ message: String) -> NSError {
  NSError(
    domain: "ContentRelayMacOS",
    code: 900,
    userInfo: [NSLocalizedDescriptionKey: message]
  )
}
