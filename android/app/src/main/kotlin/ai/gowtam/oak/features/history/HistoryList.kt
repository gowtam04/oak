package ai.gowtam.oak.features.history

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Format
import android.text.format.DateUtils
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material.icons.outlined.PushPin
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import ai.gowtam.oak.ui.OakTopBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberSwipeToDismissBoxState
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * The Chat tab's signed-in root — a searchable, format-filterable list of saved
 * conversations with native Material 3 list patterns (history-and-teams.md D-HIST-1;
 * component-design.md "HistoryViewModel"). Mirrors iOS `ConversationListView`:
 * **content-only, signed-in only** — the caller (the Chat tab) mounts this only once
 * signed in and supplies the "New Chat" action; a guest instead sees the single
 * in-memory thread with a sign-in nudge (mirrors `ChatTabView`'s guest/signed-in split).
 *
 * Selecting a row hands the conversation back via [onSelect], which the caller uses
 * to load the full detail and resume it into [ai.gowtam.oak.features.chat.ChatViewModel].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel,
    onSelect: (ConversationSummary) -> Unit,
    onNewChat: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()

    // Initial load; pull-to-refresh and search/filter changes re-fetch on their own.
    LaunchedEffect(Unit) { viewModel.reload() }

    var renameTarget by remember { mutableStateOf<ConversationSummary?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text("Chats", modifier = Modifier.semantics { heading() }) },
                actions = {
                    IconButton(onClick = onNewChat) {
                        Icon(Icons.Filled.Add, contentDescription = "New chat")
                    }
                },
            )
        },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            SearchField(
                query = uiState.searchQuery,
                onQueryChange = viewModel::onSearchQueryChange,
                onSearch = { scope.launch { viewModel.search() } },
            )
            FormatFilterRow(
                current = uiState.formatFilter,
                onSelect = { format -> scope.launch { viewModel.setFormatFilter(format) } },
            )
            Box(modifier = Modifier.weight(1f)) {
                HistoryListContent(
                    uiState = uiState,
                    onSelect = onSelect,
                    onTogglePin = { scope.launch { viewModel.togglePin(it) } },
                    onRequestRename = { renameTarget = it },
                    onDelete = { scope.launch { viewModel.delete(it) } },
                    onRefresh = { scope.launch { viewModel.reload() } },
                    onDismissError = viewModel::dismissError,
                )
            }
        }
    }

    renameTarget?.let { target ->
        RenameDialog(
            initialTitle = target.title,
            onConfirm = { newTitle ->
                scope.launch { viewModel.rename(target, newTitle) }
                renameTarget = null
            },
            onDismiss = { renameTarget = null },
        )
    }
}

@Composable
private fun SearchField(query: String, onQueryChange: (String) -> Unit, onSearch: () -> Unit) {
    val oak = LocalOakColors.current
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
        placeholder = { Text("Search conversations") },
        singleLine = true,
        leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null, tint = oak.textMuted) },
        trailingIcon = {
            if (query.isNotEmpty()) {
                IconButton(onClick = { onQueryChange("") }) {
                    Icon(Icons.Filled.Close, contentDescription = "Clear search", tint = oak.textMuted)
                }
            }
        },
        shape = RoundedCornerShape(OakRadius.pill),
    )
}

/** iOS parity: exactly three chips (All / Gen 9 / Champions) — NOT a six-way filter
 * (that is the Teams list's job). Conversation history stays scoped to the two most
 * common formats for now (mirrors `ConversationListView.formatFilterMenu`). */
