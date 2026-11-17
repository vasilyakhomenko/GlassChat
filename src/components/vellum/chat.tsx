import { ArrowUp, Check, Copy, Mic, Paperclip, Pencil, RefreshCw, Square, Volume2, X } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";

import { Mark } from "@/components/vellum/app";
import { copyText, fileToAttachment, speak } from "@/lib/vellum/api";
import { Markdown } from "@/lib/vellum/markdown";
import { editUser, regenerate, sendMessage, stopGeneration } from "@/lib/vellum/send";
import { useVellum } from "@/lib/vellum/store";
import {
  DEFAULT_PROMPTS,
  PRESETS,
  assistantText,
  chatTokens,
  currentVariant,
  type Msg,
} from "@/lib/vellum/types";

type Rec = {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  start: () => void;
};

function recognition(): Rec | null {
  const host = window as Window & {
    SpeechRecognition?: new () => Rec;
    webkitSpeechRecognition?: new () => Rec;
  };
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

export function Transcript() {
  const chat = useVellum((state) => state.chats.find((item) => item.id === state.activeChatId) ?? null);
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const tail = chat?.messages[chat.messages.length - 1];
  const tailText = tail ? assistantText(tail) + (tail.pending ? "1" : "") : "";

  useEffect(() => {
    const node = ref.current;
    if (!node || !stick.current) return;
    node.scrollTop = node.scrollHeight;
  }, [tailText, chat?.id, chat?.messages.length]);

  return (
    <div
      className="transcript"
      ref={ref}
      onScroll={(event) => {
        const node = event.currentTarget;
        stick.current = node.scrollHeight - node.scrollTop - node.clientHeight < 80;
      }}
    >
      {!chat || chat.messages.length === 0 ? <Empty /> : (
        <div className="messages">
          {chat.messages.map((message) => (
            <MessageRow key={message.id} chatId={chat.id} message={message} />
          ))}
        </div>
      )}
    </div>
  );
}

function Empty() {
  const setPanel = useVellum((state) => state.setPanel);
  const setSeed = useVellum((state) => state.setSeed);
  const setDraft = useVellum((state) => state.setDraft);
  const providers = useVellum((state) => state.providers);
  const activeProviderId = useVellum((state) => state.activeProviderId);
  const provider = providers.find((item) => item.id === activeProviderId) ?? providers[0];
  const ready = !!provider && (provider.keyOptional || !!provider.apiKey.trim());

  return (
    <div className="hero">
      <span className="mark">
        <Mark />
      </span>
      <h1 className="wordmark">Vellum</h1>
      <p className="lede">
        Монохромный клиент для OpenAI, Groq, OpenRouter, DeepSeek, xAI и любого сервера с тем же API.
        Чаты, вложения, голос и параметры остаются на этом устройстве.
      </p>
      <div className="starter-grid">
        {DEFAULT_PROMPTS.slice(0, 4).map((prompt) => (
          <button
            key={prompt.id}
            type="button"
            className="starter glass-quiet"
            onClick={() => {
              if (!ready) {
                setDraft(prompt.body);
                setPanel("settings");
                useVellum.getState().toastMsg("Сначала подключите провайдера");
                return;
              }
              void sendMessage(prompt.body);
            }}
          >
            <b>{prompt.title}</b>
            <span>{prompt.body}</span>
          </button>
        ))}
      </div>
      <div className="preset-row">
        {PRESETS.slice(0, 6).map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="chip-btn"
            onClick={() => {
              setSeed({
                name: preset.name,
                baseUrl: preset.baseUrl,
                keyOptional: !!preset.keyOptional,
                model: preset.model,
              });
              setPanel("settings");
            }}
          >
            {preset.name}
          </button>
        ))}
      </div>
    </div>
  );
}

