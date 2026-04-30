import AppKit
import ContentRelayMacOSCore
import Foundation
import UserNotifications

@MainActor
final class AppDeliverySink: RelayDeliverySink {
  private let textWindowController: TextDeliveryWindowController

  init(textWindowController: TextDeliveryWindowController) {
    self.textWindowController = textWindowController
  }

  func openURL(delivery: RelayDelivery) async throws {
    guard let rawURL = delivery.item.url, let url = URL(string: rawURL) else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 30,
        userInfo: [NSLocalizedDescriptionKey: "The URL delivery payload is missing a valid URL."]
      )
    }

    guard NSWorkspace.shared.open(url) else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 31,
        userInfo: [NSLocalizedDescriptionKey: "macOS could not open the received URL."]
      )
    }
  }

  func showText(delivery: RelayDelivery) async throws {
    guard delivery.item.text != nil else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 32,
        userInfo: [NSLocalizedDescriptionKey: "The text delivery payload is empty."]
      )
    }

    textWindowController.present(delivery: delivery)
  }

  func notifyFile(delivery: RelayDelivery) async throws {
    let content = UNMutableNotificationContent()
    content.title = delivery.item.title ?? "Files received"
    content.body = formatFileNotificationLabel(for: delivery)
    content.sound = .default
    content.userInfo = ["deliveryId": delivery.deliveryId]

    let request = UNNotificationRequest(
      identifier: delivery.deliveryId,
      content: content,
      trigger: nil
    )

    try await UNUserNotificationCenter.current().add(request)
  }
}
