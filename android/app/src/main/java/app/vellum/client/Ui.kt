package app.vellum.client

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Archive
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material.icons.filled.PushPin
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.Tune
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.view.WindowCompat
import androidx.lifecycle.viewmodel.compose.viewModel
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun VellumRoot(model: VellumModel = viewModel()) {
    val ink = inkOf(model.data.theme)
    val scheme = if (ink.frost) {
        lightColorScheme(primary = ink.invert, onPrimary = ink.invertFg, background = ink.bg, surface = ink.bg, onBackground = ink.fg, onSurface = ink.fg)
    } else {
        darkColorScheme(primary = ink.invert, onPrimary = ink.invertFg, background = ink.bg, surface = ink.bg, onBackground = ink.fg, onSurface = ink.fg)
    }
    val view = LocalView.current
    androidx.compose.runtime.SideEffect {
        val window = (view.context as Activity).window
        WindowCompat.getInsetsController(window, view).apply {
            isAppearanceLightStatusBars = ink.frost
            isAppearanceLightNavigationBars = ink.frost
        }
    }
    MaterialTheme(colorScheme = scheme) {
        CompositionLocalProvider(androidx.compose.material3.LocalContentColor provides ink.fg) {
            Box(Modifier.fillMaxSize().background(ink.bg)) {
                Wash(ink)
                Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().imePadding()) {
                    TopBar(model, ink)
                    Box(Modifier.weight(1f).fillMaxWidth()) { Transcript(model, ink) }
                    Composer(model, ink)
                }
                if (model.drawer) Drawer(model, ink)
                if (model.panel != null) VellumSheets(model, ink)
                model.notice?.let { note ->
                    Text(
                        note,
                        modifier = Modifier.align(Alignment.TopCenter).statusBarsPadding().padding(top = 64.dp).glass(ink, 999.dp).padding(horizontal = 14.dp, vertical = 8.dp),
                        color = ink.fg,
                        fontSize = 13.sp,
                    )
                }
            }
        }
    }
    BackHandler(enabled = model.panel != null || model.drawer) {
        when {
            model.panel != null -> model.panel = null
            else -> model.drawer = false
        }
    }
}

@Composable
private fun Wash(ink: Ink) {
    Canvas(Modifier.fillMaxSize()) {
        drawCircle(ink.wash, size.minDimension * 0.62f, Offset(size.width * 0.08f, -size.height * 0.04f))
        drawCircle(ink.wash, size.minDimension * 0.48f, Offset(size.width * 1.02f, size.height * 0.08f))
        drawCircle(ink.wash, size.minDimension * 0.4f, Offset(size.width * 0.7f, size.height * 1.05f))
    }
}

@Composable
private fun Mark(tint: Color, modifier: Modifier = Modifier) {
    Canvas(modifier) {
        val path = Path().apply {
            moveTo(size.width * 0.18f, size.height * 0.18f)
            lineTo(size.width * 0.34f, size.height * 0.18f)
            lineTo(size.width * 0.5f, size.height * 0.66f)
            lineTo(size.width * 0.66f, size.height * 0.18f)
            lineTo(size.width * 0.82f, size.height * 0.18f)
            lineTo(size.width * 0.56f, size.height * 0.84f)
            lineTo(size.width * 0.44f, size.height * 0.84f)
            close()
        }
        drawPath(path, tint)
    }
}

@Composable
private fun TopBar(model: VellumModel, ink: Ink) {
    val chat = model.activeChat()
    val modelName = chat?.model?.ifBlank { model.data.defaultModel }.orEmpty().ifBlank { "модель не выбрана" }
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        IconButton(onClick = { model.drawer = true }) { Icon(Icons.Filled.Menu, "Чаты") }
        Column(Modifier.weight(1f).padding(horizontal = 4.dp)) {
            Text(chat?.title ?: "Vellum", fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis, fontSize = 16.sp)
            Text(
                modelName,
                color = ink.muted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.clickable { model.panel = "model" },
            )
        }
        IconButton(onClick = { model.panel = "params" }) { Icon(Icons.Filled.Tune, "Параметры") }
        IconButton(onClick = { model.panel = "settings" }) { Icon(Icons.Filled.Settings, "Настройки") }
    }
}

