package ai.gowtam.oak.features.share

import ai.gowtam.oak.features.chat.answercard.AnswerCard
import ai.gowtam.oak.features.chat.oakAnswerHumanMarkdown
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.services.ShareService
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.wire.PublicShare
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class ShareSnapshotViewModel(private val shares: ShareService) : ViewModel() {
    var snapshot by mutableStateOf<PublicShare?>(null)
        private set
    var unavailable by mutableStateOf(false)
        private set
    var loading by mutableStateOf(true)
        private set

    fun load(id: String) {
        viewModelScope.launch {
            loading = true
            unavailable = false
            snapshot = null
            try {
                snapshot = shares.getPublic(id)
            } catch (e: OakError) {
                unavailable = true
            } catch (e: Exception) {
                unavailable = true
            }
            loading = false
        }
    }
}

/**
 * Native public share view via `GET /api/shares/public/:id` (SHARE-US-2).
 * Human copy allowed; no retry/edit/share/pin/fork.
 */
@Composable
fun ShareSnapshotScreen(
    viewModel: ShareSnapshotViewModel,
    shareId: String,
    onBack: () -> Unit,
    onOpenInOak: (PublicShare) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val clipboard = LocalClipboardManager.current
    LaunchedEffect(shareId) { viewModel.load(shareId) }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text(viewModel.snapshot?.conversationTitle ?: "Shared answer") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { inner ->
        when {
            viewModel.loading -> {
                Column(
                    modifier = Modifier.fillMaxSize().padding(inner),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    Spacer(Modifier.height(OakSpacing.xl))
                    CircularProgressIndicator(color = oak.accent)
                }
            }
            viewModel.unavailable || viewModel.snapshot == null -> {
                Column(modifier = Modifier.fillMaxSize().padding(inner).padding(OakSpacing.lg)) {
                    Text("This share is unavailable", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(OakSpacing.sm))
                    Text("The link was revoked or does not exist.", color = oak.textMuted)
                }
            }
            else -> {
                val snap = viewModel.snapshot!!
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(inner)
                        .verticalScroll(rememberScrollState())
                        .padding(OakSpacing.lg),
                ) {
                    Text(snap.question, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                    Spacer(Modifier.height(OakSpacing.md))
                    AnswerCard(answer = snap.answer)
                    Spacer(Modifier.height(OakSpacing.md))
                    TextButton(onClick = { clipboard.setText(AnnotatedString(oakAnswerHumanMarkdown(snap.answer))) }) {
                        Icon(Icons.Filled.ContentCopy, contentDescription = null)
                        Text("Copy as human text")
                    }
                    TextButton(onClick = { onOpenInOak(snap) }) {
                        Text("Open in Oak", color = oak.accent)
                    }
                }
            }
        }
    }
}
