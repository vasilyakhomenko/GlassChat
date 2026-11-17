package app.vellum.client

import android.app.Application
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.provider.OpenableColumns
import android.util.Base64
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.exifinterface.media.ExifInterface
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class VellumModel(app: Application) : AndroidViewModel(app) {
    var data by mutableStateOf(load())
        private set
    var panel by mutableStateOf<String?>(null)
    var drawer by mutableStateOf(false)
    var notice by mutableStateOf<String?>(null)
        private set
    var draft by mutableStateOf("")
    var pending by mutableStateOf<List<Attachment>>(emptyList())
    var query by mutableStateOf("")
    var showArchive by mutableStateOf(false)
    var catalog by mutableStateOf<Map<String, List<String>>>(emptyMap())
        private set
    var busyChat by mutableStateOf<String?>(null)
        private set

    private val api = OpenAi()
    private val prefs = app.getSharedPreferences("vellum", Application.MODE_PRIVATE)
    private var call: okhttp3.Call? = null
    private var job: Job? = null
    private var noticeJob: Job? = null
    private var stopped = false

    fun notify(text: String) {
        notice = text
        noticeJob?.cancel()
        noticeJob = viewModelScope.launch {
            delay(2800)
            if (notice == text) notice = null
        }
    }

    fun activeChat(): Chat? = data.chats.find { it.id == data.activeChatId }

    fun activeProvider(): Provider? {
        val chat = activeChat()
        return data.providers.find { it.id == chat?.providerId }
            ?: data.providers.find { it.id == data.activeProviderId }
            ?: data.providers.firstOrNull()
    }

    fun samplingNow(): Sampling = activeChat()?.sampling ?: data.sampling

    fun setTheme(theme: String) = mutate { it.copy(theme = theme) }

    fun setStream(on: Boolean) = mutate { it.copy(stream = on) }

    fun setEnter(on: Boolean) = mutate { it.copy(enterToSend = on) }

    fun setAutoTitle(on: Boolean) = mutate { it.copy(autoTitle = on) }

    fun setInstructions(text: String) = mutate { it.copy(instructions = text) }

    fun setMemory(text: String) = mutate { it.copy(memory = text) }

    fun setSampling(next: Sampling) = mutate { st ->
        val base = st.copy(sampling = next)
        val id = st.activeChatId ?: return@mutate base
        base.withChat(id) { it.copy(sampling = next) }
    }

    fun chooseModel(id: String) {
        val trimmed = id.trim()
        if (trimmed.isEmpty()) return
        mutate { st ->
            val base = st.copy(defaultModel = trimmed)
            val cid = st.activeChatId ?: return@mutate base
            base.withChat(cid) { it.copy(model = trimmed) }
        }
    }

    fun setChatInstruction(text: String) {
        val id = data.activeChatId ?: return
        mutate { it.withChat(id) { chat -> chat.copy(instruction = text) } }
    }

    fun setActiveProvider(id: String) = mutate { st ->
        val base = st.copy(activeProviderId = id)
        val cid = st.activeChatId ?: return@mutate base
        base.withChat(cid) { it.copy(providerId = id) }
    }

    fun upsert(provider: Provider) = mutate { st ->
        val exists = st.providers.any { it.id == provider.id }
        val providers = if (exists) st.providers.map { if (it.id == provider.id) provider else it } else st.providers + provider
        st.copy(providers = providers, activeProviderId = provider.id.ifBlank { st.activeProviderId })
    }

    fun removeProvider(id: String) = mutate { st ->
        val next = st.providers.filter { it.id != id }
        st.copy(
            providers = next,
            activeProviderId = if (st.activeProviderId == id) next.firstOrNull()?.id.orEmpty() else st.activeProviderId,
        )
    }

    fun addPreset(preset: Preset) {
        val provider = Provider(
            id = nid(),
            name = preset.name,
            baseUrl = preset.baseUrl,
            apiKey = "",
            keyOptional = preset.keyOptional,
        )
        mutate { st ->
            val base = st.copy(
                providers = st.providers + provider,
                activeProviderId = provider.id,
                defaultModel = preset.model.ifBlank { st.defaultModel },
            )
            val cid = st.activeChatId ?: return@mutate base
            base.withChat(cid) { it.copy(providerId = provider.id, model = preset.model.ifBlank { it.model }) }
        }
        if (!preset.keyOptional) panel = "settings"
        notify(if (preset.keyOptional) "Адрес можно поправить под свою сеть" else "Вставьте ключ — он останется на устройстве")
    }

    fun createChat(incognito: Boolean = false) {
        val id = nid()
        val provider = data.providers.find { it.id == data.activeProviderId } ?: data.providers.firstOrNull()
        val chat = Chat(
            id = id,
            incognito = incognito,
            providerId = provider?.id.orEmpty(),
            model = data.defaultModel,
            sampling = data.sampling,
            title = if (incognito) "Инкогнито" else "Новый чат",
        )
        mutate { it.copy(chats = listOf(chat) + it.chats, activeChatId = id) }
        drawer = false
    }

    fun select(id: String) {
        data = data.copy(activeChatId = id)
        persist()
        drawer = false
    }

    fun deleteChat(id: String) = mutate { st ->
        val next = st.chats.filter { it.id != id }
        st.copy(
            chats = next,
            activeChatId = if (st.activeChatId == id) next.firstOrNull { !it.archived }?.id else st.activeChatId,
        )
    }

    fun rename(id: String, title: String) {
        val clean = title.trim()
        if (clean.isEmpty()) return
        mutate { it.withChat(id) { chat -> chat.copy(title = clean, titled = true) } }
    }

    fun togglePin(id: String) = mutate { it.withChat(id) { chat -> chat.copy(pinned = !chat.pinned) } }

    fun setArchived(id: String, archived: Boolean) = mutate { st ->
        val next = st.withChat(id) { it.copy(archived = archived) }
        if (archived && next.activeChatId == id) {
            next.copy(activeChatId = next.chats.firstOrNull { !it.archived }?.id)
        } else next
    }

    fun setVariant(messageId: String, index: Int) {
        val chatId = data.activeChatId ?: return
        mutate(save = true) { st ->
            st.withChat(chatId) { chat ->
                chat.copy(messages = chat.messages.map { message ->
                    if (message.id != messageId) message
                    else message.copy(variant = index.coerceIn(0, (message.variants.size - 1).coerceAtLeast(0)))
                })
            }
        }
    }

    fun insertPrompt(body: String) {
        draft = if (draft.isBlank()) body else "$draft\n$body"
        panel = null
    }

    fun addPrompt(title: String, body: String) {
        if (title.isBlank() || body.isBlank()) return
        mutate { it.copy(prompts = it.prompts + Prompt(nid(), title.trim(), body.trim())) }
    }

    fun removePrompt(id: String) = mutate { it.copy(prompts = it.prompts.filter { prompt -> prompt.id != id }) }

    fun removePending(id: String) {
        pending = pending.filter { it.id != id }
    }

    fun importUri(uri: Uri, image: Boolean) {
        if (pending.size >= 6) {
            notify("Не больше шести вложений")
            return
        }
        val resolver = getApplication<Application>().contentResolver
        viewModelScope.launch(Dispatchers.IO) {
            val name = displayName(resolver, uri)
            val attachment = try {
                if (image) decodeImage(resolver, uri, name) else decodeText(resolver, uri, name)
            } catch (_: Exception) {
                null
            }
            withContext(Dispatchers.Main) {
                if (attachment == null) notify(if (image) "Не удалось прочитать изображение" else "Этот файл не похож на текст")
                else pending = (pending + attachment).takeLast(6)
            }
        }
    }

    fun importRaw(raw: String) {
        val parsed = parseBackup(raw)
        if (parsed == null) {
            notify("Это не архив Vellum")
            return
        }
        data = parsed
        persist()
        panel = null
        notify("Архив восстановлен")
    }

    fun exportJson(): String = data.toBackup()

    fun clearAll() {
        data = AppData(theme = data.theme)
        catalog = emptyMap()
        pending = emptyList()
        draft = ""
        persist()
        notify("Чаты и ключи стёрты с устройства")
    }

    fun refreshModels() {
        val provider = activeProvider()
        if (provider == null) {
            panel = "settings"
            notify("Сначала добавьте провайдера")
            return
        }
        if (provider.apiKey.isBlank() && !provider.keyOptional) {
            notify("Нужен API-ключ")
            return
        }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val list = api.models(provider.baseUrl, provider.apiKey).distinct().sorted()
                withContext(Dispatchers.Main) {
                    catalog = catalog + (provider.id to list)
                    notify(if (list.isEmpty()) "Провайдер вернул пустой список" else "Моделей: ${list.size}")
                }
            } catch (error: Exception) {
                withContext(Dispatchers.Main) { notify(error.message ?: "Не удалось получить модели") }
            }
        }
    }

    fun stop() {
        stopped = true
        call?.cancel()
    }

    fun send() {
        val text = draft.trim()
        val files = pending
        if (text.isEmpty() && files.isEmpty()) return
        if (busyChat != null) {
            notify("Дождитесь ответа или остановите его")
            return
        }
        if (data.activeChatId == null || data.chats.none { it.id == data.activeChatId }) createChat()
        val chatId = data.activeChatId ?: return
        val ready = ensure(chatId) ?: return
        val user = Msg(id = nid(), role = "user", content = text, attachments = files)
        val assistantId = nid()
        val assistant = Msg(
            id = assistantId,
            role = "assistant",
            variants = listOf(Variant(model = ready.second)),
            pending = true,
        )
        mutate { st ->
            st.withChat(chatId) { chat ->
                val title = if (!chat.titled && chat.title == "Новый чат" && text.isNotBlank()) titleFrom(text) else chat.title
                chat.copy(
                    title = title,
                    providerId = ready.first.id,
                    model = ready.second,
                    archived = false,
                    messages = chat.messages + user + assistant,
                )
            }
        }
        draft = ""
        pending = emptyList()
        run(chatId, assistantId, ready.first, ready.second, 0, titleAfter = true)
    }

    fun regenerate(messageId: String) {
        if (busyChat != null) return
        val chat = activeChat() ?: return
        val ready = ensure(chat.id) ?: return
        var index = 0
        mutate { st ->
            st.withChat(chat.id) { current ->
                val cut = current.messages.indexOfFirst { it.id == messageId }
                val kept = if (cut < 0) current.messages else current.messages.take(cut + 1)
                current.copy(messages = kept.map { message ->
                    if (message.id != messageId) message
                    else {
                        val next = message.variants + Variant(model = ready.second)
                        index = next.lastIndex
                        message.copy(variants = next, variant = next.lastIndex, pending = true)
                    }
                })
            }
        }
        run(chat.id, messageId, ready.first, ready.second, index, titleAfter = false)
    }

    fun commitEdit(messageId: String, text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty() || busyChat != null) return
        val chat = activeChat() ?: return
        val ready = ensure(chat.id) ?: return
        val assistantId = nid()
        mutate { st ->
            st.withChat(chat.id) { current ->
                val cut = current.messages.indexOfFirst { it.id == messageId }
                val head = (if (cut < 0) current.messages else current.messages.take(cut + 1)).map { message ->
                    if (message.id == messageId) message.copy(content = trimmed) else message
                }
                current.copy(
                    messages = head + Msg(
                        id = assistantId,
                        role = "assistant",
                        variants = listOf(Variant(model = ready.second)),
                        pending = true,
                    ),
                )
            }
        }
        run(chat.id, assistantId, ready.first, ready.second, 0, titleAfter = false)
    }

    private fun ensure(chatId: String): Pair<Provider, String>? {
        val chat = data.chats.find { it.id == chatId } ?: return null
        val provider = data.providers.find { it.id == chat.providerId }
            ?: data.providers.find { it.id == data.activeProviderId }
        if (provider == null) {
            panel = "settings"
            notify("Добавьте провайдера — адрес API и ключ")
            return null
        }
        if (provider.apiKey.isBlank() && !provider.keyOptional) {
            panel = "settings"
            notify("Вставьте API-ключ. На сервер Vellum он не уходит.")
            return null
        }
        val model = chat.model.ifBlank { data.defaultModel }.trim()
        if (model.isEmpty()) {
            panel = "model"
            notify("Укажите id модели, например gpt-4o-mini")
            return null
        }
        return provider to model
    }

    private fun run(
        chatId: String,
        messageId: String,
        provider: Provider,
        model: String,
        index: Int,
        titleAfter: Boolean,
    ) {
        val chat = data.chats.find { it.id == chatId } ?: return
        val body = payload(model, apiMessages(data, chat, messageId), chat.sampling, data.stream, provider.minimal)
        stopped = false
        busyChat = chatId
        job = viewModelScope.launch {
            try {
                suspendCancellableCoroutine { cont ->
                    val started = api.stream(
                        provider.baseUrl,
                        provider.apiKey,
                        body,
                        onDelta = { content, reasoning ->
                            viewModelScope.launch(Dispatchers.Main) {
                                patch(chatId, messageId, index) { it.copy(content = content, reasoning = reasoning, model = model) }
                            }
                        },
                        onDone = {
                            viewModelScope.launch(Dispatchers.Main) { if (cont.isActive) cont.resume(Unit) }
                        },
                        onError = { message ->
                            viewModelScope.launch(Dispatchers.Main) {
                                if (cont.isActive) cont.resumeWithException(RuntimeException(message))
                            }
                        },
                    )
                    call = started
                    cont.invokeOnCancellation { started.cancel() }
                }
                patch(chatId, messageId, index) {
                    if (stopped) it.copy(stopped = true) else it
                }
                settle(chatId, messageId, pending = false)
                if (!stopped && titleAfter) maybeTitle(chatId, provider, model)
            } catch (error: CancellationException) {
                patch(chatId, messageId, index) { it.copy(stopped = true) }
                settle(chatId, messageId, pending = false)
                throw error
            } catch (error: Exception) {
                val message = error.message ?: "Ошибка запроса"
                patch(chatId, messageId, index) { current ->
                    if (current.content.isBlank()) current.copy(error = message) else current
                }
                settle(chatId, messageId, pending = false)
                notify(message)
            } finally {
                busyChat = null
                call = null
            }
        }
    }

    private fun maybeTitle(chatId: String, provider: Provider, model: String) {
        if (!data.autoTitle) return
        val chat = data.chats.find { it.id == chatId } ?: return
        if (chat.titled) return
        val first = chat.messages.firstOrNull { it.role == "user" && it.content.isNotBlank() } ?: return
        val local = titleFrom(first.content)
        mutate { it.withChat(chatId) { current -> current.copy(titled = true) } }
        viewModelScope.launch(Dispatchers.IO) {
            try {
                val body = JSONObject()
                    .put("model", model)
                    .put("stream", false)
                    .put("max_tokens", 24)
                    .put("messages", JSONArray()
                        .put(JSONObject().put("role", "system").put("content", "Название чата: 3–6 слов, язык пользователя, без кавычек и точки. Только название."))
                        .put(JSONObject().put("role", "user").put("content", first.content.take(600))))
                val raw = api.complete(provider.baseUrl, provider.apiKey, body)
                val title = cleanTitle(raw) ?: return@launch
                withContext(Dispatchers.Main) {
                    val fresh = data.chats.find { it.id == chatId } ?: return@withContext
                    if (fresh.title != local && fresh.title != "Новый чат" && fresh.title != "Инкогнито") return@withContext
                    mutate { it.withChat(chatId) { current -> current.copy(title = title) } }
                }
            } catch (_: Exception) {
                /* название необязательно */
            }
        }
    }

    private fun settle(chatId: String, messageId: String, pending: Boolean) {
        data = data.withChat(chatId) { chat ->
            chat.copy(messages = chat.messages.map { message ->
                if (message.id == messageId) message.copy(pending = pending) else message
            })
        }
        persist()
    }

    private fun patch(chatId: String, messageId: String, index: Int, block: (Variant) -> Variant) {
        data = data.withChat(chatId) { chat ->
            chat.copy(messages = chat.messages.map { message ->
                if (message.id != messageId) message
                else {
                    val variants = message.variants.toMutableList()
                    if (index in variants.indices) variants[index] = block(variants[index])
                    message.copy(variants = variants)
                }
            })
        }
    }

    private fun mutate(save: Boolean = true, block: (AppData) -> AppData) {
        data = block(data)
        if (save) persist()
    }

    private fun persist() {
        val active = data.activeChatId
        var json = data.toBackup()
        if (json.length > 700_000) json = data.toBackup(keepMedia = false)
        prefs.edit().putString("backup", json).putString("active", active).apply()
    }

    private fun load(): AppData {
        val raw = prefs.getString("backup", null) ?: return AppData()
        val parsed = parseBackup(raw) ?: return AppData()
        val active = prefs.getString("active", null)
        val chats = parsed.chats.map { chat ->
            chat.copy(messages = chat.messages.map { message ->
                if (message.role != "assistant") message
                else {
                    val variants = message.variants.map { variant ->
                        if (variant.content.isBlank() && variant.error == null && !variant.stopped) {
                            variant.copy(error = "Ответ прерван")
                        } else variant
                    }
                    message.copy(variants = variants, pending = false)
                }
            })
        }
        val restored = if (active != null && chats.any { it.id == active }) active else parsed.activeChatId
        return parsed.copy(chats = chats, activeChatId = restored)
    }

    private fun displayName(resolver: android.content.ContentResolver, uri: Uri): String {
        resolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
            if (cursor.moveToFirst()) {
                val name = cursor.getString(0)
                if (!name.isNullOrBlank()) return name
            }
        }
        return "file"
    }

    private fun decodeText(resolver: android.content.ContentResolver, uri: Uri, name: String): Attachment? {
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        if (bytes.size > 400_000) return null
        if (bytes.any { it == 0.toByte() }) return null
        val text = bytes.toString(Charsets.UTF_8).take(180_000)
        if (text.isBlank()) return null
        return Attachment(id = nid(), name = name, kind = "file", mime = "text/plain", text = text)
    }

    private fun decodeImage(resolver: android.content.ContentResolver, uri: Uri, name: String): Attachment? {
        val bytes = resolver.openInputStream(uri)?.use { it.readBytes() } ?: return null
        if (bytes.size > 14_000_000) return null
        val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: return null
        val oriented = orient(decoded, bytes)
        val longest = maxOf(oriented.width, oriented.height).coerceAtLeast(1)
        val scale = if (longest > 1280) 1280f / longest else 1f
        val scaled = if (scale < 1f) {
            Bitmap.createScaledBitmap(oriented, (oriented.width * scale).toInt().coerceAtLeast(1), (oriented.height * scale).toInt().coerceAtLeast(1), true)
        } else oriented
        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, 82, out)
        val encoded = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
        return Attachment(
            id = nid(),
            name = name,
            kind = "image",
            mime = "image/jpeg",
            dataUrl = "data:image/jpeg;base64,$encoded",
        )
    }

    private fun orient(bitmap: Bitmap, bytes: ByteArray): Bitmap {
        val exif = ExifInterface(ByteArrayInputStream(bytes))
        val turn = when (exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)) {
            ExifInterface.ORIENTATION_ROTATE_90 -> 90f
            ExifInterface.ORIENTATION_ROTATE_180 -> 180f
            ExifInterface.ORIENTATION_ROTATE_270 -> 270f
            else -> return bitmap
        }
        val matrix = Matrix().apply { postRotate(turn) }
        return Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
    }
}

