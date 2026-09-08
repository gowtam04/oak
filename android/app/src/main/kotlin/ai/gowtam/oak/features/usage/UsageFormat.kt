package ai.gowtam.oak.features.usage

import java.text.DateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/** Medium date + short time in [timeZone] (device zone by default). Never a trailing `Z`. */
internal fun formatUsageFetchedAt(
    ms: Long,
    timeZone: TimeZone = TimeZone.getDefault(),
    locale: Locale = Locale.getDefault(),
): String {
    val fmt = DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT, locale)
    fmt.timeZone = timeZone
    return fmt.format(Date(ms))
}

internal data class UsageAttributionParts(val source: String, val legal: String?)

/** Split `"championsbattledata.com — a community-maintained …"` into name + remainder. */
internal fun parseUsageAttribution(raw: String): UsageAttributionParts {
    val trimmed = raw.trim()
    if (trimmed.isEmpty()) return UsageAttributionParts(trimmed, null)
    for (sep in listOf(" — ", " – ", " - ")) {
        val idx = trimmed.indexOf(sep)
        if (idx <= 0) continue
        val source = trimmed.substring(0, idx).trim()
        val legal = trimmed.substring(idx + sep.length).trim()
        if (source.isNotEmpty()) {
            return UsageAttributionParts(source, legal.takeIf { it.isNotEmpty() })
        }
    }
    return UsageAttributionParts(trimmed, null)
}
