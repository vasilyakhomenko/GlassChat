package app.vellum.client

import android.content.Intent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun VellumSheets(model: VellumModel, ink: Ink) {
    val eat = remember { MutableInteractionSource() }
    Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.5f)).clickable { model.panel = null }) {
        Column(
            Modifier
                .align(Alignment.BottomCenter)
                .fillMaxWidth()
                .fillMaxHeight(0.92f)
                .background(if (ink.frost) Color(0xF7F4F2EC) else Color(0xF7101012), RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp))
                .clickable(interactionSource = eat, indication = null) {}
                .imePadding()
                .navigationBarsPadding(),
        ) {
            Row(Modifier.fillMaxWidth().padding(start = 20.dp, end = 8.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(sheetTitle(model.panel), fontSize = 20.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                IconButton(onClick = { model.panel = null }) { Icon(Icons.Filled.Close, "Закрыть") }
            }
            Column(Modifier.verticalScroll(rememberScrollState()).padding(horizontal = 20.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                when (model.panel) {
                    "settings" -> SettingsBody(model, ink)
                    "model" -> ModelBody(model, ink)
                    "params" -> ParamsBody(model, ink)
                    "library" -> LibraryBody(model, ink)
                }
            }
        }
    }
}

private fun sheetTitle(panel: String?) = when (panel) {
    "model" -> "Модель"
    "params" -> "Параметры"
    "library" -> "Библиотека"
    else -> "Настройки"
}

@Composable
private fun SettingsBody(model: VellumModel, ink: Ink) {
    Text("Ключ хранится на устройстве и уходит напрямую провайдеру — и в облако, и на Ollama в локальной сети.", color = ink.muted, fontSize = 14.sp, lineHeight = 20.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill("Чернила", ink, model.data.theme != "frost") { model.setTheme("ink") }
        Pill("Иней", ink, model.data.theme == "frost") { model.setTheme("frost") }
    }
    Toggle("Поток ответа", model.data.stream, ink) { model.setStream(!model.data.stream) }
    Toggle("Enter отправляет", model.data.enterToSend, ink) { model.setEnter(!model.data.enterToSend) }
    Toggle("Называть чат само", model.data.autoTitle, ink) { model.setAutoTitle(!model.data.autoTitle) }
    Label("Инструкция")
    Area(model.data.instructions, "Как отвечать по умолчанию", ink) { model.setInstructions(it) }
    Label("Память")
    Area(model.data.memory, "Что модель должна помнить о вас", ink) { model.setMemory(it) }
    Label("Провайдеры")
    Text("Для эмулятора Ollama — 10.0.2.2. Для телефона замените на IP компьютера в сети.", color = ink.faint, fontSize = 12.sp)
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        PRESETS.forEach { preset -> Pill(preset.name, ink, false) { model.addPreset(preset) } }
    }
    if (model.data.providers.isEmpty()) {
        Text("Пока пусто. Выберите пресет или это не заработает.", color = ink.muted, fontSize = 14.sp)
    }
    model.data.providers.forEach { provider -> ProviderCard(model, ink, provider) }
    val context = LocalContext.current
    val export = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        context.contentResolver.openOutputStream(uri)?.use { stream -> stream.write(model.exportJson().toByteArray()) }
        model.notify("Архив сохранён")
    }
    val import = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().decodeToString() } ?: return@rememberLauncherForActivityResult
        model.importRaw(text)
    }
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Pill("Экспорт", ink, false) { export.launch("vellum.json") }
        Pill("Импорт", ink, false) { import.launch(arrayOf("application/json", "text/*", "*/*")) }
    }
    var confirm by remember { mutableStateOf(false) }
    Pill("Стереть всё", ink, true) { confirm = true }
    if (confirm) {
        AlertDialog(
            onDismissRequest = { confirm = false },
            title = { Text("Стереть данные?") },
            text = { Text("Чаты, ключи и промпты удалятся с этого устройства.") },
            confirmButton = { Pill("Стереть", ink, true) { confirm = false; model.clearAll() } },
            dismissButton = { Pill("Отмена", ink, false) { confirm = false } },
        )
    }
    Text("Веб-версия рядом — тот же архив JSON. APK собирается в GitHub Actions.", color = ink.faint, fontSize = 12.sp)
    Pill("Поделиться инструкцией", ink, false) {
        val text = "Vellum: откройте Actions → Build APK → Run workflow и скачайте vellum-debug."
        context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text), "Сборка"))
    }
}

