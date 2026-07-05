package ai.gowtam.oak.features.auth

import ai.gowtam.oak.ui.FredokaFamily
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakButton
import ai.gowtam.oak.ui.OakMotion
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import ai.gowtam.oak.ui.rememberReduceMotion
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.BasicAlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The email-OTP sign-in screen (accounts-and-access.md D-ACCT-1 / M-ACCT-US-2).
 * Two steps in one composable: collect the email, then the 6-digit code. Mirrors
 * iOS `AuthView` in structure (custom digit boxes over a hidden real field, an
 * error shake, a resend countdown, a drawn-style success state) re-expressed for
 * Compose/Material 3.
 *
 * **D-AC-ACCT1.3 (paste, no autofill):** the six visual boxes are a display layer
 * over ONE near-invisible `BasicTextField`, which is what actually receives
 * input — so both typing and a long-press paste of a copied 6-digit code work
 * identically and land in [AuthViewModel.onCodeChange]. There is no SMS-autofill
 * hook (codes are emailed, not texted).
 *
 * All motion (shake, success scale-in) is gated on [rememberReduceMotion] so a
 * user with animations disabled sees instant state changes instead.
 */
@Composable
fun AuthScreen(viewModel: AuthViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsState()
    val reduceMotion = rememberReduceMotion()
    val scope = rememberCoroutineScope()
    val colors = LocalOakColors.current

    // Auto-submit once six digits are present — covers both a manual 6th
    // keystroke and a one-shot paste.
    LaunchedEffect(state.code, state.step) {
        if (state.step == AuthViewModel.Step.CODE && state.code.length == 6 && !state.isBusy) {
            viewModel.submitCode()
        }
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .padding(horizontal = OakSpacing.xl, vertical = OakSpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Sign in to Oak",
            style = MaterialTheme.typography.headlineMedium.copy(fontFamily = FredokaFamily),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.semantics { heading() },
        )
        Spacer(Modifier.height(OakSpacing.sm))
        Text(
            text = "Save your conversations and teams",
            style = MaterialTheme.typography.bodyMedium,
            color = colors.textMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(OakSpacing.xl))

        if (state.signedInEmail != null) {
            SuccessBlock(email = state.signedInEmail!!, reduceMotion = reduceMotion)
        } else when (state.step) {
            AuthViewModel.Step.EMAIL -> EmailStep(
                state = state,
                onEmailChange = viewModel::onEmailChange,
                onSubmit = { scope.launch { viewModel.submitEmail() } },
            )
            AuthViewModel.Step.CODE -> CodeStep(
                viewModel = viewModel,
                state = state,
                reduceMotion = reduceMotion,
                onVerify = { scope.launch { viewModel.submitCode() } },
                onResend = { scope.launch { viewModel.resendCode() } },
                onEditEmail = viewModel::editEmail,
            )
        }
    }
}

@Composable
private fun EmailStep(
    state: AuthViewModel.UiState,
    onEmailChange: (String) -> Unit,
    onSubmit: () -> Unit,
) {
    val keyboardController = LocalSoftwareKeyboardController.current
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }

    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        OutlinedTextField(
            value = state.email,
            onValueChange = onEmailChange,
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(focusRequester),
            placeholder = { Text("you@example.com") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(
                keyboardType = KeyboardType.Email,
                capitalization = KeyboardCapitalization.None,
                imeAction = ImeAction.Send,
            ),
            keyboardActions = KeyboardActions(onSend = {
                keyboardController?.hide()
                onSubmit()
            }),
            shape = RoundedCornerShape(OakRadius.lg),
        )
        Spacer(Modifier.height(OakSpacing.sm))
        Text(
            text = "We'll email you a 6-digit code. No password needed.",
            style = MaterialTheme.typography.bodySmall,
            color = LocalOakColors.current.textMuted,
            modifier = Modifier.fillMaxWidth(),
        )
        Spacer(Modifier.height(OakSpacing.md))
        MessageBlock(errorMessage = state.errorMessage, noticeMessage = state.noticeMessage)
        Spacer(Modifier.height(OakSpacing.md))
        val canSubmit = AuthViewModel.looksLikeEmail(state.email.trim().lowercase()) && !state.isBusy
        PrimaryButton(title = "Send code", enabled = canSubmit, isBusy = state.isBusy, onClick = onSubmit)
    }
}

