import AppKit
import ContentRelayMacOSCore
import Foundation
import SwiftUI
import UniformTypeIdentifiers

struct SettingsImportResult {
  let snapshot: SettingsSnapshot
  let message: String
}

struct FileDownloadResult {
  let savedPaths: [String]
  let message: String
}

struct ComposeSendResult {
  let message: String
  let selectedTargetDeviceIds: [String]
}

enum ComposePayloadType: String, CaseIterable, Identifiable {
  case text
  case url
  case file

  var id: String {
    rawValue
  }

  var title: String {
    switch self {
    case .text:
      "Text"
    case .url:
      "URL"
    case .file:
      "Files"
    }
  }
}

@MainActor
final class SettingsViewModel: ObservableObject {
  @Published var relayHubBaseURL: String
  @Published var deviceId: String
  @Published var deviceNickname: String
  @Published var pollIntervalSeconds: String
  @Published var statusMessage: String = ""
  @Published var isBusy = false

  private let saveAction: @MainActor (SettingsSnapshot) async -> String
  private let importAction: @MainActor () async -> SettingsImportResult
  private let testAction: @MainActor (SettingsSnapshot) async -> String

  init(
    initialSnapshot: SettingsSnapshot,
    saveAction: @escaping @MainActor (SettingsSnapshot) async -> String,
    importAction: @escaping @MainActor () async -> SettingsImportResult,
    testAction: @escaping @MainActor (SettingsSnapshot) async -> String
  ) {
    self.relayHubBaseURL = initialSnapshot.relayHubBaseURL
    self.deviceId = initialSnapshot.deviceId
    self.deviceNickname = initialSnapshot.deviceNickname
    self.pollIntervalSeconds = initialSnapshot.pollIntervalSeconds
    self.saveAction = saveAction
    self.importAction = importAction
    self.testAction = testAction
  }

  func apply(snapshot: SettingsSnapshot) {
    relayHubBaseURL = snapshot.relayHubBaseURL
    deviceId = snapshot.deviceId
    deviceNickname = snapshot.deviceNickname
    pollIntervalSeconds = snapshot.pollIntervalSeconds
  }

  func importFromCLI() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }

      let result = await importAction()
      apply(snapshot: result.snapshot)
      statusMessage = result.message
    }
  }

  func testConnection() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }
      statusMessage = await testAction(currentSnapshot)
    }
  }

  func save() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }
      statusMessage = await saveAction(currentSnapshot)
    }
  }

  var currentSnapshot: SettingsSnapshot {
    SettingsSnapshot(
      relayHubBaseURL: relayHubBaseURL,
      deviceId: deviceId,
      deviceNickname: deviceNickname,
      pollIntervalSeconds: pollIntervalSeconds
    )
  }
}

@MainActor
final class ComposeViewModel: ObservableObject {
  @Published var selectedPayloadType: ComposePayloadType = .text
  @Published var title: String = ""
  @Published var textBody: String = ""
  @Published var urlString: String = ""
  @Published var devices: [RelayDeviceSummary] = []
  @Published var selectedTargetDeviceIds: Set<String> = []
  @Published var selectedFileURLs: [URL] = []
  @Published var statusMessage: String = ""
  @Published var isBusy = false

  private let loadDevicesAction: @MainActor () async -> [RelayDeviceSummary]
  private let sendAction: @MainActor (ComposePayloadType, String, String, String, [URL], [String]) async -> ComposeSendResult
  private let pickFilesAction: @MainActor () -> [URL]
  private let initialTargetDeviceIds: [String]

  init(
    initialTargetDeviceIds: [String],
    loadDevicesAction: @escaping @MainActor () async -> [RelayDeviceSummary],
    sendAction: @escaping @MainActor (ComposePayloadType, String, String, String, [URL], [String]) async -> ComposeSendResult,
    pickFilesAction: @escaping @MainActor () -> [URL]
  ) {
    self.initialTargetDeviceIds = initialTargetDeviceIds
    self.loadDevicesAction = loadDevicesAction
    self.sendAction = sendAction
    self.pickFilesAction = pickFilesAction
  }

