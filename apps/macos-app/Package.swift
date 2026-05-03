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
  dependencies: [
    .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.6.0"),
    .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.7.0"),
    .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.0.0"),
    .package(url: "https://github.com/apple/swift-http-types", from: "1.0.2"),
  ],
  targets: [
    .target(
      name: "RelayOpenAPI",
      dependencies: [
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
      ],
      plugins: [
        .plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator"),
      ]
    ),
    .target(
      name: "ContentRelayMacOSCore",
      dependencies: [
        "RelayOpenAPI",
        .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
        .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
        .product(name: "HTTPTypes", package: "swift-http-types"),
      ]
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
