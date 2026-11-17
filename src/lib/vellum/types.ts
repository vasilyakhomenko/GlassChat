export type Panel = null | "settings" | "library" | "build" | "params" | "model";

export type Sampling = {
  temperature: number;
  topP: number;
  maxTokens: number | null;
  presencePenalty: number;
  frequencyPenalty: number;
};

export type Provider = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  keyOptional: boolean;
  direct: boolean;
  minimal: boolean;
};

export type Attachment = {
  id: string;
  name: string;
  kind: "image" | "file";
  mime: string;
  dataUrl?: string;
  text?: string;
};

export type Variant = {
  content: string;
  reasoning: string;
  model: string;
  error?: string;
  stopped?: boolean;
};

export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: Attachment[];
  createdAt: number;
  variants: Variant[];
  variant: number;
  pending?: boolean;
};

export type Chat = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  incognito: boolean;
  providerId: string;
  model: string;
  instruction: string;
  sampling: Sampling;
  messages: Msg[];
  createdAt: number;
  updatedAt: number;
  titled: boolean;
};

export type Prompt = { id: string; title: string; body: string };

export type Preset = {
  name: string;
  baseUrl: string;
  model: string;
  keyOptional?: boolean;
};

export type ApiPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ApiMessage = {
  role: "system" | "user" | "assistant";
  content: string | ApiPart[];
};

export const DEFAULT_SAMPLING: Sampling = {
  temperature: 0.7,
  topP: 1,
  maxTokens: null,
  presencePenalty: 0,
  frequencyPenalty: 0,
};

