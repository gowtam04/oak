package ai.gowtam.oak.features.history

import ai.gowtam.oak.features.share.shareExportedFile
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.BulkAction
import ai.gowtam.oak.wire.ConversationSummary
import ai.gowtam.oak.wire.Folder
import ai.gowtam.oak.wire.Format
import android.text.format.DateUtils
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState

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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.FilterList
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
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import ai.gowtam.oak.ui.OakTopBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
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
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlinx.coroutines.launch

/**
 * The Chat tab's signed-in root — a searchable, format-filterable list of saved
 * conversations with native Material 3 list patterns (history-and-teams.md D-HIST-1;
 * component-design.md "HistoryViewModel"). Mirrors iOS `ConversationListView`:
 * **content-only, signed-in only** — the caller (the Chat tab) mounts this only once
 * signed in and supplies the "New Chat" action; a guest instead sees the single
 * in-memory thread with a sign-in nudge (mirrors `ChatTabView`'s guest/signed-in split).
 * A right-to-left swipe on this screen opens a new chat (same as the FAB). Per-row
 * swipe-to-delete is omitted so that screen-level swipe is not stolen.
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
    /** The conversation last opened from this list, marked with the active rail on return.
     * In-memory only; the caller owns it so it survives the list⟷thread navigation. */
    activeConversationId: String? = null,
) {
    val uiState by viewModel.uiState.collectAsState()
    val scope = rememberCoroutineScope()
    val oak = LocalOakColors.current
    val context = LocalContext.current

    // Initial load; pull-to-refresh and search/filter changes re-fetch on their own.
    LaunchedEffect(Unit) { viewModel.reload() }

    var renameTarget by remember { mutableStateOf<ConversationSummary?>(null) }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text("Chats", modifier = Modifier.semantics { heading() }) },
                // New-chat moved to the floating disc for one-handed reach; the format
                // filter stays a top-bar affordance and tints accent while a filter is on.
                actions = {
                    IconButton(onClick = viewModel::toggleSelecting) {
                        Icon(
                            if (uiState.selecting) Icons.Filled.Close else Icons.Filled.Check,
                            contentDescription = if (uiState.selecting) "Cancel select" else "Select",
                            tint = if (uiState.selecting) oak.accent else oak.textMuted,
                        )
                    }
                },
            )
        },
        floatingActionButton = { NewChatFab(onClick = onNewChat) },
    ) { innerPadding ->
        Column(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            SearchField(
                query = uiState.searchQuery,
                onQueryChange = viewModel::onSearchQueryChange,
                onSearch = { scope.launch { viewModel.search() } },
            )
            OrganizeStrip(
                folders = uiState.folders,
                folderFilter = uiState.folderFilter,
                showArchived = uiState.showArchived,
                selecting = uiState.selecting,
                selectedCount = uiState.selectedIds.size,
                searchActive = uiState.searchQuery.isNotBlank(),
                includeArchivedInSearch = uiState.includeArchivedInSearch,
                onAll = { scope.launch { viewModel.setFolderFilter(null); viewModel.setShowArchived(false) } },
                onUnfiled = { scope.launch { viewModel.setFolderFilter("unfiled") } },
                onFolder = { scope.launch { viewModel.setFolderFilter(it) } },
                onArchive = { scope.launch { viewModel.setShowArchived(true) } },
                onCreateFolder = { scope.launch { viewModel.createFolder(it) } },
                onBulkArchive = { scope.launch { viewModel.bulk(if (uiState.showArchived) BulkAction.Unarchive else BulkAction.Archive) } },
                onBulkDelete = { scope.launch { viewModel.bulk(BulkAction.Delete) } },
                onBulkMove = { folderId -> scope.launch { viewModel.bulk(BulkAction.Move, folderId) } },
                onToggleIncludeArchived = { scope.launch { viewModel.setIncludeArchivedInSearch(!uiState.includeArchivedInSearch) } },
            )
            Box(modifier = Modifier.weight(1f)) {
                HistoryListContent(
                    uiState = uiState,
                    activeConversationId = activeConversationId,
                    onSelect = onSelect,
                    onTogglePin = { scope.launch { viewModel.togglePin(it) } },
                    onRequestRename = { renameTarget = it },
                    onDelete = { scope.launch { viewModel.delete(it) } },
                    onArchive = { scope.launch { viewModel.archive(it, !it.archived) } },
                    folders = uiState.folders,
                    onMoveToFolder = { summary, folderId -> scope.launch { viewModel.moveToFolder(summary, folderId) } },
                    onExport = { summary, format ->
                        scope.launch {
                            val result = viewModel.export(summary.id, format) ?: return@launch
                            shareExportedFile(context, result.first, result.second)
                        }
                    },
                    selecting = uiState.selecting,
                    selectedIds = uiState.selectedIds,
                    onToggleSelected = viewModel::toggleSelected,
                    onRefresh = { scope.launch { viewModel.reload() } },
                    onDismissError = viewModel::dismissError,
                    onNewChat = onNewChat,
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
    val pillShape = RoundedCornerShape(OakRadius.pill)
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = OakSpacing.lg, vertical = OakSpacing.sm),
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
        shape = pillShape,
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            focusedBorderColor = oak.accent,
            unfocusedBorderColor = oak.border,
            cursorColor = oak.accent,
            focusedTextColor = oak.text,
            unfocusedTextColor = oak.text,
            focusedPlaceholderColor = oak.textFaint,
            unfocusedPlaceholderColor = oak.textFaint,
        ),
    )
}



