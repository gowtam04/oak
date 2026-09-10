package ai.gowtam.oak.features.chat

import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import ai.gowtam.oak.wire.TeamSummary
import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
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
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
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
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
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
    mentionQuery: String? = null,
    mentionSuggestions: List<TeamSummary> = emptyList(),
    onPickMention: (TeamSummary) -> Unit = {},
    deadMentions: List<String> = emptyList(),
    missingImagesNote: String? = null,
    signedIn: Boolean = false,
    slashNameRows: List<DexNameRow> = emptyList(),
    slashTeamRows: List<TeamSummary> = emptyList(),
    slashArgReady: Boolean = false,
    slashCaption: String = PICKER_CAPTION,
    slashShowSkipMove: Boolean = false,
    onInsertSlashCommand: (String) -> Unit = {},
    onInsertSlashName: (DexNameRow) -> Unit = {},
    onInsertSlashTeam: (TeamSummary) -> Unit = {},
    onInsertSlashSkipMove: () -> Unit = {},
) {
    val oak = LocalOakColors.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val focusManager = LocalFocusManager.current
    var menuExpanded by remember { mutableStateOf(false) }
    var attachNote by remember { mutableStateOf<String?>(null) }
    var pendingCameraUri by remember { mutableStateOf<Uri?>(null) }
    var slashDismissed by remember { mutableStateOf(false) }

    val slashPhase = slashPickerPhase(composerText)
    val slashTokenKey = when (slashPhase) {
        is SlashPickerPhase.Commands -> slashPhase.prefix
        is SlashPickerPhase.Args -> slashPhase.command
        is SlashPickerPhase.Rest -> slashPhase.command
        SlashPickerPhase.Hidden -> ""
    }
    LaunchedEffect(slashTokenKey) { slashDismissed = false }
    val slashVisible = !slashDismissed && when (slashPhase) {
        is SlashPickerPhase.Commands, is SlashPickerPhase.Args -> true
        SlashPickerPhase.Hidden, is SlashPickerPhase.Rest -> false
    }
    val slashEmpty = when (val phase = slashPhase) {
        is SlashPickerPhase.Args -> when (phase.command) {
            "dex" -> if (slashArgReady && slashNameRows.isEmpty()) EMPTY_DEX else null
            "usage" -> if (slashArgReady && slashNameRows.isEmpty()) EMPTY_USAGE else null
            "calc" -> if (slashArgReady && slashNameRows.isEmpty() && !slashShowSkipMove) {
                if (slashCaption == CALC_CAPTION_MOVE) EMPTY_CALC_MOVE else EMPTY_CALC_SPECIES
            } else null
            "team" -> when {
                !signedIn -> EMPTY_TEAMS_GUEST
                slashTeamRows.isEmpty() -> EMPTY_TEAMS
                else -> null
            }
            else -> null
        }
        else -> null
    }
    BackHandler(enabled = slashVisible) { slashDismissed = true }

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
            .background(MaterialTheme.colorScheme.background)
            .padding(horizontal = OakSpacing.md, vertical = OakSpacing.sm),
        verticalArrangement = Arrangement.spacedBy(OakSpacing.sm),
    ) {
        attachNote?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted, modifier = Modifier.fillMaxWidth())
        }
        missingImagesNote?.let {
            Text(text = it, style = MaterialTheme.typography.bodySmall, color = oak.textMuted, modifier = Modifier.fillMaxWidth())
        }
        if (deadMentions.isNotEmpty()) {
            Text(
                text = "Unknown @mention: ${deadMentions.joinToString(", ")}. Fix or remove it to send.",
                style = MaterialTheme.typography.bodySmall,
                color = oak.danger,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        if (slashVisible) {
            SlashAutocomplete(
                commands = (slashPhase as? SlashPickerPhase.Commands)?.rows.orEmpty(),
                names = if (slashPhase is SlashPickerPhase.Args && slashPhase.command != "team") {
                    slashNameRows
                } else {
                    emptyList()
                },
                teams = if (slashPhase is SlashPickerPhase.Args && slashPhase.command == "team") {
                    slashTeamRows
                } else {
                    emptyList()
                },
                empty = slashEmpty,
                guest = !signedIn,
                caption = slashCaption,
                skipMove = slashShowSkipMove,
                onPickCommand = onInsertSlashCommand,
                onPickName = onInsertSlashName,
                onPickTeam = onInsertSlashTeam,
                onSkipMove = onInsertSlashSkipMove,
            )
        } else {
            MentionAutocomplete(
                suggestions = mentionSuggestions,
                query = mentionQuery,
                onPick = onPickMention,
            )
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

        var isFocused by remember { mutableStateOf(false) }
        val dark = oak.isDark
        val pillShape = RoundedCornerShape(OakRadius.pill)
        val outlineActive = isStreaming || isFocused
        val pillBorder = if (outlineActive) oak.accent else oak.borderStrong
        val halo = oak.accent.copy(alpha = 0.18f)
        val paper = MaterialTheme.colorScheme.surface
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .drawBehind {
                    if (!isFocused) return@drawBehind
                    val stroke = 4.dp.toPx()
                    val radius = size.minDimension / 2f + stroke / 2f
                    drawRoundRect(
                        color = halo,
                        topLeft = Offset(-stroke / 2f, -stroke / 2f),
                        size = Size(size.width + stroke, size.height + stroke),
                        cornerRadius = CornerRadius(radius),
                        style = Stroke(width = stroke),
                    )
                }
                .then(if (dark) Modifier else Modifier.shadow(6.dp, pillShape))
                .background(paper, pillShape)
                .border(1.dp, pillBorder, pillShape)
                .padding(start = OakSpacing.xs, end = 6.dp, top = 6.dp, bottom = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
            verticalAlignment = Alignment.Bottom,
        ) {
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
                    Icon(
                        Icons.Filled.AttachFile,
                        contentDescription = "Attach image",
                        tint = if (canAttachMore) oak.textMuted else oak.textFaint,
                    )
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

            BasicTextField(
                value = composerText,
                onValueChange = {
                    if (menuExpanded) menuExpanded = false
                    onTextChange(it)
                },
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = 40.dp)
                    .padding(vertical = OakSpacing.sm, horizontal = OakSpacing.xs)
                    .onFocusChanged {
                        isFocused = it.isFocused
                        if (it.isFocused && menuExpanded) menuExpanded = false
                    },
                textStyle = MaterialTheme.typography.bodyLarge.copy(color = oak.text),
                cursorBrush = SolidColor(oak.accent),
                maxLines = 5,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Default),
                decorationBox = { inner ->
                    Box(contentAlignment = Alignment.CenterStart) {
                        if (composerText.isEmpty()) {
                            Text(
                                text = "Ask Oak",
                                style = MaterialTheme.typography.bodyLarge,
                                color = oak.textFaint,
                            )
                        }
                        inner()
                    }
                },
            )

            SendButton(
                isStreaming = isStreaming,
                canSend = canSend,
                onSend = onSend,
                onStop = onStop,
            )
        }
    }
}

