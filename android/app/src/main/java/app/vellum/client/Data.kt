package app.vellum.client

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Sampling(
    val temperature: Double = 0.7,
    val topP: Double = 1.0,
    val maxTokens: Int? = null,
    val presencePenalty: Double = 0.0,
    val frequencyPenalty: Double = 0.0,
)

data class Provider(
    val id: String,
    val name: String,
    val baseUrl: String,
    val apiKey: String,
    val keyOptional: Boolean = false,
    val direct: Boolean = false,
    val minimal: Boolean = false,
)

data class Attachment(
    val id: String,
    val name: String,
    val kind: String,
    val mime: String,
    val dataUrl: String? = null,
    val text: String? = null,
)

data class Variant(
    val content: String = "",
    val reasoning: String = "",
    val model: String = "",
    val error: String? = null,
    val stopped: Boolean = false,
)

data class Msg(
    val id: String,
    val role: String,
    val content: String = "",
    val attachments: List<Attachment> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val variants: List<Variant> = emptyList(),
    val variant: Int = 0,
    val pending: Boolean = false,
)

data class Chat(
    val id: String,
    val title: String = "Новый чат",
    val pinned: Boolean = false,
    val archived: Boolean = false,
    val incognito: Boolean = false,
    val providerId: String = "",
    val model: String = "",
    val instruction: String = "",
    val sampling: Sampling = Sampling(),
    val messages: List<Msg> = emptyList(),
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val titled: Boolean = false,
)

data class Prompt(val id: String, val title: String, val body: String)

data class AppData(
    val theme: String = "ink",
    val instructions: String = "",
    val memory: String = "",
    val sampling: Sampling = Sampling(),
    val providers: List<Provider> = emptyList(),
    val activeProviderId: String = "",
    val defaultModel: String = "",
    val prompts: List<Prompt> = defaultPrompts(),
    val chats: List<Chat> = emptyList(),
    val activeChatId: String? = null,
    val stream: Boolean = true,
    val enterToSend: Boolean = true,
    val autoTitle: Boolean = true,
)

fun nid(): String = UUID.randomUUID().toString()

fun defaultPrompts() = listOf(
    Prompt("p-brief", "Разобрать", "Разбери это спокойно и по делу: суть, допущения, риски и один следующий шаг."),
    Prompt("p-code", "Код", "Напиши решение кодом. Кратко объясни подход и покрой граничные случаи."),
    Prompt("p-tight", "Сжать", "Сожми текст примерно вдвое. Сохрани факты и тон, ничего не выдумывай."),
    Prompt("p-ru", "Перевод", "Переведи на русский естественно, без канцелярита. Имена и код не трогай."),
    Prompt("p-edit", "Редактор", "Отредактируй текст: яснее, короче, без воды. Покажи только итоговый вариант."),
    Prompt("p-plan", "План", "Составь короткий план. У каждого шага — результат, который можно проверить."),
)

data class Preset(val name: String, val baseUrl: String, val model: String, val keyOptional: Boolean = false)

