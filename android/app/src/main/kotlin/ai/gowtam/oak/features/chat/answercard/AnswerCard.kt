package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.AnswerDensity
import ai.gowtam.oak.wire.CandidateRow
import ai.gowtam.oak.wire.Candidates
import ai.gowtam.oak.wire.Citation
import ai.gowtam.oak.wire.CitationAnchor
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.OakAnswer
import ai.gowtam.oak.wire.ProposedTeam
import ai.gowtam.oak.wire.SavedTeamRef
import ai.gowtam.oak.wire.Subject
import ai.gowtam.oak.wire.TeamWarning
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The top-level renderer for a single finalized [OakAnswer] — the native mirror of the
 * iOS `AnswerCardView` and web `AnswerCard`. Enamel paper plate: `--surface`, 24.dp
 * pad, radius-lg, 1.dp `--border`, umber raised shadow. No type-lit glow, no scope
 * tag (scope lives in the header chip).
 *
 * It fans each field of the payload out to its mapped leaf subview, **rendering a
 * subview only when its field is present** (the render-if-present rule), in one fixed
 * reading order:
 *
 *   1. type chips      — unique `subjects[].types` (visual; not a `section:*` tag)
 *   2. status badge    — non-`answered` outcomes only
 *   3. caveat strip    — merged `uncertainty_flags` + `generation_basis.fallback`/note
 *   4. answer markdown — `answer_markdown` (always; first paragraph is the 22sp lead)
 *   5. inferences      — one-line `Inferred` (testTag `section:inferences`)
 *   6. subjects        — sprite 72 + name 600 + mute `#dex`
 *   7. clarify question
 *   8. candidates table
 *   9. damage calc     — two-column hairline fact table
 *  10. team blocks
 *  11. suggestions
 *  12. reasoning       — via Why / Sources footer (testTag `section:reasoning`)
 *  13. citations       — via Why / Sources footer (testTag `section:citations`)
 *
 * Which blocks render is exposed as the pure [answerSections] list so the orchestration
 * is unit-testable without inspecting the Compose tree; the body renders exactly that
 * list. Each section carries a stable `testTag` (`section:<name>`) for the render test.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun AnswerCard(
    answer: OakAnswer,
    modifier: Modifier = Modifier,
    actions: AnswerCardActions = AnswerCardActions(),
    density: AnswerDensity = AnswerDensity.Full,
) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val dark = oak.isDark
    val plateShape = RoundedCornerShape(OakRadius.lg)
    val umber = Color(0xFF4A352A)
    var receiptsExpanded by remember { mutableStateOf(false) }
    var highlight by remember { mutableStateOf<CitationAnchor?>(null) }
    val sections = answerSections(answer, density)
    val compactHasHiddenReceipts = density == AnswerDensity.Compact &&
        (answer.reasoningMarkdown.isNotBlank() || answer.citations.isNotEmpty())
    val bodySections = sections.filter {
        it != AnswerSection.REASONING && it != AnswerSection.CITATIONS
    }
    val hasReceipts = sections.any {
        it == AnswerSection.REASONING || it == AnswerSection.CITATIONS
    } || (compactHasHiddenReceipts && receiptsExpanded)
    val subjectTypes = remember(answer.subjects) {
        linkedSetOf<String>().apply {
            for (subject in answer.subjects.orEmpty()) addAll(subject.types)
        }.toList()
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag(TAG_ANSWER_CARD)
            .then(
                if (dark) {
                    Modifier
                } else {
                    Modifier.shadow(
                        elevation = 4.dp,
                        shape = plateShape,
                        ambientColor = umber.copy(alpha = 0.07f),
                        spotColor = umber.copy(alpha = 0.10f),
                    )
                },
            )
            .clip(plateShape)
            .background(MaterialTheme.colorScheme.surface, plateShape)
            .border(1.dp, oak.border, plateShape),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = OakSpacing.xl,
                    end = OakSpacing.xl,
                    top = OakSpacing.xl,
                    bottom = if (hasReceipts) OakSpacing.md else OakSpacing.xl,
                ),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.xl),
        ) {
            if (subjectTypes.isNotEmpty()) {
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    verticalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    for (type in subjectTypes) {
                        TypeBadge(type = type)
                    }
                }
            }
            for (section in bodySections) {
                val originalIndex = sections.indexOf(section)
                val sectionModifier = Modifier
                    .fillMaxWidth()
                    .testTag(section.testTag)
                    .sectionEntrance(index = originalIndex, reduceMotion = reduceMotion)
                when (section) {
                    AnswerSection.STATUS -> StatusBadge(answer.status, sectionModifier)
                    AnswerSection.SCOPE -> Unit
                    AnswerSection.CAVEAT -> CaveatStrip(answer.uncertaintyFlags, answer.generationBasis, sectionModifier)
                    AnswerSection.ANSWER -> {
                        val spanText = highlight
                            ?.takeIf { it.target == CitationAnchor.Target.AnswerSpan }
                            ?.let { extractAnswerSpan(answer.answerMarkdown, it.id) }
                        Column(sectionModifier, verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                            AnswerBody(answer.answerMarkdown)
                            if (spanText != null) {
                                Text(
                                    text = spanText,
                                    color = oak.textStrong,
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .background(oak.warning.copy(alpha = 0.18f), RoundedCornerShape(OakRadius.sm))
                                        .padding(OakSpacing.sm)
                                        .testTag("citation-span-${highlight!!.id}"),
                                )
                            }
                        }
                    }
                    AnswerSection.INFERENCES -> Inferences(answer.inferences, sectionModifier)
                    AnswerSection.SUBJECTS -> Subjects(
                        subjects = answer.subjects.orEmpty(),
                        onOpenEntity = actions.onOpenEntity,
                        onOpenComparison = actions.onOpenComparison,
                        onAddToTeam = actions.onAddToTeam,
                        modifier = sectionModifier,
                    )
                    AnswerSection.QUESTION -> ClarifyQuestion(answer.question, actions.onFollowUp, sectionModifier)
                    AnswerSection.CANDIDATES -> CandidatesTable(
                        candidates = answer.candidates!!,
                        onOpenPokemon = { actions.onOpenEntity(EntityKind.POKEMON, it) },
                        onOpenType = { actions.onOpenEntity(EntityKind.TYPE, it) },
                        onShowAll = {
                            val c = answer.candidates!!
                            actions.onFollowUp(
                                "Show me all ${c.totalCount} of those, not just the top ${c.shown.size}.",
                            )
                        },
                        onAddToTeam = actions.onAddToTeam,
                        highlightedName = highlight?.takeIf { it.target == CitationAnchor.Target.FactRow }?.id,
                        modifier = sectionModifier,
                    )
                    AnswerSection.DAMAGE -> DamageCalcBlock(
                        damageCalc = answer.damageCalc!!,
                        onOpenInViewer = { actions.onOpenDamageCalc(answer.damageCalc!!) },
                        onOpenInCalculator = {
                            actions.onOpenCalculator(
                                ai.gowtam.oak.features.calc.calcScenarioFromDamage(
                                    answer.damageCalc!!,
                                    actions.calculatorFormat,
                                ),
                            )
                        },
                        modifier = sectionModifier,
                    )
                    AnswerSection.TEAMS -> TeamBlocks(
                        proposedTeam = answer.proposedTeam,
                        proposedTeamWarnings = answer.proposedTeamWarnings.orEmpty(),
                        savedTeam = answer.savedTeam,
                        onApply = actions.onApplyTeam,
                        onOpenSavedTeam = actions.onOpenSavedTeam,
                        onOpenProposedTeam = { actions.onOpenProposedTeam(it, answer.proposedTeamWarnings.orEmpty()) },
                        onAddToTeam = actions.onAddToTeam,
                        modifier = sectionModifier,
                    )
                    AnswerSection.SUGGESTIONS -> Suggestions(
                        suggestions = answer.suggestions.orEmpty(),
                        status = answer.status,
                        onSelect = actions.onFollowUp,
                        modifier = sectionModifier,
                    )
                    AnswerSection.REASONING,
                    AnswerSection.CITATIONS,
                    -> Unit
                }
            }
            CopyForAgentsRow(answer = answer)
            if (compactHasHiddenReceipts && !receiptsExpanded) {
                androidx.compose.material3.TextButton(onClick = { receiptsExpanded = true }) {
                    Text("Show why · sources", color = oak.accent)
                }
            }
        }
        if (hasReceipts) {
            val receiptsIndex = sections.indexOfFirst {
                it == AnswerSection.REASONING || it == AnswerSection.CITATIONS
            }.coerceAtLeast(0)
            ReceiptsFooter(
                reasoningMarkdown = answer.reasoningMarkdown.takeIf { it.isNotBlank() },
                citations = answer.citations,
                onOpenEntity = { kind, query -> actions.onOpenEntity(kind, query) },
                onHighlight = { citation ->
                    highlight = citationHighlight(citation, answer)
                    citationHighlight(citation, answer)?.let(actions.onCitationHighlight)
                },
                modifier = Modifier
                    .fillMaxWidth()
                    .sectionEntrance(index = receiptsIndex, reduceMotion = reduceMotion),
            )
        }
    }
}

