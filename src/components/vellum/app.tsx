import { Command } from "cmdk";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";
import {
  Archive,
  BookOpen,
  Download,
  Menu,
  Moon,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  Settings,
  SlidersHorizontal,
  Smartphone,
  Sun,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { Composer, Transcript } from "@/components/vellum/chat";
import { Panels } from "@/components/vellum/panels";
import { copyText, downloadText } from "@/lib/vellum/api";
import { backupFromState, flushStore, useVellum } from "@/lib/vellum/store";
import { chatMarkdown, type Chat } from "@/lib/vellum/types";

export function Mark() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path d="M7.2 8h4.1L16 20.6 20.7 8h4.1L17.6 25h-3.2L7.2 8z" fill="currentColor" />
    </svg>
  );
}

function Boot() {
  return (
    <div className="boot">
      <span className="mark">
        <Mark />
      </span>
      <h1 className="wordmark">Vellum</h1>
      <p className="lede">Открываем студию для совместимых моделей.</p>
    </div>
  );
}

function groupOf(ts: number) {
  const day = (value: number) => {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  };
  const diff = day(Date.now()) - day(ts);
  if (diff <= 0) return "Сегодня";
  if (diff === 86_400_000) return "Вчера";
  if (diff < 7 * 86_400_000) return "7 дней";
  return "Ранее";
}

function matches(chat: Chat, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  if (chat.title.toLowerCase().includes(needle)) return true;
  return chat.messages.some(
    (message) =>
      message.content.toLowerCase().includes(needle) ||
      message.variants.some((variant) => variant.content.toLowerCase().includes(needle)),
  );
}

export function VellumApp() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void useVellum.persist.rehydrate().then(() => {
      if (!alive) return;
      useVellum.getState().settleInterrupted();
      setReady(true);
    });
    const flush = () => flushStore();
    window.addEventListener("pagehide", flush);
    return () => {
      alive = false;
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  return (
    <>
      <div className="app-bg" />
      <div className="grain" />
      {ready ? <Shell /> : <Boot />}
    </>
  );
}

