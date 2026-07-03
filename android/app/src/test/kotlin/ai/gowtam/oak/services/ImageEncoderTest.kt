package ai.gowtam.oak.services

import ai.gowtam.oak.networking.ImageRejectReason
import ai.gowtam.oak.networking.OakError
import java.util.Base64
import kotlin.math.max
import kotlin.math.roundToInt
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Exercises [ImageEncoder]'s fit/encode loop against a scripted [BitmapOps] fake — no
 * `android.graphics.Bitmap` involved, so this runs as a plain JVM unit test
 * (implementation-plan.md P4 acceptance check 3). The fake tracks every [compress]
 * call so the quality-then-dimension fit order can be asserted directly, mirroring
 * `ios/OakApp/Services/ImageEncoder.swift`'s `reencode`/`bestJpeg`/`downscaled`/
 * `shrunk` (lines 121–206): quality steps `[80, 60, 45, 30]` tried at the CURRENT
 * dimensions before any shrink, then the dimensions shrink by `0.8` and the quality
 * steps restart from the top.
 */
class ImageEncoderTest {

    private class FakeSource(val widthPx: Int, val heightPx: Int, val hasAlpha: Boolean) : SourceImage
    private data class FakeHandle(val widthPx: Int, val heightPx: Int) : DecodedHandle

    /** Records every [compress] call as `(format, quality, width)` and returns bytes per [sizeOf]. */
    private class ScriptedBitmapOps(
        private val sizeOf: (format: CompressFormat, quality: Int, width: Int) -> Int?,
    ) : BitmapOps {
        val compressCalls = mutableListOf<Triple<CompressFormat, Int, Int>>()

        override fun decodeBounds(source: SourceImage): ImageBounds? {
            val s = source as? FakeSource ?: return null
            return ImageBounds(s.widthPx, s.heightPx, s.hasAlpha)
        }

        override fun scale(source: SourceImage, maxDimension: Int): DecodedHandle? {
            val s = source as? FakeSource ?: return null
            val (w, h) = scaledDims(s.widthPx, s.heightPx, maxDimension)
            return FakeHandle(w, h)
        }

        override fun shrink(handle: DecodedHandle, factor: Double): DecodedHandle? {
            val handleDims = handle as FakeHandle
            val longest = max(handleDims.widthPx, handleDims.heightPx)
            val target = (longest * factor).roundToInt()
            if (target < 1 || target >= longest) return null
            val (w, h) = scaledDims(handleDims.widthPx, handleDims.heightPx, target)
            return FakeHandle(w, h)
        }

        override fun compress(handle: DecodedHandle, format: CompressFormat, quality: Int): ByteArray? {
            val handleDims = handle as FakeHandle
            compressCalls += Triple(format, quality, handleDims.widthPx)
            val size = sizeOf(format, quality, handleDims.widthPx) ?: return null
            return ByteArray(size)
        }

        private fun scaledDims(width: Int, height: Int, maxDimension: Int): Pair<Int, Int> {
            val longest = max(width, height)
            if (longest <= maxDimension) return width to height
            val ratio = maxDimension.toDouble() / longest
            return max(1, (width * ratio).roundToInt()) to max(1, (height * ratio).roundToInt())
        }
    }

    // -----------------------------------------------------------------
    // Caps
    // -----------------------------------------------------------------

    @Test
    fun emptyInputReturnsEmptyListWithoutThrowing() {
        val encoder = ImageEncoder(bitmapOps = ScriptedBitmapOps { _, _, _ -> 10 })
        assertEquals(emptyList<Any>(), encoder.encode(emptyList()))
    }

    @Test
    fun fiveImagesRejectedAsTooMany() {
        val encoder = ImageEncoder(bitmapOps = ScriptedBitmapOps { _, _, _ -> 10 }, maxImages = 4)
        val images = List(5) { FakeSource(100, 100, hasAlpha = false) }
        try {
            encoder.encode(images)
            fail("expected ImageRejected(TooMany)")
        } catch (e: OakError.ImageRejected) {
            assertEquals(ImageRejectReason.TooMany, e.reason)
        }
    }

    @Test
    fun fourImagesAtTheCapIsAllowed() {
        val encoder = ImageEncoder(
            bitmapOps = ScriptedBitmapOps { _, _, _ -> 10 },
            maxImages = 4,
            maxImageBytes = 1_000,
            maxTotalBytes = 1_000_000,
        )
        val images = List(4) { FakeSource(100, 100, hasAlpha = false) }
        assertEquals(4, encoder.encode(images).size)
    }

    @Test
    fun oversizedSingleImageRejectedAsPerImageTooLarge() {
        // Every quality/dimension attempt produces bytes over the cap — a pathological
        // threshold the fit loop can never satisfy.
        val encoder = ImageEncoder(
            bitmapOps = ScriptedBitmapOps { _, _, _ -> 10_000 },
            maxImageBytes = 100,
            maxTotalBytes = 1_000_000,
        )
        try {
            encoder.encode(listOf(FakeSource(2000, 2000, hasAlpha = false)))
            fail("expected ImageRejected(PerImageTooLarge)")
        } catch (e: OakError.ImageRejected) {
            assertEquals(ImageRejectReason.PerImageTooLarge, e.reason)
        }
    }

    @Test
    fun secondImagePushingTotalOverCapRejectedAsTotalTooLarge() {
        // Each image individually fits the per-image cap, but together exceed the total.
        val encoder = ImageEncoder(
            bitmapOps = ScriptedBitmapOps { _, quality, _ -> if (quality == 80) 600 else 600 },
            maxImageBytes = 1_000,
            maxTotalBytes = 1_000,
        )
        val images = listOf(FakeSource(100, 100, hasAlpha = false), FakeSource(100, 100, hasAlpha = false))
        try {
            encoder.encode(images)
            fail("expected ImageRejected(TotalTooLarge)")
        } catch (e: OakError.ImageRejected) {
            assertEquals(ImageRejectReason.TotalTooLarge, e.reason)
        }
    }

