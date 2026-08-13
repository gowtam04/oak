@file:OptIn(ExperimentalLayoutApi::class)

package ai.gowtam.oak.features.artifact

import ai.gowtam.oak.features.chat.answercard.dexLabel
import ai.gowtam.oak.features.chat.answercard.displayCitationSource
import ai.gowtam.oak.features.chat.answercard.titleizeNonNull
import ai.gowtam.oak.ui.JetBrainsMonoFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.MarkdownText
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.OakType
import ai.gowtam.oak.ui.PlateWash
import ai.gowtam.oak.ui.SpriteImage
import ai.gowtam.oak.ui.TypeBadge
import ai.gowtam.oak.wire.AbilityArtifactData
import ai.gowtam.oak.wire.AbilityHolder
import ai.gowtam.oak.wire.Abilities
import ai.gowtam.oak.wire.BaseStats
import ai.gowtam.oak.wire.DamageClass
import ai.gowtam.oak.wire.EntityArtifactOk
import ai.gowtam.oak.wire.EntityData
import ai.gowtam.oak.wire.EntityKind
import ai.gowtam.oak.wire.Format
import ai.gowtam.oak.wire.ItemArtifactData
import ai.gowtam.oak.wire.MovepoolGroup
import ai.gowtam.oak.wire.MovepoolMove
import ai.gowtam.oak.wire.MoveArtifactData
import ai.gowtam.oak.wire.PokemonArtifactData
import ai.gowtam.oak.wire.TypeArtifactData
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.MenuBook
import androidx.compose.material.icons.filled.HistoryToggleOff
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp

/**
 * Renders one resolved entity artifact as a full, grounded profile — the native
 * mirror of the iOS `EntityDetailView` / web entity-detail panes (artifact-viewer.md
 * M-ART-US-1, M-AC-A1.1/A4.2, M-BR-ART-4). One composable, five kinds: Pokémon, move,
 * ability, item, and type, each switched on [EntityArtifactOk.data].
 *
 * Phase 2 specimen desk (`docs/design/soul.md`): the detail is a **continuation of
 * the answer plate** — type-reactive wash + edge from entity types, type-glow hero
 * well for Pokémon art, and a mechanics/ink plate for non-typed entities
 * (ability/item).
 *
 * Consistent with answers (M-AC-A4.2 — grounded, cited, format-tagged, never an
 * un-sourced data dump): every profile carries the format + generation grounding
 * chrome, an `is_fallback` note when the data is a pre-Gen-9 fallback, and the
 * artifact's citations. Type chips use the shared [TypeBadge] (color **and** label,
 * never color alone) and sprites the shared [SpriteImage].
 *
 * Drilling deeper (M-ART-US-3 / M-AC-A3.1): the entities **inside** a profile are
 * tappable — a Pokémon's movepool moves and matchup types, a move/type's matchup
 * types, an ability's holders, an item's wild holders — each calling [onOpen] to push
 * a new artifact onto the viewer's back stack.
 */
@Composable
fun EntityDetail(
    artifact: EntityArtifactOk,
    requestFormat: Format,
    onOpen: (EntityKind, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val dark = isSystemInDarkTheme()
    val types = entityPlateTypes(artifact.data)
    val wash = remember(
        types,
        dark,
        oak.surfaceRaised,
        oak.surfaceSunken,
        oak.border,
        oak.borderStrong,
    ) {
        OakType.plateWashForTypes(
            subjectTypes = if (types.isEmpty()) emptyList() else listOf(types),
            surface = oak.surfaceRaised,
            surfaceSunken = oak.surfaceSunken,
            border = oak.border,
            borderStrong = oak.borderStrong,
            dark = dark,
        )
    }
    val plateShape = RoundedCornerShape(OakRadius.xl)
    val plateBrush = rememberPlateBrush(wash, oak.surfaceRaised, oak.surfaceSunken)

    Column(
        modifier = modifier
            .fillMaxWidth()
            .verticalScroll(rememberScrollState())
            .padding(OakSpacing.lg)
            .then(if (dark) Modifier else Modifier.shadow(6.dp, plateShape))
            .clip(plateShape)
            .background(plateBrush, plateShape)
            .border(1.dp, wash.border, plateShape)
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.lg),
    ) {
        when (val data = artifact.data) {
            is EntityData.Pokemon -> PokemonBody(data.v, wash, onOpen)
            is EntityData.Move -> MoveBody(data.v, wash, onOpen)
            is EntityData.Ability -> AbilityBody(data.v, wash, onOpen)
            is EntityData.Item -> ItemBody(data.v, wash)
            is EntityData.Type -> TypeBody(data.v, wash, onOpen)
        }
        GroundingSection(artifact, requestFormat)
    }
}

