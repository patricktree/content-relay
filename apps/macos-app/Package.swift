// swift-tools-version: 6.0
import PackageDescription

let package = Package(
  name: "ContentRelayMacOS",
  platforms: [
    .macOS(.v14),
  ],
  products: [
    .library(name: "ContentRelayMacOSCore", targets: ["ContentRelayMacOSCore"]),
    .executable(name: "ContentRelayMacOSApp", targets: ["ContentRelayMacOSApp"]),
  ],
  targets: [
    .target(
      name: "ContentRelayMacOSCore"
    ),
    .executableTarget(
      name: "ContentRelayMacOSApp",
      dependencies: ["ContentRelayMacOSCore"]
    ),
    .testTarget(
      name: "ContentRelayMacOSCoreTests",
      dependencies: ["ContentRelayMacOSCore"]
    ),
  ]
)
