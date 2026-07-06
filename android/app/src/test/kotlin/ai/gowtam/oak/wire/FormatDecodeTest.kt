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
        assertEquals(12, list.conversations.size)
        val byId = list.conversations.associateBy { it.id }
        assertEquals(Format.NationalDex, byId.getValue("conv_natdex").format)
        assertEquals(Format.ScarletViolet, byId.getValue("conv_sv").format)
        assertEquals(Format.Champions, byId.getValue("conv_champions").format)
        assertEquals(Format.Gen5, byId.getValue("conv_gen5").format)
        assertEquals(Format.Gen6, byId.getValue("conv_gen6").format)
        assertEquals(Format.Gen7, byId.getValue("conv_gen7").format)
        assertEquals(Format.Gen8, byId.getValue("conv_gen8").format)
        assertEquals(Format.Gen4, byId.getValue("conv_gen4").format)
        assertEquals(Format.Gen3, byId.getValue("conv_gen3").format)
        assertEquals(Format.Gen2, byId.getValue("conv_gen2").format)
        assertEquals(Format.Gen1, byId.getValue("conv_gen1").format)
        // gen-99-mystery stays LAST — the unknown-format row is appended, not inserted.
        assertEquals("conv_unknown", list.conversations.last().id)
        val unknown = byId.getValue("conv_unknown").format
        assertEquals(Format.Unknown("gen-99-mystery"), unknown)
        assertEquals("gen-99-mystery", unknown.shortLabel)
        assertEquals("gen-99-mystery", unknown.displayLabel)
    }

    @Test
    fun knownCasesExcludesUnknownAndUsesDisplayOrder() {
        assertEquals(
            listOf(
                Format.NationalDex, Format.Champions, Format.ScarletViolet,
                Format.Gen8, Format.Gen7, Format.Gen6, Format.Gen5,
                Format.Gen4, Format.Gen3, Format.Gen2, Format.Gen1,
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
        assertEquals("National Dex · All Gens", Format.NationalDex.displayLabel)
        assertEquals("Champions · Reg M-B", Format.Champions.displayLabel)
        assertEquals("Gen 9 · Scarlet/Violet", Format.ScarletViolet.displayLabel)
        assertEquals("Gen 8 · Sword/Shield", Format.Gen8.displayLabel)
        assertEquals("Gen 7 · USUM", Format.Gen7.displayLabel)
        assertEquals("Gen 6 · XY/ORAS", Format.Gen6.displayLabel)
        assertEquals("Gen 5 · Black/White", Format.Gen5.displayLabel)
        assertEquals("Gen 4 · Diamond/Pearl", Format.Gen4.displayLabel)
        assertEquals("Gen 3 · Ruby/Sapphire", Format.Gen3.displayLabel)
        assertEquals("Gen 2 · Gold/Silver", Format.Gen2.displayLabel)
        assertEquals("Gen 1 · Red/Blue", Format.Gen1.displayLabel)
        assertTrue(Format.knownCases.all { it.rawValue.isNotBlank() })
    }
}