/** Types that drive the artifact plate wash (empty → mechanics ink plate). */
internal fun entityPlateTypes(data: EntityData): List<String> = when (data) {
    is EntityData.Pokemon -> data.v.types
    is EntityData.Move -> listOf(data.v.type)
    is EntityData.Type -> data.v.types
    is EntityData.Ability, is EntityData.Item -> emptyList()
}

@Composable
private fun rememberPlateBrush(wash: PlateWash, surfaceRaised: Color, surfaceSunken: Color): Brush =
    remember(wash, surfaceRaised, surfaceSunken) {
        if (wash.isMechanics) {
            Brush.verticalGradient(listOf(surfaceSunken, surfaceRaised))
        } else {
            Brush.linearGradient(listOf(wash.fill, wash.fill))
        }
    }

// ---------------------------------------------------------------------------
// Pokémon
// ---------------------------------------------------------------------------

@Composable
private fun PokemonBody(
    data: PokemonArtifactData,
    wash: PlateWash,
    onOpen: (EntityKind, String) -> Unit,
) {
    val oak = LocalOakColors.current
    val headerShape = RoundedCornerShape(OakRadius.lg)
    // Inset hero well (soul.md): sunken fill + the type glow as the light source,
    // OakRadius-derived (was a hardcoded 28.dp) — aligns with Subjects.kt's wells.
    val wellShape = RoundedCornerShape(OakRadius.xl)
    val glowColors = buildList {
        wash.wellGlow?.let { add(it) }
        wash.wellGlowSecondary?.let { add(it) }
        add(Color.Transparent)
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(headerShape)
            .background(
                Brush.linearGradient(
                    listOf(
                        wash.fill,
                        wash.fillSecondary ?: wash.fill.copy(alpha = 0.55f),
                        oak.surfaceRaised.copy(alpha = 0.35f),
                    ),
                ),
                headerShape,
            )
            .border(1.dp, wash.border.copy(alpha = 0.65f), headerShape)
            .padding(vertical = OakSpacing.xl, horizontal = OakSpacing.lg),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Type-glow specimen hero (aligns with Subjects.kt wells / soul.md) — sunken
        // base + the type glow as the light source + type-tinted border.
        Box(
            modifier = Modifier
                .size(128.dp)
                .clip(wellShape)
                .background(oak.surfaceSunken, wellShape)
                .background(Brush.radialGradient(glowColors), wellShape)
                .border(1.dp, wash.wellBorder, wellShape),
            contentAlignment = Alignment.Center,
        ) {
            SpriteImage(url = data.artworkUrl, name = data.displayName, size = 112.dp)
        }
        Spacer(Modifier.height(OakSpacing.sm))
        Text(
            text = data.displayName,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
        Text(
            text = dexLabel(data.nationalDexNumber),
            style = MaterialTheme.typography.bodyMedium,
            color = oak.textMuted,
            fontFamily = JetBrainsMonoFamily,
        )
        Spacer(Modifier.height(OakSpacing.xs))
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (type in data.types) TappableType(type, quadMark = null, onOpen = onOpen)
        }
    }

    AbilitiesSection(data.abilities)
    BaseStatsSection(data.baseStats, data.baseStatTotal)
    MatchupsSection(data.matchups.weakTo, data.matchups.resists, data.matchups.immuneTo, data.matchups.quadWeakTo.orEmpty(), data.matchups.quadResists.orEmpty(), onOpen)
    MovepoolSection(data.movepool, onOpen)
}

@Composable
private fun AbilitiesSection(abilities: Abilities) {
    val rows = buildList {
        add("Ability" to titleizeNonNull(abilities.slot1))
        abilities.slot2?.takeIf { it.isNotEmpty() }?.let { add("Ability" to titleizeNonNull(it)) }
        abilities.hidden?.takeIf { it.isNotEmpty() }?.let { add("Hidden" to titleizeNonNull(it)) }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        SectionHeader("Abilities")
        for ((label, value) in rows) InfoRow(label, value)
    }
}