@Composable
private fun Transcript(model: VellumModel, ink: Ink) {
    val chat = model.activeChat()
    val messages = chat?.messages.orEmpty()
    if (chat == null || messages.isEmpty()) {
        Empty(model, ink, chat != null)
        return
    }
    val list = rememberLazyListState()
    val tail = messages.lastOrNull()
    val tailText = tail?.variants?.getOrNull(tail.variant)?.content?.length ?: 0
    LaunchedEffect(chat.id) {
        if (messages.isNotEmpty()) list.scrollToItem(messages.lastIndex)
    }
    LaunchedEffect(messages.size, tailText) {
        val lastVisible = list.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
        if (messages.isNotEmpty() && lastVisible >= messages.size - 2) list.scrollToItem(messages.lastIndex)
    }
    LazyColumn(
        state = list,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 8.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        items(messages, key = { it.id }) { message -> Bubble(model, ink, message) }
    }
}

@Composable
private fun Empty(model: VellumModel, ink: Ink, hasChat: Boolean) {
    Column(
        Modifier.fillMaxSize().padding(horizontal = 28.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Mark(ink.fg, Modifier.size(42.dp))
        Spacer(Modifier.height(14.dp))
        Text("Vellum", fontSize = 32.sp, fontWeight = FontWeight.SemiBold, letterSpacing = (-0.6).sp)
        Spacer(Modifier.height(8.dp))
        Text(
            "Монохромный клиент для OpenAI-совместимых моделей. Ключ остаётся на устройстве.",
            color = ink.muted,
            fontSize = 15.sp,
            lineHeight = 21.sp,
        )
        Spacer(Modifier.height(22.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Pill(if (hasChat) "Сменить модель" else "Подключить", ink, on = true) {
                model.panel = if (model.data.providers.isEmpty()) "settings" else "model"
            }
            if (!hasChat) Pill("Новый чат", ink, on = false) { model.createChat() }
        }
        if (hasChat && model.data.prompts.isNotEmpty()) {
            Spacer(Modifier.height(18.dp))
            Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                model.data.prompts.take(6).forEach { prompt ->
                    Pill(prompt.title, ink, on = false) { model.insertPrompt(prompt.body) }
                }
            }
        }
    }
}

@Composable
private fun Bubble(model: VellumModel, ink: Ink, message: Msg) {
    val context = LocalContext.current
    val mine = message.role == "user"
    var editing by remember(message.id) { mutableStateOf(false) }
    var editText by remember(message.id) { mutableStateOf(message.content) }
    Column(Modifier.fillMaxWidth(), horizontalAlignment = if (mine) Alignment.End else Alignment.Start) {
        if (mine && editing) {
            Column(Modifier.fillMaxWidth(0.92f).glass(ink, 18.dp).padding(12.dp)) {
                BasicTextField(
                    value = editText,
                    onValueChange = { editText = it },
                    textStyle = androidx.compose.ui.text.TextStyle(color = ink.fg, fontSize = 15.sp),
                    cursorBrush = SolidColor(ink.fg),
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Pill("Отмена", ink, false) { editing = false }
                    Pill("Отправить", ink, true) {
                        editing = false
                        model.commitEdit(message.id, editText)
                    }
                }
            }
            return@Column
        }
        val variant = message.variants.getOrNull(message.variant)
        val shape = RoundedCornerShape(20.dp)
        Column(
            Modifier
                .widthIn(max = 340.dp)
                .clip(shape)
                .background(if (mine) ink.invert else ink.glass)
                .border(1.dp, if (mine) Color.Transparent else ink.line, shape)
                .padding(horizontal = 14.dp, vertical = 10.dp),
        ) {
            if (mine) {
                if (message.content.isNotBlank()) Text(message.content, color = ink.invertFg, fontSize = 15.sp, lineHeight = 21.sp)
                message.attachments.forEach { file ->
                    Text(file.name, color = ink.invertFg.copy(alpha = 0.7f), fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
                }
            } else {
                val text = variant?.content.orEmpty()
                val failed = variant?.error
                when {
                    message.pending && text.isBlank() && failed == null -> Pulse()
                    text.isNotBlank() -> Markdown(text, ink.fg)
                    failed != null -> Text(failed, color = ink.muted, fontSize = 14.sp)
                    variant?.stopped == true -> Text("Остановлено", color = ink.muted, fontSize = 14.sp)
                }
                if (!variant?.reasoning.isNullOrBlank()) Reason(variant?.reasoning.orEmpty(), ink)
                if (variant?.stopped == true && text.isNotBlank()) {
                    Text("Остановлено", color = ink.faint, fontSize = 12.sp, modifier = Modifier.padding(top = 6.dp))
                }
                if (!variant?.model.isNullOrBlank() && text.isNotBlank()) {
                    Text(variant?.model.orEmpty(), color = ink.faint, fontSize = 11.sp, modifier = Modifier.padding(top = 6.dp))
                }
            }
        }
        if (!mine) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                val count = message.variants.size
                if (count > 1) {
                    IconButton(onClick = { model.setVariant(message.id, message.variant - 1) }, enabled = message.variant > 0) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, "Предыдущий вариант")
                    }
                    Text("${message.variant + 1}/$count", color = ink.muted, fontSize = 12.sp)
                    IconButton(onClick = { model.setVariant(message.id, message.variant + 1) }, enabled = message.variant < count - 1) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, "Следующий вариант")
                    }
                }
                IconButton(onClick = {
                    copy(context, variant?.content.orEmpty())
                    model.notify("Скопировано")
                }) { Icon(Icons.Filled.ContentCopy, "Копировать", tint = ink.muted) }
                IconButton(onClick = { model.regenerate(message.id) }, enabled = model.busyChat == null) {
                    Icon(Icons.Filled.Refresh, "Ещё вариант", tint = ink.muted)
                }
            }
        } else {
            Row {
                IconButton(onClick = {
                    editText = message.content
                    editing = true
                }) { Icon(Icons.Filled.Edit, "Изменить", tint = ink.muted) }
                IconButton(onClick = {
                    copy(context, message.content)
                    model.notify("Скопировано")
                }) { Icon(Icons.Filled.ContentCopy, "Копировать", tint = ink.muted) }
            }
        }
    }
}

