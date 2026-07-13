package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.ui.PlateWash
import ai.gowtam.oak.ui.rememberReduceMotion
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
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.graphics.Brush
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
 * iOS `AnswerCardView` and web `AnswerCard`. Phase 1 specimen desk: wraps content in a
 * **type-reactive plate shell** (wash/edge from `subjects[].types`, or mechanics ink
 * plate when there are no subjects) and unifies reasoning + citations into a full-width
 * RECEIPTS footer (`docs/design/soul.md`).
 *
 * It fans each field of the payload out to its mapped leaf subview, **rendering a
 * subview only when its field is present** (the render-if-present rule), in one fixed
 * reading order:
 *
 *   1. status badge   — non-`answered` outcomes only
 *   2. scope tag       — `generation_basis` masthead
 *   3. caveat strip    — merged `uncertainty_flags` + `generation_basis.fallback`/note
 *   4. answer markdown — `answer_markdown` (always)
 *   5. subjects        — per-subject cards (+ "Compare in viewer" when ≥ 2)
 *   6. clarify question— options (each label sent verbatim on tap)
 *   7. candidates table
 *   8. damage calc
 *   9. team blocks     — proposed/saved team + warnings
 *  10. suggestions
 *  11. reasoning       — via RECEIPTS footer (testTag `section:reasoning`)
 *  12. citations       — via RECEIPTS footer (testTag `section:citations`)
 *  13. inferences      — after receipts, dashed border, confidence badges
 *
 * Which blocks render is exposed as the pure [answerSections] list so the orchestration
 * is unit-testable without inspecting the Compose tree; the body renders exactly that
 * list. Each section carries a stable `testTag` (`section:<name>`) for the render test.
 */
