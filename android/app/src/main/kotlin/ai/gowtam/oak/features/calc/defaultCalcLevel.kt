package ai.gowtam.oak.features.calc

import ai.gowtam.oak.wire.Format

/**
 * Format-aware default level for the standalone calculator (CALC-BR-7).
 *
 * Champions is the only VGC/doubles-style member of `FORMATS` and defaults
 * to 50. Every other Oak scope defaults to 100.
 */
fun defaultCalcLevel(format: Format): Int = if (format == Format.Champions) 50 else 100