@Composable
private fun Pulse() {
    val alpha by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.25f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "a",
    )
    Text("···", modifier = Modifier.alpha(alpha), fontSize = 22.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Reason(text: String, ink: Ink) {
    var open by remember(text) { mutableStateOf(false) }
    Text(
        if (open) "Скрыть ход мысли" else "Ход мысли",
        color = ink.muted,
        fontSize = 13.sp,
        modifier = Modifier.padding(top = 8.dp).clickable { open = !open },
    )
    if (open) Text(text, color = ink.muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 4.dp))
}

@Composable
private fun Composer(model: VellumModel, ink: Ink) {
    val image = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) model.importUri(uri, image = true)
    }
    val file = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) model.importUri(uri, image = false)
    }
    val busy = model.busyChat != null && model.busyChat == model.data.activeChatId
    Column(Modifier.padding(horizontal = 12.dp, vertical = 8.dp).glass(ink, 26.dp).padding(horizontal = 8.dp, vertical = 6.dp)) {
        if (model.pending.isNotEmpty()) {
            Row(Modifier.horizontalScroll(rememberScrollState()).padding(horizontal = 6.dp, vertical = 4.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                model.pending.forEach { item ->
                    Row(
                        Modifier.clip(RoundedCornerShape(999.dp)).background(ink.glassStrong).padding(horizontal = 10.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Text(item.name, fontSize = 12.sp, maxLines = 1, modifier = Modifier.widthIn(max = 140.dp))
                        Icon(Icons.Filled.Close, "Убрать", modifier = Modifier.padding(start = 4.dp).size(16.dp).clickable { model.removePending(item.id) })
                    }
                }
            }
        }
        Row(verticalAlignment = Alignment.Bottom) {
            IconButton(onClick = { image.launch("image/*") }) { Icon(Icons.Filled.Image, "Изображение", tint = ink.muted) }
            IconButton(onClick = { file.launch("*/*") }) { Icon(Icons.Filled.AttachFile, "Файл", tint = ink.muted) }
            BasicTextField(
                value = model.draft,
                onValueChange = { model.draft = it },
                modifier = Modifier.weight(1f).padding(bottom = 12.dp, top = 10.dp),
                textStyle = androidx.compose.ui.text.TextStyle(color = ink.fg, fontSize = 16.sp, lineHeight = 22.sp),
                cursorBrush = SolidColor(ink.fg),
                maxLines = 6,
                keyboardOptions = KeyboardOptions(
                    capitalization = KeyboardCapitalization.Sentences,
                    imeAction = if (model.data.enterToSend) ImeAction.Send else ImeAction.Default,
                ),
                keyboardActions = KeyboardActions(onSend = { model.send() }),
                decorationBox = { inner ->
                    Box {
                        if (model.draft.isEmpty()) Text("Сообщение", color = ink.faint, fontSize = 16.sp)
                        inner()
                    }
                },
            )
            Box(
                Modifier.padding(4.dp).size(44.dp).clip(CircleShape).background(ink.invert).clickable {
                    if (busy) model.stop() else model.send()
                },
                contentAlignment = Alignment.Center,
            ) {
                Icon(if (busy) Icons.Filled.Stop else Icons.AutoMirrored.Filled.Send, if (busy) "Стоп" else "Отправить", tint = ink.invertFg)
            }
        }
        Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 8.dp, bottom = 4.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(
                "Промпты",
                color = ink.faint,
                fontSize = 12.sp,
                modifier = Modifier.clickable { model.panel = "library" }.padding(4.dp),
            )
            Text(
                if (model.data.stream) "поток" else "целиком",
                color = ink.faint,
                fontSize = 12.sp,
                modifier = Modifier.padding(4.dp),
            )
        }
    }
}

