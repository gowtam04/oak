package ai.gowtam.oak.services

import ai.gowtam.oak.networking.ImageRejectReason
import ai.gowtam.oak.networking.OakError
import ai.gowtam.oak.wire.ChatImage
import android.graphics.Bitmap
import java.io.ByteArrayOutputStream
import java.util.Base64
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Pixel dimensions + alpha presence for a [SourceImage] — the output of
 * [BitmapOps.decodeBounds].
 */
data class ImageBounds(val widthPx: Int, val heightPx: Int, val hasAlpha: Boolean)

/**
 * An input image to [ImageEncoder.encode]. Opaque on purpose so the encoder's
 * fit/encode loop is unit-testable on the JVM without touching `android.graphics`.
 * Production wraps a real [Bitmap] ([BitmapSourceImage]); JVM tests use a fake that
 * carries only scripted bounds.
 */
interface SourceImage

/**
 * An opaque, possibly-scaled working handle threaded through [BitmapOps.compress] /
 * [BitmapOps.shrink] between fit-loop attempts. Production wraps a scaled [Bitmap];
 * tests use a synthetic handle that only tracks a "current size" for scripting byte
 * counts.
 */
interface DecodedHandle

/** The two output encodings [ImageEncoder] ever produces. */
enum class CompressFormat { PNG, JPEG }

/**
 * The bitmap operations [ImageEncoder]'s fit/encode loop needs, seamed out from
 * `android.graphics.Bitmap` so the CORE loop logic is unit-testable on the JVM
 * (implementation-plan.md P4). Mirrors the three primitives iOS's `ImageEncoder`
 * calls on `UIImage`/`UIGraphicsImageRenderer`: read bounds, scale to a target
 * longest-edge, and compress to bytes.
 */
interface BitmapOps {
    /** Reads [source]'s pixel dimensions + alpha, or `null` if it cannot be decoded. */
    fun decodeBounds(source: SourceImage): ImageBounds?

    /**
     * Scales [source] so its longest edge is `<= maxDimension` (aspect preserved),
     * baking in any orientation. A no-op when already within the cap. Returns `null`
     * only when [source] has no decodable backing (mirrors iOS `downscaled`, which
     * itself never fails — but the seam allows a fake to model an undecodable input).
     */
    fun scale(source: SourceImage, maxDimension: Int): DecodedHandle?

    /**
     * Shrinks [handle]'s CURRENT longest edge by [factor] (0 < factor < 1). Returns
     * `null` when it cannot shrink further (already at the 1px floor) — mirrors iOS
     * `shrunk`, which computes the new target from the handle's live dimensions, not
     * from a fixed cap.
     */
    fun shrink(handle: DecodedHandle, factor: Double): DecodedHandle?

    /**
     * Compresses [handle] to bytes in [format]. [quality] is 0..100 and ignored for
     * [CompressFormat.PNG] (lossless). Returns `null` only when the handle has no
     * decodable backing.
     */
    fun compress(handle: DecodedHandle, format: CompressFormat, quality: Int): ByteArray?
}

/** The real, [Bitmap]-backed [SourceImage] production code constructs. */
class BitmapSourceImage(val bitmap: Bitmap) : SourceImage

private class BitmapDecodedHandle(val bitmap: Bitmap) : DecodedHandle

/** The real [BitmapOps] over `android.graphics.Bitmap`. */
class AndroidBitmapOps : BitmapOps {
    override fun decodeBounds(source: SourceImage): ImageBounds? {
        val bitmap = (source as? BitmapSourceImage)?.bitmap ?: return null
        return ImageBounds(bitmap.width, bitmap.height, bitmap.hasAlpha())
    }

    override fun scale(source: SourceImage, maxDimension: Int): DecodedHandle? {
        val bitmap = (source as? BitmapSourceImage)?.bitmap ?: return null
        return BitmapDecodedHandle(scaledTo(bitmap, maxDimension))
    }

    override fun shrink(handle: DecodedHandle, factor: Double): DecodedHandle? {
        val bitmap = (handle as? BitmapDecodedHandle)?.bitmap ?: return null
        val longest = max(bitmap.width, bitmap.height)
        val target = (longest * factor).roundToInt()
        if (target < 1 || target >= longest) return null
        return BitmapDecodedHandle(scaledTo(bitmap, target))
    }

