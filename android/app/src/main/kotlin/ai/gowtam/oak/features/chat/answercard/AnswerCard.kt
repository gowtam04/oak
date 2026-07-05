package ai.gowtam.oak.features.chat.answercard

import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakSpacing
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
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The top-level renderer for a single finalized [OakAnswer] — the native mirror of the
 * iOS `AnswerCardView` and web `AnswerCard`. It fans each field of the payload out to
 * its mapped leaf subview, **rendering a subview only when its field is present** (the
 * render-if-present rule the whole tree follows), in one fixed reading order:
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
 *  11. reasoning       — collapsible, closed by default
 *  12. citations       — collapsible "Sources"
 *  13. inferences      — dashed border, confidence badges
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
    val reduceMotion = rememberReduceMotion()
    Column(
        modifier = modifier.fillMaxWidth().testTag(TAG_ANSWER_CARD),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
    ) {
        for ((index, section) in answerSections(answer).withIndex()) {
            val sectionModifier = Modifier
                .fillMaxWidth()
                .testTag(section.testTag)
                .sectionEntrance(index = index, reduceMotion = reduceMotion)
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
                AnswerSection.REASONING -> Reasoning(answer.reasoningMarkdown, sectionModifier)
                AnswerSection.CITATIONS -> Citations(
                    citations = answer.citations,
                    modifier = sectionModifier,
                    onOpenEntity = actions.onOpenEntity,
                )
                AnswerSection.INFERENCES -> Inferences(answer.inferences, sectionModifier)
            }
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
