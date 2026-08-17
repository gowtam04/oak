package ai.gowtam.oak.features.account

import ai.gowtam.oak.BuildConfig
import ai.gowtam.oak.features.auth.AuthDialog
import ai.gowtam.oak.features.auth.AuthViewModel
import ai.gowtam.oak.services.AuthState
import ai.gowtam.oak.ui.LocalOakColors
import ai.gowtam.oak.ui.OakRadius
import ai.gowtam.oak.ui.OakSpacing
import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountCircle
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import ai.gowtam.oak.ui.OakTopBar
import ai.gowtam.oak.ui.OakWordmark
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.launch

/**
 * The Account screen (accounts-and-access.md D-ACCT-1/D-ACCT-2; M-UI-US-7
 * equivalent): sign in/out, the current tier & what it unlocks, the **account-
 * deletion** flow, and about/legal links. Mirrors iOS `AccountView` in
 * structure, re-expressed for Compose/Material 3.
 *
 * Hosted as a first-class tab root (Chat / Teams / Dex / Account). [onBack]
 * renders a back affordance only when this screen is pushed; pass `null` as the
 * tab root.
 *
 * **Deletion confirmation (D-AC-ACCT2.2 — "requires explicit confirmation"):**
 * a destructive button opens an [AlertDialog] naming exactly what is deleted
 * (account, history, teams) with Cancel/Delete buttons — the same mechanic as
 * iOS `AccountView` (a plain confirmation alert, not a typed-text challenge;
 * verified against `ios/OakApp/Features/Account/AccountView.swift`, which has
 * no typed-DELETE input either). D-AC-ACCT2.4 is satisfied because the whole
 * flow, including the backend `DELETE /api/auth/account` call, stays in-app —
 * no external site or support contact is required.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountScreen(
    viewModel: AccountViewModel,
    modifier: Modifier = Modifier,
    /** When non-null, the top bar shows a back arrow calling this. `null` for the
     * tab-root presentation. */
    onBack: (() -> Unit)? = null,
) {
    val authState by viewModel.authState.collectAsState()
    val actionState by viewModel.actionState.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val colors = LocalOakColors.current

    var showingSignIn by rememberSaveable { mutableStateOf(false) }
    var showingDeleteConfirm by rememberSaveable { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    // Dismiss the sign-in dialog automatically once verification flips the app
    // to signed-in (AuthScreen itself is presenter-agnostic).
    LaunchedEffect(authState) {
        if (authState is AuthState.SignedIn) showingSignIn = false
    }

    // One-shot farewell snackbar after a successful (or 401-equivalent) deletion.
    LaunchedEffect(actionState.deletionCompleted) {
        if (actionState.deletionCompleted) {
            snackbarHostState.showSnackbar("Your account was deleted. You're browsing as a guest.")
            viewModel.consumeDeletionCompleted()
        }
    }

    Scaffold(
        modifier = modifier,
        topBar = {
            OakTopBar(
                title = { OakWordmark() },
                navigationIcon = {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                },
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(innerPadding)
                .padding(OakSpacing.lg),
        ) {
            ProfileHeader(isSignedIn = authState is AuthState.SignedIn, email = viewModel.email, tierTitle = viewModel.tierTitle)
            Spacer(Modifier.height(OakSpacing.lg))

            SectionCard {
                if (authState is AuthState.SignedIn) {
                    ActionRow(
                        icon = Icons.AutoMirrored.Filled.ExitToApp,
                        title = "Sign out",
                        enabled = !actionState.isBusy,
                        onClick = { scope.launch { viewModel.signOut() } },
                    )
                } else {
                    ActionRow(
                        icon = Icons.Filled.AccountCircle,
                        title = "Sign in",
                        enabled = true,
                        onClick = { showingSignIn = true },
                    )
                }
            }
            Text(
                text = viewModel.tierDescription,
                style = MaterialTheme.typography.bodySmall,
                color = colors.textMuted,
                modifier = Modifier.padding(top = OakSpacing.sm, start = OakSpacing.xs, end = OakSpacing.xs),
            )

            if (actionState.errorMessage != null) {
                Spacer(Modifier.height(OakSpacing.md))
                ErrorRow(message = actionState.errorMessage!!, onDismiss = viewModel::dismissError)
            }

            if (authState is AuthState.SignedIn) {
                Spacer(Modifier.height(OakSpacing.lg))
                SectionCard(danger = true) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(OakSpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Delete, contentDescription = null, tint = colors.danger)
                        Spacer(Modifier.width(OakSpacing.sm))
                        Text(
                            text = "Delete account",
                            color = colors.danger,
                            modifier = Modifier.weight(1f),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        if (actionState.isBusy) {
                            CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = colors.danger)
                        } else {
                            TextButton(enabled = !actionState.isBusy, onClick = { showingDeleteConfirm = true }) {
                                Text("Delete", color = colors.danger)
                            }
                        }
                    }
                }
                Text(
                    text = "Permanently removes your account and all of its data from Oak.",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.textMuted,
                    modifier = Modifier.padding(top = OakSpacing.sm, start = OakSpacing.xs, end = OakSpacing.xs),
                )
            }

            Spacer(Modifier.height(OakSpacing.xl))
            Text(text = "About", style = MaterialTheme.typography.titleSmall, color = colors.textMuted)
            Spacer(Modifier.height(OakSpacing.sm))
            SectionCard {
                Column {
                    LinkRow(title = "Privacy Policy") { openUrl(context, PRIVACY_URL) }
                    HorizontalDivider(color = colors.border)
                    LinkRow(title = "Support") { openUrl(context, SUPPORT_URL) }
                    HorizontalDivider(color = colors.border)
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(OakSpacing.md),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(Icons.Filled.Info, contentDescription = null, tint = colors.textMuted)
                        Spacer(Modifier.width(OakSpacing.sm))
                        Text("Version", modifier = Modifier.weight(1f))
                        Text(versionString(), color = colors.textMuted, style = MaterialTheme.typography.bodySmall)
                    }
                }
            }
        }
    }

    if (showingSignIn) {
        AuthDialog(viewModel = viewModel.makeAuthViewModel(), onDismissRequest = { showingSignIn = false })
    }

    if (showingDeleteConfirm) {
        AlertDialog(
            onDismissRequest = { showingDeleteConfirm = false },
            title = { Text("Delete account?") },
            text = { Text(AccountViewModel.DELETION_WARNING) },
            confirmButton = {
                TextButton(onClick = {
                    showingDeleteConfirm = false
                    scope.launch { viewModel.deleteAccount() }
                }) {
                    Text("Delete account", color = MaterialTheme.colorScheme.error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showingDeleteConfirm = false }) { Text("Cancel", color = colors.textMuted) }
            },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(OakRadius.lg),
            titleContentColor = colors.textStrong,
            textContentColor = colors.text,
        )
    }
}

