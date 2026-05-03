import Foundation

public enum RelayItemType: String, Codable, Equatable, Sendable {
  case text
  case url
  case file
}

public enum RelayDeliveryState: String, Codable, Equatable, Sendable {
  case pending
  case delivered
  case viewed
}

public struct RelayFileMetadata: Codable, Equatable, Sendable {
  public let fileId: String
  public let itemId: String
  public let order: Int
  public let fileName: String
  public let storedFileName: String
  public let contentType: String
  public let sizeBytes: Int

  public init(
    fileId: String,
    itemId: String,
    order: Int,
    fileName: String,
    storedFileName: String,
    contentType: String,
    sizeBytes: Int
  ) {
    self.fileId = fileId
    self.itemId = itemId
    self.order = order
    self.fileName = fileName
    self.storedFileName = storedFileName
    self.contentType = contentType
    self.sizeBytes = sizeBytes
  }
}

public struct RelayItem: Codable, Equatable, Sendable {
  public let itemId: String
  public let type: RelayItemType
  public let title: String?
  public let sourceDeviceId: String
  public let text: String?
  public let url: String?
  public let files: [RelayFileMetadata]
  public let createdAt: String

  public init(
    itemId: String,
    type: RelayItemType,
    title: String?,
    sourceDeviceId: String,
    text: String?,
    url: String?,
    files: [RelayFileMetadata],
    createdAt: String
  ) {
    self.itemId = itemId
    self.type = type
    self.title = title
    self.sourceDeviceId = sourceDeviceId
    self.text = text
    self.url = url
    self.files = files
    self.createdAt = createdAt
  }
}

public struct RelayDelivery: Codable, Equatable, Sendable {
  public let deliveryId: String
  public let itemId: String
  public let targetDeviceId: String
  public let state: RelayDeliveryState
  public let createdAt: String
  public let acknowledgedAt: String?
  public let viewedAt: String?
  public let item: RelayItem

  public init(
    deliveryId: String,
    itemId: String,
    targetDeviceId: String,
    state: RelayDeliveryState,
    createdAt: String,
    acknowledgedAt: String?,
    viewedAt: String?,
    item: RelayItem
  ) {
    self.deliveryId = deliveryId
    self.itemId = itemId
    self.targetDeviceId = targetDeviceId
    self.state = state
    self.createdAt = createdAt
    self.acknowledgedAt = acknowledgedAt
    self.viewedAt = viewedAt
    self.item = item
  }
}

public struct RelayPendingDeliveriesResponse: Codable, Sendable {
  public let deliveries: [RelayDelivery]

  public init(deliveries: [RelayDelivery]) {
    self.deliveries = deliveries
  }
}

public struct RelayDeliveryActionResponse: Codable, Sendable {
  public let delivery: RelayDelivery

  public init(delivery: RelayDelivery) {
    self.delivery = delivery
  }
}

public struct RelayErrorResponse: Codable, Sendable {
  public let error: String

  public init(error: String) {
    self.error = error
  }
}

public struct RelayDeviceCredentials: Equatable, Sendable {
  public let relayHubBaseURL: URL
  public let deviceId: String

  public init(relayHubBaseURL: URL, deviceId: String) {
    self.relayHubBaseURL = relayHubBaseURL
    self.deviceId = deviceId
  }
}

public struct ImportedCLIProfile: Equatable, Sendable {
  public let nickname: String
  public let relayHubBaseURL: URL
  public let deviceId: String

  public init(nickname: String, relayHubBaseURL: URL, deviceId: String) {
    self.nickname = nickname
    self.relayHubBaseURL = relayHubBaseURL
    self.deviceId = deviceId
  }
}

public struct RelayDeviceSummary: Codable, Equatable, Identifiable, Sendable {
  public let deviceId: String
  public let nickname: String
  public let platform: String
  public let createdAt: String
  public let updatedAt: String

  public var id: String {
    deviceId
  }

  public init(deviceId: String, nickname: String, platform: String, createdAt: String, updatedAt: String) {
    self.deviceId = deviceId
    self.nickname = nickname
    self.platform = platform
    self.createdAt = createdAt
    self.updatedAt = updatedAt
  }
}

public struct RelayCreateItemResponse: Codable, Equatable, Sendable {
  public let item: RelayItem
  public let deliveries: [RelayDelivery]

  public init(item: RelayItem, deliveries: [RelayDelivery]) {
    self.item = item
    self.deliveries = deliveries
  }
}

public struct RelayDownloadedFile: Codable, Equatable, Sendable {
  public let fileId: String
  public let fileName: String
  public let contentType: String
  public let sizeBytes: Int
  public let base64Content: String

  public init(fileId: String, fileName: String, contentType: String, sizeBytes: Int, base64Content: String) {
    self.fileId = fileId
    self.fileName = fileName
    self.contentType = contentType
    self.sizeBytes = sizeBytes
    self.base64Content = base64Content
  }
}

public struct RelayDownloadDeliveryResponse: Codable, Equatable, Sendable {
  public let item: RelayItem
  public let files: [RelayDownloadedFile]

  public init(item: RelayItem, files: [RelayDownloadedFile]) {
    self.item = item
    self.files = files
  }
}

public struct RelaySendTextRequest: Encodable, Equatable, Sendable {
  public let text: String
  public let title: String?
  public let targetDeviceIds: [String]

  public init(text: String, title: String?, targetDeviceIds: [String]) {
    self.text = text
    self.title = title
    self.targetDeviceIds = targetDeviceIds
  }
}

public struct RelaySendURLRequest: Encodable, Equatable, Sendable {
  public let url: String
  public let title: String?
  public let targetDeviceIds: [String]

  public init(url: String, title: String?, targetDeviceIds: [String]) {
    self.url = url
    self.title = title
    self.targetDeviceIds = targetDeviceIds
  }
}

public func formatFileNotificationLabel(for delivery: RelayDelivery) -> String {
  if delivery.item.files.count == 1, let firstFile = delivery.item.files.first {
    return firstFile.fileName
  }

  return "\(delivery.item.files.count) files"
}

public func truncatePreview(_ value: String, maxLength: Int) -> String {
  guard value.count > maxLength else {
    return value
  }

  guard maxLength > 1 else {
    return "…"
  }

  return "\(value.prefix(maxLength - 1))…"
}