const MessageRow = memo(function MessageRow({ chatId, message }: { chatId: string; message: Msg }) {
  const toastMsg = useVellum((state) => state.toastMsg);
  const setVariant = useVellum((state) => state.setVariant);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  if (message.role === "user") {
    return (
      <article className="msg-user">
        {message.attachments.filter((item) => item.kind === "image" && item.dataUrl).map((item) => (
          <img key={item.id} className="shot" src={item.dataUrl} alt={item.name} />
        ))}
        {message.attachments.filter((item) => item.kind === "file").length ? (
          <div className="attach-row">
            {message.attachments
              .filter((item) => item.kind === "file")
              .map((item) => (
                <span key={item.id} className="file-pill">
                  {item.name}
                </span>
              ))}
          </div>
        ) : null}
        {editing ? (
          <form
            className="edit-box"
            onSubmit={(event) => {
              event.preventDefault();
              setEditing(false);
              void editUser(chatId, message.id, draft);
            }}
          >
            <textarea className="area" value={draft} onChange={(event) => setDraft(event.target.value)} />
            <div className="row-between">
              <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                Отмена
              </button>
              <button type="submit" className="btn-primary">
                Отправить заново
              </button>
            </div>
          </form>
        ) : (
          <div className="bubble">{message.content}</div>
        )}
        {!editing ? (
          <div className="actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Править"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <Pencil size={16} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Копировать"
              onClick={() => {
                void copyText(message.content).then(
                  () => toastMsg("Скопировано"),
                  () => toastMsg("Не удалось скопировать"),
                );
              }}
            >
              <Copy size={16} />
            </button>
          </div>
        ) : null}
      </article>
    );
  }

  const variant = currentVariant(message);
  const content = variant?.content ?? "";
  return (
    <article className="msg-assistant">
      <div className="who">
        <span className="mark sm">
          <Mark />
        </span>
        <span>{variant?.model || "ответ"}</span>
        {message.variants.length > 1 ? (
          <span className="pager">
            <button
              type="button"
              className="icon-btn"
              aria-label="Предыдущий вариант"
              disabled={message.variant <= 0}
              onClick={() => setVariant(chatId, message.id, message.variant - 1)}
            >
              ‹
            </button>
            <span>
              {message.variant + 1}/{message.variants.length}
            </span>
            <button
              type="button"
              className="icon-btn"
              aria-label="Следующий вариант"
              disabled={message.variant >= message.variants.length - 1}
              onClick={() => setVariant(chatId, message.id, message.variant + 1)}
            >
              ›
            </button>
          </span>
        ) : null}
      </div>
      {variant?.reasoning ? (
        <details className="think">
          <summary>Ход мысли</summary>
          <p>{variant.reasoning}</p>
        </details>
      ) : null}
      {message.pending && !content ? (
        <div className="dots" aria-label="Ответ пишется">
          <i />
          <i />
          <i />
        </div>
      ) : null}
      {content ? (
        message.pending ? <p className="stream-text">{content}</p> : <Markdown text={content} />
      ) : null}
      {variant?.error ? <p className="err">{variant.error}</p> : null}
      {variant?.stopped ? <p className="faint">Остановлено</p> : null}
      <div className="actions">
        <button
          type="button"
          className="icon-btn"
          aria-label="Копировать ответ"
          disabled={!content}
          onClick={() => {
            void copyText(content).then(
              () => toastMsg("Скопировано"),
              () => toastMsg("Не удалось скопировать"),
            );
          }}
        >
          <Copy size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Ответить заново"
          disabled={!!message.pending}
          onClick={() => void regenerate(chatId, message.id)}
        >
          <RefreshCw size={16} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Озвучить"
          disabled={!content}
          onClick={() => {
            try {
              speak(content);
            } catch (error) {
              toastMsg(error instanceof Error ? error.message : "Озвучка недоступна");
            }
          }}
        >
          <Volume2 size={16} />
        </button>
        {message.pending ? (
          <button type="button" className="icon-btn" aria-label="Остановить" onClick={() => stopGeneration(chatId)}>
            <Square size={16} />
          </button>
        ) : null}
      </div>
    </article>
  );
});

