package ai.gowtam.oak.features.chat

/**
 * Composer `/` picker model (slash-discovery). Catalog, phase, prefix
 * filter, insert strings, Dex-row merge, and bind-still-valid. Pure — no
 * I/O, no POST. Clone of `web/src/lib/chat/slash-picker.ts`.
 */

data class SlashCommandRow(
    val token: String,
    val hint: String,
    val hintGuest: String? = null,
    val trailingSpace: Boolean,
    val arg: String,
)

val SLASH_COMMANDS: List<SlashCommandRow> = listOf(
    SlashCommandRow(
        token = "/new",
        hint = "New empty chat",
        trailingSpace = false,
        arg = "none",
    ),
    SlashCommandRow(
        token = "/team",
        hint = "Open Teams",
        hintGuest = "Open Teams · sign in to save",
        trailingSpace = true,
        arg = "team",
    ),
    SlashCommandRow(
        token = "/dex",
        hint = "Open Dex",
        trailingSpace = true,
        arg = "dex",
    ),
    SlashCommandRow(
        token = "/usage",
        hint = "Open live usage",
        trailingSpace = true,
        arg = "usage",
    ),
    SlashCommandRow(
        token = "/calc",
        hint = "Open calculator",
        trailingSpace = true,
        arg = "calc",
    ),
    SlashCommandRow(
        token = "/help",
        hint = "Show these commands",
        trailingSpace = false,
        arg = "none",
    ),
)

sealed interface SlashPickerPhase {
    data object Hidden : SlashPickerPhase
    data class Commands(val prefix: String, val rows: List<SlashCommandRow>) : SlashPickerPhase
    data class Args(val command: String, val query: String) : SlashPickerPhase
    data class Rest(val command: String) : SlashPickerPhase
}

data class DexNameRow(
    val kind: DexNameKind,
    val slug: String,
    val displayName: String,
    val spriteUrl: String? = null,
)

data class DexKindMatches(
    val kind: DexNameKind,
    val matches: List<DexNameRow>,
)

const val PICKER_CAPTION = "Insert, then send"
const val EMPTY_DEX = "No Dex matches"
const val EMPTY_USAGE = "No usage matches"
const val EMPTY_TEAMS = "No saved teams match"
const val EMPTY_TEAMS_GUEST = "Sign in to save teams"

private val KIND_ORDER = listOf(
    DexNameKind.Pokemon,
    DexNameKind.Move,
    DexNameKind.Ability,
    DexNameKind.Item,
)

fun slashPickerPhase(text: String): SlashPickerPhase {
    val trimmed = text.trimStart()
    if (!trimmed.startsWith("/")) return SlashPickerPhase.Hidden

    val token = Regex("^\\S+").find(trimmed)?.value.orEmpty()
    val hasSpaceAfter = trimmed.substring(token.length).firstOrNull()?.isWhitespace() == true

    if (!hasSpaceAfter) {
        val rows = filterCommands(token)
        if (rows.isEmpty()) return SlashPickerPhase.Hidden
        return SlashPickerPhase.Commands(prefix = token, rows = rows)
    }

    val command = SLASH_COMMANDS.find { it.token == token.lowercase() }
        ?: return SlashPickerPhase.Hidden

    if (command.arg == "dex" || command.arg == "team" || command.arg == "usage" || command.arg == "calc") {
        return SlashPickerPhase.Args(command = command.arg, query = slashArgs(text))
    }

    val rest = command.token.removePrefix("/")
    if (rest == "new" || rest == "help") {
        return SlashPickerPhase.Rest(command = rest)
    }
    return SlashPickerPhase.Hidden
}

fun filterCommands(prefix: String): List<SlashCommandRow> {
    val needle = prefix.lowercase()
    return SLASH_COMMANDS.filter { it.token.lowercase().startsWith(needle) }
}

fun insertCommand(token: String): String {
    val row = SLASH_COMMANDS.find { it.token.equals(token, ignoreCase = true) } ?: return token
    return if (row.trailingSpace) "${row.token} " else row.token
}

fun insertName(commandToken: String, displayName: String): String = "$commandToken $displayName"

fun mergeDexNameRows(
    byKind: List<DexKindMatches>,
    limit: Int = 8,
): List<DexNameRow> {
    val buckets = KIND_ORDER.associateWith { mutableListOf<DexNameRow>() }.toMutableMap()
    for (group in byKind) {
        buckets[group.kind]?.addAll(group.matches)
    }

    val seen = mutableSetOf<String>()
    val merged = mutableListOf<DexNameRow>()
    for (kind in KIND_ORDER) {
        for (row in buckets[kind].orEmpty()) {
            val key = "${row.kind}:${row.slug}"
            if (key in seen) continue
            seen += key
            merged += row
            if (merged.size >= limit) return merged
        }
    }
    return merged
}

fun bindStillValid(bind: DexBind, composerText: String): Boolean {
    val parsed = parseSlashCommand(composerText, hasUsagePage = true)
    if (parsed !is SlashCommand.Navigate || parsed.target != SlashCommand.Target.Dex) return false
    return slashArgs(composerText).equals(bind.displayName, ignoreCase = true)
}

fun DexNameKind.label(): String = when (this) {
    DexNameKind.Pokemon -> "Pokémon"
    DexNameKind.Move -> "Move"
    DexNameKind.Ability -> "Ability"
    DexNameKind.Item -> "Item"
}