export const PRESETS: Preset[] = [
  { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openai/gpt-4o-mini" },
  { name: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  { name: "Mistral", baseUrl: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  {
    name: "Together",
    baseUrl: "https://api.together.xyz/v1",
    model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
  },
  {
    name: "Fireworks",
    baseUrl: "https://api.fireworks.ai/inference/v1",
    model: "accounts/fireworks/models/llama-v3p1-8b-instruct",
  },
  { name: "xAI", baseUrl: "https://api.x.ai/v1", model: "grok-3" },
  { name: "Ollama", baseUrl: "http://127.0.0.1:11434/v1", model: "llama3.2", keyOptional: true },
  { name: "LM Studio", baseUrl: "http://127.0.0.1:1234/v1", model: "local-model", keyOptional: true },
];

export const DEFAULT_PROMPTS: Prompt[] = [
  {
    id: "p-brief",
    title: "Разобрать",
    body: "Разбери это спокойно и по делу: суть, допущения, риски и один следующий шаг.",
  },
  {
    id: "p-code",
    title: "Код",
    body: "Напиши решение кодом. Кратко объясни подход и покрой граничные случаи.",
  },
  {
    id: "p-tight",
    title: "Сжать",
    body: "Сожми текст примерно вдвое. Сохрани факты и тон, ничего не выдумывай.",
  },
  {
    id: "p-ru",
    title: "Перевод",
    body: "Переведи на русский естественно, без канцелярита. Имена и код не трогай.",
  },
  {
    id: "p-edit",
    title: "Редактор",
    body: "Отредактируй текст: яснее, короче, без воды. Покажи только итоговый вариант.",
  },
  {
    id: "p-plan",
    title: "План",
    body: "Составь короткий план. У каждого шага — результат, который можно проверить.",
  },
];

export const MOODS = [
  { id: "precise", label: "Точный", temperature: 0.2, topP: 0.9 },
  { id: "balanced", label: "Баланс", temperature: 0.7, topP: 1 },
  { id: "free", label: "Свободный", temperature: 1.15, topP: 1 },
] as const;

export function uid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function cloneSampling(s: Sampling): Sampling {
  return { ...s };
}

export function titleFrom(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "Новый чат";
  return clean.length > 42 ? `${clean.slice(0, 42).trimEnd()}…` : clean;
}

export function currentVariant(message: Msg): Variant | undefined {
  return message.variants[message.variant] ?? message.variants[message.variants.length - 1];
}

export function assistantText(message: Msg): string {
  return currentVariant(message)?.content ?? "";
}

export function approxTokens(chats: Chat[], instructions: string, memory: string): number {
  let chars = instructions.length + memory.length;
  for (const chat of chats) {
    chars += chat.instruction.length;
    for (const message of chat.messages) {
      chars += message.content.length;
      for (const attachment of message.attachments) chars += (attachment.text ?? "").length;
      for (const variant of message.variants) chars += variant.content.length + variant.reasoning.length;
    }
  }
  return Math.max(1, Math.round(chars / 4));
}

export function chatTokens(chat: Chat | null, instructions: string, memory: string): number {
  if (!chat) return Math.round((instructions.length + memory.length) / 4);
  return approxTokens([chat], instructions, memory);
}

export function systemText(instructions: string, memory: string, chatInstruction: string): string {
  const parts = [
    instructions.trim(),
    memory.trim() ? `Память о пользователе:\n${memory.trim()}` : "",
    chatInstruction.trim() ? `Инструкция этого чата:\n${chatInstruction.trim()}` : "",
  ].filter(Boolean);
  return parts.join("\n\n");
}

export function userContent(message: Msg): ApiMessage["content"] {
  const files = message.attachments.filter((item) => item.kind === "file" && item.text);
  const images = message.attachments.filter((item) => item.kind === "image" && item.dataUrl);
  let text = message.content;
  if (files.length) {
    const block = files.map((file) => `--- ${file.name} ---\n${file.text}`).join("\n\n");
    text = text.trim() ? `${text}\n\n${block}` : block;
  }
  if (!images.length) return text;
  const parts: ApiPart[] = [];
  if (text.trim()) parts.push({ type: "text", text });
  for (const image of images) {
    parts.push({ type: "image_url", image_url: { url: image.dataUrl! } });
  }
  return parts;
}

export function toApiMessages(
  messages: Msg[],
  instructions: string,
  memory: string,
  chatInstruction: string,
  skipId?: string,
): ApiMessage[] {
  const out: ApiMessage[] = [];
  const system = systemText(instructions, memory, chatInstruction);
  if (system) out.push({ role: "system", content: system });
  for (const message of messages) {
    if (message.id === skipId) continue;
    if (message.role === "user") {
      const content = userContent(message);
      if (typeof content === "string" && !content.trim()) continue;
      out.push({ role: "user", content });
      continue;
    }
    const text = assistantText(message);
    if (!text.trim()) continue;
    out.push({ role: "assistant", content: text });
  }
  return out;
}

export function buildPayload(opts: {
  model: string;
  messages: ApiMessage[];
  sampling: Sampling;
  stream: boolean;
  minimal: boolean;
  maxTokens?: number | null;
}): Record<string, unknown> {
  if (opts.minimal) {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: opts.messages,
      stream: opts.stream,
    };
    const cap = opts.maxTokens ?? null;
    if (cap && cap > 0) body.max_tokens = cap;
    return body;
  }
  const body: Record<string, unknown> = {
    model: opts.model,
    messages: opts.messages,
    stream: opts.stream,
    temperature: opts.sampling.temperature,
    top_p: opts.sampling.topP,
    presence_penalty: opts.sampling.presencePenalty,
    frequency_penalty: opts.sampling.frequencyPenalty,
  };
  if (opts.sampling.maxTokens && opts.sampling.maxTokens > 0) body.max_tokens = opts.sampling.maxTokens;
  return body;
}

export type Backup = {
  v: 1;
  app: "vellum";
  exportedAt?: string;
  theme: "ink" | "frost";
  instructions: string;
  memory: string;
  sampling: Sampling;
  providers: Provider[];
  activeProviderId: string;
  defaultModel: string;
  prompts: Prompt[];
  chats: Chat[];
  stream: boolean;
  enterToSend: boolean;
  autoTitle: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function samplingOf(value: unknown): Sampling {
  if (!isRecord(value)) return cloneSampling(DEFAULT_SAMPLING);
  const maxTokens = value.maxTokens;
  return {
    temperature: num(value.temperature, 0.7),
    topP: num(value.topP, 1),
    maxTokens: typeof maxTokens === "number" && maxTokens > 0 ? Math.round(maxTokens) : null,
    presencePenalty: num(value.presencePenalty, 0),
    frequencyPenalty: num(value.frequencyPenalty, 0),
  };
}

export function parseBackup(raw: string): Backup | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || data.app !== "vellum" || data.v !== 1) return null;
  if (!Array.isArray(data.providers) || !Array.isArray(data.chats)) return null;
  const providers: Provider[] = [];
  for (const item of data.providers) {
    if (!isRecord(item) || typeof item.baseUrl !== "string" || typeof item.name !== "string") continue;
    providers.push({
      id: typeof item.id === "string" && item.id ? item.id : uid(),
      name: item.name,
      baseUrl: item.baseUrl,
      apiKey: typeof item.apiKey === "string" ? item.apiKey : "",
      keyOptional: item.keyOptional === true,
      direct: item.direct === true,
      minimal: item.minimal === true,
    });
  }
  const chats: Chat[] = [];
  for (const item of data.chats) {
    if (!isRecord(item) || !Array.isArray(item.messages)) continue;
    const messages: Msg[] = [];
    for (const message of item.messages) {
      if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) continue;
      const variants: Variant[] = [];
      if (Array.isArray(message.variants)) {
        for (const variant of message.variants) {
          if (!isRecord(variant)) continue;
          variants.push({
            content: typeof variant.content === "string" ? variant.content : "",
            reasoning: typeof variant.reasoning === "string" ? variant.reasoning : "",
            model: typeof variant.model === "string" ? variant.model : "",
            error: typeof variant.error === "string" ? variant.error : undefined,
            stopped: variant.stopped === true,
          });
        }
      }
      messages.push({
        id: typeof message.id === "string" ? message.id : uid(),
        role: message.role,
        content: typeof message.content === "string" ? message.content : "",
        attachments: [],
        createdAt: num(message.createdAt, Date.now()),
        variants,
        variant: Math.max(0, Math.round(num(message.variant, 0))),
        pending: false,
      });
    }
    chats.push({
      id: typeof item.id === "string" && item.id ? item.id : uid(),
      title: typeof item.title === "string" && item.title ? item.title : "Новый чат",
      pinned: item.pinned === true,
      archived: item.archived === true,
      incognito: false,
      providerId: typeof item.providerId === "string" ? item.providerId : "",
      model: typeof item.model === "string" ? item.model : "",
      instruction: typeof item.instruction === "string" ? item.instruction : "",
      sampling: samplingOf(item.sampling),
      messages,
      createdAt: num(item.createdAt, Date.now()),
      updatedAt: num(item.updatedAt, Date.now()),
      titled: item.titled === true,
    });
  }
  const prompts: Prompt[] = [];
  if (Array.isArray(data.prompts)) {
    for (const item of data.prompts) {
      if (!isRecord(item) || typeof item.title !== "string" || typeof item.body !== "string") continue;
      prompts.push({
        id: typeof item.id === "string" && item.id ? item.id : uid(),
        title: item.title,
        body: item.body,
      });
    }
  }
  const theme = data.theme === "frost" ? "frost" : "ink";
  return {
    v: 1,
    app: "vellum",
    theme,
    instructions: typeof data.instructions === "string" ? data.instructions : "",
    memory: typeof data.memory === "string" ? data.memory : "",
    sampling: samplingOf(data.sampling),
    providers,
    activeProviderId: typeof data.activeProviderId === "string" ? data.activeProviderId : (providers[0]?.id ?? ""),
    defaultModel: typeof data.defaultModel === "string" ? data.defaultModel : "",
    prompts: prompts.length ? prompts : DEFAULT_PROMPTS.map((item) => ({ ...item })),
    chats,
    stream: data.stream !== false,
    enterToSend: data.enterToSend !== false,
    autoTitle: data.autoTitle !== false,
  };
}

export function chatMarkdown(chat: Chat): string {
  const lines = [`# ${chat.title}`, ""];
  for (const message of chat.messages) {
    if (message.role === "user") {
      lines.push("## Вы", "", message.content || "(вложение)", "");
    } else {
      const variant = currentVariant(message);
      lines.push(`## Ответ${variant?.model ? ` · ${variant.model}` : ""}`, "");
      if (variant?.reasoning) lines.push("<details><summary>ход мысли</summary>", "", variant.reasoning, "", "</details>", "");
      lines.push(variant?.content || variant?.error || "", "");
    }
  }
  return lines.join("\n");
}