private fun cleanTitle(raw: String): String? {
    val line = raw.lineSequence().map { it.trim() }.firstOrNull { it.isNotEmpty() } ?: return null
    val title = line.trim('"', '«', '»', '.', '!', ' ')
    if (title.length < 2 || title.length > 72) return null
    return title
}

private fun payload(model: String, messages: JSONArray, sampling: Sampling, stream: Boolean, minimal: Boolean): JSONObject {
    val body = JSONObject()
        .put("model", model)
        .put("messages", messages)
        .put("stream", stream)
    if (minimal) {
        if (sampling.maxTokens != null && sampling.maxTokens > 0) body.put("max_tokens", sampling.maxTokens)
        return body
    }
    body.put("temperature", sampling.temperature)
    body.put("top_p", sampling.topP)
    body.put("presence_penalty", sampling.presencePenalty)
    body.put("frequency_penalty", sampling.frequencyPenalty)
    if (sampling.maxTokens != null && sampling.maxTokens > 0) body.put("max_tokens", sampling.maxTokens)
    return body
}

private fun apiMessages(state: AppData, chat: Chat, skipId: String): JSONArray {
    val out = JSONArray()
    val system = buildString {
        if (state.instructions.isNotBlank()) append(state.instructions.trim())
        if (state.memory.isNotBlank()) {
            if (isNotEmpty()) append("\n\n")
            append("Память о пользователе:\n").append(state.memory.trim())
        }
        if (chat.instruction.isNotBlank()) {
            if (isNotEmpty()) append("\n\n")
            append("Инструкция этого чата:\n").append(chat.instruction.trim())
        }
    }
    if (system.isNotBlank()) out.put(JSONObject().put("role", "system").put("content", system))
    for (message in chat.messages) {
        if (message.id == skipId) continue
        if (message.role == "user") {
            val content = userContent(message)
            if (content is String && content.isBlank()) continue
            out.put(JSONObject().put("role", "user").put("content", content))
        } else {
            val text = message.variants.getOrNull(message.variant)?.content.orEmpty()
            if (text.isBlank()) continue
            out.put(JSONObject().put("role", "assistant").put("content", text))
        }
    }
    return out
}
