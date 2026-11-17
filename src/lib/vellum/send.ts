import { fetchModels, streamCompletion } from "@/lib/vellum/api";
import { flushStore, useVellum } from "@/lib/vellum/store";
import {
  buildPayload,
  titleFrom,
  toApiMessages,
  uid,
  type Provider,
} from "@/lib/vellum/types";

const aborters = new Map<string, AbortController>();

export function stopGeneration(chatId: string) {
  aborters.get(chatId)?.abort();
}

export function isGenerating(chatId: string) {
  return aborters.has(chatId);
}

function providerFor(providerId: string): Provider | undefined {
  const state = useVellum.getState();
  return (
    state.providers.find((item) => item.id === providerId) ??
    state.providers.find((item) => item.id === state.activeProviderId)
  );
}

function ensureReady(chatId: string): { provider: Provider; model: string } | null {
  const state = useVellum.getState();
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return null;
  const provider = providerFor(chat.providerId);
  if (!provider) {
    state.setPanel("settings");
    state.toastMsg("Добавьте провайдера — адрес API и ключ");
    return null;
  }
  if (!provider.apiKey.trim() && !provider.keyOptional) {
    state.setPanel("settings");
    state.toastMsg("Вставьте API-ключ. На сервере он не хранится.");
    return null;
  }
  const model = chat.model.trim() || state.defaultModel.trim();
  if (!model) {
    state.setPanel("model");
    state.toastMsg("Укажите id модели, например gpt-4o-mini");
    return null;
  }
  if (chat.providerId !== provider.id) state.setChatProvider(chatId, provider.id);
  if (chat.model.trim() !== model) state.setChatModel(chatId, model);
  if (chat.archived) state.setArchived(chatId, false);
  return { provider, model };
}

async function run(chatId: string, assistantId: string, provider: Provider, variantIndex: number) {
  const state = useVellum.getState();
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return "error" as const;
  const messages = toApiMessages(chat.messages, state.instructions, state.memory, chat.instruction, assistantId);
  const controller = new AbortController();
  aborters.set(chatId, controller);
  state.setPendingFlag(chatId, assistantId, true);
  try {
    await streamCompletion({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      direct: provider.direct,
      payload: buildPayload({
        model: chat.model || state.defaultModel,
        messages,
        sampling: chat.sampling,
        stream: state.stream,
        minimal: provider.minimal,
      }),
      signal: controller.signal,
      onDelta: (content, reasoning) => {
        useVellum.getState().writeVariant(chatId, assistantId, variantIndex, { content, reasoning });
      },
    });
    useVellum.getState().setPendingFlag(chatId, assistantId, false);
    return "ok" as const;
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
    const api = useVellum.getState();
    if (aborted) api.writeVariant(chatId, assistantId, variantIndex, { stopped: true });
    else {
      const message = error instanceof Error ? error.message : "Ошибка запроса";
      api.writeVariant(chatId, assistantId, variantIndex, { error: message });
      api.toastMsg(message);
    }
    api.setPendingFlag(chatId, assistantId, false);
    return aborted ? ("abort" as const) : ("error" as const);
  } finally {
    aborters.delete(chatId);
    flushStore();
  }
}

function cleanTitle(raw: string): string | null {
  const line = raw
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);
  if (!line) return null;
  const title = line.replace(/^["«]+|["»".!]+$/g, "").trim();
  if (title.length < 2 || title.length > 72) return null;
  return title;
}

async function maybeTitle(chatId: string, provider: Provider) {
  const state = useVellum.getState();
  if (!state.autoTitle) return;
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat || chat.titled) return;
  const first = chat.messages.find((message) => message.role === "user");
  if (!first?.content.trim()) return;
  const local = titleFrom(first.content);
  if (chat.title !== "Новый чат" && chat.title !== local && chat.title !== first.content.trim().slice(0, 42)) return;
  state.markTitled(chatId);
  try {
    const result = await streamCompletion({
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      direct: provider.direct,
      signal: AbortSignal.timeout(20_000),
      payload: buildPayload({
        model: chat.model || state.defaultModel,
        messages: [
          {
            role: "system",
            content: "Название чата: 3–6 слов, язык пользователя, без кавычек и точки. Только название.",
          },
          { role: "user", content: first.content.slice(0, 600) },
        ],
        sampling: { temperature: 0.3, topP: 1, maxTokens: 24, presencePenalty: 0, frequencyPenalty: 0 },
        stream: false,
        minimal: true,
        maxTokens: 24,
      }),
      onDelta: () => undefined,
    });
    const title = cleanTitle(result.content);
    const fresh = useVellum.getState().chats.find((item) => item.id === chatId);
    if (!title || !fresh) return;
    if (fresh.title !== local && fresh.title !== "Новый чат" && fresh.title !== first.content.trim().slice(0, 42)) return;
    useVellum.getState().setChatTitleAuto(chatId, title);
  } catch {
    /* title is optional */
  }
}

export async function sendMessage(raw: string) {
  const text = raw.trim();
  const state = useVellum.getState();
  const attachments = state.pending;
  if (!text && attachments.length === 0) return;
  let chat = state.chats.find((item) => item.id === state.activeChatId) ?? null;
  if (!chat) {
    const id = state.createChat();
    chat = useVellum.getState().chats.find((item) => item.id === id) ?? null;
  }
  if (!chat) return;
  const ready = ensureReady(chat.id);
  if (!ready) return;
  if (aborters.has(chat.id)) {
    state.toastMsg("Дождитесь ответа или остановите его");
    return;
  }
  state.appendUser(chat.id, text, attachments);
  state.setDraft("");
  state.setPending([]);
  const assistantId = uid();
  useVellum.getState().appendAssistant(chat.id, assistantId, ready.model);
  const status = await run(chat.id, assistantId, ready.provider, 0);
  if (status === "ok") await maybeTitle(chat.id, ready.provider);
}

export async function regenerate(chatId: string, messageId: string) {
  if (aborters.has(chatId)) return;
  const state = useVellum.getState();
  const chat = state.chats.find((item) => item.id === chatId);
  if (!chat) return;
  const ready = ensureReady(chatId);
  if (!ready) return;
  state.truncateAfter(chatId, messageId);
  const index = useVellum.getState().pushVariant(chatId, messageId);
  const status = await run(chatId, messageId, ready.provider, index);
  if (status === "ok") await maybeTitle(chatId, ready.provider);
}

export async function editUser(chatId: string, messageId: string, text: string) {
  if (aborters.has(chatId)) return;
  const ready = ensureReady(chatId);
  if (!ready) return;
  const state = useVellum.getState();
  state.updateUser(chatId, messageId, text.trim());
  state.truncateAfter(chatId, messageId);
  const assistantId = uid();
  useVellum.getState().appendAssistant(chatId, assistantId, ready.model);
  const status = await run(chatId, assistantId, ready.provider, 0);
  if (status === "ok") await maybeTitle(chatId, ready.provider);
}

export async function loadModels(provider: Provider) {
  const models = await fetchModels(provider.baseUrl, provider.apiKey, provider.direct);
  useVellum.getState().setModelList(provider.id, models);
  return models;
}