@Composable
private fun CodeStep(
    viewModel: AuthViewModel,
    state: AuthViewModel.UiState,
    reduceMotion: Boolean,
    onVerify: () -> Unit,
    onResend: () -> Unit,
    onEditEmail: () -> Unit,
) {
    // Polls the injected clock once a second so the resend countdown ticks —
    // the Compose analogue of iOS's periodic TimelineView.
    var tick by remember { mutableStateOf(0) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(1000)
            tick++
        }
    }
    val secondsRemaining = remember(tick, state.code) { viewModel.resendSecondsRemaining }
    val canResend = remember(tick, state.isBusy) { viewModel.canResend }

    Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
        Text(
            text = "Enter the 6-digit code we sent to ${viewModel.normalizedEmail}.",
            style = MaterialTheme.typography.bodyMedium,
            color = LocalOakColors.current.textMuted,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(OakSpacing.lg))
        CodeBoxes(
            code = state.code,
            onCodeChange = viewModel::onCodeChange,
            errorMessage = state.errorMessage,
            reduceMotion = reduceMotion,
        )
        Spacer(Modifier.height(OakSpacing.md))
        MessageBlock(errorMessage = state.errorMessage, noticeMessage = state.noticeMessage)
        Spacer(Modifier.height(OakSpacing.md))
        PrimaryButton(
            title = "Verify",
            enabled = state.code.length == 6 && !state.isBusy,
            isBusy = state.isBusy,
            onClick = onVerify,
        )
        Spacer(Modifier.height(OakSpacing.lg))
        if (canResend) {
            TextButton(onClick = onResend) { Text("Resend code") }
        } else {
            Text(
                text = "Resend available in ${secondsRemaining}s",
                style = MaterialTheme.typography.bodyMedium,
                color = LocalOakColors.current.textMuted,
            )
        }
        TextButton(onClick = onEditEmail) {
            Text("Use a different email", color = LocalOakColors.current.textMuted)
        }
    }
}

/**
 * Six digit cells rendered over ONE near-invisible [BasicTextField] — the real
 * input, kept focusable so system paste (long-press → Paste) and the number pad
 * keep working. Reads as one accessible element (a single content description),
 * mirroring iOS's combined VoiceOver element for the code entry.
 */
@Composable
private fun CodeBoxes(
    code: String,
    onCodeChange: (String) -> Unit,
    errorMessage: String?,
    reduceMotion: Boolean,
) {
    val focusRequester = remember { FocusRequester() }
    val shakeOffset = remember { Animatable(0f) }
    LaunchedEffect(Unit) { focusRequester.requestFocus() }
    LaunchedEffect(errorMessage) {
        if (errorMessage != null && !reduceMotion) {
            shakeOffset.snapTo(0f)
            shakeOffset.animateTo(
                targetValue = 0f,
                animationSpec = keyframes {
                    durationMillis = 360
                    -8f at 60
                    8f at 150
                    -8f at 240
                    8f at 330
                },
            )
        }
    }

    Box(
        modifier = Modifier
            .offset(x = shakeOffset.value.dp)
            .semantics {
                contentDescription = "Enter 6 digit code, ${code.length} of 6 entered"
            },
        contentAlignment = Alignment.Center,
    ) {
        // The real input: 1x1 and near-transparent so no visible caret shows;
        // the boxes below render the state. Not hidden from the accessibility
        // tree via a flag (Compose has no direct analogue), but its label is
        // folded into the Box's semantics above so it isn't announced twice.
        androidx.compose.foundation.text.BasicTextField(
            value = code,
            onValueChange = onCodeChange,
            modifier = Modifier
                .size(1.dp)
                .focusRequester(focusRequester)
                .graphicsLayer(alpha = 0.01f),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
        )

        Row(
            horizontalArrangement = Arrangement.spacedBy(OakSpacing.sm),
            modifier = Modifier.clickable(indication = null, interactionSource = remember { androidx.compose.foundation.interaction.MutableInteractionSource() }) {
                focusRequester.requestFocus()
            },
        ) {
            for (index in 0 until 6) {
                DigitBox(digit = code.getOrNull(index), isActive = index == code.length)
            }
        }
    }
}