@Composable
private fun ProfileHeader(isSignedIn: Boolean, email: String?, tierTitle: String) {
    val colors = LocalOakColors.current
    Row(verticalAlignment = Alignment.CenterVertically) {
        Box(
            modifier = Modifier
                .size(56.dp)
                .background(colors.accentSoft, CircleShape),
            contentAlignment = Alignment.Center,
        ) {
            if (isSignedIn && !email.isNullOrBlank()) {
                Text(email.first().uppercase(), color = colors.accent, style = MaterialTheme.typography.titleLarge)
            } else {
                Icon(Icons.Filled.AccountCircle, contentDescription = null, tint = colors.accent)
            }
        }
        Spacer(Modifier.width(OakSpacing.md))
        Column {
            Text(tierTitle, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
            Text(
                text = email ?: "Sign in to save your history and teams",
                style = MaterialTheme.typography.bodyMedium,
                color = colors.textMuted,
            )
        }
    }
}

@Composable
private fun SectionCard(danger: Boolean = false, content: @Composable () -> Unit) {
    val oak = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.lg)
    val fill = if (danger) oak.dangerSoft else oak.surfaceRaised
    val stroke = if (danger) oak.danger.copy(alpha = 0.35f) else oak.border
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .background(fill, shape)
            .border(1.dp, stroke, shape),
    ) {
        content()
    }
}

@Composable
private fun ActionRow(icon: androidx.compose.ui.graphics.vector.ImageVector, title: String, enabled: Boolean, onClick: () -> Unit) {
    val colors = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = enabled, onClick = onClick)
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(icon, contentDescription = null, tint = colors.accent)
        Spacer(Modifier.width(OakSpacing.sm))
        Text(title, modifier = Modifier.weight(1f), style = MaterialTheme.typography.bodyLarge)
        Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = colors.textMuted)
    }
}

@Composable
private fun LinkRow(title: String, onClick: () -> Unit) {
    val colors = LocalOakColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, modifier = Modifier.weight(1f))
        TextButton(onClick = onClick) {
            Text("Open")
            Icon(Icons.Filled.ChevronRight, contentDescription = null, tint = colors.textMuted)
        }
    }
}

@Composable
private fun ErrorRow(message: String, onDismiss: () -> Unit) {
    val colors = LocalOakColors.current
    val shape = RoundedCornerShape(OakRadius.md)
    val dangerColor = colors.danger
    // The web callout recipe: a dangerSoft strip led by a 3dp danger rail (color is
    // paired with the warning icon + text, never the sole signal).
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.dangerSoft)
            .drawBehind {
                drawRect(color = dangerColor, size = size.copy(width = 3.dp.toPx()))
            }
            .padding(OakSpacing.md),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(OakSpacing.xs),
    ) {
        Icon(Icons.Filled.Warning, contentDescription = null, tint = colors.danger)
        Text(message, modifier = Modifier.weight(1f), color = colors.textStrong, style = MaterialTheme.typography.bodySmall)
        TextButton(onClick = onDismiss) { Text("Dismiss", color = colors.danger) }
    }
}

private fun openUrl(context: android.content.Context, url: String) {
    context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
}

private fun versionString(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

// Legal/support links + backend account-deletion endpoint reuse (D-AC-ACCT2.3 —
// no new backend work; the iPhone app added the same DELETE route).
private const val PRIVACY_URL = "https://oak.gowtam.ai/privacy"
private const val SUPPORT_URL = "https://www.gowtam.ai/#contact"