@Composable
private fun Drawer(model: VellumModel, ink: Ink) {
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.46f)).clickable { model.drawer = false }) {
        Column(
            Modifier
                .fillMaxHeight()
                .width(312.dp)
                .background(if (ink.frost) Color(0xF7F4F2EC) else Color(0xF7101012))
                .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) {}
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Mark(ink.fg, Modifier.size(22.dp))
                Text("Vellum", modifier = Modifier.padding(start = 8.dp), fontWeight = FontWeight.SemiBold, fontSize = 18.sp)
                Spacer(Modifier.weight(1f))
                IconButton(onClick = { model.drawer = false }) { Icon(Icons.Filled.Close, "Закрыть") }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 8.dp)) {
                Pill("Новый чат", ink, true) { model.createChat() }
                Pill("Инкогнито", ink, false) { model.createChat(incognito = true) }
            }
            Row(
                Modifier.padding(top = 12.dp).glass(ink, 16.dp).padding(horizontal = 10.dp, vertical = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(Icons.Filled.Search, null, tint = ink.faint, modifier = Modifier.size(18.dp))
                BasicTextField(
                    value = model.query,
                    onValueChange = { model.query = it },
                    modifier = Modifier.weight(1f).padding(8.dp),
                    textStyle = androidx.compose.ui.text.TextStyle(color = ink.fg, fontSize = 15.sp),
                    cursorBrush = SolidColor(ink.fg),
                    singleLine = true,
                    decorationBox = { inner ->
                        Box {
                            if (model.query.isEmpty()) Text("Поиск", color = ink.faint)
                            inner()
                        }
                    },
                )
            }
            Text(
                if (model.showArchive) "К активным" else "Архив",
                color = ink.muted,
                fontSize = 13.sp,
                modifier = Modifier.padding(top = 10.dp, bottom = 4.dp).clickable { model.showArchive = !model.showArchive },
            )
            val needle = model.query.trim().lowercase()
            val chats = model.data.chats.filter { chat ->
                (if (model.showArchive) chat.archived else !chat.archived) &&
                    (needle.isEmpty() || chat.title.lowercase().contains(needle) || chat.messages.any { message ->
                        message.content.lowercase().contains(needle) || message.variants.any { it.content.lowercase().contains(needle) }
                    })
            }
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                items(chats, key = { it.id }) { chat -> ChatRow(model, ink, chat) }
            }
        }
    }
}