@Composable
private fun ProviderCard(model: VellumModel, ink: Ink, provider: Provider) {
    val on = provider.id == model.data.activeProviderId || provider.id == model.activeChat()?.providerId
    var reveal by remember(provider.id) { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().glass(ink, 18.dp).padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable { model.setActiveProvider(provider.id) }) {
                Text(provider.name.ifBlank { "Без имени" }, fontWeight = FontWeight.SemiBold)
                Text(if (on) "активен" else "сделать активным", color = ink.faint, fontSize = 12.sp)
            }
            IconButton(onClick = { model.removeProvider(provider.id) }) { Icon(Icons.Filled.Delete, "Удалить", tint = ink.muted) }
        }
        if (on) {
            Field(provider.name, "Имя", ink) { model.upsert(provider.copy(name = it)) }
            Field(provider.baseUrl, "Базовый URL, …/v1", ink) { model.upsert(provider.copy(baseUrl = it)) }
            Field(
                provider.apiKey,
                if (provider.keyOptional) "Ключ не обязателен" else "API-ключ",
                ink,
                secret = !reveal,
            ) { model.upsert(provider.copy(apiKey = it)) }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(if (reveal) "Скрыть ключ" else "Показать ключ", color = ink.muted, fontSize = 13.sp, modifier = Modifier.clickable { reveal = !reveal }.weight(1f))
                Icon(if (reveal) Icons.Filled.VisibilityOff else Icons.Filled.Visibility, null, tint = ink.muted)
            }
            Toggle("Ключ не нужен", provider.keyOptional, ink) { model.upsert(provider.copy(keyOptional = !provider.keyOptional)) }
            Toggle("Минимальный запрос", provider.minimal, ink) { model.upsert(provider.copy(minimal = !provider.minimal)) }
            Text("Минимальный запрос не шлёт temperature и штрафы — так спокойнее к Ollama и части локальных серверов.", color = ink.faint, fontSize = 12.sp)
        }
    }
}

@Composable
private fun ModelBody(model: VellumModel, ink: Ink) {
    val current = model.activeChat()?.model?.ifBlank { model.data.defaultModel }.orEmpty()
    Text("Id модели у этого провайдера. Его можно вписать руками, если список не приходит.", color = ink.muted, fontSize = 14.sp)
    Field(current, "например gpt-4o-mini", ink) { model.chooseModel(it) }
    Pill("Обновить список", ink, true) { model.refreshModels() }
    val provider = model.activeProvider()
    val models = provider?.let { model.catalog[it.id] }.orEmpty()
    if (models.isEmpty()) {
        Text("Список появится после запроса к /models.", color = ink.faint, fontSize = 13.sp)
    }
    models.forEach { id ->
        Text(
            id,
            fontSize = 14.sp,
            modifier = Modifier.fillMaxWidth().clipSafe().clickable { model.chooseModel(id); model.panel = null }.padding(vertical = 8.dp),
            color = if (id == current) ink.fg else ink.muted,
            fontWeight = if (id == current) FontWeight.SemiBold else FontWeight.Normal,
        )
    }
}

@Composable
private fun ParamsBody(model: VellumModel, ink: Ink) {
    val sampling = model.samplingNow()
    Text("Параметры этого чата. Новые чаты наследуют последние значения.", color = ink.muted, fontSize = 14.sp)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Mood("Точный", 0.2, 0.9, sampling, ink, model)
        Mood("Баланс", 0.7, 1.0, sampling, ink, model)
        Mood("Свободный", 1.15, 1.0, sampling, ink, model)
    }
    Slide("Температура", sampling.temperature, 0f, 2f, ink) { model.setSampling(sampling.copy(temperature = it.toDouble())) }
    Slide("Top P", sampling.topP, 0f, 1f, ink) { model.setSampling(sampling.copy(topP = it.toDouble())) }
    Slide("Presence", sampling.presencePenalty, -2f, 2f, ink) { model.setSampling(sampling.copy(presencePenalty = it.toDouble())) }
    Slide("Frequency", sampling.frequencyPenalty, -2f, 2f, ink) { model.setSampling(sampling.copy(frequencyPenalty = it.toDouble())) }
    var cap by remember(sampling.maxTokens) { mutableStateOf(sampling.maxTokens?.toString().orEmpty()) }
    Label("Лимит токенов")
    Field(cap, "пусто — без лимита", ink) { raw ->
        cap = raw.filter { it.isDigit() }.take(5)
        val value = cap.toIntOrNull()
        model.setSampling(sampling.copy(maxTokens = value?.takeIf { it > 0 }))
    }
    Label("Инструкция чата")
    Area(model.activeChat()?.instruction.orEmpty(), "Только для этого разговора", ink) { model.setChatInstruction(it) }
}

