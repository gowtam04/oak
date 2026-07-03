package ai.gowtam.oak.features.teams

import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.SpriteImage
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import ai.gowtam.oak.wire.titleizeTeamSlug
import android.content.Intent
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import kotlinx.coroutines.delay

/**
 * The full-set team editor (history-and-teams.md D-TEAM-1; component-design.md
 * "TeamEditorViewModel"/"TeamEditor.kt"): a scrolling form for naming a team and
 * filling each member's complete competitive set — species / ability / item / four
 * moves / nature / EVs / IVs / Tera / level — with search-driven pickers so the whole
 * set is editable on a phone. Mirrors iOS `TeamEditorView`.
 *
 * **Warn-but-allow**: the server's legality/validity warnings render inline (per slot
 * and team-level) but Save is never disabled. Export renders the Showdown paste with
 * copy/share actions.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TeamEditor(
    viewModel: TeamEditorViewModel,
    teamsAssistantService: TeamsAssistantService,
    loadsOnAppear: Boolean,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val state by viewModel.uiState.collectAsState()
    val assistantViewModel = remember(viewModel) { TeamsAssistantViewModel(teamsAssistantService, viewModel) }
    var showAssistant by remember { mutableStateOf(false) }
    val clipboard = LocalClipboardManager.current
    val context = LocalContext.current

    LaunchedEffect(Unit) {
        if (loadsOnAppear) viewModel.load() else { viewModel.refreshSprites(); viewModel.refreshAllMovepools() }
    }

    LaunchedEffect(state.showSaveConfirmation) {
        if (state.showSaveConfirmation) {
            delay(1200)
            viewModel.consumeSaveConfirmation()
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        if (state.savedTeam == null) "New team" else "Edit team",
                        modifier = Modifier.semantics { heading() },
                    )
                },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back") } },
                actions = {
                    if (state.teamId != null) {
                        IconButton(onClick = viewModel::exportPaste) { Icon(Icons.Filled.Share, contentDescription = "Export") }
                    }
                    IconButton(onClick = { showAssistant = true }) { Icon(Icons.Filled.AutoAwesome, contentDescription = "Team assistant") }
                    if (state.isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp).padding(end = OakSpacing.md), strokeWidth = 2.dp)
                    } else {
                        TextButton(onClick = viewModel::save) { Text("Save", fontWeight = FontWeight.SemiBold) }
                    }
                },
            )
        },
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize().padding(horizontal = OakSpacing.lg),
                verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
                contentPadding = androidx.compose.foundation.layout.PaddingValues(vertical = OakSpacing.lg),
            ) {
                item {
                    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                        OutlinedTextField(
                            value = state.name,
                            onValueChange = viewModel::setName,
                            label = { Text("Team name") },
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Text(
                            text = "Format: ${viewModel.format.displayLabel}",
                            style = MaterialTheme.typography.bodySmall,
                            color = LocalOakColors.current.textMuted,
                        )
                    }
                }

                if (state.members.isNotEmpty()) {
                    item { RosterStrip(members = state.members, spriteRefs = state.spriteRefsBySpecies) }
                }

                itemsIndexed(state.members, key = { _, member -> member.id }) { index, member ->
                    MemberEditorCard(
                        index = index,
                        member = member,
                        warnings = viewModel.warningsForSlot(index),
                        spriteRef = viewModel.spriteRef(member.species),
                        abilityOptions = viewModel.abilityOptions(member.species),
                        movepoolOptions = viewModel.movepoolOptions(member.id),
                        search = viewModel::searchEntities,
                        onChange = { transform -> viewModel.updateMember(index, transform) },
                        onRemove = { viewModel.removeMember(index) },
                    )
                }

                if (viewModel.canAddMember) {
                    item {
                        OutlinedButton(onClick = viewModel::addMember, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("  Add Pokémon")
                        }
                    }
                }

                if (viewModel.teamLevelWarnings.isNotEmpty()) {
                    item { WarningsBlock(title = "Team legality", warnings = viewModel.teamLevelWarnings) }
                }
            }

            if (state.showSaveConfirmation) {
                SavedBadge(modifier = Modifier.align(Alignment.TopCenter).padding(top = OakSpacing.md))
            }
            state.errorMessage?.let { message ->
                TeamsErrorBanner(
                    message = message,
                    onDismiss = viewModel::dismissError,
                    modifier = Modifier.align(Alignment.BottomCenter).padding(OakSpacing.md),
                )
            }
        }
    }

    if (showAssistant) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(onDismissRequest = { showAssistant = false }, sheetState = sheetState) {
            TeamsAssistantSheet(viewModel = assistantViewModel, onDone = { showAssistant = false })
        }
    }

    state.exportedPaste?.let { paste ->
        ExportDialog(
            paste = paste,
            onDismiss = viewModel::consumeExportedPaste,
            onCopy = { clipboard.setText(AnnotatedString(paste)) },
            onShare = {
                val intent = Intent(Intent.ACTION_SEND).apply {
                    type = "text/plain"
                    putExtra(Intent.EXTRA_TEXT, paste)
                }
                context.startActivity(Intent.createChooser(intent, "Share Showdown export"))
            },
        )
    }

    DisposableEffect(assistantViewModel) { onDispose { assistantViewModel.cancel() } }
}

@Composable
private fun RosterStrip(members: List<EditableMember>, spriteRefs: Map<String, DexSpriteRef>) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        members.forEachIndexed { index, member ->
            val label = if (member.species.isBlank()) "Slot ${index + 1}" else (spriteRefs[member.species]?.displayName ?: titleizeTeamSlug(member.species))
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(60.dp)) {
                SpriteImage(url = if (member.species.isBlank()) null else spriteRefs[member.species]?.spriteUrl, name = label, size = 44.dp)
                Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
    }
}

@Composable
private fun MemberEditorCard(
    index: Int,
    member: EditableMember,
    warnings: List<TeamWarning>,
    spriteRef: DexSpriteRef?,
    abilityOptions: List<PickerOption>,
    movepoolOptions: List<PickerOption>,
    search: suspend (EntityKind, String) -> List<PickerOption>,
    onChange: ((EditableMember) -> EditableMember) -> Unit,
    onRemove: () -> Unit,
) {
    val oak = LocalOakColors.current
    val requiredItem = spriteRef?.requiredItem?.takeIf { it.isNotBlank() }
    val headerTitle = if (member.species.isBlank()) "Pokémon ${index + 1}" else (spriteRef?.displayName ?: titleizeTeamSlug(member.species))

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(headerTitle, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
            IconButton(onClick = onRemove) {
                Icon(Icons.Filled.Delete, contentDescription = "Remove Pokémon ${index + 1}", tint = oak.danger)
            }
        }

        if (member.species.isNotBlank() && spriteRef != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                SpriteImage(url = spriteRef.spriteUrl, name = headerTitle, size = 48.dp)
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) { spriteRef.types.forEach { TypeBadge(it) } }
            }
        }

        EntityPickerField(
            title = "Species",
            value = member.species,
            source = PickerSource.Search(EntityKind.POKEMON),
            search = search,
            onValueChange = { onChange { m -> m.copy(species = it) } },
            placeholder = "Search Pokémon…",
            displayNameOverride = if (spriteRef != null) { { headerTitle } } else null,
        )
        EntityPickerField(
            title = "Ability",
            value = member.ability,
            source = PickerSource.Options(abilityOptions),
            search = search,
            onValueChange = { onChange { m -> m.copy(ability = it) } },
            placeholder = if (member.species.isBlank()) "Select a species first" else "Search abilities…",
            enabled = member.species.isNotBlank(),
        )
        EntityPickerField(
            title = if (requiredItem != null) "Item (Mega stone)" else "Item",
            value = member.item,
            source = PickerSource.Search(EntityKind.ITEM),
            search = search,
            onValueChange = { onChange { m -> m.copy(item = it) } },
            placeholder = "Search items…",
            enabled = requiredItem == null,
        )

        for (moveIndex in 0 until 4) {
            val currentMove = member.moves.getOrElse(moveIndex) { "" }
            Column {
                EntityPickerField(
                    title = "Move ${moveIndex + 1}",
                    value = currentMove,
                    source = PickerSource.Options(movepoolOptions),
                    search = search,
                    onValueChange = { newValue ->
                        onChange { m -> m.copy(moves = m.moves.toMutableList().also { list -> if (moveIndex < list.size) list[moveIndex] = newValue }) }
                    },
                    placeholder = if (member.species.isBlank()) "Select a species first" else "Move ${moveIndex + 1}",
                    enabled = member.species.isNotBlank(),
                )
                movepoolOptions.find { it.slug == currentMove }?.hint?.let { hint ->
                    Text(hint, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
                }
            }
        }

        EntityPickerField(
            title = "Nature",
            value = member.nature,
            source = PickerSource.Options(TeamEditorViewModel.natures.map { PickerOption(it, titleizeTeamSlug(it)) }),
            search = search,
            onValueChange = { onChange { m -> m.copy(nature = it) } },
            placeholder = "None",
        )
        EntityPickerField(
            title = "Tera type",
            value = member.teraType,
            source = PickerSource.Options(TeamEditorViewModel.teraTypes.map { PickerOption(it, titleizeTeamSlug(it)) }),
            search = search,
            onValueChange = { onChange { m -> m.copy(teraType = it) } },
            placeholder = "None",
        )

        LevelStepper(level = member.level, onChange = { onChange { m -> m.copy(level = it) } })

        StatGrid(title = "EVs", spread = member.evs, range = 0..252, step = 4, onChange = { onChange { m -> m.copy(evs = it) } })
        Text(
            text = if (member.evTotal > 508) "EV total: ${member.evTotal} / 508 — over the legal budget (saved anyway)" else "EV total: ${member.evTotal} / 508",
            style = MaterialTheme.typography.labelSmall,
            color = if (member.evTotal > 508) oak.warning else oak.textMuted,
        )
        StatGrid(title = "IVs", spread = member.ivs, range = 0..31, step = 1, onChange = { onChange { m -> m.copy(ivs = it) } })

        OutlinedTextField(
            value = member.nickname,
            onValueChange = { onChange { m -> m.copy(nickname = it) } },
            label = { Text("Nickname") },
            modifier = Modifier.fillMaxWidth(),
        )
        GenderRow(gender = member.gender, onChange = { onChange { m -> m.copy(gender = it) } })
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            Text("Shiny", modifier = Modifier.weight(1f))
            Switch(checked = member.shiny, onCheckedChange = { onChange { m -> m.copy(shiny = it) } })
        }

        if (warnings.isNotEmpty()) WarningsBlock(title = null, warnings = warnings)
    }
}

@Composable
private fun LevelStepper(level: Int, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text("Level")
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onChange((level - 1).coerceIn(1, 100)) }) { Icon(Icons.Filled.Remove, contentDescription = "Decrease level") }
            Text("$level", modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
            IconButton(onClick = { onChange((level + 1).coerceIn(1, 100)) }) { Icon(Icons.Filled.Add, contentDescription = "Increase level") }
        }
    }
}

@Composable
private fun StatGrid(title: String, spread: StatSpread, range: IntRange, step: Int, onChange: (StatSpread) -> Unit) {
    var expanded by remember { mutableStateOf(false) }
    Column {
        Row(
            modifier = Modifier.fillMaxWidth().clickable { expanded = !expanded },
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(title, style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold))
            Icon(if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore, contentDescription = null)
        }
        if (expanded) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                StatRow("HP", spread.hp, range, step) { onChange(spread.copy(hp = it)) }
                StatRow("Attack", spread.atk, range, step) { onChange(spread.copy(atk = it)) }
                StatRow("Defense", spread.def, range, step) { onChange(spread.copy(def = it)) }
                StatRow("Sp. Atk", spread.spa, range, step) { onChange(spread.copy(spa = it)) }
                StatRow("Sp. Def", spread.spd, range, step) { onChange(spread.copy(spd = it)) }
                StatRow("Speed", spread.spe, range, step) { onChange(spread.copy(spe = it)) }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int, range: IntRange, step: Int, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(onClick = { onChange((value - step).coerceIn(range)) }) { Icon(Icons.Filled.Remove, contentDescription = "Decrease $label") }
            Text("$value", modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
            IconButton(onClick = { onChange((value + step).coerceIn(range)) }) { Icon(Icons.Filled.Add, contentDescription = "Increase $label") }
        }
    }
}

@Composable
private fun GenderRow(gender: TeamMember.Gender?, onChange: (TeamMember.Gender?) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        FilterChip(selected = gender == null, onClick = { onChange(null) }, label = { Text("Unspecified") })
        FilterChip(selected = gender == TeamMember.Gender.MALE, onClick = { onChange(TeamMember.Gender.MALE) }, label = { Text("Male") })
        FilterChip(selected = gender == TeamMember.Gender.FEMALE, onClick = { onChange(TeamMember.Gender.FEMALE) }, label = { Text("Female") })
        FilterChip(selected = gender == TeamMember.Gender.NEUTRAL, onClick = { onChange(TeamMember.Gender.NEUTRAL) }, label = { Text("Genderless") })
    }
}

@Composable
private fun WarningsBlock(title: String?, warnings: List<TeamWarning>) {
    val oak = LocalOakColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(oak.warning.copy(alpha = 0.10f), RoundedCornerShape(OakRadius.md))
            .padding(OakSpacing.md),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.xs),
    ) {
        title?.let { Text(it, style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted) }
        for (warning in warnings) {
            val isInfo = warning.code == TeamWarning.Code.Incomplete
            Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Top) {
                Icon(
                    imageVector = if (isInfo) Icons.Filled.Info else Icons.Filled.WarningAmber,
                    contentDescription = null,
                    tint = if (isInfo) oak.info else oak.warning,
                    modifier = Modifier.size(14.dp),
                )
                Text(warning.message, style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
            }
        }
    }
}

@Composable
private fun SavedBadge(modifier: Modifier = Modifier) {
    val oak = LocalOakColors.current
    Row(
        modifier = modifier
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
    ) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = oak.success, modifier = Modifier.size(18.dp))
        Text("Saved", style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold), color = oak.success)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ExportDialog(paste: String, onDismiss: () -> Unit, onCopy: () -> Unit, onShare: () -> Unit) {
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Surface(modifier = Modifier.fillMaxSize()) {
            Column {
                TopAppBar(
                    title = { Text("Showdown export", modifier = Modifier.semantics { heading() }) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Done") } },
                    actions = {
                        TextButton(onClick = onCopy) { Text("Copy") }
                        IconButton(onClick = onShare) { Icon(Icons.Filled.Share, contentDescription = "Share") }
                    },
                )
                LazyColumn(modifier = Modifier.fillMaxSize().padding(OakSpacing.lg)) {
                    item {
                        Text(
                            text = paste,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace),
                        )
                    }
                }
            }
        }
    }
}
