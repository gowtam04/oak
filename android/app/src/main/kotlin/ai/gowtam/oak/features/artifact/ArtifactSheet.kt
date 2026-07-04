package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.features.chat.answercard.DamageCalcBlock
import ai.gowtam.oak.features.chat.answercard.titleizeNonNull
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.DamageCalc
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.automirrored.filled.HelpOutline
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.BottomSheetDefaults
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.ModalBottomSheetDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * The artifact viewer's **draggable bottom sheet** over the chat (artifact-viewer.md
 * M-ART-US-2/3, M-AC-A1.2/A2.2/A3.2/A3.3, M-BR-ART-1/5; D-ART-1 for the Android-specific
 * system-back integration). A [ModalBottomSheet] with the standard partial/full
 * detents — the user keeps chat context above the partially-raised sheet, drags it
 * toward full screen for dense content, and can always dismiss it (drag-down, the
 * close control, or back — D-AC-ART1.4). It shows the **top** of the view model's back
 * stack (one artifact at a time, M-BR-ART-1); a Back control appears once the user has
 * drilled in (M-AC-A3.2). Tapping an entity inside the current artifact pushes a new
 * one (M-AC-A3.1).
 *
 * **System/predictive back (D-ART-1).** The sheet's own back-to-dismiss handling is
 * disabled ([ModalBottomSheetDefaults.properties] `shouldDismissOnBackPress = false`)
 * so a single [BackHandler] inside the sheet's content owns 100% of back semantics: with
 * more than one entry on the stack, back **pops the stack** (D-AC-ART1.1); with exactly
 * one entry, back **dismisses the sheet** via an animated hide (D-AC-ART1.2), so system
 * back never skips straight past the sheet to the screen underneath. `BackHandler` is
 * registered inside the bottom sheet's own window/composition, so it takes priority over
 * the host screen's back handling for as long as the sheet is showing; on Android
 * versions with predictive-back support this callback participates in the platform's
 * standard predictive-back dispatch like any other, satisfying D-AC-ART1.3 without this
 * phase needing to touch the shared `AndroidManifest.xml` opt-in flag (owned by the
 * later polish phase).
 *
 * Reads [ArtifactViewModel] directly; the model owns all navigation, so this composable
 * is a thin renderer + chrome.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ArtifactSheet(viewModel: ArtifactViewModel, modifier: Modifier = Modifier) {
    val stack by viewModel.stack.collectAsState()
    val current = stack.lastOrNull() ?: return
    val canGoBack = stack.size > 1

    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = false)
    val coroutineScope = rememberCoroutineScope()
    val reduceMotion = rememberReduceMotion()

    // Mirrors the back-stack depth of the *previous* render so the drill transition can
    // tell a push (depth grew → new content slides in from the trailing edge) from a
    // back (depth shrank → from the leading edge). `previousDepth` still holds the
    // pre-swap depth during THIS render (it's only updated after, in the LaunchedEffect
    // below), so the comparison against the just-changed `stack.size` is correct.
    var previousDepth by remember { mutableStateOf(stack.size) }
    val isPush = stack.size >= previousDepth
    LaunchedEffect(stack.size) { previousDepth = stack.size }

    fun closeSheet() {
        coroutineScope.launch { sheetState.hide() }.invokeOnCompletion { viewModel.dismiss() }
    }

    ModalBottomSheet(
        onDismissRequest = viewModel::dismiss,
        modifier = modifier,
        sheetState = sheetState,
        dragHandle = { BottomSheetDefaults.DragHandle() },
        properties = ModalBottomSheetDefaults.properties(shouldDismissOnBackPress = false),
    ) {
        BackHandler(enabled = true) {
            if (canGoBack) viewModel.back() else closeSheet()
        }

        ArtifactTopBar(title = current.title, canGoBack = canGoBack, onBack = viewModel::back, onClose = ::closeSheet)

        Box(modifier = Modifier.weight(1f, fill = false)) {
            AnimatedContent(
                targetState = current,
                transitionSpec = {
                    if (reduceMotion) {
                        fadeIn(tween(120)) togetherWith fadeOut(tween(120))
                    } else if (isPush) {
                        (slideInHorizontally(initialOffsetX = { it }) + fadeIn()) togetherWith
                            (slideOutHorizontally(targetOffsetX = { -it }) + fadeOut())
                    } else {
                        (slideInHorizontally(initialOffsetX = { -it }) + fadeIn()) togetherWith
                            (slideOutHorizontally(targetOffsetX = { it }) + fadeOut())
                    }
                },
                label = "artifact-drill",
            ) { artifact ->
                ArtifactContentDispatch(content = artifact.content, onOpen = viewModel::openEntity)
            }
        }

        AskInChatBar(onClick = { viewModel.askInChat(askInChatText(current)) })
    }
}

