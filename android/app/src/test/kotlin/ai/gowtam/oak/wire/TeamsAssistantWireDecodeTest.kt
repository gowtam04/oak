package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * [BuilderAnswer] fixture decode (patch + advice-only turns) and the request
 * encoding shape — mirrors `TeamsAssistantWireTests.swift`'s "Fixture decoding"
 * and "Request encoding shape" sections.
 */
class TeamsAssistantWireDecodeTest {

    @Test
    fun builderAnswerWithPatchDecodes() {
        val answer = OakJson.decodeFromString<BuilderAnswer>(Fixtures.string("teams_assistant_answer_patch.json"))
        assertTrue(answer.answerMarkdown.contains("Great Tusk"))
        val patch = requireNotNull(answer.teamPatch)
        assertNull(patch.name)
        assertEquals(1, patch.slots.size)
        assertEquals(2, patch.slots.first().slot)
        val member = requireNotNull(patch.slots.first().member)
        assertEquals("great-tusk", member.species)
        assertEquals("protosynthesis", member.ability)
        assertEquals("booster-energy", member.item)
        assertEquals(
            listOf("headlong-rush", "close-combat", "rapid-spin", "ice-spinner"),
            member.moves,
        )
        assertEquals("ground", member.teraType)
    }

    @Test
    fun adviceOnlyAnswerHasNoPatch() {
        val answer = OakJson.decodeFromString<BuilderAnswer>(Fixtures.string("teams_assistant_answer_advice.json"))
        assertTrue(answer.answerMarkdown.isNotEmpty())
        assertNull(answer.teamPatch)
    }

    @Test
    fun requestEncodesToTheWireShape() {
        val request = TeamsAssistantRequest(
            sessionId = "sess-1",
            message = "Fill slot 3",
            draft = TeamsAssistantDraft(name = "Rain", format = Format.Gen7, members = listOf(blankTeamMember())),
        )
        val encoded = OakJson.encodeToString(TeamsAssistantRequest.serializer(), request)
        val json = Json.parseToJsonElement(encoded).jsonObject

        assertEquals("sess-1", json.getValue("session_id").jsonPrimitive.content)
        assertEquals("Fill slot 3", json.getValue("message").jsonPrimitive.content)
        val draft = json.getValue("draft").jsonObject
        assertEquals("Rain", draft.getValue("name").jsonPrimitive.content)
        assertEquals("gen-7", draft.getValue("format").jsonPrimitive.content)
        val members = draft.getValue("members").jsonArray
        assertEquals(1, members.size)
        val member = members[0].jsonObject
        // Nullable-required key present as an explicit null (server `.strict()` needs it).
        assertTrue(member.containsKey("ability"))
        assertEquals(JsonNull, member.getValue("ability"))
        assertEquals(50, member.getValue("level").jsonPrimitive.content.toInt())
    }
}