@Composable
fun AnswerCard(
    answer: OakAnswer,
    modifier: Modifier = Modifier,
    actions: AnswerCardActions = AnswerCardActions(),
) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val reduceMotion = rememberReduceMotion()
    val wash: PlateWash = remember(
        answer.subjects,
        dark,
        oak.surfaceRaised,
        oak.surfaceSunken,
        oak.border,
        oak.borderStrong,
    ) {
        OakType.plateWashForTypes(
            subjectTypes = answer.subjects.orEmpty().map { it.types },
            surface = oak.surfaceRaised,
            surfaceSunken = oak.surfaceSunken,
            border = oak.border,
            borderStrong = oak.borderStrong,
            dark = dark,
        )
    }
    val plateShape = RoundedCornerShape(OakRadius.xl)
    val plateBrush = remember(wash, oak.surfaceRaised, oak.surfaceSunken) {
        when {
            wash.fillSecondary != null ->
                Brush.linearGradient(listOf(wash.fill, wash.fillSecondary, oak.surfaceRaised))
            wash.isMechanics ->
                Brush.verticalGradient(listOf(oak.surfaceSunken, oak.surfaceRaised))
            else ->
                Brush.linearGradient(listOf(wash.fill, oak.surfaceRaised))
        }
    }
    val sections = answerSections(answer)
    val bodySections = sections.filter {
        it != AnswerSection.REASONING &&
            it != AnswerSection.CITATIONS &&
            it != AnswerSection.INFERENCES
    }
    val hasReceipts = sections.any {
        it == AnswerSection.REASONING || it == AnswerSection.CITATIONS
    }
    val hasInferences = sections.contains(AnswerSection.INFERENCES)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .testTag(TAG_ANSWER_CARD)
            .then(if (dark) Modifier else Modifier.shadow(6.dp, plateShape))
            .clip(plateShape)
            .background(plateBrush, plateShape)
            .border(1.dp, wash.border, plateShape),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(
                    start = OakSpacing.lg,
                    end = OakSpacing.lg,
                    top = OakSpacing.lg,
                    bottom = if (hasReceipts || hasInferences) OakSpacing.md else OakSpacing.lg,
                ),
            verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
        ) {
            for (section in bodySections) {
                // Use the original index from the full sections list for entrance stagger.
                val originalIndex = sections.indexOf(section)
                val sectionModifier = Modifier
                    .fillMaxWidth()
                    .testTag(section.testTag)
                    .sectionEntrance(index = originalIndex, reduceMotion = reduceMotion)
                when (section) {
                    AnswerSection.STATUS -> StatusBadge(answer.status, sectionModifier)
                    AnswerSection.SCOPE -> ScopeTag(answer.generationBasis, sectionModifier)
                    AnswerSection.CAVEAT -> CaveatStrip(answer.uncertaintyFlags, answer.generationBasis, sectionModifier)
                    AnswerSection.ANSWER -> AnswerBody(answer.answerMarkdown, sectionModifier)
                    AnswerSection.SUBJECTS -> Subjects(
                        subjects = answer.subjects.orEmpty(),
                        onOpenEntity = actions.onOpenEntity,
                        onOpenComparison = actions.onOpenComparison,
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
                        modifier = sectionModifier,
                    )
                    AnswerSection.DAMAGE -> DamageCalcBlock(
                        damageCalc = answer.damageCalc!!,
                        onOpenInViewer = { actions.onOpenDamageCalc(answer.damageCalc!!) },
                        modifier = sectionModifier,
                    )
                    AnswerSection.TEAMS -> TeamBlocks(
                        proposedTeam = answer.proposedTeam,
                        proposedTeamWarnings = answer.proposedTeamWarnings.orEmpty(),
                        savedTeam = answer.savedTeam,
                        onApply = actions.onApplyTeam,
                        onOpenSavedTeam = actions.onOpenSavedTeam,
                        onOpenProposedTeam = { actions.onOpenProposedTeam(it, answer.proposedTeamWarnings.orEmpty()) },
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
                    AnswerSection.INFERENCES,
                    -> Unit
                }
            }
            // Machine strip — not a new AnswerSection (keeps section:* tags / order stable).
            CopyForAgentsRow(answer = answer)
        }
        if (hasReceipts) {
            val receiptsIndex = sections.indexOfFirst {
                it == AnswerSection.REASONING || it == AnswerSection.CITATIONS
            }.coerceAtLeast(0)
            ReceiptsFooter(
                reasoningMarkdown = answer.reasoningMarkdown.takeIf { it.isNotBlank() },
                citations = answer.citations,
                onOpenEntity = actions.onOpenEntity,
                edgeColor = wash.wellGlow,
                modifier = Modifier
                    .fillMaxWidth()
                    .sectionEntrance(index = receiptsIndex, reduceMotion = reduceMotion),
            )
        }
        if (hasInferences) {
            val inferencesIndex = sections.indexOf(AnswerSection.INFERENCES).coerceAtLeast(0)
            Inferences(
                inferences = answer.inferences,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = OakSpacing.lg)
                    .padding(top = if (hasReceipts) OakSpacing.md else 0.dp, bottom = OakSpacing.lg)
                    .testTag(AnswerSection.INFERENCES.testTag)
                    .sectionEntrance(index = inferencesIndex, reduceMotion = reduceMotion),
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
 * Pure and side-effect-free; mirrors the iOS `sections` predicate set exactly.
 */
fun answerSections(answer: OakAnswer): List<AnswerSection> = buildList {
    if (answer.status != OakAnswer.Status.Answered) add(AnswerSection.STATUS)
    if (answer.generationBasis.generation.isNotBlank()) add(AnswerSection.SCOPE)
    if (answer.generationBasis.fallback || nonBlank(answer.uncertaintyFlags).isNotEmpty()) {
        add(AnswerSection.CAVEAT)
    }
    add(AnswerSection.ANSWER) // the answer prose always renders
    if (!answer.subjects.isNullOrEmpty()) add(AnswerSection.SUBJECTS)
    if (!answer.question?.options.isNullOrEmpty()) add(AnswerSection.QUESTION)
    if (!answer.candidates?.shown.isNullOrEmpty()) add(AnswerSection.CANDIDATES)
    if (answer.damageCalc != null) add(AnswerSection.DAMAGE)
    if (answer.proposedTeam != null || answer.savedTeam != null) add(AnswerSection.TEAMS)
    if (nonBlank(answer.suggestions).isNotEmpty()) add(AnswerSection.SUGGESTIONS)
    if (answer.reasoningMarkdown.isNotBlank()) add(AnswerSection.REASONING)
    if (answer.citations.isNotEmpty()) add(AnswerSection.CITATIONS)
    if (answer.inferences.isNotEmpty()) add(AnswerSection.INFERENCES)
}

/** Non-blank, trimmed entries of an optional string list (matches each subview's guard). */
internal fun nonBlank(values: List<String>?): List<String> =
    values.orEmpty().map { it.trim() }.filter { it.isNotEmpty() }

internal const val TAG_ANSWER_CARD = "answer-card"

/** The answer prose — the required bottom-line of every turn, rendered as GFM blocks. */
@Composable
private fun AnswerBody(markdown: String, modifier: Modifier = Modifier) {
    ai.gowtam.oak.ui.MarkdownBlockView(markdown = markdown, modifier = modifier)
}

/**
 * "Copy for agents" machine export (soul.md Phase 3): writes [oakAnswerAgentMarkdown]
 * to the system clipboard. Sits below body sections / above RECEIPTS so human plate
 * content stays primary; not a section:* block.
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