// ---------------------------------------------------------------------------
// Chrome
// ---------------------------------------------------------------------------

@Composable
private fun ArtifactTopBar(title: String, canGoBack: Boolean, onBack: () -> Unit, onClose: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (canGoBack) {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back to previous artifact", tint = oak.textStrong)
            }
        } else {
            Spacer(Modifier.width(48.dp))
        }
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.weight(1f),
        )
        IconButton(onClick = onClose) {
            Icon(Icons.Filled.Close, contentDescription = "Close", tint = oak.textStrong)
        }
    }
}

@Composable
private fun AskInChatBar(onClick: () -> Unit) {
    val oak = LocalOakColors.current
    Button(
        onClick = onClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm)
            .navigationBarsPadding(),
        colors = ButtonDefaults.buttonColors(containerColor = oak.accent),
    ) {
        Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = null, modifier = Modifier.size(18.dp))
        Text(text = "  Ask about this in chat")
    }
}

// ---------------------------------------------------------------------------
// Content dispatch
// ---------------------------------------------------------------------------

@Composable
private fun ArtifactContentDispatch(content: ArtifactContent, onOpen: (EntityKind, String) -> Unit) {
    when (content) {
        ArtifactContent.Loading -> LoadingView()
        is ArtifactContent.Entity -> EntityDetail(artifact = content.v, onOpen = onOpen)
        is ArtifactContent.TeamSheet -> TeamArtifactDetail(team = content.v, onOpenSpecies = { onOpen(EntityKind.POKEMON, it) })
        is ArtifactContent.Comparison -> ComparisonView(subjects = content.subjects, onOpen = { onOpen(EntityKind.POKEMON, it) })
        is ArtifactContent.DamageCalcContent -> DamageCalcViewport(content.v)
        is ArtifactContent.Unavailable -> MissView(
            title = "Couldn't open ${content.query}",
            message = "Oak doesn't have a ${content.kind.rawValue} profile for “${content.query}” in this format.",
        )
        ArtifactContent.TeamUnavailable -> MissView(
            title = "Couldn't load this team",
            message = "The team couldn't be loaded. It may have been deleted, or you may need to sign in.",
        )
    }
}

@Composable
private fun DamageCalcViewport(damageCalc: DamageCalc) {
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(OakSpacing.lg),
    ) {
        DamageCalcBlock(damageCalc = damageCalc, onOpenInViewer = {}, showOpenInViewerButton = false)
    }
}

/**
 * A loading placeholder shown while an entity/team fetch settles. Merged into one
 * "Loading" element for accessibility so a screen reader announces it once rather
 * than per glyph.
 */
@Composable
private fun LoadingView() {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(OakSpacing.xxl)
            .semantics(mergeDescendants = true) { contentDescription = "Loading" },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        CircularProgressIndicator(color = oak.accent)
    }
}

/**
 * An honest miss — the sheet stays open and the user can always get back to chat
 * (M-BR-ART-5). Icon + text, never color alone.
 */
