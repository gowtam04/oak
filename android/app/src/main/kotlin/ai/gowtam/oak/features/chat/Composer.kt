package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The chat composer: a growing text field, an image-attach menu (Photo Picker or
 * camera), a staged-thumbnail row with per-image remove, and a send↔stop button. All
 * turn logic lives in [ChatViewModel]; this is layout + bindings plus the local picker
 * presentation state. Mirrors the iOS `ComposerView` (the scope control is the header
 * chip, not here).
 *
 * The Photo Picker path (`PickMultipleVisualMedia`) needs no permission or manifest.
 * The camera path uses `TakePicture` with a `FileProvider` URI + a runtime CAMERA
 * permission requested only on tap; it additionally needs a `<provider>` +
 * `res/xml/file_paths.xml` and the CAMERA permission in `AndroidManifest.xml` — those
 * live in P11's owned files, so camera capture is wired but inert until P11 adds them.
 */
@Composable
fun Composer(
    composerText: String,
    canSend: Boolean,
    isStreaming: Boolean,
    pendingImages: List<Bitmap>,
    onTextChange: (String) -> Unit,
    onAttach: (List<Bitmap>) -> Int,
    onRemoveImage: (Int) -> Unit,
    onSend: () -> Unit,
    onStop: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val oak = LocalOakColors.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var menuExpanded by remember { mutableStateOf(false) }
    var attachNote by remember { mutableStateOf<String?>(null) }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }

    val remaining = ChatViewModel.MAX_ATTACHED_IMAGES - pendingImages.size
    val canAttachMore = remaining > 0 && !isStreaming

    fun stage(bitmaps: List<Bitmap>) {
        if (bitmaps.isEmpty()) return
        val added = onAttach(bitmaps)
        attachNote = if (added < bitmaps.size) {
            "You can attach up to ${ChatViewModel.MAX_ATTACHED_IMAGES} images."
        } else {
            null
        }
    }

    val photoPicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickMultipleVisualMedia(ChatViewModel.MAX_ATTACHED_IMAGES),
    ) { uris ->
        if (uris.isNotEmpty()) {
            scope.launch {
                val bitmaps = withContext(Dispatchers.IO) { uris.mapNotNull { decodeBitmap(context, it) } }
                stage(bitmaps)
            }
        }
    }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()) { success ->
        val uri = pendingCameraUri
        pendingCameraUri = null
        if (success && uri != null) {
            scope.launch {
                val bitmap = withContext(Dispatchers.IO) { decodeBitmap(context, uri) }
                if (bitmap != null) stage(listOf(bitmap))
            }
        }
    }

    fun launchCamera() {
        val file = File.createTempFile("oak_capture_", ".jpg", context.cacheDir)
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
        pendingCameraUri = uri
        cameraLauncher.launch(uri)
    }

    val cameraPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (granted) launchCamera()
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .background(oak.surfaceRaised)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        attachNote?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted, modifier = Modifier.fillMaxWidth())
        }

        if (pendingImages.isNotEmpty()) {
            Row(
                modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            ) {
                pendingImages.forEachIndexed { index, bitmap ->
                    Box(modifier = Modifier.size(56.dp)) {
                        Image(
                            bitmap = bitmap.asImageBitmap(),
                            contentDescription = "Attached image ${index + 1}",
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.size(56.dp).clip(RoundedCornerShape(OakRadius.md)),
                        )
                        Box(
                            modifier = Modifier
                                .align(Alignment.TopEnd)
                                .padding(2.dp)
                                // The visual chip stays 20dp; minimumInteractiveComponentSize
                                // expands only the touch bounds to the 48dp accessibility floor
                                // (D-UI-4), the same pattern Material's own IconButton uses.
                                .minimumInteractiveComponentSize()
                                .size(20.dp)
                                .clip(CircleShape)
                                .background(oak.textStrong.copy(alpha = 0.6f))
                                .clickable { onRemoveImage(index); attachNote = null },
                            contentAlignment = Alignment.Center,
                        ) {
                            Icon(Icons.Filled.Close, contentDescription = "Remove image ${index + 1}", tint = oak.surfaceRaised, modifier = Modifier.size(14.dp))
                        }
                    }
                }
            }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm), verticalAlignment = Alignment.Bottom) {
            Box {
                IconButton(
                    onClick = {
                        // Menu and keyboard are mutually exclusive — opening the attach
                        // menu clears text-field focus so the keyboard hides underneath it.
                        focusManager.clearFocus()
                        menuExpanded = true
                    },
                    enabled = canAttachMore,
                ) {
                    Icon(Icons.Filled.AttachFile, contentDescription = "Attach image", tint = oak.accent)
                }
                DropdownMenu(expanded = menuExpanded, onDismissRequest = { menuExpanded = false }) {
                    DropdownMenuItem(
                        text = { Text("Photo Library") },
                        leadingIcon = { Icon(Icons.Filled.PhotoLibrary, contentDescription = null) },
                        onClick = {
                            menuExpanded = false
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                    )
                    DropdownMenuItem(
                        text = { Text("Take Photo") },
                        leadingIcon = { Icon(Icons.Filled.PhotoCamera, contentDescription = null) },
                        onClick = {
                            menuExpanded = false
                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                launchCamera()
                            } else {
                                cameraPermission.launch(Manifest.permission.CAMERA)
                            }
                        },
                    )
                }
            }

            // The composer field is a surface pill. Focus is AZURE (Oak reserves red for
            // the live/streaming state), so the border + soft glow turn azure while
            // editing and red only while a turn streams; borderStrong is the idle hairline.
            var isFocused by remember { mutableStateOf(false) }
            val fieldAccent = when {
                isStreaming -> oak.accent
                isFocused -> oak.azure
                else -> oak.borderStrong
            }
            val glowActive = isStreaming || isFocused
            OutlinedTextField(
                value = composerText,
                onValueChange = {
                    // Typing implies the user wants the keyboard, not the attach menu.
                    if (menuExpanded) menuExpanded = false
                    onTextChange(it)
                },
                modifier = Modifier
                    .weight(1f)
                    .onFocusChanged {
                        isFocused = it.isFocused
                        if (it.isFocused && menuExpanded) menuExpanded = false
                    }
                    .then(
                        if (glowActive) {
                            Modifier.shadow(
                                elevation = 6.dp,
                                shape = RoundedCornerShape(OakRadius.lg),
                                ambientColor = fieldAccent,
                                spotColor = fieldAccent,
                            )
                        } else {
                            Modifier
                        },
                    ),
                placeholder = { Text("Ask Oak a Pokémon question…") },
                maxLines = 5,
                shape = RoundedCornerShape(OakRadius.lg),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = if (isStreaming) oak.accent else oak.azure,
                    unfocusedBorderColor = if (isStreaming) oak.accent else oak.borderStrong,
                    focusedContainerColor = MaterialTheme.colorScheme.surface,
                    unfocusedContainerColor = MaterialTheme.colorScheme.surface,
                    cursorColor = oak.azure,
                    focusedTextColor = oak.text,
                    unfocusedTextColor = oak.text,
                    focusedPlaceholderColor = oak.textFaint,
                    unfocusedPlaceholderColor = oak.textFaint,
                ),
            )

            SendDisc(
                isStreaming = isStreaming,
                canSend = canSend,
                onSend = onSend,
                onStop = onStop,
            )
        }
    }
}

