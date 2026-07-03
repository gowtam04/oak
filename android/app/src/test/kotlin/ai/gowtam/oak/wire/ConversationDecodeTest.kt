package ai.gowtam.oak.wire

import kotlinx.serialization.decodeFromString
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** Decode coverage for [ConversationDetail] / [ChatTurn] (the role-discriminated union). */
class ConversationDecodeTest {

    @Test
    fun conversationDetailDecodesUserAndAssistantTurns() {
        val detail = OakJson.decodeFromString<ConversationDetail>(Fixtures.string("conversation_detail.json"))
        assertEquals("conv_1", detail.id)
        assertEquals(Format.ScarletViolet, detail.format)
        assertEquals(2, detail.turns.size)

        val user = detail.turns[0] as ChatTurn.User
        assertEquals("msg_1", user.id)
        assertTrue(user.content.contains("Dragon-types"))

        val assistant = detail.turns[1] as ChatTurn.Assistant
        assertEquals("msg_2", assistant.id)
        assertEquals(OakAnswer.Status.ANSWERED, assistant.answer.status)
        assertEquals("Dragapult", assistant.answer.subjects?.first()?.name)
    }
}