@Composable
private fun MissView(title: String, message: String) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier.fillMaxWidth().padding(OakSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Icon(Icons.AutoMirrored.Filled.HelpOutline, contentDescription = null, tint = oak.textFaint, modifier = Modifier.size(36.dp))
        Text(title, style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong, textAlign = TextAlign.Center)
        Text(message, style = MaterialTheme.typography.bodyMedium, color = oak.textMuted, textAlign = TextAlign.Center)
    }
}

// ---------------------------------------------------------------------------
// Team artifact
// ---------------------------------------------------------------------------

/**
 * Renders a team sheet in the viewer — the agent's **proposed** team (inline, no
 * fetch) or a fetched **saved** team. Mirrors the proposed/saved team cards' fidelity
 * (full member sets + warn-but-allow warnings) but as a focused, scrollable artifact.
 * Each filled member's species is tappable to drill into that Pokémon (M-AC-A3.1).
 */
@Composable
private fun TeamArtifactDetail(team: TeamArtifact, onOpenSpecies: (String) -> Unit) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (team.savedId == null) "Proposed team" else "Saved team",
                    style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.accent,
                )
                Text(team.name, style = MaterialTheme.typography.titleLarge.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
            }
            FormatPill(team.format)
        }

        if (team.warnings.isNotEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(oak.warning.copy(alpha = 0.10f), RoundedCornerShape(OakRadius.md))
                    .padding(OakSpacing.md),
                verticalArrangement = Arrangement.spacedBy(OakSpacing.xs),
            ) {
                Text("Legality", style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted)
                for (warning in team.warnings) {
                    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
                        Icon(warningIcon(warning.code), contentDescription = null, tint = oak.warning, modifier = Modifier.size(14.dp))
                        Text(warning.message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
                    }
                }
            }
        }

        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            team.members.forEachIndexed { index, member -> TeamMemberRow(index, member, onOpenSpecies) }
        }
    }
}

@Composable
private fun TeamMemberRow(index: Int, member: TeamMember, onOpenSpecies: (String) -> Unit) {
    val oak = LocalOakColors.current
    val species = member.species?.trim().orEmpty()
    val isEmpty = species.isEmpty()
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Text(
            text = "${index + 1}",
            style = MaterialTheme.typography.labelSmall,
            color = oak.textMuted,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.width(16.dp),
        )
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            if (isEmpty) {
                Text("Empty slot", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted)
            } else {
                Row(
                    modifier = Modifier.clickable { onOpenSpecies(species) },
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = titleizeNonNull(species) + itemSuffix(member.item),
                        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold),
                        color = oak.textStrong,
                    )
                    Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = oak.textFaint, modifier = Modifier.size(16.dp))
                }
            }
            abilityTeraLine(member)?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted) }
            if (member.moves.isNotEmpty()) {
                Text(
                    text = member.moves.joinToString(", ") { titleizeNonNull(it) },
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.textMuted,
                )
            }
        }
    }
}

@Composable
private fun FormatPill(format: Format) {
    val oak = LocalOakColors.current
    Text(
        text = format.shortLabel,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textMuted,
        modifier = Modifier.background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill)).padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

private fun warningIcon(code: TeamWarning.Code): ImageVector =
    if (code == TeamWarning.Code.Incomplete) Icons.Filled.Info else Icons.Filled.WarningAmber

private fun itemSuffix(item: String?): String {
    val trimmed = item?.trim().orEmpty()
    return if (trimmed.isEmpty()) "" else " @ ${titleizeNonNull(trimmed)}"
}

private fun abilityTeraLine(member: TeamMember): String? {
    val parts = buildList {
        member.ability?.trim()?.takeIf { it.isNotEmpty() }?.let { add(titleizeNonNull(it)) }
        member.teraType?.trim()?.takeIf { it.isNotEmpty() }?.let { add("Tera ${titleizeNonNull(it)}") }
    }
    return parts.takeIf { it.isNotEmpty() }?.joinToString(" · ")
}
