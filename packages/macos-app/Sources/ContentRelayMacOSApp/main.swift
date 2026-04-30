import AppKit

let application = NSApplication.shared
let appController = RelayMenuBarAppController()

application.setActivationPolicy(.accessory)
application.delegate = appController
application.run()