/** The callbacks the answer card fans out to its leaf subviews (all no-op by default). */
@Immutable
data class AnswerCardActions(
    /** Sends the given text verbatim as the next user turn (clarify options + chips). */
    val onFollowUp: (String) -> Unit = {},
    /** Opens an entity (subject / candidate row / type chip) in the artifact viewer. */
    val onOpenEntity: (EntityKind, String) -> Unit = { _, _ -> },
    /** Saves a proposed team to the user's Teams (P10). */
    val onApplyTeam: (ProposedTeam) -> Unit = {},
    /** Opens a saved team in the artifact viewer (P7). */
    val onOpenSavedTeam: (SavedTeamRef) -> Unit = {},
    /** Opens the proposed team from its inline data (no fetch, P7). */
    val onOpenProposedTeam: (ProposedTeam, List<TeamWarning>) -> Unit = { _, _ -> },
    /** Opens a side-by-side comparison of the answer's subjects (P7). */
    val onOpenComparison: (List<Subject>) -> Unit = {},
    /** Opens the answer's damage calculation from its inline data (P7). */
    val onOpenDamageCalc: (DamageCalc) -> Unit = {},
    /** Opens the standalone calculator prefilled from a damage block (CALC-AC-2.1). */
    val onOpenCalculator: (ai.gowtam.oak.wire.CalcScenario) -> Unit = {},
    val calculatorFormat: ai.gowtam.oak.wire.Format = ai.gowtam.oak.wire.Format.NationalDex,
    /** Signed-in Add-to-team (ADD-US-1). Null = guest hide. */
    val onAddToTeam: ((ai.gowtam.oak.wire.TeamMember) -> Unit)? = null,
    val onCitationHighlight: (CitationAnchor) -> Unit = {},
)

