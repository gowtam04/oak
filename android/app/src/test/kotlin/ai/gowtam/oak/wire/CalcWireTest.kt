package ai.gowtam.oak.wire

import ai.gowtam.oak.features.calc.defaultCalcLevel
import ai.gowtam.oak.features.calc.explainCalcPrompt
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Phase 8 wire + portable calc helpers (CALC-US-4/5/7/8).
 *
 * Fails to compile until P8 adds:
 *
 *   wire/CalcWire.kt
 *     CalcSide, CalcMove, CalcField, CalcScenario
 *     CalcKo, CalcSpreadEstimate, CalcEstimate, CalcApplied, CalcCommonSpread
 *     CalcResult.Ok / CalcResult.Error  (discriminated on `ok`)
 *
 *   features/calc/defaultCalcLevel.kt  — `fun defaultCalcLevel(format: Format): Int`
 *   features/calc/explainCalcPrompt.kt — `fun explainCalcPrompt(scenario, result): String`
 *
 * Lockstep with `web/src/lib/calc/{calc-schema,default-level,explain-prompt}.ts`.
 *
 * Requirement refs: CALC-US-4, CALC-US-5, CALC-US-7, CALC-US-8,
 * CALC-AC-4.1, CALC-AC-4.4, CALC-AC-5.1, CALC-AC-5.4, CALC-AC-7.1, CALC-AC-8.1,
 * CALC-BR-2, CALC-BR-7, CALC-BR-8.
 */
class CalcWireTest {

    private val validScenarioJson = """
        {
          "format": "scarlet-violet",
          "attacker": { "species": "garchomp" },
          "defender": { "species": "farigiraf" },
          "move": { "slug": "earthquake" }
        }
    """.trimIndent()

    private val validSuccessJson = """
        {
          "ok": true,
          "format": "scarlet-violet",
          "estimate": {
            "min_damage": 100,
            "max_damage": 120,
            "percent_min": 30,
            "percent_max": 36,
            "ko": { "hits": 3 },
            "is_estimate": true
          },
          "breakdown": "floor(base × roll × STAB × type × other)",
          "applied": {
            "stab": true,
            "type_effectiveness": 1,
            "other_modifier": 1,
            "unsupported": []
          }
        }
    """.trimIndent()

    // -------------------------------------------------------------------
    // CALC-US-4 / CALC-AC-4.1 — scenario decode
    // -------------------------------------------------------------------

    @Test
    fun decodesAMinimalCompleteScenario() {
        val scenario = OakJson.decodeFromString<CalcScenario>(validScenarioJson)
        assertEquals(Format.ScarletViolet, scenario.format)
        assertEquals("garchomp", scenario.attacker.species)
        assertEquals("farigiraf", scenario.defender.species)
        assertEquals("earthquake", scenario.move.slug)
    }

    @Test
    fun decodesOptionalSetAndFieldKnobs() {
        val json = """
            {
              "format": "champions",
              "attacker": {
                "species": "garchomp",
                "ability": "rough-skin",
                "item": "life-orb",
                "nature": "jolly",
                "evs": { "hp": 4, "atk": 252, "spe": 252 },
                "ivs": { "hp": 31 },
                "tera": "ground",
                "level": 50
              },
              "defender": {
                "species": "farigiraf",
                "ability": null,
                "item": null,
                "nature": null,
                "tera": null
              },
              "move": { "slug": "earthquake", "name": "Earthquake", "category": "physical" },
              "field": { "weather": "sun", "reflect": true, "light_screen": false }
            }
        """.trimIndent()
        val scenario = OakJson.decodeFromString<CalcScenario>(json)
        assertEquals(Format.Champions, scenario.format)
        assertEquals("life-orb", scenario.attacker.item)
        assertEquals(50, scenario.attacker.level)
        assertEquals("ground", scenario.attacker.tera)
        assertEquals(252, scenario.attacker.evs?.get("atk"))
        assertNull(scenario.defender.item)
        assertEquals("sun", scenario.field?.weather)
        assertEquals(true, scenario.field?.reflect)
        assertEquals(false, scenario.field?.lightScreen)
    }