  func loadDevices() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }

      let loadedDevices = await loadDevicesAction()
      devices = loadedDevices

      let availableDeviceIds = Set(loadedDevices.map(\.deviceId))
      let preferredTargetDeviceIds = initialTargetDeviceIds.filter { availableDeviceIds.contains($0) }
      if !preferredTargetDeviceIds.isEmpty {
        selectedTargetDeviceIds = Set(preferredTargetDeviceIds)
      }
    }
  }

  func pickFiles() {
    let fileURLs = pickFilesAction()
    guard !fileURLs.isEmpty else {
      return
    }

    selectedFileURLs = fileURLs
    selectedPayloadType = .file
  }

  func removeSelectedFiles() {
    selectedFileURLs = []
  }

  func send() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }

      let result = await sendAction(
        selectedPayloadType,
        title,
        textBody,
        urlString,
        selectedFileURLs,
        Array(selectedTargetDeviceIds)
      )

      selectedTargetDeviceIds = Set(result.selectedTargetDeviceIds)
      statusMessage = result.message

      if result.message.lowercased().contains("sent") {
        switch selectedPayloadType {
        case .text:
          textBody = ""
        case .url:
          urlString = ""
        case .file:
          selectedFileURLs = []
        }

        title = ""
      }
    }
  }
}

@MainActor
final class FileDeliveryViewModel: ObservableObject {
  @Published private(set) var delivery: RelayDelivery
  @Published var statusMessage: String = ""
  @Published var isBusy = false

  private let downloadAction: @MainActor (RelayDelivery) async -> FileDownloadResult

  init(
    delivery: RelayDelivery,
    downloadAction: @escaping @MainActor (RelayDelivery) async -> FileDownloadResult
  ) {
    self.delivery = delivery
    self.downloadAction = downloadAction
  }

  func apply(delivery: RelayDelivery) {
    self.delivery = delivery
  }

  func downloadAll() {
    isBusy = true

    Task { @MainActor in
      defer { isBusy = false }
      let result = await downloadAction(delivery)
      statusMessage = result.message
    }
  }
}

@MainActor
final class SettingsWindowController: NSWindowController {
  init(viewModel: SettingsViewModel) {
    let view = SettingsView(viewModel: viewModel)
    let hostingController = NSHostingController(rootView: view)
    let window = NSWindow(contentViewController: hostingController)
    window.title = "Content Relay Settings"
    window.setContentSize(NSSize(width: 520, height: 420))
    window.styleMask = [.titled, .closable, .miniaturizable]
    window.center()
    super.init(window: window)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    nil
  }

  func present() {
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
}

@MainActor
final class ComposeWindowController: NSWindowController {
  private let viewModel: ComposeViewModel

  init(viewModel: ComposeViewModel) {
    self.viewModel = viewModel
    let view = ComposeView(viewModel: viewModel)
    let hostingController = NSHostingController(rootView: view)
    let window = NSWindow(contentViewController: hostingController)
    window.title = "Send with Content Relay"
    window.setContentSize(NSSize(width: 640, height: 560))
    window.styleMask = [.titled, .closable, .resizable, .miniaturizable]
    window.center()
    super.init(window: window)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    nil
  }

  func present() {
    viewModel.loadDevices()
    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
}

@MainActor
final class TextDeliveryWindowController {
  private var window: NSWindow?
  private(set) var latestDelivery: RelayDelivery?

  func present(delivery: RelayDelivery) {
    latestDelivery = delivery

    let hostingController = NSHostingController(rootView: TextDeliveryView(delivery: delivery))

    if let window {
      window.contentViewController = hostingController
      window.title = delivery.item.title ?? "Received Text"
      window.makeKeyAndOrderFront(nil)
    } else {
      let window = NSWindow(contentViewController: hostingController)
      window.title = delivery.item.title ?? "Received Text"
      window.setContentSize(NSSize(width: 560, height: 420))
      window.styleMask = [.titled, .closable, .resizable, .miniaturizable]
      window.center()
      self.window = window
      window.makeKeyAndOrderFront(nil)
    }

    NSApp.activate(ignoringOtherApps: true)
  }

  func presentLatestIfAvailable() {
    guard let latestDelivery else {
      return
    }

    present(delivery: latestDelivery)
  }
}

@MainActor
final class FileDeliveryWindowController {
  private var window: NSWindow?
  private var viewModel: FileDeliveryViewModel?
  private(set) var latestDelivery: RelayDelivery?

  func present(
    delivery: RelayDelivery,
    downloadAction: @escaping @MainActor (RelayDelivery) async -> FileDownloadResult
  ) {
    latestDelivery = delivery

    if let viewModel {
      viewModel.apply(delivery: delivery)
      let hostingController = NSHostingController(rootView: FileDeliveryView(viewModel: viewModel))
      window?.contentViewController = hostingController
      window?.title = delivery.item.title ?? "Received Files"
      window?.makeKeyAndOrderFront(nil)
    } else {
      let viewModel = FileDeliveryViewModel(delivery: delivery, downloadAction: downloadAction)
      self.viewModel = viewModel
      let hostingController = NSHostingController(rootView: FileDeliveryView(viewModel: viewModel))
      let window = NSWindow(contentViewController: hostingController)
      window.title = delivery.item.title ?? "Received Files"
      window.setContentSize(NSSize(width: 620, height: 460))
      window.styleMask = [.titled, .closable, .resizable, .miniaturizable]
      window.center()
      self.window = window
      window.makeKeyAndOrderFront(nil)
    }

    NSApp.activate(ignoringOtherApps: true)
  }

