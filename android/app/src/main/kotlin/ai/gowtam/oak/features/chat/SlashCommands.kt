package ai.gowtam.oak.features.chat

/**
 * Classify a composer send as a leading slash command or a normal message
 * (SLASH-US-1 / ADR-10). The parser only classifies — it does not POST.
 *
 * Known tokens (case-insensitive exact match): `/new`, `/team`, `/dex`,
 * `/calc`, `/help`, and `/usage` only when the client has a usage page.
 * After trim, text `=== "/"` is [SlashCommand.Bare]. [slashArgs] is the
 * remainder after the first token, trimmed. `/calc` rest is that remainder.
 * `/compare` stays an ordinary message (CMP-BR-3). Unknown slashes are
 * ordinary messages.
 *
 * Android Usage is a Dex section (ADR-6), so [hasUsagePage] defaults to true
 * and `/usage` navigates.
 */
sealed interface SlashCommand {
    data class Navigate(val target: Target) : SlashCommand
    data class Calc(val rest: String) : SlashCommand
    data object Help : SlashCommand
    data object Bare : SlashCommand
    data object Message : SlashCommand

    enum class Target { New, Team, Dex, Usage }
}

/** Dex entity kind for a composer-local pick bind (web `DexBind.kind`). */
enum class DexNameKind { Pokemon, Move, Ability, Item }

/**
 * Composer-local Dex pick bind. Set when a Dex name row is picked; dropped
 * when the `/dex` argument no longer equals [displayName] (case-insensitive).
 */
data class DexBind(
    val kind: DexNameKind,
    val slug: String,
    val displayName: String,
)

fun parseSlashCommand(text: String, hasUsagePage: Boolean = true): SlashCommand {
    if (text.trim() == "/") return SlashCommand.Bare

    val command = firstToken(text).lowercase()
    return when (command) {
        "/new" -> SlashCommand.Navigate(SlashCommand.Target.New)
        "/team" -> SlashCommand.Navigate(SlashCommand.Target.Team)
        "/dex" -> SlashCommand.Navigate(SlashCommand.Target.Dex)
        "/help" -> SlashCommand.Help
        "/calc" -> SlashCommand.Calc(rest = slashArgs(text))
        "/usage" -> if (hasUsagePage) {
            SlashCommand.Navigate(SlashCommand.Target.Usage)
        } else {
            SlashCommand.Message
        }
        else -> SlashCommand.Message
    }
}

/** Remainder after the first `\S+` token, trimmed. Empty string if none. */
fun slashArgs(text: String): String {
    val trimmed = text.trimStart()
    val token = firstToken(trimmed)
    if (token.isEmpty()) return ""
    return trimmed.substring(token.length).trim()
}

private fun firstToken(text: String): String {
    val trimmed = text.trimStart()
    if (trimmed.isEmpty()) return ""
    val end = trimmed.indexOfFirst { it.isWhitespace() }
    return if (end < 0) trimmed else trimmed.substring(0, end)
}