/**
 * The new-chat floating disc (moved off the top bar for one-handed reach): a 56dp accent
 * circle with a white compose glyph, floating shadow in light / hairline border in dark,
 * dipping to 0.94 on press (snappy; instant under reduce-motion). Keeps the "New chat"
 * contentDescription the top-bar button carried.
 */
@Composable
private fun NewChatFab(onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val dark = oak.isDark
    val reduceMotion = rememberReduceMotion()
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) 0.94f else 1f,
        animationSpec = if (reduceMotion) snap() else OakMotion.snappy,
        label = "newChatFabScale",
    )
    Box(
        modifier = Modifier
            .size(56.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .then(if (dark) Modifier else Modifier.shadow(6.dp, CircleShape))
            .clip(CircleShape)
            .background(oak.accent)
            .then(if (dark) Modifier.border(1.dp, oak.borderStrong, CircleShape) else Modifier)
            .clickable(
                interactionSource = interaction,
                indication = null,
                onClickLabel = "New chat",
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            Icons.Filled.Edit,
            contentDescription = "New chat",
            tint = oak.onRed,
            modifier = Modifier.size(22.dp),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HistoryListContent(
    uiState: HistoryViewModel.UiState,
    activeConversationId: String?,
    onSelect: (ConversationSummary) -> Unit,
    onTogglePin: (ConversationSummary) -> Unit,
    onRequestRename: (ConversationSummary) -> Unit,
    onDelete: (ConversationSummary) -> Unit,
    onArchive: (ConversationSummary) -> Unit,
    folders: List<Folder>,
    onMoveToFolder: (ConversationSummary, String?) -> Unit,
    onExport: (ConversationSummary, String) -> Unit,
    selecting: Boolean,
    selectedIds: Set<String>,
    onToggleSelected: (String) -> Unit,
    onRefresh: () -> Unit,
    onDismissError: () -> Unit,
    onNewChat: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = uiState.isLoading,
        onRefresh = onRefresh,
        modifier = Modifier
            .fillMaxSize()
            .swipeToNewChat(enabled = !selecting, onNewChat = onNewChat),
    ) {
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
                // Leave room below the last row for the floating new-chat disc.
                contentPadding = PaddingValues(bottom = 88.dp),
            ) {
                if (pinned.isNotEmpty()) {
                    item(key = "pinned-header") { SectionHeader("Pinned") }
                    items(pinned, key = { it.id }) { conversation ->
                        ConversationRow(conversation, conversation.id == activeConversationId, onSelect, onTogglePin, onRequestRename, onDelete, onArchive, folders, onMoveToFolder, onExport, selecting, conversation.id in selectedIds, onToggleSelected)
                    }
                }
                items(others, key = { it.id }) { conversation ->
                    ConversationRow(conversation, conversation.id == activeConversationId, onSelect, onTogglePin, onRequestRename, onDelete, onArchive, folders, onMoveToFolder, onExport, selecting, conversation.id in selectedIds, onToggleSelected)
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
 * One conversation row's full interaction surface: tap to open, a pin toggle,
 * and an overflow menu (rename / pin / archive / delete) — the same actions iOS
 * exposes via context menu. Row swipe is intentionally not used; a screen-level
 * right-to-left swipe opens a new chat instead.
 */
@Composable
private fun ConversationRow(
    conversation: ConversationSummary,
    active: Boolean,
    onSelect: (ConversationSummary) -> Unit,
    onTogglePin: (ConversationSummary) -> Unit,
    onRequestRename: (ConversationSummary) -> Unit,
    onDelete: (ConversationSummary) -> Unit,
    onArchive: (ConversationSummary) -> Unit,
    folders: List<Folder>,
    onMoveToFolder: (ConversationSummary, String?) -> Unit,
    onExport: (ConversationSummary, String) -> Unit,
    selecting: Boolean,
    selected: Boolean,
    onToggleSelected: (String) -> Unit,
) {
    val oak = LocalOakColors.current
    var showMenu by remember { mutableStateOf(false) }
    val plateShape = RoundedCornerShape(OakRadius.md)
    val highlighted = active || selected
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = OakSpacing.md, vertical = 4.dp)
            .clip(plateShape)
            .background(if (highlighted) oak.accentSoft else MaterialTheme.colorScheme.surface, plateShape)
            .border(1.dp, if (highlighted) oak.accent.copy(alpha = 0.35f) else oak.border, plateShape)
            .clickable { if (selecting) onToggleSelected(conversation.id) else onSelect(conversation) }
            .padding(horizontal = OakSpacing.md, vertical = 10.dp),
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
                    style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.SemiBold),
                    color = if (highlighted) oak.accent else oak.textStrong,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            // Meta line in the instrument voice: "GEN 9 · 19H AGO" (existing scope
            // label uppercased + compact relative time).
            Text(
                text = "${conversation.format.shortLabel.uppercase()} · ${compactRelativeTime(conversation.updatedAt)}",
                style = MaterialTheme.typography.labelSmall,
                color = oak.textMuted,
                maxLines = 1,
            )
        }
        if (active) {
            Text(
                text = "OPEN",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                color = oak.accent,
                modifier = Modifier
                    .padding(end = OakSpacing.xs)
                    .clip(RoundedCornerShape(4.dp))
                    .background(oak.accent.copy(alpha = 0.08f))
                    .border(1.dp, oak.accent.copy(alpha = 0.35f), RoundedCornerShape(4.dp))
                    .padding(horizontal = 7.dp, vertical = 3.dp),
            )
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
                    text = { Text(if (conversation.archived) "Unarchive" else "Archive") },
                    onClick = { showMenu = false; onArchive(conversation) },
                )
                DropdownMenuItem(
                    text = { Text("Move to Unfiled") },
                    onClick = { showMenu = false; onMoveToFolder(conversation, null) },
                )
                folders.forEach { folder ->
                    DropdownMenuItem(
                        text = { Text("Move to ${folder.name}") },
                        onClick = { showMenu = false; onMoveToFolder(conversation, folder.id) },
                    )
                }
                DropdownMenuItem(
                    text = { Text("Export Markdown") },
                    onClick = { showMenu = false; onExport(conversation, "md") },
                )
                DropdownMenuItem(
                    text = { Text("Export PDF") },
                    onClick = { showMenu = false; onExport(conversation, "pdf") },
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

@Composable
private fun OrganizeStrip(
    folders: List<Folder>,
    folderFilter: String?,
    showArchived: Boolean,
    selecting: Boolean,
    selectedCount: Int,
    searchActive: Boolean,
    includeArchivedInSearch: Boolean,
    onAll: () -> Unit,
    onUnfiled: () -> Unit,
    onFolder: (String) -> Unit,
    onArchive: () -> Unit,
    onCreateFolder: (String) -> Unit,
    onBulkArchive: () -> Unit,
    onBulkDelete: () -> Unit,
    onBulkMove: (String?) -> Unit,
    onToggleIncludeArchived: () -> Unit,
) {
    val oak = LocalOakColors.current
    var newFolder by remember { mutableStateOf(false) }
    var folderName by remember { mutableStateOf("") }
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = OakSpacing.lg, vertical = OakSpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            FilterChip(label = "All", selected = folderFilter == null && !showArchived, onClick = onAll)
            FilterChip(label = "Unfiled", selected = folderFilter == "unfiled", onClick = onUnfiled)
            FilterChip(label = "Archive", selected = showArchived, onClick = onArchive)
            folders.forEach { folder ->
                FilterChip(label = folder.name, selected = folderFilter == folder.id, onClick = { onFolder(folder.id) })
            }
            FilterChip(label = "+ Folder", selected = false, onClick = { newFolder = true })
            if (searchActive) {
                FilterChip(
                    label = if (includeArchivedInSearch) "Including archived" else "Include archived",
                    selected = includeArchivedInSearch,
                    onClick = onToggleIncludeArchived,
                )
            }
        }
        if (selecting && selectedCount > 0) {
            Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), modifier = Modifier.padding(top = OakSpacing.xs)) {
                TextButton(onClick = onBulkArchive) { Text(if (showArchived) "Unarchive" else "Archive", color = oak.accent) }
                TextButton(onClick = onBulkDelete) { Text("Delete", color = oak.danger) }
                TextButton(onClick = { onBulkMove(null) }) { Text("Unfile", color = oak.accent) }
                folders.forEach { folder ->
                    TextButton(onClick = { onBulkMove(folder.id) }) { Text(folder.name, color = oak.accent) }
                }
            }
        }
    }
    if (newFolder) {
        AlertDialog(
            onDismissRequest = { newFolder = false },
            title = { Text("New folder") },
            text = { OutlinedTextField(value = folderName, onValueChange = { folderName = it }, singleLine = true, label = { Text("Name") }) },
            confirmButton = {
                TextButton(onClick = {
                    onCreateFolder(folderName)
                    folderName = ""
                    newFolder = false
                }) { Text("Create", color = oak.accent) }
            },
            dismissButton = { TextButton(onClick = { newFolder = false }) { Text("Cancel", color = oak.textMuted) } },
        )
    }
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.pill)
    Text(
        text = label,
        style = MaterialTheme.typography.labelMedium,
        color = if (selected) oak.accent else oak.textMuted,
        modifier = Modifier
            .clip(shape)
            .background(if (selected) oak.accentSoft else MaterialTheme.colorScheme.surface)
            .border(1.dp, if (selected) oak.accent.copy(alpha = 0.35f) else oak.border, shape)
            .clickable(onClick = onClick)
            .padding(horizontal = OakSpacing.sm, vertical = 4.dp),
    )
}