    override fun compress(handle: DecodedHandle, format: CompressFormat, quality: Int): ByteArray? {
        val bitmap = (handle as? BitmapDecodedHandle)?.bitmap ?: return null
        val compressFormat = if (format == CompressFormat.PNG) {
            Bitmap.CompressFormat.PNG
        } else {
            Bitmap.CompressFormat.JPEG
        }
        val stream = ByteArrayOutputStream()
        val ok = bitmap.compress(compressFormat, quality, stream)
        return if (ok) stream.toByteArray() else null
    }

    private fun scaledTo(bitmap: Bitmap, maxDimension: Int): Bitmap {
        val longest = max(bitmap.width, bitmap.height)
        if (longest <= maxDimension) return bitmap
        val ratio = maxDimension.toFloat() / longest
        val targetWidth = max(1, (bitmap.width * ratio).roundToInt())
        val targetHeight = max(1, (bitmap.height * ratio).roundToInt())
        return Bitmap.createScaledBitmap(bitmap, targetWidth, targetHeight, true)
    }
}

/**
 * Pure `SourceImage` → validated [ChatImage] encoder for the chat vision path
 * (component-design.md "Services layer"; api-usage.md "Image caps"). It is the
 * **client-side mirror** of the backend's `@/server/image-upload` guard: it enforces
 * the same caps BEFORE the stream opens so a bad attachment is a fast, local
 * rejection rather than a wasted round-trip. Class-for-class port of iOS
 * `ImageEncoder.swift` — the fit/encode loop below mirrors its `reencode`/`bestJpeg`/
 * `downscaled`/`shrunk` exactly, with [BitmapOps] standing in for the `UIImage`
 * calls so the loop is JVM-testable with a fake.
 *
 * What it enforces (mirrors the server, `ios/OakApp/Services/ImageEncoder.swift`):
 *  - **Count** `<= maxImages`.
 *  - **Per-image decoded bytes** `<= maxImageBytes` (~3.75 MiB) — the re-encoded
 *    output byte count, the same number the server checks.
 *  - **Total decoded bytes** `<= maxTotalBytes` (10 MiB) across the turn.
 *  - **Type** — every image is re-encoded to JPEG, or PNG when the source carries
 *    alpha and the PNG fits; this also transcodes any decodable source format.
 *
 * Downscaling is the key to getting real photos under the per-image cap: each image
 * is first scaled so its longest edge is `<= maxDimension` (1568 px — the point past
 * which the vision providers downsample anyway). If a downscaled image still exceeds
 * the byte cap, a bounded fit-to-cap pass steps the JPEG quality — then the
 * dimensions — down until it fits.
 *
 * The emitted [ChatImage.data] is **raw base64 with no `data:` prefix** — exactly the
 * wire shape `POST /api/chat` expects.
 */