export function Composer() {
  const draft = useVellum((state) => state.draft);
  const pending = useVellum((state) => state.pending);
  const enterToSend = useVellum((state) => state.enterToSend);
  const setDraft = useVellum((state) => state.setDraft);
  const setPending = useVellum((state) => state.setPending);
  const toastMsg = useVellum((state) => state.toastMsg);
  const chat = useVellum((state) => state.chats.find((item) => item.id === state.activeChatId) ?? null);
  const providers = useVellum((state) => state.providers);
  const instructions = useVellum((state) => state.instructions);
  const memory = useVellum((state) => state.memory);
  const activeId = useVellum((state) => state.activeProviderId);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [listening, setListening] = useState(false);

  const provider =
    providers.find((item) => item.id === (chat?.providerId || activeId)) ??
    providers.find((item) => item.id === activeId);
  const needsKey = !provider || (!provider.apiKey.trim() && !provider.keyOptional);
  const streaming = !!chat?.messages.some((message) => message.pending);
  const tokens = chatTokens(chat, instructions, memory);

  useEffect(() => {
    const node = area.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 160)}px`;
  }, [draft]);

  const submit = () => {
    if (streaming) {
      if (chat) stopGeneration(chat.id);
      return;
    }
    void sendMessage(draft);
  };

  return (
    <div className="composer">
      {needsKey ? (
        <button type="button" className="warn" onClick={() => useVellum.getState().setPanel("settings")}>
          Нет API-ключа — открыть подключение
        </button>
      ) : null}
      {pending.length ? (
        <div className="attach-row" style={{ marginBottom: 8 }}>
          {pending.map((item) => (
            <span key={item.id} className="file-pill">
              {item.name}
              <button
                type="button"
                aria-label={`Убрать ${item.name}`}
                onClick={() => setPending(pending.filter((file) => file.id !== item.id))}
              >
                <X size={14} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="meta-row">
        <span>≈ {tokens} ток.</span>
        <span>{chat?.model || useVellum.getState().defaultModel || "модель не выбрана"}</span>
      </div>
      <form
        className="dock glass"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          hidden
          accept="image/*,.txt,.md,.json,.csv,.py,.ts,.tsx,.js,.jsx,.css,.html,.xml,.yaml,.yml,.log"
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void Promise.all(files.map((file) => fileToAttachment(file)))
              .then((items) => setPending([...useVellum.getState().pending, ...items]))
              .catch((error: unknown) => toastMsg(error instanceof Error ? error.message : "Файл не прочитан"));
          }}
        />
        <button type="button" className="icon-btn" aria-label="Прикрепить файл" onClick={() => fileRef.current?.click()}>
          <Paperclip size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          aria-label="Голос"
          aria-pressed={listening}
          onClick={() => {
            const rec = recognition();
            if (!rec) {
              toastMsg("Диктовка недоступна в этом браузере");
              return;
            }
            rec.lang = "ru-RU";
            rec.onresult = (event) => {
              const said = event.results[0]?.[0]?.transcript ?? "";
              if (said) setDraft(`${useVellum.getState().draft} ${said}`.trim());
              setListening(false);
            };
            rec.onerror = () => setListening(false);
            setListening(true);
            rec.start();
          }}
        >
          {listening ? <Check size={18} /> : <Mic size={18} />}
        </button>
        <textarea
          id="composer"
          ref={area}
          rows={1}
          placeholder="Сообщение"
          value={draft}
          aria-label="Сообщение"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && enterToSend && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <button
          type="submit"
          className="send"
          aria-label={streaming ? "Остановить" : "Отправить"}
          disabled={!streaming && !draft.trim() && pending.length === 0}
        >
          {streaming ? <Square size={16} /> : <ArrowUp size={18} />}
        </button>
      </form>
      <p className="hint">Enter — отправить, Shift+Enter — новая строка, ⌘K или Ctrl+K — команды</p>
    </div>
  );
}
