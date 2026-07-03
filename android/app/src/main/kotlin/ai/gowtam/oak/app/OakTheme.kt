package ai.gowtam.oak.app

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable

private val OakLightColorScheme = lightColorScheme()
private val OakDarkColorScheme = darkColorScheme()

@Composable
fun OakTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    val colorScheme = if (darkTheme) OakDarkColorScheme else OakLightColorScheme
    MaterialTheme(
        colorScheme = colorScheme,
        content = content,
    )
}