@Composable
private fun DigitBox(digit: Char?, isActive: Boolean) {
    val colors = LocalOakColors.current
    val reduceMotion = rememberReduceMotion()
    val filled = digit != null
    // Azure focus ring on the box awaiting input (Oak reserves red for the live state);
    // a filled box firms its hairline and pops in on the snappy spring.
    val borderColor = when {
        isActive -> colors.azure
        filled -> colors.borderStrong
        else -> colors.border
    }
    val shape = RoundedCornerShape(OakRadius.md)
    val pop = remember { Animatable(1f) }
    LaunchedEffect(filled) {
        if (filled && !reduceMotion) {
            pop.snapTo(0.85f)
            pop.animateTo(1f, OakMotion.snappy)
        }
    }
    Box(
        modifier = Modifier
            .size(width = 44.dp, height = 56.dp)
            .graphicsLayer { scaleX = pop.value; scaleY = pop.value }
            .background(colors.surfaceSunken, shape)
            .border(if (isActive) 2.dp else 1.dp, borderColor, shape),
        contentAlignment = Alignment.Center,
    ) {
        if (digit != null) {
            Text(text = digit.toString(), style = MaterialTheme.typography.headlineSmall, color = colors.textStrong)
        }
    }
}

@Composable
private fun SuccessBlock(email: String, reduceMotion: Boolean) {
    val colors = LocalOakColors.current
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { visible = true }
    val scale = remember { Animatable(if (reduceMotion) 1f else 0f) }
    LaunchedEffect(visible) {
        if (visible) {
            scale.animateTo(1f, animationSpec = if (reduceMotion) snap() else tween(450))
        }
    }
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(
            imageVector = Icons.Filled.CheckCircle,
            contentDescription = null,
            tint = colors.success,
            modifier = Modifier
                .size(72.dp)
                .graphicsLayer(scaleX = scale.value, scaleY = scale.value),
        )
        Spacer(Modifier.height(OakSpacing.md))
        Text(text = "Signed in", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
        Text(text = email, style = MaterialTheme.typography.bodyMedium, color = colors.textMuted)
    }
}

@Composable
private fun PrimaryButton(title: String, enabled: Boolean, isBusy: Boolean, onClick: () -> Unit) {
    OakButton(
        onClick = onClick,
        enabled = enabled || isBusy,
        modifier = Modifier.fillMaxWidth(),
    ) {
        Box(contentAlignment = Alignment.Center) {
            Text(text = title, modifier = Modifier.graphicsLayer(alpha = if (isBusy) 0f else 1f))
            if (isBusy) {
                CircularProgressIndicator(modifier = Modifier.size(20.dp), color = Color.White, strokeWidth = 2.dp)
            }
        }
    }
}

@Composable
private fun MessageBlock(errorMessage: String?, noticeMessage: String?) {
    val colors = LocalOakColors.current
    if (errorMessage != null) {
        Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs)) {
            Icon(Icons.Filled.Warning, contentDescription = null, tint = colors.danger, modifier = Modifier.size(16.dp))
            Text(text = errorMessage, style = MaterialTheme.typography.bodySmall, color = colors.danger)
        }
    }
    if (noticeMessage != null) {
        Text(text = noticeMessage, style = MaterialTheme.typography.bodySmall, color = colors.textMuted)
    }
}

/**
 * A minimal Material bottom-sheet-style modal wrapper around [AuthScreen], for
 * callers (the Account screen) that want to present sign-in over the current
 * surface. Auto-dismisses via [onDismissRequest] once [AuthViewModel.state]
 * reports [AuthViewModel.UiState.signedInEmail].
 */
@OptIn(androidx.compose.material3.ExperimentalMaterial3Api::class)
@Composable
fun AuthDialog(viewModel: AuthViewModel, onDismissRequest: () -> Unit) {
    val state by viewModel.state.collectAsState()
    LaunchedEffect(state.signedInEmail) {
        if (state.signedInEmail != null) {
            delay(600)
            onDismissRequest()
        }
    }
    BasicAlertDialog(onDismissRequest = onDismissRequest) {
        Box(
            modifier = Modifier
                .background(MaterialTheme.colorScheme.surface, RoundedCornerShape(OakRadius.lg))
                .padding(OakSpacing.lg),
        ) {
            AuthScreen(viewModel = viewModel)
        }
    }
}
