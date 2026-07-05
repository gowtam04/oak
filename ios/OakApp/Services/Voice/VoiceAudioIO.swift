import AVFoundation
import Foundation
import OSLog

/// Real-time audio capture + playback for voice mode — a faithful Swift port of
/// the web client's `VoiceAudioIO` seam (`web/src/lib/voice/voice-session.ts`),
/// with mic capture surfaced as an `AsyncStream` of base64 PCM16 frames (the web
/// passes an `onChunk` callback instead).
///
/// `@MainActor`: every conformer (the live `AVAudioEngine` stack and the test
/// fake) is driven exclusively from ``VoiceSession`` (itself `@MainActor`), and
/// the live stack's `enqueue`/`flush`/`stopCapture`/`close` are synchronous — a
/// non-isolated `Sendable` protocol can't be satisfied by main-actor-confined
/// AVFoundation objects (they'd cross isolation domains). Isolating the protocol
/// keeps the whole audio seam on the main actor, matching how the session already
/// calls it. (Was `Sendable`; promoted to `@MainActor` for the live task.)
@MainActor
protocol VoiceAudioIO {
  /// The capture/playback sample rate — one of xAI's supported PCM rates (see
  /// ``VoicePCM/supportedSampleRates``). Sent to the server in `session.update`.
  var sampleRate: Int { get }

  /// Begin mic capture. The returned stream yields ~100 ms base64 PCM16 chunks
  /// until ``stopCapture()`` (or ``close()``) finishes it.
  func startCapture() async throws -> AsyncStream<String>

  /// Stop mic capture and release the microphone, finishing the capture stream.
  func stopCapture()

  /// Queue one base64 PCM16 chunk for gapless playback.
  func enqueue(_ base64: String)

  /// Stop and clear ALL queued/playing audio immediately (barge-in).
  func flush()

  /// Tear down capture, playback, and the audio session entirely.
  func close()
}

// MARK: - Live implementation

/// Errors from the live audio stack surfaced to ``VoiceSession`` (which maps any
/// `startCapture` throw to "Microphone unavailable.").
enum VoiceAudioError: Error {
  /// The input format couldn't be resolved or a converter to PCM16 @ 24 kHz
  /// couldn't be built — capture cannot proceed.
  case captureUnavailable
}

/// Production ``VoiceAudioIO`` over `AVAudioEngine` — the only place in the app
/// that touches the device audio stack. A faithful port of the web client's
/// `BrowserVoiceAudioIO` (`web/src/lib/voice/audio-io.ts`), reshaped for
/// AVFoundation:
///
/// - **Capture:** an input tap on the engine's native format, resampled by ONE
///   reused `AVAudioConverter` to Int16/mono/24 kHz, batched into 100 ms base64
///   chunks (``VoiceChunkAccumulator``) and yielded to the capture stream.
/// - **Playback:** a single `AVAudioPlayerNode` on the main mixer; enqueued
///   buffers schedule back-to-back for gapless output. ``flush()`` stops-then-
///   replays for barge-in.
///
/// `@MainActor`: every AVFoundation object is confined here; the ONLY off-actor
/// code is the render-thread tap, which runs the `nonisolated static processTap`
/// helper via an explicitly `@Sendable` block — so the compiler, not luck, keeps
/// the main actor off AVFAudio's realtime thread. It touches only the Sendable
/// lock + continuation and a `@unchecked Sendable` converter box.
@MainActor
final class LiveVoiceAudioIO: VoiceAudioIO {
  /// 24 kHz — an xAI-supported rate, half the payload of 48 kHz, speech-optimal.
  let sampleRate = 24_000

  private let engine = AVAudioEngine()
  private let playerNode = AVAudioPlayerNode()
  private let playbackFormat: AVAudioFormat

  /// Called on the main actor when the OS interrupts audio (e.g. a phone call);
  /// the UI wires it to end the session. Set before ``startCapture()``.
  var onInterruption: (@MainActor () -> Void)?

  private var captureConverter: CaptureConverter?
  private var captureContinuation: AsyncStream<String>.Continuation?
  private var capturing = false
  private var graphConfigured = false
  private var closed = false
  private var interruptionObserver: NSObjectProtocol?

  init() {
    // Float32 mono @ 24 kHz; the engine converts to the hardware rate downstream.
    playbackFormat = AVAudioFormat(standardFormatWithSampleRate: Double(sampleRate), channels: 1)!
  }

  // MARK: Capture

