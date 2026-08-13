import SwiftUI
import UIKit

/// The top-level renderer for a single finalized ``OakAnswer`` — the native mirror
/// of the web `AnswerCard` (`web/src/components/answer-card/AnswerCard.tsx`). It
/// fans each field of the payload out to its mapped leaf subview, **invoking a
/// subview only when its field is present** (the render-if-present rule the whole
/// AnswerCard tree follows), in a single reading order (M-AC-1.2 / M-BR-CHAT-5 —
/// every field the web renders is represented; nothing is dropped for brevity):
///
///   1. status badge        ← non-`answered` outcomes only (M-AC-1.3)
///   2. scope tag            ← `generation_basis` — the always-on masthead tag (TOP)
///   3. caveat strip         ← `uncertainty_flags[]` + `generation_basis.fallback`/note (TOP)
///   4. answer markdown      ← `answer_markdown` (always; first paragraph as answerLead)
///   5. subjects             ← `subjects[]` (+ "Compare in viewer" when ≥2)
///   6. clarify question     ← `question.options[]` — the "stop and ask" CTA
///   7. candidates           ← `candidates` (+ "Show all N" when truncated)
///   8. damage calc          ← `damage_calc` (+ "Open in viewer")
///   9. team blocks          ← `proposed_team` / `saved_team` (+ warnings)
///  10. suggestions          ← `suggestions[]` (+ status)
///  11. inferences           ← `inferences[]`
///  12. receipts footer      ← `reasoning_markdown` + `citations[]` — plate foot
///
/// The scope tag and caveat strip are lifted to the TOP to mirror the web
/// `AnswerCard` (masthead + `CaveatStrip` lead the card): a caveat is read before
/// the prose it qualifies, and the fallback note + `uncertainty_flags[]` are merged
/// into ONE `CaveatStripView` (they used to render as two separate blocks near the
/// bottom).
///
/// The whole card is a **specimen plate** (soul.md): type-reactive wash / multi /
/// mechanics ink chrome from `subjects[].types`, with a RECEIPTS footer at the foot.
///
/// Interactivity: a clarify-option or suggestion tap sends its text **verbatim**
/// as the next user turn via ``onFollowUp`` (the same UI→agent-input mechanism the
/// web uses). The team-block actions (``onApplyTeam`` / ``onOpenSavedTeam``)
/// default to no-ops here — Apply is wired in P10 and the saved-team open by the
/// artifact phase — so this orchestrator builds today and those phases attach a
/// handler without restructuring.
///
/// Which blocks render is exposed as the pure ``sections`` list so the orchestration
/// is unit-testable without a third-party view-inspection package (ADR-5): `body`
/// renders exactly `sections`, and the tests assert presence/absence/order over it.
struct AnswerCardView: View {
  let answer: OakAnswer

  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  /// Flips once, on this view instance's first appearance, to drive the one-shot
  /// entrance cascade below — never reset, so re-layout/scroll never re-plays it.
  @State private var hasAppeared = false

  /// Flips once, on first appearance, to drive the "reading latches" finalize
  /// moment (soul.md §3 Motion signature moment): the masthead status glyph
  /// red→green and the plate's type edge+glow fading in, over `Theme.Motion.latch`
  /// (~300ms). A separate flag from ``hasAppeared`` (which drives the per-section
  /// stagger) so the two one-shot moments stay independently tunable.
  @State private var hasLatched = false

  /// Sends the given text verbatim as the next user turn (clarify options +
  /// suggestion chips). Defaults to a no-op so the card renders in isolation.
  var onFollowUp: (String) -> Void = { _ in }

  /// Saves a proposed team to the user's Teams. Wired in P10; no-op until then.
  var onApplyTeam: (ProposedTeam) -> Void = { _ in }

  /// Opens a saved team in the artifact viewer. Wired by the artifact phase; no-op
  /// until then.
  var onOpenSavedTeam: (SavedTeamRef) -> Void = { _ in }

