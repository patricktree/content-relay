import AppKit
import SwiftUI

enum ContentRelayBranding {
  static func makeLogoImage() -> NSImage? {
    guard let logoURL = Bundle.main.url(forResource: "content-relay-logo", withExtension: "pdf") else {
      return nil
    }

    return NSImage(contentsOf: logoURL)
  }

  static func makeStatusBarImage() -> NSImage? {
    guard let image = makeLogoImage()?.copy() as? NSImage else {
      return nil
    }

    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = true

    return image
  }
}

struct BrandMark: View {
  var size: CGFloat = 24

  var body: some View {
    Group {
      if let logoImage = ContentRelayBranding.makeLogoImage() {
        Image(nsImage: logoImage)
          .resizable()
          .aspectRatio(contentMode: .fit)
      }
    }
    .frame(width: size, height: size)
  }
}
