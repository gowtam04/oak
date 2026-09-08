package ai.gowtam.oak.features.teams

import ai.gowtam.oak.services.TeamsAssistantService
import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakButtonStyle
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownBlockView
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.wire.AnalyzedMember
import ai.gowtam.oak.wire.DefenseRow
import ai.gowtam.oak.wire.DexSpriteRef
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.StatSpread
import ai.gowtam.oak.wire.TeamAnalysis
import ai.gowtam.oak.wire.TeamMember
import ai.gowtam.oak.wire.TeamWarning
import ai.gowtam.oak.wire.titleizeTeamSlug
import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
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
import androidx.compose.material3.FilterChipDefaults
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
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
    var selectedSlot by remember { mutableStateOf(0) }

    LaunchedEffect(Unit) {
        if (loadsOnAppear) {
            viewModel.load()
        } else {
            viewModel.refreshSprites(); viewModel.refreshAllMovepools(); viewModel.scheduleAnalysis()
        }
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
            val oak = LocalOakColors.current
            OakTopBar(
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
                    if (!viewModel.isReadOnly) {
                        IconButton(onClick = { showAssistant = true }) { Icon(Icons.Filled.AutoAwesome, contentDescription = "Team assistant") }
                    }
                    if (state.isSaving) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp).padding(end = OakSpacing.md), strokeWidth = 2.dp, color = oak.onRed)
                    } else if (!viewModel.isReadOnly) {
                        LidSaveButton(onClick = viewModel::save)
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
                            enabled = !viewModel.isReadOnly,
                        )
                        ai.gowtam.oak.ui.RegulationChip()
                        if (viewModel.isReadOnly) {
                            Text(
                                text = "Archived · ${viewModel.format.displayLabel}",
                                style = MaterialTheme.typography.bodySmall,
                                color = LocalOakColors.current.textMuted,
                            )
                        }
                    }
                }

                if (state.members.isNotEmpty()) {
                    item {
                        RosterStrip(
                            members = state.members,
                            spriteRefs = state.spriteRefsBySpecies,
                            selectedIndex = selectedSlot.coerceIn(0, state.members.lastIndex),
                            onSelect = { selectedSlot = it },
                        )
                    }
                }

                itemsIndexed(state.members, key = { _, member -> member.id }) { index, member ->
                    MemberEditorCard(
                        index = index,
                        selected = index == selectedSlot.coerceIn(0, state.members.lastIndex.coerceAtLeast(0)),
                        member = member,
                        warnings = viewModel.warningsForSlot(index),
                        spriteRef = viewModel.spriteRef(member.species),
                        abilityOptions = viewModel.abilityOptions(member.species),
                        movepoolOptions = viewModel.movepoolOptions(member.id),
                        search = viewModel::searchEntities,
                        readOnly = viewModel.isReadOnly,
                        showsTeraField = viewModel.showsTeraField,
                        showsIvKnobs = viewModel.showsIvKnobs,
                        showsLevelKnob = viewModel.showsLevelKnob,
                        showsStatPoints = viewModel.showsStatPoints,
                        onChange = { transform -> viewModel.updateMember(index, transform) },
                        onRemove = { viewModel.removeMember(index) },
                    )
                }

                if (viewModel.canAddMember) {
                    item {
                        OakButton(onClick = viewModel::addMember, style = OakButtonStyle.Secondary, modifier = Modifier.fillMaxWidth()) {
                            Icon(Icons.Filled.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                            Text("Add Pokémon")
                        }
                    }
                }

                if (viewModel.teamLevelWarnings.isNotEmpty()) {
                    item { WarningsBlock(title = "Team legality", warnings = viewModel.teamLevelWarnings) }
                }

                item {
                    AnalysisSection(
                        analysis = state.analysis,
                        isAnalyzing = state.isAnalyzing,
                        analysisError = state.analysisError,
                        onRetry = viewModel::retryAnalysis,
                    )
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
        ModalBottomSheet(
            onDismissRequest = { showAssistant = false },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.surface,
            scrimColor = LocalOakColors.current.scrim,
            tonalElevation = 0.dp,
            shape = RoundedCornerShape(topStart = OakRadius.xl, topEnd = OakRadius.xl),
        ) {
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
private fun LidSaveButton(onClick: () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.pill)
    Box(
        modifier = Modifier
            .padding(end = OakSpacing.sm)
            .clip(shape)
            .background(Color.White.copy(alpha = 0.16f), shape)
            .border(1.dp, Color.White.copy(alpha = 0.45f), shape)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 8.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text("Save", color = oak.onRed, fontWeight = FontWeight.SemiBold)
    }
}

@Composable
private fun RosterStrip(
    members: List<EditableMember>,
    spriteRefs: Map<String, DexSpriteRef>,
    selectedIndex: Int,
    onSelect: (Int) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        members.forEachIndexed { index, member ->
            val ref = if (member.species.isBlank()) null else spriteRefs[member.species]
            val label = if (member.species.isBlank()) {
                "Slot ${index + 1}"
            } else {
                ref?.displayName ?: titleizeTeamSlug(member.species)
            }
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier
                    .width(60.dp)
                    .clickable { onSelect(index) },
            ) {
                TypeEdgeSlot(
                    spriteUrl = ref?.spriteUrl,
                    name = label,
                    types = ref?.types.orEmpty(),
                    size = 48.dp,
                    selected = index == selectedIndex,
                )
                Text(label, style = MaterialTheme.typography.labelSmall, maxLines = 1)
            }
        }
    }
}

