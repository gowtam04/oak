package ai.gowtam.oak.features.calc

import ai.gowtam.oak.wire.Format

/**
 * Champions calc is always L50 Stat Points (CF-CALC-US-1). The format
 * argument is kept so call sites stay stable; it is ignored.
 */
fun defaultCalcLevel(format: Format): Int {
    return 50
}
