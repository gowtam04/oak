package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.MarkdownBlocks
import ai.gowtam.oak.wire.OakAnswer

/**
 * Pure machine-export markdown for a finalized [OakAnswer] — "Copy for agents"
 * (`docs/design/soul.md` Phase 3). Distills scope, status, subjects, flags,
 * answer prose, reasoning, sources, and inferences into a portable GFM document
 * an agent (or a human pasting into another tool) can consume without the UI shell.
 *
 * Side-effect free; unit-tested. Does not invent facts beyond the answer payload.
 */
fun oakAnswerAgentMarkdown(answer: OakAnswer): String = buildString {
    appendLine("# Oak answer")
    appendLine()
    appendLine("- **Status:** ${answer.status.rawValue}")
    appendLine("- **Generation:** ${answer.generationBasis.generation}")
    if (answer.generationBasis.fallback) {
        appendLine("- **Fallback:** true")
    }
    answer.generationBasis.note?.trim()?.takeIf { it.isNotEmpty() }?.let {
        appendLine("- **Basis note:** $it")
    }

    val flags = nonBlank(answer.uncertaintyFlags)
    if (flags.isNotEmpty()) {
        appendLine()
        appendLine("## Uncertainty")
        for (flag in flags) appendLine("- $flag")
    }

    val subjects = answer.subjects.orEmpty()
    if (subjects.isNotEmpty()) {
        appendLine()
        appendLine("## Subjects")
        for (subject in subjects) {
            val types = subject.types.joinToString(" / ").ifBlank { "—" }
            val dex = subject.dexNumber?.let { " #${it.toString().padStart(4, '0')}" }.orEmpty()
            val fallback = if (subject.isFallback) " (fallback${subject.sourceGeneration?.let { ": $it" } ?: ""})" else ""
            appendLine("- **${subject.name}**$dex — $types$fallback")
        }
    }

    appendLine()
    appendLine("## Answer")
    appendLine()
    appendLine(MarkdownBlocks.stripHtmlComments(answer.answerMarkdown).trim())

    if (answer.reasoningMarkdown.isNotBlank()) {
        appendLine()
        appendLine("## Reasoning")
        appendLine()
        appendLine(answer.reasoningMarkdown.trim())
    }

    if (answer.citations.isNotEmpty()) {
        appendLine()
        appendLine("## Sources")
        for (citation in answer.citations) {
            val url = citation.endpointUrl?.trim()?.takeIf { it.isNotEmpty() }?.let { " — $it" }.orEmpty()
            appendLine("- **${citation.source}**: ${citation.detail}$url")
        }
    }

    if (answer.inferences.isNotEmpty()) {
        appendLine()
        appendLine("## Inferences")
        for (inference in answer.inferences) {
            val note = inference.note?.trim()?.takeIf { it.isNotEmpty() }?.let { " — $it" }.orEmpty()
            appendLine("- (${inference.confidence.rawValue}) ${inference.claim}$note")
        }
    }

    val suggestions = nonBlank(answer.suggestions)
    if (suggestions.isNotEmpty()) {
        appendLine()
        appendLine("## Suggestions")
        for (s in suggestions) appendLine("- $s")
    }

    answer.proposedTeam?.let { team ->
        appendLine()
        appendLine("## Proposed team")
        appendLine("- **Name:** ${team.name}")
        appendLine("- **Format:** ${team.format.rawValue}")
        team.members.forEachIndexed { index, member ->
            val species = member.species?.trim().orEmpty().ifBlank { "(empty)" }
            appendLine("- ${index + 1}. $species")
        }
    }

    answer.savedTeam?.let { team ->
        appendLine()
        appendLine("## Saved team")
        appendLine("- **Name:** ${team.name}")
        appendLine("- **Id:** ${team.id}")
        appendLine("- **Format:** ${team.format.rawValue}")
    }
}.trimEnd() + "\n"