  func startCapture() async throws -> AsyncStream<String> {
    let audioSession = AVAudioSession.sharedInstance()
    // .voiceChat gives hardware echo cancellation + AGC (the web set these via
    // getUserMedia constraints); default to speaker and allow Bluetooth headsets.
    try audioSession.setCategory(
      .playAndRecord,
      mode: .voiceChat,
      options: [.defaultToSpeaker, .allowBluetoothHFP]
    )
    try? audioSession.setPreferredSampleRate(Double(sampleRate))
    try audioSession.setActive(true)

    registerInterruptionObserver()
    configureGraph()

    let input = engine.inputNode
    // NEVER fabricate the tap format — use the input node's native output format,
    // or a mismatch is a hard runtime crash.
    let nativeFormat = input.outputFormat(forBus: 0)
    guard
      let targetFormat = AVAudioFormat(
        commonFormat: .pcmFormatInt16,
        sampleRate: Double(sampleRate),
        channels: 1,
        interleaved: true
      ),
      let converter = CaptureConverter(from: nativeFormat, to: targetFormat)
    else {
      throw VoiceAudioError.captureUnavailable
    }
    captureConverter = converter

    // Extract the continuation without capturing `self` in the builder closure.
    var continuation: AsyncStream<String>.Continuation!
    let stream = AsyncStream<String> { continuation = $0 }
    captureContinuation = continuation

    // Render-thread state: a lock-guarded accumulator + the Sendable continuation.
    // The converter box is @unchecked Sendable (tap is its sole, serial caller).
    let accumulator = OSAllocatedUnfairLock(initialState: VoiceChunkAccumulator(sampleRate: sampleRate))
    let sink = continuation!
    // AVFAudio invokes the tap on its realtime render thread, NOT the main actor.
    // Binding the block to an explicitly `@Sendable` type and delegating to the
    // `nonisolated static processTap` helper makes the compiler REJECT any main-
    // actor touch on this path — a bare closure formed in this `@MainActor` method
    // would instead inherit main-actor isolation and trap (`dispatch_assert_queue`)
    // on the first buffer off-main. Same bufferSize/format/bus as before.
    let tapBlock: @Sendable (AVAudioPCMBuffer, AVAudioTime) -> Void = { buffer, _ in
      LiveVoiceAudioIO.processTap(buffer: buffer, converter: converter, accumulator: accumulator, sink: sink)
    }
    input.installTap(onBus: 0, bufferSize: 4096, format: nativeFormat, block: tapBlock)

    engine.prepare()
    try engine.start()
    playerNode.play()
    capturing = true
    return stream
  }

  /// The render-thread tap body, hoisted into a compiler-checked `nonisolated`
  /// context. AVFAudio calls the installed tap on its realtime render thread; a
  /// closure formed inside `@MainActor startCapture()` would inherit main-actor
  /// isolation at runtime and trap there on the first buffer, so the body lives
  /// here where the compiler forbids any main-actor touch. Every parameter is
  /// `Sendable` (the converter box is `@unchecked Sendable`, the lock and the
  /// continuation are `Sendable`), so nothing crosses an isolation boundary.
  nonisolated static func processTap(
    buffer: AVAudioPCMBuffer,
    converter: CaptureConverter,
    accumulator: OSAllocatedUnfairLock<VoiceChunkAccumulator>,
    sink: AsyncStream<String>.Continuation
  ) {
    let samples = converter.convert(buffer)
    guard !samples.isEmpty else { return }
    let chunks = accumulator.withLock { $0.append(samples) }
    for chunk in chunks { sink.yield(chunk) }
  }

  func stopCapture() {
    if capturing {
      engine.inputNode.removeTap(onBus: 0)
      capturing = false
    }
    captureConverter = nil
    captureContinuation?.finish()
    captureContinuation = nil
  }

  // MARK: Playback

  func enqueue(_ base64: String) {
    guard !closed else { return }
    let floats = VoicePCM.int16ToFloat32(VoicePCM.base64ToInt16(base64))
    guard
      !floats.isEmpty,
      let buffer = AVAudioPCMBuffer(pcmFormat: playbackFormat, frameCapacity: AVAudioFrameCount(floats.count)),
      let channel = buffer.floatChannelData
    else { return }
    buffer.frameLength = AVAudioFrameCount(floats.count)
    floats.withUnsafeBufferPointer { src in
      channel[0].update(from: src.baseAddress!, count: floats.count)
    }

    ensureEngineRunning()
    // Back-to-back scheduling is gapless as long as the queue doesn't drain.
    playerNode.scheduleBuffer(buffer)
    if !playerNode.isPlaying { playerNode.play() }
  }

