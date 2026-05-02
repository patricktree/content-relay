import Foundation

public protocol HandledDeliveryStore: Sendable {
  func contains(deliveryId: String) async throws -> Bool
  func insert(deliveryId: String) async throws
}

public protocol RelayDeliverySink: Sendable {
  func openURL(delivery: RelayDelivery) async throws
  func showText(delivery: RelayDelivery) async throws
  func notifyFile(delivery: RelayDelivery) async throws
}

public enum ProcessedDeliveryAction: Equatable, Sendable {
  case openedURL
  case showedTextWindow
  case postedFileNotification
}

public struct ProcessedDelivery: Equatable, Sendable {
  public let delivery: RelayDelivery
  public let wasDuplicate: Bool
  public let action: ProcessedDeliveryAction

  public init(delivery: RelayDelivery, wasDuplicate: Bool, action: ProcessedDeliveryAction) {
    self.delivery = delivery
    self.wasDuplicate = wasDuplicate
    self.action = action
  }
}

public struct DeliveryProcessingFailure: Equatable, Sendable {
  public let deliveryId: String
  public let message: String

  public init(deliveryId: String, message: String) {
    self.deliveryId = deliveryId
    self.message = message
  }
}

public struct DeliveryProcessingBatch: Equatable, Sendable {
  public let processed: [ProcessedDelivery]
  public let failures: [DeliveryProcessingFailure]

  public init(processed: [ProcessedDelivery], failures: [DeliveryProcessingFailure]) {
    self.processed = processed
    self.failures = failures
  }
}

public struct PendingDeliveryProcessor: Sendable {
  private let apiClient: any RelayAPIClient
  private let handledDeliveryStore: any HandledDeliveryStore
  private let deliverySink: any RelayDeliverySink

  public init(
    apiClient: any RelayAPIClient,
    handledDeliveryStore: any HandledDeliveryStore,
    deliverySink: any RelayDeliverySink
  ) {
    self.apiClient = apiClient
    self.handledDeliveryStore = handledDeliveryStore
    self.deliverySink = deliverySink
  }

  public func processPendingDeliveries() async throws -> DeliveryProcessingBatch {
    let pendingDeliveries = try await apiClient.fetchPendingDeliveries()
    var processed: [ProcessedDelivery] = []
    var failures: [DeliveryProcessingFailure] = []

    for delivery in pendingDeliveries {
      do {
        let result = try await processSingleDelivery(delivery)
        processed.append(result)
      } catch {
        failures.append(
          DeliveryProcessingFailure(
            deliveryId: delivery.deliveryId,
            message: error.localizedDescription
          )
        )
      }
    }

    return DeliveryProcessingBatch(processed: processed, failures: failures)
  }

  private func processSingleDelivery(_ delivery: RelayDelivery) async throws -> ProcessedDelivery {
    let wasDuplicate = try await handledDeliveryStore.contains(deliveryId: delivery.deliveryId)
    var currentDelivery = delivery

    if currentDelivery.state == .pending {
      currentDelivery = try await apiClient.acknowledgeDelivery(deliveryId: delivery.deliveryId)
    }

    let plan = plan(for: currentDelivery)

    if !wasDuplicate {
      switch plan.action {
      case .openedURL:
        try await deliverySink.openURL(delivery: currentDelivery)
      case .showedTextWindow:
        try await deliverySink.showText(delivery: currentDelivery)
      case .postedFileNotification:
        try await deliverySink.notifyFile(delivery: currentDelivery)
      }

      try await handledDeliveryStore.insert(deliveryId: delivery.deliveryId)
    }

    if plan.shouldMarkViewed, currentDelivery.state != .viewed {
      currentDelivery = try await apiClient.markDeliveryViewed(deliveryId: delivery.deliveryId)
    }

    return ProcessedDelivery(
      delivery: currentDelivery,
      wasDuplicate: wasDuplicate,
      action: plan.action
    )
  }

  private func plan(for delivery: RelayDelivery) -> RelayDeliveryHandlingPlan {
    switch delivery.item.type {
    case .url:
      return RelayDeliveryHandlingPlan(action: .openedURL, shouldMarkViewed: true)
    case .text:
      return RelayDeliveryHandlingPlan(action: .showedTextWindow, shouldMarkViewed: true)
    case .file:
      return RelayDeliveryHandlingPlan(action: .postedFileNotification, shouldMarkViewed: false)
    }
  }
}

private struct RelayDeliveryHandlingPlan {
  let action: ProcessedDeliveryAction
  let shouldMarkViewed: Bool
}
