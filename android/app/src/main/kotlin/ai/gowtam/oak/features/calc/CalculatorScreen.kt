package ai.gowtam.oak.features.calc

import ai.gowtam.oak.services.CalcService
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.wire.CalcResult
import ai.gowtam.oak.wire.CalcScenario
import ai.gowtam.oak.wire.Format
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
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
    Scaffold(
        topBar = {
            OakTopBar(
                title = { Text("Calculator") },
                navigationIcon = {
                    androidx.compose.material3.TextButton(onClick = onBack) { Text("Back") }
                },
            )
        },
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
    onExplain: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        CalculatorForm(
            viewModel = viewModel,
            onExplain = { onExplain() },
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
        when (val result = state.result) {
            is CalcResult.Ok -> {
                val estimate = result.estimate
                Text(
                    text = "${estimate.minDamage}–${estimate.maxDamage} " +
                        "(${estimate.percentMin}–${estimate.percentMax}%) · ${estimate.ko.hits}HKO",
                    color = oak.textStrong,
                    fontWeight = FontWeight.SemiBold,
                )
                if (result.applied.unsupported.isNotEmpty()) {
                    Text(
                        text = "Not modeled: ${result.applied.unsupported.joinToString()}",
                        color = oak.textMuted,
                    )
                }
                result.caveat?.let { Text(it, color = oak.textMuted) }
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