/** One renderable block of the answer card, in fixed reading order. */
enum class AnswerSection(val testTag: String) {
    STATUS("section:status"),
    SCOPE("section:scope"),
    CAVEAT("section:caveat"),
    ANSWER("section:answer"),
    SUBJECTS("section:subjects"),
    QUESTION("section:question"),
    CANDIDATES("section:candidates"),
    DAMAGE("section:damage"),
    TEAMS("section:teams"),
    SUGGESTIONS("section:suggestions"),
    REASONING("section:reasoning"),
    CITATIONS("section:citations"),
    INFERENCES("section:inferences"),
}

/**
 * The ordered blocks the card renders for [answer] — the single source of truth the
 * body iterates. A block is included only when its field is present (and non-empty
 * after the same trimming its subview applies), so an absent field renders nothing.
 * Pure and side-effect-free. Scope is header-only (Signal) and is never listed.
 */
fun answerSections(
    answer: OakAnswer,
    density: AnswerDensity = AnswerDensity.Full,
): List<AnswerSection> {
    val sections = buildList {
        if (answer.status != OakAnswer.Status.Answered) add(AnswerSection.STATUS)
        if (answer.generationBasis.fallback || nonBlank(answer.uncertaintyFlags).isNotEmpty()) {
            add(AnswerSection.CAVEAT)
        }
        add(AnswerSection.ANSWER) // the answer prose always renders
        if (answer.inferences.isNotEmpty()) add(AnswerSection.INFERENCES)
        if (!answer.subjects.isNullOrEmpty()) add(AnswerSection.SUBJECTS)
        if (!answer.question?.options.isNullOrEmpty()) add(AnswerSection.QUESTION)
        if (!answer.candidates?.shown.isNullOrEmpty()) add(AnswerSection.CANDIDATES)
        if (answer.damageCalc != null) add(AnswerSection.DAMAGE)
        if (answer.proposedTeam != null || answer.savedTeam != null) add(AnswerSection.TEAMS)
        if (nonBlank(answer.suggestions).isNotEmpty()) add(AnswerSection.SUGGESTIONS)
        if (answer.reasoningMarkdown.isNotBlank()) add(AnswerSection.REASONING)
        if (answer.citations.isNotEmpty()) add(AnswerSection.CITATIONS)
    }
    if (density == AnswerDensity.Compact) {
        return sections.filter { it != AnswerSection.REASONING && it != AnswerSection.CITATIONS }
    }
    return sections
}