@Composable
private fun Mood(label: String, temperature: Double, topP: Double, sampling: Sampling, ink: Ink, model: VellumModel) {
    val on = kotlin.math.abs(sampling.temperature - temperature) < 0.05 && kotlin.math.abs(sampling.topP - topP) < 0.05
    Pill(label, ink, on) { model.setSampling(sampling.copy(temperature = temperature, topP = topP)) }
}

@Composable
private fun LibraryBody(model: VellumModel, ink: Ink) {
    Text("Нажатие подставляет текст в поле ввода.", color = ink.muted, fontSize = 14.sp)
    model.data.prompts.forEach { prompt ->
        Column(Modifier.fillMaxWidth().glass(ink, 16.dp).padding(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(prompt.title, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f).clickable { model.insertPrompt(prompt.body) })
                Text("убрать", color = ink.faint, fontSize = 12.sp, modifier = Modifier.clickable { model.removePrompt(prompt.id) })
            }
            Text(prompt.body, color = ink.muted, fontSize = 13.sp, modifier = Modifier.padding(top = 6.dp).clickable { model.insertPrompt(prompt.body) })
        }
    }
    var title by remember { mutableStateOf("") }
    var body by remember { mutableStateOf("") }
    Label("Новый промпт")
    Field(title, "Название", ink) { title = it }
    Area(body, "Текст", ink) { body = it }
    Pill("Сохранить", ink, true) {
        model.addPrompt(title, body)
        title = ""
        body = ""
    }
}

@Composable
private fun Toggle(label: String, on: Boolean, ink: Ink, flip: () -> Unit) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, modifier = Modifier.weight(1f), fontSize = 15.sp)
        Switch(
            checked = on,
            onCheckedChange = { flip() },
            colors = SwitchDefaults.colors(
                checkedThumbColor = ink.invertFg,
                checkedTrackColor = ink.invert,
                uncheckedThumbColor = ink.muted,
                uncheckedTrackColor = ink.glassStrong,
                uncheckedBorderColor = ink.line,
            ),
        )
    }
}

@Composable
private fun Slide(label: String, value: Double, min: Float, max: Float, ink: Ink, onChange: (Float) -> Unit) {
    Column {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(label, fontSize = 14.sp)
            Text(String.format(java.util.Locale.US, "%.2f", value), color = ink.muted, fontSize = 13.sp)
        }
        Slider(
            value = value.toFloat().coerceIn(min, max),
            onValueChange = onChange,
            valueRange = min..max,
            colors = SliderDefaults.colors(
                thumbColor = ink.fg,
                activeTrackColor = ink.fg,
                inactiveTrackColor = ink.line,
            ),
        )
    }
}

@Composable
private fun Label(text: String) {
    Text(text, fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
}

@Composable
private fun Field(value: String, hint: String, ink: Ink, secret: Boolean = false, onChange: (String) -> Unit) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        singleLine = true,
        textStyle = TextStyle(color = ink.fg, fontSize = 15.sp),
        cursorBrush = SolidColor(ink.fg),
        visualTransformation = if (secret) PasswordVisualTransformation() else VisualTransformation.None,
        modifier = Modifier.fillMaxWidth().glass(ink, 14.dp).padding(horizontal = 12.dp, vertical = 12.dp),
        decorationBox = { inner ->
            Box {
                if (value.isEmpty()) Text(hint, color = ink.faint, fontSize = 15.sp)
                inner()
            }
        },
    )
}

@Composable
private fun Area(value: String, hint: String, ink: Ink, onChange: (String) -> Unit) {
    BasicTextField(
        value = value,
        onValueChange = onChange,
        textStyle = TextStyle(color = ink.fg, fontSize = 15.sp, lineHeight = 21.sp),
        cursorBrush = SolidColor(ink.fg),
        modifier = Modifier.fillMaxWidth().glass(ink, 14.dp).padding(12.dp),
        minLines = 3,
        decorationBox = { inner ->
            Box(Modifier.fillMaxWidth()) {
                if (value.isEmpty()) Text(hint, color = ink.faint, fontSize = 15.sp)
                inner()
            }
        },
    )
}

private fun Modifier.clipSafe() = this
