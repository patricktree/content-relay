import ContentRelayMacOSCore
import Foundation
import Testing

@Test("processor auto-opens text and URL deliveries and marks them viewed")
func autoOpensTextAndURLDeliveries() async throws {
  let textDelivery = makeDelivery(
    deliveryId: "delivery_text",
    type: .text,
    state: .pending,
    text: "Open this note",
    url: nil,
    files: []
  )
  let urlDelivery = makeDelivery(
    deliveryId: "delivery_url",
    type: .url,
    state: .pending,
    text: nil,
    url: "https://example.com/macos",
    files: []
  )

  let apiClient = MockRelayAPIClient(pendingDeliveries: [textDelivery, urlDelivery])
  let handledStore = MockHandledDeliveryStore()
  let sink = MockRelayDeliverySink()
  let processor = PendingDeliveryProcessor(
    apiClient: apiClient,
    handledDeliveryStore: handledStore,
    deliverySink: sink
  )

  let batch = try await processor.processPendingDeliveries()

  #expect(batch.failures.isEmpty)
  #expect(batch.processed.count == 2)
  #expect(await apiClient.acknowledgedDeliveryIds == ["delivery_text", "delivery_url"])
  #expect(await apiClient.viewedDeliveryIds == ["delivery_text", "delivery_url"])
  #expect(await sink.actions == [.showText("delivery_text"), .openURL("delivery_url")])
}

@Test("processor posts a file notification without marking the delivery viewed")
func notifiesFileDeliveries() async throws {
  let fileDelivery = makeDelivery(
    deliveryId: "delivery_file",
    type: .file,
    state: .pending,
    text: nil,
    url: nil,
    files: [
      RelayFileMetadata(
        fileId: "file_1",
        itemId: "item_file",
        order: 0,
        fileName: "report.pdf",
        storedFileName: "stored-report.pdf",
        contentType: "application/pdf",
        sizeBytes: 42
      )
    ]
  )

  let apiClient = MockRelayAPIClient(pendingDeliveries: [fileDelivery])
  let handledStore = MockHandledDeliveryStore()
  let sink = MockRelayDeliverySink()
  let processor = PendingDeliveryProcessor(
    apiClient: apiClient,
    handledDeliveryStore: handledStore,
    deliverySink: sink
  )

  let batch = try await processor.processPendingDeliveries()

  #expect(batch.failures.isEmpty)
  #expect(await apiClient.acknowledgedDeliveryIds == ["delivery_file"])
  #expect(await apiClient.viewedDeliveryIds.isEmpty)
  #expect(await sink.actions == [.notifyFile("delivery_file")])
}

@Test("processor suppresses duplicate UI actions but still repairs viewed state")
func suppressesDuplicateActionsButRepairsViewedState() async throws {
  let textDelivery = makeDelivery(
    deliveryId: "delivery_duplicate",
    type: .text,
    state: .pending,
    text: "Already handled once",
    url: nil,
    files: []
  )

  let apiClient = MockRelayAPIClient(pendingDeliveries: [textDelivery])
  let handledStore = MockHandledDeliveryStore(initialHandledDeliveryIds: ["delivery_duplicate"])
  let sink = MockRelayDeliverySink()
  let processor = PendingDeliveryProcessor(
    apiClient: apiClient,
    handledDeliveryStore: handledStore,
    deliverySink: sink
  )

  let batch = try await processor.processPendingDeliveries()

  #expect(batch.failures.isEmpty)
  #expect(batch.processed.first?.wasDuplicate == true)
  #expect(await sink.actions.isEmpty)
  #expect(await apiClient.acknowledgedDeliveryIds == ["delivery_duplicate"])
  #expect(await apiClient.viewedDeliveryIds == ["delivery_duplicate"])
}

