package ai.gowtam.oak.networking

import java.io.ByteArrayOutputStream

/**
 * Splits a raw byte stream into lines, **preserving empty lines** — the piece SSE needs
 * that a standard line reader gets wrong (component-design.md "Networking layer",
 * DADR-6). A generic newline reader (e.g. `BufferedReader.readLine`-style APIs) silently
 * collapses/drops empty lines; SSE delimits each event with a blank line
 * (`event: …\ndata: …\n\n`), and [SseParser]/[BuilderSseParser] rely on that blank line
 * to dispatch a frame — without it, every event's `data:` payload concatenates and the
 * terminal `answer` frame fails to decode (the whole stream breaks). This splitter emits
 * a line on every `\n` (`0x0A`) — including the empty string between consecutive
 * newlines.
 *
 * Splitting on the ASCII byte `0x0A` is UTF-8-safe: `0x0A` never appears inside a
 * multi-byte UTF-8 continuation byte (those are always `>= 0x80`), so buffering raw
 * bytes across calls to [consume] — even when a multi-byte character's bytes land in two
 * different chunks — and only decoding once a full line's bytes have accumulated means a
 * chunk boundary can never split a character. A trailing `\r` (CRLF input) is
 * intentionally left on the line for the parser to strip.
 *
 * Pure and synchronous (no I/O), so it's trivially unit-testable against recorded byte
 * buffers. Mirrors iOS's byte-splitting behavior in `SSEClient.swift`.
 */
class ByteLineSplitter {
    private val buffer = ByteArrayOutputStream()

    /**
     * Feeds one chunk of bytes (as read off a network stream, of any size — including a
     * chunk boundary that splits a line or a multi-byte character). Returns the complete
     * lines terminated within this chunk, in order; an unterminated remainder stays
     * buffered for the next [consume] call or [finish].
     */
    fun consume(chunk: ByteArray): List<String> {
        val lines = mutableListOf<String>()
        for (byte in chunk) {
            if (byte == NEWLINE) {
                lines.add(buffer.toString(Charsets.UTF_8))
                buffer.reset()
            } else {
                buffer.write(byte.toInt())
            }
        }
        return lines
    }

    /**
     * Returns any buffered final line not terminated by a newline, or `null` when the
     * stream ended cleanly on a `\n` (nothing left to flush).
     */
    fun finish(): String? {
        if (buffer.size() == 0) return null
        val line = buffer.toString(Charsets.UTF_8)
        buffer.reset()
        return line
    }

    private companion object {
        const val NEWLINE: Byte = 0x0A
    }
}
