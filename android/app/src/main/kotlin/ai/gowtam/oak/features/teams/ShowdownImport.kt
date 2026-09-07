package ai.gowtam.oak.features.teams

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ImportNote
import ai.gowtam.oak.wire.Team
import ai.gowtam.oak.wire.titleizeTeamSlug
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties

/**
 * The Showdown-paste import dialog (history-and-teams.md D-TEAM-1; M-AC-T2.1/T2.3):
 * paste a Showdown team, pick its format, and import it into a new saved team. Mirrors
 * iOS `ShowdownImportView`.
 *
 * **Never fails wholesale** (resolve-or-clarify): the server resolves whatever it can
 * and returns the rest as [ImportNote]s, shown here as advisories — the team is still
 * created from everything that resolved. [onImport] is the shared
 * [TeamsListViewModel.importPaste] call so the new team lands in the library
 * immediately.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShowdownImportDialog(
    initialFormat: Format,
    onImport: (paste: String, format: Format, onResult: (Team?, List<ImportNote>) -> Unit) -> Unit,
    onDismiss: () -> Unit,
) {
    var format by remember { mutableStateOf(initialFormat) }
    var paste by remember { mutableStateOf("") }
    var isImporting by remember { mutableStateOf(false) }
    var importedTeam by remember { mutableStateOf<Team?>(null) }
    var notes by remember { mutableStateOf<List<ImportNote>>(emptyList()) }
    var formatMenuOpen by remember { mutableStateOf(false) }
    val oak = LocalOakColors.current

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column {
                OakTopBar(
                    title = { Text("Import team", modifier = Modifier.semantics { heading() }) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Cancel") } },
                    actions = {
                        when {
                            isImporting -> CircularProgressIndicator(modifier = Modifier.padding(end = OakSpacing.md), strokeWidth = 2.dp, color = oak.onRed)
                            importedTeam == null -> TextButton(
                                enabled = paste.isNotBlank(),
                                onClick = {
                                    isImporting = true
                                    onImport(paste, format) { team, resultNotes ->
                                        isImporting = false
                                        importedTeam = team
                                        notes = resultNotes
                                        if (team != null && resultNotes.isEmpty()) onDismiss()
                                    }
                                },
                            ) { Text("Import", fontWeight = FontWeight.SemiBold, color = oak.onRed) }
                            else -> TextButton(onClick = onDismiss) { Text("Done", fontWeight = FontWeight.SemiBold, color = oak.onRed) }
                        }
                    },
                )
                LazyColumn(modifier = Modifier.padding(OakSpacing.lg), verticalArrangement = Arrangement.spacedBy(OakSpacing.md)) {
                    item {
                        Box {
                            OakButton(onClick = { formatMenuOpen = true }, style = OakButtonStyle.Secondary) { Text(format.shortLabel) }
                            DropdownMenu(expanded = formatMenuOpen, onDismissRequest = { formatMenuOpen = false }) {
                                Format.knownCases.forEach { candidate ->
                                    DropdownMenuItem(
                                        text = { Text(candidate.shortLabel) },
                                        onClick = { format = candidate; formatMenuOpen = false },
                                    )
                                }
                            }
                        }
                    }
                    item {
                        OutlinedTextField(
                            value = paste,
                            onValueChange = { paste = it },
                            label = { Text("Showdown paste") },
                            placeholder = { Text("Paste a team exported from Pokémon Showdown.") },
                            modifier = Modifier.fillMaxWidth().height(220.dp),
                        )
                    }
                    importedTeam?.let { team ->
                        item {
                            Text(
                                text = "Imported \"${team.name}\" into your Teams.",
                                style = MaterialTheme.typography.bodyMedium,
                                color = oak.success,
                            )
                        }
                        items(team.members) { member ->
                            Text(
                                text = "•  " + (member.species?.let(::titleizeTeamSlug) ?: "Unknown"),
                                style = MaterialTheme.typography.bodyMedium,
                            )
                        }
                    }
                    if (notes.isNotEmpty()) {
                        item {
                            Text(
                                text = "IMPORT NOTES",
                                style = MaterialTheme.typography.labelSmall,
                                color = oak.textMuted,
                            )
                        }
                        items(notes) { note -> ImportNoteRow(note) }
                    }
                }
            }
        }
    }
}

@Composable
private fun ImportNoteRow(note: ImportNote) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            Icon(Icons.Filled.Info, contentDescription = null, tint = oak.info, modifier = Modifier.padding(top = 2.dp))
            Text(text = note.message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
        }
    }
}
