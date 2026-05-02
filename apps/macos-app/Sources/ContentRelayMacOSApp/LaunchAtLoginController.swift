import Foundation
import ServiceManagement

final class LaunchAtLoginController {
  func isSupportedInCurrentProcess() -> Bool {
    Bundle.main.bundleURL.pathExtension == "app"
  }

  func isEnabled() -> Bool {
    SMAppService.mainApp.status == .enabled
  }

  func toggle() throws -> Bool {
    guard isSupportedInCurrentProcess() else {
      throw NSError(
        domain: "ContentRelayMacOS",
        code: 20,
        userInfo: [NSLocalizedDescriptionKey: "Launch at Login is only available when the bundled .app is running."]
      )
    }

    if isEnabled() {
      try SMAppService.mainApp.unregister()
      return false
    }

    try SMAppService.mainApp.register()
    return true
  }
}