class ImageEncoder(
    private val bitmapOps: BitmapOps = AndroidBitmapOps(),
    private val maxImages: Int = DEFAULT_MAX_IMAGES,
    private val maxImageBytes: Int = DEFAULT_MAX_IMAGE_BYTES,
    private val maxTotalBytes: Int = DEFAULT_MAX_TOTAL_BYTES,
    private val maxDimension: Int = DEFAULT_MAX_DIMENSION,
) {
    /**
     * Re-encodes and validates [images] into wire [ChatImage]s. An empty input is the
     * text-only path → `[]` (no throw). On any cap/type violation it throws
     * [OakError.ImageRejected] with the specific [ImageRejectReason] so the caller can
     * explain exactly what went wrong.
     */
    fun encode(images: List<SourceImage>): List<ChatImage> {
        if (images.isEmpty()) return emptyList()
        if (images.size > maxImages) {
            throw OakError.ImageRejected(ImageRejectReason.TooMany)
        }

        val encoded = mutableListOf<ChatImage>()
        var total = 0
        for (image in images) {
            val payload = reencode(image)
                ?: throw OakError.ImageRejected(ImageRejectReason.UnsupportedType)
            if (payload.bytes.size > maxImageBytes) {
                throw OakError.ImageRejected(ImageRejectReason.PerImageTooLarge)
            }
            total += payload.bytes.size
            if (total > maxTotalBytes) {
                throw OakError.ImageRejected(ImageRejectReason.TotalTooLarge)
            }
            // Raw base64, no `data:` prefix — the wire shape the server expects.
            encoded += ChatImage(
                mimeType = payload.mimeType,
                data = Base64.getEncoder().encodeToString(payload.bytes),
            )
        }
        return encoded
    }

    private data class Payload(val mimeType: String, val bytes: ByteArray)

    /**
     * Downscales [source] to the longest-edge cap, then re-encodes it: PNG when the
     * (downscaled) image carries alpha and the PNG already fits, otherwise JPEG with a
     * bounded quality-then-dimension fit-to-cap pass. Returns `null` when no encoding
     * can be produced (an undecodable source), which [encode] maps to
     * [ImageRejectReason.UnsupportedType]. May return bytes that still exceed the
     * cap for a pathological threshold — [encode]'s guard reports that as
     * [ImageRejectReason.PerImageTooLarge].
     */
    private fun reencode(source: SourceImage): Payload? {
        val bounds = bitmapOps.decodeBounds(source) ?: return null
        var handle = bitmapOps.scale(source, maxDimension) ?: return null

        // Alpha + a PNG that already fits → keep PNG (lossless, preserves transparency).
        if (bounds.hasAlpha) {
            val png = bitmapOps.compress(handle, CompressFormat.PNG, PNG_QUALITY)
            if (png != null && png.size <= maxImageBytes) return Payload("image/png", png)
        }

        // JPEG with a bounded fit-to-cap loop: step quality down (inside `bestJpeg`),
        // then shrink dimensions and retry, until the bytes fit or attempts run out.
        var smallest: ByteArray? = null
        for (attempt in 0 until MAX_FIT_ATTEMPTS) {
            val jpeg = bestJpeg(handle)
            if (jpeg != null) {
                val current = smallest
                if (current == null || jpeg.size < current.size) smallest = jpeg
                if (jpeg.size <= maxImageBytes) return Payload("image/jpeg", jpeg)
            }
            if (attempt == MAX_FIT_ATTEMPTS - 1) break
            handle = bitmapOps.shrink(handle, SHRINK_FACTOR) ?: break
        }
        smallest?.let { return Payload("image/jpeg", it) }

        // JPEG never encoded (no real bitmap) — last-ditch PNG, else give up.
        val png = bitmapOps.compress(handle, CompressFormat.PNG, PNG_QUALITY)
        if (png != null) return Payload("image/png", png)
        return null
    }

    /**
     * Encodes [handle] as JPEG, returning the highest-quality step whose bytes are
     * `<= maxImageBytes`; when none fit, the smallest (lowest-quality) JPEG is
     * returned so the caller can shrink dimensions and try again. `null` only when
     * the handle cannot be JPEG-encoded at all.
     */
    private fun bestJpeg(handle: DecodedHandle): ByteArray? {
        var smallest: ByteArray? = null
        for (quality in JPEG_QUALITY_STEPS) {
            val data = bitmapOps.compress(handle, CompressFormat.JPEG, quality) ?: continue
            if (data.size <= maxImageBytes) return data
            smallest = data // qualities descend, so this keeps the smallest
        }
        return smallest
    }

    companion object {
        /** Max images per turn (matches the server's `MAX_IMAGES`). */
        const val DEFAULT_MAX_IMAGES = 4

        /** Per-image decoded-byte cap (~3.75 MiB; matches `MAX_IMAGE_BYTES`). */
        const val DEFAULT_MAX_IMAGE_BYTES = 3_932_160

        /** Combined decoded-byte cap across the turn (10 MiB; matches `MAX_TOTAL_IMAGE_BYTES`). */
        const val DEFAULT_MAX_TOTAL_BYTES = 10_485_760

        /**
         * Longest-edge pixel cap applied before re-encoding. 1568 px is the resolution
         * past which the vision providers downsample, so a larger image carries no
         * vision benefit — only more bytes/tokens.
         */
        const val DEFAULT_MAX_DIMENSION = 1568

        /**
         * JPEG re-encode qualities (0..100), tried in descending order by [bestJpeg]:
         * the highest quality whose bytes fit the cap wins.
         */
        private val JPEG_QUALITY_STEPS = listOf(80, 60, 45, 30)

        /** PNG is always encoded lossless; the quality parameter is ignored by Bitmap.compress. */
        private const val PNG_QUALITY = 100

        /**
         * How many times [reencode] may shrink the dimensions while trying to fit the
         * per-image byte cap. A bound so a pathological cap can't loop forever.
         */
        private const val MAX_FIT_ATTEMPTS = 4

        /** Per-attempt dimension shrink factor used by the fit-to-cap pass. */
        private const val SHRINK_FACTOR = 0.8
    }
}