val PRESETS = listOf(
    Preset("OpenAI", "https://api.openai.com/v1", "gpt-4o-mini"),
    Preset("OpenRouter", "https://openrouter.ai/api/v1", "openai/gpt-4o-mini"),
    Preset("Groq", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile"),
    Preset("DeepSeek", "https://api.deepseek.com/v1", "deepseek-chat"),
    Preset("Mistral", "https://api.mistral.ai/v1", "mistral-small-latest"),
    Preset("Together", "https://api.together.xyz/v1", "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"),
    Preset("Fireworks", "https://api.fireworks.ai/inference/v1", "accounts/fireworks/models/llama-v3p1-8b-instruct"),
    Preset("xAI", "https://api.x.ai/v1", "grok-3"),
    Preset("Ollama", "http://10.0.2.2:11434/v1", "llama3.2", true),
    Preset("LM Studio", "http://10.0.2.2:1234/v1", "local-model", true),
)

fun AppData.withChat(id: String, block: (Chat) -> Chat) = copy(
    chats = chats.map { if (it.id == id) block(it.copy(updatedAt = System.currentTimeMillis())) else it },
)

fun endpoint(baseUrl: String, kind: String): String {
    val clean = baseUrl.trim().trimEnd('/')
    val leaf = if (kind == "chat") "chat/completions" else "models"
    if (kind == "chat" && clean.endsWith("/chat/completions")) return clean
    if (kind == "models" && clean.endsWith("/models")) return clean
    if (Regex("/v\\d+$").containsMatchIn(clean)) return "$clean/$leaf"
    return "$clean/v1/$leaf"
}

private fun JSONObject.s(key: String, fallback: String = ""): String =
    if (!has(key) || isNull(key)) fallback else optString(key, fallback)

private fun JSONObject.bool(key: String, fallback: Boolean = false): Boolean =
    if (!has(key) || isNull(key)) fallback else optBoolean(key, fallback)

private fun JSONObject.dbl(key: String, fallback: Double): Double =
    if (!has(key) || isNull(key)) fallback else optDouble(key, fallback)

private fun JSONObject.lng(key: String, fallback: Long): Long =
    if (!has(key) || isNull(key)) fallback else optLong(key, fallback)

private fun samplingFrom(obj: JSONObject?): Sampling {
    if (obj == null) return Sampling()
    val cap = if (!obj.has("maxTokens") || obj.isNull("maxTokens")) null else obj.optInt("maxTokens")
    return Sampling(
        temperature = obj.dbl("temperature", 0.7),
        topP = obj.dbl("topP", 1.0),
        maxTokens = cap?.takeIf { it > 0 },
        presencePenalty = obj.dbl("presencePenalty", 0.0),
        frequencyPenalty = obj.dbl("frequencyPenalty", 0.0),
    )
}

private fun Sampling.toJson() = JSONObject()
    .put("temperature", temperature)
    .put("topP", topP)
    .put("maxTokens", maxTokens ?: JSONObject.NULL)
    .put("presencePenalty", presencePenalty)
    .put("frequencyPenalty", frequencyPenalty)

fun parseBackup(raw: String): AppData? {
    val root = try {
        JSONObject(raw)
    } catch (_: Exception) {
        return null
    }
    if (root.optInt("v") != 1 || root.optString("app") != "vellum") return null
    val providers = mutableListOf<Provider>()
    val providerArr = root.optJSONArray("providers") ?: JSONArray()
    for (i in 0 until providerArr.length()) {
        val item = providerArr.optJSONObject(i) ?: continue
        val base = item.s("baseUrl")
        val name = item.s("name")
        if (base.isBlank() || name.isBlank()) continue
        providers += Provider(
            id = item.s("id").ifBlank { nid() },
            name = name,
            baseUrl = base,
            apiKey = item.s("apiKey"),
            keyOptional = item.bool("keyOptional"),
            direct = item.bool("direct"),
            minimal = item.bool("minimal"),
        )
    }
    val chats = mutableListOf<Chat>()
    val chatArr = root.optJSONArray("chats") ?: JSONArray()
    for (i in 0 until chatArr.length()) {
        val item = chatArr.optJSONObject(i) ?: continue
        val messages = mutableListOf<Msg>()
        val msgArr = item.optJSONArray("messages") ?: JSONArray()
        for (j in 0 until msgArr.length()) {
            val message = msgArr.optJSONObject(j) ?: continue
            val role = message.s("role")
            if (role != "user" && role != "assistant") continue
            val variants = mutableListOf<Variant>()
            val varArr = message.optJSONArray("variants") ?: JSONArray()
            for (k in 0 until varArr.length()) {
                val variant = varArr.optJSONObject(k) ?: continue
                variants += Variant(
                    content = variant.s("content"),
                    reasoning = variant.s("reasoning"),
                    model = variant.s("model"),
                    error = if (variant.isNull("error")) null else variant.optString("error").ifBlank { null },
                    stopped = variant.bool("stopped"),
                )
            }
            val attachments = mutableListOf<Attachment>()
            val att = message.optJSONArray("attachments") ?: JSONArray()
            for (k in 0 until att.length()) {
                val file = att.optJSONObject(k) ?: continue
                attachments += Attachment(
                    id = file.s("id").ifBlank { nid() },
                    name = file.s("name", "file"),
                    kind = file.s("kind", "file"),
                    mime = file.s("mime"),
                    dataUrl = if (file.isNull("dataUrl")) null else file.optString("dataUrl").ifBlank { null },
                    text = if (file.isNull("text")) null else file.optString("text").ifBlank { null },
                )
            }
            messages += Msg(
                id = message.s("id").ifBlank { nid() },
                role = role,
                content = message.s("content"),
                attachments = attachments,
                createdAt = message.lng("createdAt", System.currentTimeMillis()),
                variants = variants,
                variant = message.optInt("variant", 0).coerceAtLeast(0),
            )
        }
        chats += Chat(
            id = item.s("id").ifBlank { nid() },
            title = item.s("title", "Новый чат"),
            pinned = item.bool("pinned"),
            archived = item.bool("archived"),
            providerId = item.s("providerId"),
            model = item.s("model"),
            instruction = item.s("instruction"),
            sampling = samplingFrom(item.optJSONObject("sampling")),
            messages = messages,
            createdAt = item.lng("createdAt", System.currentTimeMillis()),
            updatedAt = item.lng("updatedAt", System.currentTimeMillis()),
            titled = item.bool("titled"),
        )
    }
    val prompts = mutableListOf<Prompt>()
    val promptArr = root.optJSONArray("prompts") ?: JSONArray()
    for (i in 0 until promptArr.length()) {
        val item = promptArr.optJSONObject(i) ?: continue
        val title = item.s("title")
        val body = item.s("body")
        if (title.isBlank() || body.isBlank()) continue
        prompts += Prompt(item.s("id").ifBlank { nid() }, title, body)
    }
    return AppData(
        theme = if (root.optString("theme") == "frost") "frost" else "ink",
        instructions = root.s("instructions"),
        memory = root.s("memory"),
        sampling = samplingFrom(root.optJSONObject("sampling")),
        providers = providers,
        activeProviderId = root.s("activeProviderId").ifBlank { providers.firstOrNull()?.id ?: "" },
        defaultModel = root.s("defaultModel"),
        prompts = prompts.ifEmpty { defaultPrompts() },
        chats = chats,
        activeChatId = chats.firstOrNull { !it.archived }?.id,
        stream = root.bool("stream", true),
        enterToSend = root.bool("enterToSend", true),
        autoTitle = root.bool("autoTitle", true),
    )
}

fun titleFrom(text: String): String {
    val clean = text.replace(Regex("\\s+"), " ").trim()
    if (clean.isEmpty()) return "Новый чат"
    return if (clean.length > 42) clean.take(42).trimEnd() + "…" else clean
}

fun AppData.toBackup(keepMedia: Boolean = true): String {
    val root = JSONObject()
    root.put("v", 1)
    root.put("app", "vellum")
    root.put("theme", theme)
    root.put("instructions", instructions)
    root.put("memory", memory)
    root.put("sampling", sampling.toJson())
    root.put("activeProviderId", activeProviderId)
    root.put("defaultModel", defaultModel)
    root.put("stream", stream)
    root.put("enterToSend", enterToSend)
    root.put("autoTitle", autoTitle)
    root.put("providers", JSONArray().apply {
        providers.forEach {
            put(
                JSONObject()
                    .put("id", it.id)
                    .put("name", it.name)
                    .put("baseUrl", it.baseUrl)
                    .put("apiKey", it.apiKey)
                    .put("keyOptional", it.keyOptional)
                    .put("direct", it.direct)
                    .put("minimal", it.minimal),
            )
        }
    })
    root.put("prompts", JSONArray().apply {
        prompts.forEach { put(JSONObject().put("id", it.id).put("title", it.title).put("body", it.body)) }
    })
    root.put("chats", JSONArray().apply {
        chats.filter { !it.incognito }.forEach { chat ->
            put(
                JSONObject()
                    .put("id", chat.id)
                    .put("title", chat.title)
                    .put("pinned", chat.pinned)
                    .put("archived", chat.archived)
                    .put("incognito", false)
                    .put("providerId", chat.providerId)
                    .put("model", chat.model)
                    .put("instruction", chat.instruction)
                    .put("sampling", chat.sampling.toJson())
                    .put("createdAt", chat.createdAt)
                    .put("updatedAt", chat.updatedAt)
                    .put("titled", chat.titled)
                    .put("messages", JSONArray().apply {
                        chat.messages.forEach { message ->
                            put(
                                JSONObject()
                                    .put("id", message.id)
                                    .put("role", message.role)
                                    .put("content", message.content)
                                    .put("createdAt", message.createdAt)
                                    .put("variant", message.variant)
                                    .put("variants", JSONArray().apply {
                                        message.variants.forEach { variant ->
                                            put(
                                                JSONObject()
                                                    .put("content", variant.content)
                                                    .put("reasoning", variant.reasoning)
                                                    .put("model", variant.model)
                                                    .put("error", variant.error ?: JSONObject.NULL)
                                                    .put("stopped", variant.stopped),
                                            )
                                        }
                                    })
                                    .put("attachments", JSONArray().apply {
                                        message.attachments.forEach { file ->
                                            put(
                                                JSONObject()
                                                    .put("id", file.id)
                                                    .put("name", file.name)
                                                    .put("kind", file.kind)
                                                    .put("mime", file.mime)
                                                    .put("dataUrl", if (!keepMedia || file.dataUrl.isNullOrBlank()) JSONObject.NULL else file.dataUrl)
                                                    .put("text", file.text ?: JSONObject.NULL),
                                            )
                                        }
                                    }),
                            )
                        }
                    }),
            )
        }
    })
    return root.toString()
}

fun chatMarkdown(chat: Chat): String {
    val lines = mutableListOf("# ${chat.title}", "")
    for (message in chat.messages) {
        if (message.role == "user") {
            lines += "## Вы"
            lines += ""
            lines += message.content.ifBlank { "(вложение)" }
            lines += ""
        } else {
            val variant = message.variants.getOrNull(message.variant)
            lines += "## Ответ"
            lines += ""
            lines += variant?.content ?: variant?.error ?: ""
            lines += ""
        }
    }
    return lines.joinToString("\n")
}
