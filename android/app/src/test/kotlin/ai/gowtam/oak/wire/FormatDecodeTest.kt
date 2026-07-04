package ai.gowtam.oak.wire

import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

@Serializable
private data class ConversationsListEnvelope(val conversations: List<ConversationSummary>)

/**
 * [Format] and [ScopeSource] tolerant decode: an unrecognized wire string
 * degrades to `Unknown(raw)` rather than failing the parent object's decode.
 */
class FormatDecodeTest {

    @Test
    fun allSixKnownFormatsDecode() {
        val list = OakJson.decodeFromString<ConversationsListEnvelope>(Fixtures.string("conversations_list.json"))
        assertEquals(Format.ScarletViolet, list.conversations[0].format)
        assertEquals(Format.Champions, list.conversations[1].format)
    }

    @Test
    fun aFutureFormatDegradesToUnknownWithoutFailingTheParentList() {
        val list = OakJson.decodeFromString<ConversationsListEnvelope>(
            Fixtures.string("conversations_list_all_formats.json"),
        )
        assertEquals(7, list.conversations.size)
        val byId = list.conversations.associateBy { it.id }
        assertEquals(Format.ScarletViolet, byId.getValue("conv_sv").format)
        assertEquals(Format.Champions, byId.getValue("conv_champions").format)
        assertEquals(Format.Gen5, byId.getValue("conv_gen5").format)
        assertEquals(Format.Gen6, byId.getValue("conv_gen6").format)
        assertEquals(Format.Gen7, byId.getValue("conv_gen7").format)
        assertEquals(Format.Gen8, byId.getValue("conv_gen8").format)
        val unknown = byId.getValue("conv_unknown").format
        assertEquals(Format.Unknown("gen-99-mystery"), unknown)
        assertEquals("gen-99-mystery", unknown.shortLabel)
        assertEquals("gen-99-mystery", unknown.displayLabel)
    }

    @Test
    fun knownCasesExcludesUnknownAndUsesDisplayOrder() {
        assertEquals(
            listOf(
                Format.Champions, Format.ScarletViolet,
                Format.Gen8, Format.Gen7, Format.Gen6, Format.Gen5,
            ),
            Format.knownCases,
        )
    }

    @Test
    fun scopeSourceDecodesAllFourKnownValues() {
        assertEquals(ScopeSource.Message, ScopeSource.fromRaw("message"))
        assertEquals(ScopeSource.Conversation, ScopeSource.fromRaw("conversation"))
        assertEquals(ScopeSource.Seed, ScopeSource.fromRaw("seed"))
        assertEquals(ScopeSource.Default, ScopeSource.fromRaw("default"))
    }

    @Test
    fun scopeSourceDegradesUnknownRatherThanThrowing() {
        assertEquals(ScopeSource.Unknown("model_override"), ScopeSource.fromRaw("model_override"))
    }

    @Test
    fun formatDisplayLabelsMatchScopeLabelTs() {
        assertEquals("Champions · Reg M-B", Format.Champions.displayLabel)
        assertEquals("Gen 9 · Scarlet/Violet", Format.ScarletViolet.displayLabel)
        assertEquals("Gen 8 · Sword/Shield", Format.Gen8.displayLabel)
        assertEquals("Gen 7 · USUM", Format.Gen7.displayLabel)
        assertEquals("Gen 6 · XY/ORAS", Format.Gen6.displayLabel)
        assertEquals("Gen 5 · Black/White", Format.Gen5.displayLabel)
        assertTrue(Format.knownCases.all { it.rawValue.isNotBlank() })
    }
}
