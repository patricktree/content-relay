import ContentRelayMacOSCore
import Foundation
import Testing

@Test("URLSession relay API client sends auth headers and decodes pending deliveries")
func sendsAuthHeadersAndDecodesPendingDeliveries() async throws {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StubURLProtocol.self]

  let session = URLSession(configuration: configuration)
  let client = URLSessionRelayAPIClient(
    credentials: RelayDeviceCredentials(
      serverBaseURL: URL(string: "http://127.0.0.1:8787")!,
      deviceId: "device_macos",
      authToken: "auth_token"
    ),
    session: session
  )

  let deliveries = try await client.fetchPendingDeliveries()

  #expect(deliveries.count == 1)
  #expect(deliveries.first?.deliveryId == "delivery_1")
  #expect(deliveries.first?.item.text == "hello")
}

@Test("URLSession relay API client lists devices and sends JSON item requests")
func listsDevicesAndSendsJSONItemRequests() async throws {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StubURLProtocol.self]

  let session = URLSession(configuration: configuration)
  let client = URLSessionRelayAPIClient(
    credentials: RelayDeviceCredentials(
      serverBaseURL: URL(string: "http://127.0.0.1:8787")!,
      deviceId: "device_macos",
      authToken: "auth_token"
    ),
    session: session
  )

  let devices = try await client.listDevices()
  #expect(devices.count == 2)
  #expect(devices.map(\.nickname) == ["Developer CLI", "My iPhone"])

  let response = try await client.sendText(
    RelaySendTextRequest(
      text: "hello from macOS",
      title: "Inbox",
      targetDeviceIds: ["device_ios"]
    )
  )

  #expect(response.item.type == .text)
  #expect(response.item.text == "hello from macOS")
  #expect(response.deliveries.count == 1)
}

@Test("URLSession relay API client sends multipart file uploads and downloads files")
func sendsMultipartFileUploadsAndDownloadsFiles() async throws {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StubURLProtocol.self]

  let temporaryDirectory = FileManager.default.temporaryDirectory
    .appendingPathComponent(UUID().uuidString, isDirectory: true)
  try FileManager.default.createDirectory(at: temporaryDirectory, withIntermediateDirectories: true)
  defer { try? FileManager.default.removeItem(at: temporaryDirectory) }

  let firstFileURL = temporaryDirectory.appendingPathComponent("alpha.txt")
  let secondFileURL = temporaryDirectory.appendingPathComponent("beta.txt")
  try Data("alpha\n".utf8).write(to: firstFileURL)
  try Data("beta\n".utf8).write(to: secondFileURL)

  let session = URLSession(configuration: configuration)
  let client = URLSessionRelayAPIClient(
    credentials: RelayDeviceCredentials(
      serverBaseURL: URL(string: "http://127.0.0.1:8787")!,
      deviceId: "device_macos",
      authToken: "auth_token"
    ),
    session: session
  )

  let uploadResponse = try await client.sendFiles(
    fileURLs: [firstFileURL, secondFileURL],
    title: "Trip Docs",
    targetDeviceIds: ["device_ios", "device_android"]
  )
  #expect(uploadResponse.item.type == .file)
  #expect(uploadResponse.item.files.count == 2)

  let downloadResponse = try await client.downloadDelivery(deliveryId: "delivery_download")
  #expect(downloadResponse.item.itemId == "item_download")
  #expect(downloadResponse.files.map(\.fileName) == ["alpha.txt", "beta.txt"])
}

@Test("URLSession relay API client surfaces backend error payloads")
func surfacesBackendErrorPayloads() async throws {
  let configuration = URLSessionConfiguration.ephemeral
  configuration.protocolClasses = [StubURLProtocol.self]

  let session = URLSession(configuration: configuration)
  let client = URLSessionRelayAPIClient(
    credentials: RelayDeviceCredentials(
      serverBaseURL: URL(string: "http://127.0.0.1:8787")!,
      deviceId: "device_macos",
      authToken: "bad_token"
    ),
    session: session
  )

  do {
    _ = try await client.fetchPendingDeliveries()
    Issue.record("Expected the client to throw a RelayAPIError for a 401 response.")
  } catch let error as RelayAPIError {
    #expect(error == RelayAPIError(statusCode: 401, message: "Authentication failed."))
  }
}

private final class StubURLProtocol: URLProtocol, @unchecked Sendable {
  override class func canInit(with request: URLRequest) -> Bool {
    true
  }

  override class func canonicalRequest(for request: URLRequest) -> URLRequest {
    request
  }