@Composable
private fun RenameDialog(initialTitle: String, onConfirm: (String) -> Unit, onDismiss: () -> Unit) {
    var text by remember { mutableStateOf(initialTitle) }
    val oak = LocalOakColors.current
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Rename conversation") },
        text = {
            OutlinedTextField(value = text, onValueChange = { text = it }, singleLine = true, label = { Text("Title") })
        },
        confirmButton = { TextButton(onClick = { onConfirm(text) }) { Text("Save", color = oak.accent) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel", color = oak.textMuted) } },
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(OakRadius.lg),
        titleContentColor = oak.textStrong,
        textContentColor = oak.text,
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

/**
 * Observes a right-to-left swipe on the chats list and opens a new chat.
 * Does not consume pointer events, so vertical scroll and pull-to-refresh still
 * win. Gestures that begin in the system-back edge insets are ignored. No-ops
 * while [enabled] is false (Select mode).
 */
private fun Modifier.swipeToNewChat(enabled: Boolean, onNewChat: () -> Unit): Modifier {
    if (!enabled) return this
    return pointerInput(onNewChat) {
        val minDistance = 72.dp.toPx()
        val edgeIgnore = 24.dp.toPx()
        awaitEachGesture {
            val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            val startX = down.position.x
            var totalX = 0f
            var totalY = 0f
            while (true) {
                val event = awaitPointerEvent(PointerEventPass.Initial)
                val change = event.changes.firstOrNull() ?: break
                totalX += change.position.x - change.previousPosition.x
                totalY += change.position.y - change.previousPosition.y
                if (event.changes.all { !it.pressed }) {
                    val startedAtEdge = startX < edgeIgnore || startX > size.width - edgeIgnore
                    if (!startedAtEdge &&
                        totalX < -minDistance &&
                        abs(totalX) > abs(totalY) * 1.2f
                    ) {
                        onNewChat()
                    }
                    break
                }
            }
        }
    }
}

/**
 * A compact, uppercase relative time for the instrument meta line — "NOW", "19M AGO",
 * "19H AGO", "3D AGO", "2W AGO". Abbreviates the buckets [DateUtils] would spell out.
 */
private fun compactRelativeTime(updatedAtMillis: Long): String {
    val diff = (System.currentTimeMillis() - updatedAtMillis).coerceAtLeast(0L)
    val minute = DateUtils.MINUTE_IN_MILLIS
    val hour = DateUtils.HOUR_IN_MILLIS
    val day = DateUtils.DAY_IN_MILLIS
    val week = DateUtils.WEEK_IN_MILLIS
    return when {
        diff < minute -> "NOW"
        diff < hour -> "${diff / minute}M AGO"
        diff < day -> "${diff / hour}H AGO"
        diff < week -> "${diff / day}D AGO"
        else -> "${diff / week}W AGO"
    }
}
