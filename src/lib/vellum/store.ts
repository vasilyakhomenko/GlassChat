import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_PROMPTS,
  DEFAULT_SAMPLING,
  type Attachment,
  type Backup,
  type Chat,
  type Panel,
  type Prompt,
  type Provider,
  type Sampling,
  type Variant,
  cloneSampling,
  titleFrom,
  uid,
} from "@/lib/vellum/types";

export type { Panel };

type Seed = { name: string; baseUrl: string; keyOptional: boolean; model: string } | null;

type Data = {
  theme: "ink" | "frost";
  instructions: string;
  memory: string;
  sampling: Sampling;
  providers: Provider[];
  activeProviderId: string;
  defaultModel: string;
  prompts: Prompt[];
  chats: Chat[];
  activeChatId: string | null;
  stream: boolean;
  enterToSend: boolean;
  autoTitle: boolean;
  models: Record<string, string[]>;
};

type Ephemeral = {
  panel: Panel;
  palette: boolean;
  sidebar: boolean;
  toast: string | null;
  draft: string;
  pending: Attachment[];
  query: string;
  showArchive: boolean;
  seed: Seed;
};

type Actions = {
  toastMsg: (text: string) => void;
  setPanel: (panel: Panel) => void;
  setPalette: (open: boolean) => void;
  setSidebar: (open: boolean) => void;
  setDraft: (draft: string) => void;
  setPending: (pending: Attachment[]) => void;
  setQuery: (query: string) => void;
  setShowArchive: (show: boolean) => void;
  setSeed: (seed: Seed) => void;
  setTheme: (theme: "ink" | "frost") => void;
  setStream: (stream: boolean) => void;
  setEnterToSend: (enterToSend: boolean) => void;
  setAutoTitle: (autoTitle: boolean) => void;
  setInstructions: (instructions: string) => void;
  setMemory: (memory: string) => void;
  setSampling: (sampling: Sampling) => void;
  setDefaultModel: (model: string) => void;
  setActiveProvider: (id: string) => void;
  upsertProvider: (provider: Provider) => void;
  removeProvider: (id: string) => void;
  setModelList: (providerId: string, models: string[]) => void;
  addPrompt: (prompt: Prompt) => void;
  updatePrompt: (prompt: Prompt) => void;
  removePrompt: (id: string) => void;
  createChat: (opts?: { incognito?: boolean }) => string;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  togglePin: (id: string) => void;
  setArchived: (id: string, archived: boolean) => void;
  setIncognito: (id: string, incognito: boolean) => void;
  setChatProvider: (id: string, providerId: string) => void;
  setChatModel: (id: string, model: string) => void;
  setChatSampling: (id: string, sampling: Sampling) => void;
  setChatInstruction: (id: string, instruction: string) => void;
  setChatTitleAuto: (id: string, title: string) => void;
  appendUser: (chatId: string, text: string, attachments: Attachment[]) => void;
  appendAssistant: (chatId: string, messageId: string, model: string) => void;
  writeVariant: (chatId: string, messageId: string, index: number, patch: Partial<Variant>) => void;
  setPendingFlag: (chatId: string, messageId: string, pending: boolean) => void;
  setVariant: (chatId: string, messageId: string, index: number) => void;
  pushVariant: (chatId: string, messageId: string) => number;
  truncateAfter: (chatId: string, messageId: string) => void;
  updateUser: (chatId: string, messageId: string, content: string) => void;
  markTitled: (chatId: string) => void;
  settleInterrupted: () => void;
  importBackup: (backup: Backup) => void;
  clearAll: () => void;
};

export type VellumState = Data & Ephemeral & Actions;

const memoryStorage = {
  getItem: (name: string) => {
    void name;
    return null;
  },
  setItem: (name: string, value: string) => {
    void name;
    void value;
  },
  removeItem: (name: string) => {
    void name;
  },
};

let pendingName = "";
let pendingValue: string | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

export function flushStore() {
  if (typeof window === "undefined" || pendingValue === null) return;
  if (timer) clearTimeout(timer);
  timer = undefined;
  try {
    localStorage.setItem(pendingName, pendingValue);
  } catch {
    /* quota — the session still holds the chats */
  }
  pendingValue = null;
}

const browserStorage = {
  getItem: (name: string) => {
    flushStore();
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    pendingName = name;
    pendingValue = value;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flushStore, 180);
  },
  removeItem: (name: string) => {
    pendingValue = null;
    localStorage.removeItem(name);
  },
};

function freshData(): Data {
  return {
    theme: "ink",
    instructions: "",
    memory: "",
    sampling: cloneSampling(DEFAULT_SAMPLING),
    providers: [],
    activeProviderId: "",
    defaultModel: "",
    prompts: DEFAULT_PROMPTS.map((item) => ({ ...item })),
    chats: [],
    activeChatId: null,
    stream: true,
    enterToSend: true,
    autoTitle: true,
    models: {},
  };
}

const ephemeral = (): Ephemeral => ({
  panel: null,
  palette: false,
  sidebar: false,
  toast: null,
  draft: "",
  pending: [],
  query: "",
  showArchive: false,
  seed: null,
});

