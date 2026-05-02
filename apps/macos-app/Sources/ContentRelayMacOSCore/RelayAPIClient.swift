import Foundation
import UniformTypeIdentifiers

public protocol RelayAPIClient: Sendable {
  func fetchPendingDeliveries() async throws -> [RelayDelivery]
  func acknowledgeDelivery(deliveryId: String) async throws -> RelayDelivery
  func markDeliveryViewed(deliveryId: String) async throws -> RelayDelivery
  func getDelivery(deliveryId: String) async throws -> RelayDelivery
  func listDevices() async throws -> [RelayDeviceSummary]
  func sendText(_ request: RelaySendTextRequest) async throws -> RelayCreateItemResponse
  func sendURL(_ request: RelaySendURLRequest) async throws -> RelayCreateItemResponse
  func sendFiles(fileURLs: [URL], title: String?, targetDeviceIds: [String]) async throws -> RelayCreateItemResponse
  func downloadDelivery(deliveryId: String) async throws -> RelayDownloadDeliveryResponse
}

public struct RelayAPIError: LocalizedError, Equatable, Sendable {
  public let statusCode: Int
  public let message: String

  public init(statusCode: Int, message: String) {
    self.statusCode = statusCode
    self.message = message
  }

  public var errorDescription: String? {
    message
  }
}

public final class URLSessionRelayAPIClient: RelayAPIClient, @unchecked Sendable {
  private let credentials: RelayDeviceCredentials
  private let session: URLSession
  private let jsonDecoder: JSONDecoder
  private let jsonEncoder: JSONEncoder

  public init(credentials: RelayDeviceCredentials, session: URLSession = .shared) {
    self.credentials = credentials
    self.session = session
    self.jsonDecoder = JSONDecoder()
    self.jsonEncoder = JSONEncoder()
  }

  public func fetchPendingDeliveries() async throws -> [RelayDelivery] {
    let response: RelayPendingDeliveriesResponse = try await sendRequest(
      path: "/deliveries/pending",
      method: "GET"
    )

    return response.deliveries
  }

  public func acknowledgeDelivery(deliveryId: String) async throws -> RelayDelivery {
    let response: RelayDeliveryActionResponse = try await sendRequest(
      path: "/deliveries/\(deliveryId)/ack",
      method: "POST"
    )

    return response.delivery
  }

  public func markDeliveryViewed(deliveryId: String) async throws -> RelayDelivery {
    let response: RelayDeliveryActionResponse = try await sendRequest(
      path: "/deliveries/\(deliveryId)/viewed",
      method: "POST"
    )

    return response.delivery
  }

  public func getDelivery(deliveryId: String) async throws -> RelayDelivery {
    let response: RelayDeliveryActionResponse = try await sendRequest(
      path: "/deliveries/\(deliveryId)",
      method: "GET"
    )

    return response.delivery
  }

  public func listDevices() async throws -> [RelayDeviceSummary] {
    try await sendRequest(path: "/devices", method: "GET")
  }

  public func sendText(_ request: RelaySendTextRequest) async throws -> RelayCreateItemResponse {
    try await sendJSONRequest(path: "/items/text", method: "POST", body: request)
  }

  public func sendURL(_ request: RelaySendURLRequest) async throws -> RelayCreateItemResponse {
    try await sendJSONRequest(path: "/items/url", method: "POST", body: request)
  }

  public func sendFiles(
    fileURLs: [URL],
    title: String?,
    targetDeviceIds: [String]
  ) async throws -> RelayCreateItemResponse {
    guard !fileURLs.isEmpty else {
      throw RelayAPIError(statusCode: -1, message: "Choose at least one file to send.")
    }

    let boundary = "Boundary-\(UUID().uuidString)"
    let multipartBody = try createMultipartFileUploadBody(
      boundary: boundary,
      fileURLs: fileURLs,
      title: title,
      targetDeviceIds: targetDeviceIds
    )

    return try await sendRequest(
      path: "/items/file",
      method: "POST",
      bodyData: multipartBody,
      contentType: "multipart/form-data; boundary=\(boundary)"
    )
  }

  public func downloadDelivery(deliveryId: String) async throws -> RelayDownloadDeliveryResponse {
    try await sendRequest(path: "/deliveries/\(deliveryId)/download", method: "GET")
  }

