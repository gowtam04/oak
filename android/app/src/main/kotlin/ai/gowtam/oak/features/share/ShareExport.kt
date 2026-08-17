package ai.gowtam.oak.features.share

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File

/** Writes [bytes] to cache and opens the system share sheet (EXP-US-2). */
fun shareExportedFile(context: Context, bytes: ByteArray, filename: String) {
    val file = File(context.cacheDir, filename)
    file.writeBytes(bytes)
    val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
    val mime = when {
        filename.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
        filename.endsWith(".md", ignoreCase = true) -> "text/markdown"
        else -> "application/octet-stream"
    }
    val intent = Intent(Intent.ACTION_SEND).apply {
        type = mime
        putExtra(Intent.EXTRA_STREAM, uri)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
    context.startActivity(Intent.createChooser(intent, "Export"))
}
