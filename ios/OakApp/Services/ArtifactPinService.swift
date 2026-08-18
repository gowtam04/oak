import Foundation

enum ArtifactPinKind: String, Codable, Sendable, Equatable {
  case teamSheet = "team_sheet"
  case comparison
  case calc
}

struct PinnedArtifactSummary: Codable, Sendable, Equatable, Identifiable {
  let id: String
  let kind: ArtifactPinKind
  let title: String
  let createdAt: Int64

  enum CodingKeys: String, CodingKey {
    case id
    case kind
    case title
    case createdAt = "created_at"
  }
}

enum ArtifactPinError: Equatable, Sendable {
  case pinCap(max: Int)
  case unauthorized
  case failed
}

enum ArtifactPinCreateResult: Equatable, Sendable {
  case success(pin: PinnedArtifactSummary, pinnedArtifacts: [PinnedArtifactSummary])
  case failure(ArtifactPinError)
}

/// Conversation artifact pins (PIN-US-1–3). Never throws — guests / misses fold
/// to empty / failure so the strip can hide.
protocol ArtifactPinService: Sendable {
  func list(conversationId: String) async -> [PinnedArtifactSummary]
  func create(
    conversationId: String,
    kind: ArtifactPinKind,
    title: String,
    snapshot: Artifact
  ) async -> ArtifactPinCreateResult
  func get(conversationId: String, pinId: String) async -> Artifact?
  func delete(conversationId: String, pinId: String) async -> [PinnedArtifactSummary]
}

enum ArtifactPinEndpoints {
  static func list(conversationId: String) -> Endpoint {
    Endpoint(
      method: .get,
      path: "/api/conversations/\(conversationId)/artifact-pins",
      requiresAuth: true
    )
  }

  static func create(conversationId: String, body: CreatePinBody) -> Endpoint {
    Endpoint(
      method: .post,
      path: "/api/conversations/\(conversationId)/artifact-pins",
      body: body,
      requiresAuth: true
    )
  }

  static func get(conversationId: String, pinId: String) -> Endpoint {
    Endpoint(
      method: .get,
      path: "/api/conversations/\(conversationId)/artifact-pins/\(pinId)",
      requiresAuth: true
    )
  }

  static func delete(conversationId: String, pinId: String) -> Endpoint {
    Endpoint(
      method: .delete,
      path: "/api/conversations/\(conversationId)/artifact-pins/\(pinId)",
      requiresAuth: true
    )
  }
}

struct CreatePinBody: Encodable, Sendable {
  let kind: ArtifactPinKind
  let title: String
  let snapshot: PinSnapshotWire
}

struct PinSnapshotWire: Codable, Sendable, Equatable {
  let title: String
  let kind: String
  let payload: JSONValue
}

struct PinnedArtifactsListResponse: Decodable, Sendable {
  let pinnedArtifacts: [PinnedArtifactSummary]
}

struct CreatePinResponse: Decodable, Sendable {
  let pin: PinnedArtifactSummary
  let pinnedArtifacts: [PinnedArtifactSummary]
}

struct GetPinResponse: Decodable, Sendable {
  let pin: GetPinPayload
}

struct GetPinPayload: Decodable, Sendable {
  let id: String
  let kind: ArtifactPinKind
  let title: String
  let snapshot: JSONValue?
}

struct LiveArtifactPinService: ArtifactPinService {
  private let apiClient: OakAPIClient

  init(apiClient: OakAPIClient) {
    self.apiClient = apiClient
  }

  func list(conversationId: String) async -> [PinnedArtifactSummary] {
    do {
      let body = try await apiClient.send(
        ArtifactPinEndpoints.list(conversationId: conversationId),
        as: PinnedArtifactsListResponse.self
      )
      return body.pinnedArtifacts
    } catch {
      return []
    }
  }

  func create(
    conversationId: String,
    kind: ArtifactPinKind,
    title: String,
    snapshot: Artifact
  ) async -> ArtifactPinCreateResult {
    let body = CreatePinBody(
      kind: kind,
      title: title,
      snapshot: PinSnapshotWire(
        title: snapshot.title,
        kind: kind.rawValue,
        payload: .object([:])
      )
    )
    do {
      let response = try await apiClient.send(
        ArtifactPinEndpoints.create(conversationId: conversationId, body: body),
        as: CreatePinResponse.self
      )
      return .success(pin: response.pin, pinnedArtifacts: response.pinnedArtifacts)
    } catch OakError.http(let status, let code, _) where status == 409 || code == "pin_cap" {
      return .failure(.pinCap(max: 5))
    } catch OakError.unauthorized {
      return .failure(.unauthorized)
    } catch {
      return .failure(.failed)
    }
  }

  func get(conversationId: String, pinId: String) async -> Artifact? {
    do {
      let response = try await apiClient.send(
        ArtifactPinEndpoints.get(conversationId: conversationId, pinId: pinId),
        as: GetPinResponse.self
      )
      return Artifact(title: response.pin.title, content: .loading)
    } catch {
      return nil
    }
  }

  func delete(conversationId: String, pinId: String) async -> [PinnedArtifactSummary] {
    do {
      let body = try await apiClient.send(
        ArtifactPinEndpoints.delete(conversationId: conversationId, pinId: pinId),
        as: PinnedArtifactsListResponse.self
      )
      return body.pinnedArtifacts
    } catch {
      return []
    }
  }
}