  func presentLatestIfAvailable() {
    guard window != nil, latestDelivery != nil else {
      return
    }

    window?.makeKeyAndOrderFront(nil)
    NSApp.activate(ignoringOtherApps: true)
  }
}

private struct SettingsView: View {
  @ObservedObject var viewModel: SettingsViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Content Relay")
        .font(.system(size: 24, weight: .semibold))

      Text("Import an active `macos` CLI profile or enter a Relay Hub URL and device nickname.")
        .font(.system(size: 14))
        .foregroundStyle(.black.opacity(0.7))
        .fixedSize(horizontal: false, vertical: true)

      Group {
        labeledField("Relay Hub base URL", text: $viewModel.relayHubBaseURL)
        labeledField("Device nickname", text: $viewModel.deviceNickname)
        labeledField("Poll interval (seconds)", text: $viewModel.pollIntervalSeconds)
      }

      HStack(spacing: 12) {
        Button("Import Active CLI macOS Profile") {
          viewModel.importFromCLI()
        }
        .buttonStyle(.bordered)
        .disabled(viewModel.isBusy)

        Button("Test Fetch") {
          viewModel.testConnection()
        }
        .buttonStyle(.bordered)
        .disabled(viewModel.isBusy)

        Button("Save & Register") {
          viewModel.save()
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(viewModel.isBusy)
      }

      Text(viewModel.statusMessage)
        .font(.system(size: 13))
        .foregroundStyle(.black.opacity(0.75))
        .frame(maxWidth: .infinity, alignment: .leading)

      Spacer(minLength: 0)
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.white)
  }

  private func labeledField(_ label: String, text: Binding<String>) -> some View {
    VStack(alignment: .leading, spacing: 6) {
      Text(label)
        .font(.system(size: 13, weight: .medium))
      TextField(label, text: text)
        .textFieldStyle(.roundedBorder)
    }
  }
}

private struct ComposeView: View {
  @ObservedObject var viewModel: ComposeViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text("Send with Content Relay")
        .font(.system(size: 24, weight: .semibold))

      Picker("Payload Type", selection: $viewModel.selectedPayloadType) {
        ForEach(ComposePayloadType.allCases) { payloadType in
          Text(payloadType.title).tag(payloadType)
        }
      }
      .pickerStyle(.segmented)

      VStack(alignment: .leading, spacing: 6) {
        Text("Optional Title")
          .font(.system(size: 13, weight: .medium))
        TextField("Optional Title", text: $viewModel.title)
          .textFieldStyle(.roundedBorder)
      }

      switch viewModel.selectedPayloadType {
      case .text:
        VStack(alignment: .leading, spacing: 6) {
          Text("Text")
            .font(.system(size: 13, weight: .medium))
          TextEditor(text: $viewModel.textBody)
            .font(.system(size: 14))
            .frame(minHeight: 150)
            .padding(8)
            .overlay(
              RoundedRectangle(cornerRadius: 8)
                .stroke(Color.black.opacity(0.2), lineWidth: 1)
            )
        }
      case .url:
        VStack(alignment: .leading, spacing: 6) {
          Text("URL")
            .font(.system(size: 13, weight: .medium))
          TextField("https://example.com", text: $viewModel.urlString)
            .textFieldStyle(.roundedBorder)
        }
      case .file:
        VStack(alignment: .leading, spacing: 12) {
          HStack(spacing: 12) {
            Button("Choose Files…") {
              viewModel.pickFiles()
            }
            .buttonStyle(.bordered)
            .disabled(viewModel.isBusy)

            if !viewModel.selectedFileURLs.isEmpty {
              Button("Clear") {
                viewModel.removeSelectedFiles()
              }
              .buttonStyle(.bordered)
            }
          }

          if viewModel.selectedFileURLs.isEmpty {
            Text("No files selected.")
              .font(.system(size: 13))
              .foregroundStyle(.black.opacity(0.6))
          } else {
            List(viewModel.selectedFileURLs, id: \.path) { fileURL in
              VStack(alignment: .leading, spacing: 4) {
                Text(fileURL.lastPathComponent)
                  .font(.system(size: 14, weight: .medium))
                Text(fileDescription(for: fileURL))
                  .font(.system(size: 12))
                  .foregroundStyle(.black.opacity(0.6))
              }
              .padding(.vertical, 4)
            }
            .frame(minHeight: 160)
            .listStyle(.plain)
          }
        }
      }