@Composable
private fun BaseStatsSection(stats: BaseStats, total: Int) {
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        SectionHeader("Base stats")
        StatBarRow("HP", stats.hp)
        StatBarRow("Atk", stats.atk)
        StatBarRow("Def", stats.def)
        StatBarRow("SpA", stats.spa)
        StatBarRow("SpD", stats.spd)
        StatBarRow("Spe", stats.spe)
        InfoRow("Total", total.toString())
    }
}

@Composable
private fun MatchupsSection(
    weakTo: List<String>,
    resists: List<String>,
    immuneTo: List<String>,
    quadWeak: List<String>,
    quadResist: List<String>,
    onOpen: (EntityKind, String) -> Unit,
) {
    if (weakTo.isEmpty() && resists.isEmpty() && immuneTo.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        SectionHeader("Defensive matchups")
        MatchupRow("Weak to", weakTo, quadWeak.toSet(), "×4", onOpen)
        MatchupRow("Resists", resists, quadResist.toSet(), "×¼", onOpen)
        MatchupRow("Immune to", immuneTo, emptySet(), "", onOpen)
    }
}

@Composable
private fun MatchupRow(label: String, types: List<String>, marked: Set<String>, mark: String, onOpen: (EntityKind, String) -> Unit) {
    if (types.isEmpty()) return
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(text = label, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            for (type in types) TappableType(type, quadMark = if (type in marked) mark else null, onOpen = onOpen)
        }
    }
}

@Composable
private fun MovepoolSection(groups: List<MovepoolGroup>, onOpen: (EntityKind, String) -> Unit) {
    if (groups.isEmpty()) return
    val oak = LocalOakColors.current
    val allEmpty = groups.all { it.moves.isEmpty() }
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        SectionHeader("Movepool")
        if (allEmpty) {
            Text(
                text = "No moves recorded for this format.",
                style = MaterialTheme.typography.bodySmall,
                color = oak.textMuted,
            )
        }
        for (group in groups) {
            if (group.moves.isEmpty()) continue
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(
                    text = titleizeNonNull(group.method),
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                    color = oak.textMuted,
                )
                FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (move in sortMovesByType(group.moves)) MoveChip(move, onOpen)
                }
            }
        }
    }
}

@Composable
private fun MoveChip(move: MovepoolMove, onOpen: (EntityKind, String) -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier
            .clip(RoundedCornerShape(OakRadius.pill))
            .background(oak.surfaceRaised)
            .clickable { onOpen(EntityKind.MOVE, move.slug) }
            .padding(horizontal = OakSpacing.md, vertical = 4.dp)
            .semantics { contentDescription = "${move.displayName}, ${move.type} type" },
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier
                .size(8.dp)
                .background(OakType.color(move.type), CircleShape),
        )
        Text(
            text = move.displayName,
            style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
    }
}

/**
 * Orders a group's moves by type in display order, then alphabetically by name within
 * each type, so same-type moves cluster together and their colored badges read as
 * type groups — mirrors the web `sortMovesByType` (PokemonArtifact.tsx) and iOS's port.
 */
private fun sortMovesByType(moves: List<MovepoolMove>): List<MovepoolMove> =
    moves.sortedWith(compareBy({ OakType.displayIndex(it.type) }, { it.displayName.lowercase() }))

// ---------------------------------------------------------------------------
// Move
// ---------------------------------------------------------------------------

@Composable
private fun MoveBody(
    data: MoveArtifactData,
    wash: PlateWash,
    onOpen: (EntityKind, String) -> Unit,
) {
    val oak = LocalOakColors.current
    val headerShape = RoundedCornerShape(OakRadius.lg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(headerShape)
            .background(wash.fill, headerShape)
            .border(1.dp, wash.border.copy(alpha = 0.65f), headerShape)
            .padding(OakSpacing.lg),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        Text(data.displayName, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            TappableType(data.type, quadMark = null, onOpen = onOpen)
            DamageClassBadge(data.damageClass)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        InfoRow("Power", data.power?.toString() ?: "—")
        InfoRow("Accuracy", data.accuracy?.let { "$it%" } ?: "—")
        InfoRow("PP", data.pp?.toString() ?: "—")
        InfoRow("Priority", signed(data.priority))
        InfoRow("Target", titleizeNonNull(data.target))
        data.gen9LearnerCount?.let { InfoRow("Gen 9 learners", it.toString()) }
    }
    EffectSection(data.effectShort, data.effectFull)
}

@Composable
private fun DamageClassBadge(damageClass: DamageClass) {
    val oak = LocalOakColors.current
    Text(
        text = damageClass.name.lowercase().replaceFirstChar { it.uppercase() },
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textMuted,
        modifier = Modifier
            .background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill))
            .padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

// ---------------------------------------------------------------------------
// Ability
// ---------------------------------------------------------------------------

@Composable
private fun AbilityBody(
    data: AbilityArtifactData,
    wash: PlateWash,
    onOpen: (EntityKind, String) -> Unit,
) {
    MechanicsHeader(title = data.displayName, wash = wash)
    EffectSection(data.effectShort, data.effectFull)
    if (data.learnedBy.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionHeader("Pokémon with this ability")
            FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                for (holder in data.learnedBy) HolderChip(holder, onOpen)
            }
        }
    }
}