/**
 * The 44dp coral send disc (theme-translation spec §4.2). Its state choreography IS
 * the microinteraction: *empty* (nothing to send, not streaming) → the disc shrinks to
 * 0.85 and fills `surfaceSunken` with a faint glyph; *ready* → full-size coral with a
 * white arrow; *press* → 0.94 snappy dip; *streaming* → the circle morphs to a rounded
 * stop square. Scale animates on the snappy spring, collapsing to an instant snap under
 * reduce-motion. The touch target stays ≥48dp via [minimumInteractiveComponentSize].
 */
@Composable
private fun SendDisc(
    isStreaming: Boolean,
    canSend: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
) {
    val oak = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val interactionSource = remember { MutableInteractionSource() }
    val pressed by interactionSource.collectIsPressedAsState()

    val enabled = isStreaming || canSend
    val emptyState = !enabled
    val targetScale = when {
        pressed && enabled -> 0.94f
        emptyState -> 0.85f
        else -> 1f
    }
    val scale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = if (reduceMotion) snap() else spring(dampingRatio = 0.6f, stiffness = Spring.StiffnessHigh),
        label = "sendDiscScale",
    )
    val discShape = if (isStreaming) RoundedCornerShape(OakRadius.sm) else CircleShape
    val discFill = if (enabled) oak.accent else oak.surfaceSunken
    val glyphTint = if (enabled) Color.White else oak.textFaint

    Box(
        modifier = Modifier
            .minimumInteractiveComponentSize()
            .size(44.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(discShape)
            .background(discFill)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                enabled = enabled,
                onClickLabel = if (isStreaming) "Stop" else "Send",
                onClick = { if (isStreaming) onStop() else onSend() },
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (isStreaming) Icons.Filled.Stop else Icons.Filled.ArrowUpward,
            contentDescription = if (isStreaming) "Stop" else "Send",
            tint = glyphTint,
        )
    }
}

/** Decodes a picked/captured image [uri] into a [Bitmap], or `null` if it can't be read. */
private fun decodeBitmap(context: android.content.Context, uri: Uri): Bitmap? = try {
    context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it) }
} catch (e: Exception) {
    null
}
