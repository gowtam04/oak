package ai.gowtam.oak.wire

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** `GET /api/folders` row / `POST` create response. */
@Serializable
data class Folder(
    val id: String,
    val name: String,
    val createdAt: Long = 0L,
)

@Serializable
data class FolderListResponse(val folders: List<Folder> = emptyList())

@Serializable
data class BulkUpdateResult(
    val updated: List<String> = emptyList(),
    val skipped: List<String> = emptyList(),
)

@Serializable
enum class BulkAction {
    @SerialName("delete") Delete,
    @SerialName("archive") Archive,
    @SerialName("unarchive") Unarchive,
    @SerialName("move") Move,
}

@Serializable
data class ForkResult(val id: String, val title: String)

@Serializable
data class PinResult(val pinnedMessageIds: List<String> = emptyList())