@Composable
private fun FormatFilterRow(current: Format?, onSelect: (Format?) -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.lg, vertical = OakSpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        FilterChip(selected = current == null, onClick = { onSelect(null) }, label = { Text("All") })
        FilterChip(
            selected = current == Format.ScarletViolet,
            onClick = { onSelect(Format.ScarletViolet) },
            label = { Text("Gen 9") },
        )
        FilterChip(
            selected = current == Format.Champions,
            onClick = { onSelect(Format.Champions) },
            label = { Text("Champions") },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryListContent(
    uiState: HistoryViewModel.UiState,
    onSelect: (ConversationSummary) -> Unit,
    onTogglePin: (ConversationSummary) -> Unit,
    onRequestRename: (ConversationSummary) -> Unit,
    onDelete: (ConversationSummary) -> Unit,
    onRefresh: () -> Unit,
    onDismissError: () -> Unit,
) {
    PullToRefreshBox(isRefreshing = uiState.isLoading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        if (uiState.conversations.isEmpty()) {
            if (uiState.isLoading) {
                LoadingState()
            } else {
                EmptyState(searchActive = uiState.searchQuery.isNotBlank() || uiState.formatFilter != null)
            }
        } else {
            val pinned = uiState.conversations.filter { it.pinned }
            val others = uiState.conversations.filterNot { it.pinned }
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(bottom = OakSpacing.xxl),
            ) {
                if (pinned.isNotEmpty()) {
                    item(key = "pinned-header") { SectionHeader("Pinned") }
                    items(pinned, key = { it.id }) { conversation ->
                        ConversationRow(conversation, onSelect, onTogglePin, onRequestRename, onDelete)
                    }
                }
                items(others, key = { it.id }) { conversation ->
                    ConversationRow(conversation, onSelect, onTogglePin, onRequestRename, onDelete)
                }
            }
        }

        uiState.errorMessage?.let { message ->
            Box(modifier = Modifier.fillMaxSize().padding(OakSpacing.lg), contentAlignment = Alignment.BottomCenter) {
                ErrorBanner(message = message, onDismiss = onDismissError)
            }
        }
    }
}

@Composable
private fun SectionHeader(title: String) {
    val oak = LocalOakColors.current
    Text(
        text = title,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textMuted,
        modifier = Modifier.padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
    )
}

/**
 * One conversation row's full interaction surface: tap to open, a trailing swipe to
 * delete (Material 3 [SwipeToDismissBox]), a leading pin toggle, and an overflow menu
 * (rename / pin / delete) — the same actions iOS exposes via swipe + context menu.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationRow(
    conversation: ConversationSummary,
    onSelect: (ConversationSummary) -> Unit,
    onTogglePin: (ConversationSummary) -> Unit,
    onRequestRename: (ConversationSummary) -> Unit,
    onDelete: (ConversationSummary) -> Unit,
) {
    val oak = LocalOakColors.current
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { value ->
            if (value == SwipeToDismissBoxValue.EndToStart) {
                onDelete(conversation)
                true
            } else {
                false
            }
        },
    )

    SwipeToDismissBox(
        state = dismissState,
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true,
        backgroundContent = {
            Row(
                modifier = Modifier
                    .fillMaxSize()
                    .background(oak.danger.copy(alpha = 0.85f))
                    .padding(horizontal = OakSpacing.lg),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Delete, contentDescription = null, tint = Color.White)
            }
        },
    ) {
        var showMenu by remember { mutableStateOf(false) }
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .background(if (conversation.pinned) oak.accentSoft.copy(alpha = 0.4f) else Color.Transparent)
                .clickable { onSelect(conversation) }
                .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    if (conversation.pinned) {
                        Icon(
                            Icons.Filled.PushPin,
                            contentDescription = "Pinned",
                            tint = oak.accent,
                            modifier = Modifier.size(14.dp),
                        )
                    }
                    Text(
                        text = conversation.title,
                        style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium),
                        color = oak.textStrong,
                        maxLines = 1,
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(conversation.format.shortLabel, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                    Text("·", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                    Text(relativeTime(conversation.updatedAt), style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                }
            }
            IconButton(onClick = { onTogglePin(conversation) }) {
                Icon(
                    if (conversation.pinned) Icons.Filled.PushPin else Icons.Outlined.PushPin,
                    contentDescription = if (conversation.pinned) "Unpin" else "Pin",
                    tint = oak.textMuted,
                )
            }
            Box {
                IconButton(onClick = { showMenu = true }) {
                    Icon(Icons.Filled.MoreVert, contentDescription = "More options", tint = oak.textMuted)
                }
                DropdownMenu(expanded = showMenu, onDismissRequest = { showMenu = false }) {
                    DropdownMenuItem(
                        text = { Text("Rename") },
                        leadingIcon = { Icon(Icons.Filled.Edit, contentDescription = null) },
                        onClick = { showMenu = false; onRequestRename(conversation) },
                    )
                    DropdownMenuItem(
                        text = { Text(if (conversation.pinned) "Unpin" else "Pin") },
                        leadingIcon = { Icon(Icons.Filled.PushPin, contentDescription = null) },
                        onClick = { showMenu = false; onTogglePin(conversation) },
                    )
                    DropdownMenuItem(
                        text = { Text("Delete") },
                        leadingIcon = { Icon(Icons.Filled.Delete, contentDescription = null, tint = oak.danger) },
                        onClick = { showMenu = false; onDelete(conversation) },
                    )
                }
            }
        }
    }
}

@Composable
private fun RenameDialog(initialTitle: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(initialTitle) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename conversation") },
        text = {
            OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true, label = { Text("Title") })
        },
        confirmButton = { TextButton(onClick = { onConfirm(text) }) { Text("Save") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = LocalOakColors.current.accent)
    }
}

@Composable
private fun EmptyState(searchActive: Boolean) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier.fillMaxSize().padding(horizontal = OakSpacing.xxl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(
            Icons.AutoMirrored.Filled.Chat,
            contentDescription = null,
            tint = oak.textFaint,
            modifier = Modifier.size(48.dp),
        )
        Spacer(Modifier.height(OakSpacing.md))
        Text(
            text = if (searchActive) "No matches" else "No conversations yet",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
        Spacer(Modifier.height(OakSpacing.xs))
        Text(
            text = if (searchActive) {
                "No saved conversations match your search."
            } else {
                "Conversations you have with Oak are saved here automatically."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

@Composable
private fun ErrorBanner(message: String, onDismiss: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.lg))
            .padding(OakSpacing.md),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.Top,
    ) {
        Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.danger, modifier = Modifier.size(18.dp))
        Text(message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong, modifier = Modifier.weight(1f))
        TextButton(onClick = onDismiss) { Text("Dismiss") }
    }
}

private fun relativeTime(updatedAtMillis: Long): String =
    DateUtils.getRelativeTimeSpanString(
        updatedAtMillis,
        System.currentTimeMillis(),
        DateUtils.MINUTE_IN_MILLIS,
    ).toString()