data class CandidateTableQuery(
    val typeFilter: String? = null,
    val nameQuery: String? = null,
    val pinnedNames: Set<String> = emptySet(),
    val sortColumn: String? = null,
    val sortAscending: Boolean = true,
)

fun shownCandidateRows(candidates: Candidates, query: CandidateTableQuery): List<CandidateRow> {
    fun matches(row: CandidateRow): Boolean {
        val type = query.typeFilter
        if (type != null && row.types.none { it.equals(type, ignoreCase = true) }) return false
        val name = query.nameQuery
        if (name != null && !row.name.contains(name, ignoreCase = true)) return false
        return true
    }
    val extraPinned = candidates.shown.filter { it.name in query.pinnedNames && !matches(it) }
    val matched = candidates.shown.filter(::matches)
    val visible = extraPinned + matched
    val column = query.sortColumn ?: return visible
    val sorted = visible.sortedBy { candidateSortValue(it, column) }
    return if (query.sortAscending) sorted else sorted.asReversed()
}

private fun candidateSortValue(row: CandidateRow, column: String): Int {
    val stats = row.baseStats
    if (stats != null) {
        return when (column.lowercase()) {
            "hp" -> stats.hp
            "atk", "attack" -> stats.atk
            "def", "defense" -> stats.def
            "spa", "special_attack" -> stats.spa
            "spd", "special_defense" -> stats.spd
            "spe", "speed" -> stats.spe
            else -> Int.MIN_VALUE
        }
    }
    return when (val scalar = row.keyStats?.get(column)) {
        is ai.gowtam.oak.wire.JsonScalar.IntVal -> scalar.v.toInt()
        is ai.gowtam.oak.wire.JsonScalar.DoubleVal -> scalar.v.toInt()
        else -> Int.MIN_VALUE
    }
}

fun citationHighlight(citation: Citation): CitationAnchor? = citation.anchor

/** Highlight only when the citation is linked AND the matching span/row exists (CIT-US-1). */
fun citationHighlight(citation: Citation, answer: OakAnswer): CitationAnchor? {
    val anchor = citation.anchor ?: return null
    return when (anchor.target) {
        CitationAnchor.Target.AnswerSpan -> {
            val open = "<!-- span:${anchor.id} -->"
            val close = "<!-- /span:${anchor.id} -->"
            if (answer.answerMarkdown.contains(open) && answer.answerMarkdown.contains(close)) anchor else null
        }
        CitationAnchor.Target.FactRow -> {
            val names = answer.candidates?.shown.orEmpty().map { it.name }
            if (anchor.id in names) anchor else null
        }
        else -> null
    }
}