    @Test
    fun incompleteSidesStillDecodeSoTheEngineCanReturnIncomplete() {
        val json = """
            { "format": "national-dex", "attacker": {}, "defender": {}, "move": {} }
        """.trimIndent()
        val scenario = OakJson.decodeFromString<CalcScenario>(json)
        assertEquals(Format.NationalDex, scenario.format)
        assertNull(scenario.attacker.species)
        assertNull(scenario.defender.species)
        assertNull(scenario.move.slug)
        assertNull(scenario.move.name)
    }

    @Test
    fun roundTripsAScenarioThroughOakJson() {
        val scenario = CalcScenario(
            format = Format.Gen5,
            attacker = CalcSide(species = "garchomp", item = "life-orb", level = 100),
            defender = CalcSide(species = "ferrothorn"),
            move = CalcMove(slug = "earthquake", name = "Earthquake"),
            field = CalcField(weather = "sand", reflect = false, lightScreen = true),
        )
        val encoded = OakJson.encodeToString(CalcScenario.serializer(), scenario)
        val decoded = OakJson.decodeFromString<CalcScenario>(encoded)
        assertEquals(scenario, decoded)
        assertTrue(encoded.contains("\"light_screen\""))
    }

    // -------------------------------------------------------------------
    // CALC-US-5 / CALC-AC-5.1 / CALC-BR-2 — success + in-domain error
    // -------------------------------------------------------------------

    @Test
    fun decodesASuccessResultAsAnEstimate() {
        val result = OakJson.decodeFromString<CalcResult>(validSuccessJson)
        val ok = result as CalcResult.Ok
        assertTrue(ok.ok)
        assertEquals(Format.ScarletViolet, ok.format)
        assertEquals(100, ok.estimate.minDamage)
        assertEquals(120, ok.estimate.maxDamage)
        assertEquals(30.0, ok.estimate.percentMin, 0.0)
        assertEquals(36.0, ok.estimate.percentMax, 0.0)
        assertEquals(3, ok.estimate.ko.hits)
        assertTrue(ok.estimate.isEstimate)
        assertTrue(ok.applied.unsupported.isEmpty())
        assertNull(ok.commonSpreads)
        assertNull(ok.caveat)
    }

    @Test
    fun decodesAnIncompleteErrorWithoutInventingARange() {
        val json = """
            { "ok": false, "error": "incomplete", "detail": "attacker.species is required" }
        """.trimIndent()
        val result = OakJson.decodeFromString<CalcResult>(json)
        val err = result as CalcResult.Error
        assertFalse(err.ok)
        assertEquals("incomplete", err.error)
        assertEquals("attacker.species is required", err.detail)
        assertNull(err.suggestions)
    }

    @Test
    fun decodesStatusMoveAndUnresolvedErrors() {
        val status = OakJson.decodeFromString<CalcResult>(
            """{ "ok": false, "error": "status_move" }""",
        ) as CalcResult.Error
        assertEquals("status_move", status.error)

        val unresolved = OakJson.decodeFromString<CalcResult>(
            """{ "ok": false, "error": "unresolved", "suggestions": ["garchomp"] }""",
        ) as CalcResult.Error
        assertEquals("unresolved", unresolved.error)
        assertEquals(listOf("garchomp"), unresolved.suggestions)
    }