function Shell() {
  const theme = useVellum((state) => state.theme);
  const sidebar = useVellum((state) => state.sidebar);
  const panel = useVellum((state) => state.panel);
  const palette = useVellum((state) => state.palette);
  const toast = useVellum((state) => state.toast);
  const setPalette = useVellum((state) => state.setPalette);
  const setPanel = useVellum((state) => state.setPanel);
  const setSidebar = useVellum((state) => state.setSidebar);
  const setTheme = useVellum((state) => state.setTheme);
  const createChat = useVellum((state) => state.createChat);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "frost" ? "#e4e2dc" : "#09090b");
  }, [theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (meta && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPalette(!useVellum.getState().palette);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPalette]);

  useEffect(() => {
    if (!panel && !palette) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setPanel(null);
        setPalette(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, palette, setPalette, setPanel]);

  return (
    <div className="app-shell">
      <Sidebar />
      {sidebar ? (
        <button type="button" className="scrim" aria-label="Закрыть список чатов" onClick={() => setSidebar(false)} />
      ) : null}
      <div className="main">
        <TopBar />
        <div className="stage">
          <Transcript />
          <Composer />
        </div>
      </div>
      <Panels />
      {palette ? (
        <Command.Dialog open onOpenChange={setPalette} label="Команды" shouldFilter>
          <Command.Input placeholder="Команда или чат" />
          <Command.List>
            <Command.Empty>Ничего не нашлось</Command.Empty>
            <Command.Group>
              <Command.Item
                value="новый чат"
                onSelect={() => {
                  createChat();
                  setPalette(false);
                }}
              >
                Новый чат
              </Command.Item>
              <Command.Item value="настройки провайдер ключ" onSelect={() => setPanel("settings")}>
                Настройки и ключ
              </Command.Item>
              <Command.Item value="модель" onSelect={() => setPanel("model")}>
                Модель
              </Command.Item>
              <Command.Item value="параметры температура" onSelect={() => setPanel("params")}>
                Параметры генерации
              </Command.Item>
              <Command.Item value="библиотека промпты" onSelect={() => setPanel("library")}>
                Библиотека промптов
              </Command.Item>
              <Command.Item value="сборка apk android" onSelect={() => setPanel("build")}>
                Сборка APK
              </Command.Item>
              <Command.Item
                value="тема чернила иней"
                onSelect={() => {
                  setTheme(theme === "ink" ? "frost" : "ink");
                  setPalette(false);
                }}
              >
                Тема: {theme === "ink" ? "иней" : "чернила"}
              </Command.Item>
              <Command.Item
                value="поиск чатов"
                onSelect={() => {
                  setPalette(false);
                  setSidebar(true);
                  document.getElementById("chat-search")?.focus();
                }}
              >
                Фокус на поиск
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command.Dialog>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}

function Sidebar() {
  const chats = useVellum((state) => state.chats);
  const activeChatId = useVellum((state) => state.activeChatId);
  const query = useVellum((state) => state.query);
  const showArchive = useVellum((state) => state.showArchive);
  const sidebar = useVellum((state) => state.sidebar);
  const theme = useVellum((state) => state.theme);
  const setQuery = useVellum((state) => state.setQuery);
  const setShowArchive = useVellum((state) => state.setShowArchive);
  const setTheme = useVellum((state) => state.setTheme);
  const setPanel = useVellum((state) => state.setPanel);
  const selectChat = useVellum((state) => state.selectChat);
  const createChat = useVellum((state) => state.createChat);

  const visible = useMemo(() => {
    return chats
      .filter((chat) => (showArchive ? chat.archived : !chat.archived))
      .filter((chat) => matches(chat, query))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);
  }, [chats, query, showArchive]);

  const groups = useMemo(() => {
    const pinned = visible.filter((chat) => chat.pinned);
    const rest = visible.filter((chat) => !chat.pinned);
    const order = ["Сегодня", "Вчера", "7 дней", "Ранее"];
    const buckets = new Map<string, Chat[]>();
    for (const chat of rest) {
      const key = groupOf(chat.updatedAt);
      buckets.set(key, [...(buckets.get(key) ?? []), chat]);
    }
    return { pinned, order: order.filter((key) => buckets.has(key)), buckets };
  }, [visible]);

  return (
    <aside className="sidebar glass-quiet" data-open={sidebar ? "true" : "false"}>
      <div className="side-head">
        <div className="brand">
          <span className="mark">
            <Mark />
          </span>
          <div>
            <strong>Vellum</strong>
            <div className="faint">совместимый API</div>
          </div>
        </div>
        <button
          type="button"
          className="icon-btn"
          aria-label={theme === "ink" ? "Светлая тема" : "Тёмная тема"}
          onClick={() => setTheme(theme === "ink" ? "frost" : "ink")}
        >
          {theme === "ink" ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <button type="button" className="btn-primary wide" onClick={() => createChat()}>
        <Plus size={18} /> Новый чат
      </button>
      <label className="search glass-quiet">
        <Search size={16} />
        <input
          id="chat-search"
          value={query}
          placeholder="Поиск по чатам"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <div className="chat-scroll">
        {visible.length === 0 ? <p className="faint" style={{ padding: "8px 10px" }}>Пока пусто</p> : null}
        {groups.pinned.length ? (
          <>
            <div className="group-label">Закреплённые</div>
            {groups.pinned.map((chat) => (
              <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} onSelect={selectChat} />
            ))}
          </>
        ) : null}
        {groups.order.map((label) => (
          <div key={label}>
            <div className="group-label">{label}</div>
            {groups.buckets.get(label)!.map((chat) => (
              <ChatRow key={chat.id} chat={chat} active={chat.id === activeChatId} onSelect={selectChat} />
            ))}
          </div>
        ))}
      </div>
      <div className="side-foot">
        <button type="button" className="side-link" onClick={() => setShowArchive(!showArchive)}>
          <Archive size={16} /> {showArchive ? "К чатам" : "Архив"}
        </button>
        <button type="button" className="side-link" onClick={() => setPanel("library")}>
          <BookOpen size={16} /> Библиотека
        </button>
        <button type="button" className="side-link" onClick={() => setPanel("settings")}>
          <Settings size={16} /> Настройки
        </button>
        <button type="button" className="side-link" onClick={() => setPanel("build")}>
          <Smartphone size={16} /> Сборка APK
        </button>
        <p className="faint" style={{ padding: "6px 10px 0" }}>
          Ключ остаётся в этом браузере.
        </p>
      </div>
    </aside>
  );
}

function ChatRow({ chat, active, onSelect }: { chat: Chat; active: boolean; onSelect: (id: string) => void }) {
  const pending = chat.messages.some((message) => message.pending);
  return (
    <button type="button" className="chat-row" data-active={active ? "true" : "false"} onClick={() => onSelect(chat.id)}>
      <span className="chat-copy">
        <span className="ttl">{chat.title}</span>
        <span className="faint" style={{ display: "block" }}>
          {formatDistanceToNow(chat.updatedAt, { addSuffix: true, locale: ru })}
          {chat.incognito ? " · не сохраняется" : ""}
        </span>
      </span>
      {chat.pinned ? <Pin size={14} /> : null}
      {pending ? <i className="pulse" aria-label="Ответ пишется" /> : null}
    </button>
  );
}

function TopBar() {
  const chat = useVellum((state) => state.chats.find((item) => item.id === state.activeChatId) ?? null);
  const providers = useVellum((state) => state.providers);
  const setSidebar = useVellum((state) => state.setSidebar);
  const setPanel = useVellum((state) => state.setPanel);
  const renameChat = useVellum((state) => state.renameChat);
  const togglePin = useVellum((state) => state.togglePin);
  const setArchived = useVellum((state) => state.setArchived);
  const setIncognito = useVellum((state) => state.setIncognito);
  const deleteChat = useVellum((state) => state.deleteChat);
  const toastMsg = useVellum((state) => state.toastMsg);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState("");

  useEffect(() => {
    if (!menu) return;
    const close = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest(".menu") || target.closest("[aria-label='Ещё']")) return;
      setMenu(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  const provider = providers.find((item) => item.id === chat?.providerId);
  const modelLabel = chat?.model || "модель";

  return (
    <header className="topbar">
      <div className="row-between" style={{ minWidth: 0, flex: 1 }}>
        <button type="button" className="icon-btn only-mobile" aria-label="Чаты" onClick={() => setSidebar(true)}>
          <Menu size={18} />
        </button>
        {chat && renaming ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              renameChat(chat.id, title);
              setRenaming(false);
            }}
            style={{ flex: 1, minWidth: 0 }}
          >
            <input
              className="field"
              value={title}
              autoFocus
              aria-label="Название чата"
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => {
                renameChat(chat.id, title);
                setRenaming(false);
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            className="brand"
            style={{ flex: 1 }}
            onClick={() => {
              if (!chat) return;
              setTitle(chat.title);
              setRenaming(true);
            }}
          >
            <span style={{ minWidth: 0 }}>
              <strong style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {chat?.title ?? "Vellum"}
              </strong>
              <span className="faint">
                {provider ? provider.name : "провайдер не выбран"}
                {chat ? ` · ${modelLabel}` : ""}
              </span>
            </span>
          </button>
        )}
      </div>
      <button type="button" className="chip-btn" onClick={() => setPanel("model")}>
        {modelLabel}
      </button>
      <button type="button" className="icon-btn" aria-label="Параметры" onClick={() => setPanel("params")}>
        <SlidersHorizontal size={18} />
      </button>
      <button type="button" className="icon-btn" aria-label="Ещё" onClick={() => setMenu((value) => !value)}>
        <MoreHorizontal size={18} />
      </button>
      {menu && chat ? (
        <div className="menu glass" role="menu">
          <button
            type="button"
            onClick={() => {
              setIncognito(chat.id, !chat.incognito);
              setMenu(false);
            }}
          >
            {chat.incognito ? "Сохранять чат" : "Не сохранять"}
          </button>
          <button
            type="button"
            onClick={() => {
              togglePin(chat.id);
              setMenu(false);
            }}
          >
            {chat.pinned ? "Открепить" : "Закрепить"}
          </button>
          <button
            type="button"
            onClick={() => {
              setArchived(chat.id, !chat.archived);
              setMenu(false);
            }}
          >
            {chat.archived ? "Вернуть из архива" : "В архив"}
          </button>
          <button
            type="button"
            onClick={() => {
              downloadText(`${chat.title}.md`, chatMarkdown(chat), "text/markdown");
              setMenu(false);
            }}
          >
            <Download size={16} /> Markdown
          </button>
          <button
            type="button"
            onClick={() => {
              void copyText(chatMarkdown(chat)).then(
                () => toastMsg("Чат скопирован"),
                () => toastMsg("Не удалось скопировать"),
              );
              setMenu(false);
            }}
          >
            Копировать чат
          </button>
          <button
            type="button"
            onClick={() => {
              deleteChat(chat.id);
              setMenu(false);
            }}
          >
            Удалить чат
          </button>
        </div>
      ) : null}
      {menu && !chat ? (
        <div className="menu glass">
          <button
            type="button"
            onClick={() => {
              downloadText("vellum-backup.json", JSON.stringify(backupFromState(useVellum.getState()), null, 2), "application/json");
              setMenu(false);
            }}
          >
            Скачать резервную копию
          </button>
          <button type="button" onClick={() => { setPanel("settings"); setMenu(false); }}>
            Настройки
          </button>
        </div>
      ) : null}
    </header>
  );
}