@Composable
private fun ChatRow(model: VellumModel, ink: Ink, chat: Chat) {
    val context = LocalContext.current
    var menu by remember(chat.id) { mutableStateOf(false) }
    var rename by remember(chat.id) { mutableStateOf(false) }
    var title by remember(chat.id) { mutableStateOf(chat.title) }
    val on = chat.id == model.data.activeChatId
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(if (on) ink.glassStrong else Color.Transparent)
            .clickable { model.select(chat.id) }
            .padding(horizontal = 10.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(chat.title, maxLines = 1, overflow = TextOverflow.Ellipsis, fontWeight = if (on) FontWeight.SemiBold else FontWeight.Normal, fontSize = 14.sp)
            Text(
                listOfNotNull(if (chat.pinned) "закреп" else null, if (chat.incognito) "инкогнито" else null, rel(chat.updatedAt)).joinToString(" · "),
                color = ink.faint,
                fontSize = 11.sp,
                maxLines = 1,
            )
        }
        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Ещё", tint = ink.muted) }
        DropdownMenu(expanded = menu, onDismissRequest = { menu = false }) {
            DropdownMenuItem(text = { Text(if (chat.pinned) "Открепить" else "Закрепить") }, onClick = { menu = false; model.togglePin(chat.id) }, leadingIcon = { Icon(Icons.Filled.PushPin, null) })
            DropdownMenuItem(text = { Text(if (chat.archived) "Вернуть" else "В архив") }, onClick = { menu = false; model.setArchived(chat.id, !chat.archived) }, leadingIcon = { Icon(Icons.Filled.Archive, null) })
            DropdownMenuItem(text = { Text("Переименовать") }, onClick = { menu = false; title = chat.title; rename = true }, leadingIcon = { Icon(Icons.Filled.Edit, null) })
            DropdownMenuItem(text = { Text("Экспорт") }, onClick = {
                menu = false
                val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, chatMarkdown(chat))
                context.startActivity(Intent.createChooser(send, "Экспорт чата"))
            }, leadingIcon = { Icon(Icons.Filled.Share, null) })
            DropdownMenuItem(text = { Text("Удалить") }, onClick = { menu = false; model.deleteChat(chat.id) }, leadingIcon = { Icon(Icons.Filled.Delete, null) })
        }
    }
    if (rename) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { rename = false },
            title = { Text("Название") },
            text = {
                BasicTextField(
                    value = title,
                    onValueChange = { title = it },
                    textStyle = androidx.compose.ui.text.TextStyle(color = ink.fg, fontSize = 16.sp),
                    cursorBrush = SolidColor(ink.fg),
                    modifier = Modifier.fillMaxWidth().glass(ink, 12.dp).padding(12.dp),
                )
            },
            confirmButton = { Pill("Сохранить", ink, true) { model.rename(chat.id, title); rename = false } },
            dismissButton = { Pill("Отмена", ink, false) { rename = false } },
        )
    }
}