  override func startLoading() {
    let (response, data) = Self.makeResponse(for: request)
    client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
    client?.urlProtocol(self, didLoad: data)
    client?.urlProtocolDidFinishLoading(self)
  }

  override func stopLoading() {}

  private static func makeResponse(for request: URLRequest) -> (HTTPURLResponse, Data) {
    #expect(request.value(forHTTPHeaderField: "x-relay-device-id") == "device_macos")
    #expect(request.url?.host() == "127.0.0.1")
    #expect(request.url?.port == 8787)

    let authorizationHeader = request.value(forHTTPHeaderField: "authorization")
    if authorizationHeader == "Bearer bad_token" {
      return jsonResponse(
        request: request,
        statusCode: 401,
        body: "{\"error\":\"Authentication failed.\"}"
      )
    }

    #expect(authorizationHeader == "Bearer auth_token")

    switch (request.httpMethod, request.url?.path()) {
    case ("GET", "/deliveries/pending"):
      return jsonResponse(
        request: request,
        statusCode: 200,
        body: pendingDeliveriesJSON
      )
    case ("GET", "/devices"):
      return jsonResponse(
        request: request,
        statusCode: 200,
        body: devicesJSON
      )
    case ("POST", "/items/text"):
      #expect(request.value(forHTTPHeaderField: "content-type") == "application/json")
      let body = requestBodyString(from: request)
      #expect(body.contains("\"text\":\"hello from macOS\""))
      #expect(body.contains("\"title\":\"Inbox\""))
      #expect(body.contains("\"targetDeviceIds\":[\"device_ios\"]"))
      return jsonResponse(
        request: request,
        statusCode: 201,
        body: createdTextItemJSON
      )
    case ("POST", "/items/file"):
      let contentType = request.value(forHTTPHeaderField: "content-type") ?? ""
      #expect(contentType.contains("multipart/form-data; boundary="))
      let body = requestBodyString(from: request)
      #expect(body.contains("name=\"targetDeviceIds\""))
      #expect(body.contains("[\"device_ios\",\"device_android\"]"))
      #expect(body.contains("name=\"title\""))
      #expect(body.contains("Trip Docs"))
      #expect(body.contains("filename=\"alpha.txt\""))
      #expect(body.contains("filename=\"beta.txt\""))
      return jsonResponse(
        request: request,
        statusCode: 201,
        body: createdFileItemJSON
      )
    case ("GET", "/deliveries/delivery_download/download"):
      return jsonResponse(
        request: request,
        statusCode: 200,
        body: downloadedDeliveryJSON
      )
    default:
      Issue.record("Unexpected request: \(request.httpMethod ?? "nil") \(request.url?.absoluteString ?? "nil")")
      return jsonResponse(
        request: request,
        statusCode: 500,
        body: "{\"error\":\"Unexpected stub request.\"}"
      )
    }
  }

  private static func jsonResponse(request: URLRequest, statusCode: Int, body: String) -> (HTTPURLResponse, Data) {
    let response = HTTPURLResponse(
      url: request.url!,
      statusCode: statusCode,
      httpVersion: nil,
      headerFields: ["content-type": "application/json"]
    )!

    return (response, Data(body.utf8))
  }
}

private func requestBodyString(from request: URLRequest) -> String {
  if let httpBody = request.httpBody, let string = String(data: httpBody, encoding: .utf8) {
    return string
  }

  guard let stream = request.httpBodyStream else {
    return ""
  }

  stream.open()
  defer { stream.close() }

  let bufferSize = 4096
  let buffer = UnsafeMutablePointer<UInt8>.allocate(capacity: bufferSize)
  defer { buffer.deallocate() }

  var data = Data()
  while stream.hasBytesAvailable {
    let count = stream.read(buffer, maxLength: bufferSize)

    if count <= 0 {
      break
    }

    data.append(buffer, count: count)
  }

  return String(data: data, encoding: .utf8) ?? ""
}

private let pendingDeliveriesJSON = """
{
  "deliveries": [
    {
      "deliveryId": "delivery_1",
      "itemId": "item_1",
      "targetDeviceId": "device_macos",
      "state": "pending",
      "createdAt": "2026-04-30T12:00:00Z",
      "acknowledgedAt": null,
      "viewedAt": null,
      "item": {
        "itemId": "item_1",
        "type": "text",
        "title": "Inbox",
        "sourceDeviceId": "device_cli",
        "text": "hello",
        "url": null,
        "files": [],
        "createdAt": "2026-04-30T12:00:00Z"
      }
    }
  ]
}
"""

