package ai.gowtam.oak.features.dex

import ai.gowtam.oak.features.artifact.EntityDetail
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.SearchMatch
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp

/**
 * Dex list surface — section chips, scope menu, search, match rows.
 * Navigation to detail is owned by [DexRoute].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DexListScreen(
    viewModel: DexViewModel,
    onOpen: (EntityKind, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val list by viewModel.list.collectAsState()
    val oak = LocalOakColors.current
    var scopeMenuOpen by remember { mutableStateOf(false) }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text("Dex", modifier = Modifier.semantics { heading() }) },
                actions = {
                    Box {
                        TextButton(onClick = { scopeMenuOpen = true }) {
                            Text(list.format.shortLabel, color = oak.accent, fontWeight = FontWeight.SemiBold)
                        }
                        DropdownMenu(
                            expanded = scopeMenuOpen,
                            onDismissRequest = { scopeMenuOpen = false },
                        ) {
                            Format.knownCases.forEach { format ->
                                DropdownMenuItem(
                                    text = { Text(format.displayLabel) },
                                    onClick = {
                                        scopeMenuOpen = false
                                        viewModel.selectFormat(format)
                                    },
                                    leadingIcon = if (format == list.format) {
                                        { Icon(Icons.Filled.Check, contentDescription = null, tint = oak.accent) }
                                    } else {
                                        null
                                    },
                                )
                            }
                        }
                    }
                },
            )
        },
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background),
        ) {
            SectionChips(
                selected = list.section,
                onSelect = viewModel::selectSection,
                modifier = Modifier.padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
            )

            OutlinedTextField(
                value = list.query,
                onValueChange = viewModel::setQuery,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = OakSpacing.md)
                    .padding(bottom = OakSpacing.sm),
                placeholder = { Text("Search ${list.section.title.lowercase()}…") },
                leadingIcon = { Icon(Icons.Filled.Search, contentDescription = null) },
                trailingIcon = {
                    if (list.query.isNotEmpty()) {
                        IconButton(onClick = { viewModel.setQuery("") }) {
                            Icon(Icons.Filled.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(OakRadius.md),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = oak.accent,
                    unfocusedBorderColor = oak.border,
                    focusedContainerColor = oak.surfaceRaised,
                    unfocusedContainerColor = oak.surfaceRaised,
                ),
            )

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                when {
                    list.isLoading && list.matches.isEmpty() -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = oak.accent,
                        )
                    }
                    list.matches.isEmpty() -> {
                        EmptyMatches(
                            sectionTitle = list.section.title,
                            hasQuery = list.query.isNotEmpty(),
                            modifier = Modifier.align(Alignment.Center).padding(OakSpacing.lg),
                        )
                    }
                    else -> {
                        LazyColumn(modifier = Modifier.fillMaxSize()) {
                            items(list.matches, key = { "${it.kind.rawValue}:${it.slug}" }) { match ->
                                MatchRow(match = match, onClick = { onOpen(match.kind, match.slug) })
                                HorizontalDivider(color = oak.border)
                            }
                            if (list.query.isEmpty()) {
                                item {
                                    Text(
                                        "Showing the first results — type to search the full index.",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = oak.textMuted,
                                        modifier = Modifier.padding(OakSpacing.md),
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionChips(
    selected: DexSection,
    onSelect: (DexSection) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    Row(
        modifier = modifier.horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
    ) {
        DexSection.entries.forEach { section ->
            val isSelected = section == selected
            val shape = RoundedCornerShape(percent = 50)
            Text(
                text = section.title,
                style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
                color = if (isSelected) oak.accent else oak.textMuted,
                modifier = Modifier
                    .clip(shape)
                    .background(if (isSelected) oak.accentSoft else oak.surfaceRaised)
                    .border(1.dp, if (isSelected) oak.accent.copy(alpha = 0.35f) else oak.border, shape)
                    .clickable { onSelect(section) }
                    .padding(horizontal = 12.dp, vertical = 8.dp)
                    .semantics { this.selected = isSelected },
            )
        }
    }
}

@Composable
private fun MatchRow(match: SearchMatch, onClick: () -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = match.displayName,
            style = MaterialTheme.typography.bodyLarge,
            color = oak.text,
            modifier = Modifier.weight(1f),
        )
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = oak.textMuted)
    }
}

@Composable
private fun EmptyMatches(sectionTitle: String, hasQuery: Boolean, modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            if (hasQuery) "No matches" else "No entries",
            style = MaterialTheme.typography.titleMedium,
            color = oak.textStrong,
        )
        Spacer(Modifier.size(OakSpacing.xs))
        Text(
            if (hasQuery) {
                "Try a different name or scope."
            } else {
                "Type to search the full ${sectionTitle.lowercase()} index."
            },
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * Dex detail surface — loads via [DexViewModel.loadDetail] and renders
 * [EntityDetail] (or loading / miss chrome). Drill-ins call [onOpen].
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DexDetailScreen(
    viewModel: DexViewModel,
    kind: EntityKind,
    query: String,
    onBack: () -> Unit,
    onOpen: (EntityKind, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val detail by viewModel.detail.collectAsState()
    val list by viewModel.list.collectAsState()
    val oak = LocalOakColors.current

    LaunchedEffect(kind, query, list.format) {
        viewModel.loadDetail(kind, query)
    }

    val title = when (val d = detail) {
        is DexViewModel.DetailState.Ready -> d.artifact.resolved.displayName
        else -> query
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { Text(title) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        },
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background),
        ) {
            when (val d = detail) {
                null, DexViewModel.DetailState.Loading -> {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = oak.accent,
                    )
                }
                is DexViewModel.DetailState.Ready -> {
                    EntityDetail(
                        artifact = d.artifact,
                        requestFormat = list.format,
                        onOpen = onOpen,
                        modifier = Modifier.fillMaxSize(),
                    )
                }
                is DexViewModel.DetailState.Unavailable -> {
                    Column(
                        modifier = Modifier
                            .fillMaxSize()
                            .verticalScroll(rememberScrollState())
                            .padding(OakSpacing.lg),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center,
                    ) {
                        Text(
                            "Couldn't open ${d.query}",
                            style = MaterialTheme.typography.titleMedium,
                            color = oak.textStrong,
                            textAlign = TextAlign.Center,
                        )
                        Spacer(Modifier.size(OakSpacing.sm))
                        Text(
                            "Oak doesn't have a ${d.kind.rawValue} profile for “${d.query}” in this format.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = oak.textMuted,
                            textAlign = TextAlign.Center,
                        )
                        if (d.suggestions.isNotEmpty()) {
                            Spacer(Modifier.size(OakSpacing.md))
                            Text(
                                "Did you mean…",
                                style = MaterialTheme.typography.labelLarge,
                                color = oak.textMuted,
                            )
                            Spacer(Modifier.size(OakSpacing.sm))
                            d.suggestions.forEach { suggestion ->
                                Text(
                                    text = suggestion,
                                    color = oak.accent,
                                    fontWeight = FontWeight.SemiBold,
                                    modifier = Modifier
                                        .padding(vertical = 4.dp)
                                        .clip(CircleShape)
                                        .background(oak.surfaceRaised)
                                        .clickable { onOpen(d.kind, suggestion) }
                                        .padding(horizontal = 12.dp, vertical = 6.dp),
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