fun extractAnswerSpan(markdown: String, id: String): String? {
    val open = "<!-- span:$id -->"
    val close = "<!-- /span:$id -->"
    val start = markdown.indexOf(open)
    val end = markdown.indexOf(close)
    if (start < 0 || end <= start) return null
    return markdown.substring(start + open.length, end).trim().ifBlank { null }
}

/** Non-blank, trimmed entries of an optional string list (matches each subview's guard). */
internal fun nonBlank(values: List<String>?): List<String> =
    values.orEmpty().map { it.trim() }.filter { it.isNotEmpty() }

internal const val TAG_ANSWER_CARD = "answer-card"

/** The answer prose — first paragraph is the 22sp Fredoka 600 lead. */
@Composable
private fun AnswerBody(markdown: String, modifier: Modifier = Modifier) {
    ai.gowtam.oak.ui.MarkdownBlockView(
        markdown = markdown,
        modifier = modifier,
        leadFirstParagraph = true,
    )
}

/**
 * "Copy for agents" machine export (soul.md Phase 3): writes [oakAnswerAgentMarkdown]
 * to the system clipboard. Sits below body sections / above Why · Sources so
 * human plate content stays primary; not a section:* block.
 */
@Composable
private fun CopyForAgentsRow(answer: OakAnswer) {
    val oak = LocalOakColors.current
    val clipboard = LocalClipboardManager.current
    var copied by remember { mutableStateOf(false) }
    LaunchedEffect(copied) {
        if (copied) {
            delay(1600)
            copied = false
        }
    }
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(OakRadius.md))
            .clickable {
                clipboard.setText(AnnotatedString(oakAnswerAgentMarkdown(answer)))
                copied = true
            }
            .semantics { role = Role.Button }
            .padding(vertical = OakSpacing.xs)
            .testTag(TAG_COPY_FOR_AGENTS),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = Icons.Filled.ContentCopy,
            contentDescription = null,
            tint = if (copied) oak.success else oak.textMuted,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = if (copied) "COPIED FOR AGENTS" else "COPY FOR AGENTS",
            style = MaterialTheme.typography.labelSmall.copy(
                fontFamily = JetBrainsMonoFamily,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.72.sp,
            ),
            color = if (copied) oak.success else oak.textMuted,
        )
    }
}

internal const val TAG_COPY_FOR_AGENTS = "copy-for-agents"

/**
 * A one-shot fade + slide-up entrance for a section, staggered by [index]
 * ([OakMotion.STAGGER_STEP_MILLIS] per position) — the Android take on the iOS "cascade"
 * treatment. Deliberately animates opacity/`translationY` on an always-mounted node
 * (never [androidx.compose.animation.AnimatedVisibility]'s insert/remove), so the
 * section's semantics stay in the tree the whole time — the render-order test
 * (`AnswerCardRenderTest`) walks the tree via `useUnmergedTree`, and a node that briefly
 * doesn't exist would read as a false negative for "does this section render". `index`
 * is scoped to one [AnswerCard] instance (a fresh instance per turn, keyed by turn id in
 * `ChatScreen`), so re-rendering the SAME already-settled card (e.g. during a scroll)
 * does not restart the animation — [remember] keys only on `index`, not on any
 * per-recomposition input. No-ops entirely under [reduceMotion].
 */
private fun Modifier.sectionEntrance(index: Int, reduceMotion: Boolean): Modifier = composed {
    if (reduceMotion) {
        this
    } else {
        val density = LocalDensity.current
        val alpha = remember(index) { Animatable(0f) }
        val offsetY = remember(index) { Animatable(with(density) { SECTION_ENTRANCE_OFFSET.toPx() }) }
        LaunchedEffect(index) {
            delay(index * OakMotion.STAGGER_STEP_MILLIS.toLong())
            launch { offsetY.animateTo(0f, tween(OakMotion.FADE_MILLIS)) }
            alpha.animateTo(1f, tween(OakMotion.FADE_MILLIS))
        }
        this.graphicsLayer {
            this.alpha = alpha.value
            translationY = offsetY.value
        }
    }
}

private val SECTION_ENTRANCE_OFFSET = 6.dp
