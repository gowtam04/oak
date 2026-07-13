import Foundation

/// Distills a finalized ``OakAnswer`` into machine-readable markdown for pasting
/// into other agents / tools (soul.md Phase 3.2 — "Copy for agents").
///
/// Pure + deterministic: no UIKit, no locale-sensitive formatting beyond the
/// strings already on the answer. Unit-tested against fixture answers.
enum OakAnswerAgentMarkdown {
  /// Builds distilled markdown from a finalized answer. Sections are included
  /// only when their source field is present and non-empty (mirror of the
  /// AnswerCard render-if-present rule).
  static func build(_ answer: OakAnswer) -> String {
    var parts: [String] = []

    parts.append("# Oak answer")
    parts.append("")
    parts.append("**Status:** \(answer.status.rawValue)")

    let generation = answer.generationBasis.generation
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !generation.isEmpty {
      parts.append("**Scope:** \(generation)")
    }
    if answer.generationBasis.fallback {
      let note = answer.generationBasis.note?
        .trimmingCharacters(in: .whitespacesAndNewlines)
      if let note, !note.isEmpty {
        parts.append("**Fallback:** \(note)")
      } else {
        parts.append("**Fallback:** yes")
      }
    }

    let body = answer.answerMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
    if !body.isEmpty {
      parts.append("")
      parts.append("## Answer")
      parts.append("")
      parts.append(body)
    }

    if let subjects = answer.subjects, !subjects.isEmpty {
      parts.append("")
      parts.append("## Subjects")
      parts.append("")
      for subject in subjects {
        parts.append("- \(subjectLine(subject))")
      }
    }

    let flags = nonBlank(answer.uncertaintyFlags)
    if !flags.isEmpty {
      parts.append("")
      parts.append("## Uncertainty")
      parts.append("")
      for flag in flags {
        let label = UncertaintyFlagLabels.label(for: flag)
        parts.append("- \(label)")
      }
    }

    if !answer.inferences.isEmpty {
      parts.append("")
      parts.append("## Inferences")
      parts.append("")
      for inference in answer.inferences {
        var line = "- [\(inference.confidence.rawValue)] \(inference.claim)"
        if let note = inference.note?.trimmingCharacters(in: .whitespacesAndNewlines),
           !note.isEmpty {
          line += " — \(note)"
        }
        parts.append(line)
      }
    }

    if let candidates = answer.candidates, !candidates.shown.isEmpty {
      parts.append("")
      parts.append("## Candidates")
      parts.append("")
      parts.append(
        "Showing \(candidates.shown.count) of \(candidates.totalCount)"
          + (candidates.truncated ? " (truncated)" : "")
          + "."
      )
      for row in candidates.shown {
        let types = row.types.map { $0.capitalized }.joined(separator: " / ")
        let typeSuffix = types.isEmpty ? "" : " — \(types)"
        parts.append("- \(row.name)\(typeSuffix)")
      }
    }

    if let damage = answer.damageCalc {
      parts.append("")
      parts.append("## Damage calc")
      parts.append("")
      if let breakdown = damage.breakdown?
        .trimmingCharacters(in: .whitespacesAndNewlines), !breakdown.isEmpty {
        parts.append(breakdown)
      } else {
        parts.append("_Estimate (see structured result on the original plate)._")
      }
    }

    if let team = answer.proposedTeam {
      parts.append("")
      parts.append("## Proposed team")
      parts.append("")
      parts.append("**\(team.name)** · \(team.format.rawValue)")
      for (index, member) in team.members.enumerated() {
        parts.append("- \(index + 1). \(memberLine(member))")
      }
    }

    if let saved = answer.savedTeam {
      parts.append("")
      parts.append("## Saved team")
      parts.append("")
      parts.append("- \(saved.name) (`\(saved.id)`) · \(saved.format.rawValue)")
    }

    let suggestions = nonBlank(answer.suggestions)
    if !suggestions.isEmpty {
      parts.append("")
      parts.append("## Suggestions")
      parts.append("")
      for s in suggestions {
        parts.append("- \(s)")
      }
    }

    if !answer.citations.isEmpty {
      parts.append("")
      parts.append("## Sources")
      parts.append("")
      for (i, citation) in answer.citations.enumerated() {
        parts.append("\(i + 1). \(citation.source) — \(citation.detail)")
      }
    }

    let reasoning = answer.reasoningMarkdown
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if !reasoning.isEmpty {
      parts.append("")
      parts.append("## Reasoning")
      parts.append("")
      parts.append(reasoning)
    }

    parts.append("")
    return parts.joined(separator: "\n")
  }

  // MARK: - Helpers

  private static func subjectLine(_ subject: Subject) -> String {
    var line = subject.name
    if let dex = subject.dexNumber {
      line += " (#\(String(format: "%04d", dex)))"
    }
    if !subject.types.isEmpty {
      let types = subject.types.map { $0.capitalized }.joined(separator: " / ")
      line += " — \(types)"
    }
    if subject.isFallback {
      if let gen = subject.sourceGeneration {
        line += " [fallback: \(gen)]"
      } else {
        line += " [fallback]"
      }
    }
    return line
  }

  private static func memberLine(_ member: TeamMember) -> String {
    let species = (member.species ?? "")
      .trimmingCharacters(in: .whitespacesAndNewlines)
    if species.isEmpty { return "(empty slot)" }
    var parts = [species]
    if let item = member.item?.trimmingCharacters(in: .whitespacesAndNewlines),
       !item.isEmpty {
      parts[0] = "\(species) @ \(item)"
    }
    if let ability = member.ability?.trimmingCharacters(in: .whitespacesAndNewlines),
       !ability.isEmpty {
      parts.append(ability)
    }
    if let tera = member.teraType?.trimmingCharacters(in: .whitespacesAndNewlines),
       !tera.isEmpty {
      parts.append("Tera \(tera)")
    }
    if !member.moves.isEmpty {
      parts.append("moves: \(member.moves.joined(separator: ", "))")
    }
    return parts.joined(separator: " · ")
  }

  private static func nonBlank(_ values: [String]?) -> [String] {
    (values ?? [])
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
  }
}