@Composable
private fun HolderChip(holder: AbilityHolder, onOpen: (EntityKind, String) -> Unit) {
    val oak = LocalOakColors.current
    Text(
        text = holder.displayName,
        style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textStrong,
        modifier = Modifier
            .clip(RoundedCornerShape(OakRadius.pill))
            .background(oak.surfaceRaised)
            .clickable { onOpen(EntityKind.POKEMON, holder.slug) }
            .padding(horizontal = OakSpacing.md, vertical = 4.dp),
    )
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

@Composable
private fun ItemBody(data: ItemArtifactData, wash: PlateWash) {
    MechanicsHeader(title = data.displayName, wash = wash)
    EffectSection(data.effectShort, data.effectFull)
    val holders = data.heldByWild
    if (!holders.isNullOrEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            SectionHeader("Held in the wild")
            for (holder in holders) InfoRow(titleizeNonNull(holder.pokemon), percentText(holder.rarityPercent))
        }
    }
}

/** Ink-plate header band for ability/item (no type wash — soul.md mechanics plate). */
@Composable
private fun MechanicsHeader(title: String, wash: PlateWash) {
    val oak = LocalOakColors.current
    val headerShape = RoundedCornerShape(OakRadius.lg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(headerShape)
            .background(
                Brush.verticalGradient(listOf(wash.fill, oak.surfaceRaised.copy(alpha = 0.55f))),
                headerShape,
            )
            .border(1.5.dp, wash.border, headerShape)
            .padding(OakSpacing.lg),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.SemiBold),
            color = oak.textStrong,
        )
    }
}

private fun percentText(value: Double): String =
    if (value == kotlin.math.floor(value)) "${value.toInt()}%" else "${(value * 10).let { kotlin.math.round(it) } / 10}%"

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

@Composable
private fun TypeBody(
    data: TypeArtifactData,
    wash: PlateWash,
    onOpen: (EntityKind, String) -> Unit,
) {
    val headerShape = RoundedCornerShape(OakRadius.lg)
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(headerShape)
            .background(
                Brush.linearGradient(
                    listOfNotNull(wash.fill, wash.fillSecondary, wash.fill.copy(alpha = 0.4f)),
                ),
                headerShape,
            )
            .border(1.dp, wash.border.copy(alpha = 0.65f), headerShape)
            .padding(OakSpacing.lg),
    ) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (type in data.types) TypeBadge(type = type)
        }
    }
    data.offensive?.let { offensive ->
        Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
            SectionHeader("Offensive")
            MatchupRow("Super effective", offensive.superEffectiveAgainst, emptySet(), "", onOpen)
            MatchupRow("Not very effective", offensive.notVeryEffectiveAgainst, emptySet(), "", onOpen)
            MatchupRow("No effect", offensive.noEffectAgainst, emptySet(), "", onOpen)
        }
    }
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        SectionHeader("Defensive")
        MatchupRow("Weak to", data.defensive.weakTo, data.defensive.quadWeakTo.orEmpty().toSet(), "×4", onOpen)
        MatchupRow("Resists", data.defensive.resists, data.defensive.quadResists.orEmpty().toSet(), "×¼", onOpen)
        MatchupRow("Immune to", data.defensive.immuneTo, emptySet(), "", onOpen)
    }
}

// ---------------------------------------------------------------------------
// Grounding chrome (format / generation / fallback / citations)
// ---------------------------------------------------------------------------

