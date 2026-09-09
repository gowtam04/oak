package ai.gowtam.oak.ui

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Test

class InsetsTest {
    @Test
    fun imeReplacesNavReservationInsteadOfStacking() {
        assertEquals(80.dp, imeAwareBottomPadding(nav = 80.dp, ime = 0.dp))
        assertEquals(300.dp, imeAwareBottomPadding(nav = 80.dp, ime = 300.dp))
        assertEquals(80.dp, imeAwareBottomPadding(nav = 80.dp, ime = 40.dp))
        assertEquals(0.dp, imeAwareBottomPadding(nav = 0.dp, ime = 0.dp))
    }
}