export const useVellum = create<VellumState>()(
  persist(
    (set, get) => {
      const patchChat = (chatId: string, fn: (chat: Chat) => Chat) =>
        set((state) => ({
          chats: state.chats.map((chat) =>
            chat.id === chatId ? fn({ ...chat, updatedAt: Date.now() }) : chat,
          ),
        }));

      return {
        ...freshData(),
        ...ephemeral(),
        toastMsg: (text) => {
          set({ toast: text });
          window.setTimeout(() => {
            if (get().toast === text) set({ toast: null });
          }, 3400);
        },
        setPanel: (panel) => set({ panel, palette: false }),
        setPalette: (palette) => set({ palette }),
        setSidebar: (sidebar) => set({ sidebar }),
        setDraft: (draft) => set({ draft }),
        setPending: (pending) => set({ pending }),
        setQuery: (query) => set({ query }),
        setShowArchive: (showArchive) => set({ showArchive }),
        setSeed: (seed) => set({ seed }),
        setTheme: (theme) => set({ theme }),
        setStream: (stream) => set({ stream }),
        setEnterToSend: (enterToSend) => set({ enterToSend }),
        setAutoTitle: (autoTitle) => set({ autoTitle }),
        setInstructions: (instructions) => set({ instructions }),
        setMemory: (memory) => set({ memory }),
        setSampling: (sampling) => set({ sampling }),
        setDefaultModel: (defaultModel) => set({ defaultModel }),
        setActiveProvider: (activeProviderId) => set({ activeProviderId }),
        upsertProvider: (provider) =>
          set((state) => {
            const exists = state.providers.some((item) => item.id === provider.id);
            const providers = exists
              ? state.providers.map((item) => (item.id === provider.id ? provider : item))
              : [...state.providers, provider];
            return {
              providers,
              activeProviderId: state.activeProviderId || provider.id,
            };
          }),
        removeProvider: (id) =>
          set((state) => {
            const providers = state.providers.filter((item) => item.id !== id);
            return {
              providers,
              activeProviderId: state.activeProviderId === id ? (providers[0]?.id ?? "") : state.activeProviderId,
            };
          }),
        setModelList: (providerId, models) =>
          set((state) => ({ models: { ...state.models, [providerId]: models } })),
        addPrompt: (prompt) => set((state) => ({ prompts: [prompt, ...state.prompts] })),
        updatePrompt: (prompt) =>
          set((state) => ({
            prompts: state.prompts.map((item) => (item.id === prompt.id ? prompt : item)),
          })),
        removePrompt: (id) => set((state) => ({ prompts: state.prompts.filter((item) => item.id !== id) })),
        createChat: (opts) => {
          const cur = get();
          const active = cur.chats.find((chat) => chat.id === cur.activeChatId);
          if (
            active &&
            !opts?.incognito &&
            !active.incognito &&
            active.messages.length === 0 &&
            active.title === "Новый чат" &&
            !active.archived
          ) {
            set({ sidebar: false, panel: null });
            return active.id;
          }
          const id = uid();
          const chat: Chat = {
            id,
            title: "Новый чат",
            pinned: false,
            archived: false,
            incognito: !!opts?.incognito,
            providerId: cur.activeProviderId,
            model: cur.defaultModel,
            instruction: "",
            sampling: cloneSampling(cur.sampling),
            messages: [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
            titled: false,
          };
          set({ chats: [chat, ...cur.chats], activeChatId: id, sidebar: false, panel: null });
          return id;
        },
        selectChat: (id) => set({ activeChatId: id, sidebar: false, panel: null }),
        deleteChat: (id) =>
          set((state) => {
            const chats = state.chats.filter((chat) => chat.id !== id);
            const activeChatId =
              state.activeChatId === id ? (chats.find((chat) => !chat.archived)?.id ?? null) : state.activeChatId;
            return { chats, activeChatId };
          }),
        renameChat: (id, title) =>
          patchChat(id, (chat) => ({ ...chat, title: title.trim() || chat.title, titled: true })),
        togglePin: (id) => patchChat(id, (chat) => ({ ...chat, pinned: !chat.pinned })),
        setArchived: (id, archived) => patchChat(id, (chat) => ({ ...chat, archived })),
        setIncognito: (id, incognito) => patchChat(id, (chat) => ({ ...chat, incognito })),
        setChatProvider: (id, providerId) => patchChat(id, (chat) => ({ ...chat, providerId })),
        setChatModel: (id, model) => patchChat(id, (chat) => ({ ...chat, model })),
        setChatSampling: (id, sampling) => patchChat(id, (chat) => ({ ...chat, sampling })),
        setChatInstruction: (id, instruction) => patchChat(id, (chat) => ({ ...chat, instruction })),
        setChatTitleAuto: (id, title) => patchChat(id, (chat) => ({ ...chat, title, titled: true })),
        appendUser: (chatId, text, attachments) =>
          patchChat(chatId, (chat) => {
            const first = chat.messages.length === 0 && chat.title === "Новый чат";
            return {
              ...chat,
              title: first ? (text.trim() ? titleFrom(text) : "Вложение") : chat.title,
              messages: [
                ...chat.messages,
                {
                  id: uid(),
                  role: "user" as const,
                  content: text,
                  attachments,
                  createdAt: Date.now(),
                  variants: [],
                  variant: 0,
                },
              ],
            };
          }),
        appendAssistant: (chatId, messageId, model) =>
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: [
              ...chat.messages,
              {
                id: messageId,
                role: "assistant" as const,
                content: "",
                attachments: [],
                createdAt: Date.now(),
                variants: [{ content: "", reasoning: "", model }],
                variant: 0,
                pending: true,
              },
            ],
          })),
        writeVariant: (chatId, messageId, index, patch) =>
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((message) => {
              if (message.id !== messageId) return message;
              return {
                ...message,
                variants: message.variants.map((variant, i) => (i === index ? { ...variant, ...patch } : variant)),
              };
            }),
          })),
        setPendingFlag: (chatId, messageId, pending) =>
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((message) =>
              message.id === messageId ? { ...message, pending } : message,
            ),
          })),
        setVariant: (chatId, messageId, index) =>
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((message) =>
              message.id === messageId ? { ...message, variant: index } : message,
            ),
          })),
        pushVariant: (chatId, messageId) => {
          let index = 0;
          set((state) => ({
            chats: state.chats.map((chat) => {
              if (chat.id !== chatId) return chat;
              return {
                ...chat,
                updatedAt: Date.now(),
                messages: chat.messages.map((message) => {
                  if (message.id !== messageId) return message;
                  const variants = [
                    ...message.variants,
                    { content: "", reasoning: "", model: chat.model },
                  ];
                  index = variants.length - 1;
                  return { ...message, variants, variant: index, pending: true };
                }),
              };
            }),
          }));
          return index;
        },
        truncateAfter: (chatId, messageId) =>
          patchChat(chatId, (chat) => {
            const at = chat.messages.findIndex((message) => message.id === messageId);
            if (at < 0) return chat;
            return { ...chat, messages: chat.messages.slice(0, at + 1) };
          }),
        updateUser: (chatId, messageId, content) =>
          patchChat(chatId, (chat) => ({
            ...chat,
            messages: chat.messages.map((message) =>
              message.id === messageId ? { ...message, content } : message,
            ),
          })),
        markTitled: (chatId) => patchChat(chatId, (chat) => ({ ...chat, titled: true })),
        settleInterrupted: () =>
          set((state) => ({
            chats: state.chats.map((chat) => ({
              ...chat,
              messages: chat.messages.map((message) =>
                message.pending
                  ? {
                      ...message,
                      pending: false,
                      variants: message.variants.map((variant, index) =>
                        index === message.variant ? { ...variant, stopped: true } : variant,
                      ),
                    }
                  : message,
              ),
            })),
          })),
        importBackup: (backup) =>
          set({
            theme: backup.theme,
            instructions: backup.instructions,
            memory: backup.memory,
            sampling: backup.sampling,
            providers: backup.providers,
            activeProviderId: backup.activeProviderId,
            defaultModel: backup.defaultModel,
            prompts: backup.prompts,
            chats: backup.chats,
            activeChatId: backup.chats.find((chat) => !chat.archived)?.id ?? null,
            stream: backup.stream,
            enterToSend: backup.enterToSend,
            autoTitle: backup.autoTitle,
            models: {},
            panel: null,
          }),
        clearAll: () => set({ ...freshData(), ...ephemeral(), toast: "Данные на этом устройстве стёрты" }),
      };
    },
    {
      name: "vellum",
      version: 1,
      skipHydration: true,
      storage: createJSONStorage(() => (typeof window === "undefined" ? memoryStorage : browserStorage)),
      partialize: (state) => ({
        theme: state.theme,
        instructions: state.instructions,
        memory: state.memory,
        sampling: state.sampling,
        providers: state.providers,
        activeProviderId: state.activeProviderId,
        defaultModel: state.defaultModel,
        prompts: state.prompts,
        chats: state.chats.filter((chat) => !chat.incognito),
        activeChatId: state.chats.some((chat) => chat.id === state.activeChatId && !chat.incognito)
          ? state.activeChatId
          : null,
        stream: state.stream,
        enterToSend: state.enterToSend,
        autoTitle: state.autoTitle,
        models: state.models,
      }),
    },
  ),
);

export function backupFromState(state: VellumState): Backup {
  return {
    v: 1,
    app: "vellum",
    exportedAt: new Date().toISOString(),
    theme: state.theme,
    instructions: state.instructions,
    memory: state.memory,
    sampling: state.sampling,
    providers: state.providers,
    activeProviderId: state.activeProviderId,
    defaultModel: state.defaultModel,
    prompts: state.prompts,
    chats: state.chats.filter((chat) => !chat.incognito),
    stream: state.stream,
    enterToSend: state.enterToSend,
    autoTitle: state.autoTitle,
  };
}
