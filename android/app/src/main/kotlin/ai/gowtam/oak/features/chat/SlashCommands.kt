package ai.gowtam.oak.features.chat

/**
 * Classify a composer send as a leading slash command or a normal message
 * (SLASH-US-1 / ADR-10). The parser only classifies — it does not POST.
 *
 * Android has no usage surface in this pack, so [hasUsagePage] defaults to
 * false and `/usage` is an ordinary message.
 */
sealed interface SlashCommand {
    data class Navigate(val target: Target) : SlashCommand
    data object Message : SlashCommand

    enum class Target { New, Team, Dex, Usage }
}

fun parseSlashCommand(text: String, hasUsagePage: Boolean = false): SlashCommand {
    val token = firstToken(text)
    return when (token) {
        "/new" -> SlashCommand.Navigate(SlashCommand.Target.New)
        "/team" -> SlashCommand.Navigate(SlashCommand.Target.Team)
        "/dex" -> SlashCommand.Navigate(SlashCommand.Target.Dex)
        "/usage" -> if (hasUsagePage) {
            SlashCommand.Navigate(SlashCommand.Target.Usage)
        } else {
            SlashCommand.Message
        }
        else -> SlashCommand.Message
    }
}

/** Remainder after the leading token (e.g. `"garchomp"` from `"/dex garchomp"`). */
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
