package ai.gowtam.oak.app

import ai.gowtam.oak.ui.ConnectionStatus
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * App-level offline detection (`platform-and-operational.md` D-NFR-1/D-NFR-5b), the
 * final piece [ai.gowtam.oak.ui.ConnectionBanner] needed: a thin wrapper over
 * [ConnectivityManager]'s network callback, exposed as a [StateFlow] so the app-wide
 * banner can reflect device connectivity regardless of which tab is active. Never
 * reports [ConnectionStatus.Reconnecting] — that transient state stays the chat
 * reducer's own concern (`ChatViewModel`'s stream-resilience banner), untouched here.
 */
private class ConnectivityObserver(context: Context) {
    private val appContext = context.applicationContext
    private val connectivityManager =
        appContext.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager

    private val _status = MutableStateFlow(currentStatus())
    val status: StateFlow<ConnectionStatus> = _status.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _status.value = ConnectionStatus.Online
        }

        override fun onLost(network: Network) {
            _status.value = currentStatus()
        }

        override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
            _status.value = if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
                capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
            ) {
                ConnectionStatus.Online
            } else {
                currentStatus()
            }
        }
    }

    fun register() {
        val manager = connectivityManager ?: return
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        runCatching { manager.registerNetworkCallback(request, callback) }
    }

    fun unregister() {
        val manager = connectivityManager ?: return
        runCatching { manager.unregisterNetworkCallback(callback) }
    }

    /** Best-effort synchronous read of the active network's validated-internet state,
     * used both as the initial value and as the [onLost] fallback (a lost network may
     * leave a different one still active, e.g. Wi-Fi -> cellular handoff). */
    private fun currentStatus(): ConnectionStatus {
        val manager = connectivityManager ?: return ConnectionStatus.Online
        val network = manager.activeNetwork ?: return ConnectionStatus.Offline
        val capabilities = manager.getNetworkCapabilities(network) ?: return ConnectionStatus.Offline
        val online = capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
            capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
        return if (online) ConnectionStatus.Online else ConnectionStatus.Offline
    }
}

/**
 * Observes device connectivity for the lifetime of the composable that calls this,
 * registering on entering composition and unregistering on leaving it. Intended to be
 * called once, near the composition root ([ai.gowtam.oak.app.OakApp]).
 */
@Composable
fun rememberConnectionStatus(): State<ConnectionStatus> {
    val context = LocalContext.current
    val observer = remember(context) { ConnectivityObserver(context) }
    DisposableEffect(observer) {
        observer.register()
        onDispose { observer.unregister() }
    }
    return observer.status.collectAsState()
}