  /// Opens an entity (a Pokémon shown as a subject) in the artifact viewer
  /// (M-ART-US-1). Only entities in a STRUCTURED part of the answer are openable
  /// (M-BR-ART-3). Defaults to a no-op so the card renders in isolation; the chat
  /// host wires it to ``ArtifactViewModel/openEntity(kind:query:)``.
  var onOpenEntity: (EntityKind, String) -> Void = { _, _ in }

  /// Opens the agent's proposed team in the artifact viewer using its INLINE data —
  /// no fetch (M-AC-A4.1). Defaults to a no-op; the chat host wires it to
  /// ``ArtifactViewModel/openProposedTeam(_:warnings:)``.
  var onOpenProposedTeam: (ProposedTeam, [TeamWarning]) -> Void = { _, _ in }

  /// Opens a side-by-side **comparison** of the answer's subjects in the artifact
  /// viewer, from the committed payload — no fetch (mirrors web's "Compare in
  /// viewer", `AnswerCard.tsx` → `openStructured({ kind: "comparison" })`). Wired to
  /// ``ArtifactViewModel/openComparison(_:)``; no-op default.
  var onOpenComparison: ([Subject]) -> Void = { _ in }

  /// Opens the answer's damage calculation in the artifact viewer, from the committed
  /// payload — no fetch (mirrors web's "Open in viewer" on the DamageReadout,
  /// `openStructured({ kind: "damage-calc" })`). Wired to
  /// ``ArtifactViewModel/openDamageCalc(_:)``; no-op default.
  var onOpenDamageCalc: (DamageCalc) -> Void = { _ in }

  /// Plate atmosphere from the answer's subjects (typed / multi / mechanics ink).
  private var plateAtmosphere: Theme.PlateAtmosphere {
    Theme.PlateAtmosphere.resolve(
      subjectTypes: (answer.subjects ?? []).map(\.types)
    )
  }

  /// Feedback after "Copy for agents" (soul.md Phase 3.2).
  @State private var didCopyForAgents = false

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      // Plate body — everything except the receipts foot tab.
      VStack(alignment: .leading, spacing: 14) {
        ForEach(Array(bodySections.enumerated()), id: \.element) { index, section in
          view(for: section)
            .opacity(hasAppeared ? 1 : 0)
            .offset(y: hasAppeared ? 0 : 6)
            .animation(
              reduceMotion ? nil : Theme.Motion.staggered(index), value: hasAppeared
            )
        }
      }
      .padding(Theme.Spacing.lg)
      .frame(maxWidth: .infinity, alignment: .leading)

      // Full-width RECEIPTS footer (soul.md) — only when reasoning/citations present.
      if hasReceipts {
        ReceiptsFooterView(
          reasoningMarkdown: answer.reasoningMarkdown,
          citations: answer.citations,
          onOpenEntity: onOpenEntity,
          onCopyForAgents: copyForAgents
        )
        .opacity(hasAppeared ? 1 : 0)
        .animation(
          reduceMotion ? nil : Theme.Motion.staggered(bodySections.count),
          value: hasAppeared
        )
      } else {
        // No receipts: still expose machine export on the plate foot strip.
        copyForAgentsStrip
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    // The plate's type edge+glow fades in with the latch moment; the flat
    // fill/border stay always visible (see `revealed` on the modifier).
    .oakSpecimenPlate(plateAtmosphere, revealed: hasLatched)
    .animation(reduceMotion ? nil : Theme.Motion.latch, value: hasLatched)
    .overlay(alignment: .topLeading) {
      mastheadStatusDot
        .padding(10)
    }
    .contextMenu {
      Button {
        copyForAgents()
      } label: {
        Label("Copy for agents", systemImage: "doc.on.clipboard")
      }
    }
    // The whole answer reads as one VoiceOver container with ordered children.
    .accessibilityElement(children: .contain)
    .onAppear {
      hasAppeared = true
      hasLatched = true
    }
  }