@Composable
private fun MemberEditorCard(
    index: Int,
    selected: Boolean,
    member: EditableMember,
    warnings: List<TeamWarning>,
    spriteRef: DexSpriteRef?,
    abilityOptions: List<PickerOption>,
    movepoolOptions: List<PickerOption>,
    search: suspend (EntityKind, String) -> List<PickerOption>,
    readOnly: Boolean,
    showsTeraField: Boolean,
    showsIvKnobs: Boolean,
    showsLevelKnob: Boolean,
    showsStatPoints: Boolean,
    onChange: ((EditableMember) -> EditableMember) -> Unit,
    onRemove: () -> Unit,
) {
    val oak = LocalOakColors.current
    val requiredItem = spriteRef?.requiredItem?.takeIf { it.isNotBlank() }
    val headerTitle = if (member.species.isBlank()) "Pokémon ${index + 1}" else (spriteRef?.displayName ?: titleizeTeamSlug(member.species))

    val cardShape = RoundedCornerShape(OakRadius.md)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MaterialTheme.colorScheme.surface, cardShape)
            .border(if (selected) 2.dp else 1.dp, if (selected) oak.accent else oak.border, cardShape)
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(headerTitle, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold))
            if (!readOnly) {
                IconButton(onClick = onRemove) {
                    Icon(Icons.Filled.Delete, contentDescription = "Remove Pokémon ${index + 1}", tint = oak.danger)
                }
            }
        }

        if (member.species.isNotBlank() && spriteRef != null) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                TypeEdgeSlot(
                    spriteUrl = spriteRef.spriteUrl,
                    name = headerTitle,
                    types = spriteRef.types,
                    size = 52.dp,
                    selected = selected,
                )
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
            enabled = !readOnly,
        )
        if (member.species.isNotBlank() && spriteRef == null) {
            Text(TeamEditorViewModel.OFF_ROSTER_LABEL, style = MaterialTheme.typography.labelSmall, color = oak.warning)
        }
        EntityPickerField(
            title = "Ability",
            value = member.ability,
            source = PickerSource.Options(abilityOptions),
            search = search,
            onValueChange = { onChange { m -> m.copy(ability = it) } },
            placeholder = if (member.species.isBlank()) "Select a species first" else "Search abilities…",
            enabled = !readOnly && member.species.isNotBlank(),
        )
        if (member.ability.isNotBlank() && member.species.isNotBlank() && abilityOptions.none { it.slug == member.ability }) {
            Text(TeamEditorViewModel.OFF_ROSTER_LABEL, style = MaterialTheme.typography.labelSmall, color = oak.warning)
        }
        EntityPickerField(
            title = if (requiredItem != null) "Item (Mega stone)" else "Item",
            value = member.item,
            source = PickerSource.Search(EntityKind.ITEM),
            search = search,
            onValueChange = { onChange { m -> m.copy(item = it) } },
            placeholder = "Search items…",
            enabled = !readOnly && requiredItem == null,
        )
        if (member.item.isNotBlank() && member.species.isNotBlank() && spriteRef == null) {
            Text(TeamEditorViewModel.OFF_ROSTER_LABEL, style = MaterialTheme.typography.labelSmall, color = oak.warning)
        }

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
                    enabled = !readOnly && member.species.isNotBlank(),
                )
                movepoolOptions.find { it.slug == currentMove }?.hint?.let { hint ->
                    Text(hint, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
                }
                if (currentMove.isNotBlank() && member.species.isNotBlank() && movepoolOptions.none { it.slug == currentMove }) {
                    Text(TeamEditorViewModel.OFF_ROSTER_LABEL, style = MaterialTheme.typography.labelSmall, color = oak.warning)
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
            enabled = !readOnly,
        )
        if (showsTeraField) {
            EntityPickerField(
                title = "Tera type",
                value = member.teraType,
                source = PickerSource.Options(TeamEditorViewModel.teraTypes.map { PickerOption(it, titleizeTeamSlug(it)) }),
                search = search,
                onValueChange = { onChange { m -> m.copy(teraType = it) } },
                placeholder = "None",
                enabled = !readOnly,
            )
        }

        if (showsLevelKnob) {
            LevelStepper(level = member.level, onChange = { onChange { m -> m.copy(level = it) } })
        }

        if (showsStatPoints) {
            StatGrid(
                title = "Stat Points",
                spread = member.evs,
                range = 0..TeamEditorViewModel.STAT_POINT_PER_STAT_MAX,
                step = 1,
                enabled = !readOnly,
                onChange = { onChange { m -> m.copy(evs = it) } },
            )
            val overBudget = member.statPointTotal > TeamEditorViewModel.STAT_POINT_BUDGET
            Text(
                text = if (overBudget) {
                    "Stat Points: ${member.statPointTotal} / ${TeamEditorViewModel.STAT_POINT_BUDGET} — over the legal budget (saved anyway)"
                } else {
                    "Stat Points: ${member.statPointTotal} / ${TeamEditorViewModel.STAT_POINT_BUDGET}"
                },
                style = MaterialTheme.typography.labelSmall,
                color = if (overBudget) oak.warning else oak.textMuted,
            )
        } else {
            StatGrid(title = "EVs", spread = member.evs, range = 0..252, step = 4, enabled = !readOnly, onChange = { onChange { m -> m.copy(evs = it) } })
            Text(
                text = if (member.evTotal > 508) "EV total: ${member.evTotal} / 508 — over the legal budget (saved anyway)" else "EV total: ${member.evTotal} / 508",
                style = MaterialTheme.typography.labelSmall,
                color = if (member.evTotal > 508) oak.warning else oak.textMuted,
            )
        }
        if (showsIvKnobs) {
            StatGrid(title = "IVs", spread = member.ivs, range = 0..31, step = 1, enabled = !readOnly, onChange = { onChange { m -> m.copy(ivs = it) } })
        }

        OutlinedTextField(
            value = member.nickname,
            onValueChange = { onChange { m -> m.copy(nickname = it) } },
            label = { Text("Nickname") },
            modifier = Modifier.fillMaxWidth(),
            enabled = !readOnly,
        )
        GenderRow(gender = member.gender, enabled = !readOnly, onChange = { onChange { m -> m.copy(gender = it) } })
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            Text("Shiny", modifier = Modifier.weight(1f))
            Switch(checked = member.shiny, enabled = !readOnly, onCheckedChange = { onChange { m -> m.copy(shiny = it) } })
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
private fun StatGrid(
    title: String,
    spread: StatSpread,
    range: IntRange,
    step: Int,
    enabled: Boolean = true,
    onChange: (StatSpread) -> Unit,
) {
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
                StatRow("HP", spread.hp, range, step, enabled) { onChange(spread.copy(hp = it)) }
                StatRow("Attack", spread.atk, range, step, enabled) { onChange(spread.copy(atk = it)) }
                StatRow("Defense", spread.def, range, step, enabled) { onChange(spread.copy(def = it)) }
                StatRow("Sp. Atk", spread.spa, range, step, enabled) { onChange(spread.copy(spa = it)) }
                StatRow("Sp. Def", spread.spd, range, step, enabled) { onChange(spread.copy(spd = it)) }
                StatRow("Speed", spread.spe, range, step, enabled) { onChange(spread.copy(spe = it)) }
            }
        }
    }
}