@Composable
fun Pill(text: String, ink: Ink, on: Boolean, onClick: () -> Unit) {
    Text(
        text,
        color = if (on) ink.invertFg else ink.fg,
        fontSize = 13.sp,
        modifier = Modifier
            .clip(RoundedCornerShape(999.dp))
            .background(if (on) ink.invert else ink.glass)
            .border(1.dp, if (on) Color.Transparent else ink.line, RoundedCornerShape(999.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
    )
}

private sealed interface Block {
    data class Code(val text: String) : Block
    data class Rich(val text: String, val kind: String) : Block
}

@Composable
private fun Markdown(source: String, color: Color) {
    val blocks = remember(source) { parseBlocks(source) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        blocks.forEach { block ->
            when (block) {
                is Block.Code -> Text(
                    block.text,
                    color = color,
                    fontFamily = FontFamily.Monospace,
                    fontSize = 13.sp,
                    lineHeight = 18.sp,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(Color.Black.copy(alpha = 0.28f)).padding(10.dp),
                )
                is Block.Rich -> Text(
                    inline(block.text),
                    color = color,
                    fontSize = if (block.kind == "h") 17.sp else 15.sp,
                    fontWeight = if (block.kind == "h") FontWeight.SemiBold else FontWeight.Normal,
                    lineHeight = 21.sp,
                )
            }
        }
    }
}

private fun parseBlocks(source: String): List<Block> {
    val out = mutableListOf<Block>()
    val parts = source.split("```")
    parts.forEachIndexed { index, part ->
        if (index % 2 == 1) {
            val lines = part.removePrefix("\n").split('\n')
            val code = if (lines.size > 1 && !lines.first().contains(' ')) lines.drop(1).joinToString("\n") else part.trim('\n')
            out += Block.Code(code.trimEnd())
        } else {
            val buf = StringBuilder()
            fun flush() {
                val text = buf.toString().trim()
                if (text.isNotEmpty()) out += Block.Rich(text, "p")
                buf.clear()
            }
            for (line in part.split('\n')) {
                val trimmed = line.trim()
                when {
                    trimmed.startsWith("#") -> {
                        flush()
                        out += Block.Rich(trimmed.trimStart('#').trim(), "h")
                    }
                    trimmed.startsWith("- ") || trimmed.startsWith("* ") -> {
                        flush()
                        out += Block.Rich("• ${trimmed.drop(2)}", "p")
                    }
                    trimmed.isEmpty() -> flush()
                    else -> {
                        if (buf.isNotEmpty()) buf.append(' ')
                        buf.append(trimmed)
                    }
                }
            }
            flush()
        }
    }
    return out
}

private fun inline(source: String) = buildAnnotatedString {
    var i = 0
    while (i < source.length) {
        if (source.startsWith("**", i)) {
            val end = source.indexOf("**", i + 2)
            if (end > i) {
                withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(source.substring(i + 2, end)) }
                i = end + 2
                continue
            }
        }
        if (source[i] == '`') {
            val end = source.indexOf('`', i + 1)
            if (end > i) {
                withStyle(SpanStyle(fontFamily = FontFamily.Monospace)) { append(source.substring(i + 1, end)) }
                i = end + 1
                continue
            }
        }
        append(source[i])
        i++
    }
}

private fun copy(context: android.content.Context, text: String) {
    val manager = context.getSystemService(ClipboardManager::class.java) ?: return
    manager.setPrimaryClip(ClipData.newPlainText("vellum", text))
}

private fun rel(ts: Long): String {
    val delta = System.currentTimeMillis() - ts
    return when {
        delta < 60_000 -> "только что"
        delta < 3_600_000 -> "${delta / 60_000} мин"
        delta < 86_400_000 -> "${delta / 3_600_000} ч"
        else -> SimpleDateFormat("d MMM", Locale("ru")).format(Date(ts))
    }
}

