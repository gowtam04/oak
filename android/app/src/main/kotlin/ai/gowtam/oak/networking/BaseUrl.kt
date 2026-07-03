package ai.gowtam.oak.networking

import ai.gowtam.oak.BuildConfig
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull

/**
 * The Oak backend base URL, read from [BuildConfig.BASE_URL] (set per build
 * variant — component-design.md "Networking layer"; api-usage.md "Base URL";
 * mirrors iOS `BaseURL`).
 *
 * HTTPS is enforced here, once, as a client-side backstop: [resolve] fails
 * fast with [OakError.Transport]`("insecure_scheme")` for anything but
 * `https`. [OakApiClient] itself trusts whatever [HttpUrl] it is constructed
 * with — only the app's *real* base URL is routed through this gate, which
 * keeps the client free to point at a plain-http `MockWebServer` in tests.
 */
object BaseUrl {
    /** The base URL for this build, HTTPS-checked the first time it's read. */
    val current: HttpUrl by lazy { resolve(BuildConfig.BASE_URL) }

    /**
     * Parses [raw] into an [HttpUrl]. Throws [OakError.Transport] with
     * `"invalid_base_url"` for a malformed URL, or `"insecure_scheme"` for
     * anything but `https`.
     */
    fun resolve(raw: String): HttpUrl {
        val url = raw.toHttpUrlOrNull() ?: throw OakError.Transport("invalid_base_url")
        if (url.scheme != "https") throw OakError.Transport("insecure_scheme")
        return url
    }
}
