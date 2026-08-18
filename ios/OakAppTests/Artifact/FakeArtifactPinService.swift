import Foundation

@testable import OakApp

/// In-memory ``ArtifactPinService`` test double (PIN-US-1–3). Cap 5, refuse
/// the 6th. Guest callers are recorded but return an empty / unauthorized
/// result so the VM can hide the strip.
///
/// `@unchecked Sendable`: tests drive it serially from the main actor.
final class FakeArtifactPinService: ArtifactPinService, @unchecked Sendable {
  var store: [PinnedArtifactSummary]
  var snapshots: [String: Artifact]
  var createError: ArtifactPinError?
  var listError: OakError?

  private(set) var listCount = 0
  private(set) var createCount = 0
  private(set) var deleteCount = 0
  private(set) var getCount = 0
  private(set) var lastConversationId: String?
  private(set) var lastCreatedKind: ArtifactPinKind?
  private(set) var lastDeletedId: String?

  init(seed: [PinnedArtifactSummary] = [], snapshots: [String: Artifact] = [:]) {
    self.store = seed
    self.snapshots = snapshots
  }

  func list(conversationId: String) async -> [PinnedArtifactSummary] {
    listCount += 1
    lastConversationId = conversationId
    if listError != nil { return [] }
    return store
  }

  func create(
    conversationId: String,
    kind: ArtifactPinKind,
    title: String,
    snapshot: Artifact
  ) async -> ArtifactPinCreateResult {
    createCount += 1
    lastConversationId = conversationId
    lastCreatedKind = kind
    if let createError { return .failure(createError) }
    if store.count >= 5 { return .failure(.pinCap(max: 5)) }
    let pin = PinnedArtifactSummary(
      id: "pin-\(store.count + 1)",
      kind: kind,
      title: title,
      createdAt: Int64(store.count + 1)
    )
    store.append(pin)
    snapshots[pin.id] = snapshot
    return .success(pin: pin, pinnedArtifacts: store)
  }

  func get(conversationId: String, pinId: String) async -> Artifact? {
    getCount += 1
    lastConversationId = conversationId
    return snapshots[pinId]
  }

  func delete(conversationId: String, pinId: String) async -> [PinnedArtifactSummary] {
    deleteCount += 1
    lastConversationId = conversationId
    lastDeletedId = pinId
    store.removeAll { $0.id == pinId }
    snapshots[pinId] = nil
    return store
  }
}
