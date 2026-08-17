package ai.gowtam.oak.features.chat

import ai.gowtam.oak.features.chat.answercard.oakAnswerAgentMarkdown
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.automirrored.filled.CallSplit
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString

/**
 * Card action row: human copy (always), plus signed-in Share / Pin / Fork,
 * and last-card-only Retry (REC-US-1, COPY-US-1, SHARE-US-1, PIN-US-1, FORK-US-1).
 */
@Composable
fun TurnActions(
    answer: ai.gowtam.oak.wire.OakAnswer,
    isLastAssistant: Boolean,
    isSignedIn: Boolean,
    isPinned: Boolean,
    canRetry: Boolean,
    onRetry: () -> Unit,
    onPin: () -> Unit,
    onFork: () -> Unit,
    onShare: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val clipboard = LocalClipboardManager.current
    var menuOpen by remember { mutableStateOf(false) }

    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        IconButton(
            onClick = { clipboard.setText(AnnotatedString(oakAnswerHumanMarkdown(answer))) },
        ) {
            Icon(Icons.Filled.ContentCopy, contentDescription = "Copy as human text", tint = oak.textMuted)
        }
        IconButton(
            onClick = { clipboard.setText(AnnotatedString(oakAnswerAgentMarkdown(answer))) },
        ) {
            Icon(Icons.Filled.ContentCopy, contentDescription = "Copy for agents", tint = oak.textFaint)
        }
        if (isLastAssistant && canRetry) {
            IconButton(onClick = onRetry) {
                Icon(Icons.Filled.Refresh, contentDescription = "Retry", tint = oak.textMuted)
            }
        }
        if (isSignedIn) {
            Box {
                IconButton(onClick = { menuOpen = true }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "More actions", tint = oak.textMuted)
                }
                DropdownMenu(
                    expanded = menuOpen,
                    onDismissRequest = { menuOpen = false },
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(OakRadius.md),
                ) {
                    DropdownMenuItem(
                        text = { Text(if (isPinned) "Unpin" else "Pin") },
                        leadingIcon = {
                            Icon(
                                if (isPinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                                contentDescription = null,
                            )
                        },
                        onClick = { menuOpen = false; onPin() },
                    )
                    DropdownMenuItem(
                        text = { Text("Fork") },
                        leadingIcon = { Icon(Icons.AutoMirrored.Filled.CallSplit, contentDescription = null) },
                        onClick = { menuOpen = false; onFork() },
                    )
                    DropdownMenuItem(
                        text = { Text("Share") },
                        leadingIcon = { Icon(Icons.Filled.Share, contentDescription = null) },
                        onClick = { menuOpen = false; onShare() },
                    )
                }
            }
        }
    }
}
