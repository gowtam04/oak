package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.features.chat.answercard.SubjectCard
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.wire.Subject
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.unit.dp

/**
 * Renders a **comparison** artifact — a side-by-side of the answer's `subjects[]`, the
 * native mirror of the web `ComparisonArtifact` and iOS `ComparisonArtifactView`. Like
 * both, it is derived from the committed answer payload (no fetch, M-AC-A4.1) and
 * simply lays the subjects out together, reusing the exact [SubjectCard] the answer
 * itself renders — so the sprites, names, mute dex captions, and any fallback pill
 * stay identical to the answer.
 *
 * Phase 2: the comparison sits in a multi-subject specimen plate shell (neutral-ish
 * multi wash from [OakType.plateWashForTypes]), continuing the answer-plate language.
 *
 * Each card is tappable to drill into that Pokémon's full profile (AV-US-5), pushing
 * a new artifact onto the viewer's back stack via [onOpen].
 */
@Composable
fun ComparisonView(
    subjects: List<Subject>,
    onOpen: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val wash = remember(
        subjects,
        dark,
        oak.surfaceRaised,
        oak.surfaceSunken,
        oak.border,
        oak.borderStrong,
    ) {
        OakType.plateWashForTypes(
            subjectTypes = subjects.map { it.types },
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

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(OakSpacing.lg)
            .then(if (dark) Modifier else Modifier.shadow(6.dp, plateShape))
            .clip(plateShape)
            .background(plateBrush, plateShape)
            .border(1.dp, wash.border, plateShape)
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        for (subject in subjects) {
            SubjectCard(subject = subject, onClick = { onOpen(subject.name) })
        }
    }
}