    @Test
    fun decodesCommonSpreadsAndAnOldGenCaveat() {
        val json = """
            {
              "ok": true,
              "format": "gen-1",
              "estimate": {
                "min_damage": 80, "max_damage": 96,
                "percent_min": 25, "percent_max": 30,
                "ko": { "hits": 4 }, "is_estimate": true
              },
              "breakdown": "modern estimate",
              "applied": { "stab": true, "type_effectiveness": 1, "other_modifier": 1, "unsupported": [] },
              "common_spreads": [
                {
                  "label": "min",
                  "estimate": {
                    "min_damage": 80, "max_damage": 96,
                    "percent_min": 25, "percent_max": 30,
                    "ko": { "hits": 4 }
                  }
                }
              ],
              "caveat": "Not gen-accurate"
            }
        """.trimIndent()
        val ok = OakJson.decodeFromString<CalcResult>(json) as CalcResult.Ok
        assertEquals("Not gen-accurate", ok.caveat)
        assertEquals("min", ok.commonSpreads!!.single().label)
        assertTrue(ok.estimate.isEstimate)
    }

    // -------------------------------------------------------------------
    // CALC-US-7 / CALC-BR-7 — default level matrix
    // -------------------------------------------------------------------

    @Test
    fun defaultLevelIs50ForChampionsAnd100Otherwise() {
        assertEquals(50, defaultCalcLevel(Format.Champions))
        val hundreds = listOf(
            Format.NationalDex, Format.ScarletViolet,
            Format.Gen1, Format.Gen2, Format.Gen3, Format.Gen4,
            Format.Gen5, Format.Gen6, Format.Gen7, Format.Gen8,
        )
        for (format in hundreds) {
            assertEquals("defaultCalcLevel($format)", 100, defaultCalcLevel(format))
        }
    }

    // -------------------------------------------------------------------
    // CALC-US-8 — explain prompt is a chat message, not JSON
    // -------------------------------------------------------------------

    @Test
    fun explainPromptIsADeterministicChatMessage() {
        val scenario = CalcScenario(
            format = Format.ScarletViolet,
            attacker = CalcSide(
                species = "garchomp",
                item = "life-orb",
                ability = "rough-skin",
                nature = "jolly",
                evs = mapOf("atk" to 252, "spe" to 252, "hp" to 4),
                level = 100,
                tera = "ground",
            ),
            defender = CalcSide(
                species = "farigiraf",
                item = "leftovers",
                ability = "armor-tail",
                nature = "modest",
                evs = mapOf("hp" to 252, "spd" to 252),
                level = 100,
                tera = "fairy",
            ),
            move = CalcMove(slug = "earthquake", name = "Earthquake"),
            field = CalcField(weather = "sun", reflect = true, lightScreen = false),
        )
        val result = CalcResult.Ok(
            format = Format.ScarletViolet,
            estimate = CalcEstimate(
                minDamage = 100, maxDamage = 120,
                percentMin = 30.0, percentMax = 36.0,
                ko = CalcKo(hits = 3), isEstimate = true,
            ),
            breakdown = "estimate",
            applied = CalcApplied(
                stab = true,
                typeEffectiveness = 1.0,
                otherModifier = 1.3,
                weather = "sun",
                screens = listOf("Reflect"),
                item = "life-orb",
                unsupported = listOf("leftovers"),
            ),
        )
        val prompt = explainCalcPrompt(scenario, result)
        assertTrue(prompt.startsWith("Explain this damage estimate (do not re-roll unless needed)."))
        assertTrue(prompt.contains("Format: scarlet-violet"))
        assertTrue(prompt.contains("garchomp"))
        assertTrue(prompt.contains("life-orb"))
        assertTrue(prompt.contains("L100"))
        assertTrue(prompt.contains("Tera ground"))
        assertTrue(prompt.contains("farigiraf"))
        assertTrue(prompt.contains("Earthquake") || prompt.contains("earthquake"))
        assertTrue(prompt.contains("sun"))
        assertTrue(prompt.contains("Reflect"))
        assertTrue(prompt.contains("leftovers"))
        assertTrue(prompt.contains("100") && prompt.contains("120"))
        assertTrue(prompt.contains("3HKO") || prompt.contains("3 HKO"))
        assertTrue(prompt.contains("\n"))
        try {
            OakJson.parseToJsonElement(prompt)
            throw AssertionError("explain prompt must not be JSON")
        } catch (_: Exception) {
            // expected — a chat message, not a JSON body
        }
    }
}
