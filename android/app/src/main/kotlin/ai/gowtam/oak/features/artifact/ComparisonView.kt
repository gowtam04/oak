package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.features.chat.answercard.SubjectCard
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.Subject
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier

/**
 * Renders a **comparison** artifact — a side-by-side of the answer's `subjects[]`, the
 * native mirror of the web `ComparisonArtifact` and iOS `ComparisonArtifactView`. Like
 * both, it is derived from the committed answer payload (no fetch, M-AC-A4.1) and
 * simply lays the subjects out together, reusing the exact [SubjectCard] the answer
 * itself renders — so the sprites, dex numbers, type badges, and any fallback pill
 * stay identical to the answer.
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
    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        for (subject in subjects) {
            SubjectCard(subject = subject, onClick = { onOpen(subject.name) })
        }
    }
}