private actor MockRelayAPIClient: RelayAPIClient {
  let pendingDeliveries: [RelayDelivery]
  var acknowledgedDeliveryIds: [String] = []
  var viewedDeliveryIds: [String] = []

  init(pendingDeliveries: [RelayDelivery]) {
    self.pendingDeliveries = pendingDeliveries
  }

  func fetchPendingDeliveries() async throws -> [RelayDelivery] {
    pendingDeliveries
  }

  func acknowledgeDelivery(deliveryId: String) async throws -> RelayDelivery {
    acknowledgedDeliveryIds.append(deliveryId)

    return makeDelivery(
      deliveryId: deliveryId,
      type: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.type ?? .text,
      state: .delivered,
      text: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.text,
      url: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.url,
      files: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.files ?? []
    )
  }

  func markDeliveryViewed(deliveryId: String) async throws -> RelayDelivery {
    viewedDeliveryIds.append(deliveryId)

    return makeDelivery(
      deliveryId: deliveryId,
      type: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.type ?? .text,
      state: .viewed,
      text: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.text,
      url: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.url,
      files: pendingDeliveries.first { $0.deliveryId == deliveryId }?.item.files ?? []
    )
  }

  func getDelivery(deliveryId: String) async throws -> RelayDelivery {
    guard let delivery = pendingDeliveries.first(where: { $0.deliveryId == deliveryId }) else {
      throw RelayAPIError(statusCode: 404, message: "Missing delivery")
    }

    return delivery
  }

  func listDevices() async throws -> [RelayDeviceSummary] {
    []
  }

  func sendText(_ request: RelaySendTextRequest) async throws -> RelayCreateItemResponse {
    throw RelayAPIError(statusCode: 500, message: "Unexpected test call")
  }

  func sendURL(_ request: RelaySendURLRequest) async throws -> RelayCreateItemResponse {
    throw RelayAPIError(statusCode: 500, message: "Unexpected test call")
  }

  func sendFiles(fileURLs: [URL], title: String?, targetDeviceIds: [String]) async throws -> RelayCreateItemResponse {
    throw RelayAPIError(statusCode: 500, message: "Unexpected test call")
  }

  func downloadDelivery(deliveryId: String) async throws -> RelayDownloadDeliveryResponse {
    throw RelayAPIError(statusCode: 500, message: "Unexpected test call")
  }
}

private actor MockHandledDeliveryStore: HandledDeliveryStore {
  private var handledDeliveryIds: Set<String>

  init(initialHandledDeliveryIds: Set<String> = []) {
    self.handledDeliveryIds = initialHandledDeliveryIds
  }

  func contains(deliveryId: String) async throws -> Bool {
    handledDeliveryIds.contains(deliveryId)
  }

  func insert(deliveryId: String) async throws {
    handledDeliveryIds.insert(deliveryId)
  }
}

private actor MockRelayDeliverySink: RelayDeliverySink {
  enum Action: Equatable {
    case openURL(String)
    case showText(String)
    case notifyFile(String)
  }

  var actions: [Action] = []

  func openURL(delivery: RelayDelivery) async throws {
    actions.append(.openURL(delivery.deliveryId))
  }

  func showText(delivery: RelayDelivery) async throws {
    actions.append(.showText(delivery.deliveryId))
  }

  func notifyFile(delivery: RelayDelivery) async throws {
    actions.append(.notifyFile(delivery.deliveryId))
  }
}

private func makeDelivery(
  deliveryId: String,
  type: RelayItemType,
  state: RelayDeliveryState,
  text: String?,
  url: String?,
  files: [RelayFileMetadata]
) -> RelayDelivery {
  let itemId = "item_\(deliveryId)"

  return RelayDelivery(
    deliveryId: deliveryId,
    itemId: itemId,
    targetDeviceId: "device_macos",
    state: state,
    createdAt: "2026-04-30T12:00:00Z",
    acknowledgedAt: state == .pending ? nil : "2026-04-30T12:00:01Z",
    viewedAt: state == .viewed ? "2026-04-30T12:00:02Z" : nil,
    item: RelayItem(
      itemId: itemId,
      type: type,
      title: nil,
      sourceDeviceId: "device_cli",
      text: text,
      url: url,
      files: files,
      createdAt: "2026-04-30T12:00:00Z"
    )
  )
}