/**
 * Enamel Send — a 44.dp circle. Ready = poke-red fill + `--on-red` glyph, spring
 * pop to 1.06 on press. Disabled = sunken fill, faint glyph, scale 0.85. Streaming
 * swaps the arrow for a red Stop square on the same 44.dp sunken circle. Touch
 * target stays ≥48.dp via [minimumInteractiveComponentSize].
 */
@Composable
private fun SendButton(
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
    val targetScale = when {
        isStreaming -> if (pressed) 0.98f else 1f
        canSend -> if (pressed) 1.06f else 1f
        else -> 0.85f
    }
    val scale by animateFloatAsState(
        targetValue = targetScale,
        animationSpec = if (reduceMotion) {
            snap()
        } else if (canSend && !isStreaming) {
            OakMotion.spring
        } else {
            OakMotion.snappy
        },
        label = "sendButtonScale",
    )
    val fill = when {
        isStreaming -> oak.surfaceSunken
        canSend -> oak.accent
        else -> oak.surfaceSunken
    }
    val glyphTint = when {
        isStreaming -> oak.accent
        canSend -> oak.onRed
        else -> oak.textFaint
    }

    Box(
        modifier = Modifier
            .minimumInteractiveComponentSize()
            .size(44.dp)
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(CircleShape)
            .background(fill)
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
