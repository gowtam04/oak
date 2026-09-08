package ai.gowtam.oak.app

import ai.gowtam.oak.wire.OakJson
import ai.gowtam.oak.wire.RegulationMeta
import android.content.Context

/** Persistence for the last-known [RegulationMeta] so the chip can paint on first frame. */
interface RegulationStore {
    fun load(): RegulationMeta?
    fun save(meta: RegulationMeta)
}

class InMemoryRegulationStore(
    initial: RegulationMeta? = null,
) : RegulationStore {
    private var value: RegulationMeta? = initial

    override fun load(): RegulationMeta? = value

    override fun save(meta: RegulationMeta) {
        value = meta
    }
}

class SharedPreferencesRegulationStore(context: Context) : RegulationStore {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    override fun load(): RegulationMeta? {
        val raw = prefs.getString(KEY, null) ?: return null
        return try {
            OakJson.decodeFromString(RegulationMeta.serializer(), raw).takeIf { it.isUsable }
        } catch (_: Exception) {
            null
        }
    }

    override fun save(meta: RegulationMeta) {
        prefs.edit().putString(KEY, OakJson.encodeToString(RegulationMeta.serializer(), meta)).apply()
    }

    companion object {
        const val PREFS = "oak-regulation"
        const val KEY = "oak-regulation-meta"
    }
}