private let devicesJSON = """
[
  {
    "deviceId": "device_cli",
    "nickname": "Developer CLI",
    "platform": "cli",
    "createdAt": "2026-04-30T12:00:00Z",
    "updatedAt": "2026-04-30T12:00:00Z"
  },
  {
    "deviceId": "device_ios",
    "nickname": "My iPhone",
    "platform": "ios",
    "createdAt": "2026-04-30T12:00:00Z",
    "updatedAt": "2026-04-30T12:00:00Z"
  }
]
"""

private let createdTextItemJSON = """
{
  "item": {
    "itemId": "item_text",
    "type": "text",
    "title": "Inbox",
    "sourceDeviceId": "device_macos",
    "text": "hello from macOS",
    "url": null,
    "files": [],
    "createdAt": "2026-04-30T12:00:00Z"
  },
  "deliveries": [
    {
      "deliveryId": "delivery_text",
      "itemId": "item_text",
      "targetDeviceId": "device_ios",
      "state": "pending",
      "createdAt": "2026-04-30T12:00:00Z",
      "acknowledgedAt": null,
      "viewedAt": null,
      "item": {
        "itemId": "item_text",
        "type": "text",
        "title": "Inbox",
        "sourceDeviceId": "device_macos",
        "text": "hello from macOS",
        "url": null,
        "files": [],
        "createdAt": "2026-04-30T12:00:00Z"
      }
    }
  ]
}
"""

private let createdFileItemJSON = """
{
  "item": {
    "itemId": "item_file",
    "type": "file",
    "title": "Trip Docs",
    "sourceDeviceId": "device_macos",
    "text": null,
    "url": null,
    "files": [
      {
        "fileId": "file_alpha",
        "itemId": "item_file",
        "order": 0,
        "fileName": "alpha.txt",
        "storedFileName": "stored-alpha.txt",
        "contentType": "text/plain",
        "sizeBytes": 6
      },
      {
        "fileId": "file_beta",
        "itemId": "item_file",
        "order": 1,
        "fileName": "beta.txt",
        "storedFileName": "stored-beta.txt",
        "contentType": "text/plain",
        "sizeBytes": 5
      }
    ],
    "createdAt": "2026-04-30T12:00:00Z"
  },
  "deliveries": [
    {
      "deliveryId": "delivery_file_1",
      "itemId": "item_file",
      "targetDeviceId": "device_ios",
      "state": "pending",
      "createdAt": "2026-04-30T12:00:00Z",
      "acknowledgedAt": null,
      "viewedAt": null,
      "item": {
        "itemId": "item_file",
        "type": "file",
        "title": "Trip Docs",
        "sourceDeviceId": "device_macos",
        "text": null,
        "url": null,
        "files": [
          {
            "fileId": "file_alpha",
            "itemId": "item_file",
            "order": 0,
            "fileName": "alpha.txt",
            "storedFileName": "stored-alpha.txt",
            "contentType": "text/plain",
            "sizeBytes": 6
          },
          {
            "fileId": "file_beta",
            "itemId": "item_file",
            "order": 1,
            "fileName": "beta.txt",
            "storedFileName": "stored-beta.txt",
            "contentType": "text/plain",
            "sizeBytes": 5
          }
        ],
        "createdAt": "2026-04-30T12:00:00Z"
      }
    }
  ]
}
"""

private let downloadedDeliveryJSON = """
{
  "item": {
    "itemId": "item_download",
    "type": "file",
    "title": "Trip Docs",
    "sourceDeviceId": "device_cli",
    "text": null,
    "url": null,
    "files": [
      {
        "fileId": "file_alpha",
        "itemId": "item_download",
        "order": 0,
        "fileName": "alpha.txt",
        "storedFileName": "stored-alpha.txt",
        "contentType": "text/plain",
        "sizeBytes": 6
      },
      {
        "fileId": "file_beta",
        "itemId": "item_download",
        "order": 1,
        "fileName": "beta.txt",
        "storedFileName": "stored-beta.txt",
        "contentType": "text/plain",
        "sizeBytes": 5
      }
    ],
    "createdAt": "2026-04-30T12:00:00Z"
  },
  "files": [
    {
      "fileId": "file_alpha",
      "fileName": "alpha.txt",
      "contentType": "text/plain",
      "sizeBytes": 6,
      "base64Content": "YWxwaGEK"
    },
    {
      "fileId": "file_beta",
      "fileName": "beta.txt",
      "contentType": "text/plain",
      "sizeBytes": 5,
      "base64Content": "YmV0YQo="
    }
  ]
}
"""