@Composable
private fun StatRow(label: String, value: Int, range: IntRange, step: Int, enabled: Boolean = true, onChange: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodySmall)
        Row(verticalAlignment = Alignment.CenterVertically) {
            IconButton(enabled = enabled, onClick = { onChange((value - step).coerceIn(range)) }) { Icon(Icons.Filled.Remove, contentDescription = "Decrease $label") }
            Text("$value", modifier = Modifier.width(32.dp), textAlign = TextAlign.Center)
            IconButton(enabled = enabled, onClick = { onChange((value + step).coerceIn(range)) }) { Icon(Icons.Filled.Add, contentDescription = "Increase $label") }
        }
    }
}

@Composable
private fun GenderRow(
    gender: TeamMember.Gender?,
    enabled: Boolean = true,
    onChange: (TeamMember.Gender?) -> Unit,
) {
    val oak = LocalOakColors.current
    val chipShape = RoundedCornerShape(OakRadius.pill)
    val chipColors = FilterChipDefaults.filterChipColors(
        containerColor = oak.surfaceSunken,
        labelColor = oak.textMuted,
        selectedContainerColor = oak.azureSoft,
        selectedLabelColor = oak.azure,
    )
    Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        FilterChip(selected = gender == null, onClick = { onChange(null) }, enabled = enabled, label = { Text("Unspecified") }, shape = chipShape, colors = chipColors)
        FilterChip(selected = gender == TeamMember.Gender.MALE, onClick = { onChange(TeamMember.Gender.MALE) }, enabled = enabled, label = { Text("Male") }, shape = chipShape, colors = chipColors)
        FilterChip(selected = gender == TeamMember.Gender.FEMALE, onClick = { onChange(TeamMember.Gender.FEMALE) }, enabled = enabled, label = { Text("Female") }, shape = chipShape, colors = chipColors)
        FilterChip(selected = gender == TeamMember.Gender.NEUTRAL, onClick = { onChange(TeamMember.Gender.NEUTRAL) }, enabled = enabled, label = { Text("Genderless") }, shape = chipShape, colors = chipColors)
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

// ---------------------------------------------------------------------------
// Team analysis (type coverage — defense matrix / offense coverage / speed order)
// ---------------------------------------------------------------------------

/**
 * The live team-coverage panel (feedback item #9), fed by the debounced
 * [TeamEditorViewModel.scheduleAnalysis]. States mirror iOS: an empty hint before any
 * species is filled, a spinner on the first run, an error row with Retry (keeping the
 * last good analysis on screen), and the full readout — the defensive type matrix,
 * offensive coverage, speed order, and the type-only caveat note.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AnalysisSection(
    analysis: TeamAnalysis?,
    isAnalyzing: Boolean,
    analysisError: String?,
    onRetry: () -> Unit,
) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.md)) {
        Text(
            text = "Team analysis",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
            modifier = Modifier.semantics { heading() },
        )

        if (analysisError != null) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.WarningAmber, contentDescription = null, tint = oak.warning, modifier = Modifier.size(16.dp))
                Text(analysisError, style = MaterialTheme.typography.bodySmall, color = oak.textStrong, modifier = Modifier.weight(1f))
                TextButton(onClick = onRetry) { Text("Retry") }
            }
        }

        when (analysis) {
            is TeamAnalysis.Ok -> AnalysisReadout(analysis.v, isAnalyzing)
            is TeamAnalysis.Unavailable ->
                Text("Team analysis isn't available for this format.", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            is TeamAnalysis.Unsupported -> Unit
            null -> if (isAnalyzing) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
                    CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp, color = oak.accent)
                    Text("Analyzing coverage…", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
                }
            } else if (analysisError == null) {
                Text("Add a Pokémon to see team coverage.", style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun AnalysisReadout(ok: ai.gowtam.oak.wire.TeamAnalysisOk, isAnalyzing: Boolean) {
    val oak = LocalOakColors.current

    if (isAnalyzing) {
        Text("Updating…", style = MaterialTheme.typography.labelSmall, color = oak.textFaint)
    }

    if (ok.rolesPresent.isNotEmpty() || ok.rolesMissing.isNotEmpty()) {
        SectionHeader("Roles & tools")
        if (ok.rolesPresent.isNotEmpty()) {
            Text(
                "Present: " + ok.rolesPresent.joinToString(", ") { it.replace('_', ' ') },
                style = MaterialTheme.typography.bodySmall,
                color = oak.textStrong,
            )
        }
        if (ok.rolesMissing.isNotEmpty()) {
            Text(
                "Gaps: " + ok.rolesMissing.joinToString(", ") { it.replace('_', ' ') },
                style = MaterialTheme.typography.bodySmall,
                color = oak.danger,
            )
        }
        Text(
            "Moves: ${ok.physicalSpecial.physicalMoves} phys · ${ok.physicalSpecial.specialMoves} spec · ${ok.physicalSpecial.statusMoves} status",
            style = MaterialTheme.typography.labelSmall,
            color = oak.textMuted,
        )
    }

    // Defensive matrix — three labeled rows, each a type + ×N count (count>0 only), desc.
    val weak = defenseCounts(ok.defense) { it.weak }
    val resists = defenseCounts(ok.defense) { it.resists }
    val immune = defenseCounts(ok.defense) { it.immune }
    if (weak.isNotEmpty() || resists.isNotEmpty() || immune.isNotEmpty()) {
        SectionHeader("Defensive coverage")
        DefenseCountRow("Weak", weak)
        DefenseCountRow("Resists", resists)
        DefenseCountRow("Immune", immune)
    }

    // Offensive coverage — covered types (neutral chips) + uncovered (warning-tinted).
    val covered = ok.offense.covered.map { it.type }
    if (covered.isNotEmpty() || ok.offense.uncovered.isNotEmpty()) {
        SectionHeader("Offensive coverage")
        if (covered.isNotEmpty()) {
            Text("Super-effective", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (type in covered) TypeBadge(type)
            }
        }
        if (ok.offense.uncovered.isNotEmpty()) {
            Text("Not covered", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.warning)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (type in ok.offense.uncovered) UncoveredChip(type)
            }
        }
    }

    // Speed order — display name + Speed, server-sorted desc.
    if (ok.speedTiers.isNotEmpty()) {
        SectionHeader("Speed order")
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (tier in ok.speedTiers) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(memberLabel(tier.member, ok.members), style = MaterialTheme.typography.bodySmall, color = oak.textStrong)
                    Text("${tier.speed} Spe", style = MaterialTheme.typography.bodySmall, color = oak.textMuted, fontFamily = JetBrainsMonoFamily)
                }
            }
        }
    }

    if (ok.threats.isNotEmpty()) {
        SectionHeader("Meta threats")
        ok.metaAttribution?.let {
            // Real attribution text a user reads to understand the data source, not a
            // decorative caption — textMuted clears AA dark-mode contrast (~7:1 vs
            // textFaint's <4:1; fable-ui-strategy.md §4 dark-mode AA pass).
            Text(it, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
        }
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (threat in ok.threats.take(12)) {
                Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(threat.displayName, style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
                        Text(
                            threat.status.uppercase(),
                            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold),
                            color = when (threat.status) {
                                "answered" -> oak.success
                                "unanswered" -> oak.danger
                                else -> oak.warning
                            },
                        )
                    }
                    Text(threat.reasons.joinToString("; "), style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
                }
            }
        }
    }

    for (note in ok.notes) {
        // Genuine analysis notes, not decorative captions — same AA fix as the meta
        // attribution line above.
        Text(note, style = MaterialTheme.typography.labelSmall, color = oak.textMuted)
    }
}

/** One row of the defensive matrix: a label + a wrapped list of (type badge + ×N) chips. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun DefenseCountRow(label: String, counts: List<TypeCount>) {
    if (counts.isEmpty()) return
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for ((type, count) in counts) {
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp), verticalAlignment = Alignment.CenterVertically) {
                    TypeBadge(type)
                    Text("×$count", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = oak.textMuted)
                }
            }
        }
    }
}

/** A warning-tinted pill for a type no damaging move hits super-effectively. */
@Composable
private fun UncoveredChip(type: String) {
    val oak = LocalOakColors.current
    Text(
        text = titleizeTeamSlug(type),
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.warning,
        modifier = Modifier
            .background(oak.warning.copy(alpha = 0.12f), RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold),
        color = LocalOakColors.current.textStrong,
    )
}

/** One attacking type and how many members fall in a given defensive bucket. */
private data class TypeCount(val type: String, val count: Int)

/** Builds the (type, count) list for one defensive bucket, count>0 only, sorted desc. */
private fun defenseCounts(rows: List<DefenseRow>, pick: (DefenseRow) -> List<String>): List<TypeCount> =
    rows.mapNotNull { row -> pick(row).size.takeIf { it > 0 }?.let { TypeCount(row.type, it) } }
        .sortedByDescending { it.count }

/** The display name for a member slug (from a resolved member), else the titleized slug. */
private fun memberLabel(slug: String, members: List<AnalyzedMember>): String {
    val found = members.firstOrNull { it.slug == slug } as? AnalyzedMember.Found
    return found?.displayName ?: titleizeTeamSlug(slug)
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
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            Column {
                OakTopBar(
                    title = { Text("Showdown export", modifier = Modifier.semantics { heading() }) },
                    navigationIcon = { IconButton(onClick = onDismiss) { Icon(Icons.Filled.Close, contentDescription = "Done") } },
                    actions = {
                        TextButton(onClick = onCopy) { Text("Copy", color = LocalOakColors.current.onRed) }
                        IconButton(onClick = onShare) { Icon(Icons.Filled.Share, contentDescription = "Share") }
                    },
                )
                LazyColumn(modifier = Modifier.fillMaxSize().padding(OakSpacing.lg)) {
                    item {
                        Text(
                            text = paste,
                            style = MaterialTheme.typography.bodySmall.copy(fontFamily = JetBrainsMonoFamily),
                        )
                    }
                }
            }
        }
    }
}
