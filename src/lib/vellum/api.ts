import { endpoint, friendlyHttpError, prefersDirect } from "@/lib/vellum/urls";
import { uid, type Attachment } from "@/lib/vellum/types";

export type Delta = { content: string; reasoning: string };

function takeDelta(json: {
  choices?: { delta?: Record<string, unknown>; message?: Record<string, unknown> }[];
  error?: { message?: string } | string;
}): { content: string; reasoning: string; error?: string } {
  if (json.error) {
    const message = typeof json.error === "string" ? json.error : json.error.message;
    return { content: "", reasoning: "", error: message || "Ошибка провайдера" };
  }
  const choice = json.choices?.[0];
  const delta = choice?.delta ?? choice?.message ?? {};
  const content = typeof delta.content === "string" ? delta.content : "";
  const reasoningRaw = delta.reasoning_content ?? delta.reasoning;
  const reasoning = typeof reasoningRaw === "string" ? reasoningRaw : "";
  return { content, reasoning };
}

async function readError(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { error?: string };
    if (typeof data.error === "string" && data.error) return data.error;
  } catch {
    /* upstream body */
  }
  return friendlyHttpError(response.status, text);
}

export async function streamCompletion(opts: {
  baseUrl: string;
  apiKey: string;
  direct: boolean;
  payload: Record<string, unknown>;
  signal: AbortSignal;
  onDelta: (content: string, reasoning: string) => void;
}): Promise<Delta> {
  const direct = opts.direct || prefersDirect(opts.baseUrl);
  let response: Response;
  try {
    response = direct
      ? await fetch(endpoint(opts.baseUrl, "chat"), {
          method: "POST",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream, application/json",
            ...(opts.apiKey.trim() ? { authorization: `Bearer ${opts.apiKey.trim()}` } : {}),
          },
          body: JSON.stringify(opts.payload),
          signal: opts.signal,
        })
      : await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUrl: opts.baseUrl, apiKey: opts.apiKey, payload: opts.payload }),
          signal: opts.signal,
        });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    if (direct) {
      throw new Error(
        "Браузер не пустил прямой запрос. Выключите «Прямой доступ» или разрешите CORS на сервере. Локальный Ollama из чужого сайта не откроется — для него есть Android-сборка.",
      );
    }
    throw new Error("Сеть недоступна");
  }
  if (!response.ok) throw new Error(await readError(response));
  const type = response.headers.get("content-type") ?? "";
  if (type.includes("application/json") && !type.includes("text/event-stream")) {
    const json = (await response.json()) as Parameters<typeof takeDelta>[0];
    const parsed = takeDelta(json);
    if (parsed.error) throw new Error(parsed.error);
    opts.onDelta(parsed.content, parsed.reasoning);
    return parsed;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Пустой ответ");
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoning = "";
  const consume = (line: string) => {
    const trimmed = line.replace(/\r$/, "");
    if (!trimmed.startsWith("data:")) return;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") return;
    let json: Parameters<typeof takeDelta>[0];
    try {
      json = JSON.parse(data) as Parameters<typeof takeDelta>[0];
    } catch {
      return;
    }
    const parsed = takeDelta(json);
    if (parsed.error) throw new Error(parsed.error);
    if (!parsed.content && !parsed.reasoning) return;
    content += parsed.content;
    reasoning += parsed.reasoning;
    opts.onDelta(content, reasoning);
  };
  while (true) {
    const step = await reader.read();
    if (step.done) break;
    buffer += decoder.decode(step.value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  if (buffer.trim()) consume(buffer);
  return { content, reasoning };
}

export async function fetchModels(baseUrl: string, apiKey: string, direct: boolean): Promise<string[]> {
  const useDirect = direct || prefersDirect(baseUrl);
  let response: Response;
  try {
    response = useDirect
      ? await fetch(endpoint(baseUrl, "models"), {
          headers: apiKey.trim() ? { authorization: `Bearer ${apiKey.trim()}` } : {},
        })
      : await fetch("/api/ai/models", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUrl, apiKey }),
        });
  } catch {
    if (useDirect) {
      throw new Error("Прямой запрос к списку моделей заблокирован браузером (CORS).");
    }
    throw new Error("Сеть недоступна");
  }
  if (!response.ok) throw new Error(await readError(response));
  const data = (await response.json()) as { models?: string[]; data?: { id?: string }[]; error?: string };
  if (typeof data.error === "string" && data.error) throw new Error(data.error);
  if (Array.isArray(data.models)) return data.models;
  if (Array.isArray(data.data)) {
    return data.data.map((item) => item.id ?? "").filter(Boolean);
  }
  return [];
}

export async function fileToAttachment(file: File): Promise<Attachment> {
  if (file.type.startsWith("image/")) {
    const dataUrl = await compressImage(file);
    return { id: uid(), name: file.name || "image", kind: "image", mime: "image/jpeg", dataUrl };
  }
  const text = (await file.text()).slice(0, 80_000);
  return {
    id: uid(),
    name: file.name || "file",
    kind: "file",
    mime: file.type || "text/plain",
    text,
  };
}

function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const max = 1280;
      const scale = Math.min(1, max / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Не удалось прочитать изображение"));
        return;
      }
      ctx.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Не удалось прочитать изображение"));
    };
    image.src = url;
  });
}

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function speak(text: string) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    throw new Error("Озвучка недоступна в этом браузере");
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 4000));
  utterance.lang = /[А-яЁё]/.test(text) ? "ru-RU" : "en-US";
  window.speechSynthesis.speak(utterance);
}