  // MARK: Masthead status dot ("the reading latches" — soul.md §3 Motion)

  /// The masthead's record-light dot: red until the card latches, then the
  /// resolved status's own color (green for `answered`, the status badge's tint
  /// otherwise) — the one-shot finalize moment (M-AC "reading latches"). Purely
  /// decorative; the status badge/text already carries the outcome for
  /// VoiceOver (M-AC-UI9.3), so this is hidden from the accessibility tree.
  private var mastheadStatusDot: some View {
    let color = hasLatched ? statusColor : Theme.accent
    return Circle()
      .fill(color)
      .frame(width: 6, height: 6)
      .shadow(color: color.opacity(0.5), radius: hasLatched ? 0 : 4)
      .animation(reduceMotion ? nil : Theme.Motion.latch, value: hasLatched)
      .accessibilityHidden(true)
  }

  /// Compact plate-foot strip when there are no receipts to expand.
  private var copyForAgentsStrip: some View {
    Button(action: copyForAgents) {
      HStack(spacing: Theme.Spacing.sm) {
        Text(didCopyForAgents ? "Copied" : "Copy for agents")
          .instrumentLabel()
          .foregroundStyle(didCopyForAgents ? Theme.success : Theme.textSecondary)
        Spacer(minLength: 0)
        Image(systemName: didCopyForAgents ? "checkmark" : "doc.on.clipboard")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(didCopyForAgents ? Theme.success : Theme.textMuted)
      }
      .padding(.horizontal, Theme.Spacing.lg)
      .padding(.vertical, Theme.Spacing.md)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .background(Theme.surfaceSunken.opacity(0.65))
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.border.opacity(0.9))
        .frame(height: 1)
    }
    .accessibilityLabel(didCopyForAgents ? "Copied for agents" : "Copy for agents")
    .accessibilityHint("Copies a distilled markdown version of this answer to the clipboard")
  }

  private func copyForAgents() {
    let markdown = OakAnswerAgentMarkdown.build(answer)
    UIPasteboard.general.string = markdown
    Haptics.tap()
    didCopyForAgents = true
    // Reset the "Copied" label after a beat so the control stays reusable.
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2))
      didCopyForAgents = false
    }
  }

  /// Sections rendered inside the plate body (everything except receipts).
  private var bodySections: [Section] {
    sections.filter { $0 != .receipts }
  }

  // MARK: Section model (testable orchestration seam)

  /// One renderable block of the answer card. Each case maps 1:1 to a leaf subview
  /// (or, for `status`/`answer`, an inline element), so a test can assert which
  /// blocks an answer produces without inspecting the SwiftUI hierarchy.
  enum Section: Hashable {
    case status
    case scope
    case caveat
    case answer
    case subjects
    case question
    case candidates
    case damageCalc
    case teams
    case suggestions
    case inferences
    /// Full-width RECEIPTS footer at the plate foot (soul.md). Present when
    /// EITHER reasoning OR citations (or both) is non-empty. Replaces the former
    /// free-floating credibility chip strip.
    case receipts
  }

  /// The ordered blocks this card renders for ``answer`` — the single source of
  /// truth `body` iterates. A block is included only when its field is present
  /// (and non-empty after the same trimming its subview applies), so an absent
  /// field renders nothing. Receipts always trail (plate foot).
  var sections: [Section] {
    var out: [Section] = []
    if hasStatus { out.append(.status) }
    if hasScope { out.append(.scope) }
    if hasCaveat { out.append(.caveat) }
    if hasAnswerBody { out.append(.answer) }
    if hasSubjects { out.append(.subjects) }
    if hasQuestion { out.append(.question) }
    if hasCandidates { out.append(.candidates) }
    if hasDamageCalc { out.append(.damageCalc) }
    if hasTeams { out.append(.teams) }
    if hasSuggestions { out.append(.suggestions) }
    if hasInferences { out.append(.inferences) }
    if hasReceipts { out.append(.receipts) }
    return out
  }

  // MARK: Section rendering

  @ViewBuilder
  private func view(for section: Section) -> some View {
    switch section {
    case .status:
      statusBadge
    case .scope:
      ScopeTagView(generationBasis: answer.generationBasis)
    case .caveat:
      CaveatStripView(
        uncertaintyFlags: answer.uncertaintyFlags,
        generationBasis: answer.generationBasis
      )
    case .answer:
      answerContent
    case .subjects:
      // Each subject is an openable entity in a structured part of the answer
      // (M-ART-US-1 / M-BR-ART-3): wrap each card in a tap that pushes its full
      // Pokémon profile onto the viewer, reusing the exact SubjectCard rendering.
      VStack(alignment: .leading, spacing: 10) {
        let subjects = answer.subjects ?? []
        ForEach(Array(subjects.enumerated()), id: \.offset) { _, subject in
          Button {
            onOpenEntity(.pokemon, subject.name)
          } label: {
            SubjectsView(subjects: [subject])
          }
          .buttonStyle(OakPressableButtonStyle())
          .accessibilityHint("Opens \(subject.name)'s full profile")
        }
        // A side-by-side comparison is offered once there are ≥2 subjects (mirrors
        // web's "Compare in viewer"); it opens a structured artifact from THIS
        // committed payload — no fetch (M-AC-A4.1).
        if subjects.count >= 2 {
          Button {
            onOpenComparison(subjects)
          } label: {
            Label("Compare in viewer", systemImage: "rectangle.split.2x1")
              .font(Theme.display(.footnote))
          }
          .buttonStyle(.oakSecondary)
          .accessibilityHint("Opens a side-by-side comparison of these Pokémon")
        }
      }
    case .question:
      ClarifyQuestionView(question: answer.question, onSelect: onFollowUp)
    case .candidates:
      if let candidates = answer.candidates {
        // Each candidate is an openable entity in a structured part of the answer
        // (M-ART-US-1 / M-BR-ART-3): a row opens its Pokémon profile, a type chip
        // opens that type — both pushed onto the viewer's back stack via the host.
        CandidatesTableView(
          candidates: candidates,
          onOpenPokemon: { onOpenEntity(.pokemon, $0) },
          onOpenType: { onOpenEntity(.type, $0) },
          // Truncated sets offer a "Show all N" follow-up, sending the exact
          // request text the web CandidateTable sends (a plain follow-up turn).
          onShowAll: {
            onFollowUp(
              "Show me all \(candidates.totalCount) of those, not just the top \(candidates.shown.count)."
            )
          }
        )
      }
    case .damageCalc:
      if let damageCalc = answer.damageCalc {
        VStack(alignment: .leading, spacing: 10) {
          DamageCalcView(damageCalc: damageCalc)
          // Open the worked calc as a focused artifact from its INLINE data — no
          // fetch (mirrors web's "Open in viewer" on the DamageReadout).
          Button {
            onOpenDamageCalc(damageCalc)
          } label: {
            Label("Open in viewer", systemImage: "rectangle.portrait.and.arrow.right")
              .font(Theme.display(.footnote))
          }
          .buttonStyle(.oakSecondary)
          .accessibilityHint("Opens the damage calculation as a full artifact")
        }
      }
    case .teams:
      VStack(alignment: .leading, spacing: 10) {
        TeamBlocksView(
          proposedTeam: answer.proposedTeam,
          proposedTeamWarnings: answer.proposedTeamWarnings ?? [],
          savedTeam: answer.savedTeam,
          onApply: onApplyTeam,
          onOpenSavedTeam: onOpenSavedTeam
        )
        // A proposed team is a structured, openable block (M-ART-US-2): open it as a
        // focused artifact from its INLINE data (no fetch, M-AC-A4.1).
        if let proposed = answer.proposedTeam {
          Button {
            onOpenProposedTeam(proposed, answer.proposedTeamWarnings ?? [])
          } label: {
            Label("Open team in viewer", systemImage: "rectangle.portrait.and.arrow.right")
              .font(Theme.display(.footnote))
          }
          .buttonStyle(.oakSecondary)
          .accessibilityHint("Opens the proposed team as a full artifact")
        }
      }
    case .suggestions:
      SuggestionsView(
        suggestions: answer.suggestions ?? [],
        status: answer.status,
        onSelect: onFollowUp
      )
    case .inferences:
      InferencesView(inferences: answer.inferences)
    case .receipts:
      // Rendered separately as the plate foot (see `body`); kept here so the
      // section enum stays exhaustive for tests that map 1:1 to subviews.
      EmptyView()
    }
  }

  // MARK: Answer body (verdict + trailing blocks)

  /// Renders `answer_markdown` with the first block styled as `answerLead` when it
  /// is a plain paragraph — the editorial verdict at title3 semibold — and all
  /// subsequent (or non-paragraph first) blocks in the standard body voice. Only a
  /// leading plain paragraph is promoted; headings, tables, and lists are never
  /// upgraded (design §4.04 "first paragraph lead" judgment call).
  @ViewBuilder
  private var answerContent: some View {
    let blocks = MarkdownBlocks.parse(answer.answerMarkdown)
    if case let .paragraph(leadText) = blocks.first {
      // Lead paragraph → answerLead; remainder (if any) falls back to body.
      VStack(alignment: .leading, spacing: 8) {
        MarkdownText(leadText)
          .font(Theme.answerLead())
          .foregroundStyle(Theme.textPrimary)
          .fixedSize(horizontal: false, vertical: true)
          .frame(maxWidth: .infinity, alignment: .leading)
        let tail = Array(blocks.dropFirst())
        if !tail.isEmpty {
          MarkdownBlockView(blocks: tail)
            .font(Theme.body(.body))
            .foregroundStyle(Theme.textPrimary)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
      }
    } else {
      // First block is not a plain paragraph — render everything at body size.
      MarkdownBlockView(answer.answerMarkdown)
        .font(Theme.body(.body))
        .foregroundStyle(Theme.textPrimary)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  // MARK: Status badge (non-`answered` outcomes)

  /// A compact labeled capsule for non-`answered` outcomes: SF symbol + instrument-
  /// voice label so the outcome is never conveyed by color alone (M-AC-UI9.3).
  /// When status is `answered` the verdict speaks — no badge is shown (`hasStatus`
  /// returns false). The capsule background reinforces the semantic color visually
  /// without requiring color to carry the full signal.
  private var statusBadge: some View {
    Label(statusText, systemImage: statusIcon)
      .instrumentLabel()
      .foregroundStyle(statusColor)
      .labelStyle(.titleAndIcon)
      .padding(.horizontal, Theme.Spacing.sm)
      .padding(.vertical, Theme.Spacing.xs)
      .background(statusColor.opacity(0.12), in: Capsule())
      .accessibilityLabel("Status: \(statusText)")
  }

  private var statusText: String {
    switch answer.status {
    case .answered: return "Answered"
    case .clarificationNeeded: return "Needs clarification"
    case .resolutionFailed: return "Couldn't find that"
    case .insufficientData: return "Not enough data"
    // A status this app build doesn't recognize (the wire can widen): show a neutral
    // badge labeled with the humanized raw value rather than dropping the answer.
    case let .unknown(raw): return Self.humanize(raw)
    }
  }

  private var statusIcon: String {
    switch answer.status {
    case .answered: return "checkmark.seal"
    case .clarificationNeeded: return "questionmark.circle"
    case .resolutionFailed: return "magnifyingglass"
    case .insufficientData: return "exclamationmark.circle"
    case .unknown: return "info.circle"
    }
  }

  private var statusColor: Color {
    switch answer.status {
    case .answered: return Theme.success
    case .clarificationNeeded: return Theme.info
    case .resolutionFailed: return Theme.warning
    case .insufficientData: return Theme.warning
    case .unknown: return Theme.textMuted
    }
  }

  /// Humanizes a raw wire status string (e.g. `"needs_review"` → `"Needs review"`)
  /// for a neutral, forward-compatible badge label.
  private static func humanize(_ raw: String) -> String {
    let words = raw.split(whereSeparator: { $0 == "_" || $0 == "-" })
    guard let first = words.first else { return raw }
    let rest = words.dropFirst().map { $0.lowercased() }
    return ([first.prefix(1).uppercased() + first.dropFirst().lowercased()] + rest)
      .joined(separator: " ")
  }

  // MARK: Presence predicates (mirror each subview's own render-if-present guard)

  private var hasStatus: Bool { answer.status != .answered }

  /// The answer prose always renders — it's the required bottom-line of every turn.
  private var hasAnswerBody: Bool { true }

  private var hasSubjects: Bool { !(answer.subjects ?? []).isEmpty }

  private var hasQuestion: Bool { !(answer.question?.options ?? []).isEmpty }

  private var hasCandidates: Bool { !(answer.candidates?.shown ?? []).isEmpty }

  private var hasDamageCalc: Bool { answer.damageCalc != nil }

  private var hasTeams: Bool { answer.proposedTeam != nil || answer.savedTeam != nil }

  private var hasSuggestions: Bool { !Self.nonBlank(answer.suggestions).isEmpty }

  /// The receipts footer shows when EITHER reasoning or citations is non-empty.
  private var hasReceipts: Bool {
    !Self.trimmed(answer.reasoningMarkdown).isEmpty || !answer.citations.isEmpty
  }

  private var hasInferences: Bool { !answer.inferences.isEmpty }

  /// The always-on scope tag (``ScopeTagView``) shows whenever the generation string
  /// is non-blank — the fallback/note are carried by the caveat strip, not here.
  private var hasScope: Bool { !Self.trimmed(answer.generationBasis.generation).isEmpty }

  /// The caveat strip (``CaveatStripView``) shows when there is a generation fallback
  /// OR any non-blank uncertainty flag — the exact `hasFallback || hasFlags` guard of
  /// the web `CaveatStrip`.
  private var hasCaveat: Bool {
    answer.generationBasis.fallback || !Self.nonBlank(answer.uncertaintyFlags).isEmpty
  }

  // MARK: Trim helpers

  private static func trimmed(_ value: String) -> String {
    value.trimmingCharacters(in: .whitespacesAndNewlines)
  }

  /// Non-blank, trimmed entries of an optional string array (matches the trimming
  /// ``SuggestionsView`` / ``UncertaintyFlagsView`` apply before deciding to show).
  private static func nonBlank(_ values: [String]?) -> [String] {
    (values ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
}

// MARK: - Receipts footer (soul.md)

/// Full-width plate-foot tab: `RECEIPTS · N SOURCE(S)`. Expands inline to
/// reasoning markdown + citation list. Replaces free-floating credibility chips
/// (soul.md "Receipts" / Phase 1 checklist).
///
/// Accessibility: a single toggle button with expanded/collapsed value, plus
/// the expanded content in document order under the card's contain group.
private struct ReceiptsFooterView: View {
  let reasoningMarkdown: String
  let citations: [Citation]

  /// Opens a citation's source entity (e.g. `move/outrage`) in the artifact
  /// viewer. Defaults to a no-op so the footer renders in isolation.
  var onOpenEntity: (EntityKind, String) -> Void = { _, _ in }

  /// Copies distilled agent markdown to the pasteboard (soul.md Phase 3.2).
  var onCopyForAgents: () -> Void = {}

  @State private var isOpen = false
  @State private var didCopy = false
  @Environment(\.accessibilityReduceMotion) private var reduceMotion

  private var hasReasoning: Bool {
    !reasoningMarkdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  private var sourceCount: Int { citations.count }

  private var tabLabel: String {
    if sourceCount == 0 {
      return "Receipts"
    }
    let noun = sourceCount == 1 ? "source" : "sources"
    return "Receipts · \(sourceCount) \(noun)"
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      HStack(spacing: 0) {
        Button {
          isOpen.toggle()
        } label: {
          HStack(spacing: Theme.Spacing.sm) {
            Text(tabLabel)
              .instrumentLabel()
              .foregroundStyle(Theme.textSecondary)
            Spacer(minLength: 0)
            Image(systemName: "chevron.right")
              .font(.system(size: 11, weight: .semibold))
              .foregroundStyle(Theme.textMuted)
              .rotationEffect(.degrees(isOpen ? 90 : 0))
          }
          .padding(.leading, Theme.Spacing.lg)
          .padding(.vertical, Theme.Spacing.md)
          .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits([.isButton, .isToggle])
        .accessibilityLabel(tabLabel)
        .accessibilityHint("Shows reasoning and cited sources")
        .accessibilityValue(isOpen ? "expanded" : "collapsed")

        Button {
          onCopyForAgents()
          didCopy = true
          Task { @MainActor in
            try? await Task.sleep(for: .seconds(2))
            didCopy = false
          }
        } label: {
          Image(systemName: didCopy ? "checkmark" : "doc.on.clipboard")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(didCopy ? Theme.success : Theme.textMuted)
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(didCopy ? "Copied for agents" : "Copy for agents")
        .accessibilityHint("Copies a distilled markdown version of this answer to the clipboard")
        .padding(.trailing, Theme.Spacing.sm)
      }

      if isOpen {
        VStack(alignment: .leading, spacing: Theme.Spacing.md) {
          if hasReasoning {
            VStack(alignment: .leading, spacing: Theme.Spacing.xs) {
              Text("Reasoning")
                .instrumentLabel()
                .foregroundStyle(Theme.textMuted)
              MarkdownBlockView(reasoningMarkdown)
                .font(Theme.body(.footnote))
                .foregroundStyle(Theme.textSecondary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
            }
          }
          if !citations.isEmpty {
            // No "Sources" section head: each citation row already self-labels
            // (source icon + bold name + detail), so a head above them would
            // just repeat it (instrumentLabel prune, Phase 3).
            VStack(alignment: .leading, spacing: Theme.Spacing.sm) {
              ForEach(Array(citations.enumerated()), id: \.offset) { _, citation in
                citationRow(citation)
              }
            }
          }
        }
        .padding(.horizontal, Theme.Spacing.lg)
        .padding(.bottom, Theme.Spacing.lg)
        .transition(
          reduceMotion
            ? .opacity
            : .asymmetric(
                insertion: .opacity.combined(with: .move(edge: .top)),
                removal: .opacity
              )
        )
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(Theme.surfaceSunken.opacity(0.65))
    .overlay(alignment: .top) {
      Rectangle()
        .fill(Theme.border.opacity(0.9))
        .frame(height: 1)
    }
    .animation(reduceMotion ? .default : Theme.Motion.smooth, value: isOpen)
    .accessibilityElement(children: .contain)
  }

  // MARK: Citation row

  private func citationRow(_ citation: Citation) -> some View {
    HStack(alignment: .top, spacing: Theme.Spacing.sm) {
      Image(systemName: sourceGlyph(citation))
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textMuted)
        .accessibilityHidden(true)
      VStack(alignment: .leading, spacing: 2) {
        if let parsed = parseCitationSource(citation.source) {
          Button {
            onOpenEntity(parsed.kind, parsed.query)
          } label: {
            Text(displayCitationSource(citation.source))
              .font(Theme.body(.footnote, weight: .semibold))
              .foregroundStyle(Theme.azure)
          }
          .buttonStyle(OakPressableButtonStyle())
          .accessibilityLabel("Open \(displayCitationSource(citation.source)) in viewer")
          .accessibilityHint("Opens this source's entity in the artifact viewer")
        } else {
          Text(displayCitationSource(citation.source))
            .font(Theme.body(.footnote, weight: .semibold))
            .foregroundStyle(Theme.textPrimary)
        }
        Text(citation.detail)
          .font(Theme.body(.footnote))
          .foregroundStyle(Theme.textSecondary)
        if let endpointUrl = citation.endpointUrl, !endpointUrl.isEmpty {
          endpointLink(endpointUrl)
        }
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  @ViewBuilder
  private func endpointLink(_ endpointUrl: String) -> some View {
    if let url = URL(string: endpointUrl) {
      Link(destination: url) {
        Label {
          Text(endpointUrl)
            .underline()
            .lineLimit(1)
            .truncationMode(.middle)
        } icon: {
          Image(systemName: "link")
        }
        .font(Theme.body(.footnote))
      }
      .foregroundStyle(Theme.azure)
      .accessibilityLabel("Open source link")
      .accessibilityHint(endpointUrl)
    } else {
      Text(endpointUrl)
        .font(Theme.body(.footnote))
        .foregroundStyle(Theme.textMuted)
    }
  }

  private func sourceGlyph(_ citation: Citation) -> String {
    guard let u = citation.endpointUrl, !u.isEmpty, URL(string: u) != nil else {
      return "books.vertical"
    }
    return "link"
  }
}

#if DEBUG
#Preview("Answered — full") {
  ScrollView {
    AnswerCardView(
      answer: OakAnswer(
        status: .answered,
        answerMarkdown:
          "**Garchomp** is the fastest of these Dragons at base **102** Speed.",
        reasoningMarkdown:
          "Resolved Garchomp, read base stats, and compared Speed across the set.",
        citations: [
          Citation(
            source: "PokeAPI",
            detail: "Garchomp base stats (#445)",
            endpointUrl: "https://pokeapi.co/api/v2/pokemon/445"
          )
        ],
        inferences: [
          Inference(
            claim: "Garchomp outspeeds Tyranitar without investment.",
            confidence: .high,
            note: "102 vs 61 base Speed."
          )
        ],
        generationBasis: GenerationBasis(
          generation: "Gen 9 (Scarlet/Violet)",
          fallback: false,
          note: nil
        ),
        subjects: [
          Subject(
            name: "Garchomp",
            dexNumber: 445,
            spriteUrl: "https://example.invalid/garchomp.png",
            types: ["dragon", "ground"],
            isFallback: false,
            sourceGeneration: nil
          )
        ],
        candidates: nil,
        damageCalc: nil,
        suggestions: ["Show its best moveset", "Compare with Dragapult"],
        question: nil,
        uncertaintyFlags: ["Speed assumes a neutral nature with no investment."],
        proposedTeam: nil,
        savedTeam: nil,
        proposedTeamWarnings: nil
      ),
      onFollowUp: { _ in }
    )
    .padding()
  }
}

#Preview("Clarification") {
  ScrollView {
    AnswerCardView(
      answer: OakAnswer(
        status: .clarificationNeeded,
        answerMarkdown: "Which format are you asking about?",
        reasoningMarkdown: "The best spread differs between Singles and Doubles.",
        citations: [],
        inferences: [],
        generationBasis: GenerationBasis(
          generation: "Gen 9 (Scarlet/Violet)",
          fallback: false,
          note: nil
        ),
        subjects: nil,
        candidates: nil,
        damageCalc: nil,
        suggestions: nil,
        question: ClarifyQuestion(options: [
          ClarifyOption(label: "Singles", description: "Smogon 1v1."),
          ClarifyOption(label: "Doubles", description: "VGC 2v2."),
        ]),
        uncertaintyFlags: nil,
        proposedTeam: nil,
        savedTeam: nil,
        proposedTeamWarnings: nil
      ),
      onFollowUp: { _ in }
    )
    .padding()
  }
}
#endif
