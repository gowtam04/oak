package ai.gowtam.oak.networking

import android.content.Context
import android.content.SharedPreferences
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

private const val TAG = "Oak.Auth"
private const val DEFAULT_PREFS_FILE_NAME = "ai.gowtam.oak.secure_prefs"
private const val TOKEN_KEY = "session-token"

/**
 * Minimal seam over the secure-storage read/write/erase operations
 * [TokenStore] needs, so its fallback logic is JVM-unit-testable with a fake
 * — without touching the Android Keystore (conventions.md "Module
 * boundaries": only `TokenStore` touches secure storage).
 */
interface TokenPreferences {
    fun read(): String?
    fun write(token: String)
    fun erase()
}

/**
 * The real Keystore-backed store: an `EncryptedSharedPreferences`
 * (`AES256_GCM`-wrapped master key, `AES256_SIV`/`AES256_GCM` for keys/values).
 * [prefsFileName] defaults to the production file but is overridable so tests
 * never collide with a real device's stored token (mirrors iOS
 * `TokenStore(account:)`).
 */
class KeystoreTokenPreferences(
    context: Context,
    prefsFileName: String = DEFAULT_PREFS_FILE_NAME,
) : TokenPreferences {
    private val prefs: SharedPreferences by lazy {
        val masterKey = MasterKey.Builder(context.applicationContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context.applicationContext,
            prefsFileName,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    override fun read(): String? = prefs.getString(TOKEN_KEY, null)

    override fun write(token: String) {
        prefs.edit().putString(TOKEN_KEY, token).apply()
    }

    override fun erase() {
        prefs.edit().remove(TOKEN_KEY).apply()
    }
}

/**
 * Process-wide in-memory backstop, engaged only when the Keystore is
 * genuinely unavailable rather than merely empty — mirrors iOS's
 * unsigned-simulator fallback (e.g. an unsigned test/CI build with no
 * Keystore access). A normally signed build always has Keystore access, so
 * this path is never taken there.
 */
class InMemoryTokenPreferences : TokenPreferences {
    @Volatile
    private var value: String? = null

    override fun read(): String? = value

    override fun write(token: String) {
        value = token
    }

    override fun erase() {
        value = null
    }
}

/**
 * The one component that touches secure storage (conventions.md "Module
 * boundaries"; component-design.md "Networking layer"). Stores the raw
 * session token returned by `POST /api/auth/verify` so it survives relaunch
 * and can be attached as `Authorization: Bearer` on every authed request.
 *
 * The token is **never logged** (conventions.md "Logging") — failures log
 * only the exception's type name, never the token or the preferences
 * contents.
 *
 * The primary constructor takes the [TokenPreferences] seam directly (the
 * JVM-testable path — see `OakApiClientTest`/a fake `TokenPreferences`); the
 * secondary [Context] constructor is what production code uses, and it falls
 * back to [InMemoryTokenPreferences] if constructing the real Keystore-backed
 * store throws.
 */
class TokenStore(private val preferences: TokenPreferences) {
    constructor(context: Context, prefsFileName: String = DEFAULT_PREFS_FILE_NAME) : this(
        try {
            KeystoreTokenPreferences(context, prefsFileName)
        } catch (e: Exception) {
            Log.e(TAG, "Keystore init failed: ${e::class.simpleName}")
            InMemoryTokenPreferences()
        },
    )

    /** The stored token, or `null` when none is present (guest) or unreadable. */
    fun token(): String? = try {
        preferences.read()
    } catch (e: Exception) {
        Log.e(TAG, "token read failed: ${e::class.simpleName}")
        null
    }

    /** Writes (or replaces) the token. Idempotent. */
    fun set(token: String) {
        try {
            preferences.write(token)
        } catch (e: Exception) {
            Log.e(TAG, "token write failed: ${e::class.simpleName}")
        }
    }

    /** Deletes the token (sign-out / account deletion). Idempotent. */
    fun clear() {
        try {
            preferences.erase()
        } catch (e: Exception) {
            Log.e(TAG, "token clear failed: ${e::class.simpleName}")
        }
    }
}