  func flush() {
    // Barge-in: stop() clears ALL scheduled buffers and resets the node; the
    // immediate re-play() re-arms it so subsequent enqueues schedule cleanly.
    // Skipping the re-play is the #1 gotcha — playback stays dead after one flush.
    playerNode.stop()
    if engine.isRunning { playerNode.play() }
  }

  // MARK: Teardown

  func close() {
    guard !closed else { return }
    closed = true
    stopCapture()
    playerNode.stop()
    if engine.isRunning { engine.stop() }
    removeInterruptionObserver()
    // Deactivate AFTER stopping the engine, and let other apps' audio resume.
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
  }

  // MARK: Engine graph

  private func configureGraph() {
    guard !graphConfigured else { return }
    engine.attach(playerNode)
    engine.connect(playerNode, to: engine.mainMixerNode, format: playbackFormat)
    graphConfigured = true
  }

  private func ensureEngineRunning() {
    guard !closed else { return }
    configureGraph()
    if !engine.isRunning {
      engine.prepare()
      try? engine.start()
    }
  }

  // MARK: Interruptions

  private func registerInterruptionObserver() {
    guard interruptionObserver == nil else { return }
    interruptionObserver = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification,
      object: AVAudioSession.sharedInstance(),
      queue: .main
    ) { [weak self] note in
      guard
        let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
        let type = AVAudioSession.InterruptionType(rawValue: raw)
      else { return }
      // Delivered on the main queue → safe to assume main-actor isolation.
      MainActor.assumeIsolated {
        self?.handleInterruption(type)
      }
    }
  }

  private func removeInterruptionObserver() {
    if let interruptionObserver {
      NotificationCenter.default.removeObserver(interruptionObserver)
      self.interruptionObserver = nil
    }
  }

  private func handleInterruption(_ type: AVAudioSession.InterruptionType) {
    // Only .began matters: hardware took audio away. Tear down capture so we stop
    // feeding dead frames, then let the UI end the session. Route changes are
    // left to the engine (no code beyond not crashing).
    guard type == .began else { return }
    Log.chat.info("voice audio interrupted — ending capture")
    stopCapture()
    flush()
    onInterruption?()
  }
}

/// Confines the stateful `AVAudioConverter` (+ its target format) to the audio
/// render thread. `@unchecked Sendable`: the tap block is its ONLY caller and the
/// render thread invokes it serially, so the converter is never touched
/// concurrently — the same serial-access rationale as the voice test fakes.
final class CaptureConverter: @unchecked Sendable {
  private let converter: AVAudioConverter
  private let targetFormat: AVAudioFormat
  private let ratio: Double

  init?(from sourceFormat: AVAudioFormat, to targetFormat: AVAudioFormat) {
    guard let converter = AVAudioConverter(from: sourceFormat, to: targetFormat) else { return nil }
    self.converter = converter
    self.targetFormat = targetFormat
    self.ratio = targetFormat.sampleRate / sourceFormat.sampleRate
  }

  /// Resample one native input buffer to Int16/mono/target-rate samples. Reuses
  /// the converter across calls (it's stateful across resampling).
  func convert(_ input: AVAudioPCMBuffer) -> [Int16] {
    // frames out ≈ frames in × (targetRate / sourceRate), with headroom.
    let capacity = AVAudioFrameCount(Double(input.frameLength) * ratio) + 1024
    guard
      capacity > 0,
      let output = AVAudioPCMBuffer(pcmFormat: targetFormat, frameCapacity: capacity)
    else { return [] }

    // The converter's input block is `@Sendable`; feed the (non-Sendable) buffer
    // exactly once through a confinement box so the closure captures only Sendable
    // state. The block runs synchronously on this thread inside `convert`.
    let feed = FeedBox(input)
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
      guard let buffer = feed.take() else {
        inputStatus.pointee = .noDataNow
        return nil
      }
      inputStatus.pointee = .haveData
      return buffer
    }

    guard
      status != .error,
      output.frameLength > 0,
      let channel = output.int16ChannelData
    else { return [] }
    return Array(UnsafeBufferPointer(start: channel[0], count: Int(output.frameLength)))
  }
}

/// One-shot confinement box for feeding a non-Sendable `AVAudioPCMBuffer` into the
/// converter's `@Sendable` input block. `@unchecked Sendable`: created and drained
/// synchronously on the render thread within a single `convert` call.
private final class FeedBox: @unchecked Sendable {
  private var buffer: AVAudioPCMBuffer?
  init(_ buffer: AVAudioPCMBuffer) { self.buffer = buffer }

  /// Return the buffer once, then `nil` on every subsequent call.
  func take() -> AVAudioPCMBuffer? {
    defer { buffer = nil }
    return buffer
  }
}
