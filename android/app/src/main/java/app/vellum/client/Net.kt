package app.vellum.client

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class OpenAi {
    private val http = OkHttpClient.Builder()
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()

    private val short = http.newBuilder().readTimeout(45, TimeUnit.SECONDS).callTimeout(45, TimeUnit.SECONDS).build()

    fun models(baseUrl: String, apiKey: String): List<String> {
        val request = Request.Builder().url(endpoint(baseUrl, "models")).get().applyAuth(apiKey).build()
        short.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error(errorText(text, response.code))
            val data = JSONObject(text).optJSONArray("data") ?: JSONArray()
            return buildList {
                for (i in 0 until data.length()) {
                    val id = data.optJSONObject(i)?.optString("id").orEmpty()
                    if (id.isNotBlank()) add(id)
                }
            }
        }
    }

    fun complete(baseUrl: String, apiKey: String, payload: JSONObject): String {
        val request = Request.Builder()
            .url(endpoint(baseUrl, "chat"))
            .post(payload.toString().toRequestBody(JSON))
            .applyAuth(apiKey)
            .build()
        short.newCall(request).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (!response.isSuccessful) error(errorText(text, response.code))
            return messageText(text)
        }
    }

    fun stream(
        baseUrl: String,
        apiKey: String,
        payload: JSONObject,
        onDelta: (content: String, reasoning: String) -> Unit,
        onDone: () -> Unit,
        onError: (String) -> Unit,
    ): okhttp3.Call {
        val request = Request.Builder()
            .url(endpoint(baseUrl, "chat"))
            .header("Accept", "text/event-stream, application/json")
            .post(payload.toString().toRequestBody(JSON))
            .applyAuth(apiKey)
            .build()
        val call = http.newCall(request)
        call.enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                if (call.isCanceled()) onDone() else onError(e.message ?: "Сеть недоступна")
            }

            override fun onResponse(call: okhttp3.Call, response: okhttp3.Response) {
                response.use { resp ->
                    try {
                        if (!resp.isSuccessful) {
                            onError(errorText(resp.body?.string().orEmpty(), resp.code))
                            return
                        }
                        val type = resp.header("content-type").orEmpty()
                        val body = resp.body ?: run {
                            onError("Пустой ответ")
                            return
                        }
                        if (type.contains("application/json") && !type.contains("event-stream")) {
                            val parsed = readChoice(JSONObject(body.string()))
                            onDelta(parsed.first, parsed.second)
                            onDone()
                            return
                        }
                        val source = body.source()
                        var content = ""
                        var reasoning = ""
                        while (!source.exhausted()) {
                            val line = source.readUtf8Line() ?: break
                            if (!line.startsWith("data:")) continue
                            val data = line.removePrefix("data:").trim()
                            if (data.isEmpty()) continue
                            if (data == "[DONE]") break
                            val json = try {
                                JSONObject(data)
                            } catch (_: Exception) {
                                continue
                            }
                            if (json.has("error") && !json.isNull("error")) {
                                onError(json.get("error").toString().take(500))
                                return
                            }
                            val choice = json.optJSONArray("choices")?.optJSONObject(0) ?: continue
                            val delta = choice.optJSONObject("delta") ?: choice.optJSONObject("message") ?: continue
                            val bit = delta.optString("content")
                            val thought = delta.optString("reasoning_content").ifBlank { delta.optString("reasoning") }
                            if (bit.isEmpty() && thought.isEmpty()) continue
                            content += bit
                            reasoning += thought
                            onDelta(content, reasoning)
                        }
                        onDone()
                    } catch (error: Exception) {
                        if (!call.isCanceled()) onError(error.message ?: "Сбой чтения ответа")
                    }
                }
            }
        })
        return call
    }

    companion object {
        private val JSON = "application/json; charset=utf-8".toMediaType()

        private fun Request.Builder.applyAuth(apiKey: String): Request.Builder {
            if (apiKey.isNotBlank()) header("Authorization", "Bearer ${apiKey.trim()}")
            header("X-Title", "Vellum")
            return this
        }

        fun errorText(body: String, code: Int): String {
            try {
                val json = JSONObject(body)
                val err = json.opt("error")
                if (err is String && err.isNotBlank()) return err.take(500)
                if (err is JSONObject) {
                    val message = err.optString("message")
                    if (message.isNotBlank()) return message.take(500)
                }
                val message = json.optString("message")
                if (message.isNotBlank()) return message.take(500)
            } catch (_: Exception) {
                /* plain text */
            }
            val plain = body.replace(Regex("\\s+"), " ").trim()
            return if (plain.isNotBlank()) plain.take(500) else "Провайдер ответил $code"
        }

        private fun messageText(raw: String): String {
            val (content, _) = readChoice(JSONObject(raw))
            return content
        }

        private fun readChoice(json: JSONObject): Pair<String, String> {
            val choice = json.optJSONArray("choices")?.optJSONObject(0)
            val message = choice?.optJSONObject("message") ?: choice?.optJSONObject("delta")
            val content = message?.optString("content").orEmpty()
            val reasoning = message?.optString("reasoning_content").orEmpty().ifBlank { message?.optString("reasoning").orEmpty() }
            return content to reasoning
        }
    }
}

fun userContent(message: Msg): Any {
    val images = message.attachments.filter { it.kind == "image" && !it.dataUrl.isNullOrBlank() }
    val files = message.attachments.filter { it.kind == "file" && !it.text.isNullOrBlank() }
    var text = message.content
    if (files.isNotEmpty()) {
        val block = files.joinToString("\n\n") { "--- ${it.name} ---\n${it.text}" }
        text = if (text.isBlank()) block else "$text\n\n$block"
    }
    if (images.isEmpty()) return text
    val parts = JSONArray()
    if (text.isNotBlank()) parts.put(JSONObject().put("type", "text").put("text", text))
    images.forEach { image ->
        parts.put(
            JSONObject()
                .put("type", "image_url")
                .put("image_url", JSONObject().put("url", image.dataUrl)),
        )
    }
    return parts
}
