import SwiftUI

/// A Pokémon sprite loaded from a remote URL, with loading, failure, and
/// missing-URL states.
///
/// Sprite art arrives from the backend as absolute URLs on the answer payload
/// (`Subject.spriteUrl`, `CandidateRow.spriteUrl`, `PokemonArtifactData.spriteUrl`)
/// — Oak serves alternate forms their own Showdown-CDN sprites, so these are small
/// pixel-art images. Base forms are static PNGs; alternate formes (Megas, Primals,
/// regionals) are **animated GIFs**. `AsyncImage` renders only a GIF's first frame,
/// so this hand-rolls the load: fetch the bytes, decode with ``SpriteDecoder``, and
/// render an animated `UIImage` via ``AnimatedSpriteView`` for a multi-frame GIF or a
/// plain SwiftUI `Image` for anything static. It keeps `AsyncImage`'s graceful states
/// — a placeholder while a URL is absent or the fetch fails (M-AC-1.4) and a spinner
/// while loading — and reuses the same rendering (`.interpolation(.none)` /
/// nearest-neighbor) so static sprites look byte-for-byte as before.
///
/// Reduce Motion: when `accessibilityReduceMotion` is on, an animated sprite renders
/// as its static first frame instead of playing.
///
/// Caching: relies on `URLSession.shared`'s default `URLCache` — sprite payloads
/// are tiny and the system disk/memory cache is sufficient; no bespoke cache layer.
///
/// Accessibility: the view is a single element labeled with the entity name, so
/// VoiceOver announces the subject ("Garchomp") even when only the placeholder is
/// showing — the picture is never the sole carrier of meaning (M-AC-UI9.3). The
/// frame scales with Dynamic Type via `@ScaledMetric` so it grows alongside
/// surrounding text instead of clipping (M-UI-US-9).
struct SpriteImage: View {
  /// The sprite art URL; `nil` (e.g. an absent `sprite_url`) renders the placeholder.
  let url: URL?
  /// The entity name, used verbatim as the VoiceOver accessibility label.
  let name: String

  /// The square render edge in points, scaled with the user's Dynamic Type setting.
  @ScaledMetric private var edge: CGFloat

  /// True when the user has asked the system to reduce/disable motion — an animated
  /// sprite then shows its static first frame. Read here (not in `init`, where the
  /// environment is unavailable) so a change re-evaluates `body` and swaps the render.
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// The current load state. Kept as one value so a Reduce-Motion toggle re-picks the
  /// render (still vs. animated) from the already-decoded result without re-fetching.
  @State private var phase: Phase = .loading

  private enum Phase {
    case loading
    case loaded(SpriteDecoder.Decoded)
    case failed
  }

  /// - Parameters:
  ///   - url: The sprite URL, or `nil` to show the placeholder.
  ///   - name: The entity name for the accessibility label.
  ///   - size: The base square edge in points (scaled with Dynamic Type).
  init(url: URL?, name: String, size: CGFloat = 56) {
    self.url = url
    self.name = name
    self._edge = ScaledMetric(wrappedValue: size)
  }

  var body: some View {
    Group {
      if url == nil {
        placeholder
      } else {
        content
      }
    }
    .frame(width: edge, height: edge)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(Text(name))
    .accessibilityAddTraits(.isImage)
    // `.task(id: url)` cancels the in-flight load and restarts when the sprite URL
    // changes (a recycled row), so a stale response can never clobber the current URL.
    .task(id: url) { await load(url) }
  }

  /// The image surface for a non-nil URL, chosen by the current load ``Phase``.
  @ViewBuilder private var content: some View {
    switch phase {
    case .loading:
      ProgressView()
    case .failed:
      placeholder
    case .loaded(.still(let image)):
      staticImage(image)
    case .loaded(.animated(let animation)):
      if reduceMotion {
        staticImage(animation.firstFrame)  // honor Reduce Motion: freeze on frame 0
      } else {
        AnimatedSpriteView(image: animation.image)
      }
    }
  }

  /// The static render — identical to the pre-animation behavior: crisp (no
  /// interpolation), resizable, aspect-fit within the square frame.
  private func staticImage(_ image: UIImage) -> some View {
    Image(uiImage: image)
      .interpolation(.none)  // keep pixel-art crisp when upscaled
      .resizable()
      .scaledToFit()
  }

  /// Fetches the sprite bytes and decodes them off the main actor, publishing the
  /// result back on the main actor (this closure runs `@MainActor` via `.task`). A
  /// cancellation (superseding URL) leaves the state to the newer task.
  private func load(_ url: URL?) async {
    guard let url else { return }  // nil URL renders the placeholder directly in `body`
    phase = .loading
    do {
      let (data, _) = try await URLSession.shared.data(from: url)
      let decoded = await Task.detached(priority: .userInitiated) {
        SpriteDecoder.decode(data)
      }.value
      try Task.checkCancellation()
      phase = decoded.map(Phase.loaded) ?? .failed
    } catch is CancellationError {
      // Superseded by a newer URL — the restarted task owns the state now.
    } catch {
      if !Task.isCancelled { phase = .failed }
    }
  }

  /// The no-image surface — a rounded tile carrying an SF Symbol so the empty state
  /// reads as "image unavailable" rather than a blank gap.
  private var placeholder: some View {
    RoundedRectangle(cornerRadius: Theme.Radius.sm, style: .continuous)
      .fill(Theme.surface)
      .overlay {
        Image(systemName: "photo")
          .font(.system(size: edge * 0.4))
          .foregroundStyle(Theme.textMuted)
      }
  }
}

extension SpriteImage {
  /// Convenience for the common case where the sprite URL arrives as a wire
  /// `String` (optional, since `CandidateRow.spriteUrl` may be absent). An empty,
  /// whitespace-only, or malformed string maps to the placeholder.
  init(urlString: String?, name: String, size: CGFloat = 56) {
    let url =
      urlString
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .flatMap { $0.isEmpty ? nil : URL(string: $0) }
    self.init(url: url, name: name, size: size)
  }
}

#Preview {
  HStack(spacing: 16) {
    SpriteImage(
      url: URL(string: "https://example.com/missing.png"),
      name: "Garchomp"
    )
    SpriteImage(url: nil, name: "Unknown")
    SpriteImage(urlString: "  ", name: "Empty string", size: 40)
  }
  .padding()
}
