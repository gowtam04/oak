package ai.gowtam.oak.features.account

import ai.gowtam.oak.app.LocalServices
import ai.gowtam.oak.services.ShareService
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.ShareListItem
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import kotlinx.coroutines.launch

/**
 * Shared-by-me list on Account (SHARE-US-4 / ADR-11). Live links + revoke.
 */
@Composable
fun SharedByMe(
    shareService: ShareService? = LocalServices.current?.shares,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val scope = rememberCoroutineScope()
    var shares by remember { mutableStateOf<List<ShareListItem>>(emptyList()) }
    var loaded by remember { mutableStateOf(false) }

    LaunchedEffect(shareService) {
        if (shareService == null) return@LaunchedEffect
        shares = runCatching { shareService.list() }.getOrDefault(emptyList())
        loaded = true
    }

    Column(modifier = modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        Text("Shared by me", style = MaterialTheme.typography.titleSmall, color = oak.textMuted)
        if (!loaded) return
        if (shares.isEmpty()) {
            Text(
                text = "No live share links.",
                style = MaterialTheme.typography.bodySmall,
                color = oak.textMuted,
            )
            return
        }
        for (share in shares) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = OakSpacing.xs),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(share.conversationTitle, style = MaterialTheme.typography.bodyMedium)
                    Text(share.url, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                }
                TextButton(
                    onClick = {
                        val svc = shareService ?: return@TextButton
                        scope.launch {
                            runCatching { svc.revoke(share.id) }
                            shares = shares.filterNot { it.id == share.id }
                        }
                    },
                ) { Text("Revoke", color = oak.danger) }
            }
        }
    }
}
