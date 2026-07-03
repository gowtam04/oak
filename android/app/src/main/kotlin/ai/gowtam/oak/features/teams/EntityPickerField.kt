package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.titleizeTeamSlug
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay

/**
 * One picker suggestion — a slug/display-name pair, optionally with a secondary hint
 * (a move's type/category/power). Mirrors `PickerOption`
 * (`web/src/components/teams/dex-constants.ts`; `ios/…/EntityPickerField.swift`).
 */
data class PickerOption(val slug: String, val displayName: String, val hint: String? = null)

/**
 * Where an [EntityPickerField]'s suggestions come from — mirrors iOS `PickerSource`'s
 * two sources: a debounced network search scoped to one [EntityKind], or a static,
 * locally-filtered option list (a species' legal abilities/movepool, or a fixed
 * nature/Tera-type set).
 */
sealed interface PickerSource {
    data class Search(val kind: EntityKind) : PickerSource
    data class Options(val options: List<PickerOption>) : PickerSource
}

/** Debounce window for a [PickerSource.Search] query — mirrors `EntityPicker.tsx`'s 150ms. */
private const val SEARCH_DEBOUNCE_MS = 150L

/**
 * A require-selection entity field: a tappable row showing the current (titleized)
 * value, opening a full-screen search/browse dialog to commit a new slug. The Android
 * analog of iOS `EntityPickerRow`/`EntityPickerSheet` and web's `EntityPicker.tsx`
 * combobox. Slugs are stored/committed verbatim; only the interaction shape differs
 * per platform.
 */
@Composable
fun EntityPickerField(
    title: String,
    value: String,
    source: PickerSource,
    search: suspend (EntityKind, String) -> List<PickerOption>,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    placeholder: String = "Not set",
    enabled: Boolean = true,
    displayNameOverride: ((String) -> String)? = null,
) {
    var isOpen by remember { mutableStateOf(false) }
    val oak = LocalOakColors.current
    val label = if (value.isBlank()) placeholder else (displayNameOverride?.invoke(value) ?: titleizeTeamSlug(value))

    Row(
        modifier = modifier
            .fillMaxWidth()
            .clickable(enabled = enabled) { isOpen = true }
            .padding(vertical = OakSpacing.xs),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text = title, style = MaterialTheme.typography.bodyMedium, color = oak.textStrong)
        Text(
            text = label,
            style = MaterialTheme.typography.bodyMedium,
            color = if (value.isBlank() || !enabled) oak.textMuted else oak.text,
        )
    }

    if (isOpen) {
        EntityPickerDialog(
            title = title,
            source = source,
            currentValue = value,
            search = search,
            onSelect = { onValueChange(it); isOpen = false },
            onDismiss = { isOpen = false },
        )
    }
}

/**
 * The full-screen search/browse dialog an [EntityPickerField] opens. Debounces network
 * search ([PickerSource.Search]); filters a static option list locally with no
 * debounce ([PickerSource.Options]). A blank query browses the full list either way.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EntityPickerDialog(
    title: String,
    source: PickerSource,
    currentValue: String,
    search: suspend (EntityKind, String) -> List<PickerOption>,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var results by remember { mutableStateOf<List<PickerOption>>(emptyList()) }

    LaunchedEffect(query, source) {
        when (source) {
            is PickerSource.Options -> {
                val lower = query.trim().lowercase()
                results = if (lower.isEmpty()) {
                    source.options
                } else {
                    source.options.filter {
                        it.displayName.lowercase().contains(lower) || it.slug.lowercase().contains(lower)
                    }
                }
            }
            is PickerSource.Search -> {
                if (query.isNotEmpty()) delay(SEARCH_DEBOUNCE_MS)
                results = search(source.kind, query.trim())
            }
        }
    }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column {
                TopAppBar(
                    title = { Text(title) },
                    navigationIcon = {
                        IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Cancel") }
                    },
                )
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    placeholder = { Text("Search") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth().padding(OakSpacing.md),
                )
                LazyColumn(modifier = Modifier.fillMaxSize()) {
                    if (currentValue.isNotBlank()) {
                        item {
                            ListItem(
                                headlineContent = { Text("Clear selection") },
                                leadingContent = { Icon(Icons.Filled.Clear, contentDescription = null) },
                                modifier = Modifier.clickable { onSelect("") },
                            )
                        }
                    }
                    if (results.isEmpty()) {
                        item {
                            Text(
                                text = "No matches",
                                style = MaterialTheme.typography.bodyMedium,
                                color = LocalOakColors.current.textMuted,
                                modifier = Modifier.padding(OakSpacing.lg),
                            )
                        }
                    } else {
                        items(results, key = { it.slug }) { option ->
                            ListItem(
                                headlineContent = { Text(option.displayName) },
                                supportingContent = option.hint?.let { hint -> { Text(hint) } },
                                trailingContent = if (option.slug == currentValue) {
                                    { Icon(Icons.Filled.Check, contentDescription = null, tint = LocalOakColors.current.accent) }
                                } else {
                                    null
                                },
                                modifier = Modifier.clickable { onSelect(option.slug) },
                            )
                        }
                    }
                }
            }
        }
    }
}