      VStack(alignment: .leading, spacing: 8) {
        Text("Targets")
          .font(.system(size: 13, weight: .medium))

        if viewModel.devices.isEmpty {
          Text("No target devices loaded yet.")
            .font(.system(size: 13))
            .foregroundStyle(.black.opacity(0.6))
        } else {
          ScrollView {
            VStack(alignment: .leading, spacing: 10) {
              ForEach(viewModel.devices) { device in
                Toggle(isOn: binding(for: device.deviceId)) {
                  HStack {
                    Text(device.nickname)
                      .font(.system(size: 14, weight: .medium))
                    Spacer(minLength: 12)
                    Text(device.platform)
                      .font(.system(size: 12))
                      .foregroundStyle(.black.opacity(0.6))
                  }
                }
                .toggleStyle(.checkbox)
              }
            }
          }
          .frame(minHeight: 120)
          .padding(12)
          .overlay(
            RoundedRectangle(cornerRadius: 8)
              .stroke(Color.black.opacity(0.2), lineWidth: 1)
          )
        }
      }

      HStack(spacing: 12) {
        Button("Refresh Devices") {
          viewModel.loadDevices()
        }
        .buttonStyle(.bordered)
        .disabled(viewModel.isBusy)

        Spacer(minLength: 0)

        Button("Send") {
          viewModel.send()
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(viewModel.isBusy)
      }

      Text(viewModel.statusMessage)
        .font(.system(size: 13))
        .foregroundStyle(.black.opacity(0.75))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.white)
  }

  private func binding(for deviceId: String) -> Binding<Bool> {
    Binding(
      get: { viewModel.selectedTargetDeviceIds.contains(deviceId) },
      set: { isSelected in
        if isSelected {
          viewModel.selectedTargetDeviceIds.insert(deviceId)
        } else {
          viewModel.selectedTargetDeviceIds.remove(deviceId)
        }
      }
    )
  }

  private func fileDescription(for fileURL: URL) -> String {
    let contentType = (try? fileURL.resourceValues(forKeys: [.contentTypeKey]).contentType)?.preferredMIMEType ?? "application/octet-stream"
    let fileSize = (try? fileURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
    return "\(contentType) · \(ByteCountFormatter.string(fromByteCount: Int64(fileSize), countStyle: .file))"
  }
}

private struct TextDeliveryView: View {
  let delivery: RelayDelivery

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(delivery.item.title ?? "Received Text")
        .font(.system(size: 24, weight: .semibold))
      Text("Delivery \(delivery.deliveryId)")
        .font(.system(size: 13))
        .foregroundStyle(.black.opacity(0.6))

      ScrollView {
        Text(delivery.item.text ?? "")
          .font(.system(size: 15))
          .frame(maxWidth: .infinity, alignment: .topLeading)
          .padding(16)
          .background(
            RoundedRectangle(cornerRadius: 12)
              .stroke(Color.black, lineWidth: 1)
          )
      }
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.white)
  }
}

private struct FileDeliveryView: View {
  @ObservedObject var viewModel: FileDeliveryViewModel

  var body: some View {
    VStack(alignment: .leading, spacing: 16) {
      Text(viewModel.delivery.item.title ?? "Received Files")
        .font(.system(size: 24, weight: .semibold))
      Text("Open this detail view to mark the delivery viewed. Use Download All to save the received files.")
        .font(.system(size: 14))
        .foregroundStyle(.black.opacity(0.7))

      HStack(spacing: 12) {
        Button("Download All") {
          viewModel.downloadAll()
        }
        .buttonStyle(.borderedProminent)
        .tint(.black)
        .disabled(viewModel.isBusy)

        Text("\(viewModel.delivery.item.files.count) file\(viewModel.delivery.item.files.count == 1 ? "" : "s")")
          .font(.system(size: 13))
          .foregroundStyle(.black.opacity(0.6))
      }

      List(viewModel.delivery.item.files, id: \.fileId) { file in
        VStack(alignment: .leading, spacing: 4) {
          Text(file.fileName)
            .font(.system(size: 14, weight: .medium))
          Text("\(file.contentType) · \(ByteCountFormatter.string(fromByteCount: Int64(file.sizeBytes), countStyle: .file))")
            .font(.system(size: 12))
            .foregroundStyle(.black.opacity(0.6))
        }
        .padding(.vertical, 4)
      }
      .listStyle(.plain)

      Text(viewModel.statusMessage)
        .font(.system(size: 13))
        .foregroundStyle(.black.opacity(0.75))
        .frame(maxWidth: .infinity, alignment: .leading)
    }
    .padding(24)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .background(Color.white)
  }
}
