package ai.gowtam.oak.ui.orbs

object OrbEngine {
    internal fun resolve(state: OrbState, size: OrbSize): OrbResolved = OrbPresets.resolve(state, size)

    fun frame(state: OrbState, size: OrbSize, t: Double): OrbFrame {
        val resolved = OrbPresets.resolve(state, size)
        return OrbModes.frame(resolved.mode, size.px.toDouble(), t, resolved.opts)
    }
}
