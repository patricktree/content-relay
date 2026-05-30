import Foundation
import OpenAPIRuntime
import OpenAPIURLSession
import RelayOpenAPI

public final class OpenAPIRelayAPIClient: RelayAPIClient, @unchecked Sendable {
  private let underlyingClient: any APIProtocol
  private let deviceId: String
  private let jsonDecoder: JSONDecoder
  private let jsonEncoder: JSONEncoder

  public init(credentials: RelayDeviceCredentials, session: URLSession = .shared) {
    self.deviceId = credentials.deviceId
    self.underlyingClient = Client(
      serverURL: credentials.relayHubBaseURL,
      transport: URLSessionTransport(configuration: .init(
        session: session,
        httpBodyProcessingMode: .buffered
      )),
    )
    self.jsonDecoder = JSONDecoder()
    self.jsonEncoder = JSONEncoder()
  }

  public func fetchPendingDeliveries() async throws -> [RelayDelivery] {
    let response = try await underlyingClient.getDeliveries(
      .init(query: .init(targetDeviceId: deviceId, state: .pending))
    )

    switch response {
    case let .ok(ok):
      let payload = try convertPayload(ok.body.json, as: RelayPendingDeliveriesResponse.self)
      return payload.deliveries
    case let .badRequest(badRequest):
      throw relayAPIError(statusCode: 400, payload: try badRequest.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func acknowledgeDelivery(deliveryId: String) async throws -> RelayDelivery {
    let response = try await underlyingClient.postDeliveriesDeliveryIdAck(
      path: .init(deliveryId: deliveryId),
      query: .init(targetDeviceId: deviceId)
    )

    switch response {
    case let .ok(ok):
      let payload = try convertPayload(ok.body.json, as: RelayDeliveryActionResponse.self)
      return payload.delivery
    case let .notFound(notFound):
      throw relayAPIError(statusCode: 404, payload: try notFound.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func markDeliveryViewed(deliveryId: String) async throws -> RelayDelivery {
    let response = try await underlyingClient.postDeliveriesDeliveryIdViewed(
      path: .init(deliveryId: deliveryId),
      query: .init(targetDeviceId: deviceId)
    )

    switch response {
    case let .ok(ok):
      let payload = try convertPayload(ok.body.json, as: RelayDeliveryActionResponse.self)
      return payload.delivery
    case let .notFound(notFound):
      throw relayAPIError(statusCode: 404, payload: try notFound.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func getDelivery(deliveryId: String) async throws -> RelayDelivery {
    let response = try await underlyingClient.getDeliveriesDeliveryId(
      path: .init(deliveryId: deliveryId),
      query: .init(targetDeviceId: deviceId)
    )

    switch response {
    case let .ok(ok):
      let payload = try convertPayload(ok.body.json, as: RelayDeliveryActionResponse.self)
      return payload.delivery
    case let .notFound(notFound):
      throw relayAPIError(statusCode: 404, payload: try notFound.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func listDevices() async throws -> [RelayDeviceSummary] {
    let response = try await underlyingClient.getDevices(.init())

    switch response {
    case let .ok(ok):
      return try convertPayload(ok.body.json, as: [RelayDeviceSummary].self)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func sendText(_ request: RelaySendTextRequest) async throws -> RelayCreateItemResponse {
    let response = try await underlyingClient.postItemsText(
      body: .json(
        .init(
          sourceDeviceId: deviceId,
          text: request.text,
          title: request.title,
          targetDeviceIds: request.targetDeviceIds
        )
      )
    )

    switch response {
    case let .created(created):
      return try convertPayload(created.body.json, as: RelayCreateItemResponse.self)
    case let .badRequest(badRequest):
      throw relayAPIError(statusCode: 400, payload: try badRequest.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func sendURL(_ request: RelaySendURLRequest) async throws -> RelayCreateItemResponse {
    let response = try await underlyingClient.postItemsUrl(
      body: .json(
        .init(
          sourceDeviceId: deviceId,
          url: request.url,
          title: request.title,
          targetDeviceIds: request.targetDeviceIds
        )
      )
    )

    switch response {
    case let .created(created):
      return try convertPayload(created.body.json, as: RelayCreateItemResponse.self)
    case let .badRequest(badRequest):
      throw relayAPIError(statusCode: 400, payload: try badRequest.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func sendFiles(
    fileURLs: [URL],
    title: String?,
    targetDeviceIds: [String]
  ) async throws -> RelayCreateItemResponse {
    guard !fileURLs.isEmpty else {
      throw RelayAPIError(statusCode: -1, message: "Choose at least one file to send.")
    }

    let multipartBody = try createFileUploadBody(
      fileURLs: fileURLs,
      title: title,
      targetDeviceIds: targetDeviceIds
    )
    let response = try await underlyingClient.postItemsFile(
      body: .multipartForm(multipartBody)
    )

    switch response {
    case let .created(created):
      return try convertPayload(created.body.json, as: RelayCreateItemResponse.self)
    case let .badRequest(badRequest):
      throw relayAPIError(statusCode: 400, payload: try badRequest.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  public func downloadDelivery(deliveryId: String) async throws -> RelayDownloadDeliveryResponse {
    let response = try await underlyingClient.getDeliveriesDeliveryIdDownload(
      path: .init(deliveryId: deliveryId),
      query: .init(targetDeviceId: deviceId)
    )

    switch response {
    case let .ok(ok):
      return try convertPayload(ok.body.json, as: RelayDownloadDeliveryResponse.self)
    case let .notFound(notFound):
      throw relayAPIError(statusCode: 404, payload: try notFound.body.json)
    case let .internalServerError(internalServerError):
      throw relayAPIError(statusCode: 500, payload: try internalServerError.body.json)
    case let .undocumented(statusCode, _):
      throw undocumentedRelayAPIError(statusCode: statusCode)
    }
  }

  private func createFileUploadBody(
    fileURLs: [URL],
    title: String?,
    targetDeviceIds: [String]
  ) throws -> MultipartBody<Operations.PostItemsFile.Input.Body.MultipartFormPayload> {
    let encodedTargetDeviceIds = try encodeJSONString(targetDeviceIds)
    var parts: [Operations.PostItemsFile.Input.Body.MultipartFormPayload] = [
      .sourceDeviceId(.init(payload: .init(body: HTTPBody(deviceId)))),
      .targetDeviceIds(.init(payload: .init(body: HTTPBody(encodedTargetDeviceIds)))),
    ]

    if let title, !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
      parts.append(.title(.init(payload: .init(body: HTTPBody(title)))))
    }

    for fileURL in fileURLs {
      let fileData = try Data(contentsOf: fileURL)
      parts.append(
        .files(
          .init(
            payload: .init(body: HTTPBody(fileData)),
            filename: fileURL.lastPathComponent
          )
        )
      )
    }

    return MultipartBody(parts)
  }

  private func encodeJSONString(_ value: [String]) throws -> String {
    let data = try JSONSerialization.data(withJSONObject: value)

    guard let encoded = String(data: data, encoding: .utf8) else {
      throw RelayAPIError(statusCode: -1, message: "The file upload target list could not be encoded.")
    }

    return encoded
  }

  private func convertPayload<Generated: Encodable, Domain: Decodable>(
    _ payload: Generated,
    as type: Domain.Type
  ) throws -> Domain {
    let data = try jsonEncoder.encode(payload)
    return try jsonDecoder.decode(type, from: data)
  }

  private func relayAPIError<Payload: Encodable>(statusCode: Int, payload: Payload) -> RelayAPIError {
    do {
      let errorResponse = try convertPayload(payload, as: RelayErrorResponse.self)
      return RelayAPIError(statusCode: statusCode, message: errorResponse.error)
    } catch {
      return RelayAPIError(statusCode: statusCode, message: "Relay request failed with status \(statusCode).")
    }
  }

  private func undocumentedRelayAPIError(statusCode: Int) -> RelayAPIError {
    RelayAPIError(statusCode: statusCode, message: "Relay request failed with status \(statusCode).")
  }
}
