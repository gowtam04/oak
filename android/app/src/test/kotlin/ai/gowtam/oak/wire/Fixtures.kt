package ai.gowtam.oak.wire

/**
 * Loads committed real-response fixtures from `src/test/resources/fixtures/`
 * (copied verbatim from `ios/OakAppTests/Fixtures/` — the same fixtures back
 * both clients' decode tests, keeping them provably in sync).
 */
object Fixtures {
    fun string(name: String): String {
        val stream = Fixtures::class.java.classLoader?.getResourceAsStream("fixtures/$name")
            ?: error("Fixture not found: $name")
        return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }
}