  private func sendJSONRequest<Response: Decodable, Body: Encodable>(
    path: String,
    method: String,
    body: Body
  ) async throws -> Response {
    try await sendRequest(
      path: path,
      method: method,
      bodyData: jsonEncoder.encode(body),
      contentType: "application/json"
    )
  }

  private func sendRequest<Response: Decodable>(
    path: String,
    method: String,
    bodyData: Data? = nil,
    contentType: String? = nil
  ) async throws -> Response {
    let request = try buildRequest(
      path: path,
      method: method,
      bodyData: bodyData,
      contentType: contentType
    )
    let (data, response) = try await session.data(for: request)

    guard let httpResponse = response as? HTTPURLResponse else {
      throw RelayAPIError(statusCode: -1, message: "The relay server did not return an HTTP response.")
    }

    guard (200...299).contains(httpResponse.statusCode) else {
      throw try decodeError(data: data, statusCode: httpResponse.statusCode)
    }

    return try jsonDecoder.decode(Response.self, from: data)
  }

  private func buildRequest(
    path: String,
    method: String,
    bodyData: Data?,
    contentType: String?
  ) throws -> URLRequest {
    let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"

    guard let url = URL(string: normalizedPath, relativeTo: credentials.serverBaseURL)?.absoluteURL else {
      throw RelayAPIError(statusCode: -1, message: "The relay request URL could not be constructed.")
    }

    var request = URLRequest(url: url)
    request.httpMethod = method
    request.setValue("application/json", forHTTPHeaderField: "accept")
    request.setValue(credentials.deviceId, forHTTPHeaderField: "x-relay-device-id")

    if let bodyData {
      request.httpBody = bodyData
    }

    if let contentType {
      request.setValue(contentType, forHTTPHeaderField: "content-type")
    }

    return request
  }

  private func decodeError(data: Data, statusCode: Int) throws -> RelayAPIError {
    if let error = try? jsonDecoder.decode(RelayErrorResponse.self, from: data) {
      return RelayAPIError(statusCode: statusCode, message: error.error)
    }

    if let text = String(data: data, encoding: .utf8), !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      return RelayAPIError(statusCode: statusCode, message: text)
    }

    return RelayAPIError(statusCode: statusCode, message: "Relay request failed with status \(statusCode).")
  }

  private func createMultipartFileUploadBody(
    boundary: String,
    fileURLs: [URL],
    title: String?,
    targetDeviceIds: [String]
  ) throws -> Data {
    let lineBreak = "\r\n"
    var data = Data()

    func appendString(_ value: String) {
      data.append(Data(value.utf8))
    }

    appendString("--\(boundary)\(lineBreak)")
    appendString("Content-Disposition: form-data; name=\"targetDeviceIds\"\(lineBreak)\(lineBreak)")
    appendString(try encodeJSONString(targetDeviceIds))
    appendString(lineBreak)

    if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      appendString("--\(boundary)\(lineBreak)")
      appendString("Content-Disposition: form-data; name=\"title\"\(lineBreak)\(lineBreak)")
      appendString(title)
      appendString(lineBreak)
    }

    for fileURL in fileURLs {
      let fileData = try Data(contentsOf: fileURL)
      let contentType = contentType(for: fileURL)

      appendString("--\(boundary)\(lineBreak)")
      appendString(
        "Content-Disposition: form-data; name=\"files\"; filename=\"\(escapedMultipartValue(fileURL.lastPathComponent))\"\(lineBreak)"
      )
      appendString("Content-Type: \(contentType)\(lineBreak)\(lineBreak)")
      data.append(fileData)
      appendString(lineBreak)
    }

    appendString("--\(boundary)--\(lineBreak)")
    return data
  }

  private func encodeJSONString(_ value: [String]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value)

    guard let encoded = String(data: data, encoding: .utf8) else {
      throw RelayAPIError(statusCode: -1, message: "The file upload target list could not be encoded.")
    }

    return encoded
  }

  private func contentType(for fileURL: URL) -> String {
    if let type = UTType(filenameExtension: fileURL.pathExtension), let mimeType = type.preferredMIMEType {
      return mimeType
    }

    return "application/octet-stream"
  }

  private func escapedMultipartValue(_ value: String) -> String {
    value.replacingOccurrences(of: "\"", with: "\\\"")
  }
}