@Composable
private fun GroundingSection(artifact: EntityArtifactOk, requestFormat: Format) {
    val oak = LocalOakColors.current
    // The National-Dex fallback (#2): the entity wasn't found in the user's requested
    // scope, so the profile was assembled from `source_format` (national-dex). Badge it
    // against the user's OWN request format, NOT the envelope's `format` (which is the
    // assembled-from scope and equals source_format on this path).
    val fallbackSource = artifact.sourceFormat?.takeIf { it != requestFormat }
    Column(verticalArrangement = Arrangement.spacedBy(OakSpacing.sm)) {
        HorizontalDivider(color = oak.border)
        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
            FormatBadge(artifact.format)
            if (fallbackSource != null) SourceFormatBadge(fallbackSource)
            Text(artifact.generation, style = MaterialTheme.typography.bodySmall, color = oak.textMuted)
        }
        if (fallbackSource != null) {
            Text(
                text = "Not found in ${requestFormat.shortLabel} — showing ${fallbackSource.shortLabel} data.",
                style = MaterialTheme.typography.bodySmall,
                color = oak.azure,
            )
        }
        if (artifact.isFallback) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.Filled.HistoryToggleOff, contentDescription = null, tint = oak.warning, modifier = Modifier.height(16.dp))
                Text(
                    text = artifact.fallbackNote ?: "Showing fallback data from an earlier generation.",
                    style = MaterialTheme.typography.bodySmall,
                    color = oak.warning,
                )
            }
        }
        for (citation in artifact.citations) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Top) {
                Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null, tint = oak.textFaint, modifier = Modifier.height(14.dp))
                Text(
                    text = "${displayCitationSource(citation.source)} — ${citation.detail}",
                    style = MaterialTheme.typography.labelSmall,
                    color = oak.textFaint,
                )
            }
        }
    }
}

@Composable
private fun FormatBadge(format: Format) {
    val oak = LocalOakColors.current
    Text(
        text = format.shortLabel,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.textMuted,
        modifier = Modifier.background(oak.surfaceRaised, RoundedCornerShape(OakRadius.pill)).padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

/** The azure-tinted scope pill shown beside [FormatBadge] on a National-Dex fallback (#2). */
@Composable
private fun SourceFormatBadge(format: Format) {
    val oak = LocalOakColors.current
    Text(
        text = format.shortLabel,
        style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
        color = oak.azure,
        modifier = Modifier.background(oak.azureSoft, RoundedCornerShape(OakRadius.pill)).padding(horizontal = OakSpacing.sm, vertical = 3.dp),
    )
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

@Composable
private fun SectionHeader(title: String) {
    val oak = LocalOakColors.current
    Text(text = title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
}

@Composable
private fun InfoRow(label: String, value: String) {
    val oak = LocalOakColors.current
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = oak.textMuted)
        Text(value, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold), color = oak.textStrong)
    }
}

@Composable
private fun EffectSection(short: String, full: String) {
    val oak = LocalOakColors.current
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (short.isNotBlank()) MarkdownText(short, color = oak.textStrong)
        if (full.isNotBlank() && full != short) MarkdownText(full, color = oak.textMuted)
    }
}

@Composable
private fun TappableType(type: String, quadMark: String?, onOpen: (EntityKind, String) -> Unit) {
    val oak = LocalOakColors.current
    Row(
        modifier = Modifier.clickable { onOpen(EntityKind.TYPE, type) },
        horizontalArrangement = Arrangement.spacedBy(4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TypeBadge(type = type)
        if (!quadMark.isNullOrEmpty()) {
            Text(text = quadMark, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold), color = oak.textMuted)
        }
    }
}

@Composable
private fun StatBarRow(label: String, value: Int) {
    val oak = LocalOakColors.current
    val fraction = (value.coerceIn(0, 255) / 255f)
    val barColor = when {
        value < 60 -> oak.danger
        value < 90 -> oak.warning
        value < 120 -> oak.success
        else -> oak.azure
    }
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold), color = oak.textMuted, modifier = Modifier.width(40.dp))
        Text(
            value.toString(),
            style = MaterialTheme.typography.labelSmall,
            fontFamily = JetBrainsMonoFamily,
            color = oak.textStrong,
            modifier = Modifier.width(32.dp),
        )
        Box(
            modifier = Modifier
                .weight(1f)
                .height(8.dp)
                .clip(RoundedCornerShape(OakRadius.pill))
                .background(oak.textStrong.copy(alpha = 0.10f)),
        ) {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .fillMaxWidth(fraction)
                    .background(barColor, RoundedCornerShape(OakRadius.pill)),
            )
        }
    }
}

private fun signed(value: Int): String = if (value > 0) "+$value" else value.toString()
