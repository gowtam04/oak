package ai.gowtam.oak.support

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.TestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.rules.TestWatcher
import org.junit.runner.Description

/**
 * Installs a [TestDispatcher] as `Dispatchers.Main` for the duration of a test —
 * required by any view model (e.g. [ai.gowtam.oak.features.chat.ChatViewModel]) that
 * uses `viewModelScope`, since `Dispatchers.Main` has no real implementation on the
 * JVM unit-test classpath. Exposes the [dispatcher] so a test can drive its virtual
 * scheduler explicitly (`dispatcher.scheduler.advanceUntilIdle()`) to control exactly
 * when a `viewModelScope.launch`ed coroutine (e.g. the chat stream consumer) runs
 * relative to the test's own assertions — the ordering that matters for the
 * stream-resilience state machine's "Reconnecting…" window.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class MainDispatcherRule(
    val dispatcher: TestDispatcher = StandardTestDispatcher(),
) : TestWatcher() {
    override fun starting(description: Description) {
        Dispatchers.setMain(dispatcher)
    }

    override fun finished(description: Description) {
        Dispatchers.resetMain()
    }
}
