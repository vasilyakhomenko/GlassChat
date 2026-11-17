package app.vellum.client

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

data class Ink(
    val frost: Boolean,
    val bg: Color,
    val fg: Color,
    val muted: Color,
    val faint: Color,
    val line: Color,
    val glass: Color,
    val glassStrong: Color,
    val invert: Color,
    val invertFg: Color,
    val wash: Color,
    val code: Color,
)

fun inkOf(theme: String): Ink = if (theme == "frost") {
    Ink(
        frost = true,
        bg = Color(0xFFE4E2DC),
        fg = Color(0xFF141416),
        muted = Color(0xFF52525B),
        faint = Color(0xFF71717A),
        line = Color(0x1F141416),
        glass = Color(0x6BFFFFFF),
        glassStrong = Color(0xB8FFFFFF),
        invert = Color(0xFF161618),
        invertFg = Color(0xFFF6F6F4),
        wash = Color(0x73FFFFFF),
        code = Color(0x8CFFFFFF),
    )
} else {
    Ink(
        frost = false,
        bg = Color(0xFF09090B),
        fg = Color(0xFFF4F4F5),
        muted = Color(0xFFA1A1AA),
        faint = Color(0xFF71717A),
        line = Color(0x24FFFFFF),
        glass = Color(0x10FFFFFF),
        glassStrong = Color(0x1FFFFFFF),
        invert = Color(0xFFF4F4F5),
        invertFg = Color(0xFF111113),
        wash = Color(0x12FFFFFF),
        code = Color(0x59000000),
    )
}

fun Modifier.glass(ink: Ink, radius: Dp = 22.dp): Modifier {
    val shape = RoundedCornerShape(radius)
    return clip(shape).background(ink.glass).border(1.dp, ink.line, shape)
}
