package ai.gowtam.oak.app

import android.content.Context

/**
 * Device-local Light / Dark / System appearance. Default is [System] so a fresh
 * install keeps following the phone setting. Not synced to the account — theme
 * is a device preference (unlike answer-card density).
 */
enum class AppearancePreference {
    System,
    Light,
    Dark,
    ;

    val stored: String
        get() = when (this) {
            System -> "system"
            Light -> "light"
            Dark -> "dark"
        }

    val title: String
        get() = when (this) {
            System -> "System"
            Light -> "Light"
            Dark -> "Dark"
        }

    /** Resolve against the current OS night mode. */
    fun resolveDark(systemDark: Boolean): Boolean = when (this) {
        System -> systemDark
        Light -> false
        Dark -> true
    }

    companion object {
        fun fromStored(raw: String?): AppearancePreference = when (raw) {
            "light" -> Light
            "dark" -> Dark
            else -> System
        }
    }
}

interface AppearanceStore {
    fun load(): AppearancePreference
    fun save(preference: AppearancePreference)
}

class InMemoryAppearanceStore(
    initial: AppearancePreference = AppearancePreference.System,
) : AppearanceStore {
    private var value: AppearancePreference = initial

    override fun load(): AppearancePreference = value

    override fun save(preference: AppearancePreference) {
        value = preference
    }
}

class SharedPreferencesAppearanceStore(context: Context) : AppearanceStore {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun load(): AppearancePreference =
        AppearancePreference.fromStored(prefs.getString(KEY, null))

    override fun save(preference: AppearancePreference) {
        prefs.edit().putString(KEY, preference.stored).apply()
    }

    companion object {
        const val PREFS = "oak-appearance"
        const val KEY = "oak-appearance"
    }
}
