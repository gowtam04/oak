package ai.gowtam.oak.features.calc

import ai.gowtam.oak.services.CalcService
import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.wire.CalcField
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.Format
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Row
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Switch
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorScreen(
    calc: CalcService,
    format: Format,
    initialScenario: CalcScenario? = null,
    onBack: () -> Unit,
    onExplain: (String) -> Unit = {},
) {
    val viewModel = remember(calc, format, initialScenario) {
        CalculatorViewModel(calc, initialFormat = format, initialScenario = initialScenario)
    }
    val oak = LocalOakColors.current
    Scaffold(
        topBar = {
            OakTopBar(
                title = { Text("Calculator") },
                navigationIcon = {
                    androidx.compose.material3.TextButton(onClick = onBack) {
                        Text("Back", color = oak.onRed)
                    }
                },
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { inner ->
        CalculatorForm(
            viewModel = viewModel,
            onExplain = onExplain,
            modifier = Modifier
                .fillMaxSize()
                .padding(inner)
                .padding(OakSpacing.lg),
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorOverlay(
    viewModel: CalculatorViewModel,
    onDismiss: () -> Unit,
    onExpand: () -> Unit,
    onExplain: (String) -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = MaterialTheme.colorScheme.surface,
        scrimColor = LocalOakColors.current.scrim,
        tonalElevation = 0.dp,
    ) {
        CalculatorForm(
            viewModel = viewModel,
            onExplain = onExplain,
            onExpand = onExpand,
            modifier = Modifier
                .fillMaxWidth()
                .padding(OakSpacing.lg),
        )
    }
}

@Composable
private fun CalculatorForm(
    viewModel: CalculatorViewModel,
    modifier: Modifier = Modifier,
    onExplain: (String) -> Unit = {},
    onExpand: (() -> Unit)? = null,
) {
    val oak = LocalOakColors.current
    val state by viewModel.uiState.collectAsState()
    val scenario = state.scenario
    Column(
        modifier = modifier.verticalScroll(rememberScrollState()),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.md),
    ) {
        Text(
            text = "Damage calculator · ${scenario.format.shortLabel}",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
        OutlinedTextField(
            value = scenario.attacker.species.orEmpty(),
            onValueChange = viewModel::setAttackerSpecies,
            label = { Text("Attacker") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = scenario.defender.species.orEmpty(),
            onValueChange = viewModel::setDefenderSpecies,
            label = { Text("Defender") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = scenario.move.slug.orEmpty(),
            onValueChange = viewModel::setMoveSlug,
            label = { Text("Move") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        OutlinedTextField(
            value = scenario.attacker.item.orEmpty(),
            onValueChange = viewModel::setAttackerItem,
            label = { Text("Attacker item") },
            modifier = Modifier.fillMaxWidth(),
            singleLine = true,
        )
        Text("Format", style = MaterialTheme.typography.labelMedium, color = oak.textMuted)
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            for (format in listOf(Format.NationalDex, Format.Champions, Format.ScarletViolet, Format.Gen5, Format.Gen7)) {
                FilterChip(
                    selected = scenario.format == format,
                    onClick = { viewModel.setFormat(format) },
                    label = { Text(format.shortLabel) },
                    colors = enamelFilterChipColors(oak),
                )
            }
        }
        Text("Weather", style = MaterialTheme.typography.labelMedium, color = oak.textMuted)
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            for (weather in listOf("none", "sun", "rain", "sand", "snow")) {
                FilterChip(
                    selected = (scenario.field?.weather ?: "none") == weather,
                    onClick = {
                        val current = scenario.field ?: CalcField()
                        viewModel.setField(current.copy(weather = weather))
                    },
                    label = { Text(weather) },
                    colors = enamelFilterChipColors(oak),
                )
            }
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Reflect", color = oak.textStrong)
            Switch(
                checked = scenario.field?.reflect == true,
                onCheckedChange = {
                    val current = scenario.field ?: CalcField()
                    viewModel.setField(current.copy(reflect = it))
                },
            )
        }
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text("Light Screen", color = oak.textStrong)
            Switch(
                checked = scenario.field?.lightScreen == true,
                onCheckedChange = {
                    val current = scenario.field ?: CalcField()
                    viewModel.setField(current.copy(lightScreen = it))
                },
            )
        }
        when (val result = state.result) {
            is CalcResult.Ok -> {
                val estimate = result.estimate
                val plate = RoundedCornerShape(OakRadius.lg)
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .background(MaterialTheme.colorScheme.surface, plate)
                        .border(1.dp, oak.border, plate)
                        .padding(OakSpacing.md),
                    verticalArrangement = Arrangement.spacedBy(OakSpacing.xs),
                ) {
                Text(
                    text = "${estimate.minDamage}–${estimate.maxDamage} " +
                        "(${estimate.percentMin}–${estimate.percentMax}%) · ${estimate.ko.hits}HKO",
                    color = oak.textStrong,
                    fontWeight = FontWeight.SemiBold,
                    fontFamily = JetBrainsMonoFamily,
                )
                if (result.applied.unsupported.isNotEmpty()) {
                    Text(
                        text = "Not modeled: ${result.applied.unsupported.joinToString()}",
                        color = oak.textMuted,
                    )
                }
                result.caveat?.let { Text(it, color = oak.textMuted) }
                }
            }
            is CalcResult.Error -> {
                Text(
                    text = when (result.error) {
                        "incomplete" -> "Add both Pokémon and a damaging move."
                        "status_move" -> "Status moves don't deal damage."
                        else -> result.detail ?: result.error
                    },
                    color = oak.textMuted,
                )
            }
            null -> if (!state.isComputing) {
                Text("Couldn't reach the calculator.", color = oak.textMuted)
            }
        }
        val prompt = viewModel.explainPrompt()
        if (prompt != null) {
            TextButton(onClick = { onExplain(prompt) }) { Text("Explain") }
        }
        if (onExpand != null) {
            TextButton(onClick = onExpand) { Text("Open full calculator") }
        }
    }
}

@Composable
private fun enamelFilterChipColors(oak: OakColors) = FilterChipDefaults.filterChipColors(
    containerColor = MaterialTheme.colorScheme.surface,
    labelColor = oak.textMuted,
    selectedContainerColor = oak.accentSoft,
    selectedLabelColor = oak.accent,
)