    @Test
    fun undecodableSourceRejectedAsUnsupportedType() {
        val encoder = ImageEncoder(bitmapOps = ScriptedBitmapOps { _, _, _ -> 10 })
        val notDecodable = object : SourceImage {} // not a FakeSource -> decodeBounds returns null
        try {
            encoder.encode(listOf(notDecodable))
            fail("expected ImageRejected(UnsupportedType)")
        } catch (e: OakError.ImageRejected) {
            assertEquals(ImageRejectReason.UnsupportedType, e.reason)
        }
    }

    // -----------------------------------------------------------------
    // Fit loop order: quality steps at the current size, THEN a dimension shrink,
    // THEN the quality steps restart — mirrors iOS's reencode/bestJpeg/shrunk.
    // -----------------------------------------------------------------

    @Test
    fun fitLoopTriesAllFourQualityStepsBeforeShrinkingDimensions() {
        // At width 1000 (post initial downscale from 2000 -> maxDimension 1000), no
        // quality step fits a 250-byte cap (800/600/450/300). Only after shrinking to
        // width 800 does quality 30 (240 bytes) fit.
        val ops = ScriptedBitmapOps { format, quality, width ->
            if (format != CompressFormat.JPEG) null else (width * quality) / 100
        }
        val encoder = ImageEncoder(
            bitmapOps = ops,
            maxImageBytes = 250,
            maxTotalBytes = 1_000_000,
            maxDimension = 1000,
        )
        val result = encoder.encode(listOf(FakeSource(2000, 2000, hasAlpha = false)))

        assertEquals(1, result.size)
        assertEquals("image/jpeg", result.first().mimeType)

        // All four quality steps at width 1000 tried (none fit), THEN all four at width
        // 800 (the 0.8 shrink of 1000) — quality 30 fits and stops the loop there.
        val expectedOrder = listOf(
            Triple(CompressFormat.JPEG, 80, 1000),
            Triple(CompressFormat.JPEG, 60, 1000),
            Triple(CompressFormat.JPEG, 45, 1000),
            Triple(CompressFormat.JPEG, 30, 1000),
            Triple(CompressFormat.JPEG, 80, 800),
            Triple(CompressFormat.JPEG, 60, 800),
            Triple(CompressFormat.JPEG, 45, 800),
            Triple(CompressFormat.JPEG, 30, 800),
        )
        assertEquals(expectedOrder, ops.compressCalls)
    }

    @Test
    fun downscalesLongestEdgeToMaxDimensionBeforeAnyCompress() {
        val ops = ScriptedBitmapOps { _, _, width -> if (width == 1568) 10 else 999_999 }
        val encoder = ImageEncoder(bitmapOps = ops, maxImageBytes = 100, maxDimension = 1568)
        encoder.encode(listOf(FakeSource(4000, 3000, hasAlpha = false)))
        // The very first compress call must already be at the downscaled width.
        assertEquals(1568, ops.compressCalls.first().third)
    }

    // -----------------------------------------------------------------
    // PNG vs JPEG choice
    // -----------------------------------------------------------------

    @Test
    fun alphaImageThatFitsAsPngStaysPngWithoutTryingJpeg() {
        val ops = ScriptedBitmapOps { format, _, _ ->
            when (format) {
                CompressFormat.PNG -> 50
                CompressFormat.JPEG -> 10 // would also fit, but PNG must win when alpha + fits
            }
        }
        val encoder = ImageEncoder(bitmapOps = ops, maxImageBytes = 100)
        val result = encoder.encode(listOf(FakeSource(100, 100, hasAlpha = true)))

        assertEquals("image/png", result.first().mimeType)
        assertTrue(ops.compressCalls.none { it.first == CompressFormat.JPEG })
    }

    @Test
    fun alphaImageWhosePngIsTooLargeFallsBackToJpegLoop() {
        val ops = ScriptedBitmapOps { format, quality, _ ->
            if (format == CompressFormat.PNG) 999_999 else (100 - quality) // low quality -> small
        }
        val encoder = ImageEncoder(bitmapOps = ops, maxImageBytes = 50)
        val result = encoder.encode(listOf(FakeSource(100, 100, hasAlpha = true)))

        assertEquals("image/jpeg", result.first().mimeType)
        assertTrue(ops.compressCalls.any { it.first == CompressFormat.JPEG })
    }

    @Test
    fun opaqueImageNeverAttemptsPng() {
        val ops = ScriptedBitmapOps { format, quality, _ ->
            if (format == CompressFormat.PNG) 1 else (100 - quality)
        }
        val encoder = ImageEncoder(bitmapOps = ops, maxImageBytes = 1_000)
        encoder.encode(listOf(FakeSource(100, 100, hasAlpha = false)))
        assertTrue(ops.compressCalls.none { it.first == CompressFormat.PNG })
    }

    // -----------------------------------------------------------------
    // Wire shape
    // -----------------------------------------------------------------

    @Test
    fun outputBase64HasNoDataPrefixAndDecodesToTheOriginalBytes() {
        val ops = ScriptedBitmapOps { format, _, _ -> if (format == CompressFormat.JPEG) 4 else null }
        val encoder = ImageEncoder(bitmapOps = ops, maxImageBytes = 100)
        val result = encoder.encode(listOf(FakeSource(10, 10, hasAlpha = false)))

        val data = result.first().data
        assertFalse(data.startsWith("data:"))
        // A valid, prefix-free base64 string of 4 zero bytes.
        assertEquals(4, Base64.getDecoder().decode(data).size)
    }
}
